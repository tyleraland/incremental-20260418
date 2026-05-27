// The enemy wave mirrors the deployed party size (no 5-unit cap), unless the
// location pins a fixed wave via `testScenarioId` → SCENARIO_REGISTRY.
import { describe, it, expect } from 'vitest'
import { waveComposition, locationBarriers } from '@/stores/useGameStore'
import type { Location } from '@/types'

const loc = (overrides: Partial<Location> = {}): Location =>
  ({ id: 'loc', name: 'L', region: 'r', description: '', traits: [], monsterIds: ['slime'], familiarityMax: 100, connections: [], ...overrides })

describe('waveComposition', () => {
  it('sizes the wave to the full (uncapped) party', () => {
    expect(waveComposition(loc({ monsterIds: ['slime'] }), 8)).toHaveLength(8)
  })

  it('cycles the location monster list across the party', () => {
    expect(waveComposition(loc({ monsterIds: ['slime', 'wolf'] }), 3)).toEqual(['slime', 'wolf', 'slime'])
  })

  it('always fields at least one monster', () => {
    expect(waveComposition(loc({ monsterIds: ['slime'] }), 0)).toEqual(['slime'])
  })

  it('a scenario with a fixed wave ignores party size', () => {
    const scenLoc = loc({ testScenarioId: 'geffen-f2-cross' })
    expect(waveComposition(scenLoc, 1)).toEqual(['tough-slime', 'tough-slime', 'tough-slime', 'bat', 'bat'])
    expect(waveComposition(scenLoc, 99)).toEqual(['tough-slime', 'tough-slime', 'tough-slime', 'bat', 'bat'])
  })

  it('encounterMultiplier scales the wave per hero', () => {
    expect(waveComposition(loc({ monsterIds: ['slime'], encounterMultiplier: 2 }), 3)).toHaveLength(6)
    expect(waveComposition(loc({ monsterIds: ['slime'], encounterMultiplier: 0.5 }), 4)).toHaveLength(2)
    // a scenario wave still trumps the multiplier
    expect(waveComposition(loc({ testScenarioId: 'geffen-f2-cross', encounterMultiplier: 5 }), 1)).toHaveLength(5)
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
