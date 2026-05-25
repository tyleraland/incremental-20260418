// Elemental attack/armor system (spec §3): the attack element vs the target's
// (possibly status-overridden) armor element scales damage, with immunity and
// the Frozen→water combo interactions.
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
  it('matches the table (effective / resisted / immune / neutral)', () => {
    expect(elementMultiplier('fire', 'water')).toBe(2)
    expect(elementMultiplier('water', 'water')).toBeCloseTo(0.33)
    expect(elementMultiplier('neutral', 'ghost')).toBe(0)
    expect(elementMultiplier('fire', 'neutral')).toBe(1)
  })
})

describe('elements in combat', () => {
  const fireBoltVs = (armor: Element): number => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [buildEngineSkill('fire-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, armorElement: armor, maxHp: 500, hp: 500, meleeRange: 1.2 })],
    })
    advanceRound(b)
    return skillValue(b, 'fire-bolt')
  }

  it('attack element vs armor element scales damage (fire 2× vs water)', () => {
    expect(fireBoltVs('water')).toBe(fireBoltVs('neutral') * 2)
  })

  it('matching element is resisted (water vs water)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [buildEngineSkill('frost-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, armorElement: 'water', maxHp: 500, hp: 500, meleeRange: 1.2 })],
    })
    advanceRound(b)
    expect(skillValue(b, 'frost-bolt')).toBeLessThan(20)   // ~0.33 × 20
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

describe('Frozen acts as water armor (§3 combo)', () => {
  const lightningVs = (frozen: boolean): number => {
    const lb = { ...buildEngineSkill('lightning-bolt', 1)!, channelTime: 0 }   // instant for the assertion
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [lb] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    if (frozen) find(b, 'foe').statuses.push(buildStatus('frozen', 'x')!)
    advanceRound(b)
    return skillValue(b, 'lightning-bolt')
  }

  it('Lightning shatters a frozen target for 2×', () => {
    expect(lightningVs(true)).toBe(lightningVs(false) * 2)
  })

  it('Fire melts a frozen target (clears the status)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [buildEngineSkill('fire-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'foe').statuses.push(buildStatus('frozen', 'x')!)
    advanceRound(b)
    expect(find(b, 'foe').statuses.some((s) => s.id === 'frozen')).toBe(false)
  })
})
