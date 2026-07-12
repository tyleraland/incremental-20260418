// Lock-and-key foundation (§D/§F): the validator enforces both directions of
// every lock (closed seals, open delivers, critical path never gated), and the
// dungeon's gates pass resolves variants at bake — same seed × different party
// kit = a different playable map, byte-deterministic per kit.

import { describe, it, expect } from 'vitest'
import {
  generateMap, normalizeParams, validate,
  type CollisionRect, type Lock, type MapSpec, type Poi, type ProficiencyTag, type ThemeTag,
} from '@/mapgen'
import type { PassCtx, RecipeDef } from '@/mapgen/pipeline'
import { addBarrier } from '@/mapgen/draft'
import { DUNGEON_RECIPE } from '@/mapgen/recipes/dungeon'
import { FIELD_RECIPE } from '@/mapgen/recipes/field'

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

// ── P3: overworld gates through the SAME gates.ts calls the dungeon makes ────
// The convergence thesis end-to-end: the field recipe's gates pass route-locks
// a redundant derived 'crossing' (a ford too deep / a collapsed bridge) with
// placeShortcutLock — same seed × different kit = a different playable
// OVERWORLD map. Portals are pinned like real locations (data/locations.ts) so
// the critical-path rule is exercised for real: every portal must stay
// reachable in the closed variant.

describe('field route gates (overworld variant-at-deploy — P3)', () => {
  const S = 140
  const portalAt: [number, number][] = [[3, S / 2], [S - 3, S / 2], [S / 2, 3], [S / 2, S - 3]]
  const fieldParams = (seed: number, proficiencies?: ProficiencyTag[]) => ({
    recipe: 'field', seed, size: S, themes: ['plains', 'water'] as ThemeTag[],
    keepClear: portalAt.map(([x, y]) => ({ x: x - 1.5, y: y - 1.5, w: 3, h: 3 })),
    pois: portalAt.map(([x, y], i) => ({ kind: 'portal' as const, at: { x, y }, id: `portal-${i}` })),
    proficiencies,
  })
  // Deterministically find first-roll water fields whose ONLY lock is a closed
  // route gate. attempts === 1 for the same reason as the dungeon suite above
  // (reroll chains diverge between kits); exactly-one-lock so the rect-delta
  // and wrong-kit assertions are about THIS lock. Measured: 34/60 seeds
  // qualify (coin 0.6 × redundant-crossing availability) — 4 is comfortable.
  const gated = [] as { seed: number; closed: ReturnType<typeof generateMap>; lock: Lock }[]
  for (let seed = 1; seed <= 60 && gated.length < 4; seed++) {
    const r = generateMap(FIELD_RECIPE, fieldParams(seed))
    const locks = r.spec.semantic.locks
    const l = locks[0]
    if (r.report.ok && r.attempts === 1 && locks.length === 1 && l && !l.open && l.id.startsWith('lock-shortcut-')) {
      gated.push({ seed, closed: r, lock: l })
    }
  }

  it('route gates bake CLOSED for the kitless default; the critical path holds', () => {
    expect(gated.length, 'fewer than 4 first-roll route-gated water fields in 60 seeds — gate frequency regressed').toBe(4)
    for (const g of gated) {
      // a ROUTE lock, not a prize lock, on a terrain-fitting tag
      expect(g.lock.kind).toBe('proficiency')
      expect(g.lock.gates).toEqual([])
      expect(['mobility', 'might']).toContain(g.lock.tag)
      // the locked edge stays PUBLISHED (P2's derived graph survives closed
      // gates) and carries the lock at its pinch
      const edge = g.closed.spec.semantic.nav.edges.find((e) => e.lockId === g.lock.id)
      expect(edge, `seed ${g.seed}: no nav edge carries ${g.lock.id}`).toBeDefined()
      expect(edge!.kind).toBe('crossing')
      expect(edge!.doorAt).toEqual(g.lock.at)
      // the gate POI marks the site
      expect(g.closed.spec.semantic.pois.some((p) => p.id === `${g.lock.id}-gate` && p.kind === 'gate')).toBe(true)
      // report.ok already covers it — but assert the two load-bearing rules
      // explicitly: every portal POI stayed reachable (never gate the critical
      // path) and the deep-water plug kept the water story coherent
      const reach = g.closed.report.rules.find((x) => x.rule === 'reachable')
      expect(reach?.ok, `seed ${g.seed}: ${reach?.detail}`).toBe(true)
      expect(reach?.detail).toContain('POIs reachable')
      expect(g.closed.report.rules.find((x) => x.rule === 'water-coherence')?.ok).toBe(true)
    }
  })

  it('matching kit re-bakes the SAME seed open: validates, minus exactly the plug', () => {
    const g = gated[0]
    const open = generateMap(FIELD_RECIPE, fieldParams(g.seed, [g.lock.tag!]))
    expect(open.report.ok, JSON.stringify(open.report.rules.filter((r) => !r.ok))).toBe(true)
    const l = open.spec.semantic.locks.find((x) => x.id === g.lock.id)
    expect(l?.open).toBe(true)
    // the seal geometry was omitted — one fewer collision rect
    expect(open.spec.collision.length).toBe(g.closed.spec.collision.length - 1)
    // graph-truthful now VERIFIES the edge (open locks are no longer exempt)
    expect(open.report.rules.find((x) => x.rule === 'graph-truthful')?.ok).toBe(true)
    // a NON-matching kit changes nothing, byte for byte
    const wrong: ProficiencyTag = g.lock.tag === 'mobility' ? 'arcane' : 'holy'
    expect(generateMap(FIELD_RECIPE, fieldParams(g.seed, [wrong])).spec).toEqual(g.closed.spec)
  })

  it('variants are deterministic per (seed, kit)', () => {
    const g = gated[1]
    const a = generateMap(FIELD_RECIPE, fieldParams(g.seed, [g.lock.tag!]))
    const b = generateMap(FIELD_RECIPE, fieldParams(g.seed, [g.lock.tag!]))
    expect(a.spec).toEqual(b.spec)
  })

  it('frequency floor: route gates fire on a healthy share of a water sweep', () => {
    // Measured 18/25 at sizes 120/160/200 (coin 0.6 × candidate availability);
    // floor at 10/25 — far under observed, but a regression to "overworld
    // gates never fire" (budget starvation, candidate drought) trips it.
    let fired = 0
    for (let seed = 1; seed <= 25; seed++) {
      const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 160, themes: ['plains', 'water'] })
      if (r.spec.semantic.locks.some((l) => l.id.startsWith('lock-shortcut-'))) fired++
    }
    expect(fired).toBeGreaterThanOrEqual(10)
  })
})

