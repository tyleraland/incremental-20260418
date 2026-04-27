// Tests for getDerivedStats — the central formula that weapon sets, skill tags,
// elemental bonuses, and spell mechanics will all flow through.
import { describe, expect, it } from 'vitest'
import { getDerivedStats, type EquipmentItem } from '@/stores/useGameStore'
import { makeUnit } from '../helpers'

// Shared equipment fixtures used across cases
const IRON_SWORD:   EquipmentItem = { id: 'eq-sword-1h',  name: 'Iron Sword',   category: 'weapon-1h', traits: [], stats: { attack: 4 } }
const IRON_SHIELD:  EquipmentItem = { id: 'eq-shield',    name: 'Iron Shield',  category: 'shield',    traits: [], stats: { defense: 5 } }
const WAND:         EquipmentItem = { id: 'eq-wand',      name: 'Wand',         category: 'weapon-1h', traits: [], stats: { specialAttack: 4 } }
const CHAINMAIL:    EquipmentItem = { id: 'eq-chainmail', name: 'Chain Mail',   category: 'armor',     traits: [], stats: { defense: 5 } }
const ALL_FIXTURES  = [IRON_SWORD, IRON_SHIELD, WAND, CHAINMAIL]

describe('getDerivedStats — base formulas from abilities', () => {
  // Base unit: all abilities = 5, no equipment, no skills
  // attack      = max(1, floor(str*2))              = floor(10)   = 10
  // defense     = max(1, floor(con*1.5))            = floor(7.5)  = 7
  // magicAttack = max(1, floor(int*2 + dex*0.5))   = floor(12.5) = 12
  // magicDefense= max(1, floor(int*0.5 + con))      = floor(7.5)  = 7
  // attackSpeed = max(1, floor(agi*2))              = floor(10)   = 10
  // accuracy    = max(1, floor(dex*1.5 + agi*0.5)) = floor(10)   = 10
  // dodge       = max(1, floor(agi*2 + dex*0.5))   = floor(12.5) = 12
  it('computes all seven stats from abilities with no equipment or skills', () => {
    const stats = getDerivedStats(makeUnit(), [])
    expect(stats.attack).toBe(10)
    expect(stats.defense).toBe(7)
    expect(stats.magicAttack).toBe(12)
    expect(stats.magicDefense).toBe(7)
    expect(stats.attackSpeed).toBe(10)
    expect(stats.accuracy).toBe(10)
    expect(stats.dodge).toBe(12)
  })

  it('floors fractional results — never stores a decimal stat', () => {
    // con=1 → floor(1*1.5) = floor(1.5) = 1, not 1.5
    const stats = getDerivedStats(makeUnit({ abilities: { strength: 1, agility: 1, dexterity: 1, constitution: 1, intelligence: 1 } }), [])
    expect(Number.isInteger(stats.attack)).toBe(true)
    expect(Number.isInteger(stats.defense)).toBe(true)
    expect(Number.isInteger(stats.magicAttack)).toBe(true)
    expect(Number.isInteger(stats.magicDefense)).toBe(true)
    expect(Number.isInteger(stats.attackSpeed)).toBe(true)
    expect(Number.isInteger(stats.accuracy)).toBe(true)
    expect(Number.isInteger(stats.dodge)).toBe(true)
  })

  it('clamps all stats to a minimum of 1 even with zero abilities', () => {
    const stats = getDerivedStats(
      makeUnit({ abilities: { strength: 0, agility: 0, dexterity: 0, constitution: 0, intelligence: 0 } }),
      []
    )
    expect(stats.attack).toBe(1)
    expect(stats.defense).toBe(1)
    expect(stats.magicAttack).toBe(1)
    expect(stats.magicDefense).toBe(1)
    expect(stats.attackSpeed).toBe(1)
    expect(stats.accuracy).toBe(1)
    expect(stats.dodge).toBe(1)
  })
})

