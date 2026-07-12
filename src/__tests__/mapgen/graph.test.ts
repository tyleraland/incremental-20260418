// deriveRegions — the derived nav-graph producer (track B), pinned on
// synthetic masks where the right answer is knowable by eye: chambers become
// regions, narrow corridors become 'crossing' edges with a doorAt inside the
// pinch, small components are absorbed, and the whole thing is deterministic.

import { describe, it, expect } from 'vitest'
import { bfsDepth, deriveRegions } from '@/mapgen'

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
