// Map generation — the working draft passes mutate, and its plane helpers.
//
// A MapDraft is a MapSpec under construction (same planes, mutable) plus the
// normalized params. Passes write through the helpers below so invariants
// (grid bounds, vocab indices, rounded coords) hold by construction rather
// than by validator alone — the validator then guards the cross-plane rules.

import type {
  CollisionRect, GenParams, MapSpec, Poi, PoiKind, ProficiencyTag, Pt, Rect,
  SurfaceMaterial, SurfacePlane, ThemeTag,
} from './types'
import { SURFACE_MATERIALS } from './types'
import { hashString } from './rng'

// GenParams with every knob resolved — what passes actually see.
export interface NormParams {
  recipe: string
  seed: number
  size: number
  themes: ThemeTag[]
  maxBarriers: number
  spawnApron: number
  keepClear: Rect[]
  pois: { kind: PoiKind; at: Pt; id?: string; tags?: string[] }[]
  proficiencies: ProficiencyTag[]
  skipPasses: string[]
  onFail: 'reroll' | 'accept' | 'throw'
}

export function normalizeParams(p: GenParams): NormParams {
  const size = Math.max(12, Math.round(p.size))
  return {
    recipe: p.recipe,
    seed: (typeof p.seed === 'string' ? hashString(p.seed) : p.seed) >>> 0,
    size,
    themes: p.themes,
    maxBarriers: p.maxBarriers ?? 24,
    // Matches the store's spawn apron feel: an uncluttered form-up knot.
    spawnApron: p.spawnApron ?? Math.max(6, size * 0.14),
    keepClear: p.keepClear ?? [],
    pois: p.pois ?? [],
    // sorted + deduped so the same kit always keys the same variant (cache keys,
    // determinism tests, and reroll chains all read this)
    proficiencies: [...new Set(p.proficiencies ?? [])].sort(),
    skipPasses: p.skipPasses ?? [],
    onFail: p.onFail ?? 'reroll',
  }
}

export interface MapDraft {
  params: NormParams
  cols: number
  rows: number
  collision: CollisionRect[]
  surface: SurfacePlane
  scatter: MapSpec['scatter']
  semantic: MapSpec['semantic']
}

const MAT_INDEX: Record<SurfaceMaterial, number> = Object.fromEntries(
  SURFACE_MATERIALS.map((m, i) => [m, i]),
) as Record<SurfaceMaterial, number>

export function makeDraft(params: NormParams): MapDraft {
  const { size } = params
  return {
    params,
    cols: size,
    rows: size,
    collision: [],
    surface: { cols: size, rows: size, cellsPerUnit: 1, grid: new Uint8Array(size * size) },
    scatter: [],
    semantic: {
      pois: [],
      nav: { nodes: [], edges: [] },
      locks: [],
      regionTags: [...params.themes],
      premise: null,
      tactical: { openness: 1, barrierCount: 0, chokepoints: 0, longLanes: 0, coverClusters: 0 },
    },
  }
}

// ── Plane helpers ────────────────────────────────────────────────────────────

const r2 = (v: number) => Math.round(v * 100) / 100

export function paint(d: MapDraft, x: number, y: number, m: SurfaceMaterial): void {
  if (x < 0 || y < 0 || x >= d.cols || y >= d.rows) return
  d.surface.grid[y * d.surface.cols + x] = MAT_INDEX[m]
}

export function matAt(d: MapDraft, x: number, y: number): SurfaceMaterial {
  const xi = Math.min(d.cols - 1, Math.max(0, Math.floor(x)))
  const yi = Math.min(d.rows - 1, Math.max(0, Math.floor(y)))
  return SURFACE_MATERIALS[d.surface.grid[yi * d.surface.cols + xi]]
}

// Clamp into bounds, round to 0.01 (byte-stable specs), drop degenerate slivers.
export function addBarrier(d: MapDraft, r: CollisionRect): void {
  const x = Math.max(0, Math.min(d.cols, r.x))
  const y = Math.max(0, Math.min(d.rows, r.y))
  const w = Math.min(d.cols - x, r.w - (x - r.x))
  const h = Math.min(d.rows - y, r.h - (y - r.y))
  if (w < 0.5 || h < 0.5) return
  d.collision.push({ x: r2(x), y: r2(y), w: r2(w), h: r2(h), kind: r.kind, material: r.material })
}

export function addPoi(d: MapDraft, poi: Omit<Poi, 'tags'> & { tags?: string[] }): void {
  d.semantic.pois.push({ ...poi, at: { x: r2(poi.at.x), y: r2(poi.at.y) }, tags: poi.tags ?? [] })
}

const inRect = (p: Pt, r: Rect, m: number) =>
  p.x > r.x - m && p.x < r.x + r.w + m && p.y > r.y - m && p.y < r.y + r.h + m

// Clear of collision rects, the spawn apron, and the caller's keep-clear boxes —
// the standard placement predicate for geography and scatter. `margin` should
// cover the placed thing's half-extent: it inflates the apron and every
// avoided box, so a fat rect can't pass on its centre and land on its edge.
export function isPlaceable(d: MapDraft, p: Pt, margin = 0.6): boolean {
  // The apron protects the spawn POI once a pass has placed one (a dungeon's
  // entry room); until then it protects the map centre (a field's form-up
  // knot — the field recipe adds its spawn last, at the centre).
  const s = d.semantic.pois.find((x) => x.kind === 'spawn')?.at ?? { x: d.cols / 2, y: d.rows / 2 }
  if (Math.hypot(p.x - s.x, p.y - s.y) < d.params.spawnApron + margin) return false
  if (d.collision.some((r) => inRect(p, r, margin))) return false
  return !d.params.keepClear.some((r) => inRect(p, r, margin + 1))
}

// ── Bake (§A layer 10, first half) ──────────────────────────────────────────
// Flatten the draft into an immutable-by-convention MapSpec. Validation is the
// pipeline's job (it owns the reroll loop); bake is a pure assembly.

export function bake(d: MapDraft): MapSpec {
  return {
    specVersion: 1,
    recipe: d.params.recipe,
    seed: d.params.seed,
    cols: d.cols,
    rows: d.rows,
    collision: d.collision,
    surface: d.surface,
    scatter: d.scatter,
    semantic: d.semantic,
  }
}
