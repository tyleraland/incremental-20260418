# Library mechanics guide (`src/lib/`)

Local reference for mechanics too detailed for the root collaborator guide.

## Offline progression (`offline.ts`)
`catchUp` (`App.tsx`) -> `batchTick(n)` for `n>10`. Offline progression does **not** re-simulate combat; it extrapolates rewards from realized rates.

- `worldCodec` persists `savedAt` -> `lastTickAt` so catch-up survives a full restart.
- Warm (`projectOfflineRewards`): scale a location's realized rate; exp/gold deterministic (floored EV), loot rolled per projected kill; exp pool split by level.
- Cold (`primeColdLocation`): budgeted real-combat slice (`PRIME_ROUND_CAP`=300, `PRIME_MS_BUDGET`=50ms) to seed a rate.
- Sampled (`projectOfflineSampled`): long absences split into independent windows (`SAMPLE_WINDOW_TICKS`, capped by `SAMPLE_MAX_WINDOWS`), re-stocked between, summed for variance.
- `OfflineSummary` modal appears when absence crosses `OFFLINE_SUMMARY_MIN_SECS`; rewards still apply below the display gate.

## Health and regen (`stats.ts`)
- `health` is an integer <= `maxHp = floor(50 + con * 10)`.
- Floor at the moment damage is written.
- `health <= 0` means KO; KO'd/recovering units do not fight.
- KO -> recovery (`recoveryTicksLeft` from `RECOVERY_TICKS`, no regen) -> resting (`isResting`, `RESTING_REGEN_RATE` to `maxHp`).
- Unassigned units regen at `REGEN_RATE`. `batchTick` applies the same in bulk offline.

## Exp and leveling (`offline.ts`)
- 1 XP per kill goes into a pool.
- Split across the surviving party proportional to level (`splitExpByLevel`) to discourage power-leveling.
- Shares are fractional; floor only at display. Same rule offline.

## Bug watchdog (`bugwatch.ts`)
- The live tick runs a cheap observational pass for stuck heroes and broken state invariants.
- Reports persist to the separate `bugReports` localStorage key, not the game save.
- Combat reports carry a `BSNAP`; state reports carry a small JSON repro blob.
- Reports surface in Time -> Debug -> Bug watch.
- Detection must never mutate engine, RNG, or battle state; replays stay byte-identical.
