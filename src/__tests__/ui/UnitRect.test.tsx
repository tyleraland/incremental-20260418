// Requirements: Unit Selection & Detail Card + KO display + fleeing display
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => {
  resetStore()
  globalThis.ResizeObserver = class {
    observe() {}; unobserve() {}; disconnect() {}
  }
  Element.prototype.setPointerCapture    = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(cleanup)

// The Map page renders DraggableUnit → UnitRect with store-derived props.
// We import it once and drive it entirely via store state.
async function renderMap() {
  const { Map } = await import('@/pages/Map')
  return render(React.createElement(Map))
}

// All test locations use region 'prontera' (a real REGIONS entry in Map.tsx).
const TEST_LOCATION = {
  id: 'loc1', name: 'Test Forest', region: 'prontera',
  description: '', traits: [], monsterIds: ['wolf'], familiarityMax: 100, connections: [],
}

describe('UnitRect — KO state', () => {
  it('shows "KO" indicator when unit is in recovery countdown', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: null })],
      locations: [],
      expandedRegionIds: [],
    })
    await renderMap()
    expect(screen.getByText('KO')).toBeInTheDocument()
  })
})

describe('UnitRect — fleeing state', () => {
  it('shows "fleeing" when the unit\'s location has an active flee countdown', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: 'loc1' })],
      locations: [TEST_LOCATION],
      encounters: { loc1: [{ monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal', respawnTicksLeft: 0 }] },
      locationFleeing: { loc1: 2 },
      expandedRegionIds: ['prontera'],
      expandedLocationIds: [],
    })
    await renderMap()
    expect(screen.getByText('fleeing')).toBeInTheDocument()
  })

  it('does not show "fleeing" when locationFleeing is 0', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: null })],
      locations: [],
      locationFleeing: {},
      expandedRegionIds: [],
    })
    await renderMap()
    expect(screen.queryByText('fleeing')).not.toBeInTheDocument()
  })
})

describe('UnitRect — target display', () => {
  it('shows "→ Wolf" on unit card when wolf is the encounter monster', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: 'loc1' })],
      locations: [TEST_LOCATION],
      encounters: { loc1: [{ monsterId: 'wolf', progress: 0, targetUnitId: 'u1', behavior: 'normal', respawnTicksLeft: 0 }] },
      locationFleeing: {},
      expandedRegionIds: ['prontera'],
      expandedLocationIds: [],
    })
    await renderMap()
    expect(screen.getByText('→ Wolf')).toBeInTheDocument()
  })

  it('does not show a monster target when flee countdown is active', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: 'loc1' })],
      locations: [TEST_LOCATION],
      encounters: { loc1: [{ monsterId: 'wolf', progress: 0, targetUnitId: 'u1', behavior: 'normal', respawnTicksLeft: 0 }] },
      locationFleeing: { loc1: 2 },
      expandedRegionIds: ['prontera'],
      expandedLocationIds: [],
    })
    await renderMap()
    expect(screen.queryByText('→ Wolf')).not.toBeInTheDocument()
  })
})

describe('LocationSection — compact empty row', () => {
  it('renders the location name for an empty collapsed location', async () => {
    useGameStore.setState({
      units: [],
      locations: [{ ...TEST_LOCATION, name: 'Empty Spot' }],
      expandedLocationIds: [],
      expandedRegionIds: ['prontera'],
    })
    await renderMap()
    expect(screen.getByText('Empty Spot')).toBeInTheDocument()
  })

  it('does not show a unit count badge when the location is empty', async () => {
    useGameStore.setState({
      units: [],
      locations: [{ ...TEST_LOCATION, name: 'Vacant Forest' }],
      expandedLocationIds: [],
      expandedRegionIds: ['prontera'],
    })
    await renderMap()
    // No unit count pill should appear — verifying compact (name-only) rendering
    const badge = screen.queryByText('0')
    expect(badge).not.toBeInTheDocument()
  })
})
