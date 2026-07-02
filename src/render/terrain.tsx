import { memo, useMemo } from 'react'
import type { Barrier } from '@/engine'
import type { Biome } from '@/render/appearance'
import { PAPER_PALETTE as P, type PaperRole } from '@/render/palette'
import { hash01, wonk, blobPath, polyPath, rectOutline, roughCircle, scatter, type Pt, type Rect } from '@/render/authoring'

// ── Organic terrain layer ────────────────────────────────────────────────────
//
// ONE per-location static SVG that closes the visual gap between "repeating
// square tile + rectangular barrier boxes" and the Unexplored ground read:
// wonky wall/cliff blobs with a lit depth face, an organic map rim, large
// floor-mottle patches, and per-biome scatter props. Built once at battle-view
// mount from (biome, barrier set, map size) and a seeded hash — NO Math.random,
// so replays, screenshots, and revisits are stable per location.
//
// It renders as a child of Arena's ground layer, so it inherits the single
// compositor translate+scale: one paint at mount, zero per-round cost (the
// cost model's "detailed static background ≈ free"). The ENGINE is untouched —
// collision stays the rect barrier set; blobs are drawn AROUND each rect with
// ~0.3-cell visual overhang, adjacent rects merged into one blob paint.
//
// Delivery is ONE data-URI SVG background image on a single div — exactly how
// the biome ground tiles ship — NOT live SVG DOM. Measured on the ?perf scene,
// ~230 svg elements inside the per-round-animated ground layer cost ~9 fps
// (they join every style/layout pass of the subtree); as a background image
// the same picture is zero DOM, zero reconcile, zero layout. It also scopes
// the clipPath ids to the image's own document, so instances can't collide.
//
// Same seam rules as skins.tsx: switch on biome/traits (never location ids),
// flat fills only, no filters/gradients. Colors resolve to palette roles.

export interface TerrainProps {
  biome: Biome
  cols: number
  rows: number
  barriers: Barrier[]
  seed: number      // per-location (hashString of the location id)
  rim: boolean      // open-world map edge → organic rock rim (replaces the perimeter ring)
  avoid?: Rect[]    // extra keep-clear boxes for the scatter (portals), world coords
}

// How far the visual blob overhangs its collision rect. Purely cosmetic slack —
// big enough to break the rectangle read, small enough not to lie about cover.
const OVERHANG = 0.3
const RIM_W = 0.85           // rim band depth in cells
const LIT_NUDGE = 'translate(-0.14 -0.18)'   // one light direction (up-left), everywhere

// ── Scatter props (assets as data — the seed of pipeline step 3) ─────────────
// Each prop is 1–3 flat paths in a ~[-1,1] unit box, y-down (svg orientation),
// colored by palette ROLE. `lit: true` marks the two-tone top copy — the
// renderer applies the standard cutout nudge, so authors never hand-place it.
interface PropPath { d: string; fill?: PaperRole; stroke?: PaperRole; sw?: number; opacity?: number; lit?: boolean }
interface PropDef { id: string; size: number; paths: PropPath[] }

const BUSH_D = 'M0 -0.75C0.55 -0.7 0.9 -0.3 0.85 0.2C0.8 0.65 0.35 0.85 0 0.85C-0.4 0.85 -0.85 0.6 -0.87 0.15C-0.9 -0.35 -0.5 -0.72 0 -0.75Z'
const PEBBLE_D = 'M-0.45 0.1C-0.42 -0.25 -0.15 -0.38 0.05 -0.35C0.32 -0.31 0.45 -0.12 0.42 0.1C0.38 0.3 0.15 0.38 -0.05 0.36C-0.28 0.34 -0.47 0.28 -0.45 0.1Z'
const RUBBLE_D = 'M-0.7 0.3L-0.2 -0.42L0.32 0L0 0.45Z'
const SHARD_D = 'M-0.5 0.25L-0.1 -0.4L0.5 -0.15L0.2 0.35Z'
const CRATE_D = 'M-0.5 -0.42L0.48 -0.5L0.52 0.46L-0.44 0.5Z'
const BARREL_D = 'M-0.42 0A0.42 0.42 0 1 0 0.42 0A0.42 0.42 0 1 0 -0.42 0Z'
const SACK_D = 'M-0.35 -0.5C0.1 -0.62 0.42 -0.3 0.45 0.05C0.5 0.4 0.2 0.55 -0.05 0.55C-0.38 0.55 -0.55 0.32 -0.52 0C-0.5 -0.25 -0.5 -0.42 -0.35 -0.5Z'

