// Smoke test for the rebuilt Combat tab: it renders the 5×10 grid preview and
// places party/enemy chips. Full combat behavior lives in the engine tests.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { createBattle, advanceRound, buildEngineSkill } from '@/engine'
import { makeUnit, resetStore } from '../helpers'
import { eu } from '../engine/helpers'

beforeEach(() => resetStore())
afterEach(cleanup)

const TEST_LOCATION = {
  id: 'loc1', name: 'Test Forest', region: 'prontera',
  description: '', traits: [], monsterIds: ['wolf', 'slime'], familiarityMax: 100, connections: [],
}

async function renderCombat() {
  const { Combat } = await import('@/pages/Combat')
  return render(React.createElement(Combat))
}

describe('Combat tab — grid preview', () => {
  it('prompts to pick a location when none is focused', async () => {
    useGameStore.setState({ combatLocationId: null, locations: [TEST_LOCATION] })
    await renderCombat()
    expect(screen.getByText('Combat')).toBeInTheDocument()
    expect(screen.getByText(/Pick a location/i)).toBeInTheDocument()
  })

  it('places party and enemy chips for the focused location', async () => {
    useGameStore.setState({
      combatLocationId: 'loc1',
      locations: [TEST_LOCATION],
      units: [makeUnit({ id: 'u1', name: 'Ada Vale', locationId: 'loc1' })],
    })
    await renderCombat()
    expect(screen.getByText('Test Forest')).toBeInTheDocument()
    expect(screen.getByText('Party (1)')).toBeInTheDocument()
    // Preview now mirrors the real wave: party-sized (1 unit → 1 enemy)
    expect(screen.getByText('Enemies (1)')).toBeInTheDocument()
    expect(screen.getByText('AV')).toBeInTheDocument()   // unit initials chip
  })
})

describe('Combat tab — live battle', () => {
  it('renders the running battle (round, combatants, HP) when one is active', async () => {
    const battle = createBattle({
      playerUnits: [eu({ id: 'u1', name: 'Ada Vale', str: 100, meleeRange: 10 })],
      enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 25, hp: 25, meleeRange: 10 })],
    })
    advanceRound(battle)   // produce a round with movement/attacks
    useGameStore.setState({ combatLocationId: 'loc1', locations: [TEST_LOCATION], battles: { loc1: { ...battle } } })
    await renderCombat()
    expect(screen.getByText(/round/i)).toBeInTheDocument()
    expect(screen.getByText('AV')).toBeInTheDocument()  // party chip
  })

  it('shows a casting indicator while a unit channels a spell', async () => {
    const battle = createBattle({
      playerUnits: [eu({ id: 'u1', name: 'Mage', int: 20, rangedRange: 6, skills: [buildEngineSkill('lightning-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'e0', name: 'Slime', team: 'enemy', maxHp: 100, hp: 100, meleeRange: 1.2 })],
    })
    battle.combatants.find((c) => c.id === 'u1')!.pos = { x: 2.5, y: 6 }   // in spell range
    battle.combatants.find((c) => c.id === 'e0')!.pos = { x: 2.5, y: 9 }
    advanceRound(battle)   // mage begins channeling Lightning Bolt
    useGameStore.setState({ combatLocationId: 'loc1', locations: [TEST_LOCATION], battles: { loc1: { ...battle } } })
    await renderCombat()
    // The chip carries a persistent "✦ Lightning Bolt" channel badge AND the
    // cast_start event surfaces a floating "✦ Lightning Bolt" label that
    // rises and fades — either is the casting indicator. We just want at
    // least one of them present.
    expect(screen.getAllByText(/Lightning Bolt/).length).toBeGreaterThan(0)
  })
})
