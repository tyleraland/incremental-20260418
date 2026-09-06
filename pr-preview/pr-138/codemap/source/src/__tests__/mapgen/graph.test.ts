// deriveRegions — the derived nav-graph producer (track B), pinned on
// synthetic masks where the right answer is knowable by eye: chambers become
// regions, narrow corridors become 'crossing' edges with a doorAt inside the
// pinch, small components are absorbed, and the whole thing is deterministic.

import { describe, it, expect } from 'vitest'
import { bfsDepth, deriveRegions, normalizeParams, validate, type CollisionRect, type MapSpec } from '@/mapgen'
import { occupancyGrid } from '@/mapgen/validate'

// '.' = walkable, '#' = blocked. Row 0 is grid row 0.
function mask(art: string[]): { walk: Uint8Array; cols: number; rows: number } {
  const rows = art.length, cols = art[0].length
  const walk = new Uint8Array(cols * rows)
  art.forEach((row, y) => {
    for (let x = 0; x < cols; x++) if (row[x] === '.') walk[y * cols + x] = 1
  })
  return { walk, cols, rows }
}

// Two 5×6 chambers joined by a 2-wide corridor (rows 3–4).
const TWO_CHAMBERS = [
  '################',
  '#.....####.....#',
  '#.....####.....#',
  '#..............#',
  '#..............#',
  '#.....####.....#',
  '#.....####.....#',
  '################',
]

