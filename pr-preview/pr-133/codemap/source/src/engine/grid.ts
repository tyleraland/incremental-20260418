// Combat Tactic Engine — spatial model (spec §2).
// Continuous 2D space on a 15×15 grid (COLS=ROWS=15 default; per-battle bounds
// can be larger for open-world, read via engine/arena.ts). Euclidean distance only.

import {
  COLS, ROWS, SEPARATION, IMMOVABLE_CLEARANCE, FRONT_ROWS, MID_ROWS,
  PERIMETER_MARGIN, DEPLOY_FRONT, RANK_SETBACK, FORMATION_ROW_STEP, EPS,
} from './constants'
import { slideMove, steerAround } from './barriers'
import { arenaClamp, arenaCols } from './arena'
import { timeScale } from './timescale'
import { spatialHashFor, SPATIAL_MARGIN } from './spatialhash'
import type { Vec2, Rank, Team, Combatant, Barrier } from './types'

// Direct-move ambient: on non-decision rounds (decisionInterval > 1) the engine
// executes committed movement WITHOUT re-running steerAround's Dijkstra — units
// slide straight at their target/point (slideMove still hugs walls). Set per unit
// turn by takeTurn and cleared after; default false = full routing (byte-identical).
// Like the timeScale/arena ambients, this is safe because one battle steps at a time.
let directMoveActive = false
export function setDirectMove(v: boolean): void { directMoveActive = v }

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Clamp to the active arena bounds (set per-battle; 15×15 by default).
export function clampToGrid(p: Vec2): Vec2 {
  return arenaClamp(p)
}

// §2.3 a unit's rank is derived from its *current* Y relative to its team edge,
// so a retreating front-liner can become "back rank" mid-fight.
export function rowsFromEdge(team: Team, y: number): number {
  return team === 'player' ? y : ROWS - y
}

export function rankOf(c: Combatant): Rank {
  const r = rowsFromEdge(c.team, c.pos.y)
  if (r <= FRONT_ROWS) return 'front'
  if (r <= MID_ROWS) return 'mid'
  return 'back'
}

export function isPerimeter(p: Vec2): boolean {
  return p.x < PERIMETER_MARGIN || p.x > arenaCols() - PERIMETER_MARGIN
}

// The i-th grid column counting outward from the middle: center, +1, −1, +2, …
// (replaces a hardcoded order so any COLS works).
export function centeredColumn(i: number, cols: number): number {
  const center = Math.floor(cols / 2)
  if (i <= 0) return center
  const k = Math.ceil(i / 2)
  const col = center + (i % 2 === 1 ? k : -k)
  return Math.min(cols - 1, Math.max(0, col))
}

// Starting position: teams form up DEPLOY_FRONT rows either side of the arena
// center (players below, enemies above), columns filling center-outward. Deeper
// ranks fall back toward their own edge; once a row fills, extras stack behind —
// so any party size fits, with open ground behind and terrain room in the middle.
export function startingPosition(team: Team, rank: Rank, indexInRank: number): Vec2 {
  const center = ROWS / 2
  const depth = Math.floor(indexInRank / COLS)
  const setback = DEPLOY_FRONT + RANK_SETBACK[rank] + depth * FORMATION_ROW_STEP
  const y = team === 'player' ? center - setback : center + setback
  const col = centeredColumn(indexInRank % COLS, COLS)
  return clampToGrid({ x: col + 0.5, y })
}

// Reach used for the unit's basic attack and as its melee stop distance.
export function attackReach(c: Combatant): number {
  return c.rangedRange > 0 ? c.rangedRange : c.meleeRange
}

// §2.5 per-unit move speed: a standalone rate in grid units/round, independent
// of attack speed. Status effects (slow, haste, etc.) add to the base via
// StatModifiers.moveSpeed. Clamped at 0 so stationary units never back-pedal.
export function moveSpeedOf(c: Combatant): number {
  let speed = c.moveSpeed
  let mult = 1
  for (const s of c.statuses) {
    if (s.statModifiers.moveSpeed) speed += s.statModifiers.moveSpeed
    if (s.statModifiers.moveSpeedMult != null) mult *= s.statModifiers.moveSpeedMult   // e.g. Cloak → 0.75
  }
  // Finer rounds move proportionally less per round, so real-world speed is the
  // same. (timeScale 1 = no change.)
  return Math.max(0, speed * mult) / timeScale()
}

// Move `mover` toward `target`, stopping `reach` units short so melee attackers
// don't stand on top of their target (§2.4). Returns true if the position
// changed. Enforces minimum separation against all other living combatants.
export function moveToward(
  mover: Combatant,
  target: Combatant,
  speed: number,
  all: Combatant[],
  barriers: Barrier[] = [],
  reachOverride?: number,
): boolean {
  if (speed <= EPS) return false   // immobile (moveSpeed 0): hold — never reach slideMove
  const reach = reachOverride ?? attackReach(mover)
  const d = distance(mover.pos, target.pos)
  if (d <= reach + EPS) return false   // already in range; hold position

  // Route around terrain toward a corner that keeps line of sight (§spatial).
  // No route through the known terrain → give up (hold) rather than grind into
  // a wall toward an unreachable target. In direct-move mode (between decision
  // rounds) bypass the Dijkstra and slide straight at the target (slideMove still
  // hugs walls) — a cheap execute step; the next decision round re-routes properly.
  const { point, direct, reachable } = directMoveActive
    ? { point: target.pos, direct: true, reachable: true }
    : steerAround(mover.pos, target.pos, barriers)
  if (!reachable) return false
  const dd = distance(mover.pos, point)
  if (dd <= EPS) return false
  const step = Math.min(speed, direct ? d - reach : dd)
  const before = mover.pos
  mover.pos = slideMove(mover.pos, { x: mover.pos.x + (point.x - mover.pos.x) / dd * step, y: mover.pos.y + (point.y - mover.pos.y) / dd * step }, barriers)
  enforceSeparation(mover, all, barriers)
  return mover.pos.x !== before.x || mover.pos.y !== before.y
}

