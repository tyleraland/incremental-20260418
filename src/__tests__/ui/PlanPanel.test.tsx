// §plan debug: the Debug tab's Plan panel — the live plan-layer readout
// (cast-now forecast, anchor vs lock, LoS/exposure, route pricing, blink,
// posture). Wiring smoke tests: does the panel render the engine's actual
// answers for a real battle state.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { DebugTab } from '@/components/BattleUnitSheet'
import { createBattle, issueMoveOrder, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from '../engine/helpers'
import { resetStore } from '../helpers'

beforeEach(() => resetStore({}))
afterEach(() => cleanup())

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

function mageBattle() {
  const b = createBattle({
    playerUnits: [eu({
      id: 'mage', name: 'Mage', int: 25, str: 2, rangedRange: 6, maxHp: 200, hp: 200,
      skills: [buildEngineSkill('fire-bolt', 1)!], tactics: [{ id: 'kiter', rank: 1 }],
      posture: 'wary', moveAbilities: [{ kind: 'teleport', range: 8, cooldown: 25, needsLoS: true }],
    })],
    enemyUnits: [eu({ id: 'slime', name: 'Slime', team: 'enemy', maxHp: 100, hp: 100 })],
    mode: 'open', cols: 30, rows: 30,
  })
  find(b, 'mage').pos = { x: 8, y: 8 }
  find(b, 'slime').pos = { x: 8, y: 12 }   // 4 away — inside bolt range, clear shot
  find(b, 'mage').lockedTargetId = 'slime'
  return b
}

describe('Plan panel (Debug tab)', () => {
  it('shows the live forecast, anchor, posture and blink state', () => {
    const b = mageBattle()
    render(<DebugTab c={find(b, 'mage')} battle={b} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText(/Fire Bolt → Slime/)).toBeInTheDocument()        // cast-now forecast
    expect(screen.getByText(/anchor vs Slime/)).toBeInTheDocument()          // preferred attack + ring
    expect(screen.getByText('wary')).toBeInTheDocument()                     // posture id
    expect(screen.getByText(/clear shot/)).toBeInTheDocument()               // LoS from here
    expect(screen.getByText(/blink r8/)).toBeInTheDocument()                 // ability + cooldown state
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('shows route price vs budget (and the clearing flag) while marching avoid', () => {
    const b = mageBattle()
    issueMoveOrder(b, 'mage', { x: 25, y: 8 }, 'avoid')
    find(b, 'mage').travelClearing = true
    render(<DebugTab c={find(b, 'mage')} battle={b} />)
    expect(screen.getByText(/route price/)).toBeInTheDocument()
    expect(screen.getByText(/vs budget/)).toBeInTheDocument()
    expect(screen.getByText(/clearing first/)).toBeInTheDocument()
  })
})
