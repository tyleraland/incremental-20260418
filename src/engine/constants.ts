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

// Starting Y as rows from a team's OWN edge. Everyone deploys close to their
// edge (far bottom for players, far top for enemies) and advances toward the
// center; melee (front) starts a touch ahead, ranged/support (back) sits at the
// very rear. NOTE: this is intentionally tighter than the §2.3 zone bands —
// zones classify a unit's *current* position mid-fight; this is just the deploy.
export const RANK_START_Y = { front: 1.7, mid: 1.1, back: 0.5 } as const

// Column order from center outward (for COLS=5), so a formation deploys around
// the middle column rather than hugging the left edge.
export const CENTERED_COLS = [2, 1, 3, 0, 4] as const

export const EPS = 1e-6
