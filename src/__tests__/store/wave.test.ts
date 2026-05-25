// The enemy wave mirrors the deployed party size, with no 5-unit cap (so all
// units stationed at a location engage and pull a matching number of monsters).
import { describe, it, expect } from 'vitest'
import { waveComposition } from '@/stores/useGameStore'
import type { Location } from '@/types'

const loc = (monsterIds: string[]): Location =>
  ({ id: 'loc', name: 'L', region: 'r', description: '', traits: [], monsterIds, familiarityMax: 100, connections: [] })

describe('waveComposition', () => {
  it('sizes the wave to the full (uncapped) party', () => {
    expect(waveComposition(loc(['slime']), 8)).toHaveLength(8)
  })

  it('cycles the location monster list across the party', () => {
    expect(waveComposition(loc(['slime', 'wolf']), 3)).toEqual(['slime', 'wolf', 'slime'])
  })

  it('always fields at least one monster', () => {
    expect(waveComposition(loc(['slime']), 0)).toEqual(['slime'])
  })
})
