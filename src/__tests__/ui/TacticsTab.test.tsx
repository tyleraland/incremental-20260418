// Equip-tactics UI: the Tactics detail tab and the party panel drive the store.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Units } from '@/pages/Units'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => {
  resetStore({ units: [], partyTactics: [] })
  globalThis.ResizeObserver = class { observe() {}; unobserve() {}; disconnect() {} }
  Element.prototype.setPointerCapture    = () => {}
  Element.prototype.releasePointerCapture = () => {}
})
afterEach(() => cleanup())

const tacticIds = () => (useGameStore.getState().units[0].tactics ?? []).map((t) => t.id)

describe('Tactics detail tab', () => {
  beforeEach(() => {
    resetStore({ units: [makeUnit({ id: 'u1', tactics: [] })], partyTactics: [] })
    useGameStore.setState({ expandedUnitIds: ['u1'] })
  })

  it('equips a tactic from the Available catalog', () => {
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    fireEvent.click(screen.getByTitle('Equip Charger'))
    expect(tacticIds()).toEqual(['charger'])
  })

  it('removes an equipped tactic', () => {
    useGameStore.getState().equipTactic('u1', 'armored')
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    fireEvent.click(screen.getByLabelText('Remove'))
    expect(tacticIds()).toEqual([])
  })

  it('reorders priority with the up control', () => {
    const { equipTactic } = useGameStore.getState()
    equipTactic('u1', 'charger'); equipTactic('u1', 'armored')
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    // two "Move up" buttons render; the second (armored) is enabled
    const ups = screen.getAllByLabelText('Move up')
    fireEvent.click(ups[1])
    expect(tacticIds()).toEqual(['armored', 'charger'])
  })
})

describe('Party tactics panel', () => {
  it('equips a party-scope tactic', () => {
    resetStore({ units: [], partyTactics: [] })
    render(<Units />)
    fireEvent.click(screen.getByText('Party Tactics'))   // expand
    fireEvent.click(screen.getByTitle('Equip Finish Them'))
    expect((useGameStore.getState().partyTactics ?? []).map((t) => t.id)).toEqual(['finish-them'])
  })
})
