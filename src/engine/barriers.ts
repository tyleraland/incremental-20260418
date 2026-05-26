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
