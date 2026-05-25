// Combat Tactic Engine — spatial & resolution constants (spec §2, §9).
// The engine is fully self-contained: it does not import game state, time, or
// stats. All numbers here are in *grid units*, not the game's feet.

export const COLS = 5            // §2.1 grid columns (x ∈ [0, COLS])
export const ROWS = 10           // §2.1 grid rows    (y ∈ [0, ROWS])

export const BASE_MOVE_SPEED = 0.6   // §2.5 grid units per round
export const SEPARATION = 0.7        // §2.4 minimum distance between two units
export const MAX_ROUNDS = 40         // §9.2 draw if unresolved by this round

// §2.3 zones, measured as rows from a team's own edge.
export const FRONT_ROWS = 2          // ranks 0–2 = front
export const MID_ROWS = 5            // ranks 3–5 = mid; 6+ = back
export const PERIMETER_LEFT = 0.8    // x < this  → perimeter
export const PERIMETER_RIGHT = 4.2   // x > this  → perimeter

// Default starting Y (rows from the team's edge) by preferred rank.
export const RANK_START_Y = { front: 1.5, mid: 4, back: 7 } as const

export const EPS = 1e-6
