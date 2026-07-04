// ── City building catalog ─────────────────────────────────────────────────────
//
// The town-tile asset library: how a collision rect tagged with a BUILT material
// (cut-stone / wood / rubble) becomes a paper-cutout BUILDING — a pitched two-tone
// roof, a sliver of lit wall at the down-right eaves, and a flat cast shadow. This
// is the "layers, depth, shadow" read for a medieval city.
//
// It is a CATALOG keyed off BarrierMaterial, never location ids — the same seam
// rule as appearance.ts (skins switch on material/kind). A procedural city
// generator plugs straight in: tag a wall rect `cut-stone` and it renders as a
// stone hall; tag it `wood` and it's a timber house. terrain.tsx is the dumb
// emitter (`buildingMarkup`), exactly as it is for scatter props (`propMarkup`).
//
// Same four language rules as everything else in render/: palette ROLES only
// (Palette.test.tsx gates it), one light direction (up-left → the roof lifts and
// the lit slope faces up-left), deterministic wonk (seeded, NO Math.random), and
// flat fills only (the pitch is a two-tone, the shadow an offset shape — no
// filters, no gradients).

import type { BarrierMaterial } from '@/mapgen'
import { PAPER_PALETTE as P, type PaperRole } from '@/render/palette'
import { hash01, polyPath, wonk, type Pt, type Rect } from '@/render/authoring'

// Roof texture family — flat strokes over each slope so a bare two-tone reads as
// staggered shingles (Ragnarok-Prontera townhouse), dressed slate, or bare ruin.
export type RoofTexture = 'shingle' | 'slate' | 'none'

export interface BuildingLook {
  wall: PaperRole        // the lit wall sliver under the eaves
  wallShade: PaperRole   // the wall base (the down-right depth face)
  roofLit: PaperRole     // slope facing the light (up-left)
  roofShade: PaperRole   // slope facing away
  texture: RoofTexture
  roofed: boolean        // false → a ruin: broken walls, no roof
  framed?: boolean       // half-timbered: dark studs on the exposed wall sliver
}

// The catalog, styled after Prontera's architecture:
//   wood      → a half-timbered townhouse (cream daub + dark timber, brown roof)
//   cut-stone → a stone hall / keep (dressed stone + a cool blue-slate roof)
//   rubble    → a roofless ruin (the ruins/history motif)
// cut-stone and wood are what the city recipe emits today; every other
// BarrierMaterial (rock/hedge/water/…) is NOT a building — terrain.tsx leaves
// those to the organic blob/cliff dressing.
export const BUILDING_LOOKS: Partial<Record<BarrierMaterial, BuildingLook>> = {
  'wood':      { wall: 'plasterWhite', wallShade: 'plasterDark',   roofLit: 'roofShingle', roofShade: 'roofShingleDark', texture: 'shingle', roofed: true, framed: true },
  'cut-stone': { wall: 'stoneWall',    wallShade: 'stoneWallDark', roofLit: 'roofSlate',   roofShade: 'roofSlateDark',   texture: 'slate',   roofed: true },
  'rubble':    { wall: 'stoneWall',    wallShade: 'stoneWallDark', roofLit: 'stoneWall',   roofShade: 'stoneWallDark',   texture: 'none',    roofed: false },
}

export function isBuildingMaterial(m: BarrierMaterial | undefined): boolean {
  return m != null && m in BUILDING_LOOKS
}

// Light direction (up-left): the roof plate lifts off the footprint by this much,
// exposing the lit wall sliver along the bottom-right — the building's "height".
const LIFT = 0.42
// Cast shadow offset (down-right, away from the light).
const SHADOW = { dx: 0.5, dy: 0.62 }
// Corner jitter — small: houses read RECTANGULAR, just not machine-sterile.
const WONK = 0.09

const f = (v: number) => String(Math.round(v * 100) / 100)
const poly = (pts: Pt[]) => polyPath(pts)

// A wonked rect outline (4 corners only — buildings stay boxy). Seeded so a
// building looks the same every visit.
function corners(r: Rect, seed: number, amp = WONK): [Pt, Pt, Pt, Pt] {
  const raw: Pt[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
  const w = wonk(raw, seed, amp)
  return [w[0], w[1], w[2], w[3]]
}

const shift = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy })
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

