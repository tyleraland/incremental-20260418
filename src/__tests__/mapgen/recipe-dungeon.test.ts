// Dungeon fuzz gate — graph-first promises, checked over a seed sweep: every
// map validates (spawn room reachable through its corridors), layouts are
// CYCLIC BY CONSTRUCTION (the cycle-as-primitive skeleton, architecture plan
// track E: connected AND edges ≥ nodes on every seed), depth grades to a lair,
// stamps land under budget, the §J barred-cell's optional vault rides the
// reachability exemption, the shortcut-lock rewrite step gates a route without
// stranding anything — and (donjon-flavored) floors are DIVERSE: room sizes
// spread closet→hall, a good share of rooms are polymorph (L/T composites),
// corridors wind.

import { describe, it, expect } from 'vitest'
import { generateMap } from '@/mapgen'
import { bfsDepth } from '@/mapgen/graph'
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

  it('cycle by construction: every layout is connected AND carries a cycle (edges ≥ nodes)', () => {
    for (const r of results) {
      const { nodes, edges } = r.spec.semantic.nav
      expect(nodes.length).toBeGreaterThanOrEqual(3)
      // connected: BFS from the entry node reaches every node
      const entry = nodes.find((n) => (n.depth ?? 0) === 0)
      expect(entry, `${r.spec.seed}: no entry node`).toBeDefined()
      const depth = bfsDepth(edges, entry!.id)
      for (const n of nodes) expect(depth.has(n.id), `${r.spec.seed}/${n.id} unreachable in the nav graph`).toBe(true)
      // the cycle guarantee — designed skeleton, not spare-edge luck
      expect(edges.length, `${r.spec.seed}: tree, no cycle`).toBeGreaterThanOrEqual(nodes.length)
      for (const n of nodes) expect(n.area, `${r.spec.seed}/${n.id} missing area`).toBeDefined()
      // every corridor got a physical door
      for (const e of edges) expect(e.doorAt, `${r.spec.seed}: ${e.a}→${e.b} has no door`).toBeDefined()
    }
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

  it('deterministic per (seed, params): two bakes of every sweep seed are byte-identical', () => {
    for (const [k, r] of results.entries()) {
      expect(JSON.stringify(gen(SEEDS[k]).spec), `seed ${SEEDS[k]} rebaked differently`).toBe(JSON.stringify(r.spec))
    }
  })
})

describe('shortcut lock — the cycle rewrite step', () => {
  // Deterministically find a floor whose shortcut fired closed AND is that
  // seed's only lock carrying its tag (a same-tag vault lock would open too
  // under the kit, muddying the rect-delta assertion). attempts === 1 keeps
  // the open/closed variants on the same seed, not divergent reroll chains.
  let found: { seed: number; res: ReturnType<typeof generateMap> } | null = null
  for (let seed = 1; seed <= 60 && !found; seed++) {
    const r = gen(seed)
    const sc = r.spec.semantic.locks.find((l) => l.id.startsWith('lock-shortcut-'))
    if (!r.report.ok || r.attempts !== 1 || !sc || sc.open) continue
    if (r.spec.semantic.locks.filter((l) => !l.open && l.tag === sc.tag).length !== 1) continue
    found = { seed, res: r }
  }

  it('fires within the sweep and gates a ROUTE, not a prize', () => {
    expect(found, 'no shortcut lock fired in 60 seeds — rewrite step regressed').not.toBeNull()
    const lock = found!.res.spec.semantic.locks.find((l) => l.id.startsWith('lock-shortcut-'))!
    expect(lock.kind).toBe('proficiency')
    expect(lock.gates).toEqual([])           // nothing behind it — it gates the short way
    expect(lock.tag).toBeDefined()
    expect(lock.at).toBeDefined()
    // wired onto a nav edge whose door it plugs
    const edge = found!.res.spec.semantic.nav.edges.find((e) => e.lockId === lock.id)
    expect(edge).toBeDefined()
    expect(edge!.doorAt).toEqual(lock.at)
    // never an edge touching entry or goal (depth-0 node = entry)
    const nodes = found!.res.spec.semantic.nav.nodes
    const entry = nodes.find((n) => (n.depth ?? 0) === 0)!
    expect(edge!.a).not.toBe(entry.id)
    expect(edge!.b).not.toBe(entry.id)
    // and its gate POI marks the site
    expect(found!.res.spec.semantic.pois.some((p) => p.id === `${lock.id}-gate` && p.kind === 'gate')).toBe(true)
  })

  it('closed forces the long way (valid), open kit removes exactly the plug (valid)', () => {
    const { seed, res: closed } = found!
    const lock = closed.spec.semantic.locks.find((l) => l.id.startsWith('lock-shortcut-'))!
    expect(closed.report.ok, JSON.stringify(closed.report.rules.filter((r) => !r.ok))).toBe(true)
    const open = generateMap(DUNGEON_RECIPE, {
      recipe: 'dungeon', seed, size: 48, themes: ['dungeon'], proficiencies: [lock.tag!],
    })
    expect(open.report.ok, JSON.stringify(open.report.rules.filter((r) => !r.ok))).toBe(true)
    const openLock = open.spec.semantic.locks.find((l) => l.id === lock.id)!
    expect(openLock.open).toBe(true)
    // the closed variant spends exactly one more collision rect — the plug
    expect(closed.spec.collision.length).toBe(open.spec.collision.length + 1)
  })
})
