// Reproduction + regression for the open-world "wander jitter" bug: a party
// idling (nothing in sight) takes endless tiny left-right-left steps instead of
// roaming out across the field. Root cause: when the party "arrives" at its
// roam waypoint, the planner re-picked a fresh random interior point that could
// land right on top of them — so they step a hair, immediately "arrive" again,
// re-pick a nearby point in a new direction, and churn in place. The fix makes
// each fresh waypoint genuinely far, so the party commits to a long traverse.
// Also stresses pathing through a barrier-heavy spiral map.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, type BattleState, type Barrier } from '@/engine'
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
})
