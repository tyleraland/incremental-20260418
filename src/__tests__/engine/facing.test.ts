// Facing: the unit's heading vector, used by the UI to draw a direction nub.
// Tracks the actual move delta when the unit moves, else points at its target.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('engine — facing', () => {
  it('spawns players facing up-field (+y) and enemies down-field (−y)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', team: 'player' })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    expect(find(b, 'p').facing).toEqual({ x: 0, y: 1 })
    expect(find(b, 'e').facing).toEqual({ x: 0, y: -1 })
  })

  it('points toward the move direction when the unit advances', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', team: 'player', str: 1, meleeRange: 1.2 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 999, hp: 999 })],
    })
    // Put the target straight above the player so closing in means moving +y.
    find(b, 'p').pos = { x: 7.5, y: 4 }
    find(b, 'e').pos = { x: 7.5, y: 11 }
    advanceRound(b)
    const f = find(b, 'p').facing
    expect(f.y).toBeGreaterThan(0.9)            // mostly +y
    expect(Math.abs(f.x)).toBeLessThan(0.2)
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(1) // unit vector
  })

  it('faces the locked target even while standing still (in range, no move)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', team: 'player', str: 1, meleeRange: 2 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 999, hp: 999 })],
    })
    find(b, 'p').pos = { x: 7.5, y: 7.5 }
    find(b, 'e').pos = { x: 9, y: 7.5 }   // already within reach, to the right (+x)
    advanceRound(b)
    const f = find(b, 'p').facing
    expect(f.x).toBeGreaterThan(0.9)      // faces +x toward the foe without moving
    expect(Math.abs(f.y)).toBeLessThan(0.2)
  })
})