export const TERRAIN_PROPS: Record<Biome, PropDef[]> = {
  grass: [
    { id: 'tuft', size: 0.9, paths: [
      { d: 'M-0.45 0.5Q-0.35 -0.2 -0.55 -0.85M0 0.55Q0.08 -0.1 0 -0.95M0.45 0.5Q0.4 -0.25 0.55 -0.8', stroke: 'foliage', sw: 0.16 },
    ] },
    { id: 'bush', size: 1.1, paths: [
      { d: BUSH_D, fill: 'foliageDeep' },
      { d: BUSH_D, fill: 'foliage', lit: true },
    ] },
    { id: 'pebble', size: 0.7, paths: [
      { d: PEBBLE_D, fill: 'rockDeep' },
      { d: PEBBLE_D, fill: 'rock', lit: true },
    ] },
    { id: 'bloom', size: 0.8, paths: [
      { d: 'M0 0.6Q0.06 0.1 0 -0.3', stroke: 'foliageDeep', sw: 0.12 },
      { d: 'M-0.26 -0.5A0.26 0.26 0 1 0 0.26 -0.5A0.26 0.26 0 1 0 -0.26 -0.5Z', fill: 'bloom' },
    ] },
  ],
  stone: [
    { id: 'rubble', size: 1, paths: [
      { d: RUBBLE_D, fill: 'rockDeep' },
      { d: RUBBLE_D, fill: 'rock', lit: true },
      { d: 'M0.4 0.5L0.72 0.02L0.9 0.45Z', fill: 'rockDeep' },
    ] },
    { id: 'crack', size: 1.2, paths: [
      { d: 'M-0.85 -0.3L-0.25 -0.12L0.05 0.26L0.7 0.45', stroke: 'stoneDark', sw: 0.1 },
    ] },
    { id: 'shard', size: 0.8, paths: [
      { d: SHARD_D, fill: 'rockDeep' },
      { d: SHARD_D, fill: 'rock', lit: true },
    ] },
    { id: 'bone', size: 0.8, paths: [
      { d: 'M-0.5 0.15L0.35 -0.3M0.28 -0.42L0.45 -0.18', stroke: 'cream', sw: 0.12, opacity: 0.6 },
    ] },
  ],
  plaza: [
    { id: 'crate', size: 1, paths: [
      { d: CRATE_D, fill: 'woodDeep' },
      { d: CRATE_D, fill: 'wood', lit: true },
      { d: 'M-0.44 0.02L0.48 -0.04', stroke: 'ink', sw: 0.07, opacity: 0.6 },
    ] },
    { id: 'barrel', size: 0.9, paths: [
      { d: BARREL_D, fill: 'woodDeep' },
      { d: BARREL_D, fill: 'wood', lit: true },
      { d: 'M-0.2 0A0.2 0.2 0 1 0 0.2 0A0.2 0.2 0 1 0 -0.2 0Z', stroke: 'ink', sw: 0.06, opacity: 0.5 },
    ] },
    { id: 'sack', size: 0.9, paths: [
      { d: SACK_D, fill: 'woodDeep' },
      { d: SACK_D, fill: 'canvas', lit: true },
    ] },
  ],
}

const MOTTLE_SHADES: Record<Biome, [string, string]> = {
  grass: [P.grassLight, P.grassDark],
  stone: [P.stoneLight, P.stoneDark],
  plaza: [P.plazaLight, P.plazaDark],
}

// ── Model builder (pure, exported for tests) ────────────────────────────────
// All output geometry is in SVG coords (y down): world y flips at build time,
// so the component below is a dumb emitter with no coordinate math.

