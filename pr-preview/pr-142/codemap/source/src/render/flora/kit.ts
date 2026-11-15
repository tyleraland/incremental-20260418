// ── Flora authoring kit ──────────────────────────────────────────────────────
//
// The shared geometry toolkit for the flora asset catalog (src/render/flora/*).
// Every builder file imports its runtime helpers from HERE (and its types from
// '@/render/props' via `import type`), so a flora file NEVER runtime-imports
// props.ts — that keeps the props.ts ⇄ flora import graph acyclic even though
// props.ts pulls each group array back in.
//
// Same four rules as the rest of the paper language (see src/render/CLAUDE.md):
//   1. palette ROLES only (no hex at the use site)   2. one light dir → cutout()
//   3. deterministic wonk (seeded helpers, no Math.random)   4. flat only.
//
// All emitters return absolute-command path strings (M/L/Q/C/A/Z) that survive
// wonkPathD, so an authored archetype variants() cleanly.

import { blobPath, roughCircle, polyPath, wrectPath, hash01, hashString, pick, wonkPathD, type Pt } from '@/render/authoring'
import type { PropPath } from '@/render/props'
import type { PaperRole } from '@/render/palette'

// Re-export the authoring primitives so a flora file has ONE import source.
export { blobPath, roughCircle, polyPath, wrectPath, hash01, hashString, pick, wonkPathD }
export type { Pt }

const q = (v: number) => Math.round(v * 1000) / 1000

// The standard two-tone cutout: base silhouette + auto-nudged lit top copy.
// (Same contract as props.ts `cutout`; re-declared here to keep flora acyclic.)
export function cutout(d: string, base: PaperRole, lit: PaperRole): PropPath[] {
  return [{ d, fill: base }, { d, fill: lit, lit: true }]
}

// A closed circle as two arcs — wonkPathD-safe (radii wobble, flags stay exact).
// The workhorse for fruit, berries, seed heads, flower centres, gourds.
export function ring(r: number, cx = 0, cy = 0): string {
  return `M${q(cx - r)} ${q(cy)}A${q(r)} ${q(r)} 0 1 0 ${q(cx + r)} ${q(cy)}A${q(r)} ${q(r)} 0 1 0 ${q(cx - r)} ${q(cy)}Z`
}

// A closed axis-aligned rectangle (planter boxes, trellis frames, crates).
export function rect(x: number, y: number, w: number, h: number): string {
  return `M${q(x)} ${q(y)}L${q(x + w)} ${q(y)}L${q(x + w)} ${q(y + h)}L${q(x)} ${q(y + h)}Z`
}

// An almond LEAF: a lens between two tips bulged by perpendicular control points.
// M/Q only → wonks + variants cleanly. `ang` in radians orients the long axis.
export function leaf(cx: number, cy: number, len: number, wid: number, ang: number): string {
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx
  const t1x = cx + dx * len, t1y = cy + dy * len, t2x = cx - dx * len, t2y = cy - dy * len
  const c1x = cx + px * wid, c1y = cy + py * wid, c2x = cx - px * wid, c2y = cy - py * wid
  return `M${q(t1x)} ${q(t1y)}Q${q(c1x)} ${q(c1y)} ${q(t2x)} ${q(t2y)}Q${q(c2x)} ${q(c2y)} ${q(t1x)} ${q(t1y)}Z`
}

// A radial STAR (spiky crown / composite flower / cog): `n` points, outer radius
// `ro`, valley `ri`, `rot` radians. Pure trig — a static path that wonks like any
// hand-authored prop. (Deciduous/round counterpart: `lobeBlob`.)
export function radialStar(n: number, ro: number, ri: number, rot = 0): string {
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    d += (i ? 'L' : 'M') + q(Math.cos(a) * r) + ' ' + q(Math.sin(a) * r)
  }
  return d + 'Z'
}

// A rounded-LOBE ring smoothed by blobPath (leafy round crown / berry cluster /
// cauliflower bush): `n` lobes alternating outer `ro` / valley `ri` around (cx,cy).
export function lobeBlob(n: number, ro: number, ri: number, cx = 0, cy = 0): string {
  const pts: Pt[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return blobPath(pts)
}

// A seeded scatter of small circles (berries on a bush, seeds in a head, spine
// dots, fallen fruit) as ONE multi-subpath — deterministic, so a cutout pair or
// a base+detail overlay stays in sync. `spread` = box side the dots fill.
export function scatterDots(seed: number, n: number, spread = 1.4, rMin = 0.06, rMax = 0.12): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 911) - 0.5) * spread
    const y = (hash01(seed + i * 911 + 331) - 0.5) * spread
    const r = rMin + hash01(seed + i * 911 + 613) * (rMax - rMin)
    d += ring(r, x, y)
  }
  return d
}

// A soft round GLOW halo: a low-lobe blob to fill at low fill-opacity with a glow
// role (arcaneGlow / glowFungus / ember / lampGlow). This is the ONLY sanctioned
// glow technique — a flat lighter shape, never an SVG filter/blur/gradient.
export function glowHalo(r: number, cx = 0, cy = 0): string {
  return lobeBlob(6, r, r * 0.82, cx, cy)
}
