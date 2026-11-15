// Firewall geometry (§firewall) — pure helpers shared by the engine (collision +
// bounce) and the skill tactics (a kiter reads "am I safe behind my flame?").
// No engine imports, so both can use it without a cycle.

import { EPS } from './constants'
import type { FireWall, Vec2, Team } from './types'

// The four snapped orientations a wall can take: its normal is rounded to the
// nearest 45°, so the line itself is one of  _  |  /  \  — never an odd angle.
export function snapNormal(dx: number, dy: number): Vec2 {
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: Math.cos(a), y: Math.sin(a) }
}

// Where a straight move from→to crosses a wall's finite line (and which side it
// started on, +1/−1 along the normal) — or null if it misses the wall.
export function wallCrossing(w: FireWall, from: Vec2, to: Vec2, thick: number): { hx: number; hy: number; side: number } | null {
  const sFrom = (from.x - w.pos.x) * w.normal.x + (from.y - w.pos.y) * w.normal.y
  const sTo = (to.x - w.pos.x) * w.normal.x + (to.y - w.pos.y) * w.normal.y
  const crossed = (sFrom > 0) !== (sTo > 0)
  const enteredSlab = Math.abs(sTo) <= thick && Math.abs(sFrom) > thick
  if (!crossed && !enteredSlab) return null
  const denom = sFrom - sTo
  const t = Math.abs(denom) > EPS ? sFrom / denom : 0
  const hx = from.x + (to.x - from.x) * t
  const hy = from.y + (to.y - from.y) * t
  // distance along the wall's tangent (−ny, nx) from its centre — must be within half-length
  const along = (hx - w.pos.x) * -w.normal.y + (hy - w.pos.y) * w.normal.x
  if (Math.abs(along) > w.half) return null
  return { hx, hy, side: sFrom >= 0 ? 1 : -1 }
}

// Would moving `team` from→to be blocked by a live wall it hasn't yet broken
// through? Lets a kiter tell it's protected (hold + blast instead of fleeing).
export function firewallBlocks(walls: FireWall[], team: Team, unitId: string, from: Vec2, to: Vec2, thick = 0.35): boolean {
  for (const w of walls) {
    if (w.blockTeam !== team) continue
    if ((w.bumps[unitId] ?? 0) >= w.maxBumps) continue
    if (wallCrossing(w, from, to, thick)) return true
  }
  return false
}
