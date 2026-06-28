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
