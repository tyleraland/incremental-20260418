// The coherence harness: each named rule must catch its crafted violation and
// pass its crafted fix — this is what lets fuzz gates and the ?mapgen=1 lab
// speak for map sanity so humans only review looks.

import { describe, it, expect } from 'vitest'
import { normalizeParams, validate, SURFACE_MATERIALS, type CollisionRect, type MapSpec, type Poi } from '@/mapgen'

const SIZE = 40

function makeSpec(collision: CollisionRect[] = [], pois?: Poi[]): MapSpec {
  return {
    specVersion: 1,
    recipe: 'test',
    seed: 1,
    cols: SIZE,
    rows: SIZE,
    collision,
    surface: { cols: SIZE, rows: SIZE, cellsPerUnit: 1, grid: new Uint8Array(SIZE * SIZE) },
    scatter: [],
    semantic: {
      pois: pois ?? [{ id: 'spawn', kind: 'spawn', at: { x: SIZE / 2, y: SIZE / 2 }, tags: [] }],
      nav: { nodes: [], edges: [] },
      locks: [],
      regionTags: [],
      name: null, premise: null,
      tactical: { openness: 1, barrierCount: collision.length, chokepoints: 0, longLanes: 0, coverClusters: 0 },
    },
  }
}

const params = (over: object = {}) => normalizeParams({ recipe: 'test', seed: 1, size: SIZE, themes: [], ...over })
const ruleOf = (spec: MapSpec, id: string, p = params()) => {
  const r = validate(spec, p).rules.find((x) => x.rule === id)
  expect(r, `rule ${id} should exist`).toBeDefined()
  return r!
}
const wall = (x: number, y: number, w: number, h: number): CollisionRect => ({ x, y, w, h, kind: 'wall', material: 'rock' })

