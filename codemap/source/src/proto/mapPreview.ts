// ── Overworld map-tile preview ──────────────────────────────────────────────
//
// A cheap, blurry thumbnail of a location's ACTUAL generated terrain, drawn for
// the overworld grid so the map reads as a preview of the world itself
// (landmass shape + water + barrier masses) rather than a row of abstract
// node icons.
//
// Why a bespoke renderer instead of reusing `src/render/terrain.tsx`:
//   - The paper terrain pipeline bakes each map into a big rasterized bitmap and
//     its LRU cache holds only ~3 entries — a dozen live previews would thrash it.
//   - The paper language is deliberately flat (no blur/filters, near-black washes
//     tuned for the battlefield mood). A map preview wants the opposite: a few
//     legible, lifted colours, then a CSS blur on top for the "distant map" read.
// So this module walks the MapSpec's surface + collision planes straight onto a
// tiny native-resolution canvas and hands back a data URL. Blur is applied by
// the consumer (a CSS `filter`), never here — this stays out of `src/render/`
// precisely so the paper-palette contract (`Palette.test`) doesn't police it.
//
// Every location gets a preview: the two live mapGen locations (mirror-vale,
// prontera-city) use their REAL baked spec; everything else synthesises an
// illustrative field/city bake seeded by the location id. It's a preview, so an
// illustrative-but-plausible landscape is the right call for the non-mapGen ones.

import { generateForLocationCached, generateMap, RECIPE_REGISTRY, THEME_TAGS } from '@/mapgen'
import type { GenParams, MapSpec, SurfaceMaterial, BarrierMaterial, ThemeTag } from '@/mapgen'
import { SURFACE_MATERIALS, BARRIER_MATERIALS } from '@/mapgen'
import { biomeForLocation, type Biome } from '@/render/appearance'
import type { Location } from '@/stores/useGameStore'

// ── Colour vocabularies ──────────────────────────────────────────────────────
// Keyed to how the REAL map renders: a solid biome GROUND tile first (grass
// field / stone dungeon / city plaza — skins.tsx), then distinctive surface
// materials washed on top, then barrier masses. That's why the tiles now vary
// by biome (a mountain reads grey, a city warm-brown) instead of all-green.
// Values track the real ground/wash/palette hues but are lifted a stop or two
// from their near-black battlefield tone so a 2px-blurred thumbnail stays
// legible (the arena tiles are ~#1b2113 dark — a black blob when shrunk + blurred).
type RGB = [number, number, number]

// The solid ground each biome paints under everything (skins.tsx PAPER_TILE_*),
// lifted for thumbnail legibility.
const GROUND_RGB: Record<Biome, RGB> = {
  grass: [54, 68, 34],   // dark meadow green (over #1b2113)
  stone: [72, 78, 88],   // cool grey slab (over #22262b)
  plaza: [78, 68, 50],   // warm dressed brown (over #26221a)
}

// Surface washes painted over the ground. `grass` is the biome's default ground
// (rendered as "no wash" in-game), so it resolves to GROUND_RGB at paint time
// and is intentionally absent here.
const WASH_RGB: Partial<Record<SurfaceMaterial, RGB>> = {
  meadow:          [70, 96, 40],    // lusher green band (meadowWash, lifted)
  dirt:            [108, 88, 56],   // packed dirt (dirtPath)
  sand:            [188, 166, 110], // beach tan (sandWash, warmed)
  'shallow-water': [62, 126, 148],  // ford/shore (waterShallow)
  'deep-water':    [36, 78, 102],   // lake/sea (waterDeep)
  'stone-floor':   [96, 100, 110],  // dungeon flags
  road:            [166, 154, 128], // cobbled street (roadPave)
}

const BARRIER_RGB: Record<BarrierMaterial, RGB> = {
  rock:         [61, 56, 45],   // natural outcrop mass (wallTop, darkened)
  'cut-stone':  [116, 110, 92], // built wall (stoneWall)
  wood:         [110, 82, 48],  // palisade / timber
  hedge:        [46, 70, 30],   // dense growth (foliageDeep)
  'deep-water': [32, 74, 96],   // impassable water
  ravine:       [51, 38, 24],   // chasm (cliffFill)
  rubble:       [74, 70, 62],   // collapsed structure
  bars:         [85, 96, 106],  // portcullis
}

// Void/ocean the whole preview floats on (also the fallback when a bake fails).
const VOID_RGB: RGB = [12, 16, 24]