// Course/beam strokes across a slope quad [A,B,C,D] (A-B is the ridge edge, D-C
// the eave edge): `n` lines parallel to the ridge. Flat strokes, one role.
function courses(a: Pt, b: Pt, c: Pt, d: Pt, n: number, role: PaperRole, sw: number): string {
  let out = ''
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1)
    const p0 = lerp(a, d, t), p1 = lerp(b, c, t)
    out += `<path d='M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}' stroke='${P[role]}' stroke-width='${sw}' stroke-opacity='0.4' stroke-linecap='round'/>`
  }
  return out
}

// Staggered shingle rows across a slope quad [A,B,C,D] (A-B ridge, D-C eave):
// `rows` course lines, each with short cross-ticks offset half a step per row →
// the staggered-tile read (brick-bond, top-down).
function shingles(a: Pt, b: Pt, c: Pt, d: Pt, rows: number, role: PaperRole): string {
  const step = 1 / (rows + 1)
  let out = ''
  for (let i = 1; i <= rows; i++) {
    const t = i * step
    const l = lerp(a, d, t), r = lerp(b, c, t)             // this course line
    const l2 = lerp(a, d, t + step * 0.6), r2 = lerp(b, c, t + step * 0.6)   // toward the eave
    out += `<path d='M${f(l.x)} ${f(l.y)}L${f(r.x)} ${f(r.y)}' stroke='${P[role]}' stroke-width='0.055' stroke-opacity='0.45'/>`
    const cols = 5
    for (let j = 0; j < cols; j++) {
      const u = (j + (i % 2 ? 0.25 : 0.75)) / cols
      const p = lerp(l, r, u), q = lerp(l2, r2, u)
      out += `<path d='M${f(p.x)} ${f(p.y)}L${f(q.x)} ${f(q.y)}' stroke='${P[role]}' stroke-width='0.05' stroke-opacity='0.33' stroke-linecap='round'/>`
    }
  }
  return out
}

// Timber studs along an exposed wall edge a→b, each poking `inward` (a vector
// into the wall band). The half-timber framing that reads even top-down.
function studs(a: Pt, b: Pt, inward: Pt, n: number, role: PaperRole): string {
  let out = ''
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const p = lerp(a, b, t)
    out += `<path d='M${f(p.x)} ${f(p.y)}L${f(p.x + inward.x)} ${f(p.y + inward.y)}' stroke='${P[role]}' stroke-width='0.11' stroke-opacity='0.75' stroke-linecap='round'/>`
  }
  return out
}

