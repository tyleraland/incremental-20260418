# Code Audit — stale comments, dead code, hardcoding, tech debt, bugs/risks

Temporary working doc on branch `claude/performance-md-status-vxrazs`. Produced by a
read-only fan-out audit (5 sub-agents). **Nothing here is fixed yet** — this is the
inventory to triage. Delete this file once items are ticketed/cleaned.

Legend: `[STALE]` comment contradicted by code · `[DEAD]` unused/abandoned ·
`[HARD]` hardcoded/magic value · `[DEBT]` acknowledged shortcut/awkward shape ·
`[BUG]` likely-wrong/risky · `[DUP]` drifting copy-paste. "(suspected)" = lower confidence.

---

## ⭐ Highest-priority (scariest first)

- `[BUG] src/engine/engine.ts:1488` — a **fizzled** channel sets `skillCooldowns[id] = skill.cooldown` raw, but every successful cast uses `recordSkillUse → scaleRounds(cooldown)`. Under `timeScale>1` a fizzle gives a shorter cooldown → diverges with timeScale. Fix: `scaleRounds(skill.cooldown)`.
- `[BUG] src/lib/stats.ts:43-48` — weapon-element loop `[mainHand, offHand]` lets **offHand override mainHand** (`attackElement = item.element`, last wins), contradicting the comment "mainHand wins." Verify intent.
- `[BUG] src/engine/snapshot.ts:144` — integrity guard only verifies the hash when `body.length === guard.len`; a paste **longer** than expected (appended garbage) passes the `>=` length check and skips the hash. Only truncation is caught. Fix: always hash, or check `!==`.
- `[HARD/BUG] src/engine/constants.ts:21-22 + grid.ts:38 + barriers.ts:170` — `PERIMETER_LEFT=2`/`PERIMETER_RIGHT=13` and `steerAround` herd-pivot `COLS/2` are baked for a **15-wide grid** and used **unscaled** on open-world (50×50) arenas → "perimeter"/herd-bias meaningless on big maps. Should read `arenaCols()`.
- `[DEAD] src/components/ActivityConsole.tsx (whole file)` — never imported/mounted anywhere; Time.tsx has its own inline `ActivityLog`. Dead file (also duplicates the category→meta map). Delete.
- `[DEAD] src/lib/time.ts:13-18` — `FLEE_TICKS_CONST`, `WAVE_COOLDOWN_MIN/MAX`, `ATTACK_SPEED_BASE`, `APPROACH_DISTANCE`, `APPROACH_SPEED` are exported but unused (legacy of the removed per-slot/1D combat model); their comments describe gone behavior. Delete.
- `[DEBT] src/stores/useGameStore.ts:1084-1095 ↔ 1735-1744` — initial state (familiarity/seen/partyTactics/recipe ids) is **hardcoded and duplicated verbatim** between the store initializer and `resetSave`; two copies must stay in sync. Extract an `INITIAL_*` factory.
- `[BUG] src/save/locationsCodec.ts:15-18 + inventoryCodec.ts:19-23` — `deserialize` assigns `data.familiarity`/`monstersSeen`/`equipment`/`miscItems`/`learnedRecipes` **without `?? {}`/`?? []` fallbacks** (other codecs guard). A partial/malformed slice writes `undefined` into store collections → crashes on next read. Round-trip asymmetry (serialize guards, deserialize doesn't).
- `[DEAD] src/types.ts:45 + data/equipment.ts` — the `tool` equip slot is **vestigial**: live model is 6-slot (`mainHand/offHand/sideboard1/sideboard2/armor/accessory`), no unit equips a tool, tool items (handaxe/pickaxe/lockpick) are unreachable. **Contradicts CLAUDE.md** (which still lists `tool` as a slot).

---

## 1. Engine simulation core (`engine.ts`, `behavior.ts`, `tactics.ts`)

### STALE
- `[STALE] engine.ts:936` — "nearest enemy (with taunt bias)"; `selectTarget` has no taunt bias (taunt handled earlier via `taunted` status). Drop the parenthetical.
- `[STALE] engine.ts:1039 / tactics.ts:38` — `focusTargetId` readers list is incomplete (omits `focus-fire`, tactics.ts:398).
- `[STALE] behavior.ts:1-4` — header frames tactics as "a later layer [that] will override"; tactics are fully shipped. Dated framing.
- `[STALE] tactics.ts:9-11` — "v0.1 catalog: tactics that need no skills or consumables" — registry now holds skill-coupled tactics + monster dispositions. No longer true.
- `[STALE] behavior.ts:93-94,121-123` — "until tactics/skill layers land" hedging; that layer shipped.

### DEAD
- `[DEAD] engine.ts:16` — `clampToGrid` imported, never used.
- `[DEAD] engine.ts:45` — `Planner`, `TacticResolution`, `FireWall` types imported, never used.

### HARD
- `[HARD] engine.ts:848` — taunt threat bump `top * 1.1` (+10%) bare literal; name it.
- `[HARD] engine.ts:1317,1335` — `kiteToward` `band = 0.4`; same 0.4 concept in `escapeHeading` awayOpen gate. Not centralized.
- `[HARD] engine.ts:701` — summon fan-out offsets `1.3` / `±1.2` bare literals.
- `[HARD] engine.ts:332 + 1205` — "arrived" radius `0.6` duplicated (const `MOVE_ORDER_ARRIVE` vs inline wander check). See DUP.
- `[HARD] tactics.ts:220,286` — `charger` `meleeRange*0.9`, `guardian` `SEPARATION*1.6` bare multipliers.

### DEBT
- `[DEBT] tactics.ts:9` — explicit "v0.1 catalog" marker.
- `[DEBT] engine.ts:1529` — `rallyPack` "threat-based retargeting … is a later extension — for now adopt the caller's foe."

### BUG
- `[BUG] engine.ts:1488` — fizzled-channel cooldown unscaled (see Highest-priority).
- `[BUG] behavior.ts:51-82 (suspected)` — `selectTarget` mutates `self.lockedTargetId` as a side effect *and* returns the old id for the caller to re-emit; lock written in two places — fragile contract.
- `[BUG] tactics.ts:96-104 (suspected)` — `pickBy` ties use exact float `===` while `selectTarget`/`mostInjuredAllyInRange` use an EPS band; inconsistent tiebreak on float scores.

### DUP
- `[DUP] engine.ts:426-431 ↔ 608-613` — channel-interrupt block (emit `interrupt`, null channel, `interruptedCount++`) copy-pasted in `knockbackTarget` & `dealAttack`. Extract `disruptChannel()`.
- `[DUP] engine.ts:333 ↔ 1205` — "arrived" `0.6` un-shared.
- `[DUP] tactics.ts:244,296` — `flanker` & `ambusher` identical `flankPoint(...)` call.
- `[DUP] tactics.ts:45 ↔ behavior.ts:20` — `isCloaked` re-implements exported `isStealthed`.

---

## 2. Engine support (`skills, spatial, grid, barriers, snapshot, adapter, elements, status, firewall, constants, timescale, arena, spatialhash, damage, types, index`)

### STALE
- `[STALE] index.ts:2-5` — banner "deterministic 5v5 grid autobattle … v0.1: engine core only, Tactics … future layers." All shipped; not 5v5/v0.1.
- `[STALE] grid.ts:2` — "Continuous 2D space on a 5×10 logical grid"; actually 15×15 / per-battle.
- `[STALE] adapter.ts:36` — "engine grid is 5×10 abstract units"; same stale 5×10.
- `[STALE] skills.ts:26-29` — `cd()` cites "store ROUND_EVERY_TICKS=2 over TICKS=5"; `ROUND_EVERY_TICKS` is now 1 (timeScale=2 carries it). Derivation stale.
- `[STALE] elements.ts:5-6` — header says "2x/1x/0.33x/0x" but the 4-element wheel uses 1.5x/0.75x/0.25x (lines 28-42). Header describes superseded scheme.
- `[STALE] spatial.ts:235` — orphaned trailing comment fragment ("shoot that round — preferable to dying mid-channel.") detached after a doc block was spliced. Re-stitch.
- `[STALE] types.ts:91 (suspected)` — `StatusEffect.flags` example lists `'channeling'`; nothing sets it (channel lives on `Combatant.channel`).

### DEAD
- `[DEAD] grid.ts:5` — `BASE_MOVE_SPEED` imported, unused in file.
- `[DEAD] constants.ts:8 (suspected)` — `BASE_MOVE_SPEED` exported but never read by engine logic (moveSpeed comes from adapter per-unit).

### HARD
- `[HARD] constants.ts:21-22 + grid.ts:38` — `PERIMETER_LEFT/RIGHT` 15-grid-baked, unscaled (see Highest-priority).
- `[HARD] barriers.ts:170` — `steerAround` herd pivot `COLS/2`, not `arenaCols()/2`; mis-herds on big arenas.
- `[HARD] barriers.ts:209-211` — `arenaBarriers()` builds cross from `COLS/ROWS` consts, not active bounds (ok if only 15×15).
- `[HARD] skills.ts:29` — `ROUNDS_PER_SEC = 2.5` magic conversion duplicated from store pacing; will drift if pacing changes.
- `[HARD] firewall.ts:35` — default `thick=0.35` duplicated as literal in callers; extract `WALL_THICK`.
- `[HARD] barriers.ts:101` — `slideMove` `0.05` tolerance + `0.2` step appear repeatedly, undocumented unit (cell-scale).

### DEBT
- `[DEBT] index.ts:2` — "(see spec in repo history)" / §-numbered comments reference an out-of-tree spec, so "verify comment vs spec" is impossible. Link CLAUDE.md/AGENTS.md.
- `[DEBT] damage.ts:11-12 (suspected)` — `StatKey` includes `'magicDef'` but `STAT_KEYS` excludes it; a formula using it silently → 0. Latent trap.
- `[DEBT] types.ts:82` — `StatModifiers.acc` "tracked & shown … but not yet rolled in combat." Declared-but-unused-in-resolution.
- `[DEBT] snapshot.ts:99` — "~12 combatants" assumption false for open-world hordes; figure misleads.

### BUG
- `[BUG] snapshot.ts:144` — integrity guard misses over-length pastes (see Highest-priority).
- `[BUG] spatial.ts:56-59 (suspected)` — process-global `visionCache`/`visionGen` ambient relies on the single-battle-at-a-time invariant; interleaved battles could collide on `self.id`. Document the hard dependency (this is the cache I just added — worth a note).
- `[BUG] grid.ts:163 (suspected)` — `enforceSeparation` shove ÷ `timeScale()` but query radius/skip are scale-independent; verify `SPATIAL_MARGIN ≥ max per-round move` at all scales.

### DUP
- `[DUP] damage.ts:109-118 ↔ 49-64` — `estimateDamageVs` re-implements `defaultCalculateDamage`'s magic-detection + mitigation; will drift. Factor the raw-minus-mitigation core.
- `[DUP] skills.ts:305-314` — `activeZoneCount`/`activeWallCount` near-identical (low priority).

---

## 3. Store & lib (`useGameStore.ts`, `lib/*`)

### STALE
- `[STALE] useGameStore.ts:81-85` — "RUNTIME — not saved" header covers `battles`, `battleCooldown`, `monsterSpawnTimers`, `itemSockets`, but those ARE persisted (battlesCodec/socketsCodec) per CLAUDE.md. Mislabels the tier.
- `[STALE] lib/time.ts:13-18` — legacy constants' comments describe the deleted 1D/per-slot model (flee machine, "1D combat axis", "monsters spawn here").
- `[STALE] lib/time.ts:16` — `ATTACK_SPEED_BASE` cooldown formula no longer used (cadence is `basicAttackInterval`, `REF_ATTACK_SPD=10`).
- `[STALE] useGameStore.ts:1043` — encounter-end log uses category `'flee'` for non-victory; outcomes are victory/defeat/draw now. (NB: agent 5 area — `flee` is still a live *monster tactic*, but using it as an *outcome* label here is the leftover.)

### DEAD
- `[DEAD] lib/time.ts:13-18` — the 6 legacy constants are unused (see Highest-priority).
- `[DEAD] useGameStore.ts:1725-1768 (suspected)` — `resetSave` omits clearing persistent `unitStatHistory` and `lastCatchUp` → stale history survives a reset (inconsistent with wiping `unitStats`).

### HARD
- `[HARD] useGameStore.ts:1084-1095 ↔ 1735-1744` — duplicated hardcoded initial state (see Highest-priority).
- `[HARD] useGameStore.ts:196` — event-log ring cap `200` inline.
- `[HARD] useGameStore.ts:211` — ability-point grant `floor(level/5)+3` inline magic `5`/`3`.
- `[HARD] useGameStore.ts:1371` — offline-log gate `n >= 50` unnamed (≈10s), separate from the named summary gate.
- `[HARD] lib/stats.ts:22-24,63-73` — combat-passive curves + derived-stat coefficients all inline (tuning file; undocumented as a group).
- `[HARD] useGameStore.ts:53` — `DEFAULT_COMPANION` hardcodes `speciesId:'wolf'`.

### DEBT
- `[DEBT] useGameStore.ts (1771 lines)` — monolith; the offline sim/priming block (~220-672) is engine-adjacent and could move to `lib/offline.ts`.
- `[DEBT] useGameStore.ts:1119-1155 ↔ 1322-1368` — `tick` and `batchTick` re-implement recovery/resting/idle-regen/level-up separately; bulk path can drift from the per-tick state machine.
- `[DEBT] lib/combatReport.ts:17,22-23` — `_window`/`CombatReportWindow` param unused (eslint-disabled); only `{kind:'ever'}` supported. Speculative generality.
- `[DEBT] lib/offline.ts:639` — `SampledOptions.prepareWindow` "today nothing passes it" (documented dead-for-now hook).

### BUG
- `[BUG] lib/stats.ts:43-48` — offHand overrides mainHand element vs comment (see Highest-priority).
- `[BUG] useGameStore.ts:1293 (suspected)` — `locTally.expGained = amt` overwrites (vs `+=` used by every other fold two lines down); silently clobbers if a future slice estimates exp.
- `[BUG] useGameStore.ts:944-948 (suspected)` — off-screen heroes accrue `combatTicks` (DPS denominator) every tick but rewards credit every 25th → off-screen lifetime DPS diluted vs on-screen.
- `[BUG] useGameStore.ts:1122,1325 (low)` — `health===0 && recoveryTicksLeft===0 ⇒ isResting` auto-repair can mask a missing `recoveryTicksLeft` set elsewhere.

### DUP
- `[DUP] useGameStore.ts:582-589 ↔ 822-830 ↔ lib/offline.ts:108-115` — per-kill drop-roll copy-pasted in `runCombatSlice`, `rewardKills`, `rollOfflineLoot`. **Three copies** of the loot semantics.
- `[DUP] useGameStore.ts:820,916,1299 + offline.ts` — empty `LocationCombatStats` literal repeated ~4×; no `emptyLocationStats()` factory (unlike `emptyTally()`).

---

## 4. Components & pages (`components/*`, `pages/*`, `App.tsx`, `dev/*`)

### STALE
- `[STALE] BattleView.tsx:10-12` — `ROUNDS_PER_SEC` comment cites `ROUND_EVERY_TICKS=2`; it's 1 now (value 2.5 right but it's *logical* rounds via timeScale).
- `[STALE] BattleView.tsx:329-330` — `ROUND_MS=400` comment cites `ROUND_EVERY_TICKS=2`; raw round is 200ms now (400 = one *logical* round).
- `[STALE] BattleView.tsx:113-116,1077-1079` — migration-era narrative about the removed `useSmoothScene`/rAF; `rpos`/`rposId`/`fxPos` are now identity passthroughs (vestigial seam, see DEAD).

