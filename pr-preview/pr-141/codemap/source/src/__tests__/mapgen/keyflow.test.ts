// Key-lock flow (§D key logistics): solve.ts's fixpoint solver proves every
// key acquirable (chains included, circles reported), the validator's
// `key-flow` rule gates bakes on it, and the dungeon's `keyfetch` pass places
// a real fetch detour — vault sealed until the key is held, resolved at bake
// against GenParams.heldKeys exactly like the proficiency kit.

import { describe, it, expect } from 'vitest'
import {
  generateMap, solveLockFlow, planLockFlow, routeOver, specObjectives, validate, normalizeParams,
  type CollisionRect, type Lock, type MapSpec, type NavEdge, type NavNode, type Poi,
} from '@/mapgen'
import { DUNGEON_RECIPE } from '@/mapgen/recipes/dungeon'

const SIZE = 40
const wall = (x: number, y: number, w: number, h: number): CollisionRect => ({ x, y, w, h, kind: 'wall', material: 'rock' })
// a corner pocket whose right side IS the lock's plug: bottom wall + a
// lockId-carrying seal — removing the plug opens the pocket
const plug = (x: number, lockId: string): CollisionRect => ({ x, y: 0, w: 1.2, h: 6, kind: 'wall', material: 'cut-stone', lockId })
// NW pocket (0..5 × 0..5) sealed by plug K-A at x=5; NE pocket (34.8..40 × 0..5) by K-B
const POCKET_A = [wall(0, 5, 6, 1.2), plug(5, 'K-A')]
const POCKET_B = [wall(34, 5, 6, 1.2), plug(33.8, 'K-B')]

const keyLock = (id: string, open = false): Lock =>
  ({ id, kind: 'key', at: { x: id === 'K-A' ? 5.5 : 34.5, y: 3 }, open, gates: [`${id}-prize`] })
const prizeA: Poi = { id: 'K-A-prize', kind: 'vault', at: { x: 2, y: 2 }, tags: ['prize', 'locked:K-A'] }
const prizeB: Poi = { id: 'K-B-prize', kind: 'vault', at: { x: 38, y: 2 }, tags: ['prize', 'locked:K-B'] }
const key = (id: string, at: { x: number; y: number }, extraTags: string[] = []): Poi =>
  ({ id: `${id}-key`, kind: 'key', at, tags: [`opens:${id}`, ...extraTags] })

function makeSpec(collision: CollisionRect[], pois: Poi[], locks: Lock[]): MapSpec {
  return {
    specVersion: 1, recipe: 'test', seed: 1, cols: SIZE, rows: SIZE,
    collision,
    surface: { cols: SIZE, rows: SIZE, cellsPerUnit: 1, grid: new Uint8Array(SIZE * SIZE) },
    scatter: [],
    semantic: {
      pois: [{ id: 'spawn', kind: 'spawn', at: { x: SIZE / 2, y: SIZE / 2 }, tags: [] }, ...pois],
      nav: { nodes: [], edges: [] }, locks, regionTags: [], name: null, premise: null,
      tactical: { openness: 1, barrierCount: collision.length, chokepoints: 0, longLanes: 0, coverClusters: 0 },
    },
  }
}
const params = normalizeParams({ recipe: 'test', seed: 1, size: SIZE, themes: [] })
const ruleOf = (spec: MapSpec, id: string) => validate(spec, params).rules.find((x) => x.rule === id)

