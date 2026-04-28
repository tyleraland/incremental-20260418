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
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-sword-1h', offHand: null }, { mainHand: null, offHand: null }] })
    expect(getDerivedStats(unit, ALL_FIXTURES).attack).toBe(14)
  })

  it('adds equipment defense bonus to base defense', () => {
    // Iron Shield: +5 defense → 7 + 5 = 12
    const unit = makeUnit({ weaponSets: [{ mainHand: null, offHand: 'eq-shield' }, { mainHand: null, offHand: null }] })
    expect(getDerivedStats(unit, ALL_FIXTURES).defense).toBe(12)
  })

  it('adds equipment specialAttack bonus to magicAttack', () => {
    // Wand: +4 specialAttack → 12 + 4 = 16
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-wand', offHand: null }, { mainHand: null, offHand: null }] })
    expect(getDerivedStats(unit, ALL_FIXTURES).magicAttack).toBe(16)
  })

  it('stacks bonuses from multiple equipped items', () => {
    // Iron Sword (+4 atk) + Iron Shield (+5 def) + Chain Mail (+5 def)
    const unit = makeUnit({
      weaponSets: [{ mainHand: 'eq-sword-1h', offHand: 'eq-shield' }, { mainHand: null, offHand: null }],
      equipment:  { armor: 'eq-chainmail', tool: null, accessory: null },
    })
    const stats = getDerivedStats(unit, ALL_FIXTURES)
    expect(stats.attack).toBe(14)       // 10 + 4
    expect(stats.defense).toBe(17)      // 7 + 5 + 5
  })

  it('silently ignores equipment slot ids not found in the allEquipment list', () => {
    // Unit has a nonexistent item id — should compute as if the slot is empty
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-legendary-sword-unknown', offHand: null }, { mainHand: null, offHand: null }] })
    const stats = getDerivedStats(unit, ALL_FIXTURES)
    expect(stats.attack).toBe(10)  // no bonus applied
  })

  it('produces the same result whether allEquipment is [] or missing equipped item ids', () => {
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-sword-1h', offHand: null }, { mainHand: null, offHand: null }] })
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

// ---------------------------------------------------------------------------
// Per-ability formula isolation
// Each test zeroes out every unrelated ability so only one contribution is
// visible. This guards against wrong coefficients and mixed-up ability keys.
// ---------------------------------------------------------------------------
describe('getDerivedStats — per-ability formula isolation', () => {
  const mk = (overrides: Partial<{ str: number; agi: number; dex: number; con: number; int: number }>) => {
    const { str = 0, agi = 0, dex = 0, con = 0, int: intelligence = 0 } = overrides
    return makeUnit({ abilities: { strength: str, agility: agi, dexterity: dex, constitution: con, intelligence } })
  }

  it('attack = floor(str*2): str=1→2, str=3→6, str=4→8', () => {
    expect(getDerivedStats(mk({ str: 1 }), []).attack).toBe(2)
    expect(getDerivedStats(mk({ str: 3 }), []).attack).toBe(6)
    expect(getDerivedStats(mk({ str: 4 }), []).attack).toBe(8)
  })

  it('strength does not affect defense, magicAttack, magicDefense, attackSpeed, accuracy, or dodge', () => {
    const low  = getDerivedStats(makeUnit({ abilities: { strength: 1,  agility: 5, dexterity: 5, constitution: 5, intelligence: 5 } }), [])
    const high = getDerivedStats(makeUnit({ abilities: { strength: 20, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 } }), [])
    expect(high.defense).toBe(low.defense)
    expect(high.magicAttack).toBe(low.magicAttack)
    expect(high.magicDefense).toBe(low.magicDefense)
    expect(high.attackSpeed).toBe(low.attackSpeed)
    expect(high.accuracy).toBe(low.accuracy)
    expect(high.dodge).toBe(low.dodge)
  })

  it('defense = floor(con*1.5): con=1→1, con=2→3, con=3→4  (floor of 1.5, 3, 4.5)', () => {
    expect(getDerivedStats(mk({ con: 1 }), []).defense).toBe(1)
    expect(getDerivedStats(mk({ con: 2 }), []).defense).toBe(3)
    expect(getDerivedStats(mk({ con: 3 }), []).defense).toBe(4)
  })

  it('constitution does not affect attack, magicAttack, attackSpeed, accuracy, or dodge', () => {
    const low  = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 5, dexterity: 5, constitution: 1,  intelligence: 5 } }), [])
    const high = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 5, dexterity: 5, constitution: 20, intelligence: 5 } }), [])
    expect(high.attack).toBe(low.attack)
    expect(high.magicAttack).toBe(low.magicAttack)
    expect(high.attackSpeed).toBe(low.attackSpeed)
    expect(high.accuracy).toBe(low.accuracy)
    expect(high.dodge).toBe(low.dodge)
  })

  it('attackSpeed = floor(agi*2): agi=1→2, agi=3→6', () => {
    expect(getDerivedStats(mk({ agi: 1 }), []).attackSpeed).toBe(2)
    expect(getDerivedStats(mk({ agi: 3 }), []).attackSpeed).toBe(6)
  })

  it('agility does not affect attack, defense, magicAttack, or magicDefense', () => {
    const low  = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 1,  dexterity: 5, constitution: 5, intelligence: 5 } }), [])
    const high = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 20, dexterity: 5, constitution: 5, intelligence: 5 } }), [])
    expect(high.attack).toBe(low.attack)
    expect(high.defense).toBe(low.defense)
    expect(high.magicAttack).toBe(low.magicAttack)
    expect(high.magicDefense).toBe(low.magicDefense)
  })

  it('magicAttack = floor(int*2 + dex*0.5): int=5 dex=0→10, int=0 dex=4→2', () => {
    // Confirms the two contributions in isolation
    expect(getDerivedStats(mk({ int: 5 }), []).magicAttack).toBe(10)  // floor(10)
    expect(getDerivedStats(mk({ dex: 4 }), []).magicAttack).toBe(2)   // floor(2)
  })

  it('magicDefense = floor(int*0.5 + con): int=5 con=0→2, int=0 con=5→5', () => {
    expect(getDerivedStats(mk({ int: 5 }), []).magicDefense).toBe(2)  // floor(2.5)
    expect(getDerivedStats(mk({ con: 5 }), []).magicDefense).toBe(5)  // floor(5)
  })

  it('magicDefense floors int*0.5+con correctly: int=1 con=1→1, int=3 con=1→2', () => {
    // int=1,con=1: floor(0.5+1)=floor(1.5)=1 — not 2
    // int=3,con=1: floor(1.5+1)=floor(2.5)=2
    expect(getDerivedStats(mk({ int: 1, con: 1 }), []).magicDefense).toBe(1)
    expect(getDerivedStats(mk({ int: 3, con: 1 }), []).magicDefense).toBe(2)
  })

  it('accuracy = floor(dex*1.5 + agi*0.5): dex=5 agi=0→7, dex=0 agi=4→2', () => {
    expect(getDerivedStats(mk({ dex: 5 }), []).accuracy).toBe(7)  // floor(7.5)
    expect(getDerivedStats(mk({ agi: 4 }), []).accuracy).toBe(2)  // floor(2)
  })

  it('dodge = floor(agi*2 + dex*0.5): agi=5 dex=0→10, agi=0 dex=4→2', () => {
    expect(getDerivedStats(mk({ agi: 5 }), []).dodge).toBe(10)  // floor(10)
    expect(getDerivedStats(mk({ dex: 4 }), []).dodge).toBe(2)   // floor(2)
  })

  it('intelligence does not affect attack, defense, attackSpeed, accuracy, or dodge', () => {
    const low  = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 5, dexterity: 5, constitution: 5, intelligence: 1  } }), [])
    const high = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 5, dexterity: 5, constitution: 5, intelligence: 20 } }), [])
    expect(high.attack).toBe(low.attack)
    expect(high.defense).toBe(low.defense)
    expect(high.attackSpeed).toBe(low.attackSpeed)
    expect(high.accuracy).toBe(low.accuracy)
    expect(high.dodge).toBe(low.dodge)
  })

  it('dexterity does not affect attack, defense, attackSpeed, or magicDefense', () => {
    const low  = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 5, dexterity: 1,  constitution: 5, intelligence: 5 } }), [])
    const high = getDerivedStats(makeUnit({ abilities: { strength: 5, agility: 5, dexterity: 20, constitution: 5, intelligence: 5 } }), [])
    expect(high.attack).toBe(low.attack)
    expect(high.defense).toBe(low.defense)
    expect(high.attackSpeed).toBe(low.attackSpeed)
    expect(high.magicDefense).toBe(low.magicDefense)
  })
})

