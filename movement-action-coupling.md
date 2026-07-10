# Movement ↔ action coupling — the combat plan seam

Design doc for the recurring class of unit-AI problems where the movement layer
needs to know what the action layer will actually do (and vice versa):

- kite at the range of the skill you'll *actually cast*, not your longest range;
- "should I stand at spot A to cast X, or spot B to cast Y?";
- "this route runs through a ring of stationary ranged monsters — eat the
  damage, or kill a few first?";
- Blink: one capability that is both an escape (combat movement) and a bridge
  (opens routes across un-walkable gaps).

The backlog has rediscovered this twice independently ("Robust range selection"
and "positioning for a unit's preferred-range attack rather than its longest",
BACKLOG.md §Combat-AI). This doc names the root cause, lays out the target
architecture, and slices it into shippable milestones. No code lands with this
doc — it is the foundation the milestones build on.

## 1. The problem, precisely

Today the two layers guess at each other through *proxies*:

**Movement guesses what action will do.** `castRange` / `kiteDistanceFor`
(`src/engine/spatial.ts`) answer "where should I stand?" from *raw skill
ranges* — the longest single-target attack range, cooldown-filtered. The kiter
(`kiteToward`, `src/engine/engine.ts`), the caster's default hold
(`executeMovement`'s `reach = castRange(self)`), and Wary Caster all anchor on
it. But the action channel may pick a *different* skill: `estimateDamageVs`
re-ranks attacks per target (element matrix, magic vs physical mitigation,
cycle amortization), the channeled-AoE gate can veto the long cast, cooldowns
shift which option is live. A unit can park at the range of a skill it will
never cast, out of range of the one it wants.

**Action assumes movement already happened.** `selectSkillTarget` and every
gate in `makeSkillTactic` (`src/engine/skills.ts`) evaluate only at
`self.pos`, *after* movement executed. There is no way to ask "if I stood at
P, what would I cast, at whom, for how much?" — so no movement decision can be
scored by its action payoff.

That's the chicken-and-egg loop: position → best attack → preferred range →
position. Each patch that half-closes it becomes a special case:

- `kiteToward`'s `aimOutOfRange` branch — parked at the nearest-threat gap
  while the *locked* target sits out of range; patched with a "close straight
  on the aim" special case.
- `channeledAoeWorthIt` / `canFinishChannel` — position-conditional action
  gates, but only ever consulted at the current position.
- `firewallThreat` — its own bespoke "castable from here?" geometry.
- Storm Caller — its own cluster-value scan, blind to whether the caster can
  actually reach a firing spot for the cluster it picked.

These are four partial re-implementations of the same question. The recurring
kite edge-cases (anchor on the wrong range, walls/cliffs breaking LoS,
stranding in a corner) are all symptoms of movement not being able to *ask*.

## 2. What the codebase already does right

The design below is not imported from outside — it generalizes patterns the
engine already uses locally:

- **`escapeHeading`** samples 16 candidate directions, scores each
  (clearance + reach − dead-end + away-bias + cohesion + stickiness), commits
  the winner, and remembers it (`escapeDir`, serialized with a legacy default)
  for hysteresis. That *is* propose–evaluate–commit; it's just private to the
  kite retreat.
- **`reorderAttacksForTarget` + `exploitMargin`** is a scored choice with a
  switch margin at the action layer.
- **`avoidOrPlowPoint`** (travel-avoid watchdog) is route-threat judgment v0:
  steer around enemy reach, detect no-progress, escalate to plowing.
- **`estimateDamageVs`** is already the single scoring hook the backlog says
  to extend ("more scorers").

The foundation is: extract that pattern, make **position a parameter** of the
action evaluation, and share one scorer — instead of a fifth, sixth, seventh
local copy.

## 3. Target architecture

Three pure, deterministic pieces, all engine-internal (`src/engine/`), no RNG,
id/index tiebreaks everywhere, inputs never mutated.

### 3.1 The action forecast (the seam itself)

```ts
// plan.ts (new) — "if I stood at `at`, what would I do?"
export interface ActionForecast {
  // Best action available from `at` on the current gates, or null (nothing castable).
  option: { skill: EngineSkill | null; targetId: string } | null   // skill null = basic attack
  score: number        // estimateDamageVs, amortized — same scorer the action channel uses
  range: number        // range the chosen option needs (its anchor for movement)
  losClear: boolean    // sightline from `at` to the option's target
  finishable: boolean  // canFinishChannel evaluated from `at`
}
export function forecastAction(state: BattleState, self: Combatant, at: Vec2): ActionForecast
```

The critical property is **no drift**: the forecast must run the *same* gates
the real action channel runs (cooldowns, active caps, cluster gate, cloak/
shield-wall/last-stand gates, `selectSkillTarget`'s range/LoS/redundancy
filters). That's achieved mechanically, not by discipline: the existing
functions get an optional `at: Vec2 = self.pos` parameter
(`selectSkillTarget`, `canFinishChannel`, `channeledAoeWorthIt`,
`inRange`-style checks), and the live action channel becomes literally
`forecastAction(state, self, self.pos)`. One code path, two callers.

Notes:

- Forecasting at a hypothetical `at` must not consult per-position caches
  keyed on `self.pos` — the vision cache (`spatial.ts`) already keys on the
  querier's live position, so hypothetical positions bypass it by
  construction. Enemy *visibility* for a hypothetical position uses the same
  `visionRange` distance check, recomputed.
- Non-attack value (heal/buff/zone utility) initially scores 0, exactly as
  `estimateDamageVs` does today. Extending the scorer extends every consumer
  at once — that's the point of the seam.

### 3.2 Candidate-position scoring (propose–evaluate–commit)

The chicken-and-egg loop is broken by **not iterating**: enumerate a small,
deterministic candidate set of positions, score the *joint* (position, action)
pair, commit the winner.

```ts
export interface MoveCandidate {
  pos: Vec2
  kind: 'hold' | 'kiteBack' | 'close' | 'corner' | 'flank' | 'blink'   // provenance, for trace/debug
}
export function scoreCandidate(state: BattleState, self: Combatant, c: MoveCandidate): number
//   + forecastAction(state, self, c.pos).score          — offense enabled there
//   − exposure(state, self, c.pos) · EXPOSURE_W         — §3.3
//   − strandingPenalty(...)                             — unreachable / cut off from party
//   + stickiness bonus for last round's committed kind  — hysteresis (the escapeDir lesson)
```

Movement *tactics* stop hand-computing ranges and instead **propose
candidates**: the kiter proposes {hold, arc-back points, the corner point from
`steerAround`}; the default caster hold proposes {hold, close-to-forecast-
range}; a blink owner adds teleport landings. The shared evaluator picks.
Candidate counts stay small (≤ ~8) and ordering is fixed, so replays are 1:1.

This is deliberately a *discrete candidate* evaluator, not an influence-map
or A* planner. `escapeHeading` proves the shape is enough, and it keeps the
per-turn budget flat.

### 3.3 The exposure query (what routes and kites both need)

```ts
// "How much punishment does standing at `p` invite from the enemy team?"
export function exposure(state: BattleState, self: Combatant, p: Vec2): number
// Σ over visible enemies e:  estimateDamageVs(e, self, bestOf(e)) gated by
//   reach: distance(p, e.pos) ≤ attackRange(e) + moveSpeedOf(e)·H  (H = small horizon)
//   and LoS for ranged e (sightlineClear).
```

This is the value judgment in the gauntlet example, and the missing term in
kite scoring ("backing off *into* another enemy's reach"). Stationary ranged
monsters get `moveSpeedOf(e) = 0`, so their threat is a crisp disc + LoS —
exactly the ring the router must price.

## 4. The three motivating problems, solved in this framework

**Kite robustness / skill-x-vs-y positioning.** The kiter's `desiredRange`
becomes `forecastAction(...).range` — the range of the option it will actually
cast (M1). Where two skills imply different spots, both spots enter the
candidate set and the joint score decides (M2): standing at 6 to channel
Frost Bolt vs closing to 1.2 for Bash against a magic-immune foe is one
`scoreCandidate` comparison, not a special case. Cliffs/LoS/stranding stop
being kiteToward branches — they're the `losClear`, `exposure`, and
`strandingPenalty` terms applied uniformly to every candidate.

**The gauntlet (ring of stationary ranged monsters).** Route-level version of
the same trade. `avoidOrPlowPoint` already steers a marching unit around enemy
reach and escalates to plowing on no-progress. M3 replaces "no-progress
watchdog" with priced choice: sample the corridor (the `steerAround` polyline
toward `moveOrder`), integrate `exposure` along it → expected HP cost of
running the gauntlet; compare against an HP budget (fraction of current HP,
modulated by `moveEngage`). Over budget → the third option the watchdog can't
express today: **clear-first** — drop the march, fight the cheapest arc of the
ring (fewest kills that open an under-budget corridor), then resume the order.
The store/logistics layer sees this only as "the move order takes longer";
if no corridor can be brought under budget, the order reports blocked and the
logistics layer (`routeUnitTo`) can reroute — same seam it uses today.