// ── P3: the secret vault pocket (prize lock) ─────────────────────────────────
// NATURAL degree-1 pockets are ~nonexistent on current geography — measured
// 0 vaults across ~600 bakes (25–100 seeds × sizes 60–200 × theme mixes
// plains/forest/mountain/water): river maps derive 2 regions joined by 2
// fords, both banks degree-2, and outcrops never enclose a region of their
// own. So there is NO real-bake vault assertion here (it would be vacuous or
// flaky); manufacturing pockets with extra geometry is follow-up dressing
// work, not this packet. Instead the vault path is exercised end-to-end
// through the pipeline with a synthetic enclosure pass (the P1 synthetic-mask
// precedent): a walled NE pocket with one 2-wide gap → a genuine degree-1
// region → the field's own gates/regions/semantic passes do the rest.

describe('field vault pocket (synthetic degree-1 region)', () => {
  const passOf = (id: string) => FIELD_RECIPE.passes.find((p) => p.id === id)!
  // three walls enclose x∈(52,64) × y∈(0,14) save a 2-wide gap at y=6..7 —
  // clearance 1, so deriveRegions erodes it into a 'crossing' pinch
  const enclosurePass = {
    id: 'enclosure',
    run({ draft }: PassCtx) {
      addBarrier(draft, { x: 50, y: 14, w: 14, h: 2, kind: 'wall', material: 'rock' })
      addBarrier(draft, { x: 50, y: 0, w: 2, h: 6, kind: 'wall', material: 'rock' })
      addBarrier(draft, { x: 50, y: 8, w: 2, h: 6, kind: 'wall', material: 'rock' })
    },
  }
  const POCKET_RECIPE: RecipeDef = {
    id: 'field', name: 'pocket lab', description: 'synthetic degree-1 pocket for the vault path',
    passes: [enclosurePass, passOf('regions'), passOf('gates'), passOf('semantic')],
  }
  const bake = (proficiencies?: ProficiencyTag[]) =>
    generateMap(POCKET_RECIPE, { recipe: 'field', seed: 1, size: 64, themes: [], proficiencies })

  it('closed: the pocket seals behind a perception-hidden trail; nothing else strands', () => {
    const closed = bake()
    expect(closed.report.ok, JSON.stringify(closed.report.rules.filter((r) => !r.ok))).toBe(true)
    expect(closed.attempts).toBe(1)
    const lock = closed.spec.semantic.locks.find((l) => !l.id.startsWith('lock-shortcut-'))
    expect(lock, `no vault lock: ${closed.notes.filter((n) => n.startsWith('gates:')).join('; ')}`).toBeDefined()
    expect(lock!.tag).toBe('perception')
    expect(lock!.open).toBe(false)
    expect(lock!.gates).toEqual([`${lock!.id}-prize`])
    // prize POI inside the pocket, tagged for the reachability exemption
    const prize = closed.spec.semantic.pois.find((p) => p.id === `${lock!.id}-prize`)
    expect(prize?.kind).toBe('vault')
    expect(prize?.tags).toContain(`locked:${lock!.id}`)
    // the pocket's single edge carries the lock; the locks rule proved the
    // seal (closed ⇒ prize genuinely unreachable) and the landmark stayed out
    expect(closed.spec.semantic.nav.edges.some((e) => e.lockId === lock!.id)).toBe(true)
    expect(closed.report.rules.find((x) => x.rule === 'locks')?.ok).toBe(true)
  })

  it('perception kit re-bakes it open: prize delivered, minus exactly the plug', () => {
    const closed = bake()
    const open = bake(['perception'])
    expect(open.report.ok, JSON.stringify(open.report.rules.filter((r) => !r.ok))).toBe(true)
    const lock = open.spec.semantic.locks.find((l) => !l.id.startsWith('lock-shortcut-'))!
    expect(lock.open).toBe(true)
    expect(open.spec.collision.length).toBe(closed.spec.collision.length - 1)
    // a NON-matching kit changes nothing
    expect(generateMap(POCKET_RECIPE, { recipe: 'field', seed: 1, size: 64, themes: [], proficiencies: ['holy'] }).spec)
      .toEqual(closed.spec)
  })
})
