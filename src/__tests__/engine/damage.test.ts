import { describe, it, expect } from 'vitest'
import {
  variation, evalFormula, effectiveStat, defaultCalculateDamage, calculateHeal,
} from '@/engine'
import { combatant, attackSkill, healSkill } from './helpers'

describe('damage: variation (§8.1)', () => {
  it('is deterministic and bounded to [-2, +2]', () => {
    for (let round = 0; round < 50; round++) {
      for (let idx = 0; idx < 12; idx++) {
        const v = variation(round, idx)
        expect(v).toBeGreaterThanOrEqual(-2)
        expect(v).toBeLessThanOrEqual(2)
        expect(v).toBe(variation(round, idx))   // pure
      }
    }
  })

  it('matches the spec modulo formula', () => {
    expect(variation(1, 0)).toBe(((1 * 7) % 5) - 2) // 0
    expect(variation(3, 2)).toBe(((3 * 7 + 2 * 13) % 5) - 2)
  })
})

describe('damage: evalFormula', () => {
  it('multiplies a stat by a literal', () => {
    const c = combatant({ str: 10, int: 3 })
    expect(evalFormula('str * 1.5', c)).toBe(15)
    expect(evalFormula('int * 2.0', c)).toBe(6)
  })

  it('handles a bare stat or bare number', () => {
    const c = combatant({ str: 7 })
    expect(evalFormula('str', c)).toBe(7)
    expect(evalFormula('3', c)).toBe(3)
  })
})

describe('damage: effectiveStat (§7)', () => {
  it('adds active status modifiers to the base stat', () => {
    const c = combatant({
      spd: 10,
      statuses: [
        { id: 's', name: 'Haste', source: 'x', duration: 2, statModifiers: { spd: 5 }, flags: [] },
      ],
    })
    expect(effectiveStat(c, 'spd')).toBe(15)
    expect(effectiveStat(c, 'str')).toBe(10) // unaffected
  })
})

describe('damage: defaultCalculateDamage (§8.1/§8.2)', () => {
  it('physical: floor(str*mult - def*0.5 + variation), min 1', () => {
    const attacker = combatant({ id: 'a', index: 0, str: 10 })
    const defender = combatant({ id: 'd', index: 1, def: 4 })
    // basic attack: raw=10, mitigation=2, variation(round=1,idx=0)=0 → 8
    expect(defaultCalculateDamage(attacker, defender, null, 1)).toBe(8)
  })

  it('uses INT-based mitigation when the formula scales on int', () => {
    const attacker = combatant({ id: 'a', index: 0, int: 10 })
    const defender = combatant({ id: 'd', index: 1, int: 8, def: 100 })
    const magicSkill = attackSkill({ damageFormula: 'int * 2' })
    // raw=20, magic mitigation=8*0.25=2, variation(1,0)=0 → 18 (def ignored)
    expect(defaultCalculateDamage(attacker, defender, magicSkill, 1)).toBe(18)
  })

  it('never returns less than 1', () => {
    const attacker = combatant({ id: 'a', index: 0, str: 1 })
    const defender = combatant({ id: 'd', index: 1, def: 1000 })
    expect(defaultCalculateDamage(attacker, defender, null, 5)).toBe(1)
  })
})

describe('damage: calculateHeal (§8.3)', () => {
  it('floors int * heal multiplier, no variation', () => {
    const caster = combatant({ int: 7 })
    expect(calculateHeal(caster, healSkill({ healFormula: 'int * 2' }))).toBe(14)
  })
})
