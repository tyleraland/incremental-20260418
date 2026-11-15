import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { useGameStore } from '@/stores/useGameStore'
import { BattleView, isOnScreen } from '@/components/BattleView'
import { createBattle, addCombatant, type BattleState } from '@/engine'
import { eu } from '../engine/helpers'
import type { Location } from '@/types'

const LOC: Location = {
  id: 'L1', region: 'world', name: 'Field', description: '', traits: [],
  monsterIds: ['x'], familiarityMax: 100, connections: [], openWorld: true, openWorldSize: 100,
}

// Build a 100×100 open battle with units at explicit spots, then clear the
// round-0 spawn events so only the steady-state chips/markers render.
function buildBattle(): BattleState {
  const b = createBattle({ playerUnits: [], enemyUnits: [], mode: 'open', cols: 100, rows: 100 })
  addCombatant(b, eu({ id: 'a', name: 'Alpha', team: 'player', visionRange: 10 }), 'player', undefined, { x: 50, y: 50 })
  addCombatant(b, eu({ id: 'bb', name: 'Beta', team: 'player', visionRange: 10 }), 'player', undefined, { x: 51, y: 50 })
  addCombatant(b, eu({ id: 'g', name: 'Gamma', team: 'player', visionRange: 10 }), 'player', undefined, { x: 50, y: 99 })
  addCombatant(b, eu({ id: 'mn', name: 'Nearby', team: 'enemy', visionRange: 8 }), 'enemy', undefined, { x: 52, y: 51 })
  addCombatant(b, eu({ id: 'mf', name: 'Faraway', team: 'enemy', visionRange: 8 }), 'enemy', undefined, { x: 99, y: 5 })
  b.events = []
  return b
}

beforeEach(() => {
  cleanup()
  useGameStore.setState({ units: [], equipment: [], locations: [LOC], battles: { L1: buildBattle() } })
})

describe('isOnScreen', () => {
  const cam = { x: 20, y: 20, size: 60 }   // viewport [20,80]×[20,80]
  it('is true inside the viewport, false outside', () => {
    expect(isOnScreen(cam, { x: 50, y: 50 })).toBe(true)
    expect(isOnScreen(cam, { x: 90, y: 50 })).toBe(false)   // off to the right
    expect(isOnScreen(cam, { x: 50, y: 5 })).toBe(false)    // off the top
  })
})

// The arena square — scope token/marker assertions here so the Legend below it
// doesn't get matched.
function arena(container: HTMLElement): HTMLElement {
  return container.querySelector('.aspect-square') as HTMLElement
}

describe('open-world off-screen tokens', () => {
  it('renders on-screen heroes and monsters as chips', () => {
    const { container } = render(<BattleView locationId="L1" />)
    const a = within(arena(container))
    // The party is spread across a 100-cell field, so the camera is zoomed out
    // and tokens are LOD'd (no floating name) — identify chips by their title,
    // which the bare circle keeps.
    expect(a.getByTitle(/Alpha —/)).toBeTruthy()    // on-screen hero chip
    expect(a.getByTitle(/Nearby —/)).toBeTruthy()   // on-screen monster chip
  })

  it('does NOT show off-screen monsters (no chip, no marker)', () => {
    render(<BattleView locationId="L1" />)
    expect(screen.queryByText('Faraway')).toBeNull()                // no chip
    expect(screen.queryByTitle(/Faraway.*off-screen/i)).toBeNull()  // no edge marker
  })

  it('shows off-screen heroes as an edge marker, not a corner chip', () => {
    const { container } = render(<BattleView locationId="L1" />)
    const a = within(arena(container))
    expect(a.queryByText('Gamma')).toBeNull()                 // chip is clipped
    expect(a.getByTitle(/Gamma.*off-screen/i)).toBeTruthy()   // marker points to them
  })
})
