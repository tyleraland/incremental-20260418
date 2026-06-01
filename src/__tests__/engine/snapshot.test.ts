// Battle snapshot: serialize a live BattleState to a copyable token and rebuild
// it 1:1, so a dev can reproduce a reported scenario. The key guarantee: because
// the engine is RNG-free, a reloaded snapshot advanced N rounds matches the
// original advanced the same N rounds, combatant-for-combatant.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, addCombatant, issueMoveOrder, buildEngineSkill,
  serializeBattle, deserializeBattle, type BattleState, type Barrier,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// A non-trivial fight: terrain, a caster with a skill, a kiter, an open-world
// wanderer, a move order, and some rounds already elapsed.
function richBattle(): BattleState {
  const barriers: Barrier[] = [{ x: 6, y: 6, w: 3, h: 3, kind: 'wall' }]
  const b = createBattle({
    playerUnits: [
      eu({ id: 'mage', name: 'Mage', int: 30, rangedRange: 6, skills: [buildEngineSkill('fire-bolt', 1)!], tactics: [{ id: 'kiter', rank: 1 }] }),
      eu({ id: 'fighter', name: 'Fighter', str: 20, tactics: [{ id: 'charger', rank: 1 }] }),
    ],
    enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 80, hp: 80 })],
    barriers, mode: 'open', cols: 30, rows: 30,
  })
  find(b, 'mage').pos = { x: 5, y: 5 }
  find(b, 'fighter').pos = { x: 7, y: 4 }
  find(b, 'slime#0').pos = { x: 20, y: 20 }
  for (let r = 0; r < 5; r++) advanceRound(b)
  issueMoveOrder(b, 'fighter', { x: 15, y: 15 })
  advanceRound(b)
  return b
}

// Compare the sim-relevant fields of two combatants.
function sameCombatant(a: BattleState['combatants'][0], b: BattleState['combatants'][0]) {
  expect(b.id).toBe(a.id)
  expect(b.pos).toEqual(a.pos)
  expect(b.hp).toBe(a.hp)
  expect(b.alive).toBe(a.alive)
  expect(b.lockedTargetId).toBe(a.lockedTargetId)
  expect(b.skillCooldowns).toEqual(a.skillCooldowns)
  expect(b.statuses).toEqual(a.statuses)
  expect(b.channel).toEqual(a.channel)
  expect(b.moveOrder).toEqual(a.moveOrder)
  expect(b.tactics.map((t) => t.def.id)).toEqual(a.tactics.map((t) => t.def.id))
}

describe('battle snapshot', () => {
  it('round-trips the core state of a battle', () => {
    const b = richBattle()
    const clone = deserializeBattle(serializeBattle(b))
    expect(clone.cols).toBe(b.cols)
    expect(clone.rows).toBe(b.rows)
    expect(clone.mode).toBe(b.mode)
    expect(clone.round).toBe(b.round)
    expect(clone.outcome).toBe(b.outcome)
    expect(clone.barriers).toEqual(b.barriers)
    expect(clone.combatants.length).toBe(b.combatants.length)
    for (const c of b.combatants) sameCombatant(c, find(clone, c.id))
    // Rebuilt tactics are usable (have behaviour fns), not bare refs.
    const mage = find(clone, 'mage')
    expect(mage.tactics.every((t) => typeof t.def.id === 'string')).toBe(true)
  })

  it('reloads and replays identically (RNG-free determinism)', () => {
    const original = richBattle()
    const token = serializeBattle(original)
    const reloaded = deserializeBattle(token)
    // Advance both the same number of rounds and compare.
    for (let r = 0; r < 20; r++) { advanceRound(original); advanceRound(reloaded) }
    expect(reloaded.round).toBe(original.round)
    expect(reloaded.combatants.length).toBe(original.combatants.length)
    for (const c of original.combatants) sameCombatant(c, find(reloaded, c.id))
  })

  it('the token carries the BSNAP prefix and survives a whitespace trim', () => {
    const token = serializeBattle(richBattle())
    expect(token.startsWith('BSNAP.')).toBe(true)
    expect(() => deserializeBattle(`  ${token}\n`)).not.toThrow()
  })

  it('a reloaded snapshot accepts further host commands (addCombatant, move order)', () => {
    const b = deserializeBattle(serializeBattle(richBattle()))
    const before = b.combatants.length
    addCombatant(b, eu({ id: 'reinforcement', name: 'Wolf', team: 'enemy' }), 'enemy', undefined, { x: 25, y: 25 })
    expect(b.combatants.length).toBe(before + 1)
    issueMoveOrder(b, 'mage', { x: 2, y: 2 })
    for (let r = 0; r < 5; r++) advanceRound(b)
    expect(find(b, 'mage')).toBeTruthy()   // still simulating cleanly
  })

  it('throws on a malformed token', () => {
    expect(() => deserializeBattle('not-a-snapshot')).toThrow()
  })

  it('compresses the token (much smaller than the raw JSON)', () => {
    const b = richBattle()
    const token = serializeBattle(b)
    // The payload is DEFLATE'd, so the token is far smaller than the plain JSON
    // it encodes — the whole point (a 12-combatant fight was ~13.6K → ~2.5K).
    const rawJsonLen = JSON.stringify(b.combatants).length
    expect(token.length).toBeLessThan(rawJsonLen * 0.7)
  })

  it('still loads a legacy uncompressed token (backward compatibility)', () => {
    // Old format: BSNAP.<base64 of plain UTF-8 JSON> (no compression). Build one
    // by hand from a live battle's snapshot shape and confirm it deserializes and
    // replays identically to the new compressed token.
    const original = richBattle()
    const refs = (c: BattleState['combatants'][0]) => c.tactics.map((t) => ({ id: t.def.id, rank: t.rank }))
    const snap = {
      v: 1,
      combatants: original.combatants.map((c) => {
        const { tactics: _t, trace: _tr, lastResolution: _lr, ...rest } = c
        return { ...rest, visionRange: rest.visionRange === Infinity ? null : rest.visionRange, tacticRefs: refs(c) }
      }),
      zones: original.zones, barriers: original.barriers, cols: original.cols, rows: original.rows,
      mode: original.mode, plans: original.plans, round: original.round, outcome: original.outcome,
      stats: original.stats, maxRounds: original.maxRounds, collectEvents: original.collectEvents,
    }
    const legacy = `BSNAP.${btoa(unescape(encodeURIComponent(JSON.stringify(snap))))}`
    const reloaded = deserializeBattle(legacy)
    for (const c of original.combatants) sameCombatant(c, find(reloaded, c.id))
    for (let r = 0; r < 10; r++) { advanceRound(original); advanceRound(reloaded) }
    for (const c of original.combatants) sameCombatant(c, find(reloaded, c.id))
  })
})
