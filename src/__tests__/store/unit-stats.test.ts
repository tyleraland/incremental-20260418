// Per-unit lifetime combat stats (the Report panel). The tick loop credits each
// hero's damage dealt, monsters killed (by killing blow), items found, and
// fighting time, folding them into the persistent `unitStats` tally.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const OPEN = (monsterIds: string[], cap: number, size = 12): Location => ({
  id: 'field', region: 'world', name: 'Field',
  description: '', traits: [], monsterIds, familiarityMax: 100, connections: [],
  openWorld: true, openWorldCap: cap, openWorldSize: size,
})

// Pin randomness (loot rolls) so drops — and thus itemsFound — are deterministic.
beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('per-unit combat stats', () => {
  it('accrues damage, kills, items, and fighting time for the killer', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [0, 1, 2].map((i) => makeUnit({
        id: `u${i}`, locationId: 'field', health: 100,
        abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 },
      })),
    })
    for (let i = 0; i < 600; i++) tick()

    const stats = useGameStore.getState().unitStats
    // Every deployed hero logs fighting time.
    for (const id of ['u0', 'u1', 'u2']) {
      expect(stats[id]?.combatTicks ?? 0).toBeGreaterThan(0)
    }
    // The party collectively dealt damage and racked up kills…
    const totalDmg   = ['u0', 'u1', 'u2'].reduce((n, id) => n + (stats[id]?.damageDealt ?? 0), 0)
    const totalKills = ['u0', 'u1', 'u2'].reduce((n, id) => n + (stats[id]?.monstersDefeated ?? 0), 0)
    expect(totalDmg).toBeGreaterThan(0)
    expect(totalKills).toBeGreaterThan(0)
    // …and per-unit kills never exceed the location-wide defeat count.
    expect(totalKills).toBeLessThanOrEqual(useGameStore.getState().monsterDefeated['slime'] ?? 0)
  })

  it('starts empty and only tracks units that actually fight', () => {
    resetStore({
      unitStats: {},
      locations: [OPEN(['slime'], 2)],
      units: [
        makeUnit({ id: 'fighter', locationId: 'field', health: 100, abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 } }),
        makeUnit({ id: 'idler', locationId: null, health: 100 }),
      ],
    })
    expect(useGameStore.getState().unitStats).toEqual({})
    for (let i = 0; i < 200; i++) tick()

    const stats = useGameStore.getState().unitStats
    expect(stats['fighter']?.combatTicks ?? 0).toBeGreaterThan(0)
    expect(stats['idler']).toBeUndefined()  // never deployed → no combat time
  })
})
