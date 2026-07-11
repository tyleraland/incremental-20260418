# Engine guide (`src/engine/`)

Pure, deterministic, RNG-free spatial combat sim. Imports no game state/time/stats.
Engine changes must keep snapshot replays byte-identical.

## Battle state
- Per-battle grid: 15x15 encounters, open-world default 50x50.
- One battle per location: `BattleState { combatants[], zones[], barriers[], mode, round, outcome, events[], plans, stats, cols/rows, timeScale }`.
- Combatants are cloned from inputs and mutated in place each round.

## Modes
- `'encounter'`: discrete wave; ends victory/defeat/draw; fresh wave after `BATTLE_RESPAWN_TICKS`=15.
- `'open'`: persistent open-world; never self-terminates. Store keeps `openWorldCap`, trickles monsters every `OPEN_WORLD_SPAWN_TICKS`, reconciles heroes with `reconcileOpenPlayers`, and owns teardown.

## Round order
`advanceRound`: tick statuses -> tick zones -> tick cooldowns -> turn order (SPD desc, id tiebreak) -> each alive combatant `takeTurn` -> `evalOutcome` (`MAX_ROUNDS` draw).

## Cadence
- Store ticks `TICKS_PER_SECOND`=5; one engine round per tick (`ROUND_EVERY_TICKS`=1).
- Battles run with `ROUND_TIME_SCALE`.
- `BattleState.timeScale` defaults to 1 for replay compatibility and is applied via `engine/timescale.ts`.
- Engine/render coherence is pinned by `render/cadence.ts` + `Cadence.test.ts`; per-map load params by `map-perf-envelope.test.ts`.

## Movement and targeting
- `visionRange` gates targeting. No visible target -> deterministic wander (`hash01`, no RNG).
- `BattleState.peaceful` is set by the store for city traits and is not serialized; peaceful heroes mill individually.
- Neutral NPCs use `team: 'neutral'`: nobody's enemy, nobody's ally, never take a turn, and are immovable.
- Barriers block movement and LoS. `steerAround` pathfinds over barriers; unreachable targets hold. Arena bounds come from `engine/arena.ts`, not hardcoded clamps.
- **Grid-size independence (invariant).** No movement clamp may hardcode a size — read active bounds via `setArenaBounds`/`arenaClamp`. No tactic may hardcode absolute coordinates — everything is relative to enemies/allies/edges. Tuned-for-15×15 knobs an *encounter* still depends on (don't blindly scale them with the open-world map): `BASE_MOVE_SPEED`, reach bands in the adapter, `startingPosition` formations, `SEPARATION`, `HERD_BIAS`, kiter probe distance, `DEFAULT_CAM_SIZE`. Open-world has its own `followCamera` + `OPEN_CAM_SIZE`.

## Combat systems
- Spatial hash (`spatialhash.ts`) and per-turn vision cache (`spatial.ts`) are pure optimizations and must stay byte-identical to brute scan. The vision cache assumes one battle steps at a time.
- Targeting = hard taunt (`taunted`) > targeting tactics > threat fallback (`selectTarget`: threat - distance, with hysteresis). Damage and healing accrue threat; Taunt peels.
- Zones (`BattleZone`) are persistent ground areas. Damage uses the element matrix vs effective armor; DoT runs once per logical round.
- Defensive passives (Toughness/Evasion/Defensive Stance) set `Combatant.armorReduction`/`dodgePeriod`/`threatMult` in `adapter.ts`; monsters carry the same fields.

## Team blackboard (§coordination)
- `BattleState.plans`: per-team `TeamPlan` from the pluggable planner (waypoint/focus/threat/hunt), serialized in snapshots.
- TeamPlan v2 (`engagement`/`assignments`/`avoidTargetIds`/`corridor`), `BattleState.objectives`, and per-combatant `capability` (derived at makeCombatant/deserialize, never serialized) exist but `corridor`/objectives are absent-by-default — nothing populates or reads them yet (M3+). Design source: `tactical-coordination.md`; `teamAcumen` lives in `teamplan.ts`, gates/columns (`ACUMEN`, `cohesionW`, `pullMargin`) in `tuning.ts`.
- **M1 (targeting baseline) is live.** `decideEngagement` (`teamplan.ts`) publishes `engagement.primaryId` (dangerous-first, killability-weighted kill order off the plan's `threat` record, with commitment hysteresis via `PRIMARY_SWITCH_MARGIN`, `tuning.ts`) and `avoidTargetIds` (do-not-aggro bystanders) once a team has a visible enemy. `selectTarget` (`behavior.ts`) reads both: a `FOCUS_WEIGHT` bonus toward the primary (beside `THREAT_WEIGHT`/`PROX_WEIGHT`, tuned below the `PULL_FRACTION` aggro-hysteresis so a tank keeps aggro) and an avoid-list filter (bypassed only when every visible foe is avoided).
- **M2 (pull model) is live, gated on `ACUMEN.pull`.** `pullSetOf` (`teamplan.ts`) predicts who joins a fight via the SAME predicates `rallyPack` (engine.ts) actually runs — `callsPack`/`packRouses` (pack-tactics kin calls) and `passiveAcquires` (an enemy whose own vision covers the fight point) — extracted once so prediction can't drift from reality. `decideEngagement` prices each candidate's pull-set camp against the party (`RTK`/`RTD`, the mutual-TTK race vs posture-blended `pullMargin`) and commits to the best affordable one; below the acumen gate it falls back to M1's naive `CAMP_RADIUS` camp with no affordability check (an unintelligent party over-pulls, diegetically — re-read every decision round, so a mid-fight death can drop the gate). While committed, only cheap abandon checks run (`ENGAGE_EXIT` hysteresis) — the wide appraise is skipped. A solo fringe target adjacent to a bigger unaffordable cluster gets a `pull` assignment (`{ role: 'pull', targetId, to }`) instead, routed to a unit equipping the **Puller** tactic (declared intent) or the longest-`reach` capability pick; `pullMovement` (`spatial.ts`) is the one tag-and-drag implementation shared by the tactic and `executeMovement`'s fallback.

## Tactics
- `TACTIC_REGISTRY`; each tactic is on exactly one channel: movement/targeting/action/reaction/passive.
- `kind: 'floor'` fires on a basic precondition and is sorted below triggers in its channel by `demoteFloors`; default is trigger.
- Skills are injected as action-channel tactics via the adapter. `reorderAttacksForTarget` reranks single-target attacks against the locked enemy via `estimateDamageVs`; Exploit Weakness lowers the switch margin.
