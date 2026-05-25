// Combat skill casting (spec §4): instant casts, channeled casts + disruption,
// radius AoE, heals/buffs, stun, and the "equip = learn to use it" adapter path.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, buildStatus, COMBAT_SKILLS,
  unitToEngineInput, type BattleState,
} from '@/engine'
import { getDerivedStats } from '@/lib/stats'
import { eu } from './helpers'
import { makeUnit } from '../helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const hasEvent = (b: BattleState, pred: (e: BattleState['events'][number]) => boolean) => b.events.some(pred)

describe('catalog', () => {
  it('scales power with level and keeps ids aligned with the game', () => {
    expect(buildEngineSkill('fire-bolt', 1)!.damageFormula).toBe('int * 1.00')
    expect(buildEngineSkill('fire-bolt', 3)!.damageFormula).toBe('int * 1.40')
    expect(buildEngineSkill('lightning-bolt', 1)!.channelTime).toBe(1)
    expect(buildEngineSkill('hammer-fall', 1)!.statusApplied).toBe('stunned')
    expect(buildEngineSkill('arrow-shower', 1)!.knockback).toBeGreaterThan(0)
    expect(buildEngineSkill('firewall', 1)!.zone?.duration).toBeGreaterThan(0)
    expect(buildEngineSkill('poison', 1)!.statusApplied).toBe('poisoned')
    expect(buildEngineSkill('ankle-snare', 1)!.retreatAfter).toBeGreaterThan(0)
    expect(buildEngineSkill('nope', 1)).toBeNull()
  })
})

describe('instant casts', () => {
  it('Fire Bolt damages an enemy in range', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 5, skills: [buildEngineSkill('fire-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, maxHp: 100, hp: 100 })],
    })
    advanceRound(b)
    expect(hasEvent(b, (e) => e.type === 'skill_use' && e.skillId === 'fire-bolt' && (e.value ?? 0) > 0)).toBe(true)
    expect(find(b, 'foe').hp).toBeLessThan(100)
  })

  it('Heal restores the most-injured ally', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'cleric', int: 20, skills: [buildEngineSkill('heal', 1)!] }), eu({ id: 'ally', hp: 10, maxHp: 100 })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 0 })],
    })
    advanceRound(b)
    expect(find(b, 'ally').hp).toBeGreaterThan(10)
    expect(hasEvent(b, (e) => e.type === 'heal' && e.targetId === 'ally')).toBe(true)
  })

  it('Boost Agility buffs the caster (SPD up)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', skills: [buildEngineSkill('boost-agility', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 0 })],
    })
    advanceRound(b)
    expect(find(b, 'hero').statuses.some((s) => s.id === 'agi-up')).toBe(true)
  })
})

describe('channeled casts', () => {
  it('Lightning Bolt resolves a round after it starts', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, maxHp: 300, hp: 300, skills: [buildEngineSkill('lightning-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, str: 0, maxHp: 300, hp: 300, meleeRange: 1.2 })],
    })
    advanceRound(b)   // start the channel
    expect(hasEvent(b, (e) => e.type === 'cast_start' && e.skillId === 'lightning-bolt')).toBe(true)
    advanceRound(b)   // resolve it
    expect(hasEvent(b, (e) => e.type === 'skill_use' && e.skillId === 'lightning-bolt' && (e.value ?? 0) > 0)).toBe(true)
  })

  it('a hit during the cast disrupts it (no resolve)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, spd: 1, maxHp: 999, hp: 999, skills: [buildEngineSkill('lightning-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 20, spd: 100, meleeRange: 6, maxHp: 999, hp: 999 })],
    })
    advanceRound(b)   // mage starts channel; fast foe is already striking it
    advanceRound(b)   // foe (acts first) hits the channeling mage → interrupt
    expect(hasEvent(b, (e) => e.type === 'interrupt' && e.targetId === 'mage')).toBe(true)
    expect(hasEvent(b, (e) => e.type === 'skill_use' && e.skillId === 'lightning-bolt' && (e.value ?? 0) > 0)).toBe(false)
  })
})

