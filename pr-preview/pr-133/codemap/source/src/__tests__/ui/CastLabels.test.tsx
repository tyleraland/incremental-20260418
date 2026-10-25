// Lingering cast labels: when a unit casts a skill, its name stays anchored to
// the caster (covering the channel + a few seconds after), and a single cast
// shows a single label (not one per channel round).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { resetStore } from '../helpers'
import { eu } from '../engine/helpers'

afterEach(cleanup)

const LOC = { id: 'loc1', name: 'L', region: 'r', description: '', traits: [], monsterIds: ['slime'], familiarityMax: 100, connections: [] } as never

async function show(battle: BattleState) {
  useGameStore.setState({ combatLocationId: 'loc1', locations: [LOC], battles: { loc1: { ...battle } } })
  const { BattleView } = await import('@/components/BattleView')
  return render(React.createElement(BattleView, { locationId: 'loc1' }))
}

// A mage that can land Lightning Bolt uninterrupted (enemy far away, can't reach).
function mageBattle(): BattleState {
  const b = createBattle({
    playerUnits: [eu({ id: 'u1', name: 'Mage', int: 30, rangedRange: 6, skills: [buildEngineSkill('lightning-bolt', 1)!] })],
    enemyUnits: [eu({ id: 'e0', name: 'Slime', team: 'enemy', maxHp: 500, hp: 500, moveSpeed: 0 })],
    mode: 'open', cols: 30, rows: 30,
  })
  b.combatants.find((c) => c.id === 'u1')!.pos = { x: 15, y: 14 }
  b.combatants.find((c) => c.id === 'e0')!.pos = { x: 15, y: 18 }   // in bolt range, out of melee
  return b
}

describe('lingering cast labels', () => {
  it('shows the cast name while channeling', async () => {
    const b = mageBattle()
    for (let r = 0; r < 2 && !b.combatants.find((c) => c.id === 'u1')!.channel; r++) advanceRound(b)
    expect(b.combatants.find((c) => c.id === 'u1')!.channel, 'mage should be channeling').toBeTruthy()
    await show(b)
    expect(screen.queryAllByText(/Lightning Bolt/).length).toBeGreaterThan(0)
  })

  it('a single cast yields a single lingering label (not one per round)', async () => {
    const b = mageBattle()
    // Advance well past one full cast so cast_start has fired across several
    // channel rounds (+ the resolve). The label must not multiply per round.
    for (let r = 0; r < 6; r++) advanceRound(b)
    await show(b)
    // At most: the chip's channel badge (only while channeling) + one lingering
    // label for the spell. Never a stack of identical names.
    expect(screen.queryAllByText(/Lightning Bolt/).length).toBeLessThanOrEqual(2)
  })
})
