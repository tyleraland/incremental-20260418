# Tactics — Task List

Intent: make per-channel priority legible, kill starvation smells, wire the
blackboard's unused read side, and add a damage-aware action layer (burst).
Keep tactics pure within their channel; read forward in the pipeline
(targeting → movement → action); source shared facts from one place.

## 1. Floor vs trigger tagging ✅
- `TacticDef.kind: 'floor' | 'trigger'` (default trigger). Floors: `tank-buster`,
  `flanker`, `kiter`, `guardian`.
- `resolveTactics` (`tactics.ts` `demoteFloors`) stable-sorts floors to the bottom
  of their channel, per channel, cross-channel interleave untouched.
- `TacticsTab` warns when an always-on (floor) tactic sits above a trigger in the
  same channel.

## 2. Charger: plan → modifier ✅
- `charger` no longer produces a movement plan. `chargerSpeedMult` folds its
  speed-up into whichever movement plan wins (`evalMovement`); it can't starve the
  channel. Damage half (`chargerBonus`) unchanged.

## 3. Tactics UI: per-channel ✅
- `TacticsTab` groups equipped tactics by channel (fixed `CHANNEL_ORDER`); ▲/▼
  reorder *within* a channel only (`moveTactic` swaps the nearest same-channel
  neighbour). No 1-per-channel cap — layering is the feature.

## 4. Live "active now" ✅
- `Combatant.lastResolution` (runtime-only, excluded from snapshot) records per-turn
  outcomes (fired / idle / starved / cooldown), written by the eval loops.
- `BattleView` DebugTab shows, per channel, what fired and why the rest are dormant;
  `buildDebugText` includes it.

## 5. Wire the blackboard read side ✅
- `teamFocus(self, state)` reads `state.plans[team].focusTargetId`. `opportunist` and
  `finish-them` read it instead of re-scanning; the "who's hurt" + vision/stealth
  filtering lives once in `defaultPlanner`.

## 6. Action selection policy ✅
- `skillDamageEstimate` (`damage.ts`) + `orderAttacksByPower` (`engine.ts`) inject
  attack skill-tactics biggest-first; first-match over them = "open with the
  hardest-hitting ready attack, fall through while it cools down." Channeled-AoE
  keeps its slot/gate; non-attack skills keep type priority.

## 7. Per-unit tactic scratchpad (decide first) ✅ — decision: stateless
- **Chosen: cooldown-lookahead (stateless).** No per-unit `tacticState` bag. Burst
  reads `skillCooldowns` to anticipate; combo "memory" is derived from cooldown
  state, not stored. Revisit only if a tactic needs memory cooldowns can't express.

## 8. Burst tactic (blackboard's first consumer) ✅
- `assassinate` (unit/targeting): hunt the enemy healer, else top caster.
- `burst` (unit/action): bank a ready small skill while the heavy hitter is ≤window
  (`2 + rank-1`) rounds out; never banks basic attacks (keeps tempo). Stateless.
- `focus-fire` (party/targeting, floor): whole team locks the shared blackboard
  focus — the first party-scope blackboard consumer.
- All opt-in (not auto-equipped), role-specific.

## 9. (Longer horizon) Collapse channels
- Migrate `action`/`reaction`/`passive` onto skills/traits/gear; keep `targeting`+`movement` as the explicit lever. Action is already skill-injected.

## Notes / open decisions
- First-match priority vs utility scoring: stay first-match now; revisit scoring only if "prefer X but weight by Y" becomes common.
- Extrapolation split (future): foreground = full spatial sim; background locations = cheap abstract DPS-vs-HP resolver. Decide if baked in now or deferred.
- Render interpolation (lerp token pos across rounds) is view-only, independent of any of the above.