describe('area + control', () => {
  it('Hammer Fall hits a cluster and stuns them', () => {
    const hf = { ...buildEngineSkill('hammer-fall', 1)!, range: 99 }   // skip the walk-in for the assertion
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 30, skills: [hf] })],
      enemyUnits: [
        eu({ id: 'e0', team: 'enemy', def: 0, maxHp: 100, hp: 100 }),
        eu({ id: 'e1', team: 'enemy', def: 0, maxHp: 100, hp: 100 }),
      ],
    })
    advanceRound(b)
    for (const id of ['e0', 'e1']) {
      expect(find(b, id).hp).toBeLessThan(100)
      expect(find(b, id).statuses.some((s) => s.id === 'stunned')).toBe(true)
    }
  })

  it('Sanctuary heals all nearby allies', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'cleric', int: 20, skills: [buildEngineSkill('aoe-heal', 1)!] }),
        eu({ id: 'a1', hp: 10, maxHp: 100 }),
        eu({ id: 'a2', hp: 20, maxHp: 100 }),
      ],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 0 })],
    })
    advanceRound(b)
    expect(find(b, 'a1').hp).toBeGreaterThan(10)
    expect(find(b, 'a2').hp).toBeGreaterThan(20)
  })

  it('a stunned unit loses its turn, and the stun is consumed', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 20, meleeRange: 10 })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 5, meleeRange: 10, maxHp: 100, hp: 100 })],
    })
    find(b, 'hero').statuses.push(buildStatus('stunned', 'foe')!)
    advanceRound(b)
    expect(hasEvent(b, (e) => e.type === 'melee_attack' && e.sourceId === 'hero')).toBe(false)
    expect(find(b, 'hero').statuses.some((s) => s.id === 'stunned')).toBe(false)
  })
})

describe('phase 2: spatial', () => {
  it('poison deals damage over time', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 0 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 100, hp: 100, meleeRange: 1.2 })],
    })
    find(b, 'e').statuses.push(buildStatus('poisoned', 'p')!)
    advanceRound(b)
    expect(find(b, 'e').hp).toBeLessThan(100)
    expect(hasEvent(b, (e) => e.type === 'dot' && e.targetId === 'e')).toBe(true)
  })

  it('Arrow Shower damages and knocks an enemy back', () => {
    const as = { ...buildEngineSkill('arrow-shower', 1)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 20, skills: [as] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, maxHp: 100, hp: 100 })],
    })
    const beforeY = find(b, 'e').pos.y
    advanceRound(b)
    expect(find(b, 'e').pos.y).toBeGreaterThan(beforeY)   // shoved toward its own edge
    expect(find(b, 'e').hp).toBeLessThan(100)
    expect(hasEvent(b, (e) => e.type === 'knockback' && e.targetId === 'e')).toBe(true)
  })

  it('Firewall drops a hazard that burns enemies standing in it', () => {
    const fw = { ...buildEngineSkill('firewall', 1)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'p', skills: [fw] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 200, hp: 200, meleeRange: 1.2 })],
    })
    advanceRound(b)
    expect(b.zones).toHaveLength(1)
    const hp = find(b, 'e').hp
    advanceRound(b)
    expect(hasEvent(b, (e) => e.type === 'dot' && e.targetId === 'e')).toBe(true)
    expect(find(b, 'e').hp).toBeLessThan(hp)
  })

  it('Ankle Snare roots the target and the caster retreats', () => {
    const snare = { ...buildEngineSkill('ankle-snare', 1)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'p', skills: [snare] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 100, hp: 100, meleeRange: 1.2 })],
    })
    const startY = find(b, 'p').pos.y
    advanceRound(b)
    expect(find(b, 'e').statuses.some((s) => s.id === 'rooted')).toBe(true)
    expect(find(b, 'p').pos.y).toBeLessThan(startY)   // net backward despite advancing first
  })

  it('a rooted unit cannot move', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', meleeRange: 1.2 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', meleeRange: 1.2 })],
    })
    find(b, 'p').statuses.push(buildStatus('rooted', 'x')!)
    advanceRound(b)
    expect(hasEvent(b, (e) => e.type === 'move' && e.sourceId === 'p')).toBe(false)
  })
})

describe('equip = learn to use it (adapter)', () => {
  it('maps action-bar skills into engine skills at their learned level', () => {
    const unit = makeUnit({
      learnedSkills: { 'fire-bolt': 2 },
      actionSlots: [
        { kind: 'skill', id: 'fire-bolt' },
        { kind: 'item', id: 'eq-knife' },   // items are ignored
        { kind: 'skill', id: 'not-a-combat-skill' },
        null, null, null,
      ],
    })
    const e = unitToEngineInput(unit, getDerivedStats(unit, []), 'player')
    expect(e.skills.map((s) => s.id)).toEqual(['fire-bolt'])
    expect(e.skills[0].damageFormula).toBe(COMBAT_SKILLS['fire-bolt'](2).damageFormula)
  })
})