export interface TerrainModel {
  mottles: { d: string; fill: string }[]
  props: { v: number; x: number; y: number; s: number; rot: number; flip: boolean }[]
  cliffs: string[]
  walls: { d: string; multi: boolean }[]
  rim: { d: string; inner: string } | null
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function buildTerrainModel(p: TerrainProps): TerrainModel {
  const { cols, rows, seed } = p
  const toSvg = (r: Rect): Rect => ({ x: r.x, y: rows - r.y - r.h, w: r.w, h: r.h })
  const wallRects = p.barriers.filter((b) => (b.kind ?? 'wall') === 'wall')
  const cliffRects = p.barriers.filter((b) => b.kind === 'cliff')

  // walls: cluster rects whose overhang-expanded boxes touch, then paint each
  // cluster as ONE multi-subpath blob (same fill → the union reads as one rock).
  const grow = (b: Barrier): Rect => ({ x: b.x - OVERHANG, y: b.y - OVERHANG, w: b.w + OVERHANG * 2, h: b.h + OVERHANG * 2 })
  const boxes = wallRects.map(grow)
  const touch = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const cluster = boxes.map((_, i) => i)
  const find = (i: number): number => (cluster[i] === i ? i : (cluster[i] = find(cluster[i])))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (touch(boxes[i], boxes[j])) cluster[find(i)] = find(j)
    }
  }
  const byCluster = new Map<number, number[]>()
  boxes.forEach((_, i) => {
    const root = find(i)
    byCluster.set(root, [...(byCluster.get(root) ?? []), i])
  })
  const blobFor = (r: Rect, s: number, amp: number, smooth: boolean) => {
    const pts = wonk(rectOutline(toSvg(r), 1.1), s, amp)
    return smooth ? blobPath(pts) : polyPath(pts)
  }
  const walls = [...byCluster.values()].map((idxs) => ({
    d: idxs.map((i) => blobFor(boxes[i], seed + i * 613, 0.26, true)).join(''),
    multi: idxs.length > 1,
  }))

  // cliffs: tighter overhang, straight cut-stone edges, no merging fuss (they
  // render translucent, so a rare overlap just darkens a corner).
  const cliffs = cliffRects.map((b, i) =>
    blobFor({ x: b.x - OVERHANG / 2, y: b.y - OVERHANG / 2, w: b.w + OVERHANG, h: b.h + OVERHANG }, seed + 4700 + i * 613, 0.2, false))

  // rim: the map-edge band as an evenodd ring — a crisp outer rect (the real
  // map bound) around a wonked organic inner coastline.
  let rim: TerrainModel['rim'] = null
  if (p.rim) {
    const innerPts = wonk(rectOutline({ x: RIM_W, y: RIM_W, w: cols - RIM_W * 2, h: rows - RIM_W * 2 }, 2.2), seed + 3000, 0.4)
    const inner = blobPath(innerPts)
    rim = { d: `M0 0H${cols}V${rows}H0Z` + inner, inner }
  }

  // floor mottling: a few large soft blobs in near-tile shades, under everything.
  const mottleCount = Math.max(6, Math.min(48, Math.round((cols * rows) / 60)))
  const mottles: TerrainModel['mottles'] = []
  for (let i = 0; i < mottleCount; i++) {
    const s = seed + 7000 + i * 227
    const cx = hash01(s) * cols
    const cy = hash01(s + 13) * rows
    const rad = 1.4 + hash01(s + 29) * 2.8
    mottles.push({
      d: blobPath(roughCircle(cx, cy, rad, 8, s + 41)),
      fill: MOTTLE_SHADES[p.biome][hash01(s + 57) < 0.55 ? 0 : 1],
    })
  }

  // scatter props: seeded placement clear of barrier boxes (+margin) and the
  // caller's keep-clear rects (portals).
  const keepClear: Rect[] = [...p.barriers, ...(p.avoid ?? [])]
  const propCount = Math.max(8, Math.min(64, Math.round((cols * rows) / 45)))
  const variants = TERRAIN_PROPS[p.biome]
  const props = scatter(cols, rows, seed + 9000, propCount, keepClear, 0.6).map((pt: Pt, i: number) => {
    const s = seed + 9000 + i * 379
    const v = Math.floor(hash01(s) * variants.length)
    return {
      v,
      x: r2(pt.x),
      y: r2(rows - pt.y),
      s: r2((0.55 + hash01(s + 7) * 0.5) * variants[v].size),
      rot: r2((hash01(s + 19) - 0.5) * 24),
      flip: hash01(s + 31) < 0.5,
    }
  })

  return { mottles, props, cliffs, walls, rim }
}

