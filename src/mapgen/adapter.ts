// MapSpec → consumers (mirrors engine/adapter.ts's role: the ONLY translation
// point). The engine gets bare rects (material dropped — collision is pure
// {x,y,w,h,kind}); the store gets a Location-shaped entry point. The render
// layer will grow its own consumption (terrain.tsx reading surface/scatter) in
// a later phase — deliberately NOT stubbed here so the seam stays honest.

import type { Barrier } from '@/engine'
import type { GenParams, GenResult, MapSpec, ThemeTag } from './types'
import { THEME_TAGS } from './types'
import { generateMap } from './pipeline'
import { RECIPE_REGISTRY } from './recipes'

export function specBarriers(spec: MapSpec): Barrier[] {
  return spec.collision.map(({ x, y, w, h, kind }) => ({ x, y, w, h, kind }))
}

// The Location fields the generator reads — kept structural so mapgen never
// imports game types (leaf module; same discipline as the engine).
export interface MapGenSource {
  id: string
  traits: string[]
  openWorldSize?: number
  portals?: { at: [number, number] }[]
  mapGen?: { recipe: string; themes?: ThemeTag[]; seed?: number | string }
}

// Location → GenParams → GenResult. Deterministic per location: seed defaults
// to the location id (save = seed, and the id IS persisted), themes project
// from the location's traits (§G: one tag, coherent content everywhere), and
// portal cells become keep-clear boxes + portal POIs the validator must reach.
export function generateForLocation(loc: MapGenSource): GenResult {
  const cfg = loc.mapGen
  if (!cfg) throw new Error(`generateForLocation: ${loc.id} has no mapGen config`)
  const recipe = RECIPE_REGISTRY[cfg.recipe]
  if (!recipe) throw new Error(`generateForLocation: unknown recipe '${cfg.recipe}'`)
  const themes = cfg.themes ?? loc.traits.filter((t): t is ThemeTag => (THEME_TAGS as readonly string[]).includes(t))
  const portals = loc.portals ?? []
  const params: GenParams = {
    recipe: recipe.id,
    seed: cfg.seed ?? loc.id,
    size: loc.openWorldSize ?? 200,
    themes,
    keepClear: portals.map((p) => ({ x: p.at[0] - 1.5, y: p.at[1] - 1.5, w: 3, h: 3 })),
    pois: portals.map((p, i) => ({ kind: 'portal' as const, at: { x: p.at[0], y: p.at[1] }, id: `portal-${i}` })),
  }
  return generateMap(recipe, params)
}
