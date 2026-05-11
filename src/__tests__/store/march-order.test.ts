// Tests for the per-location marching order and its effect on the initial
// unit position before combat starts (rank-staggered).
import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0) })
afterEach(() => { vi.restoreAllMocks() })

describe('locationUnitOrder — march order and initial positions', () => {
  it('assignUnits appends ids and staggers initial unitDistance by rank', () => {
    resetStore({
      units: [
        makeUnit({ id: 'A' }), makeUnit({ id: 'B' }), makeUnit({ id: 'C' }),
      ],
    })
    useGameStore.getState().assignUnits(['A', 'B', 'C'], 'loc1')
    const s = useGameStore.getState()
    expect(s.locationUnitOrder.loc1).toEqual(['A', 'B', 'C'])
    // Rank 0/1/2 → 0, -5, -10
    expect(s.unitDistance.A).toBe(0)
    expect(s.unitDistance.B).toBe(-5)
    expect(s.unitDistance.C).toBe(-10)
  })

  it('setLocationUnitOrder reshuffles ranks and restaggers positions that are still pre-line', () => {
    resetStore({
      units: [makeUnit({ id: 'A' }), makeUnit({ id: 'B' }), makeUnit({ id: 'C' })],
    })
    useGameStore.getState().assignUnits(['A', 'B', 'C'], 'loc1')

    // Promote C to the front; A → middle; B → back.
    useGameStore.getState().setLocationUnitOrder('loc1', ['C', 'A', 'B'])
    const s = useGameStore.getState()
    expect(s.locationUnitOrder.loc1).toEqual(['C', 'A', 'B'])
    expect(s.unitDistance.C).toBe(0)
    expect(s.unitDistance.A).toBe(-5)
    expect(s.unitDistance.B).toBe(-10)
  })

  it('units already advanced into combat keep their live position when reordered', () => {
    resetStore({
      units: [makeUnit({ id: 'A' }), makeUnit({ id: 'B' })],
      unitDistance: { A: 15, B: 10 }, // A has already pushed forward
      locationUnitOrder: { loc1: ['A', 'B'] },
    })
    useGameStore.getState().setLocationUnitOrder('loc1', ['B', 'A'])
    const s = useGameStore.getState()
    expect(s.locationUnitOrder.loc1).toEqual(['B', 'A'])
    // Both A and B were positive (in combat) → live positions left untouched.
    expect(s.unitDistance.A).toBe(15)
    expect(s.unitDistance.B).toBe(10)
  })

  it('reassigning a unit out of a location removes it from that order', () => {
    resetStore({
      units: [makeUnit({ id: 'A' }), makeUnit({ id: 'B' }), makeUnit({ id: 'C' })],
    })
    useGameStore.getState().assignUnits(['A', 'B', 'C'], 'loc1')
    useGameStore.getState().assignUnits(['B'], 'loc2')
    const s = useGameStore.getState()
    expect(s.locationUnitOrder.loc1).toEqual(['A', 'C'])
    expect(s.locationUnitOrder.loc2).toEqual(['B'])
  })
})
