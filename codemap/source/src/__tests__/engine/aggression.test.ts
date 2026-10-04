// Monster aggression & pack behaviour (§aggression). Covers the four dispositions:
//   • skittish      — non-aggressive until hit/called, then retaliates
//   • aggro-on-hit  — taking a hit from a foe rouses a skittish monster onto it
//   • pack-tactics  — a roused monster calls same-named kin in sight to the fight
//   • pack-hunter   — a pack roams as a group (shared waypoint), not solo lurking
//   • flee          — badly hurt, it runs from the nearest foe
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, monsterToEngineInput, buildEngineSkill, type BattleState } from '@/engine'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

// A monster-ish enemy with a given tactic loadout (encounter mode ⇒ ∞ vision).
const mob = (over: Parameters<typeof eu>[0] = {}) =>
  eu({ team: 'enemy', str: 8, maxHp: 60, hp: 60, meleeRange: 1.2, moveSpeed: 0.9, ...over })

describe('skittish — non-aggressive until hit', () => {
  it('ignores a hero in sight: no target, no aggression', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 20, moveSpeed: 0 })],   // can't close, just stands
      enemyUnits: [mob({ id: 's', name: 'Slime', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }] })],
    })
    find(b, 'hero').pos = { x: 7, y: 5 }
    find(b, 's').pos = { x: 7, y: 9 }
    for (let r = 0; r < 8; r++) advanceRound(b)
    const s = find(b, 's')
    expect(s.provoked).toBe(false)
    expect(s.lockedTargetId).toBeNull()
    expect(find(b, 'hero').hp).toBe(find(b, 'hero').maxHp)   // never attacked
  })

  it('wanders on its own in an encounter (mills about, irrespective of heroes)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 20, moveSpeed: 0 })],   // far + immobile: never reaches it
      enemyUnits: [mob({ id: 's', name: 'Slime', moveSpeed: 0.9, tactics: [{ id: 'skittish', rank: 1 }] })],
    })
    find(b, 'hero').pos = { x: 1, y: 1 }
    const start = { x: 12, y: 12 }
    find(b, 's').pos = { ...start }
    for (let r = 0; r < 14; r++) advanceRound(b)
    const s = find(b, 's')
    expect(dist(s.pos, start)).toBeGreaterThan(0.5)          // it wandered off its spawn
    expect(s.provoked).toBe(false)                            // still non-aggressive
    expect(find(b, 'hero').hp).toBe(find(b, 'hero').maxHp)    // never made the first strike
  })

  it('a caster closes on a non-provoked monster instead of kiting it (no pre-fight jitter)', () => {
    // §kite: a caster used to back away from any nearest enemy — including a
    // skittish monster still wandering (not angry at us) — causing a stutter as
    // the monster milled about. It should close to cast range and open fire.
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, str: 3, rangedRange: 6, skills: [buildEngineSkill('fire-bolt', 1)!], moveSpeed: 0.9 })],
      enemyUnits: [mob({ id: 's', name: 'Slime', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }] })],
    })
    find(b, 'mage').pos = { x: 7, y: 2 }
    find(b, 's').pos = { x: 7, y: 12 }          // far + non-provoked
    const d0 = dist(find(b, 'mage').pos, find(b, 's').pos)
    advanceRound(b)
    expect(dist(find(b, 'mage').pos, find(b, 's').pos)).toBeLessThan(d0)   // closed, didn't flee
    expect(find(b, 's').provoked).toBe(false)
  })

  it('rouses and retaliates once a hero strikes it (aggro-on-hit)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 24, moveSpeed: 1.2 })],
      enemyUnits: [mob({ id: 's', name: 'Slime', tactics: [{ id: 'skittish', rank: 1 }] })],
    })
    find(b, 'hero').pos = { x: 7, y: 6 }
    find(b, 's').pos = { x: 7, y: 7 }
    // Step until the hero lands its first hit.
    let provokedAt = -1
    for (let r = 0; r < 12 && provokedAt < 0; r++) {
      advanceRound(b)
      if (find(b, 's').provoked) provokedAt = r
    }
    expect(provokedAt).toBeGreaterThanOrEqual(0)
    const s = find(b, 's')
    expect(s.hp).toBeLessThan(s.maxHp)                 // it was the hit that did it
    expect(s.lockedTargetId).toBe('hero')              // turns on its attacker
  })
})

describe('aggressive-on-sight still works (no skittish)', () => {
  it('a normal monster locks the hero immediately', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', moveSpeed: 0 })],
      enemyUnits: [mob({ id: 'm', name: 'Wolf', moveSpeed: 0 })],
    })
    find(b, 'hero').pos = { x: 7, y: 5 }
    find(b, 'm').pos = { x: 7, y: 9 }
    expect(find(b, 'm').provoked).toBe(true)
    advanceRound(b)
    expect(find(b, 'm').lockedTargetId).toBe('hero')
  })
})

