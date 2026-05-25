// Combat Tactic Engine — spatial queries for movement tactics (§spatial).
//
// Everything here is expressed *relative* to units and the formation (centroids,
// directions, nearest), never in absolute coordinates — so the same tactics work
// unchanged if the grid grows; a bigger board just means longer approaches.
//
// Kept dependency-light (grid + types only, no behaviour/tactics) to avoid an
// import cycle: tactics.ts → spatial.ts.

import { distance } from './grid'
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
