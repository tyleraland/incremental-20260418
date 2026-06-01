// Reproduction + regression for the open-world "wander jitter" bug: a party
// idling (nothing in sight) takes endless tiny left-right-left steps instead of
// roaming out across the field. Root cause: when the party "arrives" at its
// roam waypoint, the planner re-picked a fresh random interior point that could
// land right on top of them — so they step a hair, immediately "arrive" again,
// re-pick a nearby point in a new direction, and churn in place. The fix makes
// each fresh waypoint genuinely far, so the party commits to a long traverse.
// Also stresses pathing through a barrier-heavy spiral map.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, canReach, type BattleState, type Barrier } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

function partyCentroid(b: BattleState) {
  const ps = b.combatants.filter((c) => c.team === 'player' && c.alive)
  return { x: ps.reduce((s, c) => s + c.pos.x, 0) / ps.length, y: ps.reduce((s, c) => s + c.pos.y, 0) / ps.length }
}

function cornerParty(size: number): BattleState {
  const b = createBattle({
    playerUnits: [
      eu({ id: 'a', team: 'player', visionRange: 10 }),
      eu({ id: 'bb', team: 'player', visionRange: 10 }),
      eu({ id: 'c', team: 'player', visionRange: 10 }),
    ],
    enemyUnits: [],
    mode: 'open', cols: size, rows: size,
  })
  find(b, 'a').pos = { x: 1.5, y: 1.5 }
  find(b, 'bb').pos = { x: 2.5, y: 1.5 }
  find(b, 'c').pos = { x: 1.5, y: 2.5 }
  return b
}

describe('open-world wander — no corner jitter', () => {
  it('every fresh roam waypoint is far from the party (no near re-picks)', () => {
    const b = cornerParty(50)
    let prevKey = ''
    let minRepickDist = Infinity
    for (let r = 0; r < 200; r++) {
      advanceRound(b)
      const wp = b.plans.player!.waypoint!
      const key = `${wp.x.toFixed(2)},${wp.y.toFixed(2)}`
      if (key !== prevKey) {
        // A waypoint just changed: it should be a genuine "go somewhere" target,
        // not a point sitting on top of the party (which causes tiny-step churn).
        minRepickDist = Math.min(minRepickDist, dist(wp, partyCentroid(b)))
        prevKey = key
      }
    }
    expect(minRepickDist).toBeGreaterThan(10)
  })

  it('a cornered party roams out without tiny-stepping', () => {
    const b = cornerParty(50)
    const ids = ['a', 'bb', 'c']
    const start: Record<string, { x: number; y: number }> = {}
    const prev: Record<string, { x: number; y: number }> = {}
    const tiny: Record<string, number> = {}
    const maxFrom: Record<string, number> = {}
    for (const id of ids) { start[id] = { ...find(b, id).pos }; prev[id] = { ...find(b, id).pos }; tiny[id] = 0; maxFrom[id] = 0 }
    const fullStep = 0.9 * 4   // moveSpeed * WANDER_SPEED_MULT
    const rounds = 60
    for (let r = 0; r < rounds; r++) {
      advanceRound(b)
      for (const id of ids) {
        const p = find(b, id).pos
        const step = dist(p, prev[id])
        if (step > 0.01 && step < fullStep * 0.4) tiny[id]++   // a "tiny step"
        maxFrom[id] = Math.max(maxFrom[id], dist(p, start[id]))
        prev[id] = { ...p }
      }
    }
    for (const id of ids) {
      expect(maxFrom[id]).toBeGreaterThan(20)   // genuinely roamed away
      expect(tiny[id]).toBeLessThan(rounds * 0.15)   // not churning in place
    }
  })
})