// ---------------------------------------------------------------------------
// Equipment slot coverage
// ---------------------------------------------------------------------------
describe('getDerivedStats — equipment slot coverage', () => {
  it('tool slot bonus is applied', () => {
    const TOOL: EquipmentItem = { id: 'eq-tool', name: 'Tool', category: 'tool', traits: [], stats: { attack: 3 } }
    const unit = makeUnit({ equipment: { armor: null, tool: 'eq-tool', accessory: null } })
    expect(getDerivedStats(unit, [TOOL]).attack).toBe(13)  // 10 + 3
  })

  it('accessory slot bonus is applied', () => {
    const ACC: EquipmentItem = { id: 'eq-ring', name: 'Ring', category: 'accessory', traits: [], stats: { defense: 2 } }
    const unit = makeUnit({ equipment: { armor: null, tool: null, accessory: 'eq-ring' } })
    expect(getDerivedStats(unit, [ACC]).defense).toBe(9)  // 7 + 2
  })

  it('specialDefense on equipment raises magicDefense', () => {
    const CLOAK: EquipmentItem = { id: 'eq-cloak', name: 'Magic Cloak', category: 'armor', traits: [], stats: { specialDefense: 6 } }
    const unit = makeUnit({ equipment: { armor: 'eq-cloak', tool: null, accessory: null } })
    expect(getDerivedStats(unit, [CLOAK]).magicDefense).toBe(13)  // 7 + 6
  })

  it('reads from weapon set 1 when activeWeaponSet=1', () => {
    const SWORD: EquipmentItem = { id: 'eq-s1', name: 'Sword', category: 'weapon-1h', traits: [], stats: { attack: 8 } }
    const unit = makeUnit({
      weaponSets: [{ mainHand: null, offHand: null }, { mainHand: 'eq-s1', offHand: null }],
      activeWeaponSet: 1,
    })
    expect(getDerivedStats(unit, [SWORD]).attack).toBe(18)  // 10 + 8
  })

  it('inactive weapon set is not read when activeWeaponSet=1', () => {
    const SWORD: EquipmentItem = { id: 'eq-s0', name: 'Sword', category: 'weapon-1h', traits: [], stats: { attack: 8 } }
    // sword in set 0 but activeWeaponSet=1 — no bonus expected
    const unit = makeUnit({
      weaponSets: [{ mainHand: 'eq-s0', offHand: null }, { mainHand: null, offHand: null }],
      activeWeaponSet: 1,
    })
    expect(getDerivedStats(unit, [SWORD]).attack).toBe(10)
  })

  it('all five slots (mainHand, offHand, armor, tool, accessory) contribute simultaneously', () => {
    const ALL: EquipmentItem[] = [
      { id: 'eq-mh', name: 'Sword',     category: 'weapon-1h', traits: [], stats: { attack: 2 } },
      { id: 'eq-oh', name: 'Shield',    category: 'shield',    traits: [], stats: { defense: 2 } },
      { id: 'eq-ar', name: 'Armor',     category: 'armor',     traits: [], stats: { defense: 2 } },
      { id: 'eq-tl', name: 'Tool',      category: 'tool',      traits: [], stats: { attack: 2 } },
      { id: 'eq-ac', name: 'Accessory', category: 'accessory', traits: [], stats: { defense: 2 } },
    ]
    const unit = makeUnit({
      weaponSets: [{ mainHand: 'eq-mh', offHand: 'eq-oh' }, { mainHand: null, offHand: null }],
      equipment: { armor: 'eq-ar', tool: 'eq-tl', accessory: 'eq-ac' },
    })
    const stats = getDerivedStats(unit, ALL)
    expect(stats.attack).toBe(14)   // 10 + 2 (mainHand) + 2 (tool)
    expect(stats.defense).toBe(13)  // 7  + 2 (offHand) + 2 (armor) + 2 (accessory)
  })

  it('item with both attack and specialDefense applies each to its own derived stat', () => {
    const COMBO: EquipmentItem = { id: 'eq-combo', name: 'Runic Blade', category: 'weapon-1h', traits: [], stats: { attack: 3, specialDefense: 4 } }
    const unit = makeUnit({ weaponSets: [{ mainHand: 'eq-combo', offHand: null }, { mainHand: null, offHand: null }] })
    const stats = getDerivedStats(unit, [COMBO])
    expect(stats.attack).toBe(13)        // 10 + 3
    expect(stats.magicDefense).toBe(11)  // 7 + 4
  })
})

