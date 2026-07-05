// ── Inked toolkit ─────────────────────────────────────────────────────────────
//
// A port of the top-down battlemap kit's technique into OUR constraints: every
// surface is built from many small, individually-INKED, jittered pieces picked
// from a value POOL — so texture reads from piece-to-piece value variation, NOT
// from a gradient. This is how we "upscale" the flat cutout look to hand-inked
// density without breaking the two hard rules the paper language keeps:
//
//   • FLAT fills + palette ROLES only — NO gradients, NO filters (Palette.test).
//     The kit fakes light with gradient overlays + gaussian-blur shadows; we
//     fake it with a lit/shade pool split and flat offset shadow shapes instead.
//   • DETERMINISTIC — every jitter/pick is seeded (hash01), no Math.random, so
//     the baked terrain image is byte-stable across replays/screenshots.
//
// It's free at runtime: these pieces bake into terrain.tsx's single data-URI
// image (the "static battlefield art ships as an IMAGE, not elements" rule), so
// hundreds of inked tiles cost one paint, not N reconciles.
//
// One dark ink per material, one light direction (up-left, matching the rest of
// render/). Emitters return svg-markup strings in the terrain's unit space (y
// down); callers place them.

import { PAPER_PALETTE as P, INK_POOLS } from '@/render/palette'
import { hash01, wrectPath, blobPath, roughCircle, pick } from '@/render/authoring'

const f = (v: number) => Math.round(v * 1000) / 1000

// One inked path: fill + (optional) stroke in a single element, so nothing is
// ever left un-outlined. `w` is stroke width in unit space (~0.015–0.03).
export function ink(d: string, fill: string, inkColor?: string, w = 0.02, op?: number): string {
  return (
    `<path d='${d}' fill='${fill}'` +
    (inkColor ? ` stroke='${inkColor}' stroke-width='${w}' stroke-linejoin='round' stroke-linecap='round'` : '') +
    (op != null ? ` opacity='${op}'` : '') +
    '/>'
  )
}

// Running-bond masonry band: fill a rect region with jittered stone blocks in
// half-block-offset alternating rows, each block a pooled grey + mortar ink.
export function masonryBand(x: number, y: number, w: number, h: number, seed: number, courseH = 0.3): string {
  let out = ''
  let yy = y
  let row = 0
  while (yy < y + h - 0.01) {
    const ch = Math.min(courseH, y + h - yy)
    const off = row % 2 ? 0.16 + hash01(seed + row * 7) * 0.16 : 0
    let xx = x - off
    let col = 0
    while (xx < x + w - 0.01) {
      const bw = 0.34 + hash01(seed + row * 31 + col * 17) * 0.24
      const x0 = Math.max(xx, x)
      const wdraw = Math.min(xx + bw, x + w) - x0
      if (wdraw > 0.05 && ch > 0.05) {
        out += ink(wrectPath(x0, yy, wdraw, ch, seed + row * 131 + col * 7, 0.02, 0.03), pick(INK_POOLS.stone, seed + row * 3 + col * 5), P.mortarInk, 0.017)
      }
      xx += bw
      col++
    }
    yy += courseH
    row++
  }
  return out
}

// A roof slope: staggered courses of small jittered tiles from a roof pool, with
// ~5% broken-dark and ~5% moss tiles (the kit weathering). `darken` biases the
// pick toward the darker end of the pool (the shaded, lower/eave slope) — our
// flat stand-in for the kit's slope gradient.
export function roofSlope(x: number, y: number, w: number, h: number, seed: number, pool: readonly string[], inkColor: string, darken = false, tileH = 0.22): string {
  let out = ''
  let yy = y
  let row = 0
  while (yy < y + h - 0.01) {
    const ch = Math.min(tileH, y + h - yy)
    const stag = row % 2 ? 0.12 + hash01(seed + row * 9) * 0.08 : 0
    let xx = x - stag
    let col = 0
    while (xx < x + w - 0.01) {
      const tw = 0.32 + hash01(seed + row * 23 + col * 13) * 0.18
      const x0 = Math.max(xx, x)
      const wdraw = Math.min(xx + tw, x + w) - x0
      if (wdraw > 0.05 && ch > 0.05) {
        const roll = hash01(seed + row * 57 + col * 29)
        let col2: string, ink2: string
        if (roll < 0.05) { col2 = P.tileBroken; ink2 = P.roofRedInk }
        else if (roll < 0.1) { col2 = P.tileMoss; ink2 = P.mossInk }
        else {
          // bias the index darker on the shaded slope (lower half of the pool)
          let k = Math.floor(hash01(seed + row * 7 + col * 11) * pool.length)
          if (darken) k = Math.min(pool.length - 1, Math.floor(k / 2) + Math.floor(pool.length / 2))
          col2 = pool[k]; ink2 = inkColor
        }
        out += ink(wrectPath(x0, yy, wdraw, ch, seed + row * 137 + col * 7, 0.017, 0.035), col2, ink2, 0.015)
      }
      xx += tw
      col++
    }
    yy += tileH
    row++
  }
  return out
}

// A moss clump: a dark green jittered blob speckled with lighter-green dots.
export function mossClump(cx: number, cy: number, r: number, seed: number): string {
  let out = ink(blobPath(roughCircle(cx, cy, r, 9, seed)), P.mossBase, P.mossInk, 0.015)
  const n = Math.max(3, Math.floor(r * 5))
  for (let i = 0; i < n; i++) {
    const s = seed + i * 53
    const sx = cx + (hash01(s) - 0.5) * 1.7 * r
    const sy = cy + (hash01(s + 1) - 0.5) * 1.7 * r
    const rr = 0.018 + hash01(s + 2) * 0.03
    out += `<circle cx='${f(sx)}' cy='${f(sy)}' r='${f(rr)}' fill='${pick(INK_POOLS.moss, s + 3)}'/>`
  }
  return out
}

// One cobblestone: a ~7-sided jittered blob from the cobble pool, light ink so
// the ground recedes under the structures.
export function cobble(cx: number, cy: number, r: number, seed: number): string {
  return ink(blobPath(roughCircle(cx, cy, r, 7, seed)), pick(INK_POOLS.cobble, seed + 1), P.cobbleInk, 0.014)
}