**Blink.** Modeled as a *movement capability* on the combatant, not a
special-cased skill:

```ts
// Combatant (serialized; adapter fills it from the skill/equipment kit)
moveAbilities?: { kind: 'teleport'; range: number; cooldownRounds: number; needsLoS: boolean }[]
```

Three integration points, in increasing scope:
1. **Escape** — blink landings join the escape/kite candidate set (score
   already handles "is the far side better": exposure drops, forecast may
   still fire). Spending it is an *option scored against walking*, so the AI
   naturally saves it when walking is fine — plus a reserve margin so the
   escape only wins when it beats walking clearly (don't waste the cooldown).
2. **Pathing** — `steerAround`/`canReach` (`barriers.ts`) grow an optional
   capability argument that adds teleport edges to the visibility graph:
   node pairs ≤ range apart, crossing cliff-kind barriers (which block walk
   but not sight/blink), wall-crossing only if `!needsLoS`. That's "cross the
   moat": `canReach` becomes per-unit, which also feeds reachability-aware
   threat/hunt (`pickHuntTarget` already calls `canReach`).
3. **Overworld logistics** — `routeBetween` (`src/lib/travelGraph.ts`) already
   takes a weight hook; capability-gated *edges* (a river-crossing connection
   marked `requires: 'teleport'`) make some routes exist only for blink
   owners. This is store-side data, cleanly separate from the engine.

In-combat, the *cast* of Blink is an action-channel skill whose resolution
repositions the unit — the movement planner requests it by scoring a blink
candidate best, and the action channel executes it (same relationship as
Firewall: the skill tactic owns placement). That keeps "one action per turn"
accounting honest: blinking competes with casting, which is exactly the
interesting decision.

## 5. Constraints (non-negotiable, from the engine's invariants)

- **Determinism.** No RNG; fixed candidate enumeration order; id/index
  tiebreaks; hysteresis via committed fields with explicit switch margins
  (the `PULL_FRACTION` / `exploitMargin` / `escapeDir` pattern). Any
  cross-round plan memory (committed candidate kind, blink-reserve state)
  must be serialized in `snapshot.ts` with a legacy default, like `escapeDir`.
- **Snapshot fidelity.** A reloaded BSNAP advanced N rounds must match the
  live battle. Behavior *changes* are allowed per milestone (tests updated
  deliberately); what must never break is serialize→replay 1:1.
- **Budget.** Forecast/candidate work runs on decision rounds only
  (`isDecisionRound` already exists for exactly this), candidate sets stay
  ≤ ~8, per-turn forecast results are memoized per (self, target) within the
  turn like the vision cache. Off-screen battles already skip full sim
  (`creditOffscreen`), so cost lands only on the watched battle + tests.
- **Purity.** `plan.ts` is a leaf like `spatial.ts` — grid/types/damage/skills
  imports only, no store, no time, never mutates inputs.
- **Debuggability first.** Every commit records why: the chosen candidate
  (kind + forecast note) goes into `lastResolution`/`pushTrace` like
  `exploitNote` does today, and `bsnap -i`'s `inspectLine` grows
  `plan: kiteBack@(x,y) → frost-bolt r6 exp3.2` so "why won't it move/fight"
  reports stay one command away.

## 6. Milestones (each independently shippable)

**M0 — parameterize position (mechanical, byte-identical).**
Add `at: Vec2 = self.pos` to `selectSkillTarget`, `canFinishChannel`,
`channeledAoeWorthIt`, and the range/LoS checks they use. No caller passes a
hypothetical position yet. Pure refactor; snapshot fixtures and the full suite
must pass unchanged.

**M1 — `forecastAction` + anchor the kite/hold on it.**
Introduce `plan.ts`; `kiteDistanceFor` and the caster default hold anchor on
`forecastAction(state, self, self.pos).range` instead of `castRange`. This is
the smallest behavior change that kills the "parked at the wrong range" class
(and subsumes `kiteToward`'s `aimOutOfRange` patch — the forecast already
targets the lock). Tests: new forecast unit tests (element flip picks the
other bolt's range; cooldown flips the anchor; Bash-vs-bolt kit vs
magic-immune foe anchors melee); `los-kiting` / `moat-kiting` / `molasses`
suites stay green or change for stated reasons.

**M2 — candidate scoring for the kite/hold family.**
Generalize `escapeHeading`'s scored loop into `scoreCandidate` +
`exposure`; kiter/wary-caster/default-hold propose candidates through it.
Fixes the cliffs/LoS/corner-stranding class in one place. `escapeHeading`
itself becomes a candidate *proposer* (its 16 directions), keeping its
committed-heading hysteresis as the stickiness term.

**M3 — priced routes (the gauntlet).**
`exposure` integrated along the march corridor; `avoidOrPlowPoint` escalation
becomes avoid → plow (under budget) → clear-first (over budget) → report
blocked. Store-visible only as order latency / a blocked-order signal.

**M4 — movement capabilities (Blink).**
`moveAbilities` on the combatant + adapter wiring; blink candidates in
escape/kite (M2 slots them in for free); capability-aware
`steerAround`/`canReach`; overworld capability-gated edges in `travelGraph`.
Each of the three integration points is its own PR.

Deliberately **not** building: per-turn A*/influence maps, minimax over enemy
responses, a generic utility-AI framework. If deeper lookahead is ever wanted,
the engine's determinism already offers it cheaply — clone + `advanceRound` a
few rounds for the top-2 candidates — but that's a future experiment behind
the same seam, not part of this foundation.
