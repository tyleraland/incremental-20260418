// Combat plan-layer tuning (movement-action-coupling.md §levers).
//
// TWO kinds of lever live here, deliberately together so a browser-tuning
// pass greps ONE file:
//
//  1. Global knobs — engine-wide feel constants the plan layer reads. Marked
//     ⏱ when they should be re-reviewed against real gameplay (the numbers
//     were chosen analytically, not by play).
//  2. The POSTURE table — the player-facing behavior dial. A posture is a
//     named ROW of policy weights; every plan-layer scorer reads its
//     coefficients through `postureOf`. This is the seam future high-level
//     priorities plug into: a new consideration (objective pressure, loot
//     greed, formation cohesion…) is a new COLUMN with a value per posture,
//     not a new mechanism. Keep entries coarse and legible — three named
//     stances a player can reason about beat seven sliders nobody touches.
//
// Determinism: everything here is plain data read at decision time — no state,
// no RNG. Changing a value changes behavior (and therefore replays of NEW
// battles); serialized battles carry each combatant's posture id, not the
// weights, so re-tuning a row intentionally re-tunes live saves too.

import type { Combatant, Posture } from './types'

// ── Global knobs ─────────────────────────────────────────────────────────────

// Kite/hold candidate scoring (plan.ts scoreCandidate).
export const KITE_DEAD_BAND = 0.4  //   flat top of the ring-distance penalty AND kiteToward's hold band — one number so they can't drift apart
export const GAP_W = 1             // ⏱ pull toward the preferred ring, per cell off it
// Corridor pricing (M3).
export const CORRIDOR_MAX_SAMPLES = 40
export const TRAVEL_CLEAR_EXIT = 0.6   // ⏱ resume marching once the corridor costs < budget × this (hysteresis width)
// Blink escape (M4).
export const BLINK_SAMPLES = 16
export const BLINK_WALK_MIN = 0.4      // ⏱ retreat must open at least this fraction of a step, else "cornered"

// ── Postures (the player's behavior dial) ────────────────────────────────────
//
//   bold   — damage first: ignores incidental exposure, forces expensive
//            corridors, saves Blink for genuinely hopeless corners.
//   steady — the shipped defaults; every pre-posture battle replays as steady.
//   wary   — safety first: stands off from extra threats, refuses corridors a
//            steady unit would force, blinks out early.
//
// Columns (all read via postureOf):
//   exposureW    — candidate-scoring penalty per point of per-round exposure
//                  (⏱ small by design: a kiter's job is to fight from inside
//                  its own range, not to hide)
//   travelBudget — fraction of CURRENT hp spendable forcing a corridor before
//                  clear-first kicks in (⏱ the M3 headline number)
//   blinkGain    — cells the best landing must open the nearest-threat gap by
//                  before a cornered unit spends its teleport (⏱)
export interface PostureRow {
  exposureW: number
  travelBudget: number
  blinkGain: number
}
export const POSTURES: Record<Posture, PostureRow> = {
  bold:   { exposureW: 0,    travelBudget: 0.5,  blinkGain: 3 },
  steady: { exposureW: 0.05, travelBudget: 0.35, blinkGain: 2 },
  wary:   { exposureW: 0.2,  travelBudget: 0.2,  blinkGain: 1.5 },
}

// A combatant's policy row. Legacy snapshots and units that never set a
// posture read as 'steady' — byte-identical to pre-posture behavior.
export function postureOf(c: Combatant): PostureRow {
  return POSTURES[c.posture ?? 'steady']
}
