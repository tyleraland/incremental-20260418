import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, resolve, MAX_ROUNDS } from '@/engine'
import { eu, attackSkill, healSkill } from './helpers'

describe('engine: outcomes (§9)', () => {
  it('a lone fighter walks in and wins', () => {
    const r = resolve({
      playerUnits: [eu({ id: 'p', str: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 1, maxHp: 20, hp: 20 })],
    })
    expect(r.outcome).toBe('victory')
    expect(r.rounds).toBeGreaterThan(1)              // had to close the distance first
    expect(r.units.find((u) => u.id === 'e')!.alive).toBe(false)
    expect(r.events.some((ev) => ev.type === 'move')).toBe(true)
    expect(r.events.some((ev) => ev.type === 'melee_attack')).toBe(true)
  })

  it('reports defeat when the player team is wiped', () => {
    const r = resolve({
      playerUnits: [eu({ id: 'p', str: 1, maxHp: 20, hp: 20 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 30 })],
    })
    expect(r.outcome).toBe('defeat')
  })

  it('draws at the round cap when neither side can kill the other', () => {
    // Huge DEF on both sides → damage floored to 1/round, 50 HP each → never
    // resolves before the cap. meleeRange 10 puts them in reach from round 1.
    const tank = (id: string, team: 'player' | 'enemy') =>
      eu({ id, team, str: 5, def: 1000, maxHp: 200, hp: 200, meleeRange: 30 })
    const r = resolve({
      playerUnits: [tank('p', 'player')],
      enemyUnits: [tank('e', 'enemy')],
    })
    expect(r.outcome).toBe('draw')
    expect(r.rounds).toBe(MAX_ROUNDS)
  })
})

describe('engine: turn order (§10)', () => {
  it('a faster unit kills a slower one before it can act', () => {
    // Both in reach from round 1 (meleeRange 10). Player is faster and one-shots.
    const r = resolve({
      playerUnits: [eu({ id: 'p', spd: 20, str: 100, meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', spd: 1, str: 100, maxHp: 30, hp: 30, meleeRange: 30 })],
    })
    expect(r.outcome).toBe('victory')
    expect(r.rounds).toBe(1)
    expect(r.units.find((u) => u.id === 'p')!.hp).toBe(50) // never took a hit
  })
})

describe('engine: determinism (§11.3, §16.1)', () => {
  it('identical inputs produce identical results', () => {
    const setup = () => ({
      playerUnits: [
        eu({ id: 'p1', str: 14, spd: 12, skills: [attackSkill()] }),
        eu({ id: 'p2', str: 9, spd: 8, preferredRank: 'back', meleeRange: 1.2, rangedRange: 4 }),
      ],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 11, spd: 10 }),
        eu({ id: 'e2', team: 'enemy', str: 7, spd: 6, maxHp: 40, hp: 40 }),
      ],
    })
    const a = resolve(setup())
    const b = resolve(setup())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('engine: invariants (§16.5)', () => {
  it('never mutates the input units', () => {
    const player = eu({ id: 'p', str: 30 })
    const enemy = eu({ id: 'e', team: 'enemy', str: 1, maxHp: 20, hp: 20, skills: [attackSkill()] })
    const before = JSON.stringify({ player, enemy })
    resolve({ playerUnits: [player], enemyUnits: [enemy] })
    expect(JSON.stringify({ player, enemy })).toBe(before)
  })

  it('advanceRound is a no-op once the battle is decided', () => {
    const state = createBattle({
      playerUnits: [eu({ id: 'p', spd: 20, str: 100, meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', spd: 1, maxHp: 10, hp: 10, meleeRange: 30 })],
    })
    advanceRound(state)
    expect(state.outcome).toBe('victory')
    const roundAfterWin = state.round
    advanceRound(state)
    expect(state.round).toBe(roundAfterWin)
  })
})

describe('engine: naive heal behavior (§4.1)', () => {
  it('a healer mends the most-injured ally instead of attacking', () => {
    const state = createBattle({
      playerUnits: [
        eu({ id: 'medic', int: 10, str: 1, skills: [healSkill({ healFormula: 'int * 2' })] }),
        eu({ id: 'hurt', hp: 10, maxHp: 50 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 1, def: 1000, maxHp: 200, hp: 200 })],
    })
    advanceRound(state)
    const hurt = state.combatants.find((c) => c.id === 'hurt')!
    expect(hurt.hp).toBe(30) // 10 + floor(10*2)
    expect(state.stats.totalHealingByUnit['medic']).toBe(20)
  })
})

describe('engine: caster behavior', () => {
  it('a caster (int > str) doesn’t basic-attack while spells are on cooldown', () => {
    // High-int / low-str unit with an exhausted attack-skill. With no skill
    // ready and no melee reach, a non-caster would fall back to a weak basic
    // ranged shot; a caster waits.
    const state = createBattle({
      playerUnits: [eu({
        id: 'mage', str: 1, int: 20, rangedRange: 4, meleeRange: 1.2,
        skills: [attackSkill({ id: 'sk', range: 6, cooldown: 5 })],
      })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, maxHp: 999, hp: 999, meleeRange: 30 })],
    })
    state.combatants.find((c) => c.id === 'mage')!.pos = { x: 2.5, y: 5 }
    state.combatants.find((c) => c.id === 'e')!.pos    = { x: 2.5, y: 7.5 }   // in skill range, in basic range
    state.combatants.find((c) => c.id === 'mage')!.skillCooldowns['sk'] = 3   // skill on cooldown
    advanceRound(state)
    // No basic ranged attack should have been emitted.
    expect(state.events.some((e) => e.type === 'ranged_attack' && e.sourceId === 'mage')).toBe(false)
  })
})
