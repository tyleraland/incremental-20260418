// TacticianLens (the shell's per-hero Tactics lens, src/proto/ProtoLens.tsx) —
// equip/unequip/reorder wiring + the floor-above-trigger warning, both ported
// from the classic Units.tsx Tactics tab (now deleted). The underlying store
// actions (equipTactic/unequipTactic/moveTactic) are already covered more
// thoroughly at the store level (tactics-loadout.test.ts); these are wiring
// smoke tests — does clicking the actual shell control call the actual action.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { TacticianLens } from '@/proto/ProtoLens'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => resetStore({ units: [makeUnit({ id: 'u1', tactics: [] })] }))
afterEach(() => cleanup())

const tacticIds = () => (useGameStore.getState().units[0].tactics ?? []).map((t) => t.id)

// Subscribes to the store so a click's state change re-renders with a fresh
// `unit` prop, same as the real ProtoLens parent does.
function Harness() {
  const unit = useGameStore((s) => s.units.find((u) => u.id === 'u1'))
  return unit ? <TacticianLens unit={unit} /> : null
}

describe('TacticianLens (shell)', () => {
  it('equips a tactic from the Add picker', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('＋ Add tactic'))
    fireEvent.click(screen.getByText('Charger'))
    expect(tacticIds()).toEqual(['charger'])
  })

  it('unequips a tactic', () => {
    useGameStore.getState().equipTactic('u1', 'exploit-weakness')
    render(<Harness />)
    fireEvent.click(screen.getByText('✕'))
    expect(tacticIds()).toEqual([])
  })

  it('reorders priority within a channel with the up control', () => {
    const { equipTactic } = useGameStore.getState()
    // two targeting tactics so they share a channel and can be reordered
    equipTactic('u1', 'opportunist'); equipTactic('u1', 'interrupt')
    render(<Harness />)
    const ups = screen.getAllByText('▲')
    fireEvent.click(ups[1])   // interrupt (2nd row) moves up
    expect(tacticIds()).toEqual(['interrupt', 'opportunist'])
  })

  it('warns when an always-on (floor) tactic sits above a trigger in the same channel', () => {
    const { equipTactic } = useGameStore.getState()
    // tank-buster (floor) above opportunist (trigger) — both targeting
    equipTactic('u1', 'tank-buster'); equipTactic('u1', 'opportunist')
    render(<Harness />)
    expect(screen.getByText(/Always-on tactics run after this channel's conditional triggers/)).toBeInTheDocument()
  })

  it('does not warn when the trigger sits above the floor', () => {
    const { equipTactic } = useGameStore.getState()
    equipTactic('u1', 'opportunist'); equipTactic('u1', 'tank-buster')
    render(<Harness />)
    expect(screen.queryByText(/Always-on tactics run after/)).not.toBeInTheDocument()
  })
})
