// Combat Tactic Engine — spatial hash (neighbour queries).
//
// The per-round hot paths — separation (every unit vs every other) and target
// acquisition (`visibleEnemiesOf`, called many times per unit) — are O(N²). At a
// handful of combatants that's nothing; at hundreds (open-world hordes, multiple
// parties) it dominates. A uniform grid buckets combatants by cell so a query only
// scans the buckets overlapping its radius — O(local) instead of O(N).
//
// PURE OPTIMISATION. The engine is deterministic (snapshot replay is 1:1, tests
// assert exact positions), so this must return the EXACT same neighbour set as a
// brute-force scan, in the SAME order. Two guarantees make that hold:
//   • `near` over-scans by SPATIAL_MARGIN and the caller re-filters by *live*
//     distance — the hash buckets round-start positions, but a unit moves at most a
//     few cells in a round, so the margin guarantees no in-range unit is missed;
//     the live re-filter drops the extras. → identical SET.
//   • `near` returns candidates sorted by their `state.combatants` array index, so
//     iterating them matches a brute-force `for (const c of state.combatants)`. →
//     identical ORDER (separation mutates as it goes, so order matters).
//
// The active hash is an ambient (like arena/timescale), set for the duration of a
// round in `advanceRound` and cleared after. A query only uses it when it was
// built for the SAME combatants array (`spatialHashFor`), so a stale/foreign hash
// (tests calling helpers directly, between-round spawns) safely falls back to
// brute force — which is byte-identical anyway.

import type { Combatant, Vec2 } from './types'

// Cell width and the over-scan margin (≥ the most a unit can move in one round:
// move × retreat-boost, knockback, barrier-escape — all a few cells). Larger is
// always safe (just scans more); too small would miss a just-moved unit.
export const SPATIAL_CELL = 8
export const SPATIAL_MARGIN = 8

// Pack signed cell coords into one number (grids are small; offset avoids
// negative-coordinate key collisions).
const keyOf = (cx: number, cy: number): number => (cx + 4096) * 8192 + (cy + 4096)

export class SpatialHash {
  readonly combatants: Combatant[]
  private readonly cell: number
  private readonly buckets = new Map<number, { i: number; c: Combatant }[]>()

  constructor(combatants: Combatant[], cell = SPATIAL_CELL) {
    this.combatants = combatants
    this.cell = cell
    for (let i = 0; i < combatants.length; i++) {
      const c = combatants[i]
      if (!c.alive) continue
      const k = keyOf(Math.floor(c.pos.x / cell), Math.floor(c.pos.y / cell))
      const arr = this.buckets.get(k)
      if (arr) arr.push({ i, c }); else this.buckets.set(k, [{ i, c }])
    }
  }

  // Alive combatants whose bucket overlaps [pos ± radius], in array-index order.
  near(pos: Vec2, radius: number): Combatant[] {
    const cell = this.cell
    const minx = Math.floor((pos.x - radius) / cell), maxx = Math.floor((pos.x + radius) / cell)
    const miny = Math.floor((pos.y - radius) / cell), maxy = Math.floor((pos.y + radius) / cell)
    const out: { i: number; c: Combatant }[] = []
    for (let cx = minx; cx <= maxx; cx++) {
      for (let cy = miny; cy <= maxy; cy++) {
        const arr = this.buckets.get(keyOf(cx, cy))
        if (arr) for (const e of arr) out.push(e)
      }
    }
    out.sort((a, b) => a.i - b.i)
    return out.map((e) => e.c)
  }
}

let active: SpatialHash | null = null
export function setSpatialHash(h: SpatialHash | null): void { active = h }
// The active hash IFF it was built for this exact combatants array; else null
// (caller falls back to brute force — same result).
export function spatialHashFor(combatants: Combatant[]): SpatialHash | null {
  return active && active.combatants === combatants ? active : null
}
