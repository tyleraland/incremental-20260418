// Combat plan-layer tuning (movement-action-coupling.md §levers).
//
// TWO kinds of lever live here, deliberately together so a browser-tuning
// pass greps ONE file:
//
//  1. Global knobs — engine-wide feel constants the plan layer reads. Marked
//     ⏱ when they should be re-reviewed against real gameplay (the numbers
//     were chosen analytically, not by play). Each ⏱ notes the on-screen
//     symptom of a wrong value; the scenario checklist for a human QA pass
//     is BACKLOG.md §Plan-layer tuning (watch the Debug tab's Plan panel —
//     it shows the exact numbers the AI is acting on).
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

// Kite/hold candidate scoring (plan.ts scoreCandidate + engine.ts kiteToward).
// KITE_DEAD_BAND: flat top of the ring-distance penalty AND the kite hold band —
//   one number so they can't drift apart. Too small → kiters shuffle 1 cell per
//   round at their ring; too big → they stand sloppily off-range.
export const KITE_DEAD_BAND = 0.4
// GAP_W ⏱: pull toward the preferred ring, per cell off it. Too weak → units
//   dawdle out of range of their lock; too strong → it overrides the exposure
//   tiebreak and everyone stands on the exact ring regardless of danger.
export const GAP_W = 1
// Corridor pricing (M3, plan.ts corridorExposure + engine.ts corridorAffordable).
export const CORRIDOR_MAX_SAMPLES = 40   // price-sample cap per corridor — perf bound, not feel
// TRAVEL_CLEAR_EXIT ⏱: resume marching once the corridor costs < budget × this.
//   Hysteresis width — too near 1 → march↔fight flapping as ring monsters die;
//   too small → over-clears long after the route got cheap.
export const TRAVEL_CLEAR_EXIT = 0.6
// Blink escape (M4, engine.ts tryBlinkEscape).
export const BLINK_SAMPLES = 16          // landing directions probed — determinism-fixed order
// BLINK_WALK_MIN ⏱: a retreat step must OPEN the threat gap by at least this
//   fraction of a step, else the unit reads as cornered (and may blink). Too
//   loose → blink wasted on open-field retreats; too strict → dies shuffling
//   in the pocket with the cooldown ready.
export const BLINK_WALK_MIN = 0.4
// PRIMARY_SWITCH_MARGIN ⏱ (tactical-coordination.md §3.1, M1): the team's
// kill-order commitment hysteresis — a challenger must score ≥ (1+margin)× the
// incumbent primary's own kill-order score before the party retargets. Same
// role as behavior.ts's PULL_FRACTION (a unit's own aggro hysteresis) but at
// the team level. Too small → primary flip-flops between two near-tied
// dangerous foes each decision round; too big → the party keeps grinding a
// target that's clearly no longer the best pick.
export const PRIMARY_SWITCH_MARGIN = 0.25
// PRIMARY_SCORE_FLOOR ⏱: additive floor under the incumbent's score inside the
// switch-margin comparison (the PULL_FLOOR pattern one level up) — without it a
// zero-score incumbent (harmless egg-sac) is "beaten" by ANY challenger every
// decision round, including another harmless one (primary thrash at zero). On
// the killScore scale (threat × partySustained ÷ hp): 1 ≈ a foe with threat 5,
// 60 hp vs a 15-sustained party — real danger clears it, trash doesn't. Too
// high → the party stays locked on a harmless target while a modest but real
// threat closes in.
export const PRIMARY_SCORE_FLOOR = 1
// ENGAGE_EXIT ⏱ (tactical-coordination.md §3.3/§5, M2): the pull-model
// commitment's abandon hysteresis — engage a camp at RTK < RTD × pullMargin,
// but only ABANDON a held engagement once the live re-price crosses RTK > RTD
// × pullMargin × ENGAGE_EXIT. Asymmetric on purpose (the exit bar is looser
// than the entry bar) so a camp priced right at the entry edge doesn't
// commit/drop/re-commit every decision round as HP ticks change the ratio by a
// hair. Too close to 1 → flapping; too big → the party grinds a fight it
// should have disengaged rounds ago.
export const ENGAGE_EXIT = 1.3
// CAMP_RADIUS ⏱ (tactical-coordination.md §3.1/§3.3, M1 camp v0): how close a
// visible enemy must stand to the kill-order primary to ride along in the
// committed pull set (Engagement.targetIds). A coarse placeholder — M2's
// pullSetOf replaces this with the real transitive aggro-chain camp — kept on
// the same scale as CHARGER_DIVE_RADIUS so early parties don't commit to
// enemies merely nearby but functionally unrelated.
export const CAMP_RADIUS = 6
// PULL_SET_CAP ⏱ (tactical-coordination.md §3.3, M2 pull model): the BFS cap
// for pullSetOf — who joins if we hit `seed`. Bounds the worst-case appraisal
// cost (§5's "order of one steerAround call" budget) no matter how densely
// packed a camp is; a real pull-set rarely gets anywhere near this in play.
export const PULL_SET_CAP = 12

