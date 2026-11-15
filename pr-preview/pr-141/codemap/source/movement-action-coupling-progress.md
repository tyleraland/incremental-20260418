# Movement ↔ action coupling — progress log

Running status of the milestones in `movement-action-coupling.md`.
Review companion: what shipped, where, what was deliberately deferred.
Also: §Capability scenarios (complexity stress-tests to build next) and
§Tech debt (what to pay down for dev velocity).

## Shipped

### Design (PR #127, merged — `2a57428`)
`movement-action-coupling.md`: root cause, target architecture (position-
parameterized action forecast · candidate-position scoring · exposure query),
the three motivating examples mapped, constraints, milestones M0–M4.

### M0 — position parameter (PR #128 — `5e626fe`, byte-identical)
- `selectSkillTarget` / `canFinishChannel` / `channeledAoeWorthIt` /
  `mostInjuredAllyInRange` take `at: Vec2 = self.pos` (the position a cast is
  evaluated FROM). Perception stays on the unit's real position — `at` moves
  reach and sightlines, not the eyes.
- Zero behavior change; full suite green untouched.
- Tests: `position-param.test.ts` (range / LoS / heal reach from `at`;
  omitted-`at` ≡ old behavior).

### M1 — the plan anchor (PR #128 — `9d11bb4`, first behavior change)
- New `src/engine/plan.ts`: `preferredAttackVs(self, target)` — offensive
  options scored vs a specific target by `estimateDamageVs` (element matrix,
  magic/physical mitigation, cycle amortization), distance/LoS-agnostic;
  `preferredRangeVs` = the hold range, `castRange` fallback when nothing
  scores.
- Anchored: Kiter + Wary Caster `desiredRange`, caster default hold,
  `kiteToward` shoot-on-the-lock range. `kiteDistanceFor(self, threat,
  maxRange = castRange(self))`.
- Uniform-range kits unchanged ⇒ existing suites green untouched.
- Tests: `plan.test.ts` (element flip, cooldown flip, Bash-vs-bolt anchors
  melee vs magic-immune, amortization, ties prefer reach, healer fallback,
  kiter wiring).
- Deviation from doc (recorded there): `forecastAction`'s castable-NOW shape
  deferred to its first consumer (M2) instead of shipping as a dead export.

### M3 — priced routes (this PR)
- `plan.ts`: `exposureAt(state, self, p)` — per-round expected damage from
  visible, provoked enemies whose reach + LoS covers `p` (their own
  `preferredAttackVs` score against us, floored at 1 to match the engine's
  minimum-damage rule); `corridorExposure(state, self, dest, stepLen)` —
  expected HP cost of walking the straight corridor, sampled at
  one-travel-step intervals (capped samples, scaled back to rounds).
- `avoidOrPlowPoint` escalation is now **priced**: avoid → plow only when the
  corridor costs ≤ `TRAVEL_HP_BUDGET` (35%) of current HP → otherwise
  **clear-first**: the march yields movement to the normal combat AI (the
  unit turns and fights) until the corridor price drops below the exit
  threshold (hysteresis via the serialized `travelClearing` flag), then the
  march resumes. Near-dest ring plows are priced the same way.
- Store-visible only as order latency, exactly as designed.
- Tests: `route-pricing.test.ts` (exposure discs + wall LoS, corridor
  pricing, cheap gauntlet still plows, deadly gauntlet flips to clear-first
  and resumes after the ring dies, snapshot round-trip of `travelClearing`).

### M4 — movement capabilities: Blink (this PR)
- Engine: `MoveAbility { kind: 'teleport', range, cooldown, needsLoS }` on
  `EngineUnitInput`/`Combatant` (`moveAbilities`, `moveAbilityCds` — both ride
  the snapshot; legacy tokens default empty). Cooldowns tick with
  skill/tactic cooldowns.
- **Escape**: `tryBlinkEscape` — when a retreat is called for but walking is
  cornered (even the best escape step fails to OPEN the threat gap — distance
  walked is the wrong signal; lateral pocket-shuffling moves plenty and gains
  nothing), a ready teleport jumps to the best sampled landing (16 directions
  at blink range; unblocked, in-arena, wall-LoS-gated when `needsLoS`; cliffs
  never block).
  Scored by clearance from provoked enemies, cohesion tiebreak. Wired into
  the kite retreat and the `awayFromNearestEnemy` retreat.
