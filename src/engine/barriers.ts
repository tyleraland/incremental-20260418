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

// Memory-less navigation: a waypoint to head for on the way to `target`. If the
// straight line is clear, go direct. Otherwise aim at the reachable barrier
// corner that gives the shortest detour (from→corner→target). Recomputed every
// round, so a unit rounds the corner, regains line of sight, then beelines —
// without remembering anything (the §spatial "maintain line of sight" approach).
export function steerAround(from: Vec2, target: Vec2, barriers: Barrier[], pad = UNIT_PAD): { point: Vec2; direct: boolean } {
  if (lineClear(from, target, barriers, pad)) return { point: target, direct: true }
  const off = pad + 0.3
  let best: Vec2 | null = null
  let bestCost = Infinity
  for (const b of barriers) {
    const corners = [
      { x: b.x - off, y: b.y - off }, { x: b.x + b.w + off, y: b.y - off },
      { x: b.x - off, y: b.y + b.h + off }, { x: b.x + b.w + off, y: b.y + b.h + off },
    ]
    for (const raw of corners) {
      const c = clamp(raw)
      if (dist(from, c) < 0.6) continue                 // already at this corner — don't pick "stay put"
      if (pointBlocked(barriers, c, pad)) continue      // corner sits inside other terrain
      if (!lineClear(from, c, barriers, pad)) continue   // can't reach it without crossing a wall
      const cost = dist(from, c) + dist(c, target)
      if (cost < bestCost - EPS) { bestCost = cost; best = c }
    }
  }
  return best ? { point: best, direct: false } : { point: target, direct: false }
}

// Default arena terrain: a central cross ('+') that the teams fight around. The
// bars stop short of the deploy lines and leave wide perimeter corridors, so
// there's always a way around. Centered on a COLS×ROWS grid.
export function arenaBarriers(): Barrier[] {
  const cx = COLS / 2, cy = ROWS / 2
  const arm = DEPLOY_FRONT - 2   // reach toward (but stop short of) the deploy lines
  const half = 1.5               // bar half-thickness
  return [
    { x: cx - half, y: cy - arm, w: half * 2, h: arm * 2 }, // vertical bar
    { x: cx - arm, y: cy - half, w: arm * 2, h: half * 2 }, // horizontal bar
  ]
}