describe('solveLockFlow (the fixpoint solver)', () => {
  it('single link: the key on open ground opens its lock', () => {
    const spec = makeSpec(POCKET_A, [prizeA, key('K-A', { x: 30, y: 30 })], [keyLock('K-A')])
    expect(solveLockFlow(spec)).toEqual({ order: ['K-A'], openable: ['K-A'], blocked: [] })
  })

  it('2-link chain solves in order: key B sits inside pocket A', () => {
    const spec = makeSpec([...POCKET_A, ...POCKET_B], [
      prizeA, prizeB,
      key('K-A', { x: 30, y: 30 }),
      key('K-B', { x: 2, y: 2 }, ['locked:K-A']),   // chained keys ride the locked: exemption
    ], [keyLock('K-A'), keyLock('K-B')])
    expect(solveLockFlow(spec)).toEqual({ order: ['K-A', 'K-B'], openable: ['K-A', 'K-B'], blocked: [] })
    // the full bake-level story holds too: reachable exempts the chained key,
    // key-flow proves the chain
    expect(ruleOf(spec, 'reachable')?.ok).toBe(true)
    expect(ruleOf(spec, 'key-flow')?.ok).toBe(true)
    expect(ruleOf(spec, 'key-flow')?.detail).toContain('K-A → K-B')
  })

  it('circular dependency reports both locks blocked', () => {
    const spec = makeSpec([...POCKET_A, ...POCKET_B], [
      prizeA, prizeB,
      key('K-A', { x: 38, y: 2 }, ['locked:K-B']),
      key('K-B', { x: 2, y: 2 }, ['locked:K-A']),
    ], [keyLock('K-A'), keyLock('K-B')])
    expect(solveLockFlow(spec)).toEqual({ order: [], openable: [], blocked: ['K-A', 'K-B'] })
  })

  it('a key sealed behind its own lock is blocked', () => {
    const spec = makeSpec(POCKET_A, [prizeA, key('K-A', { x: 2, y: 3 }, ['locked:K-A'])], [keyLock('K-A')])
    expect(solveLockFlow(spec).blocked).toEqual(['K-A'])
  })

  it('an already-open lock (held key) seeds the fixpoint as openable', () => {
    // open = plug omitted at bake; the chained key B is immediately in reach
    const spec = makeSpec(POCKET_B, [
      prizeA, prizeB, key('K-B', { x: 2, y: 2 }),
    ], [keyLock('K-A', true), keyLock('K-B')])
    expect(solveLockFlow(spec)).toEqual({ order: ['K-B'], openable: ['K-A', 'K-B'], blocked: [] })
  })
})

describe('key-flow validation rule', () => {
  it('deadlocked spec fails; the same spec with the key freed passes', () => {
    const dead = makeSpec(POCKET_A, [prizeA, key('K-A', { x: 2, y: 3 }, ['locked:K-A'])], [keyLock('K-A')])
    expect(ruleOf(dead, 'key-flow')?.ok).toBe(false)
    expect(ruleOf(dead, 'key-flow')?.detail).toContain('deadlocked')
    const fixed = makeSpec(POCKET_A, [prizeA, key('K-A', { x: 30, y: 30 })], [keyLock('K-A')])
    expect(ruleOf(fixed, 'key-flow')?.ok).toBe(true)
  })

  it('a closed key lock with no key POI at all fails', () => {
    const spec = makeSpec(POCKET_A, [prizeA], [keyLock('K-A')])
    expect(ruleOf(spec, 'key-flow')?.ok).toBe(false)
    expect(ruleOf(spec, 'key-flow')?.detail).toContain('no key POI')
  })

  it('no key locks → no key-flow rule (proficiency-only specs unchanged)', () => {
    const spec = makeSpec([], [], [])
    expect(ruleOf(spec, 'key-flow')).toBeUndefined()
  })
})

