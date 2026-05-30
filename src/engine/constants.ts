// Combat Tactic Engine — spatial & resolution constants (spec §2, §9).
// The engine is fully self-contained: it does not import game state, time, or
// stats. All numbers here are in *grid units*, not the game's feet.

export const COLS = 15           // §2.1 grid columns (x ∈ [0, COLS])
export const ROWS = 15           // §2.1 grid rows    (y ∈ [0, ROWS])

export const BASE_MOVE_SPEED = 0.9   // §2.5 grid units per round
export const SEPARATION = 0.7        // §2.4 minimum distance between two units
export const MAX_ROUNDS = 200        // §9.2 draw if unresolved by this round

// §3 "sneak attack" / ambush: a strike made from stealth lands for +25% extra
// damage. Back Stab's own `stealthBonus` multiplies on top of this. A future
// Sneak Attack skill would scale this base further (see BACKLOG).
export const STEALTH_ATTACK_BONUS = 0.25

// §2.3 rank zones, measured as rows from a team's own edge (used by rankOf, a
// query helper; combat behaviour doesn't read ranks).
export const FRONT_ROWS = 3          // ranks 0–3 = front
export const MID_ROWS = 7            // 4–7 = mid; 8+ = back
export const PERIMETER_LEFT = 2      // x < this  → perimeter
export const PERIMETER_RIGHT = 13    // x > this  → perimeter

// Deploy model: teams form up a fixed distance from the arena center (not at the
// far edges), leaving open ground behind to maneuver/retreat and room in the
// middle for terrain. Deeper ranks fall back toward their own edge.
export const DEPLOY_FRONT = 5.5                                // front rank's distance from center
export const RANK_SETBACK = { front: 0, mid: 0.8, back: 1.6 } as const

// When a rank holds more units than there are columns, extra units stack into
// deeper rows this far apart (≥ SEPARATION so they don't start overlapping).
export const FORMATION_ROW_STEP = 0.8

export const EPS = 1e-6

// §open-world wander (only consulted when BattleState.mode === 'open'). Heroes
// roam toward a shared team waypoint, re-picking it when they get within
// WANDER_REPATH of it. Idle monsters lurk MONSTER_WANDER_MIN..MAX rounds, then
// hop a short MONSTER_WANDER_NEAR..FAR distance to a new local spot.
export const WANDER_REPATH = 4
export const MONSTER_WANDER_MIN = 5
export const MONSTER_WANDER_MAX = 10
export const MONSTER_WANDER_NEAR = 5
export const MONSTER_WANDER_FAR = 8
// Roaming is *travel*, not combat: heroes cross the (large) open-world map at a
// brisk multiple of their combat move speed, so a 100-cell field isn't a crawl.
// Combat movement (once a target is locked) stays at the tuned base speed.
export const WANDER_SPEED_MULT = 4
// Keep wander targets (hero waypoints, monster hops, scatter) this far inside
// the map edges, so units roam the interior instead of pinning to the perimeter
// and piling up in corners.
export const WANDER_MARGIN = 12
export const MONSTER_EDGE_MARGIN = 4