describe('deriveRegions', () => {
  it('two chambers joined by a 2-wide corridor → 2 regions, 1 crossing, doorAt in the corridor', () => {
    const { walk, cols, rows } = mask(TWO_CHAMBERS)
    const { nodes, edges, claims } = deriveRegions(walk, cols, rows, { pinchWidth: 3, minRegionCells: 6 })

    expect(nodes.map((n) => n.id)).toEqual(['region-0', 'region-1'])
    // label order is scanline: region-0 is the left (west) chamber
    expect(nodes[0].at.x).toBeLessThan(nodes[1].at.x)
    for (const n of nodes) expect(n.area).toBeDefined()

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ a: 'region-0', b: 'region-1', kind: 'crossing' })
    // the pinch sits inside the corridor span (x 6–9, rows 3–4)
    const door = edges[0].doorAt!
    expect(door.x).toBeGreaterThan(6)
    expect(door.x).toBeLessThan(10)
    expect(door.y).toBeGreaterThan(3)
    expect(door.y).toBeLessThan(5)
    // the door cell is walkable and claimed
    const di = Math.floor(door.y) * cols + Math.floor(door.x)
    expect(walk[di]).toBe(1)
    expect(claims[di]).toBeGreaterThanOrEqual(0)
    // every walkable cell was claimed by one of the two regions
    for (let i = 0; i < walk.length; i++) {
      if (walk[i]) expect(claims[i]).toBeGreaterThanOrEqual(0)
      else expect(claims[i]).toBe(-1)
    }
  })

  it('a fully open mask → 1 region, 0 edges', () => {
    const cols = 12, rows = 12
    const walk = new Uint8Array(cols * rows).fill(1)
    const { nodes, edges, claims } = deriveRegions(walk, cols, rows)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('region-0')
    expect(edges).toHaveLength(0)
    for (let i = 0; i < walk.length; i++) expect(claims[i]).toBe(0)
  })

  it('three chambers in a chain → 2 edges; bfsDepth grades 0/1/2 from the first', () => {
    const { walk, cols, rows } = mask([
      '#########################',
      '#.....####.....####.....#',
      '#.....####.....####.....#',
      '#.......................#',
      '#.......................#',
      '#.....####.....####.....#',
      '#.....####.....####.....#',
      '#########################',
    ])
    const { nodes, edges } = deriveRegions(walk, cols, rows, { pinchWidth: 3, minRegionCells: 6 })
    expect(nodes.map((n) => n.id)).toEqual(['region-0', 'region-1', 'region-2'])
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => [e.a, e.b])).toEqual([
      ['region-0', 'region-1'],
      ['region-1', 'region-2'],
    ])
    const depth = bfsDepth(edges, 'region-0')
    expect(depth.get('region-0')).toBe(0)
    expect(depth.get('region-1')).toBe(1)
    expect(depth.get('region-2')).toBe(2)
  })

  it('deterministic: identical input twice → deep-equal output, input untouched', () => {
    const { walk, cols, rows } = mask(TWO_CHAMBERS)
    const before = Uint8Array.from(walk)
    const a = deriveRegions(walk, cols, rows, { pinchWidth: 3, minRegionCells: 6 })
    const b = deriveRegions(walk, cols, rows, { pinchWidth: 3, minRegionCells: 6 })
    expect(a.nodes).toEqual(b.nodes)
    expect(a.edges).toEqual(b.edges)
    expect(Array.from(a.claims)).toEqual(Array.from(b.claims))
    expect(Array.from(walk)).toEqual(Array.from(before))
  })

  // The FULL production seam on real collision rects — the path no recipe
  // exercises yet (today's lone-lake geography never bisects a map; rivers
  // arrive with P2): collision → occupancyGrid → deriveRegions → a spec →
  // validate, with graph-truthful flood-verifying the derived edge for real.
  it('integration: rects → occupancyGrid → deriveRegions → spec → validate verifies a real crossing', () => {
    const SIZE = 40
    // a wall band across the full width, pierced by one 2-wide gap at x 19–20
    const collision: CollisionRect[] = [
      { x: 0, y: 19, w: 19, h: 3, kind: 'wall', material: 'rock' },
      { x: 21, y: 19, w: 19, h: 3, kind: 'wall', material: 'rock' },
    ]
    const blocked = occupancyGrid(collision, SIZE, SIZE)
    const walk = new Uint8Array(SIZE * SIZE)
    for (let i = 0; i < walk.length; i++) walk[i] = blocked[i] ? 0 : 1
    const { nodes, edges } = deriveRegions(walk, SIZE, SIZE, { pinchWidth: 3, minRegionCells: 12 })

    expect(nodes).toHaveLength(2)
    expect(edges).toHaveLength(1)
    expect(edges[0].kind).toBe('crossing')
    const door = edges[0].doorAt!
    expect(door.x).toBeGreaterThanOrEqual(19)
    expect(door.x).toBeLessThanOrEqual(21)

    const spec: MapSpec = {
      specVersion: 1, recipe: 'test', seed: 1, cols: SIZE, rows: SIZE,
      collision,
      surface: { cols: SIZE, rows: SIZE, cellsPerUnit: 1, grid: new Uint8Array(SIZE * SIZE) },
      scatter: [],
      semantic: {
        pois: [{ id: 'spawn', kind: 'spawn', at: { x: SIZE / 2, y: 10 }, tags: [] }],
        nav: { nodes, edges },
        locks: [], regionTags: [], name: null, premise: null,
        tactical: { openness: 1, barrierCount: collision.length, chokepoints: 0, longLanes: 0, coverClusters: 0 },
      },
    }
    const params = normalizeParams({ recipe: 'test', seed: 1, size: SIZE, themes: [], spawnApron: 4 })
    const report = validate(spec, params)
    const truthful = report.rules.find((r) => r.rule === 'graph-truthful')!
    expect(truthful.ok).toBe(true)
    expect(truthful.detail).toBe('1/1 open edge(s) flood-verified')
    expect(report.ok, JSON.stringify(report.rules.filter((r) => !r.ok))).toBe(true)
  })

  it('a region under minRegionCells is dropped and its cells absorbed by the survivor', () => {
    // left chamber 5×5 (9 eroded cells), right chamber 3×5 (3 eroded cells),
    // joined by a 1-wide corridor on row 3
    const { walk, cols, rows } = mask([
      '#############',
      '#.....###...#',
      '#.....###...#',
      '#...........#',
      '#.....###...#',
      '#.....###...#',
      '#############',
    ])
    const { nodes, edges, claims } = deriveRegions(walk, cols, rows, { pinchWidth: 3, minRegionCells: 6 })
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0)
    // the tiny chamber's cells were claimed by the surviving region, not left orphaned
    expect(claims[2 * cols + 10]).toBe(0)
    for (let i = 0; i < walk.length; i++) if (walk[i]) expect(claims[i]).toBe(0)
  })
})
