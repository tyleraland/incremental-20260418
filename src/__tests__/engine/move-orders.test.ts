// Move orders (force-path) + explicit spawn placement. The host can command a
// unit to a point (overriding AI), and can drop a combatant at an exact spot.
// These are the primitives the game uses to deploy/spawn anywhere and that tests
// use to force pathing — incl. impossible paths a unit can't satisfy in time.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, addCombatant, issueMoveOrder, clearMoveOrder, type BattleState, type Barrier } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

// A solo battle on a `size`×`size` field — no enemies, so only the move order
// drives the unit (vs. AI targeting/wander).
function solo(size = 20, barriers: Barrier[] = []): BattleState {
  const b = createBattle({
    playerUnits: [eu({ id: 'a', team: 'player', visionRange: 10, moveSpeed: 0.9 })],
    enemyUnits: [], mode: 'open', cols: size, rows: size, barriers,
  })
  return b
}

describe('move orders — force path', () => {
  it('a clear linear path: the unit reaches the destination', () => {
    // 1×10 straight shot down an open lane.
    const b = solo(20)
    find(b, 'a').pos = { x: 5, y: 5 }
    const dest = { x: 5, y: 15 }
    issueMoveOrder(b, 'a', dest)
    let arrived = false
    for (let r = 0; r < 40 && !arrived; r++) {
      advanceRound(b)
      if (dist(find(b, 'a').pos, dest) < 0.6) arrived = true
    }
    expect(arrived).toBe(true)
    expect(find(b, 'a').moveOrder).toBeNull()   // order cleared on arrival
  })

  it('a blocked path: the unit fails to arrive within the time budget', () => {
    // The same lane, but a full-width wall seals off the destination — no route.
    const wall: Barrier[] = [{ x: 0, y: 10, w: 20, h: 1.5, kind: 'wall' }]
    const b = solo(20, wall)
    find(b, 'a').pos = { x: 5, y: 5 }
    const dest = { x: 5, y: 15 }   // walled off on the far side
    issueMoveOrder(b, 'a', dest)
    let closest = dist(find(b, 'a').pos, dest)
    for (let r = 0; r < 40; r++) {
      advanceRound(b)
      closest = Math.min(closest, dist(find(b, 'a').pos, dest))
    }
    expect(closest).toBeGreaterThan(3)            // never got near it
    expect(find(b, 'a').pos.y).toBeLessThan(10)   // never crossed / sat on the wall
    expect(find(b, 'a').moveOrder).not.toBeNull() // order still standing (unsatisfied)
  })

  it('routes around terrain to a reachable destination (a wall with a gap)', () => {
    // Wall across the lane but with a gap on the right → there IS a route.
    const wall: Barrier[] = [{ x: 0, y: 10, w: 14, h: 1.5, kind: 'wall' }]   // gap at x 14..20
    const b = solo(20, wall)
    find(b, 'a').pos = { x: 5, y: 5 }
    const dest = { x: 5, y: 16 }
    issueMoveOrder(b, 'a', dest)
    let arrived = false
    for (let r = 0; r < 80 && !arrived; r++) {
      advanceRound(b)
      if (dist(find(b, 'a').pos, dest) < 0.6) arrived = true
    }
    expect(arrived).toBe(true)   // detoured through the gap and back
  })

  it('the order overrides AI targeting — a unit marches past an enemy in sight', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 10, moveSpeed: 0.9, str: 1 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, moveSpeed: 0 })],
      mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'a').pos = { x: 5, y: 15 }
    find(b, 'e').pos = { x: 8, y: 15 }       // right next to 'a', in vision
    const dest = { x: 25, y: 15 }            // far past the enemy
    issueMoveOrder(b, 'a', dest)
    let arrived = false
    for (let r = 0; r < 40 && !arrived; r++) {
      advanceRound(b)
      if (dist(find(b, 'a').pos, dest) < 0.6) arrived = true
    }
    expect(arrived).toBe(true)            // reached the goal (marched past the enemy)
    expect(find(b, 'e').hp).toBe(9999)    // never stopped to fight
  })

  it('§travel-defend: an engage order retaliates on a hostile in range but keeps marching (no veer)', () => {
    const b = createBattle({
      // A ranged traveller (reach 8) marching straight along y=15.
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 12, moveSpeed: 0.9, str: 40, meleeRange: 1, rangedRange: 8 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 400, hp: 400, moveSpeed: 0, str: 1, def: 0 })],
      mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'a').pos = { x: 5, y: 15 }
    find(b, 'e').pos = { x: 15, y: 9 }        // OFF the march line (6 south), but within firing range as she passes
    const dest = { x: 25, y: 15 }
    issueMoveOrder(b, 'a', dest, 'retaliate')  // fire in range, but don't veer
    let arrived = false, minY = Infinity, minDistToFoe = Infinity
    for (let r = 0; r < 120 && !arrived; r++) {
      advanceRound(b)
      const a = find(b, 'a')
      minY = Math.min(minY, a.pos.y)
      minDistToFoe = Math.min(minDistToFoe, dist(a.pos, find(b, 'e').pos))
      if (dist(a.pos, dest) < 0.6) arrived = true
    }
    expect(find(b, 'e').hp).toBeLessThan(400)   // retaliated — fired on it while passing
    expect(arrived).toBe(true)                  // still reached the goal
    expect(minY).toBeGreaterThan(13)            // held her line — never veered south to chase
    expect(minDistToFoe).toBeGreaterThan(4)     // never closed in on the foe
  })

  it("§travel-defend: an 'avoid' order steers around a threat zone on the line but still reaches the goal", () => {
    const mk = (engage: 'off' | 'avoid') => {
      const b = createBattle({
        playerUnits: [eu({ id: 'a', team: 'player', visionRange: 14, moveSpeed: 0.9, str: 5, meleeRange: 1 })],
        // A stationary threat sitting ON the march line, with a modest attack range.
        enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, moveSpeed: 0, str: 1, rangedRange: 4 })],
        mode: 'open', cols: 30, rows: 30,
      })
      find(b, 'a').pos = { x: 5, y: 15 }
      find(b, 'e').pos = { x: 15, y: 15 }       // dead ahead on the y=15 line
      const dest = { x: 25, y: 15 }
      issueMoveOrder(b, 'a', dest, engage)
      let arrived = false, minDistToFoe = Infinity
      for (let r = 0; r < 160 && !arrived; r++) {
        advanceRound(b)
        minDistToFoe = Math.min(minDistToFoe, dist(find(b, 'a').pos, find(b, 'e').pos))
        if (dist(find(b, 'a').pos, dest) < 0.6) arrived = true
      }
      return { arrived, minDistToFoe }
    }
    const straight = mk('off')     // marches dead through the foe
    const avoid = mk('avoid')      // bends around its attack range
    expect(straight.arrived).toBe(true)
    expect(avoid.arrived).toBe(true)                              // avoid still reaches the goal
    expect(avoid.minDistToFoe).toBeGreaterThan(straight.minDistToFoe + 1)  // gave the threat a wider berth
  })

  it('clearMoveOrder hands the unit back to normal AI', () => {
    const b = solo(20)
    find(b, 'a').pos = { x: 5, y: 5 }
    issueMoveOrder(b, 'a', { x: 5, y: 18 })
    advanceRound(b)
    expect(find(b, 'a').moveOrder).not.toBeNull()
    clearMoveOrder(b, 'a')
    expect(find(b, 'a').moveOrder).toBeNull()
  })
})

describe('explicit spawn placement', () => {
  it('addCombatant drops a unit at an exact position', () => {
    const b = solo(40)
    const c = addCombatant(b, eu({ id: 'm', team: 'enemy' }), 'enemy', undefined, { x: 33, y: 7 })
    expect(c.pos.x).toBeCloseTo(33)
    expect(c.pos.y).toBeCloseTo(7)
    expect(b.events.some((e) => e.type === 'spawn' && e.sourceId === 'm')).toBe(true)
  })
})
