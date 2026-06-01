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

  it('reorders priority within a channel with the up control', () => {
    const { equipTactic } = useGameStore.getState()
    // two targeting tactics so they share a channel and can be reordered
    equipTactic('u1', 'opportunist'); equipTactic('u1', 'interrupt')
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    // two "Move up" buttons render; the second (interrupt) is enabled
    const ups = screen.getAllByLabelText('Move up')
    fireEvent.click(ups[1])
    expect(tacticIds()).toEqual(['interrupt', 'opportunist'])
  })

  it('keeps the up control disabled for a lone tactic in its channel', () => {
    const { equipTactic } = useGameStore.getState()
    // charger (movement) + armored (passive): different channels, neither can move
    equipTactic('u1', 'charger'); equipTactic('u1', 'armored')
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    for (const btn of screen.getAllByLabelText('Move up')) expect(btn).toBeDisabled()
    for (const btn of screen.getAllByLabelText('Move down')) expect(btn).toBeDisabled()
  })

  it('warns when an always-on (floor) tactic sits above a trigger in the same channel', () => {
    const { equipTactic } = useGameStore.getState()
    // tank-buster (floor) above opportunist (trigger) — both targeting
    equipTactic('u1', 'tank-buster'); equipTactic('u1', 'opportunist')
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    expect(screen.getByText(/Always-on tactics run after this channel's conditional triggers/)).toBeInTheDocument()
  })

  it('does not warn when the trigger sits above the floor', () => {
    const { equipTactic } = useGameStore.getState()
    equipTactic('u1', 'opportunist'); equipTactic('u1', 'tank-buster')
    render(<Units />)
    fireEvent.click(screen.getByText('Tactics'))
    expect(screen.queryByText(/Always-on tactics run after/)).not.toBeInTheDocument()
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
