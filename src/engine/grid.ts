// Combat Tactic Engine — spatial model (spec §2).
// Continuous 2D space on a 5×10 logical grid. Euclidean distance only.

import {
  COLS, ROWS, BASE_MOVE_SPEED, SEPARATION, FRONT_ROWS, MID_ROWS,
  PERIMETER_LEFT, PERIMETER_RIGHT, DEPLOY_FRONT, RANK_SETBACK, FORMATION_ROW_STEP, EPS,
} from './constants'
import { slideMove, steerAround } from './barriers'
import type { Vec2, Rank, Team, Combatant, Barrier } from './types'

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function clampToGrid(p: Vec2): Vec2 {
  return {
    x: Math.min(COLS, Math.max(0, p.x)),
    y: Math.min(ROWS, Math.max(0, p.y)),
  }
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
  return p.x < PERIMETER_LEFT || p.x > PERIMETER_RIGHT
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
  for (const s of c.statuses) {
    if (s.statModifiers.moveSpeed) speed += s.statModifiers.moveSpeed
  }
  return Math.max(0, speed)
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
): boolean {
  const reach = attackReach(mover)
  const d = distance(mover.pos, target.pos)
  if (d <= reach + EPS) return false   // already in range; hold position

  // Route around terrain toward a corner that keeps line of sight (§spatial).
  const { point, direct } = steerAround(mover.pos, target.pos, barriers)
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
  const d = distance(mover.pos, point)
  if (d <= EPS) return false
  const { point: wp } = steerAround(mover.pos, point, barriers)   // route around terrain
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
  for (const other of all) {
    if (other === mover || !other.alive) continue
    let dx = mover.pos.x - other.pos.x
    let dy = mover.pos.y - other.pos.y
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d >= SEPARATION - EPS) continue
    if (d < EPS) {
      // Exactly overlapping: separate along a deterministic axis (by index).
      dx = mover.index < other.index ? -1 : 1
      dy = 0
      d = 1
    }
    const overlap = (SEPARATION - d) / 2
    const ux = dx / d
    const uy = dy / d
    // Push apart, but slide the push along any wall so crowded units against
    // terrain spread out instead of freezing into a blob.
    mover.pos = slideMove(mover.pos, { x: mover.pos.x + ux * overlap, y: mover.pos.y + uy * overlap }, barriers)
    other.pos = slideMove(other.pos, { x: other.pos.x - ux * overlap, y: other.pos.y - uy * overlap }, barriers)
  }
}
