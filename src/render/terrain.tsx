import { memo, useMemo } from 'react'
import type { Barrier } from '@/engine'
import type { BarrierMaterial, MapSpec, ScatterKind, SurfaceMaterial } from '@/mapgen'
import { SURFACE_MATERIALS } from '@/mapgen'
import type { Biome } from '@/render/appearance'
import { PAPER_PALETTE as P, type PaperRole } from '@/render/palette'
import { TERRAIN_PROPS, type PropDef } from '@/render/props'
import { buildingMarkup, isBuildingMaterial } from '@/render/buildings'
import { hash01, wonk, blobPath, polyPath, rectOutline, roughCircle, scatter, maskLoops, decimate, type Pt, type Rect } from '@/render/authoring'

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
  // §mapgen (phase 2): a generated location's baked MapSpec. When present the
  // terrain becomes a spec CONSUMER: surface-plane material regions paint as
  // organic washes (lake / sand / meadow), the scatter plane replaces the
  // seeded random props, and collision paints material-aware (deep-water rects
  // vanish under the lake instead of reading as stone; hedges go green).
  // Absent → the classic barrier-derived dressing, byte-identical to before.
  spec?: MapSpec
}

// How far the visual blob overhangs its collision rect. Purely cosmetic slack —
// big enough to break the rectangle read, small enough not to lie about cover.
const OVERHANG = 0.3
const RIM_W = 0.85           // rim band depth in cells
const LIT_NUDGE = 'translate(-0.14 -0.18)'   // one light direction (up-left), everywhere

