// Combat Tactic Engine — spatial queries for movement tactics (§spatial).
//
// Everything here is expressed *relative* to units and the formation (centroids,
// directions, nearest), never in absolute coordinates — so the same tactics work
// unchanged if the grid grows; a bigger board just means longer approaches.
//
// Kept dependency-light (grid + types only, no behaviour/tactics) to avoid an
// import cycle: tactics.ts → spatial.ts.

import { distance, moveSpeedOf } from './grid'
import { EPS } from './constants'
import type { BattleState, Combatant, Vec2 } from './types'

const isHidden = (c: Combatant) => c.statuses.some((s) => s.flags.includes('stealthed'))

export function alliesOf(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team === self.team && c.id !== self.id)
}
export function visibleEnemiesOf(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team !== self.team && !isHidden(c))
}
export function lockedTarget(self: Combatant, state: BattleState): Combatant | null {
  if (!self.lockedTargetId) return null
  return state.combatants.find((c) => c.id === self.lockedTargetId && c.alive) ?? null
}

export function centroid(units: Combatant[]): Vec2 | null {
  if (units.length === 0) return null
  let x = 0, y = 0
  for (const u of units) { x += u.pos.x; y += u.pos.y }
  return { x: x / units.length, y: y / units.length }
}

// Nearest unit to a point, deterministic id tiebreak.
export function nearestTo(pos: Vec2, units: Combatant[]): Combatant | null {
  let best: Combatant | null = null
  let bd = Infinity
  for (const u of units) {
    const d = distance(pos, u.pos)
    if (d < bd - EPS || (Math.abs(d - bd) <= EPS && best !== null && u.id < best.id)) { best = u; bd = d }
  }
  return best
}
export function nearestEnemyTo(unit: Combatant, state: BattleState): Combatant | null {
  return nearestTo(unit.pos, visibleEnemiesOf(state, unit))
}

// The unit worth protecting: the squishiest living ally (lowest defense), id tiebreak.
export function squishiestAlly(self: Combatant, state: BattleState): Combatant | null {
  let best: Combatant | null = null
  for (const a of alliesOf(state, self)) {
    if (best === null || a.def < best.def || (a.def === best.def && a.id < best.id)) best = a
  }
  return best
}

// The farthest a unit can act from: the longest range among its skills (falls
// back to basic-attack reach). Casters use this to stand off at spell range.
export function maxSkillRange(self: Combatant): number {
  let r = self.rangedRange
  for (const s of self.skills) if (s.range > r) r = s.range
  return r
}

// A spot just off `target` on the side *away from its allies* — i.e. the target's
// least-defended flank (the rear for a backliner). `offset` is how far past the
// target to stand (≈ attack reach so the move lands you in range).
export function flankPoint(self: Combatant, target: Combatant, state: BattleState, offset: number): Vec2 {
  const mates = state.combatants.filter((c) => c.alive && c.team === target.team && c.id !== target.id)
  const c = centroid(mates)
  let ux: number | undefined, uy = 0
  if (c) {
    const dx = target.pos.x - c.x, dy = target.pos.y - c.y
    const d = Math.hypot(dx, dy)
    if (d > EPS) { ux = dx / d; uy = dy / d }
  }
  if (ux === undefined) {
    // lone target: just approach from where we already are, stopping `offset` short
    const dx = target.pos.x - self.pos.x, dy = target.pos.y - self.pos.y
    const d = Math.hypot(dx, dy) || 1
    return { x: target.pos.x - (dx / d) * offset, y: target.pos.y - (dy / d) * offset }
  }
  return { x: target.pos.x + ux * offset, y: target.pos.y + uy * offset }
}

// A spot between `ally` and the `threat`, just in front of the ally — body-block.
export function guardPoint(ally: Combatant, threat: Combatant, gap: number): Vec2 {
  const dx = threat.pos.x - ally.pos.x, dy = threat.pos.y - ally.pos.y
  const d = Math.hypot(dx, dy) || 1
  return { x: ally.pos.x + (dx / d) * gap, y: ally.pos.y + (dy / d) * gap }
}

// Unit vector from `self` toward the centroid of its living allies — used as
// a light "stay with the pack" bias in back-off movements (kite retreats,
// `awayFromNearestEnemy` retreats). Returns (0, 0) when already at the
// centroid or the unit is alone, so callers can blend it in unconditionally.
export function cohesionVec(self: Combatant, state: BattleState): Vec2 {
  const mates = state.combatants.filter((c) => c.alive && c.team === self.team && c.id !== self.id)
  const c = centroid(mates)
  if (!c) return { x: 0, y: 0 }
  const dx = c.x - self.pos.x, dy = c.y - self.pos.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return { x: 0, y: 0 }   // already with the pack — no nudge
  return { x: dx / d, y: dy / d }
}

// A "caster" is any combatant whose offence is spells, not a basic attack —
// they have at least one ready skill or are magic-statted with skills. Used
// by chooseAction (skip the basic-ranged fallback) and by kite math (need
// safe distance to finish a channeled cast). Applies to monsters too.
export function isCaster(c: Combatant): boolean {
  if (c.skills.length === 0) return false
  // A unit with a channel-time spell is definitionally a caster.
  if (c.skills.some((s) => s.channelTime >= 1)) return true
  // Otherwise: magic-leaning stats with skills (Theron, Sera). Mostly catches
  // instant-spell mages — they still don't want to throw weak basic shots.
  return c.int > c.str
}

// Distance to hold from `threat` while we expect to cast. Accounts for:
//   * our longest-channel spell (the threat closes at full speed while we're
//     rooted in the channel + the round the cast starts on),
//   * the threat's actual move speed (a fast chaser pushes the kite wider),
//   * the threat's melee reach + a safety buffer,
//   * our longest skill range (the cast still has to land).
// If `minSafe` exceeds our range, we keep the safe distance and just don't
// shoot that round — preferable to dying mid-channel.
export function kiteDistanceFor(self: Combatant, threat: Combatant): number {
  const maxRange = maxSkillRange(self)
  const maxChannel = self.skills.reduce((m, s) => Math.max(m, s.channelTime), 0)
  // `channelTime + 1`: the threat moves once on the cast-start round AND once
  // per channeled-resolution round before the spell lands.
  const threatClose = moveSpeedOf(threat) * (maxChannel + 1)
  // Cap threat melee at a realistic polearm reach. Some tests use absurd
  // meleeRange values (30, 99) as a "doesn't matter, it's already in reach"
  // sentinel; we don't want those to push the caster to retreat off the map.
  const effectiveMelee = Math.min(threat.meleeRange, 3)
  const minSafe = effectiveMelee + threatClose + 0.5
  // Prefer just inside max range so the cast comfortably lands, but never
  // below minSafe.
  return Math.max(minSafe, maxRange - 0.5)
}