### DEAD
- `[DEAD] components/ActivityConsole.tsx` — whole file unused (see Highest-priority).
- `[DEAD] BattleView.tsx:1072-1074` — `rpos`/`rposId` are identity wrappers around `c.pos` left from the removed interpolation; collapse/inline.
- `[DEAD] BattleView.tsx:1074 (suspected)` — `fxPos` `?? byId(id)?.pos` branch unreachable (`rposId` already does that lookup).

### HARD
- `[HARD] BattleView.tsx (many)` — `380ms` transition literals (353,445,655,683; RosterCarousel:227) approximate `ROUND_MS` but unlinked → drift if cadence changes.
- `[HARD] BattleView.tsx:863,1354,1375,471` — fixed px sizes (minimap `BOX=64`, rings `w-16/w-24`, EdgeMarker `w-6`) don't scale with zoom (acceptable, but uncited).
- `[HARD] BattleView.tsx:308-314 ↔ RosterCarousel.tsx:13-19` — `CLASS_ICON` duplicated verbatim (comment admits mirroring). See DUP.
- `[HARD] pages/Map.tsx:92-94,101-120` — `CELL_W/H/GAP`, `ELEMENT_COLORS`, `LOCATION_KIND` inline tables; `'geffen-city'` default fallback (245) magic id.
- `[HARD] Map.tsx:146 + RosterCarousel.tsx:113` — `300`ms double-tap window + 6px drag threshold duplicated across ≥3 handlers. Extract `TAP_MS`/`DRAG_THRESHOLD`.
- `[HARD] dev/perfSeed.ts:11` — `targetHeroes=12`; header narrates "25×25, cap 25" which live in location data (drift risk).