// Biome-flavoured flat fallback if generation ever throws (keeps a tile from
// going black): the location's ground colour, water for coastal.
function fallbackRGB(loc: Location): RGB {
  const t = loc.traits
  if (t.includes('beach') || t.includes('water')) return WASH_RGB['shallow-water']!
  return GROUND_RGB[biomeForLocation(loc)]
}

// ── Spec resolution ──────────────────────────────────────────────────────────
// Real spec for live mapGen locations; an illustrative synthesised one otherwise.
const specCache = new Map<string, MapSpec | null>()

function isCity(loc: Location) {
  return loc.traits.includes('city') || /\b(city|town)\b/i.test(loc.name)
}

function previewSpecFor(loc: Location): MapSpec | null {
  const hit = specCache.get(loc.id)
  if (hit !== undefined) return hit
  let spec: MapSpec | null = null
  try {
    if (loc.mapGen) {
      spec = generateForLocationCached(loc).spec
    } else {
      const cityLike = isCity(loc)
      const recipe = RECIPE_REGISTRY[cityLike ? 'city' : 'field']
      const themes = loc.traits.filter((t): t is ThemeTag => (THEME_TAGS as readonly string[]).includes(t))
      // Illustrative preview bake — a modest size (fast, and the blur hides the
      // difference from the real arena size) seeded by the id so a tile is
      // stable across sessions. `accept` = take the first roll, never re-roll
      // for a thumbnail's sake.
      const size = Math.min(loc.openWorldSize ?? 72, cityLike ? 56 : 96)
      const params: GenParams = {
        recipe: recipe.id,
        seed: loc.id,
        size,
        themes,
        maxBarriers: 40,
        gates: false,
        onFail: 'accept',
      }
      spec = generateMap(recipe, params).spec
    }
  } catch {
    spec = null
  }
  specCache.set(loc.id, spec)
  return spec
}

// ── Canvas render → data URL ─────────────────────────────────────────────────
// Native cols×rows resolution; the consumer scales it up (background-size:cover)
// and blurs it, so a small crisp source is all we need.
const urlCache = new Map<string, string>()

function paintSpec(ctx: CanvasRenderingContext2D, spec: MapSpec, ground: RGB) {
  const { cols, rows } = spec
  const surf = spec.surface
  const img = ctx.createImageData(cols, rows)
  const data = img.data
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Surface grid may run at a finer resolution than collision units; sample it.
      const sx = Math.min(surf.cols - 1, Math.floor((x / cols) * surf.cols))
      const sy = Math.min(surf.rows - 1, Math.floor((y / rows) * surf.rows))
      const mat = SURFACE_MATERIALS[surf.grid[sy * surf.cols + sx]] ?? 'grass'
      // Default ground ('grass') shows the biome ground; only distinctive
      // materials wash over it — exactly the real render's layering.
      const rgb = WASH_RGB[mat] ?? ground
      const i = (y * cols + x) * 4
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  // Barrier masses over the surface — this is the "landscape shape" read.
  for (const r of spec.collision) {
    const mat = (BARRIER_MATERIALS as readonly string[]).includes(r.material)
      ? (r.material as BarrierMaterial) : 'rock'
    const rgb = BARRIER_RGB[mat] ?? BARRIER_RGB.rock
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
}

// Returns a data URL for the location's blurry preview, or '' if unavailable
// (canvas absent in SSR/tests). Cached per location id.
export function mapPreviewUrl(loc: Location): string {
  const hit = urlCache.get(loc.id)
  if (hit !== undefined) return hit
  if (typeof document === 'undefined') return ''
  const spec = previewSpecFor(loc)
  const canvas = document.createElement('canvas')
  const [fr, fg, fb] = fallbackRGB(loc)
  const ground = GROUND_RGB[biomeForLocation(loc)]
  let url = ''
  if (!spec) {
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (ctx) { ctx.fillStyle = `rgb(${fr},${fg},${fb})`; ctx.fillRect(0, 0, 1, 1); url = canvas.toDataURL() }
  } else {
    canvas.width = spec.cols
    canvas.height = spec.rows
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = `rgb(${VOID_RGB[0]},${VOID_RGB[1]},${VOID_RGB[2]})`
      ctx.fillRect(0, 0, spec.cols, spec.rows)
      paintSpec(ctx, spec, ground)
      url = canvas.toDataURL()
    }
  }
  urlCache.set(loc.id, url)
  return url
}
