// The fuzz gate — the automated stand-in for a human clicking through seeds.
// Every seed in the sweep must bake a VALID map (rerolls allowed, but the
// pipeline must converge); themed sweeps must actually exercise the layered
// features (lakes appear, fords stay crossable, budgets hold). Widen the sweep
// here before widening any recipe's ambition.

import { describe, it, expect } from 'vitest'
import { generateMap, SURFACE_MATERIALS, type ThemeTag } from '@/mapgen'
import { FIELD_RECIPE } from '@/mapgen/recipes/field'

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1)

function sweep(size: number, themes: ThemeTag[]) {
  return SEEDS.map((seed) => generateMap(FIELD_RECIPE, { recipe: 'field', seed, size, themes }))
}

describe('field recipe fuzz gate', () => {
  it('25 seeds × 60-cell plains: all validate', () => {
    for (const r of sweep(60, ['plains'])) {
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      expect(r.attempts).toBeLessThanOrEqual(4)
    }
  })

  it('25 seeds × 200-cell water fields: all validate; lakes actually form', () => {
    const results = sweep(200, ['plains', 'water'])
    let lakes = 0
    for (const r of results) {
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      if (r.spec.collision.some((c) => c.material === 'deep-water')) lakes++
    }
    // hydrology must be a real layer, not a lottery — most seeds get a lake
    expect(lakes).toBeGreaterThan(SEEDS.length * 0.7)
  })

  it('forest theme grows hedges + denser scatter; desert thins it', () => {
    const forest = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 3, size: 120, themes: ['forest'] })
    const desert = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 3, size: 120, themes: ['desert'] })
    expect(forest.spec.scatter.length).toBeGreaterThan(desert.spec.scatter.length)
    const sand = SURFACE_MATERIALS.indexOf('sand')
    const sandy = Array.from(desert.spec.surface.grid).filter((v) => v === sand).length
    expect(sandy).toBeGreaterThan(desert.spec.surface.grid.length * 0.5)
  })

  it('scatter clumps FIRE and are spatially grouped (not uniform dust)', () => {
    // Across the sweep, most themed seeds must grow at least one grove/bed, and a
    // cluster item must have a same-kind neighbour within ~clumpRadius — the
    // spatial grouping uniform scatter would not guarantee.
    let seedsWithClusters = 0
    let groupedSeeds = 0
    for (const r of sweep(120, ['forest'])) {
      const clusters = r.spec.scatter.filter((it) => it.intent === 'cluster')
      if (clusters.length === 0) continue
      seedsWithClusters++
      // a cluster item with a same-kind neighbour within the clump radius (6)
      const grouped = clusters.some((a) =>
        clusters.some((b) => b !== a && b.kind === a.kind && Math.hypot(a.x - b.x, a.y - b.y) < 6))
      if (grouped) groupedSeeds++
    }
    // clumping must be a real layer, not a lottery
    expect(seedsWithClusters).toBeGreaterThan(SEEDS.length * 0.7)
    expect(groupedSeeds).toBeGreaterThan(SEEDS.length * 0.7)
  })

  it('scatter states placement intent for render (field fill + cluster groves)', () => {
    const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 4, size: 120, themes: ['forest'] })
    const intents = new Set(r.spec.scatter.map((it) => it.intent))
    expect(intents.has('field')).toBe(true)
    expect(intents.has('cluster')).toBe(true)
    // total stays bounded near the ~96×forestMult cap (fill + clump shares)
    expect(r.spec.scatter.length).toBeLessThan(96 * 1.6 * 1.2)
  })

  it('the semantic plane self-describes: spawn + landmark POIs, sane tactical profile', () => {
    for (const r of sweep(100, ['plains', 'water']).slice(0, 8)) {
      const kinds = r.spec.semantic.pois.map((p) => p.kind)
      expect(kinds).toContain('spawn')
      expect(kinds).toContain('landmark')
      const t = r.spec.semantic.tactical
      expect(t.openness).toBeGreaterThan(0.5)
      expect(t.openness).toBeLessThanOrEqual(1)
      expect(t.barrierCount).toBe(r.spec.collision.length)
      expect(r.spec.semantic.nav.nodes.length).toBe(r.spec.semantic.pois.length)
    }
  })

  it('respects the barrier budget and the keep-clear boxes', () => {
    const r = generateMap(FIELD_RECIPE, {
      recipe: 'field', seed: 11, size: 100, themes: ['plains', 'water', 'mountain'],
      maxBarriers: 12,
      keepClear: [{ x: 0, y: 45, w: 6, h: 10 }],
    })
    expect(r.spec.collision.length).toBeLessThanOrEqual(12)
    for (const c of r.spec.collision.filter((x) => x.material !== 'deep-water')) {
      expect(c.x + c.w < 0 || c.x > 6 || c.y + c.h < 45 || c.y > 55, `rect ${JSON.stringify(c)} in keep-clear`).toBe(true)
    }
  })
})
