// Level-of-detail tokens: when the open-world camera is zoomed far out (party
// spread wide → many tiny tokens), BattleChip drops the floating name/HP plate
// and renders just the circle; zoomed in (a tight group or single hero), the
// full label returns. The chip's title is kept either way as a stable handle.
import { describe, it, expect, beforeEach } from 'vitest'
import { render, within, cleanup, fireEvent } from '@testing-library/react'
import { useGameStore } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'
import { createBattle, addCombatant, type BattleState } from '@/engine'
import { eu } from '../engine/helpers'
import type { Location } from '@/types'

const LOC: Location = {
  id: 'L1', region: 'world', name: 'Field', description: '', traits: [],
  monsterIds: ['x'], familiarityMax: 100, connections: [], openWorld: true, openWorldSize: 80,
}

beforeEach(() => cleanup())

function openBattle(spread: boolean): BattleState {
  const b = createBattle({ playerUnits: [], enemyUnits: [], mode: 'open', cols: 80, rows: 80 })
  addCombatant(b, eu({ id: 'h1', name: 'Hero', team: 'player', visionRange: 10 }), 'player', undefined, { x: 40, y: 40 })
  // A far second hero blows the auto-fit zoom past the LOD threshold (18 cells).
  if (spread) addCombatant(b, eu({ id: 'h2', name: 'Mate', team: 'player', visionRange: 10 }), 'player', undefined, { x: 40, y: 70 })
  b.events = []
  return b
}

function show(b: BattleState) {
  useGameStore.setState({ units: [], equipment: [], locations: [LOC], battles: { L1: b } })
  return render(<BattleView locationId="L1" />)
}
const arena = (c: HTMLElement) => c.querySelector('.aspect-square') as HTMLElement

describe('level-of-detail tokens', () => {
  it('shows the floating name when zoomed in (tight party)', () => {
    const { container } = show(openBattle(false))   // single hero → min 15-cell zoom
    const a = within(arena(container))
    expect(a.getByText('Hero')).toBeTruthy()         // full-detail label
    expect(a.getByTitle(/Hero —/)).toBeTruthy()
  })

  it('drops the floating name when zoomed out, keeping the chip (title)', () => {
    const { container } = show(openBattle(true))     // spread party → zoomed out past LOD
    const a = within(arena(container))
    expect(a.queryByText('Hero')).toBeNull()         // label dropped (LOD)
    expect(a.getByTitle(/Hero —/)).toBeTruthy()      // bare circle still there
  })

  it('drops labels when many tokens are on-screen, even zoomed in (dense swarm)', () => {
    // One hero (tight 15-cell zoom) but 18 foes packed around them → on-screen
    // token count trips LOD despite the zoom being well within the cell threshold.
    const b = createBattle({ playerUnits: [], enemyUnits: [], mode: 'open', cols: 16, rows: 16 })
    addCombatant(b, eu({ id: 'h1', name: 'Hero', team: 'player', visionRange: 10 }), 'player', undefined, { x: 8, y: 8 })
    for (let i = 0; i < 18; i++) {
      addCombatant(b, eu({ id: `e${i}`, name: `Foe${i}`, team: 'enemy' }), 'enemy', undefined, { x: 6 + (i % 4), y: 6 + Math.floor(i / 4) })
    }
    b.events = []
    const a = within(arena(show(b).container))
    expect(a.queryByText('Hero')).toBeNull()         // LOD by on-screen count
    expect(a.getByTitle(/Hero —/)).toBeTruthy()
  })

  it('expands only the selected token while the scene remains in low detail', () => {
    const { container } = show(openBattle(true))
    const a = within(arena(container))
    expect(a.queryByText('Hero')).toBeNull()
    fireEvent.click(a.getByTitle(/Hero —/))
    expect(a.getByText('Hero')).toBeTruthy()
    expect(a.queryByText('Mate')).toBeNull()
  })
})
