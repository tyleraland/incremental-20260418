// M2 of movement-action-coupling.md: forecastAction (castable-NOW through the
// live action channel's own gates) + scoreCandidate (joint position/action
// value), and the kiter wiring that replaced the sweet-spot / aimOutOfRange /
// close / corner special cases with one scored choice.
import { describe, it, expect } from 'vitest'
import {
  forecastAction, scoreCandidate, createBattle, advanceRound, distance,
  type BattleState, type Combatant, type Barrier,
} from '@/engine'
import { combatant, attackSkill, eu } from './helpers'

const stateOf = (combatants: Combatant[], barriers: Barrier[] = []) =>
  ({ combatants, barriers } as unknown as BattleState)
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('forecastAction — castable-now from a hypothetical spot', () => {
  const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })

  it('answers option/score by what actually fires from `at`', () => {
    const mage = combatant({ id: 'm', int: 20, str: 2, skills: [{ ...bolt }] })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 12 } })
    const st = stateOf([mage, foe])
    const here = forecastAction(st, mage, mage.pos)              // 12 away — out of range
    expect(here.option).toBeNull()
    expect(here.score).toBe(0)
    const there = forecastAction(st, mage, { x: 0.5, y: 7 })     // 5 away — castable
    expect(there.option?.skill?.id).toBe('bolt')
    expect(there.option?.targetId).toBe('e')
    expect(there.score).toBeGreaterThan(0)
  })

  it('runs the same cooldown gate as the action channel', () => {
    const mage = combatant({ id: 'm', int: 20, str: 2, pos: { x: 0.5, y: 2 }, skills: [{ ...bolt }], skillCooldowns: { bolt: 3 } })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 6 } })
    expect(forecastAction(stateOf([mage, foe]), mage).option).toBeNull()
  })

  it('offers the basic attack to non-casters, LoS-gated', () => {
    const wall: Barrier = { x: 0, y: 4, w: 3, h: 1, kind: 'wall' }
    const archer = combatant({ id: 'a', str: 10, int: 0, rangedRange: 5, pos: { x: 1, y: 1 }, lockedTargetId: 'e' })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 1, y: 7 } })
    const st = stateOf([archer, foe], [wall])
    expect(forecastAction(st, archer).option).toBeNull()                        // wall blocks the shot
    const clear = forecastAction(st, archer, { x: 6, y: 7 })                    // flank spot, clear line
    expect(clear.option).toEqual({ skill: null, targetId: 'e' })
    expect(clear.losClear).toBe(true)
  })
})

describe('scoreCandidate — joint (position, action) value', () => {
  it('a spot that can cast beats a spot that idles', () => {
    const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })
    const mage = combatant({ id: 'm', int: 20, str: 2, pos: { x: 0.5, y: 0 }, skills: [bolt], lockedTargetId: 'e' })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 12 } })
    const st = stateOf([mage, foe])
    const idle = scoreCandidate(st, mage, { pos: { x: 0.5, y: 2 }, kind: 'hold' }, foe, 5.5)
    const firing = scoreCandidate(st, mage, { pos: { x: 0.5, y: 6.5 }, kind: 'close' }, foe, 5.5)
    expect(firing).toBeGreaterThan(idle)
  })

  it('between two firing spots, exposure to a second enemy breaks the tie', () => {
    const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })
    const mage = combatant({ id: 'm', int: 20, str: 2, pos: { x: 10, y: 10 }, skills: [bolt], lockedTargetId: 'e' })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 10, y: 16 }, moveSpeed: 0 })
    // A flanking shooter whose reach covers only the LEFT of the two spots.
    const flanker = combatant({ id: 'f', team: 'enemy', str: 20, rangedRange: 4, moveSpeed: 0, pos: { x: 4, y: 11 } })
    const st = stateOf([mage, foe, flanker])
    const exposed = scoreCandidate(st, mage, { pos: { x: 7, y: 11 }, kind: 'close' }, foe, 5.5)   // in flanker reach
    const safe = scoreCandidate(st, mage, { pos: { x: 13, y: 11 }, kind: 'close' }, foe, 5.5)     // out of it
    expect(safe).toBeGreaterThan(exposed)
  })
})

describe('kiter candidate wiring — the stranding class', () => {
  it('holds and shoots its castable lock instead of corner-routing toward a walled-off nearer foe', () => {
    // Old behavior: the sweet-spot check demanded LoS to the NEAREST enemy, so a
    // nearer foe behind a wall dragged the kiter into corner-routing toward it —
    // abandoning a lock it could shoot from where it stood.
    const wall: Barrier = { x: 2, y: 11, w: 6, h: 2, kind: 'wall' }
    const b = createBattle({
      playerUnits: [eu({
        id: 'mage', int: 20, str: 2, rangedRange: 6, maxHp: 400, hp: 400,
        skills: [attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })],
        tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [
        eu({ id: 'prey', team: 'enemy', maxHp: 300, hp: 300, moveSpeed: 0, str: 1 }),
        eu({ id: 'walled', team: 'enemy', maxHp: 300, hp: 300, moveSpeed: 0, str: 1 }),
      ],
      barriers: [wall], mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'mage').pos = { x: 5, y: 8 }
    find(b, 'prey').pos = { x: 5, y: 2.3 }      // clear shot, ~5.7 away — castable, inside the dead-band
    find(b, 'walled').pos = { x: 5, y: 13 }     // the NEAREST foe (5 away) — but behind the wall
    find(b, 'mage').lockedTargetId = 'prey'
    find(b, 'mage').threat = { prey: 50 }       // hysteresis keeps the lock on prey
    const start = { ...find(b, 'mage').pos }
    for (let r = 0; r < 12; r++) advanceRound(b)   // short of killing the prey (then re-targeting 'walled' correctly moves it)
    expect(find(b, 'prey').hp).toBeLessThan(300)                          // it fought its lock
    expect(distance(find(b, 'mage').pos, start)).toBeLessThan(1)          // and held — no wall-hugging detour toward 'walled'
    // §debug: the committed plan decision is on the trace (doc §5).
    expect(find(b, 'mage').trace.some((t) => t.text.includes('kite: hold'))).toBe(true)
  })
})