// Move `mover` toward an explicit point (no attack-reach stop — used by spatial
// tactics that aim at a computed spot: flank, guard, regroup). Returns true if
// the position changed.
export function moveTowardPoint(
  mover: Combatant,
  point: Vec2,
  speed: number,
  all: Combatant[],
  barriers: Barrier[] = [],
): boolean {
  if (speed <= EPS) return false   // immobile (moveSpeed 0): hold — never reach slideMove
  const d = distance(mover.pos, point)
  if (d <= EPS) return false
  const { point: wp, reachable } = directMoveActive
    ? { point, reachable: true }
    : steerAround(mover.pos, point, barriers)   // route around terrain
  if (!reachable) return false   // unreachable through known terrain → hold
  const dd = distance(mover.pos, wp)
  if (dd <= EPS) return false
  const step = Math.min(speed, dd)
  const before = mover.pos
  mover.pos = slideMove(mover.pos, { x: mover.pos.x + (wp.x - mover.pos.x) / dd * step, y: mover.pos.y + (wp.y - mover.pos.y) / dd * step }, barriers)
  enforceSeparation(mover, all, barriers)
  return mover.pos.x !== before.x || mover.pos.y !== before.y
}

// §2.4 when a move would put two units closer than SEPARATION, push both apart
// along the axis between them. Deterministic: `all` is iterated in stable order.
export function enforceSeparation(mover: Combatant, all: Combatant[], barriers: Barrier[] = []): void {
  // Only units within ~SEPARATION can push us — query the spatial hash for those
  // (O(local)) instead of scanning everyone. `near` returns them in array-index
  // order, so the sequence of pushes is identical to iterating `all`; the over-scan
  // margin + the `d >= SEPARATION` skip below make the set identical too. No hash
  // (tests / between-round spawns) → scan `all`, same result.
  const grid = spatialHashFor(all)
  // Query out to the WIDER of the two thresholds so immovable neighbours (clearance
  // > SEPARATION) aren't missed by the spatial pre-filter.
  const queryR = Math.max(SEPARATION, IMMOVABLE_CLEARANCE)
  const others = grid ? grid.near(mover.pos, queryR + SPATIAL_MARGIN) : all
  for (const other of others) {
    if (other === mover || !other.alive) continue
    // A fixture — a neutral town NPC, or any immobile unit (moveSpeed 0, e.g. a
    // rooted caster like a Living Nightshade) — never gives way: the mover is
    // pushed FULLY clear of it in one step (no gradual/timeScale easing) so a fast
    // mover can't tunnel onto it and end up attacking "on top". Its clearance is a
    // touch wider than a token so the attacker stops visibly in front. (An
    // immovable unit never moves on its own, so `mover` is never one of these.)
    const immovable = other.team === 'neutral' || other.moveSpeed <= EPS
    const sep = immovable ? IMMOVABLE_CLEARANCE : SEPARATION
    let dx = mover.pos.x - other.pos.x
    let dy = mover.pos.y - other.pos.y
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d >= sep - EPS) continue
    // How far apart to push — captured BEFORE the degenerate fix-up below, which
    // resets `d` to 1 purely to normalise the fallback direction. Using that reset
    // `d` for the magnitude would zero the push when two units exactly overlap (the
    // "Charger dives on top of an immobile foe and never separates" bug).
    const gap = sep - d
    if (d < EPS) {
      // Exactly overlapping: separate along a deterministic axis (by index).
      dx = mover.index < other.index ? -1 : 1
      dy = 0
      d = 1
    }
    const ux = dx / d
    const uy = dy / d
    if (immovable) {
      // A unit under an explicit move order is marching THROUGH on purpose — don't
      // wall it (a head-on full push would cancel its step and stall it); let it
      // ease past with the gentle gradual nudge instead. Normal AI movers get the
      // full push so they can't tunnel onto a fixture and attack from on top.
      const push = mover.moveOrder ? gap / 2 / timeScale() : gap
      mover.pos = slideMove(mover.pos, { x: mover.pos.x + ux * push, y: mover.pos.y + uy * push }, barriers)
      continue
    }
    // Resolve overlap gradually at a finer time scale (÷ scale), so a separation
    // shove doesn't add a big fixed jump on top of the smaller per-round move.
    // Push apart, but slide the push along any wall so crowded units against
    // terrain spread out instead of freezing into a blob.
    const overlap = gap / 2 / timeScale()
    mover.pos = slideMove(mover.pos, { x: mover.pos.x + ux * overlap, y: mover.pos.y + uy * overlap }, barriers)
    other.pos = slideMove(other.pos, { x: other.pos.x - ux * overlap, y: other.pos.y - uy * overlap }, barriers)
  }
}