describe('getDerivedStats — equipment bonuses', () => {
  it('adds equipment attack bonus to base attack', () => {
    // Iron Sword: +4 attack → 10 + 4 = 14
    const unit = makeUnit({ equipment: { mainHand: 'eq-sword-1h', offHand: null, tool: null, armor: null, accessory: null } })
    expect(getDerivedStats(unit, ALL_FIXTURES).attack).toBe(14)
  })

  it('adds equipment defense bonus to base defense', () => {
    // Iron Shield: +5 defense → 7 + 5 = 12
    const unit = makeUnit({ equipment: { mainHand: null, offHand: 'eq-shield', tool: null, armor: null, accessory: null } })
    expect(getDerivedStats(unit, ALL_FIXTURES).defense).toBe(12)
  })

  it('adds equipment specialAttack bonus to magicAttack', () => {
    // Wand: +4 specialAttack → 12 + 4 = 16
    const unit = makeUnit({ equipment: { mainHand: 'eq-wand', offHand: null, tool: null, armor: null, accessory: null } })
    expect(getDerivedStats(unit, ALL_FIXTURES).magicAttack).toBe(16)
  })

  it('stacks bonuses from multiple equipped items', () => {
    // Iron Sword (+4 atk) + Iron Shield (+5 def) + Chain Mail (+5 def)
    const unit = makeUnit({ equipment: { mainHand: 'eq-sword-1h', offHand: 'eq-shield', tool: null, armor: 'eq-chainmail', accessory: null } })
    const stats = getDerivedStats(unit, ALL_FIXTURES)
    expect(stats.attack).toBe(14)       // 10 + 4
    expect(stats.defense).toBe(17)      // 7 + 5 + 5
  })

  it('silently ignores equipment slot ids not found in the allEquipment list', () => {
    // Unit has a nonexistent item id — should compute as if the slot is empty
    const unit = makeUnit({ equipment: { mainHand: 'eq-legendary-sword-unknown', offHand: null, tool: null, armor: null, accessory: null } })
    const stats = getDerivedStats(unit, ALL_FIXTURES)
    expect(stats.attack).toBe(10)  // no bonus applied
  })

  it('produces the same result whether allEquipment is [] or missing equipped item ids', () => {
    const unit = makeUnit({ equipment: { mainHand: 'eq-sword-1h', offHand: null, tool: null, armor: null, accessory: null } })
    expect(getDerivedStats(unit, [])).toEqual(getDerivedStats(makeUnit(), []))
  })
})

describe('getDerivedStats — skill bonuses', () => {
  it('applies a direct stat bonus from a learned skill (sword-mastery-1h lv3 → +9 ATK)', () => {
    // sword-mastery-1h: getBonuses(lv) = { attack: lv * 3 }
    // lv3 → +9 attack → 10 + 9 = 19
    const unit = makeUnit({ learnedSkills: { 'sword-mastery-1h': 3 } })
    expect(getDerivedStats(unit, []).attack).toBe(19)
  })

  it('applies an ability boost from a skill, which then flows through the stat formula', () => {
    // arcane-knowledge lv2: getBonuses(2) = { intelligence: 2 }
    // int becomes 5+2=7 → magicAttack = floor(7*2 + 5*0.5) = floor(16.5) = 16
    //                   → magicDefense = floor(7*0.5 + 5) = floor(8.5) = 8
    const unit = makeUnit({ learnedSkills: { 'arcane-knowledge': 2 } })
    const stats = getDerivedStats(unit, [])
    expect(stats.magicAttack).toBe(16)
    expect(stats.magicDefense).toBe(8)
  })

  it('applies a direct magicAttack bonus from a skill (spellweaving lv2 → +8 M.ATK)', () => {
    // spellweaving: getBonuses(lv) = { magicAttack: lv * 4 }
    // lv2 → +8 magicAttack → 12 + 8 = 20
    const unit = makeUnit({ learnedSkills: { 'spellweaving': 2 } })
    expect(getDerivedStats(unit, []).magicAttack).toBe(20)
  })

  it('applies a dexterity boost from keen-eyes through to accuracy and dodge', () => {
    // keen-eyes lv1: getBonuses(1) = { dexterity: 1 } → dex becomes 6
    // accuracy = floor(6*1.5 + 5*0.5) = floor(9 + 2.5) = 11
    // dodge    = floor(5*2   + 6*0.5) = floor(10 + 3)  = 13
    const unit = makeUnit({ learnedSkills: { 'keen-eyes': 1 } })
    const stats = getDerivedStats(unit, [])
    expect(stats.accuracy).toBe(11)
    expect(stats.dodge).toBe(13)
  })

  it('stacks bonuses from multiple skills additively', () => {
    // sword-mastery-1h lv1 (+3 atk) + sword-mastery-2h lv1 (+5 atk) → +8 total → 10 + 8 = 18
    const unit = makeUnit({ learnedSkills: { 'sword-mastery-1h': 1, 'sword-mastery-2h': 1 } })
    expect(getDerivedStats(unit, []).attack).toBe(18)
  })

  it('ignores unknown skill ids in learnedSkills without throwing', () => {
    const unit = makeUnit({ learnedSkills: { 'skill-does-not-exist': 5 } })
    expect(() => getDerivedStats(unit, [])).not.toThrow()
    expect(getDerivedStats(unit, [])).toEqual(getDerivedStats(makeUnit(), []))
  })
})
