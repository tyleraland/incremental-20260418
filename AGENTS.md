# Collaborator Guide (CLAUDE.md ⇄ AGENTS.md — same file; CLAUDE.md is a symlink)

Mobile-first incremental auto-battler. Vite + React 18 + TS + Tailwind + Zustand +
@dnd-kit. Deploys to GitHub Pages on push to `main`. This file is a map/reference —
keep it terse and *accurate*; `BACKLOG.md` holds deferred work and known debt.

## Priorities
- Playable feel on mobile first; visual iteration speed over correctness.
- Tests/refactoring come later. No error boundaries, no abstraction the current code doesn't need.
- Three similar lines beat a premature abstraction.

## Where things live
- `src/stores/useGameStore.ts` — single Zustand store: all game + UI state, the tick loop, combat/offline orchestration. Exception: live battles in `battles[locationId]` (produced by the engine, not hand-written).
- `src/engine/` — pure, deterministic, RNG-free spatial combat sim. Imports no game state/time/stats. `adapter.ts` is the only `Unit`/`MonsterDef`+`DerivedStats` → `EngineUnitInput` translation. Never mutates inputs.
- `src/lib/` — `stats.ts` (`getDerivedStats` etc.), `offline.ts` (reward extrapolation + `splitExpByLevel`), `save.ts` (codec framework), `time.ts`, combat-report helpers.
- `src/save/*Codec.ts` — one save slice per concern.
- `src/data/` — registries + content: monsters, skills, recipes, equipment, traits, locations, scenarios, units.
- `src/components/` (BattleView, RosterCarousel, …) and `src/pages/` (Map, Units, Inventory, Guild, Time, Reports).

## Core patterns
- **Derived stats computed at render** (`getDerivedStats`), never stored. Same for `getUnitTraits`/`getAvailableSkills`.
- **Registries are plain exported objects**: `TRAIT/MONSTER/SKILL/RECIPE/TACTIC_REGISTRY`. Add entries there.
- **Collapsible rows**: `expandedXxxIds: string[]` in the store.
- **Portal modals** (`createPortal`) for popups escaping an overflow container.
- **Drag-and-drop**: PointerSensor only (no TouchSensor); set `touchAction: 'none'` on the draggable's style always (not just while dragging).

## Save & state tiers
- A save is a `v1:<base64>` envelope of independently-versioned **slices** (`src/lib/save.ts`). Each `SliceCodec` owns `serialize`/`deserialize`/`empty` + optional `migrate`. Missing slice → `empty()`; corrupt envelope → `{}` (safe no-op). `App.tsx` loads on mount, autosaves every 60s + on tab-hide.
- 10 codecs (`ALL_CODECS`, `src/save/index.ts`): units, inventory, locations, codex, world, combatStats, unitStats, unitHistory, battles, sockets.
- **Tiers** — *persistent*: units, inventory, learnedRecipes, location familiarity/seen, codex, locationStats, unitStats, unitHistory, partyTactics, ticks, **battles + battleCooldown + monsterSpawnTimers** (battlesCodec), **itemSockets** (socketsCodec), savedAt. *runtime*: locations, eventLog, lastTickAt, OfflineSummary. *ephemeral UI*: own localStorage keys (tabs, selections, expand state, camera nonces).
- Battles persist via `battlesCodec` as the engine's `BSNAP.<base64>` token (`serializeBattle`) — serialization lives in one place; the save composes it. `exportSave`/`importSave` round-trip the whole envelope (Time tab → Debug).

## Combat engine (`src/engine/`)
Deterministic, round-based **spatial** sim on a per-battle grid (15×15 encounters; open-world default 50×50). One battle per location: `BattleState { combatants[], zones[], barriers[], mode, round, outcome, events[], plans, stats, cols/rows, timeScale }`. Combatants are cloned from inputs and **mutated in place** each round.

