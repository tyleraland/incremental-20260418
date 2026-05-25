# Combat / Tactic Engine — Backlog

Living list of deferred work and design direction for the combat engine
(`src/engine`). Implemented behavior lives in `CLAUDE.md` → Feature
Specifications; this file is what's *not* built yet.

## Deferred combat content

These were scoped out of the skill/combo phases; each needs a small new
primitive noted in parentheses.

- **Pneuma / protective zones** — a friendly ground zone that blocks (or halves)
  ranged damage to allies standing in it. (needs a `blocksRanged`/`damageMult`
  field on `BattleZone` + a check in the ranged branch of `dealAttack`.)
- **Reaction-channel skills** — Counterattack and Pneuma as *equippable skills*
  rather than the built-in `counterattacker` tactic. (extend `makeSkillTactic`
  to emit reaction-channel tactics; `ReactionResult` already supports
  `counterAttack`/`applyStatusToSelf`.)
- **Type-conditional skills** — Turn Undead / Magnus Exorcismus: bonus or
  instant-defeat vs a target *type*. Partly covered now via the `undead`/`ghost`
  elements + `radiant` attacks (2× / immunity already work); the "undead type"
  flag for instakill-style effects is separate. (needs a `monsterType` tag on
  `Combatant` + a `vsType` field on `EngineSkill`.)
- **Weapon-imbue & trait resistances** — units already forward
  `attackElement`/`armorElement` from gear; still TODO: element from *traits*
  (the `element` trait category exists but `getUnitTraits` doesn't return them),
  and per-unit resistance tables beyond a single armor element.
- **Elemental DoT / zones** — `poisoned` DoT and Firewall zone ticks are
  currently element-agnostic (bypass the matrix). Give them an element so e.g. a
  fire-immune enemy ignores Firewall.
- **Combat UI for elements** — color/agnostic "resisted / 2×" indicator on damage
  numbers; show effective vs current armor element on the chip.

## AI & tactics roadmap

Goal: get from "each unit independently walks at the nearest enemy" to
*coordinated, spatially-aware* play — and make team AI **injectable** so we can
author distinct enemy/ally strategies. Two complementary additions:

### 1. Team blackboard (shared per-round plan)

Today every targeting tactic recomputes its own pick, so units can't agree on a
plan. Add a deterministic, per-team scratchpad computed once at the start of
`advanceRound`, before turns, and stashed on `BattleState`:

```
state.plans: Record<Team, TeamPlan>
TeamPlan = {
  focusTargetId:   string | null  // who everyone piles onto (lowest eff-HP / highest threat)
  disableTargetId: string | null  // who to lock down (enemy's biggest threat / caster)
  threat:          Record<string, number>  // per-enemy threat score
}
```

Tactics *read* the blackboard instead of recomputing, which is what makes
"unit A disables X while B+C focus-fire Y" fall out naturally:

- **Controller** (action/targeting): lock `disableTargetId`, cast a disable
  (Freeze / Ankle Snare / Stun).
- **Focus Fire** (party targeting): lock `focusTargetId`.

The blackboard is produced by a pluggable **planner** — and that is the
injection point: *a team's AI = (planner, tactic loadout)*. Swap the planner to
get a different brain (aggressive focus, protect-the-healer, split-push) without
touching per-unit code.

### 2. Strategies = multi-channel tactic bundles

A single behavior like "assassinate the backline" spans channels (sneak →
flank → burst). Rather than ask players/authors to wire 4 tactics by hand,
add a `STRATEGY_REGISTRY` where each entry expands to a set of `TacticRef`s
(across channels) + an optional planner id. We already expand skill→tactic and
party→tactics; strategy→tactics is the same mechanism. Examples:

- **Assassinate** = focus-squishy (targeting) + flank-to-target (movement) +
  Cloak/Back Stab timing (action) — the LoL-style ambush.
- **Lock & Focus** = Controller on one unit + Focus Fire on the rest (via the blackboard).
- **Kite** = maintain-range movement + retreat-when-meleed + nearest targeting.

### 3. Spatial primitives (used by both player tactics and enemy AI)

**DONE** (`src/engine/spatial.ts`, movement tactics in `tactics.ts`): relative,
grid-size-agnostic queries — `centroid`, `nearestTo`, `nearestEnemyTo`,
`squishiestAlly`, `flankPoint`, `guardPoint` — and movement tactics built on
`MovementResult.toPoint` / `desiredRange`: **Flanker** (circle to the target's
weak side), **Kiter** (hold range, back off when closed), **Guardian**
(body-block the squishiest ally), **Regroup** (rejoin when isolated). Party size
is also uncapped now (formations stack into deeper rows).

Still TODO:

- **Ambush** combo: while `stealthed`, route to the flank of `focusTargetId`,
  hold until in Back Stab range, then burst. (needs the blackboard's
  `focusTargetId` + a "hold-until-in-range" gate on the Flanker move.)
- More queries when needed: by-rank (backline) targeting, frontline Y,
  "is in our backline?" (diving detection).

### Grid-size independence (invariant)

`COLS`/`ROWS` are the only size knobs. **No tactic may hardcode absolute
coordinates** — everything is expressed relative to enemies/allies/edges (ranks,
distances, centroids), so enlarging the grid just means longer approaches
(positioning gets *more* valuable) with zero logic changes. Things to re-tune,
not re-architect, when the grid grows: `BASE_MOVE_SPEED`, reach bands in the
adapter, `startingPosition` formations, and `SEPARATION` spacing.
