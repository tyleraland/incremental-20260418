// ── Authoring helpers ────────────────────────────────────────────────────────
//
// Deterministic geometry helpers for procedural paper assets (asset-pipeline
// step 4 — see BACKLOG → Graphics): authors state INTENT (a rect, a rough
// radius, a density) and these apply the style rules (hand-cut wonk, blobby
// smoothing, keep-clear placement). Everything is seeded — NO Math.random —
// so terrain, screenshots, and replays are stable per location.
//
// Pure math, no React/engine imports; the SVG assembly lives in terrain.tsx.

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

// Deterministic [0,1) hash of an integer. Mirrors the engine's private hash01
// (engine.ts) — duplicated on purpose: the render layer must not reach into
// engine internals, and the two never need to agree.
export function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 4294967296
}

// FNV-1a string → uint seed (same recipe the store uses for openWorldBarriers,
// so "seeded by the location id" means one thing everywhere).
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Hand-cut jitter: nudge every point by up to ±amp, deterministically per
// (seed, index). The wonk that makes a regular outline read as cut paper.
export function wonk(points: Pt[], seed: number, amp: number): Pt[] {
  return points.map((p, i) => ({
    x: p.x + (hash01(seed + i * 37) - 0.5) * 2 * amp,
    y: p.y + (hash01(seed + i * 37 + 17) - 0.5) * 2 * amp,
  }))
}

const f = (v: number) => String(Math.round(v * 100) / 100)

// Closed blobby path through the points: quadratic curves anchored at edge
// midpoints, each vertex acting as the control point — the cheap Catmull-Rom
// stand-in that turns a wonked polygon into an organic blob.
export function blobPath(pts: Pt[]): string {
  const n = pts.length
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const m0 = mid(pts[n - 1], pts[0])
  let d = `M${f(m0.x)} ${f(m0.y)}`
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    d += ` Q${f(pts[i].x)} ${f(pts[i].y)} ${f(m.x)} ${f(m.y)}`
  }
  return d + 'Z'
}

// Closed straight-edged path (wonked corners, no smoothing) — cut stone.
export function polyPath(pts: Pt[]): string {
  return 'M' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L') + 'Z'
}

// Rect outline as a clockwise point ring with intermediate anchors roughly
// every `spacing` units — the anchors wonk() then displaces. More anchors on a
// long wall = a wobblier, more organic edge.
export function rectOutline(r: Rect, spacing: number): Pt[] {
  const corners: Pt[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
  const out: Pt[] = []
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.round(len / spacing))
    for (let s = 0; s < steps; s++) {
      out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps })
    }
  }
  return out
}

// Rough circle: `n` points around (cx,cy) with per-point radial jitter — the
// mottle-patch / bush silhouette generator.
export function roughCircle(cx: number, cy: number, r: number, n: number, seed: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const rad = r * (0.65 + hash01(seed + i * 53) * 0.7)
    out.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad })
  }
  return out
}

// Deterministic path-data wonk: re-cut an authored path with per-anchor jitter
// (endpoints AND control points, ±amp), so one archetype yields a family of
// hand-cut siblings (asset-pipeline step 7 — variant generation; see
// `variants()` in props.ts). Handles the prop grammar — M/L/H/V/C/S/Q/T/A,
// absolute or relative, implicit repeats — and re-emits absolute (H/V become L
// so both axes wobble). Arc radii wobble at half strength; rotation/flags stay
// exact. Identical (d, seed) → identical output, so a cutout()'s base+lit pair
// (two copies of the same d) stays perfectly in sync.
export function wonkPathD(d: string, seed: number, amp: number): string {
  const tokens = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?)/g)]
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, k = 0
  const read = () => Number(tokens[i++][2])
  const jit = () => (hash01(seed + k++ * 37) - 0.5) * 2 * amp
  const f = (v: number) => String(Math.round(v * 100) / 100)
  const pt = (x: number, y: number) => `${f(x + jit())} ${f(y + jit())}`
  const out: string[] = []
  while (i < tokens.length) {
    const c = tokens[i][1]
    if (!c) return d                       // malformed — leave the path untouched
    i++
    const C = c.toUpperCase()
    const rel = c !== C && C !== 'Z'
    if (C === 'Z') { out.push('Z'); cx = sx; cy = sy; continue }
    let first = true
    do {
      const eff = C === 'M' && !first ? 'L' : C
      if (eff === 'M' || eff === 'L' || eff === 'T') {
        const x = read() + (rel ? cx : 0), y = read() + (rel ? cy : 0)
        out.push(eff + pt(x, y)); cx = x; cy = y
        if (eff === 'M') { sx = x; sy = y }
      } else if (eff === 'H') {
        const x = read() + (rel ? cx : 0)
        out.push('L' + pt(x, cy)); cx = x
      } else if (eff === 'V') {
        const y = read() + (rel ? cy : 0)
        out.push('L' + pt(cx, y)); cy = y
      } else if (eff === 'C' || eff === 'S' || eff === 'Q') {
        const groups: string[] = []
        let x = cx, y = cy
        for (let g = 0; g < (eff === 'C' ? 3 : 2); g++) {
          x = read() + (rel ? cx : 0); y = read() + (rel ? cy : 0)
          groups.push(pt(x, y))
        }
        out.push(eff + groups.join(' ')); cx = x; cy = y
      } else if (eff === 'A') {
        const rx = read(), ry = read(), rot = read(), laf = read(), sf = read()
        const x = read() + (rel ? cx : 0), y = read() + (rel ? cy : 0)
        out.push(`A${f(Math.max(0.01, rx + jit() * 0.5))} ${f(Math.max(0.01, ry + jit() * 0.5))} ${f(rot)} ${laf} ${sf} ${pt(x, y)}`)
        cx = x; cy = y
      } else return d                      // unknown command — bail untouched
      first = false
    } while (i < tokens.length && !tokens[i][1])
  }
  return out.join('')
}

// Deterministic keep-clear placement: up to `count` points inside the map
// (inset by `edge`), rejection-sampled away from the `avoid` rects (+margin).
// Bounded attempts, so dense maps just come out sparser — never spin.
export function scatter(cols: number, rows: number, seed: number, count: number, avoid: Rect[], margin = 0.5, edge = 1): Pt[] {
  const out: Pt[] = []
  for (let k = 0; out.length < count && k < count * 8; k++) {
    const x = edge + hash01(seed + k * 101) * (cols - edge * 2)
    const y = edge + hash01(seed + k * 101 + 51) * (rows - edge * 2)
    const blocked = avoid.some((r) => x > r.x - margin && x < r.x + r.w + margin && y > r.y - margin && y < r.y + r.h + margin)
    if (!blocked) out.push({ x, y })
  }
  return out
}