// ── M3: stance / anchor / formation / corridor (tactical-coordination.md
// §3.1/§3.4) ──────────────────────────────────────────────────────────────
// STANCE_KITE_REACH_EDGE ⏱: how much the party's median offensive reach must
// clear the camp's worst-case reach before `decide` calls the fight kiteable
// (party median capability.reach ≥ camp max reach + this, AND median
// moveSpeed ≥ camp max moveSpeed). Too small → a party barely longer-ranged
// than the camp kites into pointless shuffling (a decisive melee win would've
// been faster); too big → an obviously-outranging party still collapses into
// melee.
export const STANCE_KITE_REACH_EDGE = 1.5
// ANCHOR_BARRIER_RADIUS ⏱: how close a barrier must sit to the party's commit
// centroid before `decide` calls a chokepoint "worth standing on" (v0's hold
// trigger). Too small → real nearby chokes get missed and the party collapses
// in the open; too big → the party "holds" a chokepoint irrelevant to the
// fight.
export const ANCHOR_BARRIER_RADIUS = 8
// ANCHOR_SLACK ⏱ (scoreCandidate's cohesionW term, plan.ts): dead-band, in
// cells, before drifting off the anchor costs anything — so a unit standing
// right on the line doesn't micro-jitter from the term alone. Too small →
// jitter at the anchor; too big → the term never bites before a unit has
// already wandered off the line.
export const ANCHOR_SLACK = 3
// CORRIDOR_ARRIVE ⏱ (engine.ts roamTowardWaypoint): how close a unit must get
// to the plan's published `corridor` corner before it stops aiming at it and
// reverts to its own fanned waypoint. Too small → units peel off the shared
// line early and re-split around the obstacle; too big → the party clumps at
// the corner long after everyone could safely fan back out.
export const CORRIDOR_ARRIVE = 2
// FRAGILITY_OUTLIER_FRACTION ⏱: a member whose toughness falls below this
// fraction of the party's median toughness is the standing-guard's
// protectee. Too high → a merely-average member reads as "the squishy" and
// gets babysat for no reason; too low → a real outlier never trips it and
// stands unprotected.
export const FRAGILITY_OUTLIER_FRACTION = 0.5
// Formation fan (engine.ts formationSlot, the 'hold' execution): a small
// two-rank fan along the anchor→primary axis — toughest half forward
// (camp-facing), the rest behind, the fragility outlier pinned rearmost and
// centered. FORMATION_FRONT/BACK ⏱: how far forward/back of the anchor each
// rank stands. FORMATION_SPACING ⏱: lateral gap between slots in a rank
// (≈ SEPARATION(0.7) × 1.6 — Guardian's own stand-off gap, so a fresh line
// doesn't spawn overlapping). FORMATION_REAR ⏱: how far behind the anchor the
// outlier's own rearmost slot sits — deeper than the back rank's own offset,
// so it reads as visibly the safest spot on the line. Raised from an original
// 1.6 (tactical-coordination showcase review): 1.6 wasn't deep enough to keep
// a rear-pinned squishy out of reach once a swarm crossed the chokepoint and
// fanned out laterally in the open field beyond it (nothing stops sideways
// flanking once a mob is past the gap — the anchor→primary axis only pins
// depth, not width) — the caster in `hold-the-line` (src/dev/showcaseBattles.ts)
// took a hit and, at the original value, sometimes died outright. Picked the
// SMALLEST value that keeps that scene's caster out of melee range (1.4) with
// real margin without regressing `kill-the-shaman` (this constant also
// governs how deep a MONSTER pack protects ITS OWN fragility outlier — the
// same mechanism, just on the other team — and pushing it much past this
// let the wolves shield their Shaman long enough that the party wiped before
// ever reaching it; 3 keeps that fight's timing close to its pre-fix pace).
// Too small → the outlier isn't meaningfully safer than the back rank; too
// big → an enemy pack can stall a kill-the-shaman-style "dangerous-first"
// fight indefinitely by over-sheltering its own squishy.
export const FORMATION_FRONT = 1.2
export const FORMATION_BACK = -0.8
export const FORMATION_SPACING = 1.12
export const FORMATION_REAR = 3

