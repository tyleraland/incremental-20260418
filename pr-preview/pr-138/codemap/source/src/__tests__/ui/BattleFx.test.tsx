// FX bucketing: LiveBattle buckets the round's events by type in one pass
// (hits → attack lines/flashes, spawn → ring+float, aggro → "!", rally →
// "rally!", tactic_use → label float). These render straight from that switch,
// so this guards against a mis-bucketed event type silently dropping an FX.
import { describe, it, expect, afterEach } from 'vitest'
import { render, within, cleanup } from '@testing-library/react'
import React from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { createBattle, type BattleState, type BattleEvent } from '@/engine'
import { eu } from '../engine/helpers'
import { resetStore } from '../helpers'

afterEach(cleanup)

const LOC = { id: 'L1', name: 'L', region: 'world', description: '', traits: [], monsterIds: ['x'], familiarityMax: 100, connections: [] } as never

// A static encounter battle (full-arena camera, everything on-screen, no rAF) so
// every FX renders deterministically from the bucketing pass.
function fxBattle(): BattleState {
  const b = createBattle({
    playerUnits: [eu({ id: 'u1', name: 'Aria' })],
    enemyUnits:  [eu({ id: 'e1', name: 'Goblin', team: 'enemy' })],
  })
  b.combatants.find((c) => c.id === 'u1')!.pos = { x: 7, y: 7 }
  b.combatants.find((c) => c.id === 'e1')!.pos = { x: 7, y: 8 }
  const at = { x: 7, y: 7 }
  const r = b.round
  const events: BattleEvent[] = [
    { round: r, type: 'melee_attack', sourceId: 'u1', targetId: 'e1', value: 5 },          // → attack line + flash
    { round: r, type: 'spawn',  sourceId: 'e1', position: at },                             // → "⚠ Goblin" float
    { round: r, type: 'aggro',  sourceId: 'e1', position: at },                             // → "!" float
    { round: r, type: 'rally',  sourceId: 'e1', position: at },                             // → "✦ rally!" float
    { round: r, type: 'tactic_use', sourceId: 'u1', extra: { label: 'Counterattack' } },    // → label float
  ]
  b.events = events
  return b
}

async function show(b: BattleState) {
  resetStore({ units: [], locations: [LOC], battles: { L1: { ...b } } })
  const { BattleView } = await import('@/components/BattleView')
  return render(React.createElement(BattleView, { locationId: 'L1' }))
}

// The arena square — scope assertions here so the Legend below it never matches.
function arena(container: HTMLElement): HTMLElement {
  return container.querySelector('.aspect-square') as HTMLElement
}

describe('battle FX bucketing', () => {
  it('renders an attack line for a hit event', async () => {
    const { container } = await show(fxBattle())
    expect(arena(container).querySelector('line')).toBeTruthy()
  })

  it('lunges the melee attacker toward its target (one-shot nudge)', async () => {
    const { container } = await show(fxBattle())
    // the attacker's chip carries the parity-alternating lunge class + direction vars
    const lunger = arena(container).querySelector('.animate-lunge-a, .animate-lunge-b') as HTMLElement
    expect(lunger).toBeTruthy()
    expect(lunger.style.getPropertyValue('--lunge-x')).toMatch(/%$/)
    expect(lunger.closest('[data-cid="u1"]')).toBeTruthy()   // on the ATTACKER, not the target
    // ranged attackers don't lunge
    const b = fxBattle()
    b.events = [{ round: b.round, type: 'ranged_attack', sourceId: 'u1', targetId: 'e1', value: 5 }]
    const { container: c2 } = await show(b)
    expect(c2.querySelector('.animate-lunge-a, .animate-lunge-b')).toBeNull()
  })

  it('renders a spawn float for a spawn event', async () => {
    const { container } = await show(fxBattle())
    expect(within(arena(container)).getByText('⚠ Goblin')).toBeTruthy()
  })

  it('renders a "!" for an aggro event', async () => {
    const { container } = await show(fxBattle())
    expect(within(arena(container)).getByText('!')).toBeTruthy()
  })

  it('renders a rally float for a rally event', async () => {
    const { container } = await show(fxBattle())
    expect(within(arena(container)).getByText('✦ rally!')).toBeTruthy()
  })

  it('renders the tactic label for a tactic_use event', async () => {
    const { container } = await show(fxBattle())
    expect(within(arena(container)).getByText('Counterattack')).toBeTruthy()
  })

  it('drops events from other rounds (round-scoped bucketing)', async () => {
    const b = fxBattle()
    b.events = b.events.map((e) => ({ ...e, round: b.round - 1 }))   // all stale
    const { container } = await show(b)
    expect(within(arena(container)).queryByText('✦ rally!')).toBeNull()
    expect(within(arena(container)).queryByText('Counterattack')).toBeNull()
  })
})