describe('open-world wander — no terrain freeze', () => {
  // Regression: the per-unit waypoint fan-out could shove a roamer's target
  // inside a wall (or into an unroutable pocket), and the "hold if unreachable"
  // movement guard then froze it forever ("stuck wanderer" on the Overgrown
  // Ruins). It must fall back to the reachable shared waypoint and keep moving.
  function ruinsBarriers(): Barrier[] {
    return [
      { x: 18, y: 14, w: 3, h: 14, kind: 'wall' },
      { x: 34, y: 22, w: 3, h: 16, kind: 'wall' },
      { x: 14, y: 38, w: 18, h: 3, kind: 'wall' },
      { x: 40, y: 8, w: 12, h: 3, kind: 'wall' },
      { x: 24, y: 44, w: 3, h: 12, kind: 'wall' },
    ]
  }

  it('a wanderer pinned beside a wall roams away instead of freezing', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 10, moveSpeed: 0.9 })],
      enemyUnits: [], mode: 'open', cols: 60, rows: 60, barriers: ruinsBarriers(),
    })
    find(b, 'a').pos = { x: 18.1, y: 28.4 }   // right at the foot of the first wall
    const start = { ...find(b, 'a').pos }
    let maxFromStart = 0
    for (let r = 0; r < 60; r++) {
      advanceRound(b)
      maxFromStart = Math.max(maxFromStart, dist(find(b, 'a').pos, start))
    }
    expect(maxFromStart).toBeGreaterThan(15)   // genuinely roamed off, not stuck
  })
})

describe('open-world wander — no rim ping-pong', () => {
  // Regression: when the shared waypoint sits within a couple cells of an edge,
  // the per-unit fan-out shoved each target *off* the arena. Aiming off-map, a
  // unit can't make straight progress into the rim, so it slides sideways along
  // it a full step and diagonals back the next round — two units do this in
  // lockstep and ping-pong left/right forever, cancelling each other's movement
  // out (the reported bug: a party stuck stepping at the top edge, y pinned at 0,
  // x oscillating). Clamping the offset into bounds gives each a reachable spot
  // it can actually arrive at and hold.
  it('two units settle at a near-edge waypoint instead of oscillating', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'a', team: 'player', visionRange: 10 }),
        eu({ id: 'bb', team: 'player', visionRange: 10 }),
      ],
      enemyUnits: [],
      mode: 'open', cols: 50, rows: 50,
      // Pin the shared waypoint one cell off the top edge (as captured live).
      planner: () => ({ waypoint: { x: 32, y: 1 }, focusTargetId: null, threat: {}, huntTargetId: null }),
    })
    find(b, 'a').pos = { x: 31.5, y: 5 }
    find(b, 'bb').pos = { x: 32.5, y: 5 }
    // Let them travel in and settle.
    for (let r = 0; r < 10; r++) advanceRound(b)
    const prev: Record<string, { x: number; y: number }> = { a: { ...find(b, 'a').pos }, bb: { ...find(b, 'bb').pos } }
    let maxStep = 0
    for (let r = 0; r < 20; r++) {
      advanceRound(b)
      for (const id of ['a', 'bb']) {
        const p = find(b, id).pos
        expect(p.y).toBeGreaterThanOrEqual(0)   // stays in-bounds
        maxStep = Math.max(maxStep, dist(p, prev[id]))
        prev[id] = { ...p }
      }
    }
    expect(maxStep).toBeLessThan(0.1)   // settled and holding, not ping-ponging
  })
})

