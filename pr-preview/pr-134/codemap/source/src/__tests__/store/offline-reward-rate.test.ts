// Offline reward rate must track REALIZED play, not a saturated estimate.
//
// The cold prime / sampled projection runs a budgeted real-combat slice and
// extrapolates its kill rate over the absence. That slice used to refill the field
// to cap EVERY round (`restockField`), so a party that out-clears the open-world
// spawn trickle measured a kill rate ~13× the realized (spawn-limited) one — and
// offline rewards (kills/exp/loot) were credited at that inflated rate. The slice
// now trickles monsters in on the live spawn cadence, so the projected rate matches
// what real play yields. This test pins that: offline-projected kills stay close to
// a realized live run over the same span.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, batchTick } from '../helpers'

const OPEN = (monsterIds: string[], cap: number, size = 12): Location => ({
  id: 'field', region: 'world', name: 'Field',
  description: '', traits: [], monsterIds, familiarityMax: 100, connections: [],
  openWorld: true, openWorldCap: cap, openWorldSize: size,
})

// A party that easily out-clears the trickle — the case the saturation inflated.
const strong = (id: string) => makeUnit({
  id, locationId: 'field', health: 100,
  abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 },
})

describe('offline reward rate ≈ realized rate (not saturated)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  it('cold-prime projection stays within ~2× of a realized live run', () => {
    const N = 1500   // 5 min — offlineWindowCount = 1 → cold prime path

    // Realized: run N real live ticks (world mode → every location full-sims).
    resetStore({
      ticks: 0, mapMode: 'world', combatLocationId: null,
      locations: [OPEN(['slime'], 3)], locationStats: {},
      units: [0, 1, 2].map((i) => strong(`u${i}`)), miscItems: [],
    })
    for (let i = 0; i < N; i++) useGameStore.getState().tick()
    const realized = useGameStore.getState().monsterDefeated.slime ?? 0

    // Offline: fresh store, batchTick(N) extrapolates the primed (trickle-limited) rate.
    resetStore({
      ticks: 0, mapMode: 'world', combatLocationId: null,
      locations: [OPEN(['slime'], 3)], locationStats: {},
      units: [0, 1, 2].map((i) => strong(`u${i}`)), miscItems: [],
    })
    batchTick(N)
    const projected = useGameStore.getState().monsterDefeated.slime ?? 0

    expect(realized).toBeGreaterThan(0)
    expect(projected).toBeGreaterThan(0)
    // The saturation bug made this ~13×; the trickle-limited prime keeps it ~1.15×.
    // Bound generously so positional/RNG drift never flakes, but well under the bug.
    expect(projected).toBeLessThan(realized * 2)
    expect(projected).toBeGreaterThan(realized * 0.4)
  })
})
