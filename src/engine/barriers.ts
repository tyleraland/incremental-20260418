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
import type { Vec2, Barrier } from './types'

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

const clamp = (p: Vec2): Vec2 => ({ x: Math.min(COLS, Math.max(0, p.x)), y: Math.min(ROWS, Math.max(0, p.y)) })
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

// Farthest point from `from` toward `to` that isn't inside a barrier — i.e. stop
// up against the wall. Samples the segment so a fast move can't tunnel through.
export function traceMove(from: Vec2, to: Vec2, barriers: Barrier[], pad = UNIT_PAD): Vec2 {
  to = clamp(to)
  if (barriers.length === 0) return to
  const d = dist(from, to)
  if (d < EPS) return from
  const steps = Math.max(1, Math.ceil(d / 0.2))
  let last = from
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    if (pointBlocked(barriers, p, pad)) return last
    last = p
  }
  return to
}

// Move toward `desired`; if blocked right away, slide along the wall by trying the
// four cardinal directions and taking the free one that ends nearest the goal.
export function slideMove(from: Vec2, desired: Vec2, barriers: Barrier[], pad = UNIT_PAD): Vec2 {
  const direct = traceMove(from, desired, barriers, pad)
  if (dist(from, direct) > 0.05) return direct        // made progress straight on
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

// True if the straight segment from→to crosses no barrier (line of sight / a
// clear walk). Samples the segment.
export function lineClear(from: Vec2, to: Vec2, barriers: Barrier[], pad = UNIT_PAD): boolean {
  if (barriers.length === 0) return true
  const d = dist(from, to)
  if (d < EPS) return true
  const steps = Math.max(1, Math.ceil(d / 0.2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (pointBlocked(barriers, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, pad)) return false
  }
  return true
}

// Proper navigation around terrain: a Dijkstra shortest path on the visibility
// graph (from + target + barrier corners), so a unit picks the route with the
// shortest total detour instead of just the locally-cheapest next corner. Pure
// per-call (memory-less, recomputed each round) — when the line is clear, beeline.
export function steerAround(from: Vec2, target: Vec2, barriers: Barrier[], pad = UNIT_PAD): { point: Vec2; direct: boolean } {
  if (lineClear(from, target, barriers, pad)) return { point: target, direct: true }
  const off = pad + 0.3
  // Build node graph: 0 = from, last = target, middle = barrier corners.
  const nodes: Vec2[] = [from]
  for (const b of barriers) {
    nodes.push(clamp({ x: b.x - off, y: b.y - off }))
    nodes.push(clamp({ x: b.x + b.w + off, y: b.y - off }))
    nodes.push(clamp({ x: b.x - off, y: b.y + b.h + off }))
    nodes.push(clamp({ x: b.x + b.w + off, y: b.y + b.h + off }))
  }
  nodes.push(target)
  const n = nodes.length
  const T = n - 1
  // Corners that fall inside another barrier are unusable hops.
  const usable = new Array(n).fill(true)
  for (let i = 1; i < T; i++) if (pointBlocked(barriers, nodes[i], pad)) usable[i] = false

  // Dijkstra (small graph: ~4 corners per barrier + from + target).
  const dArr = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const seen = new Array(n).fill(false)
  dArr[0] = 0
  for (let step = 0; step < n; step++) {
    let u = -1, bu = Infinity
    for (let v = 0; v < n; v++) if (!seen[v] && dArr[v] < bu) { bu = dArr[v]; u = v }
    if (u < 0 || u === T) break
    seen[u] = true
    const cx = COLS / 2
    for (let v = 0; v < n; v++) {
      if (seen[v] || !usable[v]) continue
      if (!lineClear(nodes[u], nodes[v], barriers, pad)) continue
      // Small left-side surcharge on intermediate corners → consistent herding
      // for near-tie detours (true shortcuts on the left still win).
      const bias = v !== 0 && v !== T && nodes[v].x < cx ? HERD_BIAS : 0
      const nd = dArr[u] + dist(nodes[u], nodes[v]) + bias
      if (nd < dArr[v]) { dArr[v] = nd; prev[v] = u }
    }
  }
  if (dArr[T] === Infinity) return { point: target, direct: false }

  // Walk the path forward and take the first hop that isn't right under our feet
  // (so a unit already standing on a corner advances to the next one).
  const path: number[] = []
  for (let cur = T; cur !== -1; cur = prev[cur]) path.push(cur)
  path.reverse()
  let hop = 1
  while (hop < path.length - 1 && dist(nodes[path[hop]], from) < 0.6) hop++
  return { point: nodes[path[hop]], direct: path[hop] === T }
}

// Default arena terrain: a central cross ('+') that the teams fight around. The
// bars stop short of the deploy lines and leave wide perimeter corridors, so
// there's always a way around. Centered on a COLS×ROWS grid.
export function arenaBarriers(): Barrier[] {
  const cx = COLS / 2, cy = ROWS / 2
  const arm = DEPLOY_FRONT - 1.5   // reach toward (but stop short of) the deploy lines
  const half = 0.75                // bar half-thickness
  return [
    { x: cx - half, y: cy - arm, w: half * 2, h: arm * 2 }, // vertical bar
    { x: cx - arm, y: cy - half, w: arm * 2, h: half * 2 }, // horizontal bar
  ]
}
