// Combat Tactic Engine — spatial model (spec §2).
// Continuous 2D space on a 5×10 logical grid. Euclidean distance only.

import {
  COLS, ROWS, SEPARATION, FRONT_ROWS, MID_ROWS,
  PERIMETER_LEFT, PERIMETER_RIGHT, RANK_START_Y, EPS,
} from './constants'
import type { Vec2, Rank, Team, Combatant } from './types'

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function clampToGrid(p: Vec2): Vec2 {
  return {
    x: Math.min(COLS, Math.max(0, p.x)),
    y: Math.min(ROWS, Math.max(0, p.y)),
  }
}

// §2.3 a unit's rank is derived from its *current* Y relative to its team edge,
// so a retreating front-liner can become "back rank" mid-fight.
export function rowsFromEdge(team: Team, y: number): number {
  return team === 'player' ? y : ROWS - y
}

export function rankOf(c: Combatant): Rank {
  const r = rowsFromEdge(c.team, c.pos.y)
  if (r <= FRONT_ROWS) return 'front'
  if (r <= MID_ROWS) return 'mid'
  return 'back'
}

export function isPerimeter(p: Vec2): boolean {
  return p.x < PERIMETER_LEFT || p.x > PERIMETER_RIGHT
}

// Starting position: players spread across columns at their rank distance from
// the bottom edge (y small); enemies mirror from the top edge (y large).
export function startingPosition(team: Team, rank: Rank, columnIndex: number): Vec2 {
  const rankY = RANK_START_Y[rank]
  const y = team === 'player' ? rankY : ROWS - rankY
  return clampToGrid({ x: (columnIndex % COLS) + 0.5, y })
}

// Reach used for the unit's basic attack and as its melee stop distance.
export function attackReach(c: Combatant): number {
  return c.rangedRange > 0 ? c.rangedRange : c.meleeRange
}

// Move `mover` toward `target`, stopping `reach` units short so melee attackers
// don't stand on top of their target (§2.4). Returns true if the position
// changed. Enforces minimum separation against all other living combatants.
export function moveToward(
  mover: Combatant,
  target: Combatant,
  speed: number,
  all: Combatant[],
): boolean {
  const reach = attackReach(mover)
  const d = distance(mover.pos, target.pos)
  if (d <= reach + EPS) return false   // already in range; hold position

  const ux = (target.pos.x - mover.pos.x) / d
  const uy = (target.pos.y - mover.pos.y) / d
  const step = Math.min(speed, d - reach)
  const before = mover.pos
  mover.pos = clampToGrid({ x: mover.pos.x + ux * step, y: mover.pos.y + uy * step })
  enforceSeparation(mover, all)
  return mover.pos.x !== before.x || mover.pos.y !== before.y
}

// §2.4 when a move would put two units closer than SEPARATION, push both apart
// along the axis between them. Deterministic: `all` is iterated in stable order.
export function enforceSeparation(mover: Combatant, all: Combatant[]): void {
  for (const other of all) {
    if (other === mover || !other.alive) continue
    let dx = mover.pos.x - other.pos.x
    let dy = mover.pos.y - other.pos.y
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d >= SEPARATION - EPS) continue
    if (d < EPS) {
      // Exactly overlapping: separate along a deterministic axis (by index).
      dx = mover.index < other.index ? -1 : 1
      dy = 0
      d = 1
    }
    const overlap = (SEPARATION - d) / 2
    const ux = dx / d
    const uy = dy / d
    mover.pos = clampToGrid({ x: mover.pos.x + ux * overlap, y: mover.pos.y + uy * overlap })
    other.pos = clampToGrid({ x: other.pos.x - ux * overlap, y: other.pos.y - uy * overlap })
  }
}
