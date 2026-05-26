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

// Combat-status displays on unit cards live on the Combat tab.
// Map handles assignment/drag-drop only.
async function renderMap() {
  const { Map } = await import('@/pages/Map')
  return render(React.createElement(Map))
}

// Test locations use a real id from the world map so the new pannable layout
// has a coord to place them at.
const TEST_LOCATION = {
  id: 'geffen-city', name: 'Test Forest', region: 'world',
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

describe('LocationCell — empty location (Map tab)', () => {
  // The map is now a label-less grid of cells; a cell exposes its location
  // name via the `title` attribute rather than visible text.
  it('renders a cell for an empty location, identifiable by its name title', async () => {
    useGameStore.setState({
      units: [],
      locations: [{ ...TEST_LOCATION, name: 'Empty Spot' }],
      expandedLocationIds: [],
      expandedRegionIds: ['world'],
    })
    await renderMap()
    expect(screen.getByTitle('Empty Spot')).toBeInTheDocument()
  })

  it('does not show a unit count badge when the location is empty', async () => {
    useGameStore.setState({
      units: [],
      locations: [{ ...TEST_LOCATION, name: 'Vacant Forest' }],
      expandedLocationIds: [],
      expandedRegionIds: ['world'],
    })
    await renderMap()
    // No unit count pill should appear for an empty cell.
    const badge = screen.queryByText('0')
    expect(badge).not.toBeInTheDocument()
  })
})
