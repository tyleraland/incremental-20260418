# Tactical coordination — the team plan seam

Design doc for the multi-agent coordination layer: how a party stops being six
independent units that happen to share a waypoint and becomes a *team* — one
that converges fire, pulls instead of over-pulling, holds a chokepoint, keeps
formation, guards its carry, escorts a traveler, baits an ambush, and decides
kite-vs-hold from its own composition. Companion to
`movement-action-coupling.md` (the *unit* plan seam); this doc is the *team*
half. No code lands with this doc — it is the foundation the milestones build
on.

BACKLOG.md calls this "the biggest open chunk" (§AI & coordination). The items
there — Team blackboard extensions, Smart-party baseline, Strategies as
bundles, Team-plan (joint) scoring, kite-vs-hold from party comp, Puller /
Hold the Line / Bodyguard, Gather-and-guard, en-route hunting — are all
expressions of the same missing thing. This doc names it and slices it.

## 1. The problem, precisely

`BattleState.plans` exists and is the right substrate: a per-team blackboard,
recomputed on decision rounds by a pluggable `Planner`, serialized in
snapshots, inspectable in the Debug tab. But today's `TeamPlan` is four
fields — `waypoint`, `focusTargetId`, `threat`, `huntTargetId` — and the
`defaultPlanner` that fills them answers only one question: *where should the
group drift, and who looks most killable?* Everything downstream is a unit
deciding alone:

- **Fire doesn't converge by default.** `focusTargetId` is computed every
  round but only *opt-in* tactics read it (Opportunist, Finish Them,
  Focus Fire). The default targeting fallback (`selectTarget`,
  `behavior.ts`) is pure per-unit threat−distance; six heroes routinely
  split across six slimes.
- **Nothing decides whether to fight at all.** The hunt commits to the
  nearest visible foe with no notion of what hitting it will *pull* —
  `rallyPack` chains aggro through same-named kin, and the planner never
  prices that chain. Over-pulling is undetectable, so it's unavoidable.
- **"Hold" has nowhere to stand.** There is no anchor: the waypoint is the
  fight's centroid, which moves as the fight moves. Chokepoints, ambush
  spots, and formation lines can't be expressed, so they can't be held.
- **Roles don't exist.** Who tanks, who pulls, who peels for the carry, who
  screens the traveler — no field on any type can say it. Guardian
  hard-codes "squishiest ally"; Charger/Flanker leashes are cohesion by
  panic-return, not by plan.
- **Team intent can't reach unit scoring.** `scoreCandidate` (plan.ts)
  prices forecast − ring drift − exposure. A candidate that abandons the
  line, strands the healer, or walks into the sleeping camp next door
  scores the same as one that doesn't.
- **The store can't declare purpose.** A battle has no objective field —
  "you are escorting Lyra across this map" or "hold this gap" cannot be
  said, so the chaperone/escort behaviors have no hook to hang on.
- `HERD_BIAS = 4` (barriers.ts) fudges "route the same way" with a global
  left-side corner tax — a pather constant impersonating a team decision.

## 2. What the codebase already does right

The design below extends shipped patterns; nothing is imported from outside:

- **The blackboard is real and serialized.** `TeamPlan` rides BSNAP
  (`snapshot.ts` → `plans`), so cross-round *commitment* — the thing plans
  need most — is already snapshot-safe. New fields are optional with legacy
  defaults, the same discipline as `escapeDir`/`travelClearing`.
- **The planner is pluggable and throttled.** `Planner` is a
  `(state, team) => TeamPlan` function slot, refreshed only on decision
  rounds (`decisionInterval`). A richer default planner is a drop-in.
- **The scorers exist.** `estimateDamageVs`, `preferredAttackVs`,
  `forecastAction`, `exposureAt`, `corridorExposure` — every quantity a
  team appraisal needs is already a pure, memoized, deterministic function.
- **The read-side vocabulary exists.** `MovementResult` (`toPoint`,
  `desiredRange`, `hold`, `clearLock`) can express every assignment this doc
  defines; `teamFocus` shows the read pattern; Charger/Flanker leashes and
  `cohesionVec` are formation instincts awaiting a shared reference point.
- **The tuning seam exists.** `POSTURES` (`tuning.ts`) is explicitly "a new
  consideration is a new COLUMN"; team-conformance weights are columns, not
  a mechanism.
