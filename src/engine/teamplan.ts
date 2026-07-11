// Combat Tactic Engine — the team coordination planner (tactical-coordination.md).
// Future home of the sense → appraise → decide → assign → publish pipeline that
// fills TeamPlan v2 (engagement / assignments / avoid list / corridor). M0 ships
// only the substrate: the team acumen score and the per-combatant kit-capability
// precompute — read by nothing in the sim yet.
//
// Pure and deterministic like every engine leaf (same discipline as plan.ts):
// no RNG, no store/time imports, inputs never mutated.

import { attackReach } from './grid'
import { effectiveStat, skillDamageEstimate } from './damage'
import { armoredFactor } from './tactics'
import type { BattleState, Combatant, KitCapability, Team } from './types'

// §acumen (tactical-coordination.md §3.2): smart members make a smart party.
// Additive over LIVING members' effective INT — every scholar contributes,
// buffs/debuffs move it, and deaths are felt immediately (kill the shaman and
// the pack's coordination collapses). Planner features gate on it through the
// ACUMEN thresholds table (tuning.ts); recomputed from live state, no memory.
export function teamAcumen(state: BattleState, team: Team): number {
  let sum = 0
  for (const c of state.combatants) {
    if (c.alive && c.team === team) sum += effectiveStat(c, 'int')
  }
  return sum
}

// §capability (tactical-coordination.md §3.2/§5): the target-independent v0
// answers, precomputed once per combatant (makeCombatant + snapshot deserialize
// — derived, never serialized). Computed on the BASE kit (statuses stripped) so
// a mid-fight snapshot rebuilds the same numbers spawn produced. All v0 ⏱:
//   sustainedDamage — best raw formula damage/round over basic + attack skills,
//     amortized by cast cycle (channel + cooldown) like estimateDamageVs, but
//     with no target mitigation/element (that's the matchup scorers' job).
//   toughness — maxHp × armoredFactor (1 − capped armorReduction).
//   reach — max offensive range: attackReach + damage-skill ranges (mirrors
//     threatProfile's reach logic in plan.ts).
//   hasHeal — any heal skill in the kit.
export function computeCapability(c: Combatant): KitCapability {
  const base = c.statuses.length ? { ...c, statuses: [] } : c
  let sustainedDamage = effectiveStat(base, 'str')   // basic attack: str * 1, cycle 1
  let reach = attackReach(c)
  for (const s of c.skills) {
    if (s.damageFormula && s.range > reach) reach = s.range
    if (s.type !== 'attack') continue
    const cycle = Math.max(1, s.channelTime + s.cooldown)
    const d = skillDamageEstimate(base, s) / cycle
    if (d > sustainedDamage) sustainedDamage = d
  }
  return {
    sustainedDamage,
    toughness: c.maxHp * armoredFactor(c),
    reach,
    hasHeal: c.skills.some((s) => s.type === 'heal'),
  }
}
