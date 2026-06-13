// Combat-tally analytics: folding the engine's per-hit events into the rich
// per-unit breakdown (damage dealt/taken, hits/misses/dodges, element &
// effectiveness maps), the rolling minute-buckets, and the window sums.
import { describe, expect, it } from 'vitest'
import type { BattleEvent } from '@/engine'
import type { CombatTally } from '@/types'
import {
  emptyTally, addTally, scaleTally, effKindOf, foldRoundEvents,
  foldHistory, sumWindow, sumAll, HISTORY_BUCKET_TICKS, HISTORY_MAX_BUCKETS,
} from '@/lib/combatTally'

const ev = (e: Partial<BattleEvent>): BattleEvent => ({ round: 1, type: 'melee_attack', sourceId: 'x', ...e })

describe('effKindOf', () => {
  it('buckets the element multiplier', () => {
    expect(effKindOf(2)).toBe('effective')
    expect(effKindOf(1)).toBe('neutral')
    expect(effKindOf(undefined)).toBe('neutral')
    expect(effKindOf(0.33)).toBe('resisted')
    expect(effKindOf(0)).toBe('immune')
  })
})

describe('foldRoundEvents', () => {
  const players = new Set(['hero'])

  it('credits a hero its outgoing damage, hit, element and effectiveness', () => {
    const acc: Record<string, CombatTally> = {}
    foldRoundEvents(acc, [
      ev({ type: 'skill_use', sourceId: 'hero', targetId: 'mob', value: 30, eff: 2, element: 'fire', skillId: 'fb' }),
    ], 1, players)
    const t = acc['hero']
    expect(t.damageDealt).toBe(30)
    expect(t.spellDamageDealt).toBe(30)
    expect(t.hits).toBe(1)
    expect(t.dmgDealtByElement).toEqual({ fire: 30 })
    expect(t.effDealt.effective).toBe(1)
  })

  it('credits damage taken (with element) when the hero is the target', () => {
    const acc: Record<string, CombatTally> = {}
    foldRoundEvents(acc, [
      ev({ type: 'ranged_attack', sourceId: 'mob', targetId: 'hero', value: 12, eff: 1, element: 'water' }),
    ], 1, players)
    expect(acc['hero'].damageTaken).toBe(12)
    expect(acc['hero'].dmgTakenByElement).toEqual({ water: 12 })
    expect(acc['hero'].hits).toBe(0)   // taking a hit isn't landing one
  })

  it('splits a dodge into the dodger and the misser', () => {
    const acc: Record<string, CombatTally> = {}
    foldRoundEvents(acc, [
      ev({ type: 'dodge', sourceId: 'mob', targetId: 'hero' }),       // hero dodged
      ev({ type: 'dodge', sourceId: 'hero', targetId: 'mob' }),       // hero's swing missed
    ], 1, new Set(['hero']))
    expect(acc['hero'].dodges).toBe(1)
    expect(acc['hero'].misses).toBe(1)
  })

  it('counts an immune hit in effDealt but adds no damage or hit', () => {
    const acc: Record<string, CombatTally> = {}
    foldRoundEvents(acc, [
      ev({ type: 'skill_use', sourceId: 'hero', targetId: 'mob', value: 0, eff: 0, element: 'poison' }),
    ], 1, players)
    expect(acc['hero'].effDealt.immune).toBe(1)
    expect(acc['hero'].hits).toBe(0)
    expect(acc['hero'].damageDealt).toBe(0)
  })

  it('tallies healing for the healer', () => {
    const acc: Record<string, CombatTally> = {}
    foldRoundEvents(acc, [ev({ type: 'heal', sourceId: 'hero', targetId: 'ally', value: 20 })], 1, players)
    expect(acc['hero'].healingDone).toBe(20)
  })

  it('ignores events from other rounds', () => {
    const acc: Record<string, CombatTally> = {}
    foldRoundEvents(acc, [ev({ round: 2, sourceId: 'hero', targetId: 'mob', value: 5, eff: 1 })], 1, players)
    expect(acc['hero']).toBeUndefined()
  })
})

describe('addTally / scaleTally', () => {
  it('sums scalar fields and element maps', () => {
    const a = { ...emptyTally(), damageDealt: 10, dmgDealtByElement: { fire: 10 } }
    const b = { ...emptyTally(), damageDealt: 5, dmgDealtByElement: { fire: 2, water: 3 } }
    const sum = addTally(a, b)
    expect(sum.damageDealt).toBe(15)
    expect(sum.dmgDealtByElement).toEqual({ fire: 12, water: 3 })
  })

  it('scales counts and breakdowns by a factor', () => {
    const t = { ...emptyTally(), damageDealt: 100, hits: 4, dmgDealtByElement: { fire: 100 }, effDealt: { effective: 4, neutral: 0, resisted: 0, immune: 0 } }
    const s = scaleTally(t, 2.5)
    expect(s.damageDealt).toBe(250)
    expect(s.hits).toBe(10)
    expect(s.dmgDealtByElement).toEqual({ fire: 250 })
    expect(s.effDealt.effective).toBe(10)
  })
})

describe('foldHistory / window sums', () => {
  it('accumulates into the current minute bucket and answers windowed sums', () => {
    const delta = { hero: { ...emptyTally(), damageDealt: 50 } }
    // tick at minute 10
    const tick = 10 * HISTORY_BUCKET_TICKS
    let hist = foldHistory({}, delta, tick)
    hist = foldHistory(hist, delta, tick + 5)             // same bucket
    hist = foldHistory(hist, delta, tick + HISTORY_BUCKET_TICKS)  // next minute

    expect(hist['hero']).toHaveLength(2)
    // "last 1 minute" (current bucket only) = 50
    expect(sumWindow(hist['hero'], tick + HISTORY_BUCKET_TICKS, 1).damageDealt).toBe(50)
    // "last 5 minutes" spans both buckets = 150
    expect(sumWindow(hist['hero'], tick + HISTORY_BUCKET_TICKS, 5).damageDealt).toBe(150)
    expect(sumAll(hist['hero']).damageDealt).toBe(150)
  })

  it('prunes buckets older than the retention window', () => {
    const delta = { hero: { ...emptyTally(), damageDealt: 1 } }
    let hist = foldHistory({}, delta, 0)
    for (let m = 1; m < HISTORY_MAX_BUCKETS + 10; m++) {
      hist = foldHistory(hist, delta, m * HISTORY_BUCKET_TICKS)
    }
    expect(hist['hero'].length).toBeLessThanOrEqual(HISTORY_MAX_BUCKETS)
  })

  it('skips units with no delta', () => {
    expect(foldHistory({}, {}, 0)).toEqual({})
  })
})
