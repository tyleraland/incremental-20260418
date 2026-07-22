// Theme profiles + tuning dials — the ?mapgen=1 lab's levers, machine-gated.
// The binding contracts:
//   · every theme tag MOVES GEOMETRY (surface histogram, scatter multiset, or
//     collision rects) — a checkbox that only renames the map is a regression;
//   · combinations COMPOSE: features union, conflicting palettes zone by
//     normalized elevation in params.themes order;
//   · tuning dials shift computation ONLY: `tuning: {}` (and absent) bakes
//     byte-identical, and dialed bakes stay deterministic;
//   · the reserved 'accent' scatter intent is actually emitted (≤ 4 items);
//   · naming covers every theme tag (themed maps name themselves).

import { describe, it, expect } from 'vitest'
import { generateMap, SURFACE_MATERIALS, THEME_TAGS, type MapgenTuning, type MapSpec, type SurfaceMaterial, type ThemeTag } from '@/mapgen'
import { FIELD_RECIPE, THEME_PROFILES } from '@/mapgen/recipes/field'
import { THEME_PREFIXES, FIELD_LANDFORM } from '@/mapgen/naming'

const bake = (themes: ThemeTag[]) =>
  generateMap(FIELD_RECIPE, { recipe: 'field', seed: 7, size: 96, themes })

const matCount = (spec: MapSpec, m: SurfaceMaterial) => {
  const idx = SURFACE_MATERIALS.indexOf(m)
  let n = 0
  for (const v of spec.surface.grid) if (v === idx) n++
  return n
}

// The three geometry planes, digested for comparison: surface index histogram,
// scatter kind multiset, collision rect list.
const digest = (spec: MapSpec) => {
  const hist = new Array<number>(SURFACE_MATERIALS.length).fill(0)
  for (const v of spec.surface.grid) hist[v]++
  const kinds = spec.scatter.map((it) => it.kind).sort().join(',')
  return JSON.stringify({ hist, kinds, collision: spec.collision })
}

describe('theme profiles (every tag drives generation)', () => {
  it('every theme tag moves geometry: [t] differs from [plains] at seed 7 / 96²', () => {
    const base = digest(bake(['plains']).spec)
    for (const t of THEME_TAGS) {
      if (t === 'plains') continue
      expect(digest(bake([t]).spec), `theme '${t}' bakes plains-identical geometry`).not.toBe(base)
    }
  })

  it('every single-theme bake stays valid across a small sweep', () => {
    for (const t of THEME_TAGS) {
      for (const seed of [1, 2, 3]) {
        const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 96, themes: [t] })
        expect(r.report.ok, `${t} seed ${seed}: ${JSON.stringify(r.report.rules.filter((x) => !x.ok))}`).toBe(true)
      }
    }
  })

  it('palette combos zone by elevation: volcanic+snow shows ash lowland AND snow highland', () => {
    const r = bake(['volcanic', 'snow'])
    expect(r.report.ok).toBe(true)
    expect(matCount(r.spec, 'ash')).toBeGreaterThan(0)
    expect(matCount(r.spec, 'snow')).toBeGreaterThan(0)
    // volcanic accent bands fire inside its zone (lava is moisture-gated and
    // may miss a seed; gravel's barren band is broad enough to demand)
    expect(matCount(r.spec, 'gravel') + matCount(r.spec, 'lava')).toBeGreaterThan(0)
  })

  it('feature union: swamp+forest has bog cells AND the forest scatter signature', () => {
    const r = bake(['swamp', 'forest'])
    expect(r.report.ok).toBe(true)
    expect(matCount(r.spec, 'bog')).toBeGreaterThan(0)
    // forest fires independently: its 1.6× density on top of swamp's 1.2×
    const swampOnly = bake(['swamp'])
    expect(r.spec.scatter.length).toBeGreaterThan(swampOnly.spec.scatter.length)
  })

  it("'river' gates the river pass alongside 'water'; hydrology stays water|beach", () => {
    const r = bake(['river'])
    expect(r.notes.some((n) => n.startsWith('river:') && n.includes('rect(s) spent')), 'river theme grew no river').toBe(true)
    // no lake: every deep-water rect belongs to the river course, and
    // hydrology leaves no lake scratch note
    expect(r.notes.some((n) => n.startsWith('hydrology:'))).toBe(false)
  })

  it('theme wall materials land on the collision plane (village fences, ruin rubble)', () => {
    // sweep a few seeds — wall-kind outcrops need elevation ≥ 0.38 sites
    const sawWood = [1, 2, 3, 7].some((seed) =>
      generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 96, themes: ['village'] })
        .spec.collision.some((c) => c.material === 'wood'))
    const sawRubble = [1, 2, 3, 7].some((seed) =>
      generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 96, themes: ['ruins'] })
        .spec.collision.some((c) => c.material === 'rubble'))
    expect(sawWood, 'village never fenced an outcrop in wood').toBe(true)
    expect(sawRubble, 'ruins never crumbled an outcrop to rubble').toBe(true)
  })

  it('flowerless themes hold: volcanic/snow/haunted bakes place no flower scatter', () => {
    for (const t of ['volcanic', 'snow', 'haunted'] as ThemeTag[]) {
      for (const seed of [1, 2, 7]) {
        const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 96, themes: [t] })
        expect(r.spec.scatter.some((it) => it.kind === 'flower'), `${t} seed ${seed} grew a flower`).toBe(false)
      }
    }
  })
})

