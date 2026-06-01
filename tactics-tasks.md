# Tactics — Task List

Intent: make per-channel priority legible, kill starvation smells, wire the
blackboard's unused read side, and add a damage-aware action layer (burst).
Keep tactics pure within their channel; read forward in the pipeline
(targeting → movement → action); source shared facts from one place.

## 1. Floor vs trigger tagging
- Add `kind: 'floor' | 'trigger'` to `TacticDef` (`engine/types.ts`, `engine/tactics.ts`).
- Floors = fire whenever a target/ally exists: `tank-buster`, `flanker`, `kiter`, `guardian`. Rest are triggers.
- `resolveTactics` (`tactics.ts`): stable-sort floors to the bottom of their channel.
- Warn in UI when a floor sits above a trigger (it'd starve it).

## 2. Charger: plan → modifier
- `charger` currently always returns `{speedMult}` → starves movement channel.
- Make `speedMult` a modifier applied to whichever movement plan wins, not its own plan. Damage half (`chargerBonus`, read at `engine.ts:303`) is already decoupled — leave it.

## 3. Tactics UI: per-channel
- `Units.tsx` `TacticsTab`: group equipped into 5 channel lists; arrows reorder *within* a channel only. Document this.
- No hard 1-per-channel cap (layering is the feature).

## 4. Live "active now"
- `BattleView.tsx` `DebugTab`: per channel, mark the tactic winning *this turn* and why others are dormant (condition false vs starved-by-priority). Needs the per-turn resolution surfaced (extend trace or a per-turn resolution snapshot).

## 5. Wire the blackboard read side
- Planner already writes `focusTargetId`/`threat` each round (`defaultPlanner`, `engine.ts:613/685`); nothing reads them.
- Let targeting tactics read `state.plans[team]`. Retire duplicate "who's hurt" in `opportunist` + `finish-them` (compute once in planner).

## 6. Action selection policy
- Today: injected skills in fixed order (channeled-AoE first) + naive "first ready attack in range" (`behavior.ts` `chooseAction`).
- Add damage-aware ordering so an action tactic can choose cast order. Touches `makeCombatant` skill-tactic build (`engine.ts:65`) + `evalActionTactics`.

## 7. Per-unit tactic scratchpad (decide first)
- Burst needs anticipation/combo memory. Either: cooldown-lookahead (stateless) OR a small per-unit `tacticState` bag on `Combatant`.
- Pick one before shipping any stateful tactic. (Existing fakes: `tacticsUsed`, `interruptedCount`, `lastHitById`.)

## 8. Burst tactic (blackboard's first consumer)
- Targeting: "focus the support/healer" (reads blackboard focus).
- Action: front-load — open with biggest ready nuke; hold small skills if a big one is ≤N rounds from ready; chain after.
- Party-scope variant: whole team dumps on `focusTargetId`.
- Opt-in (rogue/coordinated party), not a default. Role-specific.

## 9. (Longer horizon) Collapse channels
- Migrate `action`/`reaction`/`passive` onto skills/traits/gear; keep `targeting`+`movement` as the explicit lever. Action is already skill-injected.

## Notes / open decisions
- First-match priority vs utility scoring: stay first-match now; revisit scoring only if "prefer X but weight by Y" becomes common.
- Extrapolation split (future): foreground = full spatial sim; background locations = cheap abstract DPS-vs-HP resolver. Decide if baked in now or deferred.
- Render interpolation (lerp token pos across rounds) is view-only, independent of any of the above.
