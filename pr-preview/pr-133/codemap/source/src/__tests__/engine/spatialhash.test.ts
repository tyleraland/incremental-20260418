// Spatial hash: a pure optimisation for the per-round O(N²) neighbour scans
// (separation, target acquisition). `near` must return the EXACT same set a brute
// scan would — over-scanned by SPATIAL_MARGIN, then re-filtered by live distance —
// in array-index order (separation mutates as it iterates, so order matters).
import { describe, it, expect } from 'vitest'
import { SpatialHash, SPATIAL_MARGIN } from '@/engine/spatialhash'
import type { Combatant } from '@/engine'

const mk = (id: string, x: number, y: number, alive = true): Combatant =>
  ({ id, alive, pos: { x, y }, team: 'player' } as unknown as Combatant)

const inRadius = (c: Combatant, cx: number, cy: number, r: number) =>
  Math.hypot(c.pos.x - cx, c.pos.y - cy) <= r

describe('SpatialHash.near', () => {
  // 200 units scattered deterministically across a 50×50 field.
  const all: Combatant[] = []
  for (let i = 0; i < 200; i++) all.push(mk('u' + i, (i * 7) % 50, (i * 13) % 50))
  const hash = new SpatialHash(all)

  it('matches a brute-force scan (same set, same array order)', () => {
    for (const [cx, cy, r] of [[25, 25, 6], [0, 0, 10], [49, 49, 5], [12, 37, 8]] as const) {
      const got = hash.near({ x: cx, y: cy }, r + SPATIAL_MARGIN)
        .filter((c) => inRadius(c, cx, cy, r)).map((c) => c.id)
      const want = all.filter((c) => inRadius(c, cx, cy, r)).map((c) => c.id)
      expect(got).toEqual(want)
    }
  })

  it('scans far fewer candidates than the whole roster', () => {
    const candidates = hash.near({ x: 25, y: 25 }, 0.7 + SPATIAL_MARGIN).length
    expect(candidates).toBeLessThan(all.length / 2)   // a local query, not O(N)
  })

  it('skips dead units', () => {
    const units = [mk('a', 5, 5), mk('dead', 5, 5, false), mk('b', 6, 5)]
    const ids = new SpatialHash(units).near({ x: 5, y: 5 }, 2).map((c) => c.id)
    expect(ids).toEqual(['a', 'b'])
  })
})
