// ── City building catalog (inked top-down) ────────────────────────────────────
//
// A wall rect tagged with a BUILT material becomes a hand-inked top-down
// building, in the battlemap-kit technique (see render/inked.ts): a running-bond
// masonry wall RING around a weathered roof-TILE field split by a ridge, mossed
// and doored and seated with a bold silhouette ink. Hundreds of small
// individually-outlined pieces — but flat fills / palette roles only (no
// gradients/filters) and fully seeded, all baked into terrain.tsx's single image.
//
// It's a CATALOG keyed off BarrierMaterial, never location ids (same seam rule as
// appearance.ts): `wood`/`cut-stone` → a roofed townhouse, `rubble` → roofless
// ruin. The roof COVERING (red-tile / slate / thatch / shingle) is decoupled from
// the wall material and picked by SEED (ROOF_COVERINGS), so a street mixes roofs.
// A procgen city recipe plugs in by tagging a rect.

import type { BarrierMaterial } from '@/mapgen'
import { PAPER_PALETTE as P, INK_POOLS } from '@/render/palette'
import { hash01, wrectPath, pick, type Rect } from '@/render/authoring'
import { ink, masonryBand, roofSlope, mossClump } from '@/render/inked'

export interface BuildingLook {
  roofed: boolean               // false → a ruin: masonry ring + rubble, no roof
                                // (the roof COVERING is seed-picked, not material-keyed — see ROOF_COVERINGS)
}

export const BUILDING_LOOKS: Partial<Record<BarrierMaterial, BuildingLook>> = {
  'wood':      { roofed: true },
  'cut-stone': { roofed: true },
  'rubble':    { roofed: false },
}

// ── Roof coverings (decoupled from the wall's collision material) ──────────────
// A roofed building draws one of these — chosen by SEED, so a street mixes tile,
// slate, thatch and shingle roofs regardless of whether the wall is wood or
// cut-stone. `broken`/`tileH` default to the red-tile weathering, so `red-tile`
// and `slate` stay byte-identical to the old material-keyed roofs.
export interface RoofCovering {
  id: string
  roofPool: readonly string[]         // the tile/straw value pool (INK_POOLS.*)
  roofInk: string
  tileH?: number                      // course height (default 0.26)
  broken?: { fill: string; ink: string }  // the ~5% broken-piece tone
}

export const ROOF_COVERINGS: readonly RoofCovering[] = [
  { id: 'red-tile', roofPool: INK_POOLS.roofRed,   roofInk: P.roofRedInk    },
  { id: 'slate',    roofPool: INK_POOLS.roofSlate, roofInk: P.roofSlateInk2 },
  { id: 'thatch',   roofPool: INK_POOLS.thatch,    roofInk: P.thatchInk,  tileH: 0.2,  broken: { fill: P.thatchInk,  ink: P.thatchInk  } },
  { id: 'shingle',  roofPool: INK_POOLS.shingle,   roofInk: P.shingleInk, tileH: 0.22, broken: { fill: P.shingleInk, ink: P.shingleInk } },
]

export function isBuildingMaterial(m: BarrierMaterial | undefined): boolean {
  return m != null && m in BUILDING_LOOKS
}

const f = (v: number) => Math.round(v * 1000) / 1000
// Cast-shadow offset (down-right — light is up-left, matching the rest of render/).
const SH = { dx: 0.3, dy: 0.36 }