// ── the planning/routing seams: routeOver + planLockFlow ─────────────────────
describe('planning/routing seams', () => {
  const E = (a: string, b: string, lockId?: string): NavEdge => ({ a, b, kind: 'corridor', ...(lockId ? { lockId } : {}) })
  const N = (id: string, x: number, y: number): NavNode => ({ id, at: { x, y } })

  it('routeOver: a closed lock blocks the short way; opening it restores it', () => {
    const edges = [E('n0', 'n1'), E('n1', 'n2'), E('n0', 'n2', 'K-A')]
    expect(routeOver(edges, 'n0', 'n2')).toEqual(['n0', 'n1', 'n2'])
    expect(routeOver(edges, 'n0', 'n2', new Set(['K-A']))).toEqual(['n0', 'n2'])
    expect(routeOver([E('n0', 'n1', 'K-A')], 'n0', 'n1')).toBeNull()
    expect(routeOver(edges, 'n0', 'n0')).toEqual(['n0'])
  })

  it('planLockFlow: chain steps in dependency order, each leg routed with the keys so far', () => {
    // nav mirrors the 2-link geometry: mid hub, east key room, both pockets
    // hang off mid behind their locks
    const spec = makeSpec([...POCKET_A, ...POCKET_B], [
      prizeA, prizeB,
      key('K-A', { x: 30, y: 30 }),
      key('K-B', { x: 2, y: 2 }, ['locked:K-A']),
    ], [keyLock('K-A'), keyLock('K-B')])
    spec.semantic.nav = {
      nodes: [N('n-mid', 20, 20), N('n-east', 30, 30), N('n-pa', 2, 2), N('n-pb', 38, 2)],
      edges: [E('n-mid', 'n-east'), E('n-mid', 'n-pa', 'K-A'), E('n-mid', 'n-pb', 'K-B')],
    }
    const plan = planLockFlow(spec)
    expect(plan.order).toEqual(['K-A', 'K-B'])       // solver shape rides along
    expect(plan.steps.map((s) => s.lockId)).toEqual(['K-A', 'K-B'])
    const [a, b] = plan.steps
    // step 1: fetch the east key, open pocket A's gate — the K-A edge is
    // traversable on the gate leg because THIS step opens it
    expect(a).toMatchObject({ keyAt: { x: 30, y: 30 }, keyNode: 'n-east', gateNode: 'n-pa', prizeAt: prizeA.at })
    expect(a.route).toEqual(['n-mid', 'n-east', 'n-mid', 'n-pa'])
    // step 2: the chained key sits in pocket A, legal now that K-A is held
    expect(b).toMatchObject({ keyNode: 'n-pa', gateNode: 'n-pb', prizeAt: prizeB.at })
    expect(b.route).toEqual(['n-mid', 'n-pa', 'n-mid', 'n-pb'])
  })

  it('a blocked lock emits no step; stub navs still emit unrouted steps', () => {
    const dead = makeSpec(POCKET_A, [prizeA, key('K-A', { x: 2, y: 3 }, ['locked:K-A'])], [keyLock('K-A')])
    expect(planLockFlow(dead).steps).toEqual([])
    const stub = makeSpec(POCKET_A, [prizeA, key('K-A', { x: 30, y: 30 })], [keyLock('K-A')])
    expect(planLockFlow(stub).steps).toMatchObject([{ lockId: 'K-A', keyAt: { x: 30, y: 30 }, route: undefined }])
  })
})