// Emit ONE building as svg markup, footprint `r` already in the terrain's svg
// coords (y down). Layers bottom→top: cast shadow · wall base · lit wall sliver ·
// two-slope roof (+ ridge, eaves, texture). ~8–10 flat paths; baked into the
// terrain's single data-URI image, so the element count is free at runtime.
export function buildingMarkup(r: Rect, material: BarrierMaterial, seed: number): string {
  const look = BUILDING_LOOKS[material] ?? BUILDING_LOOKS['cut-stone']!
  const [tl, tr, br, bl] = corners(r, seed)

  // cast shadow — the footprint pushed down-right, flat and translucent
  const sh = [tl, tr, br, bl].map((p) => shift(p, SHADOW.dx, SHADOW.dy))
  const parts: string[] = [`<path d='${poly(sh)}' fill='${P.shadow}' fill-opacity='0.26'/>`]

  if (!look.roofed) {
    // ruin: a low broken stone box — base, a lit inner patch, and a couple of
    // gap notches so it reads as collapsed rather than a tidy plinth.
    parts.push(`<path d='${poly([tl, tr, br, bl])}' fill='${P[look.wallShade]}' stroke='${P.roofRidge}' stroke-width='0.12' stroke-linejoin='round'/>`)
    const inl = [tl, tr, br, bl].map((p, i) => lerp(p, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, 0.24 + hash01(seed + i * 41) * 0.12))
    parts.push(`<path d='${poly(inl)}' fill='${P[look.wall]}' fill-opacity='0.7'/>`)
    return parts.join('')
  }

  // wall: full footprint in the shade tone (the base), then the lit tone inset —
  // the sliver that survives under the lifted roof at the bottom-right is the
  // building's exposed wall face.
  parts.push(`<path d='${poly([tl, tr, br, bl])}' fill='${P[look.wallShade]}'/>`)
  const wallLit = [tl, tr, br, bl].map((p) => shift(p, 0.08, 0.05))
  parts.push(`<path d='${poly(wallLit)}' fill='${P[look.wall]}'/>`)
  // half-timbered: dark studs along the two exposed eaves (the plaster panels
  // between them read as the light wall). Poke into the ~LIFT-wide wall band.
  if (look.framed) {
    const nB = Math.max(3, Math.round(r.w / 1.1)), nR = Math.max(2, Math.round(r.h / 1.1))
    parts.push(studs(bl, br, { x: 0, y: -LIFT * 0.9 }, nB, 'timberFrame'))      // bottom eave
    parts.push(studs(tr, br, { x: -LIFT * 0.9, y: 0 }, nR, 'timberFrame'))      // right eave
  }

  // roof: the footprint lifted up-left, split by a ridge along the LONG axis into
  // a lit slope (up-left) and a shade slope. Ridge ends inset → a hipped read.
  const [rtl, rtr, rbr, rbl] = [tl, tr, br, bl].map((p) => shift(p, -LIFT, -LIFT)) as [Pt, Pt, Pt, Pt]
  const hip = Math.min(r.w, r.h) * 0.26
  let litQuad: [Pt, Pt, Pt, Pt], shadeQuad: [Pt, Pt, Pt, Pt], ridge: [Pt, Pt]
  if (r.w >= r.h) {
    // horizontal ridge across the middle; top slope faces up (lit)
    const ml = lerp(rtl, rbl, 0.5), mr = lerp(rtr, rbr, 0.5)
    const rl = lerp(ml, mr, hip / r.w), rr = lerp(mr, ml, hip / r.w)
    ridge = [rl, rr]
    litQuad = [rtl, rtr, rr, rl]
    shadeQuad = [rl, rr, rbr, rbl]
  } else {
    // vertical ridge; left slope faces up-left (lit)
    const mt = lerp(rtl, rtr, 0.5), mb = lerp(rbl, rbr, 0.5)
    const rt = lerp(mt, mb, hip / r.h), rb = lerp(mb, mt, hip / r.h)
    ridge = [rt, rb]
    litQuad = [rtl, rt, rb, rbl]
    shadeQuad = [rt, rtr, rbr, rb]
  }
  parts.push(`<path d='${poly(shadeQuad)}' fill='${P[look.roofShade]}'/>`)
  parts.push(`<path d='${poly(litQuad)}' fill='${P[look.roofLit]}'/>`)
  // roof texture: staggered shingles (townhouse) or dressed slate courses (hall)
  if (look.texture === 'shingle') {
    parts.push(shingles(litQuad[0], litQuad[1], litQuad[2], litQuad[3], 3, look.roofShade))
    parts.push(shingles(shadeQuad[0], shadeQuad[1], shadeQuad[2], shadeQuad[3], 3, look.roofShade))
  } else if (look.texture === 'slate') {
    parts.push(courses(litQuad[0], litQuad[1], litQuad[2], litQuad[3], 3, look.roofShade, 0.07))
    parts.push(courses(shadeQuad[0], shadeQuad[1], shadeQuad[2], shadeQuad[3], 3, look.roofShade, 0.07))
  }
  // eaves outline + the ridge beam — the crisp "cut paper" edges
  parts.push(`<path d='${poly([rtl, rtr, rbr, rbl])}' fill='none' stroke='${P.roofRidge}' stroke-width='0.13' stroke-linejoin='round'/>`)
  parts.push(`<path d='M${f(ridge[0].x)} ${f(ridge[0].y)}L${f(ridge[1].x)} ${f(ridge[1].y)}' stroke='${P.roofRidge}' stroke-width='0.14' stroke-linecap='round'/>`)
  return parts.join('')
}