// Scatter-prop assets live in src/render/props.ts (data, not JSX); this file
// is their renderer. `propMarkup` below is the single PropDef → svg-markup
// emitter, shared with the ?workshop=1 authoring page.

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
  // §mapgen surface washes, paint order as listed (meadow under sand under water)
  surface: { d: string; fill: string; opacity: number; shore?: boolean }[]
  // §city paving texture: a seeded stone-mosaic seam overlay per paved material
  // (cobbled roads, flagstone plaza), painted over its wash — the ground "varied
  // texture" read. Empty unless the spec is a city.
  paving: { d: string; stroke: PaperRole; sw: number; opacity: number }[]
  props: { v: number; x: number; y: number; s: number; rot: number; flip: boolean }[]
  cliffs: { d: string; fill: string; edge: string }[]
  walls: { d: string; multi: boolean }[]
  // §city buildings: BUILT-material wall rects (cut-stone/wood/rubble) rendered as
  // pitched-roof cutout structures (render/buildings.ts) instead of rock blobs.
  // Rects are in svg coords (y already flipped); the markup is emitted in terrainSvg.
  buildings: { x: number; y: number; w: number; h: number; material: BarrierMaterial; seed: number }[]
  rim: { d: string; inner: string } | null
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function buildTerrainModel(p: TerrainProps): TerrainModel {
  const { cols, rows, seed, spec } = p
  const toSvg = (r: Rect): Rect => ({ x: r.x, y: rows - r.y - r.h, w: r.w, h: r.h })
  // With a spec, collision paints MATERIAL-aware from the collision plane:
  // deep-water rects are engine-only (the lake wash below is their visual),
  // hedges paint foliage not stone, and BUILT materials (cut-stone/wood/rubble)
  // become city buildings (below) rather than organic rock blobs. Without a spec,
  // kind is all we know — everything's a natural wall/cliff.
  const buildingRects = spec ? spec.collision.filter((r) => r.kind === 'wall' && isBuildingMaterial(r.material)) : []
  const wallRects: Rect[] = spec
    ? spec.collision.filter((r) => r.kind === 'wall' && !isBuildingMaterial(r.material))
    : p.barriers.filter((b) => (b.kind ?? 'wall') === 'wall')
  const cliffSrc = spec
    ? spec.collision.filter((r) => r.kind === 'cliff' && r.material !== 'deep-water')
    : p.barriers.filter((b) => b.kind === 'cliff')
  // City buildings: keep the collision rect (material carried) in svg coords; the
  // markup is built in terrainSvg. Seeded per rect so a house looks stable.
  const buildings: TerrainModel['buildings'] = buildingRects.map((r, i) => {
    const s = toSvg(r)
    return { x: s.x, y: s.y, w: s.w, h: s.h, material: r.material, seed: seed + 8100 + i * 613 }
  })

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
  const cliffs = cliffSrc.map((b, i) => ({
    d: blobFor({ x: b.x - OVERHANG / 2, y: b.y - OVERHANG / 2, w: b.w + OVERHANG, h: b.h + OVERHANG }, seed + 4700 + i * 613, 0.2, false),
    fill: spec && (b as MapSpec['collision'][number]).material === 'hedge' ? P.foliageDeep : P.cliffFill,
    edge: spec && (b as MapSpec['collision'][number]).material === 'hedge' ? P.foliage : P.cliffEdge,
  }))

  // §mapgen surface washes: each material region of the surface plane becomes
  // ONE organic multi-subpath (mask → boundary loops → decimate → wonk → blob;
  // evenodd so islands in a lake render). Shallow water is painted under deep
  // (the deep mask is a subset), giving the two-band read for free.
  const surface: TerrainModel['surface'] = []
  const paving: TerrainModel['paving'] = []
  if (spec) {
    const mi = (m: SurfaceMaterial) => SURFACE_MATERIALS.indexOf(m)
    const g = spec.surface.grid
    const pathFor = (want: (v: number) => boolean, off: number, amp: number) => {
      const loops = maskLoops((x, y) => want(g[y * spec.cols + x]), spec.cols, spec.rows)
      return loops
        .map((lp, i) => blobPath(wonk(decimate(lp).map((pt) => ({ x: pt.x, y: rows - pt.y })), seed + off + i * 131, amp)))
        .join('')
    }
    const meadow = mi('meadow'), sand = mi('sand'), shallow = mi('shallow-water'), deep = mi('deep-water')
    // A city's ground reads as paved streets + a flagstone plaza + grass yards
    // and packed-dirt lots between the buildings — gated on the city recipe so a
    // field/dungeon spec is byte-identical to before (road/stone-floor never
    // appear there; grass is the base tile, not a wash, everywhere else). Paved
    // regions use a TIGHTER boundary wonk (`amp`) so streets keep their
    // engineered shape instead of meandering like a natural coastline.
    const isCity = spec.recipe === 'city'
    const grass = mi('grass'), dirt = mi('dirt'), road = mi('road'), floor = mi('stone-floor')
    const NAT = 0.3, PAVED = 0.14   // organic vs. built boundary jitter
    const bands: { want: (v: number) => boolean; fill: string; opacity: number; amp: number; shore?: boolean }[] = [
      ...(isCity ? [{ want: (v: number) => v === grass, fill: P.yardWash, opacity: 0.5, amp: NAT }] : []),
      { want: (v) => v === meadow, fill: P.meadowWash, opacity: 0.5, amp: NAT },
      { want: (v) => v === sand, fill: P.sandWash, opacity: 0.6, amp: NAT },
      ...(isCity ? [
        { want: (v: number) => v === dirt, fill: P.dirtPath, opacity: 0.6, amp: 0.22 },
        { want: (v: number) => v === road, fill: P.roadPave, opacity: 0.96, amp: PAVED },
        { want: (v: number) => v === floor, fill: P.flagstone, opacity: 0.96, amp: PAVED },
      ] : []),
      { want: (v) => v === shallow || v === deep, fill: P.waterShallow, opacity: 0.85, amp: NAT, shore: true },
      { want: (v) => v === deep, fill: P.waterDeep, opacity: 0.9, amp: NAT },
    ]
    bands.forEach((b, i) => {
      const d = pathFor(b.want, 5200 + i * 977, b.amp)
      if (d) surface.push({ d, fill: b.fill, opacity: b.opacity, shore: b.shore })
    })

    // Paving texture: a seeded stone mosaic over the paved cells. Roads get
    // irregular cobble dashes; the plaza gets a coarse flagstone seam grid.
    // Cheap & bounded (one pass over the paved cells only) and baked into the
    // single terrain image, so it costs nothing at runtime.
    if (isCity) {
      let cobble = ''
      let flags = ''
      for (let y = 0; y < spec.rows; y++) {
        for (let x = 0; x < spec.cols; x++) {
          const v = g[y * spec.cols + x]
          const cx = x + 0.5, sy = rows - y - 0.5   // cell centre in svg coords
          if (v === road) {
            // 1–2 short round-capped dabs per cell → packed cobbles (lit stone)
            const s = seed + x * 73 + y * 179
            const dabs = hash01(s) < 0.35 ? 2 : 1
            for (let k = 0; k < dabs; k++) {
              const t = s + k * 991
              const len = 0.16 + hash01(t + 1) * 0.14
              const ang = hash01(t + 2) * Math.PI
              const ux = Math.cos(ang) * len * 0.5, uy = Math.sin(ang) * len * 0.5
              const jx = (hash01(t + 3) - 0.5) * 0.62, jy = (hash01(t + 4) - 0.5) * 0.62
              cobble += `M${r2(cx + jx - ux)} ${r2(sy + jy - uy)}L${r2(cx + jx + ux)} ${r2(sy + jy + uy)}`
            }
          } else if (v === floor) {
            // slab seams on a coarse lattice → ~2-cell flagstones, lightly jittered
            const jt = (hash01(seed + x * 11 + y * 17) - 0.5) * 0.14
            if (x % 2 === 0) flags += `M${r2(x + jt)} ${r2(rows - y)}L${r2(x + jt)} ${r2(rows - y - 1)}`
            if (y % 2 === 0) flags += `M${r2(x)} ${r2(rows - y + jt)}L${r2(x + 1)} ${r2(rows - y + jt)}`
          }
        }
      }
      if (cobble) paving.push({ d: cobble, stroke: 'roadPaveLit', sw: 0.2, opacity: 0.5 })
      if (flags) paving.push({ d: flags, stroke: 'flagSeam', sw: 0.08, opacity: 0.55 })
    }
  }

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

  // scatter props. With a spec, the generator's scatter PLANE drives placement
  // (it followed the substrate: trees where it's moist, reeds by the shore, and
  // it already kept clear of collision + portals); the abstract kind resolves
  // to a biome prop archetype here — same seam rule as appearance.ts, kinds
  // never prop ids. Without a spec, the classic seeded random scatter.
  const variants = TERRAIN_PROPS[p.biome]
  let props: TerrainModel['props']
  if (spec) {
    props = spec.scatter.map((it) => {
      const cands = ARCHETYPE_INDEX(p.biome, it.kind)
      const v = cands[Math.floor(hash01(it.seed) * cands.length)]
      return {
        v,
        x: r2(it.x),
        y: r2(rows - it.y),
        s: r2(it.size * variants[v].size),
        rot: r2((hash01(it.seed + 19) - 0.5) * 24),
        flip: hash01(it.seed + 31) < 0.5,
      }
    })
  } else {
    // seeded placement clear of barrier boxes (+margin) and the caller's
    // keep-clear rects (portals).
    const keepClear: Rect[] = [...p.barriers, ...(p.avoid ?? [])]
    const propCount = Math.max(8, Math.min(64, Math.round((cols * rows) / 45)))
    props = scatter(cols, rows, seed + 9000, propCount, keepClear, 0.6).map((pt: Pt, i: number) => {
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
  }

  return { mottles, surface, paving, props, cliffs, walls, buildings, rim }
}

// ScatterKind → biome prop ARCHETYPE (base id; seeded variants ride along).
// The mapgen vocabulary stays abstract; what a "tree" looks like is this
// biome's business. Falls back to the whole set for unmapped kinds.
const KIND_ARCHETYPE: Record<Biome, Partial<Record<ScatterKind, string>>> = {
  grass: { tree: 'bush', bush: 'bush', rock: 'pebble', stump: 'stump', flower: 'bloom', reed: 'reeds' },
  stone: { tree: 'spikes', bush: 'moss', rock: 'shard', stump: 'rubble', flower: 'bone', reed: 'crack' },
  plaza: { tree: 'signpost', bush: 'pot', rock: 'sack', stump: 'crate', flower: 'pot', reed: 'coil' },
}
// Catalog helper (?gallery=1): the archetype a scatter kind resolves to in a
// biome — so the gallery can show the mapgen vocabulary next to the raw props.
export function scatterArchetype(biome: Biome, kind: ScatterKind): PropDef {
  return TERRAIN_PROPS[biome][ARCHETYPE_INDEX(biome, kind)[0]]
}

const archetypeCache = new Map<string, number[]>()
function ARCHETYPE_INDEX(biome: Biome, kind: ScatterKind): number[] {
  const k = `${biome}:${kind}`
  const hit = archetypeCache.get(k)
  if (hit) return hit
  const base = KIND_ARCHETYPE[biome][kind]
  const defs = TERRAIN_PROPS[biome]
  let idxs = base
    ? defs.map((d, i) => [d.id, i] as const).filter(([id]) => id === base || id.startsWith(`${base}~`)).map(([, i]) => i)
    : []
  if (idxs.length === 0) idxs = defs.map((_, i) => i)
  archetypeCache.set(k, idxs)
  return idxs
}

// Build-count probe (memo regression guard, like BODY_RENDER_PROBE): an
// unchanged battle re-render must NOT rebuild the terrain model.
export const TERRAIN_BUILD_PROBE = { count: 0 }

const sigOf = (p: TerrainProps) =>
  `${p.seed}|${p.biome}|${p.cols}x${p.rows}|${p.rim}|` +
  p.barriers.map((b) => `${b.x},${b.y},${b.w},${b.h},${b.kind ?? 'w'}`).join(';') + '|' +
  (p.avoid ?? []).map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';') + '|' +
  // a spec is fully determined by (recipe, seed, version) — save = seed
  (p.spec ? `${p.spec.recipe}:${p.spec.seed}:v${p.spec.specVersion}` : '')

// PropDef → svg markup in the unit box (y down). The `lit` cutout nudge is
// applied HERE — one light direction for every asset, authors never hand-place
// it. Shared by the terrain emitter below and the ?workshop=1 authoring page.
export function propMarkup(def: PropDef): string {
  return def.paths.map((pp) =>
    `<path d='${pp.d}' fill='${pp.fill ? P[pp.fill] : 'none'}'` +
    (pp.stroke ? ` stroke='${P[pp.stroke]}' stroke-width='${pp.sw}' stroke-linecap='round'` : '') +
    (pp.opacity != null ? ` opacity='${pp.opacity}'` : '') +
    (pp.lit ? " transform='translate(-0.06 -0.08) scale(0.9)'" : '') +
    '/>').join('')
}

// The lit depth face is the base path nudged up-left and CLIPPED to the base
// silhouette (a clipPath is geometry, not a filter) — dark base peeks out along
// the bottom-right: the token two-tone trick at terrain scale. The clip lives
// on a wrapper <g> so the copy's own transform can't drag the clip with it.
export function terrainSvg(p: TerrainProps): string {
  const m = buildTerrainModel(p)
  const parts: string[] = []
  for (const x of m.mottles) parts.push(`<path d='${x.d}' fill='${x.fill}' fill-opacity='0.5'/>`)
  // §mapgen surface washes above the mottles, below everything discrete. The
  // water band gets a pale shoreline stroke — the paper "cut edge" read.
  for (const s of m.surface) {
    parts.push(
      `<path d='${s.d}' fill='${s.fill}' fill-opacity='${s.opacity}' fill-rule='evenodd'` +
      (s.shore ? ` stroke='${P.cream}' stroke-opacity='0.3' stroke-width='0.14' stroke-linejoin='round'` : '') +
      '/>',
    )
  }
  // §city paving mosaic: seam strokes over the paved washes (cobble / flagstone)
  for (const pv of m.paving) {
    parts.push(`<path d='${pv.d}' fill='none' stroke='${P[pv.stroke]}' stroke-width='${pv.sw}' stroke-opacity='${pv.opacity}' stroke-linecap='round'/>`)
  }
  for (const pl of m.props) {
    const def = TERRAIN_PROPS[p.biome][pl.v]
    parts.push(`<g transform='translate(${pl.x} ${pl.y}) rotate(${pl.rot}) scale(${pl.flip ? -pl.s : pl.s} ${pl.s})'>${propMarkup(def)}</g>`)
  }
  for (const c of m.cliffs) {
    parts.push(`<path d='${c.d}' fill='${c.fill}' fill-opacity='0.3' stroke='${c.edge}' stroke-opacity='0.55' stroke-width='0.12' stroke-dasharray='0.5 0.3' stroke-linejoin='round'/>`)
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
  // §city buildings above the natural walls: pitched-roof cutout structures
  // (render/buildings.ts). Each carries its own fills/shadow — a dumb emit here.
  for (const b of m.buildings) {
    parts.push(buildingMarkup({ x: b.x, y: b.y, w: b.w, h: b.h }, b.material, b.seed))
  }
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
