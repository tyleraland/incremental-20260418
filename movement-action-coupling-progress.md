# Movement ↔ action coupling — progress log

Running status of the milestones in `movement-action-coupling.md`.
Review companion: what shipped, where, what was deliberately deferred.

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

## Deferred / known gaps (by design, revisit in order)

- **M2 — candidate-position scoring** (skipped ahead of M3/M4 by request):
  generalize `escapeHeading`'s scored loop into `scoreCandidate` +
  `exposureAt`; kiter/wary-caster/default-hold propose candidates; fixes the
  cliffs/LoS/corner-stranding class in one place and fully subsumes
  `kiteToward`'s `aimOutOfRange` patch. `exposureAt` (built in M3) is the
  missing term it needed — M2 is now mostly wiring.
- `forecastAction(state, self, at)` castable-NOW shape ships with M2.
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