// Build-count probe (memo regression guard, like BODY_RENDER_PROBE): an
// unchanged battle re-render must NOT rebuild the terrain model.
export const TERRAIN_BUILD_PROBE = { count: 0 }

const sigOf = (p: TerrainProps) =>
  `${p.seed}|${p.biome}|${p.cols}x${p.rows}|${p.rim}|` +
  p.barriers.map((b) => `${b.x},${b.y},${b.w},${b.h},${b.kind ?? 'w'}`).join(';') + '|' +
  (p.avoid ?? []).map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';')

// The lit depth face is the base path nudged up-left and CLIPPED to the base
// silhouette (a clipPath is geometry, not a filter) — dark base peeks out along
// the bottom-right: the token two-tone trick at terrain scale. The clip lives
// on a wrapper <g> so the copy's own transform can't drag the clip with it.
export function terrainSvg(p: TerrainProps): string {
  const m = buildTerrainModel(p)
  const parts: string[] = []
  for (const x of m.mottles) parts.push(`<path d='${x.d}' fill='${x.fill}' fill-opacity='0.5'/>`)
  for (const pl of m.props) {
    const def = TERRAIN_PROPS[p.biome][pl.v]
    const inner = def.paths.map((pp) =>
      `<path d='${pp.d}' fill='${pp.fill ? P[pp.fill] : 'none'}'` +
      (pp.stroke ? ` stroke='${P[pp.stroke]}' stroke-width='${pp.sw}' stroke-linecap='round'` : '') +
      (pp.opacity != null ? ` opacity='${pp.opacity}'` : '') +
      (pp.lit ? " transform='translate(-0.06 -0.08) scale(0.9)'" : '') +
      '/>').join('')
    parts.push(`<g transform='translate(${pl.x} ${pl.y}) rotate(${pl.rot}) scale(${pl.flip ? -pl.s : pl.s} ${pl.s})'>${inner}</g>`)
  }
  for (const d of m.cliffs) {
    parts.push(`<path d='${d}' fill='${P.cliffFill}' fill-opacity='0.3' stroke='${P.cliffEdge}' stroke-opacity='0.55' stroke-width='0.12' stroke-dasharray='0.5 0.3' stroke-linejoin='round'/>`)
  }
  m.walls.forEach((w, i) => {
    parts.push(
      `<clipPath id='w${i}'><path d='${w.d}'/></clipPath>` +
      `<path d='${w.d}' fill='${P.wallBase}' stroke='${P.wallOutline}' stroke-width='0.16' stroke-linejoin='round'/>` +
      // merged clusters: repaint the fill to cover subpath strokes that landed
      // inside the union (one blob, no interior seams)
      (w.multi ? `<path d='${w.d}' fill='${P.wallBase}'/>` : '') +
      `<g clip-path='url(#w${i})'><path d='${w.d}' fill='${P.wallTop}' transform='${LIT_NUDGE}'/></g>`,
    )
  })
  if (m.rim) {
    parts.push(
      `<clipPath id='rim'><path d='${m.rim.d}' clip-rule='evenodd'/></clipPath>` +
      `<path d='${m.rim.d}' fill='${P.wallBase}' fill-rule='evenodd'/>` +
      `<g clip-path='url(#rim)'><path d='${m.rim.d}' fill='${P.wallTop}' fill-rule='evenodd' transform='${LIT_NUDGE}'/></g>` +
      `<path d='${m.rim.inner}' fill='none' stroke='${P.wallOutline}' stroke-width='0.16'/>`,
    )
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${p.cols} ${p.rows}' preserveAspectRatio='none'>${parts.join('')}</svg>`
}

export const PaperTerrain = memo(function PaperTerrain(p: TerrainProps) {
  const sig = sigOf(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps — sig covers every input
  const url = useMemo(() => {
    TERRAIN_BUILD_PROBE.count++
    return `url("data:image/svg+xml,${encodeURIComponent(terrainSvg(p))}")`
  }, [sig])
  return (
    <div
      data-terrain
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{ backgroundImage: url, backgroundSize: '100% 100%' }}
    />
  )
})