// ── the dungeon keyfetch pass, end-to-end through the pipeline ───────────────
describe('dungeon keyfetch (variant-at-deploy key locks)', () => {
  // Deterministically find first-roll floors where keyfetch fired closed.
  // attempts === 1 for the same reason as the other lock suites: reroll chains
  // diverge between variants. ~4/110 at size 56 (the coin is 0.5 but the
  // `gates` pass usually claims the lone dead-end — a phase-4 feel knob).
  const bake = (seed: number, heldKeys?: string[]) =>
    generateMap(DUNGEON_RECIPE, { recipe: 'dungeon', seed, size: 56, themes: ['dungeon'], heldKeys })
  const found = [] as { seed: number; closed: ReturnType<typeof bake>; lock: Lock }[]
  for (let seed = 1; seed <= 110 && found.length < 2; seed++) {
    const r = bake(seed)
    const l = r.spec.semantic.locks.find((x) => x.kind === 'key')
    if (r.report.ok && r.attempts === 1 && l && !l.open) found.push({ seed, closed: r, lock: l })
  }

  it('fires within the sweep: vault sealed behind bars, key on the ungated subgraph', () => {
    expect(found.length, 'fewer than 2 first-roll keyfetch floors in 110 seeds — pass regressed').toBe(2)
    for (const g of found) {
      const { lock } = g
      expect(lock.id).toMatch(/^lock-key-\d+$/)
      expect(lock.gates).toEqual([`${lock.id}-prize`])
      // the plug is first-class lock geometry: a bars rect carrying the lock id
      const plugRect = g.closed.spec.collision.find((c) => c.lockId === lock.id)
      expect(plugRect, `seed ${g.seed}: no plug carries ${lock.id}`).toBeDefined()
      expect(plugRect!.material).toBe('bars')
      // key POI placed, linked, and NOT sealed (reachable rule covers it since
      // it carries no locked: tag); the edge carries the lock
      const keyPoi = g.closed.spec.semantic.pois.find((p) => p.kind === 'key')
      expect(keyPoi?.tags).toContain(`opens:${lock.id}`)
      expect(g.closed.spec.semantic.nav.edges.some((e) => e.lockId === lock.id)).toBe(true)
      // the validator proved the whole story: seal, approach, key flow
      for (const rule of ['reachable', 'locks', 'key-flow']) {
        expect(g.closed.report.rules.find((x) => x.rule === rule)?.ok, `seed ${g.seed}: ${rule}`).toBe(true)
      }
      expect(solveLockFlow(g.closed.spec).order).toContain(lock.id)
    }
  })

  it('holding the key re-bakes the SAME seed open: minus exactly the plug', () => {
    const g = found[0]
    const open = bake(g.seed, [g.lock.id])
    expect(open.report.ok, JSON.stringify(open.report.rules.filter((r) => !r.ok))).toBe(true)
    const l = open.spec.semantic.locks.find((x) => x.id === g.lock.id)
    expect(l?.open).toBe(true)
    expect(open.spec.collision.length).toBe(g.closed.spec.collision.length - 1)
    expect(open.spec.collision.some((c) => c.lockId === g.lock.id)).toBe(false)
    // as-if-closed invariance: everything else identical — an open key lock
    // must not free budget for geometry the closed variant rejected
    expect(open.spec.collision).toEqual(g.closed.spec.collision.filter((c) => c.lockId !== g.lock.id))
    // a key for some OTHER lock changes nothing, byte for byte
    expect(bake(g.seed, ['lock-key-99']).spec).toEqual(g.closed.spec)
  })

  it('specObjectives: the baked floor yields a routed, deterministic fetch plan', () => {
    const g = found[0]
    const steps = specObjectives(g.closed.spec)
    const step = steps.find((s) => s.lockId === g.lock.id)
    expect(step, `seed ${g.seed}: no plan step for ${g.lock.id}`).toBeDefined()
    // anchored onto the authored room graph and routable from the entry —
    // the fetch leg crosses only the ungated subgraph the key was placed on
    expect(step!.keyNode).toBeDefined()
    expect(step!.gateNode).toBeDefined()
    expect(step!.route, `seed ${g.seed}: unroutable plan`).toBeDefined()
    expect(step!.route![step!.route!.length - 1]).toBe(step!.gateNode)
    // determinism THROUGH the bake: an independent re-bake of the same seed
    // yields the identical plan (not just a repeated call on one spec object)
    expect(JSON.stringify(specObjectives(bake(g.seed).spec))).toBe(JSON.stringify(steps))
  })

  it('variants are byte-deterministic per (seed, heldKeys)', () => {
    const g = found[1]
    expect(JSON.stringify(bake(g.seed, [g.lock.id]).spec)).toBe(JSON.stringify(bake(g.seed, [g.lock.id]).spec))
    expect(JSON.stringify(bake(g.seed).spec)).toBe(JSON.stringify(g.closed.spec))
  })
})
