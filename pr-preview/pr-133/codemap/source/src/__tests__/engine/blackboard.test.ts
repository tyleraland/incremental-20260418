// Team blackboard + per-unit debug trace. The blackboard is shared coordination
// state (one waypoint / focus per team), recomputed each round; the trace is an
// observational ring buffer of what each unit decided.
import { describe, expect, it } from 'vitest'
import { createBattle, advanceRound, distance, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('engine — team blackboard', () => {
  it('populates a plan per round; focus = lowest-HP visible enemy', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', team: 'player', visionRange: Infinity })],
      enemyUnits: [eu({ id: 'e1', team: 'enemy', hp: 50, maxHp: 50 }), eu({ id: 'e2', team: 'enemy', hp: 10, maxHp: 50 })],
      mode: 'open', cols: 40, rows: 40,
    })
    advanceRound(b)
    expect(b.plans.player).toBeDefined()
    expect(b.plans.player!.focusTargetId).toBe('e2')          // the wounded one
    expect(b.plans.player!.threat['e1']).toBeGreaterThanOrEqual(0)
  })

  it('focus ignores enemies outside the team\'s vision', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', team: 'player', visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 100, rows: 100,
    })
    find(b, 'p').pos = { x: 10, y: 10 }
    find(b, 'e').pos = { x: 80, y: 80 }   // far out of sight
    advanceRound(b)
    expect(b.plans.player!.focusTargetId).toBeNull()
  })

  it('the party shares one waypoint and roams together', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 10 }), eu({ id: 'bb', team: 'player', visionRange: 10 })],
      enemyUnits: [], mode: 'open', cols: 100, rows: 100,
    })
    find(b, 'a').pos = { x: 50, y: 50 }
    find(b, 'bb').pos = { x: 52, y: 50 }
    for (let i = 0; i < 40; i++) advanceRound(b)
    expect(b.plans.player!.waypoint).not.toBeNull()
    expect(distance(find(b, 'a').pos, find(b, 'bb').pos)).toBeLessThan(12)   // stayed a group
  })

  it('regroups the roamers on a fight: waypoint snaps to an engaged ally', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 999, hp: 999 })],
      mode: 'open', cols: 100, rows: 100,
    })
    find(b, 'a').pos = { x: 50, y: 50 }
    find(b, 'e').pos = { x: 53, y: 50 }   // within 'a''s vision → 'a' engages
    advanceRound(b)   // round 1: 'a' acquires the target
    advanceRound(b)   // round 2: planner now sees 'a' engaged
    const wp = b.plans.player!.waypoint!
    expect(distance(wp, find(b, 'a').pos)).toBeLessThan(5)   // waypoint is on the fight
  })
})

describe('engine — per-unit trace', () => {
  it('records a capped, readable trace of recent turns', () => {
    const b = createBattle({ playerUnits: [eu({ id: 'p', team: 'player', visionRange: 10 })], enemyUnits: [], mode: 'open', cols: 100, rows: 100 })
    for (let i = 0; i < 30; i++) advanceRound(b)
    const p = find(b, 'p')
    expect(p.trace.length).toBe(20)                              // ring-buffer cap
    expect(p.trace.every((e) => typeof e.text === 'string')).toBe(true)
    expect(p.trace.some((e) => e.text.includes('wander'))).toBe(true)
  })

  it('traces an attack against a target', () => {
    const b = createBattle({ playerUnits: [eu({ id: 'p', team: 'player', str: 5 })], enemyUnits: [eu({ id: 'e', team: 'enemy', name: 'Slime', maxHp: 999, hp: 999 })] })
    for (let i = 0; i < 6; i++) advanceRound(b)
    const p = find(b, 'p')
    expect(p.trace.some((e) => e.text.includes('Slime'))).toBe(true)
  })
})
