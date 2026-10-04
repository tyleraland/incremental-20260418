// ── Discoverable asset catalog ────────────────────────────────────────────────
//
// ONE enumerable list of every authored visual asset, with metadata, so tools
// (the dev asset gallery: browse / multi-select / copy names; a future player
// cosmetic picker) and content wiring read from a single source instead of
// hand-maintaining parallel lists. Pure data — no React, no JSX — so it stays
// cheap to import anywhere.
//
// Categories map to where the asset lives:
//   prop         → TERRAIN_PROPS (scatter decor)          [render/props.ts]
//   monster-body → PAPER_BODIES silhouette families        [render/bodies/*]
//   weapon       → WEAPON_SHAPES class weapons             [render/skins.tsx]
//   building     → BUILDING_LOOKS city structures          [render/buildings.ts]
//   ground       → ARENA_SKINS per-biome ground tiles      [render/skins.tsx]
//
// Adding an asset in its home module and (for props) tagging it in PROP_META is
// enough — it shows up here automatically.

import type { Biome } from '@/render/appearance'
import type { ScatterKind, ThemeTag } from '@/mapgen'
import { TERRAIN_PROPS, type PropRole, type Affinity, type RotatePolicy } from '@/render/props'
import { BODY_SHAPES, WEAPONS, monstersForShape, classesForWeapon } from '@/render/appearance'
import { BUILDING_LOOKS, ROOF_COVERINGS } from '@/render/buildings'

export type AssetCategory = 'prop' | 'monster-body' | 'weapon' | 'building' | 'ground'

export interface AssetDescriptor {
  category: AssetCategory
  id: string                 // unique within its category (the copy-to-clipboard name is `category:id`)
  biome?: Biome              // props + grounds
  kinds?: ScatterKind[]      // props: which mapgen scatter kinds place it (empty = decor-ring / not scattered)
  material?: string          // buildings
  variantCount?: number      // props: seeded siblings that ride the archetype
  playerSelectable: boolean  // true = a cosmetic the player can pick; false = procedural-only
  tags: string[]             // freeform: grouping / search / "used by"
  // props: the declarative PLACEMENT schema (props.ts PROP_META) — read by the
  // render's weighted/theme/rotate pick + surfaced in the ?workshop=1 catalog.
  weight?: number
  themes?: ThemeTag[]
  role?: PropRole
  near?: Affinity[]
  avoid?: Affinity[]
  rotate?: RotatePolicy
  clusterWith?: string[]
}

const BIOMES: Biome[] = ['grass', 'stone', 'plaza']
export const assetKey = (a: AssetDescriptor): string => `${a.category}:${a.id}`

// Enumerate every asset. Deterministic order (category, then declaration order).
export function listAssets(): AssetDescriptor[] {
  const out: AssetDescriptor[] = []

  // props — base archetypes only (seeded variants ride along, counted here)
  for (const biome of BIOMES) {
    for (const def of TERRAIN_PROPS[biome]) {
      if (def.id.includes('~')) continue
      out.push({
        category: 'prop',
        id: def.id,
        biome,
        kinds: def.kinds ?? [],
        variantCount: TERRAIN_PROPS[biome].filter((d) => d.id.startsWith(`${def.id}~`)).length,
        playerSelectable: def.playerSelectable ?? false,
        tags: def.tags ?? [],
        weight: def.weight,
        themes: def.themes,
        role: def.role,
        near: def.near,
        avoid: def.avoid,
        rotate: def.rotate,
        clusterWith: def.clusterWith,
      })
    }
  }

  // monster silhouettes + class weapons (procedural — chosen by monster/class)
  for (const shape of BODY_SHAPES) {
    out.push({ category: 'monster-body', id: shape, playerSelectable: false, tags: monstersForShape(shape) })
  }
  for (const w of WEAPONS) {
    out.push({ category: 'weapon', id: w, playerSelectable: false, tags: classesForWeapon(w) })
  }

  // city buildings + per-biome ground tiles
  for (const material of Object.keys(BUILDING_LOOKS)) {
    out.push({
      category: 'building',
      id: material,
      material,
      playerSelectable: false,
      tags: [BUILDING_LOOKS[material as keyof typeof BUILDING_LOOKS]!.roofed ? 'roofed' : 'ruin'],
    })
  }
  // roof coverings — seed-picked per roofed house, decoupled from wall material
  for (const cov of ROOF_COVERINGS) {
    out.push({ category: 'building', id: `roof-${cov.id}`, playerSelectable: false, tags: ['roof', cov.id] })
  }
  for (const biome of BIOMES) {
    out.push({ category: 'ground', id: biome, biome, playerSelectable: false, tags: [] })
  }

  return out
}

// Convenience filters for the gallery / a picker.
export const playerSelectableAssets = (): AssetDescriptor[] => listAssets().filter((a) => a.playerSelectable)
export const assetsInCategory = (c: AssetCategory): AssetDescriptor[] => listAssets().filter((a) => a.category === c)
