import { describe, it, expect } from 'vitest'
import { TERRAIN_PROPS, SCATTER_SETS } from '@/render/props'
import { listAssets, assetKey, type AssetCategory } from '@/render/assets'
import { SCATTER_KINDS } from '@/mapgen'
import type { Biome } from '@/render/appearance'

const BIOMES: Biome[] = ['grass', 'stone', 'plaza']
// Props deliberately placed by the plaza decor ring, NOT scatter — allowed to
// carry no scatter kinds. Anything else with empty kinds would go invisible on
// generated maps, which is the bug this suite guards.
const DECOR_RING = new Set(['lamppost', 'banner'])
// Asset-library props placed by FUTURE systems (interactables phase 6, pickups),
// not scatter — the tags declare the intent, so empty kinds is correct, not a
// reachability bug. They stay reviewable via the catalog/gallery/workshop.
const NON_SCATTER_TAGS = ['interactable', 'pickup']
const isAssetLibrary = (tags?: string[]) => (tags ?? []).some((t) => NON_SCATTER_TAGS.includes(t))

describe('scatter reachability (no authored prop goes dark on generated maps)', () => {
  it('every base prop either declares scatter kinds or is a known decor-ring asset', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        if (def.id.includes('~')) continue // seeded variant, carries the base's kinds
        const scatterable = (def.kinds?.length ?? 0) > 0
        expect(
          scatterable || DECOR_RING.has(def.id) || isAssetLibrary(def.tags),
          `${biome}/${def.id} has no scatter kinds and isn't a decor-ring or tagged asset-library prop — it will never appear on a generated map`,
        ).toBe(true)
      }
    }
  })

  it('every declared kind is a real ScatterKind', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        for (const k of def.kinds ?? []) expect(SCATTER_KINDS).toContain(k)
      }
    }
  })

  // Phase-1 placement schema: the render pick is theme-filtered + role-aware, so
  // a scatterable prop that declares neither makes generation dumber (universal /
  // field fallback only). Like the kinds-reachability gate, this enforces
  // COVERAGE — every scatter prop must carry these tags. We strive for accurate
  // tags and refine them as later phases consume the fields.
  it('every scatterable base prop declares a role and a non-empty themes list', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        if (def.id.includes('~')) continue // variant, inherits the base's tags
        const scatterable = (def.kinds?.length ?? 0) > 0
        if (!scatterable || DECOR_RING.has(def.id)) continue
        expect(def.role, `${biome}/${def.id} is scatterable but has no placement 'role'`).toBeTruthy()
        expect(
          (def.themes?.length ?? 0) > 0,
          `${biome}/${def.id} is scatterable but declares no 'themes' — it can't be theme-filtered`,
        ).toBe(true)
      }
    }
  })

  it('carries placement tags onto seeded variants (variant sync)', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome].filter((d) => d.id.includes('~'))) {
        const parent = TERRAIN_PROPS[biome].find((x) => x.id === def.id.split('~')[0])!
        expect(def.role, `${biome}/${def.id} lost role`).toBe(parent.role)
        expect(def.weight, `${biome}/${def.id} lost weight`).toBe(parent.weight)
        expect(def.rotate, `${biome}/${def.id} lost rotate`).toBe(parent.rotate)
        expect(def.themes, `${biome}/${def.id} lost themes`).toEqual(parent.themes)
        expect(def.pass, `${biome}/${def.id} lost pass`).toBe(parent.pass)
        expect(def.footprint, `${biome}/${def.id} lost footprint`).toBe(parent.footprint)
        expect(def.layer, `${biome}/${def.id} lost layer`).toBe(parent.layer)
        expect(def.themeWeight, `${biome}/${def.id} lost themeWeight`).toEqual(parent.themeWeight)
        expect(def.scaleJitter, `${biome}/${def.id} lost scaleJitter`).toEqual(parent.scaleJitter)
        expect(def.anchor, `${biome}/${def.id} lost anchor`).toEqual(parent.anchor)
        expect(def.sim, `${biome}/${def.id} lost sim`).toEqual(parent.sim)
      }
    }
  })

  // Part-3 schema wellformedness: the hard-constraint + simulation seams are
  // declarative, but dangling references and impossible combinations are bugs
  // TODAY (a statePair that names a missing prop can never flip; an orient
  // without an anchor has nothing to face).
  it('part-3 constraint/sim tags are well-formed', () => {
    const ids = new Set(BIOMES.flatMap((b) => TERRAIN_PROPS[b].map((d) => d.id)))
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        if (def.id.includes('~')) continue
        if (def.orient) {
          expect(
            (def.anchor?.length ?? 0) > 0 || !!def.series,
            `${biome}/${def.id} declares 'orient' but no 'anchor'/'series' to orient against`,
          ).toBe(true)
        }
        if (def.series) {
          const [lo, hi] = def.series.spacing
          expect(lo > 0 && lo <= hi, `${biome}/${def.id} series spacing [${lo},${hi}] is invalid`).toBe(true)
        }
        if (def.sim?.statePair) {
          expect(ids.has(def.sim.statePair), `${biome}/${def.id} sim.statePair '${def.sim.statePair}' does not exist`).toBe(true)
        }
        if (def.sim?.disguisesAs) {
          expect(ids.has(def.sim.disguisesAs), `${biome}/${def.id} sim.disguisesAs '${def.sim.disguisesAs}' does not exist`).toBe(true)
          expect(def.sim.encounter, `${biome}/${def.id} disguisesAs without encounter:'ambush'`).toBe('ambush')
        }
      }
    }
  })

  // Part-2 metadata coverage: passability + footprint are what pathfinding,
  // spawn validity, and the overlap-reserving placer read — an unset value is
  // a real hole (the placer can't tell a boulder from a pebble), so coverage
  // is a gate exactly like kinds/role/themes.
  it('every scatterable base prop declares pass + footprint', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        if (def.id.includes('~')) continue
        if ((def.kinds?.length ?? 0) === 0) continue
        expect(def.pass, `${biome}/${def.id} has no 'pass' (solid/walkable/overhang)`).toBeTruthy()
        expect(
          typeof def.footprint === 'number' && def.footprint > 0,
          `${biome}/${def.id} has no positive 'footprint'`,
        ).toBe(true)
      }
    }
  })

  it('every SCATTER_SETS member references an existing base prop', () => {
    const ids = new Set(BIOMES.flatMap((b) => TERRAIN_PROPS[b].map((d) => d.id)))
    for (const set of SCATTER_SETS) {
      expect(set.members.length, `set ${set.id} has no members`).toBeGreaterThan(0)
      for (const m of set.members) {
        expect(ids.has(m.prop), `set ${set.id} references unknown prop '${m.prop}'`).toBe(true)
        expect(m.n[0] <= m.n[1], `set ${set.id}/${m.prop} has inverted n range`).toBe(true)
      }
    }
  })

  it('the kinds the recipes commonly emit each resolve to a prop in every biome', () => {
    // city/field recipes emit these (never `reed` on the city) — each MUST have
    // at least one tagged prop per biome, or that kind renders nothing.
    const emitted = ['tree', 'bush', 'rock', 'stump', 'flower'] as const
    for (const biome of BIOMES) {
      for (const kind of emitted) {
        const hit = TERRAIN_PROPS[biome].some((d) => d.kinds?.includes(kind))
        expect(hit, `${biome} has no prop for emitted kind '${kind}'`).toBe(true)
      }
    }
  })
})

describe('asset catalog', () => {
  const assets = listAssets()
  it('enumerates every base prop with metadata', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        if (def.id.includes('~')) continue
        const found = assets.find((a) => a.category === 'prop' && a.id === def.id && a.biome === biome)
        expect(found, `catalog missing prop ${biome}/${def.id}`).toBeTruthy()
      }
    }
  })

  it('covers all categories and yields stable unique keys', () => {
    const cats = new Set<AssetCategory>(assets.map((a) => a.category))
    for (const c of ['prop', 'monster-body', 'weapon', 'building', 'ground'] as AssetCategory[]) {
      expect(cats.has(c), `no assets in category ${c}`).toBe(true)
    }
    const keys = assets.map(assetKey)
    expect(new Set(keys).size).toBe(keys.length) // unique
  })
})
