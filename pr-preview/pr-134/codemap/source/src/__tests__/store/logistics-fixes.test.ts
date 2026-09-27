// Regressions for the logistics/travel polish pass:
//  • a followed hero's camera (combatLocationId) crosses maps WITH them
//  • a transiting hero marches through a hunting map (engine, not sucked in)
//  • buying/granting a consumable tags it kind:'consumable' (loadout-recognisable)
//  • a reloaded hero re-hydrates its supplies loadout from persisted pack targets
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const MAPS: Location[] = [
  { id: 'A', region: 'world', name: 'A', description: '', traits: [], monsterIds: ['slime'],
    familiarityMax: 100, connections: ['B'], openWorld: true, openWorldCap: 4, openWorldSize: 12,
    portals: [{ at: [6, 1], to: 'B', toAt: [6, 11] }] },
  { id: 'B', region: 'world', name: 'B', description: '', traits: [], monsterIds: [],
    familiarityMax: 100, connections: ['A'], openWorld: true, openWorldCap: 0, openWorldSize: 12,
    portals: [{ at: [6, 11], to: 'A', toAt: [6, 1] }] },
]
const unit = (id: string) => useGameStore.getState().units.find((u) => u.id === id)!

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); useGameStore.setState({ expeditions: {} }) })
afterEach(() => vi.restoreAllMocks())

describe('camera follows a hero across map transitions', () => {
  it('moves the camera (selected + combat location) with a followed hero crossing a portal', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['B'] })],
      mapMode: 'battle', selectedLocationId: 'A', combatLocationId: 'A', battleFollowId: 'u1',
    })
    let crossed = false
    for (let i = 0; i < 60 && !crossed; i++) { tick(); crossed = unit('u1').locationId === 'B' }
    expect(crossed).toBe(true)
    expect(useGameStore.getState().combatLocationId).toBe('B')    // watched battle came along
    expect(useGameStore.getState().selectedLocationId).toBe('B')  // proto camera came along
  })

  it('does NOT move the camera for an unfollowed traveller', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['B'] }),
              makeUnit({ id: 'u2', locationId: 'A', health: 100 })],
      mapMode: 'battle', selectedLocationId: 'A', combatLocationId: 'A', battleFollowId: 'u2',   // watching u2
    })
    for (let i = 0; i < 60 && unit('u1').locationId !== 'B'; i++) tick()
    expect(useGameStore.getState().selectedLocationId).toBe('A')   // stayed put
  })

  it('follows an INSTANT (re)deploy of the followed hero (the resupply teleport)', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100 })],
      mapMode: 'battle', selectedLocationId: 'A', combatLocationId: 'A', battleFollowId: 'u1',
      deployMode: 'instant',
    })
    useGameStore.getState().assignUnits(['u1'], 'B')   // teleport (e.g. town → field)
    expect(unit('u1').locationId).toBe('B')
    expect(useGameStore.getState().selectedLocationId).toBe('B')   // camera followed the teleport
    expect(useGameStore.getState().combatLocationId).toBe('B')
  })

  it('does NOT move the camera when an UNfollowed hero is (re)deployed', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100 }), makeUnit({ id: 'u2', locationId: 'A', health: 100 })],
      mapMode: 'battle', selectedLocationId: 'A', combatLocationId: 'A', battleFollowId: 'u1',
      deployMode: 'instant',
    })
    useGameStore.getState().assignUnits(['u2'], 'B')   // a different hero
    expect(useGameStore.getState().selectedLocationId).toBe('A')
  })
})

describe('transiting hero marches through a hunting map', () => {
  it('reaches the portal and crosses despite monsters + a resident hunter', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'resident', locationId: 'A', health: 100 }),
              makeUnit({ id: 'transit', locationId: 'A', health: 100, travelPath: ['B'] })],
    })
    let crossed = false
    for (let i = 0; i < 80 && !crossed; i++) { tick(); crossed = unit('transit').locationId === 'B' }
    expect(crossed).toBe(true)
    expect(unit('resident').locationId).toBe('A')   // the resident keeps hunting A
  })
})

describe('consumables are tagged so the loadout recognises them', () => {
  it('granting a potion to the stash sets kind:consumable + its real name', () => {
    resetStore({ units: [makeUnit({ id: 'u1' })], miscItems: [] })
    useGameStore.getState().grantMiscItem('potion-hp', 5)
    const m = useGameStore.getState().miscItems.find((x) => x.id === 'potion-hp')!
    expect(m.quantity).toBe(5)
    expect(m.kind).toBe('consumable')
    expect(m.name).toBe('Health Potion')
  })
})

describe('supplies loadout persists across a reload (via pack carry-targets)', () => {
  it('ensure() rehydrates the loadout from a surviving pack target', () => {
    resetStore({ units: [makeUnit({ id: 'u1', pack: [{ itemId: 'potion-hp', count: 0, target: 7 }] })] })
    useGameStore.getState().ensureExpedition('u1')
    expect(useGameStore.getState().expeditions['u1']?.loadout['potion-hp']?.qty).toBe(7)
  })
})