### DEBT
- `[DEBT] pages/Units.tsx:754, Map.tsx:587, Guild.tsx` — in-product "coming"/feature-promise copy (e.g. "a dedicated pet XP track is coming").
- `[DEBT] BattleView.tsx:209,287 + Map.tsx:287` — production code branches on test env (`catch { /* noop in tests */ }` around `setPointerCapture`).
- `[DEBT] RosterCarousel.tsx:67,363-383` — "experimental 'Area' view"; `location` sort comparator is a no-op stub for grouped mode.
- `[DEBT] pages/Inventory.tsx:98-103 ↔ 210-214` — `equipRestrictionFor` (module fn) vs `equipRestriction` (inner closure) near-identical.
- `[DEBT] pages/Inventory.tsx:221-230 ↔ 340-348` — "held by other units" ref-list hand-copied in two places (drift if a slot added). Shared `equippedRefs(unit)`.

### BUG
- `[BUG] App.tsx:38-39` — App root subscribes `units` to pass to `RosterCarousel`; every per-tick HP sync re-renders App + whole tree. Let RosterCarousel subscribe internally (mobile perf trap).
- `[BUG] ActivityConsole.tsx:30 / Time.tsx:117,146 / BattleView.tsx:792 / StatusList:614` — rows keyed by array index `key={i}`; wrong-row reuse if prepended/trimmed (low impact for append-only).
- `[BUG] BattleView.tsx:1010-1013 (minor)` — unnecessary eslint-disable exhaustive-deps (`setManualCenter` is stable).

