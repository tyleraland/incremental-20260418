// The fuzz gate — the automated stand-in for a human clicking through seeds.
// Every seed in the sweep must bake a VALID map (rerolls allowed, but the
// pipeline must converge); themed sweeps must actually exercise the layered
// features (lakes appear, fords stay crossable, budgets hold). Widen the sweep
// here before widening any recipe's ambition.

import { describe, it, expect } from 'vitest'
import { generateMap, SURFACE_MATERIALS, type ThemeTag } from '@/mapgen'
import { occupancyGrid } from '@/mapgen/validate'
import { FIELD_RECIPE, RIVER_DIALS } from '@/mapgen/recipes/field'

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
    // total stays bounded near the ~96×forestMult cap (fill + clump + edge shares
    // ≤ ~1.5×; the passes rarely spend their whole share, so the real total sits
    // well under the ceiling)
    expect(r.spec.scatter.length).toBeLessThan(96 * 1.6 * 1.55)
  })

  it('edge features fire: shoreline reeds hug the water', () => {
    // Across the water sweep, at least one edge reed must land on the shore — a
    // land cell whose neighbourhood contains a water cell.
    const water = [SURFACE_MATERIALS.indexOf('shallow-water'), SURFACE_MATERIALS.indexOf('deep-water')]
    const nearWaterCell = (r: ReturnType<typeof generateMap>, x: number, y: number) => {
      const g = r.spec.surface.grid, cols = r.spec.surface.cols
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = Math.floor(x) + dx, cy = Math.floor(y) + dy
          if (cx < 0 || cy < 0 || cx >= cols || cy >= r.spec.surface.rows) continue
          if (water.includes(g[cy * cols + cx])) return true
        }
      return false
    }
    let shoreReeds = 0
    for (const r of sweep(200, ['plains', 'water'])) {
      for (const it of r.spec.scatter) {
        if (it.intent === 'edge' && it.kind === 'reed' && nearWaterCell(r, it.x, it.y)) shoreReeds++
      }
    }
    // reeds hugging the waterline must be a real layer, not a fluke
    expect(shoreReeds).toBeGreaterThan(0)
  })

  it('edge features fire: outcrop skirts ring the rock', () => {
    // On seeds with rock/hedge outcrops, at least one edge skirt prop (flower or
    // rock, never reed) must sit just outside a wall rect.
    const nearRect = (p: { x: number; y: number }, c: { x: number; y: number; w: number; h: number }, m: number) => {
      const cx = Math.max(c.x, Math.min(p.x, c.x + c.w))
      const cy = Math.max(c.y, Math.min(p.y, c.y + c.h))
      return Math.hypot(p.x - cx, p.y - cy) <= m
    }
    let ringed = 0
    for (const r of sweep(120, ['forest', 'mountain'])) {
      const walls = r.spec.collision.filter((c) => c.material === 'rock' || c.material === 'hedge')
      if (!walls.length) continue
      for (const it of r.spec.scatter) {
        if (it.intent !== 'edge' || it.kind === 'reed') continue
        if (walls.some((w) => nearRect(it, w, 1.2))) ringed++
      }
    }
    expect(ringed).toBeGreaterThan(0)
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
      // nav is the DERIVED region graph (track B), with the spawn linked to
      // its containing region — which roots the depth gradient at 0
      const nodes = r.spec.semantic.nav.nodes
      expect(nodes.length).toBeGreaterThanOrEqual(1)
      expect(nodes.every((n) => n.id.startsWith('region-'))).toBe(true)
      const spawnNode = nodes.find((n) => n.poiId === 'spawn')
      expect(spawnNode).toBeDefined()
      expect(spawnNode!.depth).toBe(0)
    }
  })

  it('regions pass fires on every seed: ≥1 region node published, report stays ok', () => {
    // Do NOT assert a fixed region/edge count: a lone lake you can simply walk
    // around legitimately yields 1 region and 0 edges — edges only appear when
    // geography genuinely pinches (rivers arrive with track C).
    for (const r of [...sweep(60, ['plains']), ...sweep(120, ['plains', 'water'])]) {
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      expect(r.spec.semantic.nav.nodes.length, `seed ${r.spec.seed} published no region nodes`).toBeGreaterThanOrEqual(1)
      expect(r.notes.some((n) => n.startsWith('regions:')), `seed ${r.spec.seed} regions pass left no note`).toBe(true)
    }
  })

  // ── P2 rivers + crossings: the "edges from real bakes" sweep ───────────────
  // (Replaces the vacuous sweep the P1 review deleted — pre-river geography
  // never bisected a map. The river is the region divider, so real bakes now
  // publish real 'crossing' edges, and the sweep below can never go vacuous:
  // it asserts at least one edge was actually seen.)

  it('P2 water sweep: rivers fire, maps multi-region, every edge a walkable crossing', () => {
    const results = sweep(160, ['plains', 'water'])
    let rivers = 0, multiRegion = 0, edgesSeen = 0
    for (const r of results) {
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      expect(r.attempts, `seed ${r.spec.seed} needed ${r.attempts} attempts`).toBeLessThanOrEqual(4)
      if (r.notes.some((n) => n.startsWith('river:') && n.includes('rect(s) spent'))) rivers++
      const { nodes, edges } = r.spec.semantic.nav
      if (nodes.length >= 2 && edges.length >= 1) multiRegion++
      edgesSeen += edges.length
      // every published edge is a 'crossing' whose doorAt is a WALKABLE cell —
      // the validator-mirror occupancy check (same rasterizer flood-fill sees)
      const blocked = occupancyGrid(r.spec.collision, r.spec.cols, r.spec.rows)
      for (const e of edges) {
        expect(e.kind).toBe('crossing')
        expect(e.doorAt, `seed ${r.spec.seed}: edge ${e.a}→${e.b} has no doorAt`).toBeDefined()
        const i = Math.floor(e.doorAt!.y) * r.spec.cols + Math.floor(e.doorAt!.x)
        expect(blocked[i], `seed ${r.spec.seed}: doorAt ${e.doorAt!.x},${e.doorAt!.y} blocked`).toBe(0)
      }
    }
    // the river must be a real layer, not a lottery (probe: 25/25 at this size)
    expect(rivers).toBeGreaterThan(SEEDS.length * 0.7)
    // ≥40% multi-region is the floor the packet commits to; observed 100% at
    // 96–200 — a bar low enough to survive dial tuning, high enough that a
    // regression to "rivers never divide" trips it immediately
    expect(multiRegion).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.4))
    // and NEVER vacuous again: the sweep saw at least one real edge
    expect(edgesSeen).toBeGreaterThan(0)
  })

  it('P2 budget: the river note()s a spend within its allotment; totals hold the cap', () => {
    for (const r of sweep(200, ['plains', 'water'])) {
      // validator already gates barrier-budget; assert it stayed ≤ the default cap
      expect(r.spec.collision.length).toBeLessThanOrEqual(24)
      const note = r.notes.find((n) => n.startsWith('river:') && n.includes('rect(s) spent'))
      if (!note) continue
      const spend = Number(note.match(/(\d+) rect\(s\) spent/)![1])
      expect(spend).toBeGreaterThan(0)
      expect(spend).toBeLessThanOrEqual(RIVER_DIALS.maxRects)
    }
  })

  it('P2 determinism: a river seed double-bakes byte-equal', () => {
    const params = { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'] as ThemeTag[] }
    const a = generateMap(FIELD_RECIPE, params)
    const b = generateMap(FIELD_RECIPE, params)
    expect(a.notes.some((n) => n.startsWith('river:') && n.includes('spent')), 'seed 9 must grow a river').toBe(true)
    expect(a.spec).toEqual(b.spec)
    expect(Array.from(a.spec.surface.grid)).toEqual(Array.from(b.spec.surface.grid))
  })

  it('P2 bridges: some fords dress as road-strip bridges', () => {
    // bridgeChance 0.35 across ~25 rivers → P(zero bridges) ≈ 0.65^25, negligible
    const results = sweep(160, ['plains', 'water'])
    const bridged = results.filter((r) => r.notes.some((n) => n.startsWith('river:') && n.includes('bridge')))
    expect(bridged.length).toBeGreaterThan(0)
    // the field recipe paints 'road' ONLY for bridge strips — so a bridged bake
    // must carry road surface cells, an un-bridged one must not
    const road = SURFACE_MATERIALS.indexOf('road')
    const hasRoad = (r: (typeof results)[number]) => Array.from(r.spec.surface.grid).some((v) => v === road)
    expect(hasRoad(bridged[0])).toBe(true)
    const unbridged = results.find((r) => !r.notes.some((n) => n.startsWith('river:') && n.includes('bridge')))
    if (unbridged) expect(hasRoad(unbridged)).toBe(false)
  })

  it('P2 regions follow-through: a portal across the river lands in a DEEPER region', () => {
    // Real locations pin portals at edge midpoints (see data/locations.ts);
    // with a river bisecting the map, some portal must land across it — its
    // linked region node then carries depth ≥ 1 from the spawn region.
    let deeperPortals = 0
    for (const seed of SEEDS.slice(0, 12)) {
      const s = 140
      const at: [number, number][] = [[3, s / 2], [s - 3, s / 2], [s / 2, 3], [s / 2, s - 3]]
      const r = generateMap(FIELD_RECIPE, {
        recipe: 'field', seed, size: s, themes: ['plains', 'water'],
        keepClear: at.map(([x, y]) => ({ x: x - 1.5, y: y - 1.5, w: 3, h: 3 })),
        pois: at.map(([x, y], i) => ({ kind: 'portal' as const, at: { x, y }, id: `portal-${i}` })),
      })
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      for (const nd of r.spec.semantic.nav.nodes) {
        if (nd.poiId?.startsWith('portal') && (nd.depth ?? 0) >= 1) deeperPortals++
      }
    }
    expect(deeperPortals).toBeGreaterThan(0)
  })

  it('skipPasses regions → semantic falls back to POI-stub nodes (layer inspector stays alive)', () => {
    const r = generateMap(FIELD_RECIPE, {
      recipe: 'field', seed: 5, size: 80, themes: ['plains', 'water'], skipPasses: ['regions'],
    })
    expect(r.spec.semantic.nav.edges).toEqual([])
    expect(r.spec.semantic.nav.nodes.length).toBe(r.spec.semantic.pois.length)
    expect(r.spec.semantic.nav.nodes.every((n) => n.id.startsWith('nav-'))).toBe(true)
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
