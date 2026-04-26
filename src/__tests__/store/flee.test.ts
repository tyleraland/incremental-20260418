// Requirements: Flee state machine section of CLAUDE.md
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore, FLEE_TICKS_CONST } from '@/stores/useGameStore'
import { makeUnit, resetStore, tick } from '../helpers'

const FLEE_TICKS = FLEE_TICKS_CONST // 2

beforeEach(() => resetStore())

describe('Flee — trigger conditions', () => {
  it('triggers flee when any monster is set to avoid', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
      locationStrategy: { loc1: { wolf: 'avoid' } },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1']).toBe(FLEE_TICKS)
  })

  it('triggers flee when ALL monsters are set to ignore', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
      locationStrategy: { loc1: { wolf: 'ignore' } },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1']).toBe(FLEE_TICKS)
  })

  it('triggers flee when all monsters are ignore or avoid (mixed)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
      locationStrategy: { loc1: { wolf: 'ignore', 'rock-crab': 'avoid' } },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1']).toBe(FLEE_TICKS)
  })

  it('does NOT trigger flee when at least one monster is normal', () => {
    // wolf=normal, rock-crab=ignore → not all ignore/avoid → no flee
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0, 0] },
      locationStrategy: { loc1: { 'rock-crab': 'ignore' } },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1'] ?? 0).toBe(0)
  })

  it('does NOT trigger flee when there are no alive units', () => {
    // flee check requires aliveUnits.length > 0
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
      locationStrategy: { loc1: { wolf: 'avoid' } },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1'] ?? 0).toBe(0)
  })
})

describe('Flee — countdown', () => {
  it('decrements locationFleeing by 1 each tick', () => {
    resetStore({
      units: [],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0.5] },
      locationFleeing: { loc1: 2 },
    })
    const state1 = tick()
    expect(state1.locationFleeing['loc1']).toBe(1)

    const state2 = tick()
    expect(state2.locationFleeing['loc1']).toBe(0)
  })

  it('does not reset progress until the final flee tick (2 → 1)', () => {
    const progress = 0.5
    resetStore({
      units: [],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [progress] },
      locationFleeing: { loc1: 2 },
    })
    const { encounterProgress } = tick()
    // counter went 2→1: progress preserved
    expect(encounterProgress['loc1'][0]).toBe(progress)
  })

  it('resets encounter progress to 0 on the final flee tick (1 → 0)', () => {
    resetStore({
      units: [],
      activeEncounters: { loc1: ['wolf', 'rock-crab'] },
      encounterProgress: { loc1: [0.7, 0.3] },
      locationFleeing: { loc1: 1 },
    })
    const { encounterProgress } = tick()
    expect(encounterProgress['loc1']).toEqual([0, 0])
  })
})

describe('Flee — combat suppression', () => {
  it('units take no damage while flee countdown is active', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0.5] },
      locationFleeing: { loc1: 2 },
    })
    const { units } = tick()
    expect(units[0].health).toBe(100)
  })

  it('encounter targets are all null during flee', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf', 'wolf'] },
      encounterProgress: { loc1: [0, 0] },
      locationFleeing: { loc1: 2 },
    })
    const { encounterTargets } = tick()
    expect(encounterTargets['loc1']).toEqual([null, null])
  })

  it('units take no damage on the tick that triggers flee', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      activeEncounters: { loc1: ['wolf'] },
      encounterProgress: { loc1: [0] },
      locationStrategy: { loc1: { wolf: 'avoid' } },
    })
    // Flee triggers this tick — damage loop is skipped
    const { units } = tick()
    expect(units[0].health).toBe(100)
  })
})
