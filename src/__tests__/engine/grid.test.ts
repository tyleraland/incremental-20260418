import { describe, it, expect } from 'vitest'
import { distance, rankOf, rowsFromEdge, isPerimeter, startingPosition, createBattle, ROWS, COLS } from '@/engine'
import { moveToward, enforceSeparation, attackReach } from '@/engine/grid'
import { combatant, eu } from './helpers'

describe('grid: distance (§2.2)', () => {
  it('is Euclidean', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(distance({ x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(Math.SQRT2)
  })
})

describe('grid: ranks & zones (§2.3)', () => {
  it('rowsFromEdge mirrors for the enemy team', () => {
    expect(rowsFromEdge('player', 2)).toBe(2)
    expect(rowsFromEdge('enemy', ROWS - 2)).toBe(2)
  })

  it('classifies rank from current Y relative to the team edge', () => {
    expect(rankOf(combatant({ team: 'player', pos: { x: 2, y: 3 } }))).toBe('front')
    expect(rankOf(combatant({ team: 'player', pos: { x: 2, y: 9 } }))).toBe('mid')
    expect(rankOf(combatant({ team: 'player', pos: { x: 2, y: 20 } }))).toBe('back')
    expect(rankOf(combatant({ team: 'enemy', pos: { x: 2, y: ROWS - 3 } }))).toBe('front')
  })

  it('flags the perimeter columns', () => {
    expect(isPerimeter({ x: 1, y: 5 })).toBe(true)
    expect(isPerimeter({ x: COLS - 1, y: 5 })).toBe(true)
    expect(isPerimeter({ x: COLS / 2, y: 5 })).toBe(false)
  })
})

describe('grid: starting positions', () => {
  it('forms teams up on opposite sides of the arena center', () => {
    const p = startingPosition('player', 'front', 0)
    const e = startingPosition('enemy', 'front', 0)
    expect(p.y).toBeLessThan(ROWS / 2)          // player below center
    expect(e.y).toBeGreaterThan(ROWS / 2)       // enemy above center
    expect((ROWS / 2 - p.y)).toBeCloseTo(e.y - ROWS / 2)   // symmetric
  })

  it('puts ranged/back units behind melee/front units', () => {
    expect(startingPosition('player', 'back', 0).y)
      .toBeLessThan(startingPosition('player', 'front', 0).y)   // player back is nearer its own (lower) edge
    expect(startingPosition('enemy', 'back', 0).y)
      .toBeGreaterThan(startingPosition('enemy', 'front', 0).y)
  })

  it('centers the formation (first unit takes the middle column)', () => {
    expect(startingPosition('player', 'front', 0).x).toBe(Math.floor(COLS / 2) + 0.5)
  })

  it('stacks same-rank units past the grid width into deeper rows', () => {
    // an index past the grid width wraps to a deeper row, toward the team's own edge
    expect(startingPosition('player', 'front', COLS).y).toBeLessThan(startingPosition('player', 'front', 0).y)
    expect(startingPosition('enemy', 'front', COLS).y).toBeGreaterThan(startingPosition('enemy', 'front', 0).y)
  })

  it('deploys an arbitrarily large party with no two units co-located', () => {
    const players = Array.from({ length: 9 }, (_, i) => eu({ id: `u${i}` }))   // all front rank
    const b = createBattle({ playerUnits: players, enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    const spots = b.combatants
      .filter((c) => c.team === 'player')
      .map((c) => `${c.pos.x.toFixed(3)},${c.pos.y.toFixed(3)}`)
    expect(new Set(spots).size).toBe(9)
  })
})

describe('grid: movement (§2.5)', () => {
  it('steps toward the target by at most the speed and stops at reach', () => {
    const mover = combatant({ id: 'm', pos: { x: 0.5, y: 0 }, meleeRange: 1.2 })
    const target = combatant({ id: 't', pos: { x: 0.5, y: 5 } })
    const moved = moveToward(mover, target, 0.6, [mover, target])
    expect(moved).toBe(true)
    expect(mover.pos.y).toBeCloseTo(0.6)
  })

  it('does not move once already within reach', () => {
    const mover = combatant({ id: 'm', pos: { x: 0.5, y: 0 }, meleeRange: 1.2 })
    const target = combatant({ id: 't', pos: { x: 0.5, y: 1 } })
    const moved = moveToward(mover, target, 0.6, [mover, target])
    expect(moved).toBe(false)
  })

  it('a ranged unit stops at its ranged range', () => {
    const mover = combatant({ id: 'm', pos: { x: 0.5, y: 0 }, meleeRange: 1.2, rangedRange: 3 })
    expect(attackReach(mover)).toBe(3)
    const target = combatant({ id: 't', pos: { x: 0.5, y: 3.4 } })
    // distance 3.4, reach 3 → only 0.4 to close, capped below speed
    const moved = moveToward(mover, target, 0.6, [mover, target])
    expect(moved).toBe(true)
    expect(mover.pos.y).toBeCloseTo(0.4)
  })
})

describe('grid: separation (§2.4)', () => {
  it('pushes two overlapping units to the minimum separation', () => {
    const a = combatant({ id: 'a', index: 0, pos: { x: 1, y: 1.0 } })
    const b = combatant({ id: 'b', index: 1, pos: { x: 1, y: 0.5 } })
    enforceSeparation(a, [a, b])
    expect(distance(a.pos, b.pos)).toBeCloseTo(0.7, 5)
  })
})
