// Combat Tactic Engine — spatial & resolution constants (spec §2, §9).
// The engine is fully self-contained: it does not import game state, time, or
// stats. All numbers here are in *grid units*, not the game's feet.

export const COLS = 30           // §2.1 grid columns (x ∈ [0, COLS]) — large arena
export const ROWS = 30           // §2.1 grid rows    (y ∈ [0, ROWS])

export const BASE_MOVE_SPEED = 0.9   // §2.5 grid units per round
export const SEPARATION = 0.7        // §2.4 minimum distance between two units
export const MAX_ROUNDS = 80         // §9.2 draw if unresolved by this round

// §2.3 rank zones, measured as rows from a team's own edge (used by rankOf, a
// query helper; combat behaviour doesn't read ranks).
export const FRONT_ROWS = 6          // ranks 0–6 = front
export const MID_ROWS = 12           // 7–12 = mid; 13+ = back
export const PERIMETER_LEFT = 4      // x < this  → perimeter
export const PERIMETER_RIGHT = 26    // x > this  → perimeter

// Deploy model: teams form up a fixed distance from the arena center (not at the
// far edges), leaving open ground behind to maneuver/retreat and room in the
// middle for terrain. Deeper ranks fall back toward their own edge.
export const DEPLOY_FRONT = 7                                  // front rank's distance from center
export const RANK_SETBACK = { front: 0, mid: 1.6, back: 3.2 } as const

// When a rank holds more units than there are columns, extra units stack into
// deeper rows this far apart (≥ SEPARATION so they don't start overlapping).
export const FORMATION_ROW_STEP = 0.9

export const EPS = 1e-6