- **Pathing**: `steerAround`/`canReach` accept optional `caps` — teleport
  edges join the visibility-graph Dijkstra (≤ range, `needsLoS` ⇒ walls block
  but cliffs don't). With `caps` omitted the code path is byte-identical to
  before (steer-cache fuzz still green). Consumers pass caps explicitly;
  nothing in the engine's own movement loop does yet.
- **Overworld**: `Location.gatedConnections` (`{ to, requires }`) +
  `routeBetween(..., abilities)` — routes that exist only for owners of the
  named capability (the river-crossing example).
- Game data: `blink` registered in `SKILL_REGISTRY` (game) and mapped by the
  adapter (action-bar `blink` → `moveAbilities`), NOT in `COMBAT_SKILLS` —
  it's a movement capability, not a cast.
- Tests: `blink.test.ts` (cornered escape fires / holds without the ability
  or on cooldown, landing legality, capability-aware `canReach` across a
  cliff moat vs walls vs `needsLoS`, snapshot round-trip, replay
  determinism); `travelGraph` gated-edge tests.

### M2 — candidate scoring (this PR, landed after M3/M4)
- `skills.ts`: the generic skill-tactic gate extracted as **`skillCastTarget`**
  (cooldown, zone/active caps, cloak/shield-wall/last-stand gates,
  target/range/LoS, cluster gate, firewall-yield) — the live action tactic and
  the forecast now run literally the same function; `canFinishChannel`
  exported.
- `plan.ts`: **`forecastAction(state, self, at)`** — best castable-NOW
  offensive option from `at` (attack skills via `skillCastTarget`, the basic
  attack for non-casters, LoS-gated), plus `range`/`losClear`/`finishable`;
  **`MoveCandidate`** + **`scoreCandidate`** = forecast score − dead-banded
  ring-drift (`GAP_W`) − small exposure tiebreak (`EXPOSURE_W` 0.05 —
  deliberately tiny: a kiter fights from inside its own range, it doesn't
  hide).
- `kiteToward` rewired: positions against the **aim** (lock, else nearest
  threat); hold-vs-close is one scored choice (subsumes the `aimOutOfRange`
  patch — a lock beyond range simply makes `close` the only candidate that
  casts); wall-blocked corner-route and the tooClose retreat (escapeHeading
  hysteresis + blink) stay dedicated branches. Fixes the stranding class where
  the old sweet-spot demanded LoS to the *nearest* enemy and corner-routed
  toward a walled-off foe the kiter wasn't even shooting.
- Kite suites (`los-kiting`/`moat-kiting`/`molasses`/`healer-positioning`)
  stayed green untouched. Tests: `candidates.test.ts`.

## Deferred / known gaps (by design, revisit in order)

- **M2 leftovers**: the default caster hold (`executeMovement`) still uses
  `moveToward`-with-reach rather than proposing candidates;
  `escapeHeading` is not yet a candidate *proposer* (its scored loop stays
  private to retreats); no committed-candidate stickiness field (hold-first
  tie order is the only hysteresis in the new choice).
- Corridor pricing uses the **straight** (plow) line, not the full
  `steerAround` polyline — avoidance already handles affordable detours; the
  price only gates the plow/clear decision. Revisit if routes need true
  detour pricing.
- Exposure horizon is 0 (stationary-threat pricing): pursuers aren't priced
  into corridors. Fine for the ring-of-stationary-ranged case it targets.
- "Report blocked" (no corridor can be brought under budget → tell the
  logistics layer to reroute) not yet wired — clear-first keeps fighting
  instead. Needs a clearability judgment; design in doc §4.
- Blink is **not** an action-channel cast yet (doc §4.3): it fires in the
  movement phase with its own cooldown, so it doesn't compete with casting.
  Revisit when the action/movement turn accounting matters.
- Blink renders as a glide (`move` event) — same renderer gap as knockback
  (BACKLOG "knockback reads as a lurch").
- In-engine movement doesn't consume teleport pathing yet (hunt/waypoint
  reachability, move-order marches over gaps); overworld gated edges have the
  seam but no live content uses them.
- Monster `moveAbilities` (a blinking monster) — adapter maps heroes only.

## Capability scenarios — stress-testing the new infrastructure

Concrete setups that exercise several seams AT ONCE, in rough build order.
Each names the seams under test, the pass condition, and the harness
(`SCENARIO_REGISTRY` entry, engine test, or a `?mapgen=1`-style lab). These
are the "does it handle complexity" probes, distinct from the unit tests —
each is designed so a plausible-but-wrong implementation fails it visibly.

1. **The toll ring** (M3 pricing sharpness). One gauntlet map, three
   travelers: 60 HP glass courier, 250 HP bruiser, 600 HP tank, identical
   'avoid' orders through the same 5-shooter ring. Pass: tank plows, bruiser
   clears 1–2 shooters then walks, courier clears the whole arc — the SAME
   code choosing three different behaviors purely from the budget. Fails if
   pricing is binary (everyone clears or everyone plows). Engine test.

