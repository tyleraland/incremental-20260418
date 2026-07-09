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

## Combat systems
- Spatial hash (`spatialhash.ts`) and per-turn vision cache (`spatial.ts`) are pure optimizations and must stay byte-identical to brute scan. The vision cache assumes one battle steps at a time.
- Targeting = hard taunt (`taunted`) > targeting tactics > threat fallback (`selectTarget`: threat - distance, with hysteresis). Damage and healing accrue threat; Taunt peels.
- Zones (`BattleZone`) are persistent ground areas. Damage uses the element matrix vs effective armor; DoT runs once per logical round.
- Defensive passives (Toughness/Evasion/Defensive Stance) set `Combatant.armorReduction`/`dodgePeriod`/`threatMult` in `adapter.ts`; monsters carry the same fields.

## Tactics
- `TACTIC_REGISTRY`; each tactic is on exactly one channel: movement/targeting/action/reaction/passive.
- `kind: 'floor'` fires on a basic precondition and is sorted below triggers in its channel by `demoteFloors`; default is trigger.
- Skills are injected as action-channel tactics via the adapter. `reorderAttacksForTarget` reranks single-target attacks against the locked enemy via `estimateDamageVs`; Exploit Weakness lowers the switch margin.
