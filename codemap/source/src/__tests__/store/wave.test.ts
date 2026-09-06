// The enemy wave uses all the location's monsterIds, unless the
// location pins a fixed wave via `testScenarioId` → SCENARIO_REGISTRY.
import { describe, it, expect } from 'vitest'
import { waveComposition, locationBarriers } from '@/stores/useGameStore'
import type { Location } from '@/types'

const loc = (overrides: Partial<Location> = {}): Location =>
  ({ id: 'loc', name: 'L', region: 'r', description: '', traits: [], monsterIds: ['slime'], familiarityMax: 100, connections: [], ...overrides })

describe('waveComposition', () => {
  it('runs the location\'s monsterIds as the wave, regardless of party size', () => {
    expect(waveComposition(loc({ monsterIds: ['slime'] }), 1)).toEqual(['slime'])
    expect(waveComposition(loc({ monsterIds: ['slime'] }), 8)).toEqual(['slime'])
  })

  it('uses all monsterIds when a location has multiple monsters', () => {
    expect(waveComposition(loc({ monsterIds: ['slime', 'wolf'] }), 3)).toEqual(['slime', 'wolf'])
  })

  it('a scenario with a fixed wave overrides the default and ignores party size', () => {
    const scenLoc = loc({ testScenarioId: 'geffen-f2-cross' })
    expect(waveComposition(scenLoc, 1)).toEqual(['tough-slime', 'tough-slime', 'tough-slime', 'bat', 'bat'])
    expect(waveComposition(scenLoc, 99)).toEqual(['tough-slime', 'tough-slime', 'tough-slime', 'bat', 'bat'])
  })

  it('returns an empty wave when the location has no monsters', () => {
    expect(waveComposition(loc({ monsterIds: [] }), 1)).toEqual([])
  })
})

describe('locationBarriers', () => {
  it('returns terrain from the pinned scenario; open field otherwise', () => {
    expect(locationBarriers(loc({ testScenarioId: 'geffen-f2-cross' })).length).toBeGreaterThan(0)
    expect(locationBarriers(loc({ testScenarioId: 'los-kiting-perimeter' })).length).toBeGreaterThan(0)
    expect(locationBarriers(loc())).toEqual([])
    expect(locationBarriers(null)).toEqual([])
  })
})