- **Determinism**: no RNG; damage variation is a pure fn(round, combatant index). Loot/spawn RNG lives in the *store*, not the engine. Same roster+tactics replays 1:1. Engine changes MUST keep snapshot replays byte-identical.
- **Modes**: `'encounter'` (discrete wave; ends victory/defeat/draw; fresh wave after `BATTLE_RESPAWN_TICKS`=15) and `'open'` (persistent open-world, `openWorld: true`; never self-terminates; store keeps `openWorldCap` (default 8) monsters scattered, trickling one in every `OPEN_WORLD_SPAWN_TICKS`=30; heroes join/leave via `reconcileOpenPlayers`; store owns teardown).
- **A round** (`advanceRound`): tick statuses (DoT/age-out) → tick zones → tick cooldowns → turn order (SPD desc, id tiebreak) → each alive combatant `takeTurn` → `evalOutcome` (draw at `MAX_ROUNDS`=200).
- **Cadence**: store ticks `TICKS_PER_SECOND`=5; one engine round per tick (`ROUND_EVERY_TICKS`=1). Battles run `timeScale`=`ROUND_TIME_SCALE`=2 (finer rounds, ~2.5 *logical* rounds/sec). `timeScale` defaults to **1** on `BattleState` (engine suite/replays byte-identical) and is applied via the `engine/timescale.ts` ambient.
- **Vision & wander**: `visionRange` gates targeting (open-world fog; heroes 10, monsters 8 cells; `Infinity` in encounters). No target in sight → wander (heroes roam the team `waypoint`; monsters lurk then hop). Deterministic (`hash01`, no RNG).
- **Terrain**: barriers block movement + LoS (casters won't fire through walls; will through cliffs). `steerAround` = Dijkstra over the barrier set; unreachable → hold (`canReach` exposes it). Arena bounds read from the `engine/arena.ts` ambient — no size hardcoded in movement clamps.
- **Spatial hash** (`spatialhash.ts`) + **per-turn vision cache** (`spatial.ts`): O(local) neighbour scans / memoized `visibleEnemiesOf`. Both are pure optimizations gated to the live round and byte-identical to a brute scan (fall back to brute when no active hash). The vision cache is process-global and assumes one battle is stepped at a time.
- **Threat & aggro** (WoW-style): targeting = hard taunt (`taunted` status) > targeting tactics > threat fallback (`selectTarget`: `threat − distance`, 25% hysteresis). Threat accrues from all damage ×`threatMult` and from healing; the **Taunt** skill peels.
- **Zones** (`BattleZone`): persistent ground areas (Lightning Storm damage, Molasses slow, Consecration follow-aura). Damage runs the **element matrix** vs effective armor; three-phase "aura turn" eligibility; DoT once per logical round.
- **Snapshots** (`snapshot.ts`): `serializeBattle` → `BSNAP.<base64>` (everything the sim reads; not events/trace). `deserializeBattle` replays 1:1; `.<len>x<hash>` integrity guard. ⎘-state button in BattleView; replay via `npm run bsnap`.
- **Adapter**: defensive passives (Toughness/Evasion/Defensive Stance) set `Combatant.armorReduction`/`dodgePeriod`/`threatMult` here (MonsterDef carries the same fields).

## Tactics (the player's combat lever)
- `TACTIC_REGISTRY`; each tactic on exactly one **channel**: movement/targeting/action/reaction/passive. Evaluated per channel in priority order each turn.
- Unit equips ≤ `MAX_UNIT_TACTICS`=4 (`unit.tactics`); party shares ≤ `MAX_PARTY_TACTICS`=2 (`partyTactics`). Scope enforced by `TacticDef.scope`. Reorder within a channel only.
- `kind`: `floor` (fires on a basic precondition; `demoteFloors` sorts floors below triggers in their channel) | `trigger` (default).
- **Skills are injected as action-channel tactics** via the adapter. The biggest ready nuke leads; each turn `reorderAttacksForTarget` re-ranks single-target attacks vs the locked enemy via `estimateDamageVs` (`damage.ts`: element matrix + magic/physical mitigation, amortized over the cast cycle). **Exploit Weakness** lowers the switch margin (default 15%).
- **Only skills change numbers; tactics are pure behaviour.** Shield Wall / Last Stand are self-cast skills with gated cast tactics.
- Per-turn resolution recorded in `Combatant.lastResolution` (BattleView Debug tab); `Combatant.trace` is a 20-entry ring buffer.

## Combat view (a mode of the Map tab)
- No standalone Combat tab: `mapMode` is `'world'` | `'battle'`. `BattleView` is the drop-in viewer for `combatLocationId`. `RosterCarousel` stays pinned across both (scopes to the battlefield's heroes in battle mode and drives camera follow via `battleFollowId`).
- Drop in: double-tap a location or the **Drop in ›** button (`enterBattleView`); **⤢ Overworld** exits (`exitBattleView`).
- Only the *watched* battle full-sims per tick; others advance off-screen via `creditOffscreen` (rate extrapolation every `OFFSCREEN_CREDIT_TICKS`=25). World mode + tests full-sim every location.
- Motion rides CSS transitions (no rAF loop). Combatants mutate in place, so `BattleChip` is **not** `React.memo`'d. **LOD**: `BattleChip` drops its label/nubs past `LOD_CAM_SIZE`=18 cells or >`LOD_TOKEN_COUNT`=16 on-screen tokens.

## Offline progression (`src/lib/offline.ts`)
`catchUp` (`App.tsx`) → `batchTick(n)` for `n>10`. Does **not** re-simulate combat; **extrapolates rewards from realized rates**.
- `worldCodec` persists `savedAt` → `lastTickAt` so catch-up survives a full restart.
- *Warm* (`projectOfflineRewards`): scale a location's realized rate; exp/gold deterministic (floored EV), loot rolled per projected kill; exp pool split by level.
- *Cold* (`primeColdLocation`): budgeted real-combat slice (`PRIME_ROUND_CAP`=300, `PRIME_MS_BUDGET`=50ms) to seed a rate.
- *Sampled* (`projectOfflineSampled`): long absences split into independent windows (~`SAMPLE_WINDOW_TICKS`=30min, ≤`SAMPLE_MAX_WINDOWS`=12), re-stocked between, summed for variance.
- `OfflineSummary` modal shown when absence ≥ `OFFLINE_SUMMARY_MIN_SECS`=60s (rewards still apply below the gate).

## Health (covered by `health.test.ts`; `src/lib/stats.ts`)
- `health` is an integer ≤ `maxHp` = `floor(50 + con*10)`; `Math.floor` applied at the moment damage is written.
- `health ≤ 0` → KO; KO'd/recovering units don't fight.
- KO → recovery (`recoveryTicksLeft` from `RECOVERY_TICKS`=5, **no regen**) → resting (`isResting`, `RESTING_REGEN_RATE`=50 HP/tick to `maxHp`).
- Unassigned units regen `REGEN_RATE`=50 HP/tick. `batchTick` applies the same in bulk offline (no live-combat re-sim).

## Exp & leveling
- 1 XP per kill into a pool, split across the *surviving* party **proportional to level** (`splitExpByLevel`) — anti-power-leveling. Fractional shares; floored only at display. Same rule offline.

## Map & locations
- Map tab is a pannable overworld (`LOCATION_COORDS` in `Map.tsx`), not a list. `region` names the map page (`'world'`, `'geffen-dungeon'`); `mapPageId` selects it. Dungeons (`isDungeon`) are entered from `entryLocationId`.
- Tap a location → select + detail panel (units present, monsters, Familiarity = `locationFamiliarity[id]/familiarityMax`, deploy).

## Equipment & crafting
- Equip slots: `mainHand`, `offHand`, `sideboard1`, `sideboard2`, `armor`, `accessory`. Sideboard slots hold *reserved, stat-inactive* gear. A 2H weapon (`category 'weapon-2h'`) in `mainHand` locks `offHand`.
- Equip flow: tap a slot in Units → Inventory opens in equip-context → pick an item (shows stat deltas + `↑ Upgrade`) → back to Units.
- Crafting: `learnedRecipes[]` + `RECIPE_REGISTRY`; Craft enabled when `miscItems` hold every ingredient; consumes them, produces the output. **Known gap**: the crafting loop is disconnected (drops are `drop-*` with no item defs; recipe outputs are `craft-*` not in `equipment.ts`) — see BACKLOG.

## Expand/collapse persistence (localStorage)
`expandedLocationIds` `[]`, `expandedUnitIds` `[]`, `expandedInventorySections` (all expanded), `expandedRegionIds` `["world","geffen-dungeon"]`.

## Testing & verification
- `npm run ci` = `tsc --noEmit` + full vitest suite. Keep green; engine changes must keep snapshot replays byte-identical.
- Browser: use **Playwright, not the chrome-devtools MCP** (flaky here). `npm run e2e:install` once, then `npm run e2e` (mobile CPU-throttled 4×; logged fps is the signal; screenshot at `e2e/__shots__/<project>.png`). `?perf=1` drops into the heavy open-world scene (`src/dev/perfSeed.ts`). In DEV the store is on `window.__game`.
- `npm run bsnap -- <gist-url|raw-url|file|token|->` replays a `BSNAP` headlessly from TS source (`-n` rounds, `-w` watch ids, `-e` events). Caches to `.bsnap/last.txt`.

## Branching & merging
- Develop on a feature branch; **merge to `main` when a feature is complete** (`git merge --ff-only <branch> && git push origin main`) — `main` is what gets browser-tested. Don't wait to be asked.
- After pushing to `main`, include the commit hash in the chat reply.
- Open PRs auto-deploy to `https://tyleraland.github.io/incremental-20260418/pr-preview/pr-<N>/` (`pr-preview.yml`); share the exact URL.