// Emit ONE building as svg markup, footprint `r` in the terrain's unit space (y
// down). Layers follow the kit stack: cast shadow → mortar base → masonry ring →
// roof-tile field (ridge-split) → ridge cap → door/windows → moss → light rim →
// bold silhouette ink. Deterministic per `seed`.
export function buildingMarkup(r: Rect, material: BarrierMaterial, seed: number, coveringId?: string): string {
  const look = BUILDING_LOOKS[material] ?? BUILDING_LOOKS['cut-stone']!
  const { x, y, w, h } = r
  const WALL = Math.min(0.55, Math.max(0.24, Math.min(w, h) * 0.22))
  const ix = x + WALL, iy = y + WALL, iw = w - 2 * WALL, ih = h - 2 * WALL
  const parts: string[] = []

  // cast shadow (flat offset footprint, down-right) + mortar base
  parts.push(ink(wrectPath(x + SH.dx, y + SH.dy, w, h, seed + 2, 0.03, 0.07), P.shadow, undefined, 0, 0.26))
  parts.push(ink(wrectPath(x, y, w, h, seed + 3, 0.03, 0.05), P.stoneBase, P.inkKit, 0.02))

  // masonry wall ring (four running-bond bands)
  parts.push(masonryBand(x, y, w, WALL, seed + 10))
  parts.push(masonryBand(x, y + h - WALL, w, WALL, seed + 20))
  parts.push(masonryBand(x, y + WALL, WALL, h - 2 * WALL, seed + 30))
  parts.push(masonryBand(x + w - WALL, y + WALL, WALL, h - 2 * WALL, seed + 40))

  if (!look.roofed) {
    // ruin: no roof — scattered rubble blocks + heavy moss on the floor
    const n = Math.max(4, Math.floor(iw * ih * 5))
    for (let i = 0; i < n; i++) {
      const s = seed + 500 + i * 37
      const bx = ix + hash01(s) * (iw - 0.2), by = iy + hash01(s + 1) * (ih - 0.15)
      const bs = 0.14 + hash01(s + 2) * 0.16
      parts.push(ink(wrectPath(bx, by, bs, bs * 0.7, s + 3, 0.02, 0.03), pick(INK_POOLS.stone, s + 4), P.mortarInk, 0.016))
    }
    parts.push(mossClump(ix + iw * 0.3, iy + ih * 0.68, 0.16, seed + 700))
    parts.push(mossClump(ix + iw * 0.68, iy + ih * 0.4, 0.13, seed + 720))
    parts.push(ink(wrectPath(x, y, w, h, seed + 3, 0.03, 0.05), 'none', P.inkKit, 0.045))
    return parts.join('')
  }

  // roof: two slopes split by a ridge; the lower (eave) slope draws darker. The
  // covering (tile/slate/thatch/shingle) is seed-picked — decoupled from the
  // wall material — unless `coveringId` forces one (catalog/gallery).
  const cov = coveringId ? ROOF_COVERINGS.find((c) => c.id === coveringId) ?? ROOF_COVERINGS[0] : pick(ROOF_COVERINGS, seed + 50)
  const tH = cov.tileH ?? 0.26, bF = cov.broken?.fill, bI = cov.broken?.ink
  const ridgeY = iy + ih * 0.5
  parts.push(roofSlope(ix, iy, iw, ridgeY - iy, seed + 100, cov.roofPool, cov.roofInk, false, tH, bF, bI))
  parts.push(roofSlope(ix, ridgeY, iw, iy + ih - ridgeY, seed + 200, cov.roofPool, cov.roofInk, true, tH, bF, bI))
  // ridge cap (thin masonry) + flat highlight/shade lines (our stand-in for the pitch)
  parts.push(masonryBand(ix - 0.02, ridgeY - 0.06, iw + 0.04, 0.12, seed + 300, 0.12))
  parts.push(ink(`M${f(ix)} ${f(ridgeY - 0.07)}L${f(ix + iw)} ${f(ridgeY - 0.07)}`, 'none', P.lightWarm, 0.02, 0.5))
  parts.push(ink(`M${f(ix)} ${f(ridgeY + 0.07)}L${f(ix + iw)} ${f(ridgeY + 0.07)}`, 'none', P.inkKit, 0.02, 0.4))
  parts.push(ink(`M${f(ix)} ${f(iy + ih)}L${f(ix + iw)} ${f(iy + ih)}`, 'none', P.inkKit, 0.03, 0.22))

  // plank door in the lower (front) wall + a couple of dark windows
  const dw = Math.min(0.55, w * 0.24), dx = x + w * 0.42, dy = y + h - WALL - 0.02
  parts.push(ink(wrectPath(dx - 0.04, dy - 0.02, dw + 0.08, WALL + 0.06, seed + 400, 0.02, 0.03), P.woodDeep, P.inkKit, 0.025))
  parts.push(ink(wrectPath(dx, dy, dw, WALL + 0.02, seed + 410, 0.02, 0.03), pick(INK_POOLS.wood, seed + 411), P.woodInk2, 0.02))
  parts.push(ink(`M${f(dx + dw / 2)} ${f(dy)}L${f(dx + dw / 2)} ${f(dy + WALL)}`, 'none', P.woodGrain2, 0.014, 0.6))
  for (const wf of [0.17, 0.72]) {
    const wx = x + w * wf, wh = Math.max(0.08, WALL - 0.1)
    parts.push(ink(wrectPath(wx, y + h - WALL + (WALL - wh) / 2, 0.2, wh, seed + 420 + wf * 100, 0.015, 0.02), P.roofRidge, P.inkKit, 0.016))
  }

  // moss on the shaded (lower-left) corners + ridge, and creeping the wall base
  parts.push(mossClump(ix + 0.1, iy + ih - 0.08, 0.14, seed + 600))
  parts.push(mossClump(ix + iw * 0.26, iy + ih - 0.05, 0.1, seed + 620))
  parts.push(mossClump(ix + iw * 0.5, ridgeY + 0.03, 0.09, seed + 640))
  parts.push(mossClump(x + 0.06, y + h * 0.66, 0.09, seed + 660))

  // light rim up-right / dark base down-left, then the bold silhouette ink
  parts.push(ink(`M${f(x + w)} ${f(y)}L${f(x + w)} ${f(y + h)}`, 'none', P.lightWarm, 0.03, 0.22))
  parts.push(ink(`M${f(x)} ${f(y + h)}L${f(x + w)} ${f(y + h)}`, 'none', P.inkKit, 0.03, 0.26))
  parts.push(ink(wrectPath(x, y, w, h, seed + 3, 0.03, 0.05), 'none', P.inkKit, 0.045))
  return parts.join('')
}