describe('pack-tactics — call same-named kin', () => {
  it('a roused monster provokes same-named allies in sight onto its target', () => {
    const b = createBattle({
      // Pinned hero: it can only ever hit the adjacent 'a', so 'b'/'c' can become
      // provoked *only* via the pack-call, never by being struck themselves.
      playerUnits: [eu({ id: 'hero', str: 24, moveSpeed: 0 })],
      enemyUnits: [
        mob({ id: 'a', name: 'Boar', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }] }),
        mob({ id: 'b', name: 'Boar', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }] }),
        mob({ id: 'c', name: 'Stag', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }] }),
      ],
    })
    find(b, 'hero').pos = { x: 6, y: 6 }
    find(b, 'a').pos = { x: 6, y: 6.9 }   // adjacent → the hero hits this one
    find(b, 'b').pos = { x: 11, y: 6 }    // same name, out of reach but in sight → should be called
    find(b, 'c').pos = { x: 1, y: 6 }     // different name, out of reach → must NOT be called
    for (let r = 0; r < 12; r++) advanceRound(b)
    expect(find(b, 'a').provoked).toBe(true)            // hit → roused
    expect(find(b, 'b').provoked).toBe(true)            // called by its packmate
    expect(find(b, 'b').lockedTargetId).toBe('hero')    // onto the caller's target
    expect(find(b, 'c').provoked).toBe(false)           // wrong name → never called
  })
})

describe('pack-hunter — roam as a group', () => {
  it('a pack converges and travels together instead of lurking apart', () => {
    const b = createBattle({
      playerUnits: [],
      enemyUnits: [0, 1, 2].map((i) =>
        mob({ id: `w${i}`, name: 'Dire Wolf', visionRange: 10, tactics: [{ id: 'pack-hunter', rank: 1 }] })),
      mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'w0').pos = { x: 3, y: 3 }
    find(b, 'w1').pos = { x: 27, y: 4 }
    find(b, 'w2').pos = { x: 5, y: 26 }
    const spread = () => {
      const ps = ['w0', 'w1', 'w2'].map((id) => find(b, id).pos)
      let m = 0
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) m = Math.max(m, dist(ps[i], ps[j]))
      return m
    }
    const startSpread = spread()
    const start = { ...find(b, 'w0').pos }
    for (let r = 0; r < 50; r++) advanceRound(b)
    expect(spread()).toBeLessThan(startSpread / 2)            // pulled together into a pack
    expect(dist(find(b, 'w0').pos, start)).toBeGreaterThan(8) // and actually travelled
  })
})

describe('flee — run when badly hurt', () => {
  it('a low-hp monster retreats from the nearest foe', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 4, moveSpeed: 0 })],
      enemyUnits: [mob({ id: 'm', name: 'Boar', hp: 8, maxHp: 70, moveSpeed: 0.9, tactics: [{ id: 'flee', rank: 1 }] })],
    })
    find(b, 'hero').pos = { x: 7, y: 5 }
    find(b, 'm').pos = { x: 7, y: 7 }
    const d0 = dist(find(b, 'm').pos, find(b, 'hero').pos)
    for (let r = 0; r < 6; r++) advanceRound(b)
    expect(dist(find(b, 'm').pos, find(b, 'hero').pos)).toBeGreaterThan(d0 + 2)   // ran away
  })
})

describe('events feed the UI feedback (aggro flash / rally ring)', () => {
  it('emits an aggro event when a skittish monster is roused, and a rally on the call', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 24, moveSpeed: 0 })],
      enemyUnits: [
        mob({ id: 'a', name: 'Boar', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }] }),
        mob({ id: 'b', name: 'Boar', moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }] }),
      ],
    })
    find(b, 'hero').pos = { x: 6, y: 6 }
    find(b, 'a').pos = { x: 6, y: 6.9 }
    find(b, 'b').pos = { x: 10, y: 6 }
    for (let r = 0; r < 6; r++) advanceRound(b)
    const aggro = b.events.filter((e) => e.type === 'aggro')
    const rally = b.events.filter((e) => e.type === 'rally')
    expect(aggro.some((e) => e.sourceId === 'a')).toBe(true)   // hit → roused
    expect(aggro.some((e) => e.sourceId === 'b')).toBe(true)   // called → roused
    expect(rally.some((e) => e.sourceId === 'a')).toBe(true)   // 'a' made the call
  })
})

describe('data wiring (MONSTER_REGISTRY)', () => {
  it('Slime is skittish (starts non-aggressive); Dire Wolf is aggressive', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero' })],
      enemyUnits: [
        monsterToEngineInput(MONSTER_REGISTRY['slime'], 'slime#0', 'enemy'),
        monsterToEngineInput(MONSTER_REGISTRY['dire-wolf'], 'dw#0', 'enemy'),
        monsterToEngineInput(MONSTER_REGISTRY['wild-boar'], 'boar#0', 'enemy'),
      ],
    })
    expect(find(b, 'slime#0').provoked).toBe(false)   // skittish
    expect(find(b, 'boar#0').provoked).toBe(false)    // skittish herd
    expect(find(b, 'dw#0').provoked).toBe(true)       // aggressive pack
  })
})
