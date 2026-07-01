// Combat Tactic Engine — spatial & resolution constants (spec §2, §9).
// The engine is fully self-contained: it does not import game state, time, or
// stats. All numbers here are in *grid units*, not the game's feet.

export const COLS = 15           // §2.1 grid columns (x ∈ [0, COLS])
export const ROWS = 15           // §2.1 grid rows    (y ∈ [0, ROWS])

export const BASE_MOVE_SPEED = 0.9   // §2.5 grid units per round
export const SEPARATION = 0.7        // §2.4 minimum distance between two (mobile) units
// Wider standoff a mover keeps from an IMMOVABLE unit — a neutral town NPC or any
// immobile combatant (moveSpeed 0, e.g. a rooted caster like a Living Nightshade).
// Just above a rendered token (~0.9 cell) so an attacker stops clear of (not on
// top of) a stationary foe, yet below the smallest melee reach in play so it never
// shoves an attacker out of its own attack range. See enforceSeparation.
export const IMMOVABLE_CLEARANCE = 1.0
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

// §basic-attack cadence. Basic attacks are paced by the unit's attackSpeed (the
// engine's `spd`), expressed as an interval in *logical rounds* between swings.
// REF_ATTACK_SPD is the "normal" speed that swings every logical round — the
// historical once-per-logical-round cap, so a basic attack never goes *faster*
// than that (finer time-scaling can't multiply hits). A slower attacker waits
// proportionally longer: interval = round(REF / spd), clamped to [1, MAX]. At
// spd ≥ ~7 this is 1 (every logical round) so heroes (attackSpeed 8–18) and fast
// monsters are unchanged; only genuinely slow attackers swing less often. Skills
// are paced by their own cooldowns and are NOT gated by this. Stateless & pure
// (a function of round + index + spd), so it adds no snapshot field and replays 1:1.
export const REF_ATTACK_SPD = 10
export const MAX_ATTACK_INTERVAL = 4

// §multi-attack (PROTOTYPE, agility-driven extra swings). The historical cap is
// ONE basic attack per logical round — a unit at REF_ATTACK_SPD swings once/round
// and any faster attackSpeed (agility) is wasted for cadence. This decouples that:
// a unit gets `floor(spd / REF_ATTACK_SPD)` basic attacks per LOGICAL round,
// clamped to [1, MULTI_ATTACK_MAX]. So spd 10→1, 20→2, 30→3, 40→4, 50+→5 swings.
// The swings are spread across the logical round's finer engine sub-rounds when
// timeScale allows (so they read as separate hits), and bunch onto one engine
// round otherwise — the per-logical-round total is `perRound` at ANY timeScale,
// preserving the real-time pace invariance the timescale module guarantees.
//
// PROTOTYPE ENABLED at 8 (agility can grant up to 8 basic swings/logical round).
// The LIVE game opts in: the store passes this to createBattle. The engine itself
// defaults to 1 (disabled) when multiAttackMax is unset, so the engine test suite and
// snapshot replays stay byte-identical. Set to 1 here to turn the feature off in-game.
export const MULTI_ATTACK_MAX = 8

// §open-world wander (only consulted when BattleState.mode === 'open'). Heroes
// roam toward a shared team waypoint, re-picking it when they get within
// WANDER_REPATH of it. Idle monsters lurk MONSTER_WANDER_MIN..MAX rounds, then
// hop a short MONSTER_WANDER_NEAR..FAR distance to a new local spot.
export const WANDER_REPATH = 4
// §hunt retention hysteresis. A party acquires prey within vision, but RETAINS a
// committed hunt target out to this multiple of vision. Marching AROUND terrain to
// reach a foe briefly opens the gap past vision; without hysteresis the hunter
// drops the target the instant it crosses the sight line and oscillates at the
// boundary instead of rounding the wall. Acquisition still needs a fresh 1× sighting.
export const HUNT_RETAIN_MULT = 1.4
export const MONSTER_WANDER_MIN = 5
export const MONSTER_WANDER_MAX = 10
export const MONSTER_WANDER_NEAR = 5
export const MONSTER_WANDER_FAR = 8
// Roaming uses the SAME speed as combat (1×) so a unit moves at one constant pace
// whether it's wandering or fighting — no jarring "sprint while wandering, walk
// once engaged" speed flip. (Travel across a large open map is therefore at combat
// pace; if that feels too slow, nudge this up slightly.)
export const WANDER_SPEED_MULT = 1
// Keep wander targets (hero waypoints, monster hops, scatter) this far inside
// the map edges, so units roam the interior instead of pinning to the perimeter
// and piling up in corners.
export const WANDER_MARGIN = 12
export const MONSTER_EDGE_MARGIN = 4

// §town wander (BattleState.peaceful): heroes posted to a peaceful city mill
// about INDIVIDUALLY (not as a party) with long pauses between short shuffles —
// a town idle, not a patrol. Longer dwell + shorter hops + a slower stroll than
// the monster lurk-hop, so a city reads as relaxed milling. Reuses the monster
// lurk-then-hop machinery (lurkAndHop) with these gentler numbers.
export const TOWN_WANDER_MIN = 15
export const TOWN_WANDER_MAX = 40
export const TOWN_WANDER_NEAR = 2
export const TOWN_WANDER_FAR = 5
export const TOWN_WANDER_SPEED_MULT = 0.5

// §Charger — a melee "dive" movement behaviour (no speed/damage modifier). It
// aims at the centroid of the enemy pack within CHARGER_DIVE_RADIUS of its target
// (crashing into the group to set up a melee AoE), and *leashes*: if a fleeing foe
// drags it past CHARGER_LEASH from the party centroid it breaks off and regroups
// (party cohesion over an endless chase). Leash grows a little per rank.
export const CHARGER_DIVE_RADIUS = 6
export const CHARGER_LEASH = 14
export const CHARGER_LEASH_PER_RANK = 2

// §Flanker leash — like the Charger, a flanker won't circle a fleeing target
// forever: once it's dragged past FLANKER_LEASH from the party centroid it drops
// the lock and regroups, so the next targeting pass re-acquires a nearer foe
// ("give up, hit someone closer"). A touch shorter than the Charger's reach since
// a skirmisher shouldn't over-commit. Grows a little per rank.
export const FLANKER_LEASH = 12
export const FLANKER_LEASH_PER_RANK = 2

// §Wary Caster — a caster's "wariness" (interruptedCount, the back-off it reads)
// FADES when it's left alone: decay it by 1 every WARY_INTERRUPT_DECAY logical
// rounds with no fresh interrupt. Otherwise a couple of early disruptions make a
// mage kite for the entire rest of a fight (it never closes again). A new interrupt
// re-arms it. (Logical rounds; scaled by timeScale at the call site.)
export const WARY_INTERRUPT_DECAY = 10
