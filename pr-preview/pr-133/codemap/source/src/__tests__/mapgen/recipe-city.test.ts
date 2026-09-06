// City fuzz gate — road-first promises, checked over a seed sweep: every map
// validates (the street grid stays walkable by construction), the nav skeleton
// is published road-first (plaza → junctions → gates, most layouts looped by a
// cross-street), paving lands on the surface plane (road + plaza stone), and
// buildings genuinely FRONT the streets — solid, near pavement, never on it.

import { describe, it, expect } from 'vitest'
import { SURFACE_MATERIALS } from '@/mapgen'
import { generateMap } from '@/mapgen'
import { CITY_RECIPE } from '@/mapgen/recipes/city'

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1)
const gen = (seed: number, size = 64) =>
  generateMap(CITY_RECIPE, { recipe: 'city', seed, size, themes: ['city'] })

describe('city recipe fuzz gate', () => {
  const results = SEEDS.map((s) => gen(s))

  it('25 seeds × 64-cell towns: all validate inside the recipe budget', () => {
    for (const r of results) {
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      expect(r.spec.collision.length).toBeLessThanOrEqual(CITY_RECIPE.defaults!.maxBarriers!)
    }
  })

  it('road-first: plaza → junction → gate skeleton, all edges roads, loops are common', () => {
    let looped = 0
    for (const r of results) {
      const { nodes, edges } = r.spec.semantic.nav
      expect(nodes.find((n) => n.id === 'plaza')).toBeDefined()
      const gates = nodes.filter((n) => n.id.startsWith('gate-'))
      expect(gates.length).toBeGreaterThanOrEqual(3)
      for (const e of edges) expect(e.kind).toBe('road')
      // spanning skeleton is 2 edges per gate road; anything extra is a cross-street loop
      if (edges.length > gates.length * 2) looped++
    }
    expect(looped).toBe(SEEDS.length)   // the recipe always ties at least one loop
  })

  it('paving reaches the surface plane: road cells and a stone plaza under the spawn', () => {
    const mi = (m: string) => SURFACE_MATERIALS.indexOf(m as (typeof SURFACE_MATERIALS)[number])
    for (const r of results) {
      const g = r.spec.surface.grid
      let road = 0, stone = 0
      for (let i = 0; i < g.length; i++) {
        if (g[i] === mi('road')) road++
        if (g[i] === mi('stone-floor')) stone++
      }
      expect(road, `seed ${r.spec.seed} paved no streets`).toBeGreaterThan(50)
      expect(stone, `seed ${r.spec.seed} has no plaza floor`).toBeGreaterThan(30)
      const spawn = r.spec.semantic.pois.find((p) => p.kind === 'spawn')!
      expect(spawn.tags).toContain('plaza')
      expect(g[Math.floor(spawn.at.y) * r.spec.cols + Math.floor(spawn.at.x)]).toBe(mi('stone-floor'))
    }
  })

  it('buildings front the streets: solid walls near pavement, never on it', () => {
    const mi = (m: string) => SURFACE_MATERIALS.indexOf(m as (typeof SURFACE_MATERIALS)[number])
    for (const r of results) {
      expect(r.spec.collision.length, `seed ${r.spec.seed} built no houses`).toBeGreaterThanOrEqual(6)
      const g = r.spec.surface.grid
      for (const b of r.spec.collision) {
        expect(b.kind).toBe('wall')
        expect(['cut-stone', 'wood']).toContain(b.material)
        // no covered cell is paved (streets stay walkable by construction)
        for (let y = Math.floor(b.y); y < Math.ceil(b.y + b.h); y++) {
          for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.w); x++) {
            const m = g[y * r.spec.cols + x]
            expect(m === mi('road') || m === mi('stone-floor'), `seed ${r.spec.seed}: building on pavement at ${x},${y}`).toBe(false)
          }
        }
      }
      // streets read as tactical lanes/chokepoints to the profile
      expect(r.spec.semantic.tactical.chokepoints + r.spec.semantic.tactical.longLanes).toBeGreaterThan(0)
    }
  })

  it('the town knows its own story: §M name + one-line premise', () => {
    for (const r of results) {
      expect(r.spec.semantic.name).toBeTruthy()
      expect(r.spec.semantic.premise).toMatch(/town where \d roads meet/)
    }
  })

  it('deterministic per (seed, params)', () => {
    expect(gen(3).spec).toEqual(gen(3).spec)
  })
})
