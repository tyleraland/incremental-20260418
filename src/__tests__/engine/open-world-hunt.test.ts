// §hunt — open-world party routing via the blackboard. With nothing locked, the
// planner commits the whole party to the nearest enemy ANY member can *see*
// (fog-of-war) and routes them there together; it holds that commitment while the
// target stays seen + reachable, and falls back to roaming when nothing's in
// sight. Per-unit target acquisition still gates on vision — this only steers the
// group toward known prey.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, defaultPlanner, type BattleState, type Barrier } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)
const seedPlan = (b: BattleState, huntTargetId: string | null = null) => {
  b.plans.player = { waypoint: null, focusTargetId: null, threat: {}, huntTargetId }
}

describe('open-world hunt routing', () => {
  it('routes the party to a seen enemy (huntTargetId + waypoint on the prey)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, moveSpeed: 0 })],
      mode: 'open', cols: 60, rows: 60,
    })
    find(b, 'p').pos = { x: 20, y: 20 }
    find(b, 'e').pos = { x: 26, y: 20 }   // dist 6 ≤ vision → seen at the round-1 planner (before locks)
    advanceRound(b)
    expect(b.plans.player!.huntTargetId).toBe('e')
    expect(dist(b.plans.player!.waypoint!, { x: 26, y: 20 })).toBeLessThan(0.001)
  })

  it('fog of war: ignores an unseen enemy (roams), commits once it is in sight', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, moveSpeed: 0 })],
      mode: 'open', cols: 100, rows: 100,
    })
    find(b, 'p').pos = { x: 10, y: 10 }
    find(b, 'e').pos = { x: 80, y: 80 }   // ~99 away, out of sight
    advanceRound(b)
    expect(b.plans.player!.huntTargetId).toBeNull()   // never committed to an unseen foe
    expect(b.plans.player!.waypoint).not.toBeNull()   // still roaming to explore

    // Bring the foe into the party's sight → it commits.
    find(b, 'p').pos = { x: 74, y: 80 }   // now dist 6 ≤ vision 10
    advanceRound(b)
    expect(b.plans.player!.huntTargetId).toBe('e')
  })

  it('tight group: a far member is routed in and closes on the prey', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', visionRange: 10 }), eu({ id: 'far', visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 99999, hp: 99999, moveSpeed: 0 })],
      mode: 'open', cols: 80, rows: 80,
    })
    find(b, 'a').pos = { x: 20, y: 20 }
    find(b, 'e').pos = { x: 24, y: 20 }    // 'a' sees it (dist 4)
    find(b, 'far').pos = { x: 55, y: 20 }  // 26 away — sees nothing on its own
    const before = dist(find(b, 'far').pos, find(b, 'e').pos)
    // Roaming/routing now travels at combat pace (WANDER_SPEED_MULT = 1), so the
    // far member needs a few more rounds to cover the same ground.
    for (let r = 0; r < 14; r++) advanceRound(b)
    const after = dist(find(b, 'far').pos, find(b, 'e').pos)
    expect(after).toBeLessThan(before - 10)   // routed toward the shared objective, not roaming off
  })

  it('holds the committed target instead of swapping to a marginally-nearer one', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 20 })],
      enemyUnits: [eu({ id: 'e1', team: 'enemy' }), eu({ id: 'e2', team: 'enemy' })],
      mode: 'open', cols: 60, rows: 60,
    })
    find(b, 'p').pos = { x: 30, y: 30 }
    find(b, 'e1').pos = { x: 32, y: 30 }   // nearer (dist 2)
    find(b, 'e2').pos = { x: 45, y: 30 }   // farther (dist 15) but already committed

    seedPlan(b, 'e2')
    expect(defaultPlanner(b, 'player').huntTargetId).toBe('e2')   // keeps the commitment

    seedPlan(b, null)
    expect(defaultPlanner(b, 'player').huntTargetId).toBe('e1')   // fresh pick → nearest
  })

  it('rounds a wall to reach a foe parked at the vision edge (no oscillation)', () => {
    // Reproduces the "Davan stuck" bug: a hero boxed between two walls, with a
    // REACHABLE foe parked just past plain vision. The only route opens the gap
    // past sight while marching around — so without hunt-retention hysteresis +
    // the engaged-needs-vision gate, the hero locks/loses the foe at the boundary
    // each round and oscillates in place instead of rounding the wall.
    const walls: Barrier[] = [
      { x: 34, y: 22, w: 3, h: 16, kind: 'wall' },   // vertical wall between hero and foe
      { x: 14, y: 38, w: 18, h: 3, kind: 'wall' },   // horizontal wall boxing the pocket
    ]
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 10, moveSpeed: 2.2 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 99999, hp: 99999, moveSpeed: 0 })],
      mode: 'open', cols: 60, rows: 60, barriers: walls,
    })
    find(b, 'p').pos = { x: 33, y: 38.5 }
    find(b, 'e').pos = { x: 38, y: 29.6 }   // ~10.2 away — reachable only around the wall
    const before = dist(find(b, 'p').pos, find(b, 'e').pos)
    expect(before).toBeGreaterThan(10)
    for (let r = 0; r < 70; r++) advanceRound(b)
    const after = dist(find(b, 'p').pos, find(b, 'e').pos)
    expect(after).toBeLessThan(3)   // closed to melee — committed to the detour, didn't dither
  })

  it('does not commit to a seen-but-unreachable enemy (walled off → roam)', () => {
    const wall: Barrier[] = [{ x: 19, y: 0, w: 2, h: 40, kind: 'wall' }]
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 40 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 40, rows: 40, barriers: wall,
    })
    find(b, 'p').pos = { x: 5, y: 20 }
    find(b, 'e').pos = { x: 35, y: 20 }   // within vision 40 but the other side of a solid wall
    seedPlan(b, null)
    expect(defaultPlanner(b, 'player').huntTargetId).toBeNull()   // reachability gate → don't freeze toward it
  })
})
