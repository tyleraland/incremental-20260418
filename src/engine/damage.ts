// Combat Tactic Engine — damage & healing (spec §8).
// No randomness anywhere (invariant §16.1); all variation is modulo arithmetic
// seeded by round number and attacker index.

import type { Combatant, EngineSkill, StatModifiers } from './types'

const STAT_KEYS = ['str', 'def', 'int', 'spd'] as const
type StatKey = (typeof STAT_KEYS)[number]

// Effective stat = base + sum of active status modifiers (§7).
export function effectiveStat(c: Combatant, stat: StatKey): number {
  let v = c[stat]
  for (const s of c.statuses) {
    const mod = s.statModifiers[stat as keyof StatModifiers]
    if (mod) v += mod
  }
  return v
}

// Deterministic offset in [-2, +2] (§8.1).
export function variation(round: number, attackerIndex: number): number {
  return ((round * 7 + attackerIndex * 13) % 5) - 2
}

// Tiny safe evaluator for the spec's formula grammar: a product of terms, where
// each term is a stat name (str/def/int/spd) or a numeric literal.
// Examples: "str * 1.5", "int * 2.0", "str". No eval(), no operators but `*`.
export function evalFormula(formula: string, c: Combatant): number {
  let product = 1
  for (const rawTerm of formula.split('*')) {
    const term = rawTerm.trim()
    if (!term) continue
    if ((STAT_KEYS as readonly string[]).includes(term)) {
      product *= effectiveStat(c, term as StatKey)
    } else {
      const n = Number(term)
      product *= Number.isFinite(n) ? n : 0
    }
  }
  return product
}

// Default damage. Physical unless the formula scales on INT, in which case it's
// treated as magic (§8.1/§8.2). Basic attack (skill === null) is "str * 1".
export function defaultCalculateDamage(
  attacker: Combatant,
  defender: Combatant,
  skill: EngineSkill | null,
  round: number,
): number {
  const formula = skill ? skill.damageFormula : 'str * 1'
  const isMagic = /\bint\b/.test(formula)
  const raw = evalFormula(formula, attacker)
  const mitigation = isMagic
    ? effectiveStat(defender, 'int') * 0.25
    : effectiveStat(defender, 'def') * 0.5
  return Math.max(1, Math.floor(raw - mitigation + variation(round, attacker.index)))
}

// Healing has no variation — it's predictable (§8.3).
export function calculateHeal(caster: Combatant, skill: EngineSkill): number {
  return Math.floor(evalFormula(skill.healFormula, caster))
}

// Target-independent damage estimate for an attack skill (raw formula on the
// caster's current stats, before the defender's mitigation/variation). Used to
// order the action channel "biggest ready nuke first" (§action policy) and by
// burst tactics to pick a cast. Non-attack skills score 0.
export function skillDamageEstimate(caster: Combatant, skill: EngineSkill): number {
  return skill.type === 'attack' ? evalFormula(skill.damageFormula, caster) : 0
}
