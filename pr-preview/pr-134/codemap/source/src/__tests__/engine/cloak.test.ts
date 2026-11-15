// Cloak — the stealthy-ambush skill (spec §3). Invisible for ~10s (≈25 rounds)
// or until the bearer deals/takes damage; movement slows to 75% while hidden;
// and it can only be cast from the ambush window: not engaged (no damage given/
// taken for 5 rounds), no foe within 6 cells, and a foe in sight worth stalking.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, buildStatus, moveSpeedOf,
  type BattleState,
} from '@/engine'
import { eu, combatant } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const stealthed = (b: BattleState, id: string) => find(b, id).statuses.some((s) => s.id === 'stealthed')

// A rogue that only knows Cloak, standing a clear >6 from a single inert foe.
function ambushSetup(roguePos = { x: 7, y: 2 }, foePos = { x: 7, y: 13 }): BattleState {
  const b = createBattle({
    playerUnits: [eu({ id: 'r', skills: [buildEngineSkill('cloak', 1)!], moveSpeed: 0 })],
    enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, moveSpeed: 0 })],
  })
  find(b, 'r').pos = roguePos
  find(b, 'e').pos = foePos
  return b
}

describe('Cloak — duration (~10s)', () => {
  it('the stealthed status lasts ≈25 rounds (10s at 2.5 rounds/s)', () => {
    expect(buildStatus('stealthed', 'x')!.duration).toBe(25)
  })

  it('stays hidden across many undisturbed rounds after the ambush cast', () => {
    const b = ambushSetup()
    advanceRound(b)
    expect(stealthed(b, 'r')).toBe(true)
    for (let i = 0; i < 10; i++) advanceRound(b)   // no damage exchanged (str 0, can't see the rogue)
    expect(stealthed(b, 'r')).toBe(true)
  })
})

describe('Cloak — 75% movement while hidden', () => {
  it('moveSpeedOf multiplies a cloaked unit to 0.75×', () => {
    const c = combatant({ moveSpeed: 1.2 })
    expect(moveSpeedOf(c)).toBeCloseTo(1.2)
    c.statuses.push(buildStatus('stealthed', 'c')!)
    expect(moveSpeedOf(c)).toBeCloseTo(0.9)   // 1.2 × 0.75
  })
})

describe('Cloak — ambush-window cast gate', () => {
  it('casts when a foe is in sight but >6 away and the rogue is calm', () => {
    const b = ambushSetup()   // distance 11
    advanceRound(b)
    expect(stealthed(b, 'r')).toBe(true)
  })

  it('does not cast with a foe within 6 (too close to slip away)', () => {
    const b = ambushSetup({ x: 7, y: 7 }, { x: 7, y: 11 })   // distance 4
    advanceRound(b)
    expect(stealthed(b, 'r')).toBe(false)
  })

  it('does not cast while recently in combat, then cloaks once calm', () => {
    const b = ambushSetup()   // distance 11, foe in sight
    find(b, 'r').lastDamageRound = 0   // pretend it traded blows at round 0
    advanceRound(b)                    // round 1: 1 - 0 = 1 < 5 → still "engaged"
    expect(stealthed(b, 'r')).toBe(false)
    for (let i = 0; i < 5; i++) advanceRound(b)   // let the calm window pass
    expect(stealthed(b, 'r')).toBe(true)
  })

  it('does not cast with no enemy in sight (open world), cloaks once one is spotted', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'r', skills: [buildEngineSkill('cloak', 1)!], moveSpeed: 0, visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, moveSpeed: 0 })],
      mode: 'open', cols: 100, rows: 100,
    })
    find(b, 'r').pos = { x: 10, y: 10 }
    find(b, 'e').pos = { x: 90, y: 90 }   // ~113 away, out of sight (vision 10)
    advanceRound(b)
    expect(stealthed(b, 'r')).toBe(false)   // nothing around → no reason to cloak

    find(b, 'e').pos = { x: 18, y: 10 }     // now dist 8: in sight (≤10) and >6
    advanceRound(b)
    expect(stealthed(b, 'r')).toBe(true)
  })
})

describe('Cloak — broken by combat', () => {
  it('dealing damage drops the cloak (ambush strike reveals)', () => {
    const bs = { ...buildEngineSkill('back-stab', 1)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'r', str: 20, skills: [bs] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'r').statuses.push(buildStatus('stealthed', 'r')!)
    advanceRound(b)
    expect(stealthed(b, 'r')).toBe(false)
  })
})
