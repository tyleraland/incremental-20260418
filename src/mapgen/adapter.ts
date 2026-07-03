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
    // LIVE maps hold the measured pathing envelope (store BARRIER_CAP /
    // map-perf-envelope's MAX_BENCHED_BARRIERS=16): steerAround cost grows with
    // rect count. The lab explores up to the looser lib default; the game does not.
    maxBarriers: 16,
    keepClear: portals.map((p) => ({ x: p.at[0] - 1.5, y: p.at[1] - 1.5, w: 3, h: 3 })),
    pois: portals.map((p, i) => ({ kind: 'portal' as const, at: { x: p.at[0], y: p.at[1] }, id: `portal-${i}` })),
  }
  return generateMap(recipe, params)
}

// Session cache: generation is pure and a location's params are static data, so
// a result never invalidates. Lets render-path callers (BattleView per tick,
// the terrain memo) treat "the location's spec" as a cheap lookup.
const LOCATION_CACHE = new Map<string, GenResult>()
export function generateForLocationCached(loc: MapGenSource): GenResult {
  const key = `${loc.id}|${loc.mapGen?.recipe}|${String(loc.mapGen?.seed ?? '')}|${loc.openWorldSize ?? 0}`
  const hit = LOCATION_CACHE.get(key)
  if (hit) return hit
  const res = generateForLocation(loc)
  LOCATION_CACHE.set(key, res)
  return res
}
