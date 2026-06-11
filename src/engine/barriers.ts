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
import { arenaClamp } from './arena'
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

// Clamp to the active arena (15×15 by default; larger for open-world battles).
const clamp = (p: Vec2): Vec2 => arenaClamp(p)
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
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (pointBlocked(barriers, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, pad)) return false
  }
  return true
}

export function sightlineClear(from: Vec2, to: Vec2, barriers: Barrier[], pad = UNIT_PAD): boolean {
  // walls block sight; cliffs don't — let ranged shoot over them.
  const walls = barriers.filter((b) => (b.kind ?? 'wall') === 'wall')
  return lineClear(from, to, walls, pad)
}

// Proper navigation around terrain: a Dijkstra shortest path on the visibility
// graph (from + target + barrier corners), so a unit picks the route with the
// shortest total detour instead of just the locally-cheapest next corner. Pure
// per-call (memory-less, recomputed each round) — when the line is clear, beeline.
export function steerAround(from: Vec2, target: Vec2, barriers: Barrier[], pad = UNIT_PAD): { point: Vec2; direct: boolean; reachable: boolean } {
  if (lineClear(from, target, barriers, pad)) return { point: target, direct: true, reachable: true }
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
  let hop = 1
  while (hop < path.length - 1 && dist(nodes[path[hop]], from) < 0.6) hop++
  return { point: nodes[path[hop]], direct: path[hop] === T, reachable: true }
}

// Is `target` reachable from `from` given the *known* terrain (`barriers`)?
// Thin wrapper over steerAround's reachability — used to (a) make a unit give up
// on an impossible target, and (b) pick only reachable roam waypoints. Dynamic:
// pass a reduced barrier set (e.g. lava-immune party) and more becomes reachable.
export function canReach(from: Vec2, target: Vec2, barriers: Barrier[], pad = UNIT_PAD): boolean {
  return steerAround(from, target, barriers, pad).reachable
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
