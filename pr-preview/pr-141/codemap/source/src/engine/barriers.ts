// Combat Tactic Engine — terrain / barriers (spec §2).
//
// Axis-aligned impassable rectangles. Movement traces toward its goal and stops
// at the last free point (so a unit ends up *against* a wall, never inside or
// past it); when a move is blocked outright it slides along the wall instead, so
// units route around obstacles without full pathfinding. Knockback uses the same
// trace — it can shove a target up against a wall but never through it.
//
// Leaf module (constants + types only) so grid.ts can import it without a cycle.

import { COLS, ROWS, EPS, DEPLOY_FRONT } from './constants'
import { arenaClamp, arenaCols, arenaRows } from './arena'
import type { Vec2, Barrier, MoveCaps } from './types'

// Tie-break in the path search: corners on the left side of the arena cost
// extra, so units staring down the same obstacle tend to route to the same
// side instead of splitting unpredictably (each left corner traversed adds
// this much). Truly-shorter detours still win — this herds the cases where
// left and right are roughly comparable so they're chosen consistently.
const HERD_BIAS = 4.0

// Units are treated as small discs so they stop just shy of a wall.
const UNIT_PAD = 0.4

export function pointBlocked(barriers: Barrier[], p: Vec2, pad = UNIT_PAD): boolean {
  for (const b of barriers) {
    if (p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad) return true
  }
  return false
}

// Exact sample-window clipping for the sampled trace/sight checks below. The
// original scans tested EVERY 0.2-cell sample against EVERY barrier — 81% of
// all engine time on a 220-entity open field (profiled on the ?perf scene,
// mobile 4×), and on a 200×200 map a single long wander line is 500+ samples.
// Instead, per barrier, a slab test finds the t-window where the segment can
// possibly sit inside that barrier's pad-inflated rect, and only the samples
// in that window (± one sample of float slack) are tested — with the ORIGINAL
// predicate at the ORIGINAL sample positions, so results are byte-identical
// (pinned by barriers-fastpath.test.ts), never an approximation. Cost drops
// from O(samples × barriers) to O(barriers + samples actually near a wall).
//
// Returns the sample-index window [i0, i1] for barrier `b` on the segment
// from+(Δ·i/steps), or null when no sample can hit it. `iMin`/`iMax` bound the
// caller's remaining interest (traceMove narrows iMax as it finds hits).
function sampleWindow(
  b: Barrier, pad: number, from: Vec2, dx: number, dy: number, steps: number, iMin: number, iMax: number,
): { i0: number; i1: number } | null {
  let t0 = 0, t1 = 1
  const lox = b.x - pad, hix = b.x + b.w + pad
  if (dx === 0) { if (from.x <= lox || from.x >= hix) return null }
  else {
    let a = (lox - from.x) / dx, c = (hix - from.x) / dx
    if (a > c) { const s = a; a = c; c = s }
    if (a > t0) t0 = a
    if (c < t1) t1 = c
  }
  const loy = b.y - pad, hiy = b.y + b.h + pad
  if (dy === 0) { if (from.y <= loy || from.y >= hiy) return null }
  else {
    let a = (loy - from.y) / dy, c = (hiy - from.y) / dy
    if (a > c) { const s = a; a = c; c = s }
    if (a > t0) t0 = a
    if (c < t1) t1 = c
  }
  if (t0 > t1) return null
  // ±1 sample of slack absorbs the slab divisions' float error; the skipped
  // samples were provably outside the rect, the kept ones re-run the exact test.
  const i0 = Math.max(iMin, Math.ceil(t0 * steps) - 1)
  const i1 = Math.min(iMax, Math.floor(t1 * steps) + 1)
  return i0 > i1 ? null : { i0, i1 }
}

// Clamp to the active arena (15×15 by default; larger for open-world battles).
const clamp = (p: Vec2): Vec2 => arenaClamp(p)
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