describe('barrier pathing — thread to the centre', () => {
  // "Can units path to the centre of a barrier-heavy map?" Modelled as a pathing
  // question (not wander): a target sits at the centre and the hunter has the
  // vision to lock it, so this exercises moveToward → steerAround threading the
  // corridors rather than random roaming. A single concentric ring with one gap
  // makes the only route to the centre go around through the opening.
  function ringBarriers(): Barrier[] {
    const w = 1.5
    return [
      { x: 12, y: 12, w: 16, h: w },        // ring top
      { x: 12, y: 26.5, w: 16, h: w },      // ring bottom
      { x: 12, y: 12, w: w, h: 16 },        // ring left
      { x: 26.5, y: 12, w: w, h: 6 },       // ring right upper (gap at y 18..22)
      { x: 26.5, y: 22, w: w, h: 6 },       // ring right lower
    ]
  }

  it('a hunter threads the ring gap to reach a target at the centre', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: Infinity, str: 1 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999 })],
      mode: 'open', cols: 40, rows: 40,
      barriers: ringBarriers(),
    })
    find(b, 'a').pos = { x: 38, y: 20 }   // outside the ring, lined up with the gap
    find(b, 'e').pos = { x: 20, y: 20 }   // dead centre, inside the ring
    let closest = dist(find(b, 'a').pos, find(b, 'e').pos)
    for (let r = 0; r < 120; r++) {
      advanceRound(b)
      closest = Math.min(closest, dist(find(b, 'a').pos, find(b, 'e').pos))
    }
    // Reaches melee reach of the centre target → it threaded the gap inward.
    expect(closest).toBeLessThan(2)
  })

  // A two-ring spiral: outer ring with a gap on the right, inner ring with a gap
  // on the left, so the only route to the centre winds through both openings.
  // Terrain is fully known (line-of-sight is fog-of-war for *units*, not walls),
  // so steerAround routes over the whole barrier set and threads it.
  function spiralBarriers(): Barrier[] {
    const w = 1.5
    return [
      { x: 6, y: 6, w: 28, h: w }, { x: 6, y: 32.5, w: 28, h: w }, { x: 6, y: 6, w: w, h: 28 },
      { x: 32.5, y: 6, w: w, h: 11 }, { x: 32.5, y: 23, w: w, h: 11 },          // outer gap right
      { x: 13, y: 13, w: 14, h: w }, { x: 13, y: 25.5, w: 14, h: w }, { x: 25.5, y: 13, w: w, h: 14 },
      { x: 13, y: 13, w: w, h: 4 }, { x: 13, y: 23, w: w, h: 4 },               // inner gap left
    ]
  }

  it('a hunter threads a two-ring spiral to the centre (known structure)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: Infinity, str: 1 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, moveSpeed: 0 })],
      mode: 'open', cols: 40, rows: 40,
      barriers: spiralBarriers(),
    })
    find(b, 'a').pos = { x: 38, y: 20 }
    find(b, 'e').pos = { x: 20, y: 20 }   // spiral centre
    let closest = dist(find(b, 'a').pos, find(b, 'e').pos)
    for (let r = 0; r < 200; r++) {
      advanceRound(b)
      closest = Math.min(closest, dist(find(b, 'a').pos, find(b, 'e').pos))
    }
    expect(closest).toBeLessThan(2)
  })
})

describe('reachability — give up on the impossible', () => {
  // A 40×40 map split by a solid full-height wall, no gap. A unit on one side
  // cannot reach a target on the other.
  function fullWall(): Barrier[] {
    return [{ x: 19, y: 0, w: 2, h: 40, kind: 'wall' as const }]
  }

  it('canReach is false across an impassable wall, true on the same side', () => {
    const wall = fullWall()
    expect(canReach({ x: 5, y: 20 }, { x: 35, y: 20 }, wall)).toBe(false)
    expect(canReach({ x: 5, y: 20 }, { x: 15, y: 30 }, wall)).toBe(true)
  })

  it('a unit gives up (holds) instead of grinding into the wall', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: Infinity, str: 1 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, moveSpeed: 0 })],
      mode: 'open', cols: 40, rows: 40,
      barriers: fullWall(),
    })
    find(b, 'a').pos = { x: 5, y: 20 }
    find(b, 'e').pos = { x: 35, y: 20 }   // unreachable: other side of the wall
    // Let it settle, then confirm it isn't creeping toward the wall round after round.
    for (let r = 0; r < 20; r++) advanceRound(b)
    const settled = { ...find(b, 'a').pos }
    for (let r = 0; r < 20; r++) advanceRound(b)
    const after = find(b, 'a').pos
    expect(after.x).toBeLessThan(19)                 // never crossed / sat on the wall
    expect(dist(after, settled)).toBeLessThan(0.5)   // stopped trying (held position)
  })

  it('reachability is dynamic: dropping the wall (e.g. a party buff) opens the route', () => {
    const wall: Barrier[] = [{ x: 19, y: 0, w: 2, h: 40, kind: 'wall' }]
    const from = { x: 5, y: 20 }, target = { x: 35, y: 20 }
    expect(canReach(from, target, wall)).toBe(false)   // walled off
    expect(canReach(from, target, [])).toBe(true)      // buff drops the barrier → reachable
  })
})
