// §logistics: open-world kills fill a hero's personal loot bag (not the stash);
// when it's full the hero hauls it home through the portal graph, deposits into
// the guild stash, and routes back to resume hunting.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, getDerivedStats } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const unit = (id: string) => useGameStore.getState().units.find((u) => u.id === id)!
const stashQty = (id: string) => useGameStore.getState().miscItems.find((m) => m.id === id)?.quantity ?? 0

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('carryCapacity', () => {
  it('scales with strength', () => {
    const u = makeUnit({ abilities: { strength: 10, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 } })
    expect(getDerivedStats(u, []).carryCapacity).toBe(40)   // 20 + str*2
  })
})

describe('open-world loot fills the bag, not the stash', () => {
  it('routes a credited hero kill drop into carried', () => {
    resetStore({
      locations: [{
        id: 'field', region: 'world', name: 'Field', description: '', traits: [],
        monsterIds: ['slime'], familiarityMax: 100, connections: [],
        openWorld: true, openWorldCap: 3, openWorldSize: 12,
      }],
      // A strong solo hero one-shots slimes (so it lands the credited kills).
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100,
        abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 } })],
    })
    for (let i = 0; i < 40; i++) tick()
    const carried = unit('u1').carried ?? []
    expect(carried.find((c) => c.itemId === 'drop-slime-gel')?.count ?? 0).toBeGreaterThan(0)
    expect(stashQty('drop-slime-gel')).toBe(0)   // bag, not the guild stash
  })
})

describe('full bag → haul home → deposit → return', () => {
  const MAPS: Location[] = [
    {
      id: 'field', region: 'world', name: 'Field', description: '', traits: [],
      monsterIds: [], familiarityMax: 100, connections: ['town'],
      openWorld: true, openWorldCap: 0, openWorldSize: 12,
      portals: [{ at: [6, 1], to: 'town', toAt: [6, 11] }],
    },
    {
      id: 'town', region: 'world', name: 'Town', description: '', traits: ['city'],
      monsterIds: [], familiarityMax: 100, connections: ['field'],
      openWorld: true, openWorldCap: 0, openWorldSize: 12,
      portals: [{ at: [6, 11], to: 'field', toAt: [6, 1] }],
    },
  ]

  it('runs the whole haul loop and lands the loot in the stash', () => {
    resetStore({
      locations: MAPS,
      // Bag already over the str-5 hero's capacity (20 + 5*2 = 30).
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100, carried: [{ itemId: 'drop-x', count: 50 }] })],
    })

    tick()
    // A full bag on an open-world field immediately starts the trip home.
    expect(unit('u1').travelGoal).toBe('home')
    expect(unit('u1').huntLocationId).toBe('field')
    expect(unit('u1').homeLocationId).toBe('town')   // nearest (only) city

    // Walk to the portal, hop to town, deposit, route back, arrive, resume.
    let deposited = false, home = false
    for (let i = 0; i < 120; i++) {
      tick()
      if (stashQty('drop-x') === 50) deposited = true
      if (deposited && unit('u1').locationId === 'field' && !unit('u1').travelGoal) { home = true; break }
    }
    expect(deposited).toBe(true)                       // bag emptied into the guild stash
    expect(home).toBe(true)                            // back hunting on the field
    expect(unit('u1').carried).toEqual([])             // bag emptied
    expect(unit('u1').travelGoal == null).toBe(true)
    expect(unit('u1').huntLocationId == null).toBe(true)
  })
})