### DUP
- `[DUP] ActivityConsole.tsx ↔ Time.tsx:93-103` — identical LogCategory→{label,chip} map (dead file maintained twice).
- `[DUP] BattleView.tsx:308-314 ↔ RosterCarousel.tsx:13-19` — `CLASS_ICON`.
- `[DUP] LocationCodex.tsx:4-12 ↔ Map.tsx:101-109` — `ELEMENT_COLORS` duplicated; a third canonical copy in `lib/elements.ts` neither uses. Import from lib.
- `[DUP] SamplingDebug.tsx:6-11 ↔ TallyBreakdown.tsx:6-14` — two `fmt` number formatters (different precision).
- `[DUP] UnitReportSheet.tsx:8-13 ↔ Reports.tsx:8-13` — identical `Window` type + `WINDOWS` array.
- `[DUP] CombatReport/OfflineSummary/Reports` — three near-identical collapsible-row patterns (acceptable per "3 similar lines").

### Verified non-issues (don't "fix")
- `flee` LogCategory/tactic is live (monster tactic; wild-boar). Only the *outcome-label* use in store:1043 is leftover.
- No standalone Combat tab remnants; battle is correctly a Map mode.
- Drag-and-drop is PointerSensor-only + `touchAction:'none'` as specified.

---

## 5. Save codecs & data files (`save/*`, `data/*`, `types.ts`)

