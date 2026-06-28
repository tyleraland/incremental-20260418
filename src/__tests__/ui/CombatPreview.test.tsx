// Smoke test for the battle viewer (BattleView, used by the Map tab's drop-in
// mode): it renders the form-up preview and the live battle, placing
// party/enemy chips. Full combat behavior lives in the engine tests. The
// surrounding chrome (roster, context bar with location name + round) is the
// Map shell's job, not BattleView's.
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

async function renderBattle(locationId: string | null) {
  const { BattleView } = await import('@/components/BattleView')
  return render(React.createElement(BattleView, { locationId }))
}

describe('BattleView — form-up preview', () => {
  it('prompts to pick a location when none is focused', async () => {
    useGameStore.setState({ combatLocationId: null, locations: [TEST_LOCATION] })
    await renderBattle(null)
    expect(screen.getByText(/Pick a location/i)).toBeInTheDocument()
  })

  it('places party and enemy chips for the focused location', async () => {
    useGameStore.setState({
      combatLocationId: 'loc1',
      locations: [TEST_LOCATION],
      units: [makeUnit({ id: 'u1', name: 'Ada Vale', locationId: 'loc1' })],
    })
    await renderBattle('loc1')
    expect(screen.getByText('Party (1)')).toBeInTheDocument()
    // TEST_LOCATION has monsterIds: ['wolf', 'slime'] → 2 enemies
    expect(screen.getByText('Enemies (2)')).toBeInTheDocument()
    // Player chip carries the unit's initials.
    expect(screen.getAllByText('AV').length).toBeGreaterThan(0)
  })
})

describe('BattleView — live battle', () => {
  it('renders the running battle combatants when one is active', async () => {
    const battle = createBattle({
      playerUnits: [eu({ id: 'u1', name: 'Ada Vale', str: 100, meleeRange: 10 })],
      enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 25, hp: 25, meleeRange: 10 })],
    })
    advanceRound(battle)   // produce a round with movement/attacks
    useGameStore.setState({ combatLocationId: 'loc1', locations: [TEST_LOCATION], battles: { loc1: { ...battle } } })
    await renderBattle('loc1')
    // Token identity via title (skin-independent: both the circle and sprite skins
    // set `<name> — <hp>` on the body, where initials only exist on the circle skin).
    expect(screen.getAllByTitle(/Ada Vale/).length).toBeGreaterThan(0)   // party chip
    expect(screen.getByText(/Party \(/)).toBeInTheDocument()             // legend
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
    await renderBattle('loc1')
    // The chip carries a persistent "✦ Lightning Bolt" channel badge AND the
    // cast_start event surfaces a floating "✦ Lightning Bolt" label — either is
    // the casting indicator; we just want at least one present.
    expect(screen.getAllByText(/Lightning Bolt/).length).toBeGreaterThan(0)
  })
})
