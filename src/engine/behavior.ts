// Combat Tactic Engine — base behavior (spec §4.1, §5.3 defaults, §16.8).
// This is what a unit does with ZERO tactics equipped: walk toward the nearest
// enemy, keep a locked target, and use naive skill intelligence (heal the hurt,
// otherwise attack). Tactics (a later layer) will override these defaults.

import { distance, attackReach } from './grid'
import { tauntBiasOf } from './tactics'
import type { BattleState, Combatant, EngineSkill } from './types'
import { EPS } from './constants'

export function livingEnemies(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team !== self.team)
}

export function livingAllies(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team === self.team)
}

export function findCombatant(state: BattleState, id: string | null): Combatant | null {
  if (!id) return null
  return state.combatants.find((c) => c.id === id) ?? null
}

// §5.4 target locking: keep the current target until it dies, then re-pick the
// nearest living enemy (deterministic tiebreak by id). Returns the previous
// target id when it changed, so the caller can emit `target_switch`.
export function selectTarget(state: BattleState, self: Combatant): string | null {
  const current = findCombatant(state, self.lockedTargetId)
  if (current && current.alive) return null

  const enemies = livingEnemies(state, self)
  if (enemies.length === 0) {
    const prev = self.lockedTargetId
    self.lockedTargetId = null
    return prev
  }

  // §6 Threatening Presence biases enemy targeting: a taunter reads as closer
  // than it really is, without hard-overriding the choice.
  const effDist = (e: Combatant) => distance(self.pos, e.pos) - tauntBiasOf(e)
  let best = enemies[0]
  let bestD = effDist(best)
  for (const e of enemies) {
    const d = effDist(e)
    if (d < bestD - EPS || (Math.abs(d - bestD) <= EPS && e.id < best.id)) {
      best = e
      bestD = d
    }
  }
  const prev = self.lockedTargetId
  self.lockedTargetId = best.id
  return prev !== best.id ? prev : null
}

export type Action =
  | { kind: 'heal'; skill: EngineSkill; targetId: string }
  | { kind: 'skill'; skill: EngineSkill; targetId: string }
  | { kind: 'basic'; targetId: string }

function ready(self: Combatant, skill: EngineSkill): boolean {
  return (self.skillCooldowns[skill.id] ?? 0) <= 0
}

// §4.1 naive skill usage for the skill types the core supports (attack, heal).
// Other types fall through to a basic attack until tactics/skill layers land.
export function chooseAction(state: BattleState, self: Combatant): Action | null {
  // Turtling (Shield Wall): hold attacks while the shield status is active.
  if (self.statuses.some((s) => s.flags.includes('shielded'))) return null

  // heal: most-injured ally below full HP, within range, heal off cooldown
  const healSkill = self.skills.find((s) => s.type === 'heal' && ready(self, s))
  if (healSkill) {
    const ally = mostInjuredAllyInRange(state, self, healSkill.range)
    if (ally) return { kind: 'heal', skill: healSkill, targetId: ally.id }
  }

  const target = findCombatant(state, self.lockedTargetId)
  if (!target || !target.alive) return null

  const d = distance(self.pos, target.pos)
  if (d > attackReach(self) + EPS) return null   // moved this turn but not yet in range

  const atkSkill = self.skills.find(
    (s) => s.type === 'attack' && ready(self, s) && d <= s.range + EPS,
  )
  if (atkSkill) return { kind: 'skill', skill: atkSkill, targetId: target.id }
  return { kind: 'basic', targetId: target.id }
}

export function mostInjuredAllyInRange(
  state: BattleState,
  self: Combatant,
  range: number,
): Combatant | null {
  let best: Combatant | null = null
  let bestRatio = 1
  for (const a of livingAllies(state, self)) {
    if (a.hp >= a.maxHp) continue
    if (distance(self.pos, a.pos) > range + EPS) continue
    const ratio = a.hp / a.maxHp
    if (best === null || ratio < bestRatio - EPS || (Math.abs(ratio - bestRatio) <= EPS && a.id < best.id)) {
      best = a
      bestRatio = ratio
    }
  }
  return best
}