2. **The moving wall** (M3 vs mobile threats — a known gap, horizon 0).
   The ring, but the shooters slowly patrol. Today's pricing treats threats
   where they stand; this scenario MEASURES how wrong that is (expected vs
   actual HP loss crossing). It's the calibration harness for adding a
   pursuit horizon to `exposureAt` when we decide to. Engine test with an
   HP-loss tolerance band.

3. **Bolt-hole duel** (M2 forecast + M4 blink + kite safety interacting).
   A cliff-pocket arena: blink mage vs faster melee chaser, repeated
   pocket-corner-blink cycles. Pass: mage sustains DPS while never dying to
   a corner (blink saves it), AND the blink cooldown forces at least one
   walked escape per cycle (i.e. blink is spent, not hoarded, but walking
   still happens — exercises the cornered rule's both sides). Watch for
   blink-into-the-OTHER-corner failures: the landing scorer only reads
   current enemy positions, not the chaser's pursuit.

4. **The archipelago** (M4 pathing + hunt + logistics stacked). A mapgen
   map of 3 islands over cliff water: hero A has Blink, hero B doesn't;
   monsters on island 2, loot hauling to a city on island 1. Pass: A hunts
   across gaps (needs the deferred teleport-aware `pickHuntTarget`), B never
   strands at the bank; the expedition loop routes A's returns across the
   gated overworld edge and B the long way. This is the scenario that
   FORCES the two deferred M4 wirings (hunt reachability, store-side caps
   plumbing) — build it to drive them.

5. **Skill-x-vs-y positional duel** (M2's reason to exist). A hero with
   Bash (1.2) + Frost Bolt (6) vs alternating waves of magic-immune golems
   and fire-armored slimes on one field. Pass: it fights golems at melee and
   slimes at 5.5, re-anchoring per target with no dithering at the
   switchover (the hysteresis question M2 deliberately left to hold-first
   ties — this scenario tells us if that's enough or if we need the
   committed-candidate field).

6. **The bodyguard corridor** (composition: priced routes + party AI). An
   escort order: squishy courier with 'avoid' + a Guardian-tactic tank,
   through the toll ring. Pass: the pair's emergent behavior beats either
   alone (tank soaks the arc the courier can't afford; courier's corridor
   re-prices cheaper because the shooters lock the tank — exposure reads
   provoked/locked state indirectly through kills). Fails if the courier
   prices the corridor ignoring its escort entirely — which is today's
   truth, and this scenario decides whether that matters.

7. **Replay soak** (all seams × determinism). One long open-world battle on
   a mapgen map with kiters, a blink hero, travelers mid-clear-first, and a
   BSNAP taken every 50 rounds; each snapshot replayed to round 300 and
   diffed. Pass: byte-identical, always. This is cheap to build (the
   snapshot test pattern exists) and is the regression net the whole plan
   layer sits on. Belongs in CI.

## Tech debt — what to pay down for dev velocity

Introduced by this work (pay soon, cheap while fresh):

- **Trace/debug gap on plan decisions (top priority).** The doc's §5
  promised the chosen candidate kind + forecast note in `lastResolution`/
  trace and a `bsnap -i` plan line; none shipped. Every future kite/route
  tuning session pays for this in ad-hoc console.log archaeology — the
  codebase's own lesson (bsnap -i exists because of it) says build the
  inspection FIRST. ~Half-day: thread `MoveCandidate.kind` + forecast
  summary into pushTrace, extend `inspectLine` in scripts/bsnap.mjs.
- **kiteToward is now three planners in one function.** The tooClose
  retreat (escapeHeading + blink), the wall corner-route, and the scored
  hold/close each have their own geometry + logging conventions inside one
  ~90-line function. Next behavior (e.g. arc candidates, default-hold
  candidates) makes it worse. Extract each branch as a candidate *proposer*
  returning `MoveCandidate[]` and let one loop score/commit/trace — that's
  also exactly the M2 leftover.
- **Scorer weights are magic numbers in two places.** GAP_W/EXPOSURE_W/
  GAP_BAND (plan.ts) and TRAVEL_HP_BUDGET/TRAVEL_CLEAR_EXIT/BLINK_* 
  (engine.ts) are per-file consts. Fine today; the moment browser-tuning
  starts (it will — see BACKLOG's threat-tuning item), they should sit in
  one `plan-tuning` block like the engine's other named knobs, or every
  tuning pass greps.
- **`exposureAt` double-counts intent.** It prices enemies by
  `preferredAttackVs(e, self)` per query point — O(enemies × their skills)
  per sample, recomputed per candidate per turn. A per-(enemy, self) memo
  per round would cut the corridor-pricing cost ~10× and is required
  before scenario 7's soak runs at 50 combatants. Cheap: the vision-cache
  generation counter pattern already exists.

Pre-existing, newly load-bearing (this work leans on them; fixing pays
compound interest):

- **No fixture-based replay regression net.** "Engine changes must keep
  snapshot replays byte-identical" is enforced only by round-trip tests on
  synthetic battles, not stored fixtures — behavior changes (M1/M2 here)
  can't be told apart from replay breakage by CI. Scenario 7 fixes this;
  it should have existed before this project started.
- **`Combatant` is a 40+-field grab-bag.** Every milestone added fields
  (travelClearing, moveAbilities, moveAbilityCds) beside 15 other loose AI
  memories (avoid*, escapeDir, wander*, lastCast*). Serialization works by
  spread-luck: nothing but convention stops a non-serializable or
  Infinity-carrying field from silently corrupting BSNAPs (visionRange
  already needs a special case). Group the AI memory into a serialized
  `mind` sub-object with an explicit codec, or at minimum a type-level
  test that every Combatant field survives JSON round-trip.
- **`eu()`/`combatant()` test builders drift.** Adding a required Combatant
  field means editing helpers.ts by hand (bit us this project). Derive the
  test builder from `makeCombatant` (build a real one, override) so new
  fields are picked up automatically.
- **The tactics-casting/kite suites assert OUTCOMES, not intents.** They're
  excellent black-box nets (they caught nothing this time because behavior
  held), but when a scored decision changes for a good reason, the failure
  message is "hp was 400" — a day of archaeology. The trace/debug item
  above is the fix; mentioning here because it's the same investment.

## External review (two independent Sonnet passes, post-M2)

One agent audited doc-vs-code fidelity, one hunted bugs (determinism,
snapshot fidelity, vision-cache poisoning, caps-Dijkstra, exposure
semantics). Invariants held: no RNG, no replay divergence, no cache
poisoning (hypothetical-position evaluation is purely geometric and never
routes through the position-keyed vision cache), snapshot spread pattern
consistent with the pre-existing avoid*/escapeDir precedent.

**Fixed in response:**
- Doc §5 debuggability promises delivered: the committed kite candidate +
  forecast note now rides the turn trace (`kite: hold ✓fire-bolt(18)` /
  `kite: cornered → blink` / `kite: corner-route (wall)`), and `bsnap -i`
  grew the `plan{cast=… r=… los=… fin=… exp=… blinkCd=… CLEARING}` line.
- Corridor (re-)pricing gated to decision rounds — the heavy-field
  `decisionInterval` throttle now bounds M3's cost; committed march/clear
  modes carry between decisions (test: deadly gauntlet at interval 5).
- `exposureAt` threat radius now uses OFFENSIVE reach only (basic attack +
  damage skills) — a pure healer no longer prices as a heal-range threat
  disc (it still threatens its melee poke).

**Accepted / deferred with eyes open:**
- **AoE blindness** (the biggest honest cut): `preferredAttackVs`/
  `forecastAction` see only single-target attacks, so Storm Caller — one of
  the doc's own four "partial re-implementations" — is NOT yet unified, and
  `exposureAt` scores AoE-armed enemies (elite-ranger/rogue) by their basic
  attack (their AoE range does widen the reach disc after the fix above).
  The BACKLOG "AoE spread value" scorer is the single fix for all three.
- **Forecast can't see the action channel's priority stack** (consumables,
  Burst, Chain) nor `exploitMargin`'s 15% near-tie hysteresis; Chain runs
  its own partial cast gate instead of `skillCastTarget` (pre-existing
  drift — folding it in changes Chain behavior, do it deliberately).
- **Kite safety floor now anchors on the lock's preferred range**: a
  battlemage closing to bash a magic-immune lock tolerates a nearer ranged
  threat (~30% closer in the review's A/B) than the old castRange-anchored
  hold did. Partly the point of M1 (the old margin was an accident of the
  wrong anchor); the principled fix is an exposure term in the safety floor,
  which is the same work as pricing pursuit (scenario 2).
- **Blink landing scorer reads current enemy positions only** (no pursuit
  prediction) and the kiter's per-round hold-vs-close scoring is not yet
  decision-round-gated / memoized (see tech debt).

### Levers (post-review slice): tuning.ts + the posture dial
- `src/engine/tuning.ts` — the ONE file a tuning pass greps: global plan
  knobs (⏱-marked where the number needs gameplay review) + the POSTURES
  policy table. Pays down the "scorer weights are magic numbers in two
  places" debt item.
- **Posture** — the first player-facing behavior dial: `Unit.posture`
  ('bold'/'steady'/'wary', default steady ≡ pre-posture behavior), one row of
  weights read by scoreCandidate (exposureW), corridorAffordable
  (travelBudget), and tryBlinkEscape (blinkGain). Segmented control at the
  top of the Tactician lens; live combatants pick edits up via
  relinkCombatant (which now also refreshes moveAbilities — an M4 gap).
  Serialized as the id, not the weights, so re-tuning a row re-tunes live
  saves.
- The doc's new §4.5 records the three lever tiers and the extension rule
  for future high-level priorities: new consideration = new POSTURE COLUMN
  (or a tactic when it needs its own behavior channel), never a per-unit
  slider.
- Tests: `posture.test.ts` (table ordering, steady default, exposure
  scoring gradient, the self-calibrating toll-ring bold-plows/wary-clears
  A/B, snapshot + relink plumbing) and the Tactician-lens dial smoke test.

### Debt paydown + the Plan debug panel (post-levers slice)
- **exposureAt per-turn threat memo** (was the "required before the
  50-combatant soak" item): the position-independent half of each enemy's
  threat (offensive reach + best-attack score vs us) is memoized per
  (enemy, self) per turn behind the same discipline as the vision cache —
  active only inside a stepping round, generation-bumped every takeTurn,
  cleared every round. Corridor pricing drops from O(samples × enemies ×
  their skills) to O(samples × enemies) after the first sample. Pure
  memoization of pure functions on turn-stable inputs ⇒ byte-identical.
- **Combatant serialization contract** (was "serialization works by
  spread-luck"): `snapshot-fields.test.ts` round-trips a fully-populated
  combatant and fails loudly if any field is dropped, diverges, or carries
  a function/NaN/Infinity (visionRange excepted). New fields must be added
  to its `populate` — the test file says so at the top. The deeper `mind`
  sub-object refactor stays deferred: the contract test buys the safety at
  ~5% of the churn.
- **Scorer knobs** — already centralized in `tuning.ts` (levers slice).
- **Test builders** — left as-is deliberately: tsc already fails loudly
  when a required Combatant field is missing from the literal builders
  (that's how both additions this project were caught); deriving them from
  makeCombatant would change what `combatant({skills})` means (skill-tactic
  injection) and ripple through existing tests for little safety gain.
- **Plan debug panel** (BattleUnitSheet Debug tab): a live plan-layer
  readout recomputed on render through the SAME pure functions the AI
  decides with — cast-now forecast (option → target, per-round score),
  preferred-attack anchor vs the lock (+ current distance), LoS /
  channel-safety / per-round exposure at the current spot, route price vs
  posture budget (+ the ⚔ clearing flag) while marching 'avoid', blink
  range/cooldown, and the posture row. The copy-to-share debug dump gains
  the same line, so bug reports carry it. Tests: `PlanPanel.test.tsx`.

### Showcase battles + deep-linkable sandbox (this slice)
- `src/dev/showcaseBattles.ts` — four curated, deterministic scenes, each
  isolating one behaviour: `kite-anchor` (right range per target: melee the
  magic-immune golem, range the sorcerer), `blink-escape` (teleport out of a
  cliff pocket), `moat-kite` (hold + fire across a cliff, don't path around),
  `posture-routes` (bold/steady/wary through identical archer rings — plow vs
  clear-first). Pure builders over the public engine API.
- Battle Sandbox (`?sandbox=1`) gains a **Showcase** source (dropdown +
  blurb/what-to-watch) alongside Compose and BSNAP, and **deep-links**:
  `?showcase=<id>` (short) or `?bsnap=<token>` (any battle) auto-load on
  mount; `?play=1` auto-runs; `?title=` captions. A 🔗 Link button copies a
  shareable URL to the current battle (short showcase form when applicable,
  else an embedded BSNAP). Shared links open the sandbox regardless of
  progression mode (App.tsx), never touch the save (noPersist), and arrive
  with the control panel collapsed + a caption banner for a clean view.
- Tests: `showcase.test.ts` (each scene builds, round-trips through a BSNAP,
  and exhibits its advertised behaviour); live-probed in a browser (caption,
  load, auto-play, zero console errors).
- Combined with the Plan panel (Debug tab), a viewer can watch a strategy AND
  read the exact numbers driving it — the seam is now demonstrable, not just
  described.
