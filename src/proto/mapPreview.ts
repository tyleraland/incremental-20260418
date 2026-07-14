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
import type { Location } from '@/stores/useGameStore'

// ── Colour vocabularies ──────────────────────────────────────────────────────
// Lifted brighter than the battlefield washes so a 2px-blurred thumbnail still
// reads as landscape. Kept local (not palette.ts roles) — a preview is not a
// paper asset and shouldn't drag the palette toward map-legible tints.
type RGB = [number, number, number]

const SURFACE_RGB: Record<SurfaceMaterial, RGB> = {
  grass:           [58, 84, 40],
  meadow:          [74, 104, 44],
  dirt:            [104, 84, 52],
  sand:            [186, 164, 108],
  'shallow-water': [64, 128, 150],
  'deep-water':    [34, 78, 104],
  'stone-floor':   [92, 96, 104],
  road:            [156, 144, 116],
}

const BARRIER_RGB: Record<BarrierMaterial, RGB> = {
  rock:         [70, 66, 58],
  'cut-stone':  [110, 104, 88],
  wood:         [108, 80, 46],
  hedge:        [46, 66, 30],
  'deep-water': [30, 72, 96],
  ravine:       [54, 42, 30],
  rubble:       [78, 72, 62],
  bars:         [86, 96, 106],
}

// Void/ocean the whole preview floats on (also the fallback when a bake fails).
const VOID_RGB: RGB = [12, 16, 24]

// Biome-flavoured flat fallback if generation ever throws (keeps a tile from
// going black). Cheap: one wash colour by trait.
function fallbackRGB(loc: Location): RGB {
  const t = loc.traits
  if (t.includes('city')) return SURFACE_RGB['road']
  if (t.includes('beach') || t.includes('water')) return SURFACE_RGB['shallow-water']
  if (t.includes('mountain') || t.includes('dungeon') || t.includes('ruins')) return SURFACE_RGB['stone-floor']
  if (t.includes('desert')) return SURFACE_RGB['sand']
  return SURFACE_RGB['grass']
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

function paintSpec(ctx: CanvasRenderingContext2D, spec: MapSpec) {
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
      const rgb = SURFACE_RGB[mat] ?? SURFACE_RGB.grass
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
      paintSpec(ctx, spec)
      url = canvas.toDataURL()
    }
  }
  urlCache.set(loc.id, url)
  return url
}