// ── Postures (the player's behavior dial) ────────────────────────────────────
//
//   bold   — damage first: ignores incidental exposure, forces expensive
//            corridors, saves Blink for genuinely hopeless corners.
//   steady — the shipped defaults; every pre-posture battle replays as steady.
//   wary   — safety first: stands off from extra threats, refuses corridors a
//            steady unit would force, blinks out early.
//
// Columns (all read via postureOf; each ⏱ — QA per BACKLOG §Plan-layer tuning,
// and the three rows must stay VISIBLY distinct in play or the dial is noise):
//   exposureW    ⏱ candidate-scoring penalty per point of per-round exposure.
//                  Small by design at steady — a kiter's job is to fight from
//                  inside its own range, not to hide; too high → refuses to
//                  stand anywhere it can shoot from.
//   travelBudget ⏱ fraction of CURRENT hp spendable forcing a corridor before
//                  clear-first kicks in. Too high → travelers plow rings and
//                  arrive near-dead; too low → they stop to clear cheap
//                  crossings and orders crawl.
//   blinkGain    ⏱ cells the best landing must open the nearest-threat gap by
//                  before a cornered unit spends its teleport. Lower = blinks
//                  earlier/more freely.
//   cohesionW    ⏱ scoreCandidate penalty per cell of excess drift off the team
//                  anchor (tactical-coordination.md §3.4; read by nothing until
//                  M3). Bold drifts most, wary sticks to the line.
//   pullMargin   ⏱ engage a camp when RTK < RTD × pullMargin — the mutual-TTK
//                  race (tactical-coordination.md §3.3; read by nothing until
//                  M2). Bold takes a near coin-flip; wary demands a comfortable
//                  win.
export interface PostureRow {
  exposureW: number
  travelBudget: number
  blinkGain: number
  cohesionW: number
  pullMargin: number
}
export const POSTURES: Record<Posture, PostureRow> = {
  bold:   { exposureW: 0,    travelBudget: 0.5,  blinkGain: 3,   cohesionW: 0.02, pullMargin: 1.0 },
  steady: { exposureW: 0.05, travelBudget: 0.35, blinkGain: 2,   cohesionW: 0.08, pullMargin: 0.8 },
  wary:   { exposureW: 0.2,  travelBudget: 0.2,  blinkGain: 1.5, cohesionW: 0.2,  pullMargin: 0.6 },
}

// ── Acumen gates (tactical-coordination.md §3.2) ─────────────────────────────
//
// Team acumen = Σ effective INT over LIVING members (engine/teamplan.ts
// teamAcumen) — additive, so every scholar counts and a dead shaman is felt
// immediately. Each planner feature checks its own gate independently; below a
// gate the party plays like today's engine, never worse. Read by nothing yet
// (M0); gates go live with their features (pull M2, stance M3, ambush M4,
// rollout M6). The planner's one deliberate ABSOLUTE — smarts is diegetic, not
// relative to the opponent; if level inflation opens every gate, tune the
// thresholds, don't convert to a ratio.
//
// Scale ⏱: engine int = the store's derived magicAttack ≈ floor(INT×2 + DEX/2)
// + gear. The fresh 6-hero roster sums ≈75; an all-brawn six ≈35; one scholar
// adds ≈20.
export const ACUMEN = {
  pull: 50,      // ⏱ pull prediction + avoid list — one scholar in a brawn party clears it
  stance: 90,    // ⏱ stance choice / kite line — a leveled or scholar-heavy party
  ambush: 150,   // ⏱ ambush anchors, cloak timing — mid-game party
  rollout: 250,  // ⏱ rollout compare — late-game headroom
}

// A combatant's policy row. Legacy snapshots and units that never set a
// posture read as 'steady' — byte-identical to pre-posture behavior.
export function postureOf(c: Combatant): PostureRow {
  return POSTURES[c.posture ?? 'steady']
}
