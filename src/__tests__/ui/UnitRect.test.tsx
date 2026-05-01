// Requirements: Unit Selection & Detail Card + KO display + fleeing display
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore } from '../helpers'

beforeEach(() => {
  resetStore()
  globalThis.ResizeObserver = class {
    observe() {}; unobserve() {}; disconnect() {}
  }
  Element.prototype.setPointerCapture    = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(cleanup)

// Combat-status displays on unit cards live on the Combat tab.
// Map handles assignment/drag-drop only.
async function renderMap() {
  const { Map } = await import('@/pages/Map')
  return render(React.createElement(Map))
}

async function renderCombat() {
  const { Combat } = await import('@/pages/Combat')
  return render(React.createElement(Combat))
}

// All test locations use region 'prontera' (a real REGIONS entry).
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

describe('UnitRect — fleeing state (Combat tab)', () => {
  it('shows "Fleeing" on unit card when unit\'s location has active flee countdown (expanded)', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: 'loc1' })],
      locations: [TEST_LOCATION],
      encounters: { loc1: [makeEncounterSlot()] },
      locationFleeing: { loc1: 2 },
      expandedRegionIds: ['prontera'],
      expandedLocationIds: ['loc1'],
    })
    await renderCombat()
    expect(screen.getByText('Fleeing')).toBeInTheDocument()
  })

  it('does not show "Fleeing" when locationFleeing is 0', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: null })],
      locations: [],
      locationFleeing: {},
      expandedRegionIds: [],
    })
    await renderCombat()
    expect(screen.queryByText('Fleeing')).not.toBeInTheDocument()
  })
})

describe('UnitRect — target display (Combat tab)', () => {
  it('shows "→ Wolf" on unit card when wolf is the encounter monster (expanded)', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: 'loc1' })],
      locations: [TEST_LOCATION],
      encounters: { loc1: [makeEncounterSlot({ targetUnitId: 'u1' })] },
      locationFleeing: {},
      expandedRegionIds: ['prontera'],
      expandedLocationIds: ['loc1'],
    })
    await renderCombat()
    expect(screen.getByText('→ Wolf')).toBeInTheDocument()
  })

  it('does not show a monster target when flee countdown is active', async () => {
    useGameStore.setState({
      units: [makeUnit({ id: 'u1', health: 80, locationId: 'loc1' })],
      locations: [TEST_LOCATION],
      encounters: { loc1: [makeEncounterSlot({ targetUnitId: 'u1' })] },
      locationFleeing: { loc1: 2 },
      expandedRegionIds: ['prontera'],
      expandedLocationIds: [],
    })
    await renderCombat()
    expect(screen.queryByText('→ Wolf')).not.toBeInTheDocument()
  })
})

describe('LocationSection — compact empty row (Map tab)', () => {
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
