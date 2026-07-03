// Dungeon fuzz gate — graph-first promises, checked over a seed sweep: every
// map validates (spawn room reachable through its corridors), layouts are
// CYCLIC (loops, not trees), depth grades to a lair, stamps land under budget,
// the §J barred-cell's optional vault rides the reachability exemption — and
// (donjon-flavored) floors are DIVERSE: room sizes spread closet→hall, a good
// share of rooms are polymorph (L/T composites), corridors wind.

import { describe, it, expect } from 'vitest'
import { generateMap } from '@/mapgen'
import { DUNGEON_RECIPE } from '@/mapgen/recipes/dungeon'

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1)
const gen = (seed: number, size = 48) =>
  generateMap(DUNGEON_RECIPE, { recipe: 'dungeon', seed, size, themes: ['dungeon'] })

describe('dungeon recipe fuzz gate', () => {
  const results = SEEDS.map((s) => gen(s))

  it('25 seeds × 48-cell floors: all validate inside the recipe budget', () => {
    for (const r of results) {
      expect(r.report.ok, `seed ${r.spec.seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      expect(r.spec.collision.length).toBeLessThanOrEqual(DUNGEON_RECIPE.defaults!.maxBarriers!)
      // the wall cover is EXACT — an uncovered solid cell would be walkable rock
      expect(r.notes.join(), `seed ${r.spec.seed} left solid cells uncovered`).not.toContain('OVER BUDGET')
    }
  })

  it('donjon diversity: sizes spread closet→hall, polymorph rooms are common', () => {
    let polymorphSeeds = 0
    let smallest = Infinity, largest = 0
    for (const r of results) {
      for (const n of r.spec.semantic.nav.nodes) {
        const area = (n.area?.w ?? 0) * (n.area?.h ?? 0)
        smallest = Math.min(smallest, area)
        largest = Math.max(largest, area)
      }
      const m = r.notes.join().match(/\((\d+) polymorph\)/)
      if (m && Number(m[1]) >= 2) polymorphSeeds++
    }
    expect(smallest).toBeLessThanOrEqual(30)      // closets exist
    expect(largest).toBeGreaterThanOrEqual(100)   // large halls exist
    expect(polymorphSeeds).toBeGreaterThan(SEEDS.length * 0.5)
  })

  it('graph-first: rooms + corridors published on the nav skeleton; most layouts carry a cycle', () => {
    let cyclic = 0
    for (const r of results) {
      const { nodes, edges } = r.spec.semantic.nav
      expect(nodes.length).toBeGreaterThanOrEqual(3)
      expect(edges.length).toBeGreaterThanOrEqual(nodes.length - 1)   // connected
      for (const n of nodes) expect(n.area, `${r.spec.seed}/${n.id} missing area`).toBeDefined()
      if (edges.length >= nodes.length) cyclic++                      // spanning tree + extra = loop
      // every corridor got a physical door
      for (const e of edges) expect(e.doorAt, `${r.spec.seed}: ${e.a}→${e.b} has no door`).toBeDefined()
    }
    expect(cyclic).toBeGreaterThan(SEEDS.length * 0.7)
  })

  it('depth grades from the entry; the lair sits at max depth; doors read as chokepoints', () => {
    let lairs = 0, choked = 0
    for (const r of results) {
      const spawn = r.spec.semantic.pois.find((p) => p.kind === 'spawn')
      expect(spawn?.tags).toContain('entry')
      const lair = r.spec.semantic.pois.find((p) => p.kind === 'lair')
      if (lair) {
        lairs++
        const maxDepth = Math.max(...r.spec.semantic.nav.nodes.map((n) => n.depth ?? 0))
        expect(lair.tags).toContain(`depth-${maxDepth}`)
        expect(maxDepth).toBeGreaterThan(0)
      }
      if (r.spec.semantic.tactical.chokepoints >= 1) choked++
    }
    expect(lairs).toBeGreaterThan(SEEDS.length * 0.9)
    expect(choked).toBeGreaterThan(SEEDS.length * 0.9)
  })

  it('stamps: each starter vault places somewhere across the sweep; barred vault is optional-tagged', () => {
    const allNotes = results.flatMap((r) => r.notes).join('\n')
    for (const id of ['pillar-vault@', 'shrine@', 'barred-cell@']) {
      expect(allNotes, `stamp ${id} never placed in 25 seeds`).toContain(id)
    }
    const barred = results.find((r) => r.notes.some((n) => n.includes('barred-cell@')))!
    const vault = barred.spec.semantic.pois.find((p) => p.id.startsWith('barred-cell-vault'))
    expect(vault?.tags).toContain('optional')
    // …and the map still validated even though the vault sits behind bars
    expect(barred.report.ok).toBe(true)
  })

  it('recipe defaults are load-bearing: the dungeon spawn apron must be room-sized', () => {
    // An apron bigger than any room's half-extent (corner rooms max out at
    // ~7.45 on a 48-cell g=3 lattice) can never clear the entry room's own
    // walls — every attempt fails. The recipe's room-scaled default (3.5) is
    // what makes the same seed bake; caller params still win when passed.
    const r = generateMap(DUNGEON_RECIPE, { recipe: 'dungeon', seed: 2, size: 48, themes: [], spawnApron: 8 })
    expect(r.report.ok).toBe(false)
    expect(r.report.rules.find((x) => x.rule === 'apron-clear')?.ok).toBe(false)
    expect(gen(2).report.ok).toBe(true)
  })

  it('deterministic per (seed, params)', () => {
    expect(gen(3).spec).toEqual(gen(3).spec)
  })
})