### STALE
- `[STALE] save/index.ts + CLAUDE.md` — `ALL_CODECS` has **10** slices (adds `unitStats`, `unitHistory`); the architecture doc lists only 8. `unitHistory` slice undocumented.
- `[STALE] types.ts:254` — `expDistributed` comment "1 per kill at this location" contradicts the pool-split-by-level model (`splitExpByLevel`).
- `[STALE] types.ts:253` — `itemsDropped` tagged "(loot system stub)"; loot is fully implemented. Drop "stub".
- `[STALE] types.ts:236` — `LogCategory` includes `'flee'` but it's emitted nowhere (the *outcome* sense is gone; the monster *tactic* sense is separate). See DEAD.
- `[STALE] data/skills.ts:63-65` — "Casting/cooldown/mana semantics: not yet implemented … combat will read them later" — these active skills ARE fully wired in `engine/skills.ts`. Describes gone state.
- `[STALE] data/skills.ts:104 (suspected)` — Shield Wall desc "+12×lv DEF" has no traceable DEF number in the skill/status data; descriptive drift.
- `[STALE] data/equipment.ts:39 (suspected)` — Rod `range:5` equals melee default → meaningless explicit range (copy-paste).

### DEAD
- `[DEAD] data/skills.ts:78 + engine/skills.ts:52` — `earth-bolt` defined in both registries, equipped by no unit/monster. Orphan.
- `[DEAD] types.ts:236` — `LogCategory` member `'flee'` never produced.
- `[DEAD] types.ts:45 + equipment.ts` — `tool` slot vestigial (see Highest-priority); handaxe/pickaxe/lockpick unreachable (old gathering system remnant).
- `[DEAD] data/traits.ts:21,32` — `versatile` and `calm` traits referenced by nothing.