// Farthest point from `from` toward `to` that isn't inside a barrier — i.e. stop
// up against the wall. Samples the segment so a fast move can't tunnel through.
// Equivalent to sampling every step against every barrier (the first blocked
// sample wins), but each barrier only scans its own slab window — see sampleWindow.
export function traceMove(from: Vec2, to: Vec2, barriers: Barrier[], pad = UNIT_PAD): Vec2 {
  to = clamp(to)
  if (barriers.length === 0) return to
  const d = dist(from, to)
  if (d < EPS) return from
  const steps = Math.max(1, Math.ceil(d / 0.2))
  const dx = to.x - from.x, dy = to.y - from.y
  let firstBlocked = Infinity   // smallest blocked sample index across all barriers
  for (const b of barriers) {
    const win = sampleWindow(b, pad, from, dx, dy, steps, 1, Math.min(steps, firstBlocked - 1))
    if (!win) continue
    const lox = b.x - pad, hix = b.x + b.w + pad, loy = b.y - pad, hiy = b.y + b.h + pad
    for (let i = win.i0; i <= win.i1; i++) {
      const t = i / steps
      const px = from.x + dx * t, py = from.y + dy * t
      if (px > lox && px < hix && py > loy && py < hiy) { firstBlocked = i; break }
    }
  }
  if (firstBlocked === Infinity) return to
  if (firstBlocked === 1) return from
  const t = (firstBlocked - 1) / steps
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

// Nearest free point when a unit has somehow ended up *inside* a barrier (a
// crowded separation push or corner case can wedge one in). Without this, traceMove
// samples from an interior point, finds the first step still blocked, and returns
// `from` — so every direction reads as blocked and the unit freezes inside the
// terrain forever. Pop it out to just past the nearest inflated edge of whichever
// barrier holds it (preferring an exit that isn't inside another barrier).
export function escapeBarrier(from: Vec2, barriers: Barrier[], pad = UNIT_PAD): Vec2 {
  let cur = from
  for (let iter = 0; iter < 4; iter++) {
    const b = barriers.find((bb) => pointBlocked([bb], cur, pad))
    if (!b) break
    const e = 0.05
    const cands = [
      { x: b.x - pad - e, y: cur.y },
      { x: b.x + b.w + pad + e, y: cur.y },
      { x: cur.x, y: b.y - pad - e },
      { x: cur.x, y: b.y + b.h + pad + e },
    ].map(clamp)
    // Prefer the nearest exit that's clear of every barrier; else the nearest edge.
    let best: Vec2 | null = null, bd = Infinity
    let nearest = cands[0], nd = Infinity
    for (const c of cands) {
      const dd = dist(cur, c)
      if (dd < nd) { nd = dd; nearest = c }
      if (!pointBlocked(barriers, c, pad) && dd < bd) { bd = dd; best = c }
    }
    cur = best ?? nearest
    if (best) break
  }
  return cur
}

// Move toward `desired`; if blocked right away, slide along the wall by trying the
// four cardinal directions and taking the free one that ends nearest the goal.
export function slideMove(from: Vec2, desired: Vec2, barriers: Barrier[], pad = UNIT_PAD): Vec2 {
  // Wedged inside terrain → escape it first (otherwise every trace reads blocked
  // and the unit is stuck forever). Pop out this step; normal movement resumes next.
  if (pointBlocked(barriers, from, pad)) return escapeBarrier(from, barriers, pad)
  const direct = traceMove(from, desired, barriers, pad)
  // Take the direct move when it either reached the goal — even a sub-0.05 or
  // zero-length step — or made real straight-line progress. Only fall back to
  // wall-sliding when terrain actually blocked us short of `desired`. Without the
  // first clause, a legitimately tiny intended move (a melee attacker closing the
  // last fraction of a cell, or a moveSpeed-0 unit holding) got mistaken for
  // "blocked, slide" and kicked into a spurious 0.05 cardinal hop with no wall
  // present — a stationary monster crept due east forever and its attacker
  // shuffled around it at the rim of reach instead of stepping in to strike.
  if (dist(direct, desired) <= 0.05 || dist(from, direct) > 0.05) return direct
  const step = Math.max(0.05, dist(from, desired))
  const cands = [
    { x: from.x + step, y: from.y }, { x: from.x - step, y: from.y },
    { x: from.x, y: from.y + step }, { x: from.x, y: from.y - step },
  ]
  let best = from, bestD = Infinity
  for (const c of cands) {
    const t = traceMove(from, c, barriers, pad)
    if (dist(from, t) < 0.05) continue                // that way is blocked too
    const dd = dist(t, desired)
    if (dd < bestD - EPS) { bestD = dd; best = t }
  }
  return best
}

// True if the straight segment from→to crosses no barrier of the given kinds.
// `lineClear` (all barriers) is used for pathing; `sightlineClear` (walls only)
// is used for ranged targeting — cliffs block movement but not line of sight.
export function lineClear(from: Vec2, to: Vec2, barriers: Barrier[], pad = UNIT_PAD): boolean {
  if (barriers.length === 0) return true
  const d = dist(from, to)
  if (d < EPS) return true
  const steps = Math.max(1, Math.ceil(d / 0.2))
  const dx = to.x - from.x, dy = to.y - from.y
  for (const b of barriers) {
    const win = sampleWindow(b, pad, from, dx, dy, steps, 0, steps)
    if (!win) continue
    const lox = b.x - pad, hix = b.x + b.w + pad, loy = b.y - pad, hiy = b.y + b.h + pad
    for (let i = win.i0; i <= win.i1; i++) {
      const t = i / steps
      const px = from.x + dx * t, py = from.y + dy * t
      if (px > lox && px < hix && py > loy && py < hiy) return false
    }
  }
  return true
}

export function sightlineClear(from: Vec2, to: Vec2, barriers: Barrier[], pad = UNIT_PAD): boolean {
  // walls block sight; cliffs don't — let ranged shoot over them.
  const walls = barriers.filter((b) => (b.kind ?? 'wall') === 'wall')
  return lineClear(from, to, walls, pad)
}

// ── Visibility-graph cache (the §mapgen pather perf pass) ────────────────────
// steerAround used to rebuild its whole graph per call: corner nodes, usable
// flags, and — the killer — a lazy lineClear per Dijkstra relaxation, ~O((4B)²·B)
// per moving unit per decision round. That cost is what pinned live maps to
// BARRIER_CAP=16 rects. Everything corner↔corner depends only on the barrier
// set, the pad, and the arena bounds — all static for the life of a battle —
// so it's built ONCE and cached against the barrier ARRAY's identity (WeakMap;
// interleaved battles each hit their own entry, and tests' throwaway arrays
// just build fresh). Per call only the from/target edges are computed (≤2·4B
// lineClear) plus a pure-arithmetic Dijkstra.
//
// Byte-identical by construction (pinned by steer-cache.test.ts differential
// fuzz): corner clearance is stored per ORDERED pair — lineClear's sample
// positions differ by direction, so (a→b) and (b→a) may disagree by an ulp at
// a pad graze — and the Dijkstra below keeps the original's node order,
// linear-scan min selection, and tie-breaks exactly.
//
// Phase-6 note (dynamic barriers): REPLACE the barriers array to change
// terrain — never mutate rects in place — so the cache entry dies with the old
// array identity. A length change or arena-bounds change also invalidates.
interface VisGraph {
  count: number
  pad: number
  cols: number
  rows: number
  nodes: Vec2[]        // 4 clamped corners per barrier, in barrier order
  usable: boolean[]    // corner isn't inside another barrier
  bias: number[]       // HERD_BIAS for corners left of the (constant) grid centre
  dist: Float64Array   // m×m corner distances (hypot — symmetric)
  clear: Uint8Array    // m×m ORDERED corner→corner lineClear
}
const VIS_CACHE = new WeakMap<Barrier[], VisGraph[]>()

function visGraphFor(barriers: Barrier[], pad: number): VisGraph {
  const cols = arenaCols(), rows = arenaRows()
  let list = VIS_CACHE.get(barriers)
  if (list) {
    const hit = list.find((g) => g.pad === pad && g.cols === cols && g.rows === rows && g.count === barriers.length)
    if (hit) return hit
  } else {
    list = []
    VIS_CACHE.set(barriers, list)
  }
  const off = pad + 0.3
  const nodes: Vec2[] = []
  for (const b of barriers) {
    nodes.push(clamp({ x: b.x - off, y: b.y - off }))
    nodes.push(clamp({ x: b.x + b.w + off, y: b.y - off }))
    nodes.push(clamp({ x: b.x - off, y: b.y + b.h + off }))
    nodes.push(clamp({ x: b.x + b.w + off, y: b.y + b.h + off }))
  }
  const m = nodes.length
  const usable = nodes.map((p) => !pointBlocked(barriers, p, pad))
  // Herd-bias pivot reads the battle's actual width (`cols`, computed above via
  // `arenaCols()`) — not the fixed 15-wide encounter grid — so the left-side
  // detour penalty centres correctly on a large open-world map too.
  const cx = cols / 2
  const bias = nodes.map((p) => (p.x < cx ? HERD_BIAS : 0))
  const distM = new Float64Array(m * m)
  const clearM = new Uint8Array(m * m)
  for (let i = 0; i < m; i++) {
    if (!usable[i]) continue
    for (let j = 0; j < m; j++) {
      if (i === j || !usable[j]) continue   // pairs with an unusable end are never queried
      distM[i * m + j] = dist(nodes[i], nodes[j])
      clearM[i * m + j] = lineClear(nodes[i], nodes[j], barriers, pad) ? 1 : 0
    }
  }
  const g: VisGraph = { count: barriers.length, pad, cols, rows, nodes, usable, bias, dist: distM, clear: clearM }
  list.push(g)
  return g
}

// Proper navigation around terrain: a Dijkstra shortest path on the visibility
// graph (from + target + barrier corners), so a unit picks the route with the
// shortest total detour instead of just the locally-cheapest next corner. The
// corner graph is cached per battle (see VisGraph above); the from/target edges
// are per-call — when the line is clear, beeline.
// `caps` (§blink, M4) adds capability edges to the search: a teleport bridges
// any node pair within its range (walls still block when it needs line of
// sight; cliffs never do). Computed per call — the cached walk-graph stays
// untouched — and with `caps` omitted the code path is byte-identical to
// before (pinned by the steer-cache differential fuzz). With caps this answers
// route-shape/reachability ("CAN this unit get there"); executing the actual
// jump is the mover's business.
export function steerAround(from: Vec2, target: Vec2, barriers: Barrier[], pad = UNIT_PAD, caps?: MoveCaps): { point: Vec2; direct: boolean; reachable: boolean } {
  if (lineClear(from, target, barriers, pad)) return { point: target, direct: true, reachable: true }
  const tp = caps?.teleport
  const g = visGraphFor(barriers, pad)
  const m = g.nodes.length
  // Node indexing mirrors the pre-cache implementation exactly:
  // 0 = from, 1..m = barrier corners, T = m+1 = target.
  const n = m + 2
  const T = n - 1
  const usable = g.usable
  // Per-call edges. from→corner and corner→target only (node 0 settles first,
  // so no relaxation ever runs corner→from; the loop breaks when target
  // settles, so no target→corner). from→target is known false here — the
  // beeline early-out above already failed. from-edges are eager (the step-0
  // relaxation touches every usable corner anyway); target-edges are LAZY —
  // the original only ever tested corners that actually settled before the
  // target, so the memo reproduces exactly those calls.
  const fromClear = new Uint8Array(m)
  for (let i = 0; i < m; i++) {
    if (usable[i]) fromClear[i] = lineClear(from, g.nodes[i], barriers, pad) ? 1 : 0
  }
  const toClear = new Int8Array(m).fill(-1)

  // Dijkstra — same structure, selection order, and tie-breaks as before; all
  // geometry now reads from the cache instead of recomputing.
  const dArr = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const seen = new Array(n).fill(false)
  dArr[0] = 0
  for (let step = 0; step < n; step++) {
    let u = -1, bu = Infinity
    for (let v = 0; v < n; v++) if (!seen[v] && dArr[v] < bu) { bu = dArr[v]; u = v }
    if (u < 0 || u === T) break
    seen[u] = true
    for (let v = 1; v < n; v++) {   // v=0 is settled at step 0; original skipped it via `seen`
      if (seen[v]) continue
      if (v !== T && !usable[v - 1]) continue
      let ok: number
      if (v === T) {
        if (u === 0) ok = 0
        else {
          ok = toClear[u - 1]
          if (ok < 0) ok = toClear[u - 1] = lineClear(g.nodes[u - 1], target, barriers, pad) ? 1 : 0
        }
      } else {
        ok = u === 0 ? fromClear[v - 1] : g.clear[(u - 1) * m + (v - 1)]
      }
      if (!ok) {
        // §blink capability edge: no walkable line, but a teleport can bridge
        // the pair. Walls veto a LoS-gated jump; cliffs never block.
        if (!tp) continue
        const pu = u === 0 ? from : g.nodes[u - 1]
        const pv = v === T ? target : g.nodes[v - 1]
        if (dist(pu, pv) > tp.range) continue
        if (tp.needsLoS && !sightlineClear(pu, pv, barriers, pad)) continue
      }
      // Small left-side surcharge on intermediate corners → consistent herding
      // for near-tie detours (true shortcuts on the left still win).
      const bias = v !== T ? g.bias[v - 1] : 0
      const dd = u === 0
        ? dist(from, g.nodes[v - 1])
        : v === T ? dist(g.nodes[u - 1], target) : g.dist[(u - 1) * m + (v - 1)]
      const nd = dArr[u] + dd + bias
      if (nd < dArr[v]) { dArr[v] = nd; prev[v] = u }
    }
  }
  // No route through the *known* terrain → the target is unreachable. Report it
  // so movement can give up (hold) instead of grinding into a wall. "Known"
  // means: routes around the full barrier set passed in — so a future "walk on
  // lava" party buff that drops some barriers from the set makes the same target
  // reachable again, dynamically, with no special-casing here.
  if (dArr[T] === Infinity) return { point: target, direct: false, reachable: false }

  // Walk the path forward and take the first hop that isn't right under our feet
  // (so a unit already standing on a corner advances to the next one).
  const path: number[] = []
  for (let cur = T; cur !== -1; cur = prev[cur]) path.push(cur)
  path.reverse()
  // Corners come back as COPIES — the cached graph must never leak a mutable
  // alias (from/target pass through as-is, exactly like the pre-cache code).
  const at = (i: number): Vec2 => (i === 0 ? from : i === T ? target : { x: g.nodes[i - 1].x, y: g.nodes[i - 1].y })
  let hop = 1
  while (hop < path.length - 1 && dist(at(path[hop]), from) < 0.6) hop++
  return { point: at(path[hop]), direct: path[hop] === T, reachable: true }
}

// Is `target` reachable from `from` given the *known* terrain (`barriers`)?
// Thin wrapper over steerAround's reachability — used to (a) make a unit give up
// on an impossible target, and (b) pick only reachable roam waypoints. Dynamic:
// pass a reduced barrier set (e.g. lava-immune party) and more becomes reachable.
export function canReach(from: Vec2, target: Vec2, barriers: Barrier[], pad = UNIT_PAD, caps?: MoveCaps): boolean {
  return steerAround(from, target, barriers, pad, caps).reachable
}

// §coordination M3 anchor pick (tactical-coordination.md §3.1/§3.4): the SAME
// per-battle-cached corner nodes steerAround already routes through, reused
// as anchor candidates — so "stand at the gap" needs no new pathfinding, just
// a nearest-usable-corner scan over geometry that's already baked (VIS_CACHE
// above). Read-only: callers get copies (nodes are re-packed), never the
// cached graph's own arrays.
export function barrierCorners(barriers: Barrier[], pad = UNIT_PAD): Vec2[] {
  if (barriers.length === 0) return []
  const g = visGraphFor(barriers, pad)
  const out: Vec2[] = []
  for (let i = 0; i < g.nodes.length; i++) {
    if (g.usable[i]) out.push({ x: g.nodes[i].x, y: g.nodes[i].y })
  }
  return out
}

// Default arena terrain: a central cross ('+') that the teams fight around. The
// bars stop short of the deploy lines and leave wide perimeter corridors, so
// there's always a way around. Centered on a COLS×ROWS grid.
export function arenaBarriers(): Barrier[] {
  const cx = COLS / 2, cy = ROWS / 2
  const arm = DEPLOY_FRONT - 1.5   // reach toward (but stop short of) the deploy lines
  const half = 0.75                // bar half-thickness
  return [
    { x: cx - half, y: cy - arm, w: half * 2, h: arm * 2, kind: 'wall' }, // vertical bar
    { x: cx - arm, y: cy - half, w: arm * 2, h: half * 2, kind: 'wall' }, // horizontal bar
  ]
}
