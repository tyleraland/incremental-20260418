// Elemental attack/armor system (spec §3): the 4-element wheel scales damage,
// melee is mitigated by physical defense and spells by magic defense, the
// Frozen→water combo still works, and DoT runs through the matrix too.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, buildStatus, elementMultiplier,
  type BattleState, type Element,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const skillValue = (b: BattleState, id: string) =>
  b.events.find((e) => e.type === 'skill_use' && e.skillId === id)!.value!

describe('element matrix', () => {
  it('matches the wheel (1.5× beats / 0.75× beaten / 0.25× self / 1× opposite)', () => {
    expect(elementMultiplier('fire', 'earth')).toBe(1.5)
    expect(elementMultiplier('fire', 'water')).toBe(0.75)
    expect(elementMultiplier('water', 'water')).toBe(0.25)
    expect(elementMultiplier('fire', 'wind')).toBe(1)
    expect(elementMultiplier('neutral', 'ghost')).toBe(0)
  })
})

describe('elements in combat', () => {
  const fireBoltVs = (armor: Element): number => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 30, rangedRange: 6, skills: [{ ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, armorElement: armor, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'mage').pos = { x: 2.5, y: 6 }; find(b, 'foe').pos = { x: 2.5, y: 9 }
    advanceRound(b)
    return skillValue(b, 'fire-bolt')
  }

  it('fire is strong vs earth (1.5×), weak vs water (0.75×), weakest vs fire (0.25×)', () => {
    const neutral = fireBoltVs('neutral')
    expect(fireBoltVs('earth')).toBeGreaterThan(neutral)
    expect(fireBoltVs('water')).toBeLessThan(neutral)
    expect(fireBoltVs('fire')).toBeLessThan(fireBoltVs('water'))
  })

  it('tags each damage event with its element multiplier (the UI effectiveness clue)', () => {
    const effOf = (armor: Element) => {
      const b = createBattle({
        playerUnits: [eu({ id: 'mage', int: 30, rangedRange: 6, skills: [{ ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }] })],
        enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, armorElement: armor, maxHp: 999, hp: 999, meleeRange: 1.2 })],
      })
      find(b, 'mage').pos = { x: 2.5, y: 6 }; find(b, 'foe').pos = { x: 2.5, y: 9 }
      advanceRound(b)
      return b.events.find((e) => e.type === 'skill_use' && e.skillId === 'fire-bolt')!.eff
    }
    expect(effOf('earth')).toBe(1.5)    // super-effective → UI shows "!!"
    expect(effOf('fire')).toBe(0.25)    // resisted → dimmed
    expect(effOf('wind')).toBe(1)       // neutral
  })

  it('a neutral attack cannot hurt a ghost (immunity = 0)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 30, meleeRange: 99 })],
      enemyUnits: [eu({ id: 'g', team: 'enemy', def: 0, armorElement: 'ghost', maxHp: 100, hp: 100 })],
    })
    advanceRound(b)
    expect(find(b, 'g').hp).toBe(100)
  })
})

describe('physical vs magic mitigation', () => {
  const spellDmg = (magicDef: number, def: number): number => {
    const b = createBattle({
      playerUnits: [eu({ id: 'm', int: 30, rangedRange: 6, skills: [{ ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def, magicDef, str: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'm').pos = { x: 2.5, y: 6 }; find(b, 'foe').pos = { x: 2.5, y: 9 }
    advanceRound(b)
    return skillValue(b, 'fire-bolt')
  }
  const meleeDmg = (magicDef: number, def: number): number => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 40, meleeRange: 2 })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def, magicDef, str: 0, maxHp: 999, hp: 999, meleeRange: 1.2, moveSpeed: 0 })],
    })
    find(b, 'p').pos = { x: 2.5, y: 6 }; find(b, 'foe').pos = { x: 2.5, y: 6.8 }
    advanceRound(b)
    return 999 - find(b, 'foe').hp
  }

  it('a spell is softened by magic defense, not physical defense', () => {
    expect(spellDmg(40, 0)).toBeLessThan(spellDmg(0, 0))   // magic def reduces a spell
    expect(spellDmg(0, 40)).toBe(spellDmg(0, 0))           // physical def is irrelevant to a spell
  })
  it('a melee hit is softened by physical defense, not magic defense', () => {
    expect(meleeDmg(0, 40)).toBeLessThan(meleeDmg(0, 0))   // physical def reduces melee
    expect(meleeDmg(40, 0)).toBe(meleeDmg(0, 0))           // magic def is irrelevant to melee
  })
})

describe('Frozen acts as water armor (§3 combo)', () => {
  const windVs = (frozen: boolean): number => {
    const lb = { ...buildEngineSkill('lightning-bolt', 1)!, channelTime: 0 }   // wind element, instant for the assertion
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [lb] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, magicDef: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'mage').pos = { x: 2.5, y: 6 }; find(b, 'foe').pos = { x: 2.5, y: 9 }
    if (frozen) find(b, 'foe').statuses.push(buildStatus('frozen', 'x')!)
    advanceRound(b)
    return skillValue(b, 'lightning-bolt')
  }

  it('Wind shatters a frozen target (frozen → water armor, wind 1.5× vs water)', () => {
    expect(windVs(true)).toBeGreaterThan(windVs(false))
  })

  it('Fire melts a frozen target (clears the status)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [{ ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'mage').pos = { x: 2.5, y: 6 }; find(b, 'foe').pos = { x: 2.5, y: 9 }
    find(b, 'foe').statuses.push(buildStatus('frozen', 'x')!)
    advanceRound(b)
    expect(find(b, 'foe').statuses.some((s) => s.id === 'frozen')).toBe(false)
  })
})

describe('DoT runs through the element matrix (no longer bypasses it)', () => {
  const poisonTick = (armor: Element): number => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', moveSpeed: 0 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', armorElement: armor, maxHp: 200, hp: 200, moveSpeed: 0, meleeRange: 1.2 })],
    })
    find(b, 'p').pos = { x: 1, y: 1 }; find(b, 'e').pos = { x: 13, y: 13 }   // never engage — isolate the DoT
    find(b, 'e').statuses.push(buildStatus('poisoned', 'x')!)
    const hp0 = find(b, 'e').hp
    advanceRound(b)
    return hp0 - find(b, 'e').hp
  }
  it('poison is nullified vs undead but ticks normally vs others', () => {
    expect(poisonTick('undead')).toBe(0)             // poison → undead = 0 (immune)
    expect(poisonTick('neutral')).toBeGreaterThan(0) // normal poison tick
  })
})