describe('tuning dials (GenParams.tuning → passes)', () => {
  it('identity: tuning {} ≡ absent, byte-identical spec (plains and themed combos)', () => {
    for (const themes of [['plains', 'water'], ['volcanic', 'snow'], ['swamp', 'forest']] as ThemeTag[][]) {
      const a = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 9, size: 120, themes })
      const b = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 9, size: 120, themes, tuning: {} })
      expect(b.spec, `themes ${themes.join('+')}`).toEqual(a.spec)
      expect(Array.from(b.spec.surface.grid)).toEqual(Array.from(a.spec.surface.grid))
    }
  })

  it('identity: explicit default dial VALUES ≡ absent on a plains-palette map', () => {
    // (Plains only by design: a themed palette's dial-tagged bands sit at their
    // own defaults — desert's barren band is 0.42, volcanic's lush is 0.78 —
    // so explicit 0.68/0.3 would legitimately move them.)
    const defaults: MapgenTuning = {
      meadowThreshold: 0.68, barrenThreshold: 0.3, outcropDensity: 1,
      riverWidthScale: 1, riverFordCount: 2, riverBridgeChance: 0.35,
      routeChance: 0.6, scatterDensity: 1, clumpCount: 5, maxScatterItems: 96,
    }
    const a = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'] })
    const c = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'], tuning: defaults })
    expect(c.spec).toEqual(a.spec)
  })

  it('scatterDensity 0 → no fill scatter (and default bakes have some)', () => {
    const params = { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'] as ThemeTag[] }
    const dense = generateMap(FIELD_RECIPE, params)
    const none = generateMap(FIELD_RECIPE, { ...params, tuning: { scatterDensity: 0 } })
    expect(dense.spec.scatter.filter((it) => it.intent === 'field').length).toBeGreaterThan(0)
    expect(none.spec.scatter.filter((it) => it.intent === 'field').length).toBe(0)
  })

  it('riverFordCount moves the punched fords; 0 skips the river whole (no fordless rivers)', () => {
    const params = { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'] as ThemeTag[] }
    const fords = (r: ReturnType<typeof generateMap>) =>
      Number(r.notes.find((n) => n.startsWith('river:') && n.includes('ford('))?.match(/(\d+) ford\(s\)/)?.[1] ?? -1)
    const d2 = generateMap(FIELD_RECIPE, params)
    const d4 = generateMap(FIELD_RECIPE, { ...params, tuning: { riverFordCount: 4 } })
    expect(fords(d2)).toBe(2)
    expect(fords(d4)).toBeGreaterThan(2)
    const d0 = generateMap(FIELD_RECIPE, { ...params, tuning: { riverFordCount: 0 }, onFail: 'accept' })
    expect(d0.notes.some((n) => n.startsWith('river:') && n.includes('no viable ford reach'))).toBe(true)
  })

  it('routeChance 0 always skips the route gate on the coin', () => {
    const params = { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'] as ThemeTag[] }
    const r = generateMap(FIELD_RECIPE, { ...params, tuning: { routeChance: 0 } })
    expect(r.notes.some((n) => n.includes('route gate skipped (coin)'))).toBe(true)
  })

  it('outcropDensity raises the outcrop spend under a loose cap', () => {
    const params = { recipe: 'field', seed: 7, size: 96, themes: ['plains'] as ThemeTag[], maxBarriers: 72 }
    const lean = generateMap(FIELD_RECIPE, params)
    const thick = generateMap(FIELD_RECIPE, { ...params, tuning: { outcropDensity: 2 } })
    expect(thick.spec.collision.length).toBeGreaterThan(lean.spec.collision.length)
  })
})

describe("accent intent (phase-3 'accent', now emitted)", () => {
  it('field bakes place 1–4 accent hero props, clear of rects', () => {
    const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 9, size: 160, themes: ['plains', 'water'] })
    const accents = r.spec.scatter.filter((it) => it.intent === 'accent')
    expect(accents.length).toBeGreaterThan(0)
    expect(accents.length).toBeLessThanOrEqual(4)
    for (const a of accents) {
      const buried = r.spec.collision.some((c) => a.x > c.x && a.x < c.x + c.w && a.y > c.y && a.y < c.y + c.h)
      expect(buried, `accent at ${a.x},${a.y} sits inside a rect`).toBe(false)
    }
  })
})

describe('naming coverage (themed maps name themselves)', () => {
  it('every THEME_TAG has a prefix pool; field-relevant tags have a landform', () => {
    for (const t of THEME_TAGS) {
      expect(THEME_PREFIXES[t]?.length ?? 0, `no THEME_PREFIXES for '${t}'`).toBeGreaterThan(0)
    }
    for (const t of THEME_TAGS) {
      if (t === 'plains' || t === 'city' || t === 'dungeon') continue  // plains uses the meadowland fallback
      expect(FIELD_LANDFORM[t], `no FIELD_LANDFORM for '${t}'`).toBeTruthy()
    }
  })

  it('a themed bake names itself from its theme pool', () => {
    const r = bake(['swamp'])
    const pool = THEME_PREFIXES.swamp!
    expect(pool.some((p) => r.spec.semantic.name!.startsWith(p)), `name '${r.spec.semantic.name}' ignores the swamp pool`).toBe(true)
    expect(r.spec.semantic.premise).toContain('mire')
  })
})

// keep TS aware the profile table is the seam the lab reads
it('THEME_PROFILES covers every non-default tag with at least one lever', () => {
  for (const t of THEME_TAGS) {
    const p = THEME_PROFILES[t]
    if (t === 'plains') continue
    expect(p, `no THEME_PROFILES entry for '${t}'`).toBeDefined()
    expect(Object.keys(p!).length).toBeGreaterThan(0)
  }
})
