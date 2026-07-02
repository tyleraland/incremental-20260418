// Battlefield skin seam: the store's `battleSkin` swaps the token body (circle ↔
// paper) at runtime without touching the chip contract — the per-token `title`
// stays the stable handle either way (Lod.test relies on it), and the paper body
// is pure render (no engine/store reads). Also pins the boot resolution order.
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useGameStore } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'
import { createBattle, addCombatant, type BattleState } from '@/engine'
import { bootBattleSkin } from '@/render/skins'
import { eu } from '../engine/helpers'
import type { Location } from '@/types'

const LOC: Location = {
  id: 'L1', region: 'world', name: 'Field', description: '', traits: [],
  monsterIds: ['x'], familiarityMax: 100, connections: [], openWorld: true, openWorldSize: 80,
}

function openBattle(): BattleState {
  const b = createBattle({ playerUnits: [], enemyUnits: [], mode: 'open', cols: 80, rows: 80 })
  addCombatant(b, eu({ id: 'h1', name: 'Hero', team: 'player', visionRange: 10 }), 'player', undefined, { x: 40, y: 40 })
  addCombatant(b, eu({ id: 'e1', name: 'Foe', team: 'enemy' }), 'enemy', undefined, { x: 42, y: 40 })
  b.events = []
  return b
}

function show(b: BattleState) {
  useGameStore.setState({ units: [], equipment: [], locations: [LOC], battles: { L1: b } })
  return render(<BattleView locationId="L1" />)
}

beforeEach(() => {
  cleanup()
  localStorage.removeItem('battle-skin')
  useGameStore.setState({ battleSkin: 'circle' })
})

describe('battlefield skins', () => {
  it('renders circle bodies by default, with the chip title handle', () => {
    const { container, getByTitle } = show(openBattle())
    expect(container.querySelectorAll('[data-skin="circle"]').length).toBe(2)
    expect(getByTitle(/Hero —/)).toBeTruthy()   // title rides the chip wrapper
    expect(container.querySelector('[data-skin="paper"]')).toBeNull()
  })

  it('battleSkin=paper swaps every token body, keeping the title handle', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const { container, getByTitle } = show(openBattle())
    const bodies = container.querySelectorAll('[data-skin="paper"]')
    expect(bodies.length).toBe(2)
    expect(getByTitle(/Hero —/)).toBeTruthy()
    expect(container.querySelector('[data-skin="circle"]')).toBeNull()
    // the paper skin carries facing in the body — the separate FacingNub is gone,
    // and the body brings its own vector shapes
    expect(bodies[0].querySelector('svg')).toBeTruthy()
  })

  it('bootBattleSkin: localStorage > default, garbage ignored', () => {
    expect(bootBattleSkin()).toBe('circle')
    localStorage.setItem('battle-skin', 'paper')
    expect(bootBattleSkin()).toBe('paper')
    localStorage.setItem('battle-skin', 'sprite-sheet-3000')
    expect(bootBattleSkin()).toBe('circle')
  })
})
