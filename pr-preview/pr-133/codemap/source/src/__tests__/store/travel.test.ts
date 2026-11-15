// §travel: portals link open-world maps; a hero with a travelPath walks to the
// portal and the store hops them across to the destination map. assignUnits in
// 'open-world' deploy mode routes a hero to a portal-linked neighbour by walking
// instead of teleporting.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { INITIAL_LOCATIONS } from '@/data/locations'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

// Two tiny monster-less open-world maps linked by a portal near map A's south
// edge (so a hero spawned at the centre reaches it in a handful of rounds).
const MAPS: Location[] = [
  {
    id: 'A', region: 'world', name: 'Map A', description: '', traits: [],
    monsterIds: [], familiarityMax: 100, connections: ['B'],
    openWorld: true, openWorldCap: 0, openWorldSize: 12,
    portals: [{ at: [6, 1], to: 'B', toAt: [6, 11] }],
  },
  {
    id: 'B', region: 'world', name: 'Map B', description: '', traits: [],
    monsterIds: [], familiarityMax: 100, connections: ['A'],
    openWorld: true, openWorldCap: 0, openWorldSize: 12,
    portals: [{ at: [6, 11], to: 'A', toAt: [6, 1] }],
  },
]

const unitLoc = (id: string) => useGameStore.getState().units.find((u) => u.id === id)
const combatantOn = (locId: string, unitId: string) =>
  (useGameStore.getState().battles[locId]?.combatants ?? []).find((c) => c.id === unitId)
const presentOn = (locId: string, unitId: string) => !!combatantOn(locId, unitId)

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('portal travel', () => {
  it('walks a routing hero to the portal and hops them to the destination map', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['B'] })],
    })
    // World mode (no watched battle) full-sims every location, so the hero
    // physically walks to the portal. Give it room to cross.
    let crossed = false
    for (let i = 0; i < 60 && !crossed; i++) {
      tick()
      crossed = unitLoc('u1')!.locationId === 'B'
    }
    expect(crossed).toBe(true)
    expect(unitLoc('u1')!.travelPath).toBeNull()           // single hop complete
    // Next tick the destination battle fields them.
    tick()
    expect(presentOn('B', 'u1')).toBe(true)
    expect(presentOn('A', 'u1')).toBe(false)
  })

  it('lands the hero AT the partner-edge portal on arrival, not the map centre', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['B'] })],
    })
    let crossed = false
    for (let i = 0; i < 60 && !crossed; i++) { tick(); crossed = unitLoc('u1')!.locationId === 'B' }
    tick()   // destination battle fields them at the landing spot
    const c = combatantOn('B', 'u1')!
    // A's portal to B has toAt:[6,11] → emerge near B's matching edge, NOT centre (6,6).
    // (The hero may take one wander step on the fielding tick, so compare anchors.)
    const toPortal = Math.hypot(c.pos.x - 6, c.pos.y - 11)
    const toCentre = Math.hypot(c.pos.x - 6, c.pos.y - 6)
    expect(toPortal).toBeLessThan(toCentre)
    expect(c.pos.y).toBeGreaterThan(8.5)
  })

  it('does not let the just-used portal suck the hero straight back (grace window)', () => {
    // Route A → B → A: it crosses to B and lands ON B's portal back to A. Without the
    // grace it would re-cross immediately; the grace holds it on B for a few ticks.
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['B', 'A'] })],
    })
    let crossed = false
    for (let i = 0; i < 60 && !crossed; i++) { tick(); crossed = unitLoc('u1')!.locationId === 'B' }
    expect(crossed).toBe(true)
    // For the next few ticks it must stay on B (grace), not bounce back to A.
    for (let i = 0; i < 3; i++) { tick(); expect(unitLoc('u1')!.locationId).toBe('B') }
    // Once the grace lapses it completes the route back to A.
    let back = false
    for (let i = 0; i < 20 && !back; i++) { tick(); back = unitLoc('u1')!.locationId === 'A' }
    expect(back).toBe(true)
  })

  it('crosses an off-screen map at once (no physical walk needed)', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['B'] })],
      // Watch a different (non-existent-battle) location → map A is off-screen.
      mapMode: 'battle', combatLocationId: 'B',
    })
    tick()
    expect(unitLoc('u1')!.locationId).toBe('B')
    expect(unitLoc('u1')!.travelPath).toBeNull()
  })

  it('drops a travelPath the current map has no portal for (never freezes)', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100, travelPath: ['nowhere'] })],
    })
    tick()
    expect(unitLoc('u1')!.locationId).toBe('A')
    expect(unitLoc('u1')!.travelPath).toBeNull()
  })
})

