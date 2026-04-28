// Tests for getDerivedStats — new stat-driven combat model
import { describe, expect, it } from 'vitest'
import { getDerivedStats, type EquipmentItem } from '@/stores/useGameStore'
import { makeUnit } from '../helpers'

// Shared equipment fixtures
const IRON_SWORD:  EquipmentItem = { id: 'eq-sword-1h',  name: 'Iron Sword',  category: 'weapon-1h', traits: [], stats: { attack: 4,    baseAps: 1.2 } }
const IRON_SHIELD: EquipmentItem = { id: 'eq-shield',    name: 'Iron Shield', category: 'shield',    traits: [], stats: { defense: 5 } }
const WAND:        EquipmentItem = { id: 'eq-wand',      name: 'Wand',        category: 'weapon-1h', traits: [], stats: { specialAttack: 4, baseAps: 1.1, range: 40 } }
const CHAINMAIL:   EquipmentItem = { id: 'eq-chainmail', name: 'Chain Mail',  category: 'armor',     traits: [], stats: { defense: 5 } }
const ALL_FIXTURES = [IRON_SWORD, IRON_SHIELD, WAND, CHAINMAIL]

describe('getDerivedStats — base formulas from abilities', () => {
  // makeUnit: all abilities=5, level=1, no equipment
  // attack          = STR + floor(STR/10)²          = 5 + 0 = 5
  // armorDefense    = 0 (no armor)
  // abilityDefense  = CON = 5
  // magicAttack     = INT + (floor(INT/7)²+floor(INT/5)²)/2 = 5 + (0+1)/2 = 5.5
  // aps             = 0.8 * (1+5/100) * (1+5/500)  ≈ 0.8484 (unarmed)
  // accuracy        = DEX + level                   = 5+1 = 6
  // dodge           = AGI                           = 5
  it('computes base stats from abilities with no equipment', () => {
    const stats = getDerivedStats(makeUnit(), [])
    expect(stats.attack).toBe(5)
    expect(stats.armorDefense).toBe(0)
    expect(stats.abilityDefense).toBe(5)
    expect(stats.magicAttack).toBeCloseTo(5.5)
    expect(stats.abilityMagicDefense).toBe(5)
    expect(stats.aps).toBeCloseTo(0.8484, 3)
    expect(stats.accuracy).toBe(6)
    expect(stats.dodge).toBe(5)
    expect(stats.primaryDamageType).toBe('physical')
    expect(stats.range).toBe(0)
  })

  it('applies STR quadratic scaling above 10', () => {
    // str=20: floor(20/10)²=4 → attack = 20+4 = 24
    const stats = getDerivedStats(makeUnit({ abilities: { strength: 20, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 } }), [])
    expect(stats.attack).toBe(24)
  })

  it('clamps attack and magicAttack to minimum of 1 with zero abilities', () => {
    const stats = getDerivedStats(
      makeUnit({ abilities: { strength: 0, agility: 0, dexterity: 0, constitution: 0, intelligence: 0 } }),
      []
    )
    expect(stats.attack).toBe(1)
    expect(stats.magicAttack).toBe(1)
    // accuracy clamped to min 1 even when DEX=0 (level=1 helps)
    expect(stats.accuracy).toBe(1)
    // armorDefense and dodge can be 0
    expect(stats.armorDefense).toBe(0)
    expect(stats.dodge).toBe(0)
  })
})

describe('getDerivedStats — equipment bonuses', () => {
  it('adds weapon attack bonus to base attack', () => {
    // Iron Sword: +4 attack → 5 + 4 = 9
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-sword-1h', offHand: null }, { mainHand: null, offHand: null }] })
    expect(getDerivedStats(unit, ALL_FIXTURES).attack).toBe(9)
  })

  it('uses mainHand baseAps to scale APS', () => {
    // Iron Sword: baseAps=1.2 → aps = 1.2 * (1+5/100) * (1+5/500) ≈ 1.272
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-sword-1h', offHand: null }, { mainHand: null, offHand: null }] })
    const aps = getDerivedStats(unit, ALL_FIXTURES).aps
    expect(aps).toBeCloseTo(1.2 * 1.05 * 1.01, 4)
  })

  it('sets primaryDamageType to magic when mainHand has specialAttack', () => {
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-wand', offHand: null }, { mainHand: null, offHand: null }] })
    const stats = getDerivedStats(unit, ALL_FIXTURES)
    expect(stats.primaryDamageType).toBe('magic')
    expect(stats.magicAttack).toBeCloseTo(4 + 5.5, 1)  // weaponMagicAtk + abilityMagicAtk
  })

  it('sums armor defense from all equipped defense items', () => {
    // Iron Shield (+5 def) + Chain Mail (+5 def) → armorDefense = 10
    const unit = makeUnit({
      weaponSets: [{ mainHand: null, offHand: 'eq-shield' }, { mainHand: null, offHand: null }],
      equipment:  { armor: 'eq-chainmail', tool: null, accessory: null },
    })
    expect(getDerivedStats(unit, ALL_FIXTURES).armorDefense).toBe(10)
  })

  it('takes the highest range from equipped items', () => {
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-wand', offHand: null }, { mainHand: null, offHand: null }] })
    expect(getDerivedStats(unit, ALL_FIXTURES).range).toBe(40)
  })

  it('silently ignores unknown equipment ids', () => {
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-unknown', offHand: null }, { mainHand: null, offHand: null }] })
    const stats = getDerivedStats(unit, ALL_FIXTURES)
    expect(stats.attack).toBe(5)  // no bonus applied
  })
})

describe('getDerivedStats — skill bonuses', () => {
  it('applies a direct attack bonus from a skill (sword-mastery-1h lv3 → +9)', () => {
    // sb.attack=9 → attack = 0 + 5 + 0 + 9 = 14
    const unit = makeUnit({ learnedSkills: { 'sword-mastery-1h': 3 } })
    expect(getDerivedStats(unit, []).attack).toBe(14)
  })

  it('applies a direct magicAttack bonus from a skill (spellweaving lv2 → +8)', () => {
    const unit = makeUnit({ learnedSkills: { 'spellweaving': 2 } })
    expect(getDerivedStats(unit, []).magicAttack).toBeCloseTo(5.5 + 8, 1)
  })

  it('stacks bonuses from multiple skills additively', () => {
    // sword-mastery-1h lv1 (+3 atk) + sword-mastery-2h lv1 (+5 atk) → +8 → 5 + 8 = 13
    const unit = makeUnit({ learnedSkills: { 'sword-mastery-1h': 1, 'sword-mastery-2h': 1 } })
    expect(getDerivedStats(unit, []).attack).toBe(13)
  })

  it('ignores unknown skill ids without throwing', () => {
    const unit = makeUnit({ learnedSkills: { 'skill-does-not-exist': 5 } })
    expect(() => getDerivedStats(unit, [])).not.toThrow()
    expect(getDerivedStats(unit, [])).toEqual(getDerivedStats(makeUnit(), []))
  })
})
