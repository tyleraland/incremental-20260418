// Requirements: Encounters & Combat + Targeting + Monster Behavior sections of CLAUDE.md
import { beforeEach, describe, expect, it } from 'vitest'
import { getDerivedStats } from '@/stores/useGameStore'
import { makeUnit, resetStore, tick } from '../helpers'

// Base unit constitution=5 → defense = Math.floor(5 * 1.5) = 7
const BASE_DEF = getDerivedStats(makeUnit(), []).defense

beforeEach(() => resetStore())

describe('Targeting — monster → unit (round-robin)', () => {
  it('slot i targets aliveUnits[i % aliveUnits.length]', () => {
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
    })
    const { encounterTargets } = tick()
    expect(encounterTargets['loc1']).toEqual(['u1', 'u2'])
  })

  it('wraps around when there are more monsters than units', () => {
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      activeEncounters: { loc1: ['wolf', 'wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0, 0] },
    })
    const { encounterTargets } = tick()
    expect(encounterTargets['loc1']).toEqual(['u1', 'u2', 'u1'])
  })

  it('excludes KO\'d units from round-robin', () => {
    resetStore({
      units: [
        makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      activeEncounters: { loc1: ['wolf', 'wolf'] },
      encounterProgress: { loc1: [0, 0] },
    })
    const { encounterTargets } = tick()
    expect(encounterTargets['loc1']).toEqual(['u2', 'u2'])
  })

  it('sets all targets to null when no alive units are at the location', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 3, locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
    })
    const { encounterTargets } = tick()
    expect(encounterTargets['loc1']).toEqual([null])
  })
})

describe('Targeting — unit → monster (focusSlots)', () => {
  it('with all normal monsters, units attack slots round-robin', () => {
    // 1 unit, 2 normal slots → unit attacks slot 0 (0 % 2 = 0), slot 1 stays frozen
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1'][0]).toBeGreaterThan(0)
    expect(encounterProgress['loc1'][1]).toBe(0)
  })

  it('prioritize makes all units focus that slot first', () => {
    // slot 0=wolf (normal), slot 1=rock-crab (prioritize). 2 units → both attack slot 1
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
      locationStrategy: { loc1: { 'rock-crab': 'prioritize' } },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1'][0]).toBe(0)            // wolf untouched
    expect(encounterProgress['loc1'][1]).toBeGreaterThan(0) // crab focused
  })

  it('ignore monsters are never attacked (progress stays frozen)', () => {
    // slot 0=wolf (normal), slot 1=rock-crab (ignore). Only wolf is in focusSlots.
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
      locationStrategy: { loc1: { 'rock-crab': 'ignore' } },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1'][0]).toBeGreaterThan(0) // wolf attacked
    expect(encounterProgress['loc1'][1]).toBe(0)            // crab frozen
  })
})

describe('Monster damage to units', () => {
  it('applies attack / defense damage from each monster to its target', () => {
    // wolf attack=8, baseDef=7 → floor(100 - 8/7) = 98
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(Math.floor(100 - 8 / BASE_DEF))
  })

  it('ignore monsters still deal damage to units', () => {
    // wolf (normal) + rock-crab (ignore): crab's ignore only freezes its HP — it still attacks
    // 2 monsters, 1 unit → both target u1
    // total dmg = (8 + 10) / BASE_DEF
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
      locationStrategy: { loc1: { 'rock-crab': 'ignore' } },
    })
    const { units } = tick()
    expect(units[0].health).toBe(Math.floor(100 - (8 + 10) / BASE_DEF))
  })
})

describe('Encounter progress', () => {
  it('advances at 1 / (monster.level * 5) per tick for attacked slots', () => {
    // wolf level=2 → delta = 1/(2*5) = 0.1 per tick
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1'][0]).toBeCloseTo(1 / (2 * 5))
  })

  it('resets a slot to 0 on the tick after it reaches full progress (monster defeated)', () => {
    // Progress at 1.0 = monster already dead this tick; next tick checks prog >= 1 → resets
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [1.0] },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1'][0]).toBe(0)
  })

  it('does not reset a slot that has not yet reached full progress', () => {
    // 0.5 + 0.1 = 0.6 < 1 → still in progress
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0.5] },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1'][0]).toBeCloseTo(0.6)
  })
})
