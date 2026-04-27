// Requirements: Flee state machine section of CLAUDE.md
import { beforeEach, describe, expect, it } from 'vitest'
import { FLEE_TICKS_CONST } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

const FLEE_TICKS = FLEE_TICKS_CONST // 2

beforeEach(() => resetStore())

describe('Flee — trigger conditions', () => {
  it('triggers flee when any monster is set to avoid', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', behavior: 'avoid' })] },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1']).toBe(FLEE_TICKS)
  })

  it('triggers flee when ALL monsters are set to ignore', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', behavior: 'ignore' })] },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1']).toBe(FLEE_TICKS)
  })

  it('triggers flee when all monsters are ignore or avoid (mixed)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', behavior: 'ignore' }), makeEncounterSlot({ monsterId: 'rock-crab', behavior: 'avoid' })] },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1']).toBe(FLEE_TICKS)
  })

  it('does NOT trigger flee when at least one monster is normal', () => {
    // wolf=normal, rock-crab=ignore → not all ignore/avoid → no flee
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab', behavior: 'ignore' })] },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1'] ?? 0).toBe(0)
  })

  it('does NOT trigger flee when there are no alive units', () => {
    // flee check requires aliveUnits.length > 0
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', behavior: 'avoid' })] },
    })
    const { locationFleeing } = tick()
    expect(locationFleeing['loc1'] ?? 0).toBe(0)
  })
})

describe('Flee — countdown', () => {
  it('decrements locationFleeing by 1 each tick', () => {
    resetStore({
      units: [],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 0.5 })] },
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
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress })] },
      locationFleeing: { loc1: 2 },
    })
    const { encounters } = tick()
    // counter went 2→1: progress preserved
    expect(encounters['loc1'][0].progress).toBe(progress)
  })

  it('resets encounter progress to 0 on the final flee tick (1 → 0)', () => {
    resetStore({
      units: [],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 0.7 }), makeEncounterSlot({ monsterId: 'rock-crab', progress: 0.3 })] },
      locationFleeing: { loc1: 1 },
    })
    const { encounters } = tick()
    expect(encounters['loc1'].map((sl) => sl.progress)).toEqual([0, 0])
  })
})

describe('Flee — combat suppression', () => {
  it('units take no damage while flee countdown is active', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 0.5 })] },
      locationFleeing: { loc1: 2 },
    })
    const { units } = tick()
    expect(units[0].health).toBe(100)
  })

  it('encounter targets are all null during flee', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'wolf' })] },
      locationFleeing: { loc1: 2 },
    })
    const { encounters } = tick()
    expect(encounters['loc1'].map((sl) => sl.targetUnitId)).toEqual([null, null])
  })

  it('units take no damage on the tick that triggers flee', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', behavior: 'avoid' })] },
    })
    // Flee triggers this tick — damage loop is skipped
    const { units } = tick()
    expect(units[0].health).toBe(100)
  })
})
