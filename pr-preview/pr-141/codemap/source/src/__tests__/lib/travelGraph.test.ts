// §travel: routing over the location-connection graph.
import { describe, expect, it } from 'vitest'
import { routeBetween, routeStepsFrom, nearestCity } from '@/lib/travelGraph'
import { INITIAL_LOCATIONS } from '@/data/locations'
import type { Location } from '@/types'

const L = (id: string, connections: string[], traits: string[] = []): Location => ({
  id, region: 'world', name: id, description: '', traits,
  monsterIds: [], familiarityMax: 100, connections,
})

// a — b — c — d  (a line), plus a stub e off b
const LINE: Location[] = [
  L('a', ['b']), L('b', ['a', 'c', 'e']), L('c', ['b', 'd']), L('d', ['c']), L('e', ['b']),
]

describe('routeBetween', () => {
  it('same node → just that node', () => {
    expect(routeBetween('a', 'a', LINE)).toEqual(['a'])
  })
  it('finds the shortest inclusive path across intermediates', () => {
    expect(routeBetween('a', 'd', LINE)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('routeStepsFrom drops the starting node (what travelPath holds)', () => {
    expect(routeStepsFrom('a', 'd', LINE)).toEqual(['b', 'c', 'd'])
    expect(routeStepsFrom('a', 'a', LINE)).toEqual([])
  })
  it('returns null when disconnected or unknown', () => {
    expect(routeBetween('a', 'z', LINE)).toBeNull()
    const split = [L('x', []), L('y', [])]
    expect(routeBetween('x', 'y', split)).toBeNull()
  })
  it('honors a weight bias (routes around a discouraged node)', () => {
    // diamond: s→p→t and s→q→t; discourage p so the search prefers q.
    const diamond = [L('s', ['p', 'q']), L('p', ['s', 't']), L('q', ['s', 't']), L('t', ['p', 'q'])]
    const avoidP = (id: string) => (id === 'p' ? 100 : 1)
    expect(routeBetween('s', 't', diamond, avoidP)).toEqual(['s', 'q', 't'])
  })

  // §blink (movement-action-coupling.md M4): gated edges — a crossing that
  // exists only for owners of the named capability.
  it('gated connections open only for the matching ability', () => {
    // near ↔ far across a river: no road; a teleport-gated crossing both ways.
    // The long way round exists via three bridge nodes (so both variants route,
    // but only the blink owner takes the shortcut).
    const river: Location[] = [
      { ...L('near', ['b1']), gatedConnections: [{ to: 'far', requires: 'teleport' }] },
      L('b1', ['near', 'b2']), L('b2', ['b1', 'b3']), L('b3', ['b2', 'far']),
      { ...L('far', ['b3']), gatedConnections: [{ to: 'near', requires: 'teleport' }] },
    ]
    expect(routeBetween('near', 'far', river)).toEqual(['near', 'b1', 'b2', 'b3', 'far'])   // on foot: the long way
    expect(routeBetween('near', 'far', river, undefined, ['teleport'])).toEqual(['near', 'far'])   // blink: straight across
    expect(routeBetween('near', 'far', river, undefined, ['flight'])).toEqual(['near', 'b1', 'b2', 'b3', 'far'])   // wrong ability
  })

  it('a gated edge can be the ONLY route (an island)', () => {
    const island: Location[] = [
      { ...L('shore', []), gatedConnections: [{ to: 'isle', requires: 'teleport' }] },
      { ...L('isle', []), gatedConnections: [{ to: 'shore', requires: 'teleport' }] },
    ]
    expect(routeBetween('shore', 'isle', island)).toBeNull()
    expect(routeBetween('shore', 'isle', island, undefined, ['teleport'])).toEqual(['shore', 'isle'])
  })
})

describe('nearestCity', () => {
  it('returns the closest city by hop count', () => {
    const maps = [L('hunt', ['mid']), L('mid', ['hunt', 'far-town']), L('far-town', ['mid'], ['city'])]
    expect(nearestCity('hunt', maps)).toBe('far-town')
  })
  it('null when no city is reachable', () => {
    expect(nearestCity('a', LINE)).toBeNull()
  })
})

describe('the shipped world graph', () => {
  it('routes a coastal hunting field back to its hub city through intermediates', () => {
    const route = routeBetween('beach-1', 'prontera-city', INITIAL_LOCATIONS)
    expect(route).toEqual(['beach-1', 'prontera-field-2', 'prontera-city'])
  })
  it('every hunting field can reach a city (so a full bag can always be hauled)', () => {
    for (const loc of INITIAL_LOCATIONS) {
      if (!loc.openWorld || loc.traits.includes('city')) continue
      if ((loc.connections ?? []).length === 0) continue   // unconnected showcases are fine
      expect(nearestCity(loc.id, INITIAL_LOCATIONS), `${loc.id} can't reach a city`).not.toBeNull()
    }
  })
})
