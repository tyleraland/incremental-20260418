import { describe, it, expect } from 'vitest'
import { TERRAIN_PROPS } from '@/render/props'
import { listAssets, assetKey, type AssetCategory } from '@/render/assets'
import { SCATTER_KINDS } from '@/mapgen'
import type { Biome } from '@/render/appearance'

const BIOMES: Biome[] = ['grass', 'stone', 'plaza']
// Props deliberately placed by the plaza decor ring, NOT scatter — the ONLY
// props allowed to carry no scatter kinds. Anything else with empty kinds would
// go invisible on generated maps, which is the bug this suite guards.
const DECOR_RING = new Set(['lamppost', 'banner'])

describe('scatter reachability (no authored prop goes dark on generated maps)', () => {
  it('every base prop either declares scatter kinds or is a known decor-ring asset', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        if (def.id.includes('~')) continue // seeded variant, carries the base's kinds
        const scatterable = (def.kinds?.length ?? 0) > 0
        expect(
          scatterable || DECOR_RING.has(def.id),
          `${biome}/${def.id} has no scatter kinds and isn't a decor-ring asset — it will never appear on a generated map`,
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
  // field fallback only). Mirror the kinds-reachability gate: presence, not
  // correctness — tagging is REQUIRED for every scatter prop.
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