// ---------------------------------------------------------------------------
// attackSpeed, accuracy, and dodge have no equipment bonus path in the formula.
// A wildly overpowered item should not bleed into these stats.
// ---------------------------------------------------------------------------
describe('getDerivedStats — attackSpeed, accuracy, and dodge receive no equipment bonus', () => {
  const MONSTER_ITEM: EquipmentItem = {
    id: 'eq-monster', name: 'Overpowered Ring', category: 'accessory', traits: [],
    stats: { attack: 99, defense: 99, specialAttack: 99, specialDefense: 99 },
  }
  const unitWithMonsterItem = makeUnit({ equipment: { armor: null, tool: null, accessory: 'eq-monster' } })

  it('attackSpeed is unaffected by any equipped item stats', () => {
    expect(getDerivedStats(unitWithMonsterItem, [MONSTER_ITEM]).attackSpeed).toBe(10)
  })

  it('accuracy is unaffected by any equipped item stats', () => {
    expect(getDerivedStats(unitWithMonsterItem, [MONSTER_ITEM]).accuracy).toBe(10)
  })

  it('dodge is unaffected by any equipped item stats', () => {
    expect(getDerivedStats(unitWithMonsterItem, [MONSTER_ITEM]).dodge).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// Skill edge cases not yet covered
// ---------------------------------------------------------------------------
describe('getDerivedStats — skill edge cases', () => {
  it('learnedSkills entry with level 0 contributes nothing', () => {
    const unit = makeUnit({ learnedSkills: { 'sword-mastery-1h': 0, 'arcane-knowledge': 0 } })
    expect(getDerivedStats(unit, [])).toEqual(getDerivedStats(makeUnit(), []))
  })

  it('eagle-eyes (agility boost lv2) propagates to attackSpeed, accuracy, and dodge only', () => {
    // eagle-eyes lv2: agi 5→7
    // attackSpeed = floor(7*2)          = 14
    // accuracy    = floor(5*1.5+7*0.5)  = floor(11) = 11
    // dodge       = floor(7*2+5*0.5)    = floor(16.5) = 16
    const unit = makeUnit({ learnedSkills: { 'eagle-eyes': 2 } })
    const stats = getDerivedStats(unit, [])
    expect(stats.attackSpeed).toBe(14)
    expect(stats.accuracy).toBe(11)
    expect(stats.dodge).toBe(16)
    // Should not alter ability-unrelated stats
    expect(stats.attack).toBe(10)
    expect(stats.defense).toBe(7)
    expect(stats.magicAttack).toBe(12)
    expect(stats.magicDefense).toBe(7)
  })

  it('skill at max level (10) applies full bonus: sword-mastery-1h lv10 → +30 ATK', () => {
    const unit = makeUnit({ learnedSkills: { 'sword-mastery-1h': 10 } })
    expect(getDerivedStats(unit, []).attack).toBe(40)  // 10 + 30
  })

  it('skill ability boost and equipment bonus both contribute to the same derived stat', () => {
    // arcane-knowledge lv1: int 5→6
    // magicAttack from abilities = floor(6*2 + 5*0.5) = floor(14.5) = 14
    // + wand specialAttack +4 → 18
    const WAND: EquipmentItem = { id: 'eq-wand2', name: 'Wand', category: 'weapon-1h', traits: [], stats: { specialAttack: 4 } }
    const unit = makeUnit({
      learnedSkills: { 'arcane-knowledge': 1 },
      weaponSets: [{ mainHand: 'eq-wand2', offHand: null }, { mainHand: null, offHand: null }],
    })
    expect(getDerivedStats(unit, [WAND]).magicAttack).toBe(18)
  })

  it('direct skill stat bonus and equipment stat bonus both contribute to the same derived stat', () => {
    // sword-mastery-1h lv2: +6 attack (direct)  +  iron sword: +4 attack (equipment) → 10+6+4=20
    const SWORD: EquipmentItem = { id: 'eq-sword-1h', name: 'Iron Sword', category: 'weapon-1h', traits: [], stats: { attack: 4 } }
    const unit = makeUnit({
      learnedSkills: { 'sword-mastery-1h': 2 },
      weaponSets: [{ mainHand: 'eq-sword-1h', offHand: null }, { mainHand: null, offHand: null }],
    })
    expect(getDerivedStats(unit, [SWORD]).attack).toBe(20)
  })
})