describe('mapgen validate', () => {
  it('a clean empty field passes every rule', () => {
    const report = validate(makeSpec(), params())
    expect(report.ok).toBe(true)
  })

  it('bounds: rejects rects outside the arena', () => {
    expect(ruleOf(makeSpec([wall(-2, 5, 4, 4)]), 'bounds').ok).toBe(false)
    expect(ruleOf(makeSpec([wall(SIZE - 2, 5, 4, 4)]), 'bounds').ok).toBe(false)
    expect(ruleOf(makeSpec([wall(2, 2, 3, 3)]), 'bounds').ok).toBe(true)
  })

  it('vocab: rejects a material riding the wrong collision kind', () => {
    const bad = makeSpec([{ x: 2, y: 2, w: 3, h: 3, kind: 'wall', material: 'deep-water' }])
    expect(ruleOf(bad, 'vocab').ok).toBe(false)
    const good = makeSpec([{ x: 2, y: 2, w: 3, h: 3, kind: 'cliff', material: 'deep-water' }])
    expect(ruleOf(good, 'vocab').ok).toBe(true)
  })

  it('barrier-budget: enforces the pather cap', () => {
    const spec = makeSpec([wall(2, 2, 2, 2), wall(6, 2, 2, 2), wall(10, 2, 2, 2)])
    expect(ruleOf(spec, 'barrier-budget', params({ maxBarriers: 2 })).ok).toBe(false)
    expect(ruleOf(spec, 'barrier-budget', params({ maxBarriers: 3 })).ok).toBe(true)
  })

  it('spawn-present + apron-clear: the form-up knot stays open', () => {
    expect(ruleOf(makeSpec([], []), 'spawn-present').ok).toBe(false)
    expect(ruleOf(makeSpec([wall(SIZE / 2 - 1, SIZE / 2 - 1, 2, 2)]), 'apron-clear').ok).toBe(false)
    expect(ruleOf(makeSpec([wall(1, 1, 2, 2)]), 'apron-clear').ok).toBe(true)
  })

  it('reachable: a stranded POI and a walled-off region both fail', () => {
    // box a POI into a corner pocket
    const pocketPois: Poi[] = [
      { id: 'spawn', kind: 'spawn', at: { x: SIZE / 2, y: SIZE / 2 }, tags: [] },
      { id: 'vault', kind: 'vault', at: { x: 2, y: 2 }, tags: [] },
    ]
    const boxed = makeSpec([wall(0, 5, 6, 1.2), wall(5, 0, 1.2, 6)], pocketPois)
    expect(ruleOf(boxed, 'reachable').ok).toBe(false)
    // same walls, no POI inside → small pocket is under the 15% slack
    const noPoi = makeSpec([wall(0, 5, 6, 1.2), wall(5, 0, 1.2, 6)])
    expect(ruleOf(noPoi, 'reachable').ok).toBe(true)
    // bisect the whole map → connected fraction collapses
    const bisected = makeSpec([{ x: 0, y: 12, w: SIZE, h: 1.5, kind: 'wall', material: 'rock' }])
    expect(ruleOf(bisected, 'reachable').ok).toBe(false)
  })

  it("reachable: POIs tagged 'optional' are exempt (§J visible-unreachable pockets)", () => {
    const pois: Poi[] = [
      { id: 'spawn', kind: 'spawn', at: { x: SIZE / 2, y: SIZE / 2 }, tags: [] },
      { id: 'treasure', kind: 'vault', at: { x: 2, y: 2 }, tags: ['optional'] },
    ]
    const boxed = makeSpec([wall(0, 5, 6, 1.2), wall(5, 0, 1.2, 6)], pois)
    expect(ruleOf(boxed, 'reachable').ok).toBe(true)
    // the same pocketed POI without the tag still fails
    const required = makeSpec([wall(0, 5, 6, 1.2), wall(5, 0, 1.2, 6)],
      pois.map((p) => (p.id === 'treasure' ? { ...p, tags: [] } : p)))
    expect(ruleOf(required, 'reachable').ok).toBe(false)
  })

  it('graph-truthful: an open edge across a bisecting wall is a lie; a real route or a closed lock passes', () => {
    const nodes = [
      { id: 'r-a', at: { x: 5, y: 20 } },
      { id: 'r-b', at: { x: 35, y: 20 } },
    ]
    const edge = { a: 'r-a', b: 'r-b', kind: 'crossing' as const, doorAt: { x: 10, y: 20 } }
    // violation: a full-height wall splits the endpoints into two flood components
    const bisector: CollisionRect = { x: 19, y: 0, w: 2, h: SIZE, kind: 'wall', material: 'rock' }
    const lie = makeSpec([bisector])
    lie.semantic.nav = { nodes, edges: [edge] }
    expect(ruleOf(lie, 'graph-truthful').ok).toBe(false)
    // fix: same edge with the wall gone → one component, edge verified
    const fixed = makeSpec()
    fixed.semantic.nav = { nodes, edges: [edge] }
    expect(ruleOf(fixed, 'graph-truthful').ok).toBe(true)
    // a doorAt buried in rock is a lie even when the endpoints connect around it
    const buried = makeSpec([wall(18, 18, 4, 4)])
    buried.semantic.nav = { nodes, edges: [{ ...edge, doorAt: { x: 20, y: 20 } }] }
    expect(ruleOf(buried, 'graph-truthful').ok).toBe(false)
    // a CLOSED lock exempts its edge — the locks rule owns sealed geometry
    const sealed = makeSpec([bisector])
    sealed.semantic.nav = { nodes, edges: [{ ...edge, lockId: 'lock-x' }] }
    sealed.semantic.locks = [{ id: 'lock-x', kind: 'proficiency', open: false, gates: [] }]
    expect(ruleOf(sealed, 'graph-truthful').ok).toBe(true)
    // …but the same lock OPEN stops exempting: the edge must deliver
    const openLie = makeSpec([bisector])
    openLie.semantic.nav = { nodes, edges: [{ ...edge, lockId: 'lock-x' }] }
    openLie.semantic.locks = [{ id: 'lock-x', kind: 'proficiency', open: true, gates: [] }]
    expect(ruleOf(openLie, 'graph-truthful').ok).toBe(false)
    // no edges → the rule passes as a skip
    const empty = ruleOf(makeSpec(), 'graph-truthful')
    expect(empty.ok).toBe(true)
    expect(empty.detail).toBe('no nav edges')
  })

  it('water-coherence: deep cells need covering rects; water rects need water under them', () => {
    const deep = SURFACE_MATERIALS.indexOf('deep-water')
    const uncovered = makeSpec()
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) uncovered.surface.grid[y * SIZE + x] = deep
    expect(ruleOf(uncovered, 'water-coherence').ok).toBe(false)

    const covered = makeSpec([{ x: 2, y: 2, w: 4, h: 4, kind: 'cliff', material: 'deep-water' }])
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) covered.surface.grid[y * SIZE + x] = deep
    expect(ruleOf(covered, 'water-coherence').ok).toBe(true)

    const dryRect = makeSpec([{ x: 20, y: 2, w: 4, h: 4, kind: 'cliff', material: 'deep-water' }])
    expect(ruleOf(dryRect, 'water-coherence').ok).toBe(false)
  })
})
