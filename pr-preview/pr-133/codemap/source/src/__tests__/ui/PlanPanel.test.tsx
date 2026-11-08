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

  // §coordination (M0): the Blackboard renders the TeamPlan v2 fields when a
  // plan carries them, plus the always-on acumen line; absent fields render
  // nothing (first test above covers the absent case implicitly).
  it('renders TeamPlan v2 fields + objective + acumen when present', () => {
    const b = mageBattle()
    b.plans.player = {
      waypoint: null, focusTargetId: null, threat: {},
      engagement: { targetIds: ['slime'], primaryId: 'slime', anchor: { x: 12, y: 8 }, stance: 'hold', sinceRound: 3 },
      assignments: { mage: { role: 'pull', targetId: 'slime', to: { x: 12, y: 8 } } },
      avoidTargetIds: ['slime'],
      corridor: { x: 9, y: 9 },
    }
    b.objectives = { player: { kind: 'hold', point: { x: 12, y: 8 } } }
    render(<DebugTab c={find(b, 'mage')} battle={b} />)
    expect(screen.getByText(/stance hold · anchor \(12,8\) · pull 1 · since R3/)).toBeInTheDocument()
    expect(screen.getByText(/pull Slime → \(12\.0,8\.0\)/)).toBeInTheDocument()  // this unit's assignment
    expect(screen.getByText(/avoid/)).toBeInTheDocument()
    expect(screen.getByText(/corridor/)).toBeInTheDocument()
    expect(screen.getByText(/hold \(12,8\)/)).toBeInTheDocument()               // objective
    expect(screen.getByText(/acumen/)).toBeInTheDocument()
    expect(screen.getByText(/pull ✗ · stance ✗/)).toBeInTheDocument()           // solo int-25 mage (acumen 25) clears no gate
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
