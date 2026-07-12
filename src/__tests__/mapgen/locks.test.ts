// Lock-and-key foundation (§D/§F): the validator enforces both directions of
// every lock (closed seals, open delivers, critical path never gated), and the
// dungeon's gates pass resolves variants at bake — same seed × different party
// kit = a different playable map, byte-deterministic per kit.

import { describe, it, expect } from 'vitest'
import { generateMap, normalizeParams, validate, type CollisionRect, type Lock, type MapSpec, type Poi } from '@/mapgen'
import { DUNGEON_RECIPE } from '@/mapgen/recipes/dungeon'

const SIZE = 40
const wall = (x: number, y: number, w: number, h: number): CollisionRect => ({ x, y, w, h, kind: 'wall', material: 'rock' })
// a sealed corner pocket at (0..5, 0..5) with a prize inside
const POCKET_WALLS = [wall(0, 5, 6, 1.2), wall(5, 0, 1.2, 6)]

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
const prize = (lockId: string): Poi => ({ id: 'prize', kind: 'vault', at: { x: 2, y: 2 }, tags: ['prize', `locked:${lockId}`] })
const lock = (open: boolean): Lock => ({ id: 'L1', kind: 'proficiency', tag: 'might', at: { x: 6.5, y: 3 }, open, gates: ['prize'] })

describe('locks validation rule', () => {
  it('closed lock sealing its prize: reachable exempts it, locks rule passes', () => {
    const spec = makeSpec(POCKET_WALLS, [prize('L1')], [lock(false)])
    expect(ruleOf(spec, 'reachable')?.ok).toBe(true)
    expect(ruleOf(spec, 'locks')?.ok).toBe(true)
  })

  it('CLOSED but leaky (no seal geometry): locks rule fails', () => {
    const spec = makeSpec([], [prize('L1')], [lock(false)])
    expect(ruleOf(spec, 'locks')?.ok).toBe(false)
    expect(ruleOf(spec, 'locks')?.detail).toContain('leaky')
  })

  it('OPEN but still sealed: locks rule fails (the kit paid, deliver the prize)', () => {
    const spec = makeSpec(POCKET_WALLS, [prize('L1')], [lock(true)])
    expect(ruleOf(spec, 'locks')?.ok).toBe(false)
    expect(ruleOf(spec, 'reachable')?.ok).toBe(false)   // open lock no longer exempts
  })

  it('OPEN and delivered: both rules pass', () => {
    const spec = makeSpec([], [prize('L1')], [lock(true)])
    expect(ruleOf(spec, 'reachable')?.ok).toBe(true)
    expect(ruleOf(spec, 'locks')?.ok).toBe(true)
  })

  it('never gate the critical path: a lock gating a lair fails', () => {
    const lairPoi: Poi = { id: 'lair', kind: 'lair', at: { x: 2, y: 2 }, tags: [`locked:L1`] }
    const spec = makeSpec(POCKET_WALLS, [lairPoi], [{ ...lock(false), gates: ['lair'] }])
    expect(ruleOf(spec, 'locks')?.ok).toBe(false)
    expect(ruleOf(spec, 'locks')?.detail).toContain('critical-path')
  })

  it('gate site itself must be approachable (a small pocket is — a deep burial is not)', () => {
    // the pocket gate IS approachable: open ground sits within a few steps of
    // it, so the party can find the door — the rule allows it
    const pocketGate = { ...lock(false), at: { x: 2, y: 4 } }
    expect(ruleOf(makeSpec(POCKET_WALLS, [prize('L1')], [pocketGate]), 'locks')?.ok).toBe(true)
    // a gate at the heart of a 14×14 rock mass is undiscoverable — fails
    const mass = wall(0, 0, 14, 14)
    const deepPrize: Poi = { id: 'prize', kind: 'vault', at: { x: 6, y: 6 }, tags: ['prize', 'locked:L1'] }
    const buried = { ...lock(false), at: { x: 7, y: 7 } }
    const spec = makeSpec([mass], [deepPrize], [buried])
    expect(ruleOf(spec, 'locks')?.ok).toBe(false)
    expect(ruleOf(spec, 'locks')?.detail).toContain('gate site unreachable')
  })
})

describe('dungeon composition gates (variant-at-deploy)', () => {
  // Deterministically find seeds whose floor grew EXACTLY the dead-end vault
  // gate (no shortcut lock on the same floor — the rect-delta and wrong-kit
  // assertions below assume the vault lock is the floor's only lock; floors
  // where both fire are covered by the shortcut suite in recipe-dungeon.test).
  // attempts === 1 is load-bearing: a closed bake that only validated after a
  // reroll can re-bake OPEN at attempt 1 into a completely different map (the
  // open variant may pass validation where the closed one rerolled), so the
  // minus-one-rect / wrong-kit-identical invariants below only hold for
  // first-roll floors.
  const gated = [] as { seed: number; closed: ReturnType<typeof generateMap>; tag: string }[]
  for (let seed = 1; seed <= 80 && gated.length < 5; seed++) {
    const r = generateMap(DUNGEON_RECIPE, { recipe: 'dungeon', seed, size: 48, themes: ['dungeon'] })
    const locks = r.spec.semantic.locks
    const l = locks[0]
    if (r.report.ok && r.attempts === 1 && locks.length === 1 && l && !l.open && !l.id.startsWith('lock-shortcut-')) {
      gated.push({ seed, closed: r, tag: l.tag! })
    }
  }

  it('gates occur at a healthy rate and validate closed by default', () => {
    expect(gated.length, 'fewer than 5 first-roll vault-gated floors in 80 seeds — gate frequency regressed').toBe(5)
    for (const g of gated) {
      const l = g.closed.spec.semantic.locks[0]
      expect(l.open).toBe(false)
      expect(g.closed.spec.semantic.pois.some((p) => p.tags.includes(`locked:${l.id}`))).toBe(true)
      expect(g.closed.spec.semantic.nav.edges.some((e) => e.lockId === l.id)).toBe(true)
    }
  })

  it('the matching party kit re-bakes the SAME seed with the gate open — and it still validates', () => {
    const g = gated[0]
    const open = generateMap(DUNGEON_RECIPE, {
      recipe: 'dungeon', seed: g.seed, size: 48, themes: ['dungeon'],
      proficiencies: [g.tag as 'might'],
    })
    expect(open.report.ok, JSON.stringify(open.report.rules.filter((r) => !r.ok))).toBe(true)
    const l = open.spec.semantic.locks[0]
    expect(l.open).toBe(true)
    expect(l.tag).toBe(g.tag)
    // the seal geometry was omitted — one fewer collision rect than the closed variant
    expect(open.spec.collision.length).toBe(g.closed.spec.collision.length - 1)
    // a NON-matching kit changes nothing
    const wrongTag = g.tag === 'arcane' ? 'holy' : 'arcane'
    const closedAgain = generateMap(DUNGEON_RECIPE, {
      recipe: 'dungeon', seed: g.seed, size: 48, themes: ['dungeon'], proficiencies: [wrongTag],
    })
    expect(closedAgain.spec).toEqual(g.closed.spec)
  })

  it('variants are deterministic per (seed, kit)', () => {
    const g = gated[1]
    const kit = { recipe: 'dungeon', seed: g.seed, size: 48, themes: ['dungeon'] as ['dungeon'], proficiencies: [g.tag as 'might'] }
    expect(generateMap(DUNGEON_RECIPE, kit).spec).toEqual(generateMap(DUNGEON_RECIPE, kit).spec)
  })
})
