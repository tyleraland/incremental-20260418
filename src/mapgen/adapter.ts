// MapSpec → consumers (mirrors engine/adapter.ts's role: the ONLY translation
// point). The engine gets bare rects (material dropped — collision is pure
// {x,y,w,h,kind}); the store gets a Location-shaped entry point. The render
// layer will grow its own consumption (terrain.tsx reading surface/scatter) in
// a later phase — deliberately NOT stubbed here so the seam stays honest.

import type { Barrier } from '@/engine'
import type { GenParams, GenResult, MapSpec, ProficiencyTag, ThemeTag } from './types'
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
  mapGen?: { recipe: string; themes?: ThemeTag[]; seed?: number | string; gates?: boolean }
}

// Location → GenParams → GenResult. Deterministic per location: seed defaults
// to the location id (save = seed, and the id IS persisted), themes project
// from the location's traits (§G: one tag, coherent content everywhere), and
// portal cells become keep-clear boxes + portal POIs the validator must reach.
// `opts.proficiencies` is the deploying party's kit at battle stand-up — the
// §F composition-gate input. Variants resolve ONCE, when the battle is created;
// heroes joining a live battle later do NOT re-resolve gates (locked decision
// for now — see src/mapgen/CLAUDE.md → phase 4 open questions).
export interface MapGenOpts { proficiencies?: ProficiencyTag[] }

export function generateForLocation(loc: MapGenSource, opts: MapGenOpts = {}): GenResult {
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
    // LIVE maps hold the measured pathing envelope (map-perf-envelope's
    // MAX_BENCHED_BARRIERS=40, re-benched 2026-07 with the steerAround
    // visibility-graph cache): cost grows with rect count. The lab explores up
    // to the looser lib default; the game does not. NOTE: this is a GenParam —
    // raising it changes what live locations bake (mirror-vale's outcrops were
    // budget-starved at 16 and fill in at 40).
    maxBarriers: 40,
    keepClear: portals.map((p) => ({ x: p.at[0] - 1.5, y: p.at[1] - 1.5, w: 3, h: 3 })),
    pois: portals.map((p, i) => ({ kind: 'portal' as const, at: { x: p.at[0], y: p.at[1] }, id: `portal-${i}` })),
    proficiencies: opts.proficiencies,
    // Phase-4 policy: gates need human feel iteration BEFORE a live location
    // adopts them (src/mapgen/CLAUDE.md). Live maps therefore default OFF; a
    // location opts in deliberately with mapGen.gates: true. The lib/lab
    // default stays ON so fuzz gates and ?mapgen=1 keep exercising them.
    gates: cfg.gates ?? false,
  }
  return generateMap(recipe, params)
}

// Session cache: generation is pure and a location's params are static data, so
// a result never invalidates. Lets render-path callers (BattleView per tick,
// the terrain memo) treat "the location's spec" as a cheap lookup.
const LOCATION_CACHE = new Map<string, GenResult>()
export function generateForLocationCached(loc: MapGenSource, opts: MapGenOpts = {}): GenResult {
  const kit = [...new Set(opts.proficiencies ?? [])].sort().join(',')
  const key = `${loc.id}|${loc.mapGen?.recipe}|${String(loc.mapGen?.seed ?? '')}|${loc.openWorldSize ?? 0}|${kit}|g${loc.mapGen?.gates ? 1 : 0}`
  const hit = LOCATION_CACHE.get(key)
  if (hit) return hit
  const res = generateForLocation(loc, opts)
  LOCATION_CACHE.set(key, res)
  return res
}