- **The enemy side already coordinates crudely.** `rallyPack`, pack-hunter
  waypoint roaming, and the hunt commitment are the monster half of the same
  machinery — one planner serves both teams today and keeps doing so.

## 3. Target architecture

Five pieces. The first three are engine-internal (`src/engine/`, pure,
RNG-free, id-tiebroken); the last two are the levers — one for the player,
one for the host/store.

### 3.1 TeamPlan v2 — engagement, assignments, anchor

```ts
// All new fields optional: absent ⇒ pre-coordination behavior, so legacy
// snapshots and the shipped planner stay byte-identical until each milestone
// deliberately turns a field on.
export type Stance = 'hold' | 'kite' | 'collapse'

export interface Engagement {
  targetIds: string[]       // the committed pull-set — what we EXPECT to fight
  primaryId: string | null  // current kill target (ordered focus)
  anchor: Vec2 | null       // where the line stands (choke / ambush / ring spot)
  stance: Stance            // how the line fights (from party comp, §4)
  sinceRound: number        // commitment age — abandon predicates read this
}

export type Assignment =
  | { role: 'engage' }                            // default: fight the engagement
  | { role: 'anchor' }                            // stand the line on the anchor
  | { role: 'pull'; targetId: string; to: Vec2 }  // tag one foe, drag it to `to`
  | { role: 'guard'; allyId: string }             // peel/bodyguard the protectee
  | { role: 'escort'; allyId: string }            // screen a transiting unit
  | { role: 'hold' }                              // reserve: stay put, don't chase

export interface TeamPlan {
  waypoint: Vec2 | null
  focusTargetId: string | null
  threat: Record<string, number>
  huntTargetId?: string | null
  // v2 ↓
  engagement?: Engagement | null
  assignments?: Record<string, Assignment>   // combatantId → role this plan
  avoidTargetIds?: string[]  // do-NOT-aggro list (the backlog's disableTargetId)
  corridor?: Vec2 | null     // shared route corner — the HERD_BIAS replacement
}
```

Design rules:

