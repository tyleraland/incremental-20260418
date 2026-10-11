// Finer rounds (BattleState.timeScale = N): N engine rounds == one logical round.
// The real-time behaviour must be unchanged — units cross the same ground per
// logical round, basic attacks land at the same rate, etc. — only the granularity
// (and thus the animation) is finer. timeScale 1 is the default and unchanged.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('finer rounds (timeScale)', () => {
  it('moves the same real distance: scale 2 over 2 rounds == scale 1 over 1 round', () => {
    const mk = (ts: number) => {
      const b = createBattle({
        playerUnits: [eu({ id: 'p', moveSpeed: 2 })],
        enemyUnits: [eu({ id: 'e', team: 'enemy' })],
        cols: 40, rows: 40, timeScale: ts,
      })
      find(b, 'p').pos = { x: 20, y: 5 }
      find(b, 'e').pos = { x: 20, y: 35 }   // far away → p just advances straight toward it
      return b
    }
    const b1 = mk(1); advanceRound(b1)
    const b2 = mk(2); advanceRound(b2); advanceRound(b2)
    expect(find(b2, 'p').pos.y).toBeCloseTo(find(b1, 'p').pos.y, 1)   // same net displacement
    // and each finer round is a *smaller* step than the coarse one
    const b2step = mk(2); const y0 = find(b2step, 'p').pos.y; advanceRound(b2step)
    expect(find(b2step, 'p').pos.y - y0).toBeLessThan(find(b1, 'p').pos.y - 5)
  })

  it('basic attacks land at the same real rate (gated to once per logical round)', () => {
    const mk = (ts: number) => createBattle({
      playerUnits: [eu({ id: 'p', str: 10, meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, maxHp: 9999, hp: 9999, meleeRange: 30 })],
      timeScale: ts,
    })
    const count = (b: BattleState) => b.events.filter((e) => e.type === 'melee_attack' && e.sourceId === 'p').length
    const b1 = mk(1); advanceRound(b1); advanceRound(b1)            // 2 logical rounds
    const b2 = mk(2); for (let i = 0; i < 4; i++) advanceRound(b2)  // 4 finer == 2 logical
    expect(count(b1)).toBe(2)
    expect(count(b2)).toBe(count(b1))   // same number of real swings
  })

  it('a draw still resolves at the same real time (maxRounds scales)', () => {
    const mk = (ts: number) => createBattle({
      // two harmless units that never kill → runs to the draw timeout
      playerUnits: [eu({ id: 'p', str: 0, meleeRange: 0, moveSpeed: 0 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, meleeRange: 0, moveSpeed: 0 })],
      maxRounds: 6, timeScale: ts,
    })
    const b1 = mk(1); let r1 = 0; while (b1.outcome === 'ongoing' && r1 < 100) { advanceRound(b1); r1++ }
    const b2 = mk(2); let r2 = 0; while (b2.outcome === 'ongoing' && r2 < 100) { advanceRound(b2); r2++ }
    expect(b1.outcome).toBe('draw')
    expect(b2.outcome).toBe('draw')
    expect(r2).toBe(r1 * 2)   // twice as many finer rounds for the same real timeout
  })
})