### HARD
- `[HARD] data/equipment.ts:32` — "Spark Knife" `eq-knife-lightning` has `element:'wind'` (no `'lightning'` Element exists, though a `lightning` *trait* does). Inconsistent element scheme.
- `[HARD] data/equipment.ts:59-63` — placeholder material ids `m1`–`m4`/`m-gold` break the `drop-*`/`eq-*`/`craft-*` convention (the m1-m4↔recipe coupling is the crafting-loop seam).
- `[HARD] data/recipes.ts:4-8` — recipe outputs `craft-*` exist as ids only; no matching item def anywhere → crafted items are dead-end virtual misc items. (Known "crafting loop disconnected"; already in BACKLOG.)
- `[HARD] data/locations.ts:48-96` — per-location `openWorldCap`/`openWorldSize` magic numbers inline (acceptable, noted).

### DEBT
- `[DEBT] data/monsters.ts + DROP_ITEMS` — every `drop-*` id maps only to a display string; no item definition, so drops can never be equipped/consumed/crafted. The loot→inventory→crafting chain is severed by design-debt.
- `[DEBT] save/*Codec.ts (all version:1, no migrate)` — `inventory/locations/codex/combatStats/sockets/unitHistory` codecs trust stored shape; any required-field shape change has no migration path (`MiscItem.kind` optional saves it today).

### BUG / RISK
- `[BUG] save/locationsCodec.ts:15-18 + inventoryCodec.ts:19-23` — missing `?? {}`/`?? []` deserialize guards (see Highest-priority).
- `[RISK] save/combatStatsCodec.ts` — `LocationCombatStats.byUnit` documented to "migrate to {}" (types.ts:259) but the codec has **no migrate** and doesn't backfill; old samples load `byUnit === undefined`, relying on every reader to optional-chain.
- `[RISK] save/worldCodec.ts:16 (suspected)` — `deserialize` defaults `partyTactics ?? []` while `migrate`/`empty` default to `DEFAULT_PARTY_TACTICS` (`finish-them`); a current save with absent `partyTactics` silently loses the default.
- `[RISK] data/monsters.ts:102 (verify intent)` — `elite-rogue` (dagger) carries `arrow-shower` (a bow/ranger skill) — possibly unintended kit.

### DUP
- `[DUP] save/{codex,combatStats,unitStats,unitHistory,sockets}Codec.ts` — near-identical single-record codec boilerplate; the guard drift (locations/inventory omitting `?? {}`) is exactly the kind of bug a `makeRecordCodec` helper would prevent. (Weigh against the project's anti-abstraction stance.)
- `[DUP] data/monsters.ts:33,75,79` — `skittish` block repeated (expected data repetition).
