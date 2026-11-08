// Combat Tactic Engine — active arena bounds.
//
// The grid is normally COLS×ROWS (15×15), but open-world battles run on a much
// larger field (e.g. 50×50) carried per-battle on `BattleState.cols/rows`.
// Spatial helpers (clamp/trace/slide) need those bounds, but threading them
// through every signature would be a deep refactor. Instead, since the engine
// processes exactly one battle at a time, synchronously, each engine entry point
// (`createBattle`, `addCombatant`, `advanceRound`) sets the active bounds up
// front and every clamp reads them here. Defaults to the standard arena so any
// code path that forgets to set bounds behaves exactly as before.
//
// Leaf module (constants + types only) so barriers.ts / grid.ts can import it
// without a cycle.

import { COLS, ROWS } from './constants'
import type { Vec2 } from './types'

let activeCols = COLS
let activeRows = ROWS

export function setArenaBounds(cols: number, rows: number): void {
  activeCols = cols
  activeRows = rows
}

export function arenaCols(): number { return activeCols }
export function arenaRows(): number { return activeRows }

export function arenaClamp(p: Vec2): Vec2 {
  return {
    x: Math.min(activeCols, Math.max(0, p.x)),
    y: Math.min(activeRows, Math.max(0, p.y)),
  }
}