describe('routeUnitTo (multi-hop walk)', () => {
  it('sets a multi-hop travelPath toward a distant map (keeps locationId — walking)', () => {
    // A — B — C chain so the route has an intermediate hop.
    const chain: Location[] = [
      { id: 'A', region: 'world', name: 'A', description: '', traits: [], monsterIds: [], familiarityMax: 100,
        connections: ['B'], openWorld: true, openWorldCap: 0, openWorldSize: 12, portals: [{ at: [6, 1], to: 'B' }] },
      { id: 'B', region: 'world', name: 'B', description: '', traits: [], monsterIds: [], familiarityMax: 100,
        connections: ['A', 'C'], openWorld: true, openWorldCap: 0, openWorldSize: 12, portals: [{ at: [6, 11], to: 'A' }, { at: [11, 6], to: 'C' }] },
      { id: 'C', region: 'world', name: 'C', description: '', traits: [], monsterIds: [], familiarityMax: 100,
        connections: ['B'], openWorld: true, openWorldCap: 0, openWorldSize: 12, portals: [{ at: [1, 6], to: 'B' }] },
    ]
    resetStore({ locations: chain, units: [makeUnit({ id: 'u1', locationId: 'A', health: 100 })] })
    useGameStore.getState().routeUnitTo('u1', 'C')
    expect(unitLoc('u1')!.locationId).toBe('A')            // still on A — walking
    expect(unitLoc('u1')!.travelPath).toEqual(['B', 'C'])  // multi-hop route, current node dropped
  })
})

describe('assignUnits deploy mode', () => {
  it('open-world mode WALKS to a portal-linked neighbour (sets travelPath, keeps locationId)', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100 })],
      deployMode: 'open-world',
    })
    useGameStore.getState().assignUnits(['u1'], 'B')
    expect(unitLoc('u1')!.locationId).toBe('A')             // still on A — walking
    expect(unitLoc('u1')!.travelPath).toEqual(['B'])
  })

  it('instant mode teleports (no travelPath)', () => {
    resetStore({
      locations: MAPS,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100 })],
      deployMode: 'instant',
    })
    useGameStore.getState().assignUnits(['u1'], 'B')
    expect(unitLoc('u1')!.locationId).toBe('B')
    expect(unitLoc('u1')!.travelPath).toBeNull()
  })

  it('open-world mode teleports to an UN-linked map (no portal → no walk)', () => {
    const maps: Location[] = [
      MAPS[0],
      { ...MAPS[1], id: 'C', connections: [], portals: [] },   // not linked to A
    ]
    resetStore({
      locations: maps,
      units: [makeUnit({ id: 'u1', locationId: 'A', health: 100 })],
      deployMode: 'open-world',
    })
    useGameStore.getState().assignUnits(['u1'], 'C')
    expect(unitLoc('u1')!.locationId).toBe('C')
    expect(unitLoc('u1')!.travelPath).toBeNull()
  })
})

describe('world graph invariant', () => {
  it('every portal targets a real location and is reciprocated, and matches a connection', () => {
    const byId = new Map(INITIAL_LOCATIONS.map((l) => [l.id, l]))
    for (const loc of INITIAL_LOCATIONS) {
      for (const p of loc.portals ?? []) {
        const dest = byId.get(p.to)
        expect(dest, `${loc.id} portal → unknown ${p.to}`).toBeDefined()
        // The connection edge backing this portal exists…
        expect(loc.connections, `${loc.id} portal to ${p.to} without a connection`).toContain(p.to)
        // …and the destination has a portal back to here.
        expect((dest!.portals ?? []).some((q) => q.to === loc.id), `${p.to} has no return portal to ${loc.id}`).toBe(true)
      }
    }
  })
})