- **The plan is advisory except where a unit has nothing better.** Equipped
  tactics keep their priority — a player's Kiter still kites; the plan fills
  the *default* layer (today's close-and-hold / wander) and feeds a
  conformance term into `scoreCandidate`. Player levers always outrank the
  planner; the planner outranks the vacuum.
- **Commitment lives in the plan, not the units.** `Engagement` persists
  across decision rounds (the previous plan seeds the next, exactly like
  `huntTargetId` today) and is dropped only by explicit abandon predicates:
  primary dead and pull-set empty, party HP collapse below a posture-scaled
  floor, target unseen past `HUNT_RETAIN_MULT`, or the pull-set having grown
  past budget (the over-pull materialized — fall back / disengage). That is
  the backlog's "strategy commitment": pursue, notice failure, switch.

**What the blackboard is — and isn't:**

- **Derived, ephemeral state.** The plan is recomputed from battle state on
  decision rounds and is never player-authored: viewable (Plan panel), not
  configurable. Player-authored inputs stay exactly where they are today —
  unit tactics + posture, `partyTactics`, plus the one directive slot
  (§3.5). Those are the few party knobs; the blackboard is what the AI
  *derived* from them.
- **Serialized for replay fidelity only.** `engagement` is the one piece of
  cross-round *memory* (the commitment), so a mid-fight BSNAP must carry it
  to replay 1:1 — that's a determinism requirement, not persistence of
  configuration. Everything else in the plan could be dropped and
  recomputed.
- **Scope = the battle = the location.** `plans` lives on one BattleState;
  "the team" is exactly the units fighting on that map, which is what makes
  shared planning physically plausible. The blackboard never spans maps —
  cross-location coordination (the chaperone) is the *store's* job, spoken
  through objectives (§3.6).
- **Co-location honesty.** The plan is built from what members
  *collectively* see (fog rules unchanged), and assignments assume the
  cluster can act together. A straggler far from the plan's centroid
  (beyond the Charger/Flanker-leash scale) gets no special assignment and
  falls back to individual behavior until it rejoins — the party plans as a
  group because it *is* one. (Refinement, not v0: v0's "same battle ⇒ same
  plan" is already approximately this, since stragglers fail the range
  checks their assignments imply.)

### 3.2 The planner pipeline

`defaultPlanner` stays one exported `Planner` but becomes a composition of
pure stages, each independently testable:

```
sense    → members, visible enemy set, engaged set          (exists today)
appraise → cluster visible enemies into CAMPS (proximity/rally-linked
           groups); price each camp: pullSetOf + Σ threatProfile
decide   → hold or refresh the Engagement (hysteresis + abandon predicates);
           choose stance (kite/hold/collapse), anchor, and kill order
assign   → jobs per member from declared intent + kit (§capabilities below)
publish  → TeamPlan (waypoint/focus/avoid/corridor derived from the above)
```

**No role taxonomy — capabilities and declared intent.** The planner never
stores "tank/carry/support" anywhere; a role enum would just be memoized
answers under a label, knowledge the blackboard doesn't need to encode.
When `assign` needs a body for a job it asks two kinds of question, in
order:

1. **Declared intent — equipped tactics ARE the role config.** A unit
   carrying Guardian has said "I peel" — it's the guard. Kiter/Wary Caster
   marks a ranged-line unit; Charger/Flanker marks a diver; the future
   Puller tactic pins the puller. The planner routes assignments *toward*
   units whose tactics already volunteer and never assigns against an
   equipped tactic (the player lever wins twice: it outranks plan defaults
   at execution, and it steers who gets which job at assignment).
2. **Kit capability — pure queries at the point of use**, when no tactic
   volunteers: aggro-holder = best `threatMult`·def·hp; protectee ("the
   carry") = top sustained `estimateDamageVs`; puller = longest
   `preferredRangeVs` reach at ≥ party-median speed; healer = has a heal
   skill; **fragility outlier** = a member whose effective toughness
   (maxHp × mitigation) falls well below the party median — *relative*,
   so "one member much squishier than the rest" is detected on any comp.
   Id-tiebroken; inputs are the kit, fixed for the battle, so the answers
   precompute per combatant (§5) — no new player config, no save impact.

Assignments (this plan's *jobs*) are the blackboard output; capabilities
stay derivable. The one aggregate the planner does compute is the party's
range/mobility profile for the stance decision — a per-decision-round fold
over the same precomputed capabilities. When a fragility outlier exists,
`assign` issues a **standing guard by default** (staffed by a Guardian
volunteer, else an idle line unit — never by stripping an equipped intent),
and the outlier's own anchor slot goes to the formation rear (§3.4); the
Protect directive forces and aims the same machinery, it doesn't introduce
it.

**Acumen — smart members make a smart party.** `sense` computes a team
acumen score, **additive** over living members' effective INT — every
scholar contributes, buffs/debuffs move it, and deaths are felt
immediately. Planner features gate on it through a plain thresholds table
(`tuning.ts`, the POSTURES philosophy — a new gate is a table row, not a
mechanism), **modular** in that each feature checks its own gate
independently:

| planner feature | gate |
|---|---|
| focus convergence, kill order (M1) | always on — the baseline never degrades |
| pull prediction + avoid list (M2) | `ACUMEN.pull` |
| stance choice / kite line (M3) | `ACUMEN.stance` |
| ambush anchors, cloak timing (M4) | `ACUMEN.ambush` |
| rollout compare (M6) | `ACUMEN.rollout` |

Gates only ever *add* intelligence above the shipped baseline — a
low-acumen party plays like today's engine, never worse. The payoffs are
diegetic and free: an all-brawn party genuinely over-pulls where a party
carrying one scholar pulls singles; killing the enemy shaman drops the
pack's acumen mid-round and its coordination visibly collapses — the
backlog's "kill the leader and the pack scatters," implemented as
arithmetic; curated progression can literally level a party into tactics.
Deterministic (recomputed from live state each decision round, no memory),
and it composes with directives cleanly: a directive *requests* a behavior,
acumen bounds how well the planner executes it.

**Budget.** Everything runs once per team per decision round; §5 has the
cost model. Headline: while an engagement holds, `appraise` is skipped
entirely — commitment is the fast path, not just the anti-thrash.

### 3.3 The pull model — `pullSetOf`

The single new predictive primitive:

```ts
// Who joins the fight if we hit `seed`? Transitive closure over the enemy
// team's OWN aggro rules: kin that rallyPack would rouse (same name, within
// visionRange of a set member) plus anything whose visionRange covers the
// expected fight point. Deterministic BFS, capped, id-ordered.
export function pullSetOf(state: BattleState, seed: Combatant, at: Vec2): Combatant[]
```

The no-drift rule from `forecastAction` applies: the membership test must be
the *same code* `rallyPack` and target-acquisition actually run (extract the
predicates, two callers) — a prediction that diverges from the real aggro
rules is worse than none. Camp price = Σ over the pull set of the plan's
existing `threat` record — the planner already computes that per enemy every
decision round, so pricing is a few adds, not a new scoring pass
(`threatProfile`-grade per-member matchup pricing is an upgrade only if the
coarse price misjudges in play). Budget = party effective HP × a
posture-blended fraction (a new POSTURES column, `pullBudget`). Then:

- **Engage-or-not**: cheapest affordable camp wins the engagement; nothing
  affordable → the party keeps roaming (or clears the cheapest arc first —
  the corridor logic already knows this move as clear-first).
- **avoidTargetIds**: enemies adjacent to (but outside) the committed pull
  set are published as do-not-aggro. `selectTarget` and opportunistic reads
  filter them (hard taunt still wins; a foe that provokes *itself* onto the
  party leaves the list automatically because it enters the fight).
- **Kill order**: `primaryId` walks the committed pull set by a target
  policy. Default **dangerous-first, killable-weighted**: highest plan
  `threat` divided by a cheap time-to-kill proxy (hp ÷ party sustained
  damage), so the party burns down the scariest thing it can actually kill
  fast, then mops up. The `threat` record is the *single* definition of
  "dangerous" — today `str+int`, upgradeable in place (healer/summoner tags
  for the Decapitate idea, realized-damage feedback) without touching any
  consumer; "however that's identified" is exactly this one field.
  Directives flip the policy: `wounded-first` (Finish Them synergy),
  `squishy-first` (Assassinate).
- **Pull assignment**: when the affordable slice of a camp is smaller than
  the whole (a fringe monster whose own pull set is just itself), the
  puller tags it and retreats to the anchor: `{ role: 'pull', targetId,
  to: anchor }` — movement = walk to reach, fire once, walk back; the line
  holds. That is intelligent pulling, and with an anchor placed behind a
  LoS break it is lure-and-ambush v0 for free (`exposureAt` already prices
  the wall).

### 3.4 The read side — executing an assignment

Three small, uniform hooks; no new channels, no new engine framework:

- **Targeting.** `selectTarget` grows two plan terms: a `FOCUS_WEIGHT` bonus
  for `engagement.primaryId` (converging fire becomes the *default*, with
  the existing PULL_FRACTION hysteresis intact so tanks still hold aggro and
  switches don't thrash) and the `avoidTargetIds` filter. Focus Fire / 
  Finish Them remain as the stronger, unconditional versions of the same
  read.
- **Movement.** One plan-execution step in `executeMovement`'s default path
  (after equipped tactics, before close-and-hold): `anchor`/`hold` →
  `toPoint` at the anchor slot (fanned per unit like `offsetWaypoint`, so a
  line forms, not a pile — and slots are ordered by fragility, tough in
  front, the outlier at the rear, so formation itself protects the squishy);
  `pull` → the tag-and-drag two-phase above;
  `guard`/`escort` → `guardPoint(protectee, threat)` (Guardian's math,
  aimed by the plan instead of "squishiest"). Stance reads: `kite` sets the
  non-kiter default to `desiredRange = preferredRangeVs` *with* back-off
  (today's opt-in kiter behavior, chosen by the team), `hold` pins to the
  anchor, `collapse` is today's close-and-hold.
- **Candidate scoring.** `scoreCandidate` gains a conformance term:
  `− cohesionW · excessDistToAnchor(cand)` (dead-banded, like the ring
  term). `cohesionW` is a new POSTURES column — bold drifts, wary sticks.
  This is the backlog's "team-plan (joint) scoring" in its cheapest honest
  form: units still score their own candidates, *conditioned on* the plan.
- **Routing.** The planner publishes `corridor` — the first `steerAround`
  corner from the party centroid to the waypoint. Units bias their own
  side-pick toward it; `HERD_BIAS` drops to a residual tiebreak (or dies).
  Same-way routing becomes a decision made once, not a global left tax.

### 3.5 Directives — the player's party-scope lever

The backlog's "Strategies = multi-channel tactic bundles" unified with the
planner: a small registry where one entry is *data the planner reads* plus
optional injected tactics.

```ts
export interface DirectiveDef {
  id: string; name: string; description: string
  stanceBias?: Stance          // fight this way when viable
  anchorPolicy?: 'choke' | 'ambush' | 'ground' | 'none'
  pullDiscipline?: 'strict' | 'loose'   // scale pullBudget
  targetPolicy?: 'dangerous' | 'wounded' | 'squishy'   // kill-order bias
  protect?: 'carry' | 'weakest'         // standing guard assignment (capability query, §3.2)
  tactics?: TacticRef[]        // party-scope tactic injections (existing seam)
}
export const DIRECTIVE_REGISTRY: Record<string, DirectiveDef>
```

Launch set (small, legible, each mapping to a scenario the sim can already
stage): **Skirmish** (default — everything above at its inferred defaults),
**Hold the Line** (anchor at the best gap, strict pulls), **Pull to Camp**
(puller mandatory, ambush anchor), **Protect** (standing guard on the
carry), **Assassinate** (primary = squishiest/healer via the existing
Assassinate pick, flankers dive with it — the ambush combo orchestrator
holds Cloak until Back Stab range because the *plan* times the dive, closing
the backlog's "needs an orchestrator" gap). One active directive per party
(a slot beside `partyTactics`, persisted the same way, adapter-injected into
the setup). Monsters get directives too where dispositions want them — pack
roles (leader/follower) are a monster directive, not new machinery.

### 3.6 Objectives — the host's seam (escort / chaperone / hold)

The store can finally *say why the team is here*:

```ts
export type TeamObjective =
  | { kind: 'hunt' }                       // default — today's behavior
  | { kind: 'escort'; unitId: string }     // screen this combatant's transit
  | { kind: 'hold'; point: Vec2 }          // own this ground
  | { kind: 'clear' }                      // kill everything affordable, in order
// BattleState.objectives?: Partial<Record<Team, TeamObjective>>
// set via setTeamObjective(state, team, obj) — serialized like plans.
```

The planner consumes the objective in `decide`: escort pins the anchor to a
moving slot ahead of the protectee's route and staffs `escort` assignments;
hold pins the anchor and forbids engagement drift past leash; clear iterates
camps cheapest-first. **Chaperone wiring** is then store-side only: when
`handleTravel` routes unit U through a location where a party is hunting,
the store sets `{ kind: 'escort', unitId: U }` on that battle and clears it
when U exits — the hunting party escorts the traveler through their map with
zero new engine modes. Gather-and-guard later rides the same seam (a
`guard`-flavored objective around a node). En-route hunting is the inverse
(the *traveler's* own budget question) and stays with the travel/corridor
logic — not this seam.

Team-vs-team arena fights need nothing extra: both teams already run the
planner symmetrically, so 5v5 with two directives *is* the LoL-style fight —
tanks anchor, carries fire from stance range, guards peel divers, pullers
bait. A `?scenario` showcase + tests make it a first-class fixture rather
than a hope.

## 4. The motivating behaviors, solved in this framework

| behavior | mechanism |
|---|---|
| Converging fire by default | `FOCUS_WEIGHT` on `engagement.primaryId` in `selectTarget` (hysteresis kept) |
| Don't over-pull | `pullSetOf` price vs `pullBudget`; `avoidTargetIds` filter |
| Intelligent pulling | `pull` assignment: tag → drag to anchor; line holds |
| Lure & ambush | ambush `anchorPolicy`: anchor behind a LoS break (`exposureAt` prices it); Assassinate directive times the cloak/dive |
| Hold a chokepoint | `hold` objective / Hold-the-Line directive → anchor at a barrier gap; `anchor` assignments + conformance term |
| Formation / cohesion | anchor slots (offset fan) + `cohesionW` column in `scoreCandidate` |
| Kite-vs-hold from comp | `decide`'s stance: party preferred-range & speed profile vs camp reach → `kite`/`hold`/`collapse` |
| Support & carry | capability query picks the protectee (top sustained `estimateDamageVs`); standing `guard` under Protect; healer positions off the anchor, not the centroid |
| Protect the squishy outlier | relative fragility query flags it → default standing `guard` + rear formation slot; Protect directive pins the same machinery |
| Kill the dangerous first | default kill-order policy: plan `threat` ÷ TTK proxy over the committed pull set; `threat` is the one pluggable definition of danger |
| Smart members, smart party | additive effective-INT → team acumen; planner features gate on a thresholds table; enemy acumen drops when the shaman dies |
| Chaperone a traveler | `escort` objective set by the store's travel loop |
| Team-vs-team arena | symmetric planners + directives; showcase scenario pins it |
| Same-way routing | plan `corridor` replaces the `HERD_BIAS` left tax |

## 5. Performance model — why this stays cheap

Target: planner cost ≪ one unit's turn, nothing new inside per-unit turns
beyond O(1) plan reads. (On-device profiling puts the whole engine at ~1% of
wall clock at 15v34 — the constraint is discipline, not headroom; render owns
the budget.) The tools are the ones the engine already uses:

- **Commitment is the fast path.** Hysteresis isn't just anti-thrash: while
  an engagement holds, `decide` runs only the abandon predicates (a handful
  of distance/HP checks) and `appraise` — the only wide stage — is skipped
  entirely. Full camp appraisal runs when the party is uncommitted (roaming)
  or a commitment just broke: rare events, not per-round work.
- **Per-battle precompute** (the `VIS_CACHE` pattern, keyed on the barriers
  array identity): chokepoint/gap candidates for anchor picks — barriers are
  static per battle, so this bakes once; the vis-graph corners it reads are
  already cached.
- **Per-combatant precompute**: the §3.2 capability answers read only
  skills/base kit, fixed for the battle → computed at `makeCombatant` /
  deserialize, derived-not-serialized (rebuilt on load, like `tactics`).
- **Bounded per-decision-round work**: camps cluster only *visible* enemies
  via the round-start `SpatialHash` (O(E·local) neighbor queries, no O(E²)
  scan); `pullSetOf` BFS is capped (`PULL_SET_CAP`); camp pricing sums the
  already-computed `threat` record; assignments are O(members) over
  precomputed capabilities.
- **Per-round memo discipline**: anything ever priced per (enemy, member)
  reuses the `threatMemo` pattern (plan.ts) — generation-bumped, cleared per
  round, active only under the ambient spatial hash, and
  recomputation-transparent so replays stay byte-identical.
- **O(1) read side**: plan lookups per turn; the avoid list is a few ids
  (linear scan is fine); `scoreCandidate`'s conformance term is one distance.
- **Existing throttles compose**: `decisionInterval` already gates planner
  cadence on heavy fields; off-screen battles never run any of this
  (`creditOffscreen`); encounters are 15×15 with tiny enemy counts.

Worst-case sketch (open world, 6 heroes, ~12 visible of 40 monsters, on an
*uncommitted* decision round): clustering ≈ 12 local-hash queries, pull BFS
≤ ~144 distance checks, pricing 12 adds, assignment 6 capability reads —
order of one `steerAround` call, on the rare round it runs at all.

## 6. Constraints (non-negotiable, from the engine's invariants)

- **Determinism.** No RNG anywhere in the planner; camps, pull sets,
  assignments, and anchors enumerate in fixed order with id tiebreaks;
  commitment hysteresis via serialized fields + named margins (the
  `PULL_FRACTION` / `HUNT_RETAIN_MULT` pattern).
- **Snapshot fidelity.** All new `TeamPlan` fields and `objectives` are
  optional and serialized; legacy tokens read as absent ⇒ shipped behavior.
  Serialize→replay must stay 1:1 at every milestone; behavior changes are
  deliberate, test-updated events.
- **No-drift predictions.** `pullSetOf` shares the aggro predicates with
  `rallyPack`/acquisition; stance math reads `preferredAttackVs`/
  `threatProfile` — never parallel re-implementations.
- **Budget.** Planner-only cost, once per team per decision round, with the
  §5 memo/precompute/commitment-skip discipline. Nothing new in per-unit
  turns except O(1) plan reads and one extra `scoreCandidate` term.
- **Purity.** Planner stages live beside `plan.ts` (a `teamplan.ts` leaf):
  grid/types/damage/skills/spatial imports only — no store, no time.
- **Player lever wins.** Equipped tactics outrank plan defaults; a directive
  is the player *choosing* a planner emphasis, never the planner overriding
  a tactic.
- **Legibility over machinery.** No GOAP/HTN/behavior trees, no influence
  maps, no per-unit message passing, no generic utility framework. Plans
  are plain data a player could read off the Debug panel. If deeper search
  is ever wanted, the engine's determinism already offers clone +
  `advanceRound` rollouts behind `decide` — an experiment, not foundation.
- **Debuggability first.** The Plan panel and `bsnap -i` grow the new
  fields (`assign: pull(wolf-3)→(12,8) · stance hold · camp 4/7 cost 38 of
  52`); every engagement change pushes a trace line on why (abandon
  predicate or new camp). Extend `inspectLine`, don't hand-roll dumps.

## 7. Milestones (each independently shippable)

**M0 — TeamPlan v2 plumbing (byte-identical).** Add the optional fields +
`objectives`, serialization, `postureOf` columns (`cohesionW`, `pullBudget`
— read by nothing yet), the acumen computation + `ACUMEN` thresholds table
(gating nothing yet), per-combatant capability precompute, Plan-panel/
`bsnap -i` display. Planner publishes nothing new. Full suite + snapshot
fixtures unchanged.

**M1 — smart-party targeting baseline.** Planner publishes
`engagement.primaryId` — the kill-order policy (default dangerous-first
off the `threat` record ÷ TTK proxy) with commitment hysteresis — and
`avoidTargetIds` (v0: enemies beyond the hunt target's camp). `selectTarget`
gains the focus bonus + avoid filter. Kills "focus fire is opt-in".
Tests: convergence beats baseline time-to-kill on a mixed camp; the
dangerous foe dies before the trash; tank keeps aggro under focus;
avoid-listed bystander never acquired; replay 1:1.

**M2 — pull model + engagement commitment.** Camps, `pullSetOf` (shared
predicates with `rallyPack`), pull pricing/budget, engage-or-not, abandon
predicates, `pull` assignment + tag-and-drag execution, and the equippable
**Puller** tactic as its player-forced form. First `ACUMEN` gate goes live
(low-acumen teams skip prediction — they over-pull, diegetically). Showcase:
dense pack camp — party pulls singles it can't afford whole. Tests: pull-set
matches realized aggro exactly; over-budget camp → puller cycle; budget
collapse → disengage; brawn party over-pulls where scholar party doesn't.

**M3 — anchor, stance, formation.** `decide` picks stance + anchor
(v0 anchor: current ground or the nearest barrier gap toward the camp);
`anchor`/`hold` execution with fragility-ordered slot fan (outlier rear) +
the default standing guard on a fragility outlier; `cohesionW` term in
`scoreCandidate`; kite-stance default back-off; plan `corridor` + HERD_BIAS
retirement. Tests: line forms and holds a mapgen choke vs a swarm;
comp-driven stance flips (ranged party kites, melee party collapses); the
squishy outlier ends fights with visibly fewer hits taken; Geffen-2
file-around stays clean without HERD_BIAS.

**M4 — directives.** Registry + party slot + adapter injection + the launch
five; ambush/assassinate timing (cloak-hold orchestration). Persisted like
`partyTactics`; curated-mode gating via `unlocks.ts` like everything else.
Tests: per-directive scenario assertions; 5v5 arena showcase both-sided.

**M5 — objectives + chaperone.** `setTeamObjective`, escort/hold planner
branches, store wiring in the travel loop (set on transit-through-hunt,
clear on exit). Tests: traveler crossing a hunted map gets screened
(guards interpose on threats near the route); hold objective refuses drift.

**M6 — (experiment) joint rollout.** Only if M1–M5 leave visible dumb:
`decide` compares its top-2 engagements by cloning + `advanceRound`-ing a
few rounds (RNG-free ⇒ one rollout is a verdict), behind the same planner
signature. Explicitly not foundation.

## 8. Deliberately not building

Per-unit negotiation/auction protocols; a blackboard *write* API for tactics
(tactics stay read-only consumers — one writer, the planner); asymmetric
enemy AI machinery (monsters use the same planner + directives); formation
editors, role pickers, or any per-unit team-config UI (intent is read from
equipped tactics, capabilities from the kit; directives are the one coarse
party lever, same philosophy as postures-not-sliders); any lookahead beyond
M6's bounded experiment.
