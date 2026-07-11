# Collaborator Guide (CLAUDE.md ⇄ AGENTS.md — same file; CLAUDE.md is a symlink)

Mobile-first incremental auto-battler. Vite + React 18 + TS + Tailwind + Zustand.
Deploys to GitHub Pages on push to `main`. This file is a map/reference —
keep it terse and *accurate*; `BACKLOG.md` holds deferred work and known debt —
**open items only**: when work ships, delete or shrink its entry (never mark it
done/shipped there — history lives in git and PRs, not the backlog).

## Response style
- Be succinct. Lead with the result; skip preamble, restating the task, and "still watching" boilerplate.
- PR-preview bot (`pr-preview-action`) events: reply with **only** the preview URL — nothing else.
- Never schedule PR self check-ins with `send_later` (auto-denied in `.claude/settings.json`); don't ask about it.

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
- `src/proto/` — the "Tactician" shell (`ProtoApp.tsx`), the app's only UI. `src/components/` (`BattleView`, …) and `src/pages/` (`Time`, `Reports`) hold shared pieces the shell embeds.

## Core patterns
- **Derived stats computed at render** (`getDerivedStats`, `src/lib/stats.ts`), never stored. Same for `getUnitTraits` (`src/data/traits.ts`) / `getAvailableSkills` (`src/data/skills.ts`).
- **Registries are plain exported objects**: `TRAIT/MONSTER/SKILL/RECIPE/TACTIC_REGISTRY`. Add entries there.
- **Portal modals** (`createPortal`) for popups escaping an overflow container.
- **Drag-and-drop**: native Pointer Events (`onPointerDown`/`onPointerMove`/`onPointerUp`), not a library — see `BattleView.tsx`'s grab-and-place / `PerfSandbox.tsx`'s drag-to-reposition. Set `touchAction: 'none'` on the draggable's style always (not just while dragging).

## Save & state tiers
- Saves are sliced `v1:<base64>` envelopes (`src/lib/save.ts`; details in `src/save/CLAUDE.md`). Add persistent concerns as codecs in `src/save/*Codec.ts` and `ALL_CODECS`; runtime state is rebuilt; ephemeral UI owns separate localStorage keys.
- Battles persist only through `battlesCodec` as engine `BSNAP.<base64>` tokens (`serializeBattle`). Keep serialization in one place; the save composes it.

## Feature unfolding (`src/lib/unlocks.ts`)
- `progressionMode: 'sandbox' | 'curated'` (persisted in `worldCodec`; switch in Time→Debug or `?mode=curated`). **Sandbox** = default/dev: everything open. **Curated** = a new-player onramp: gates content and unfolds it through play.
- Gating is centralised in `unlocks.ts` as plain data + predicates (no unlock engine). Store chokepoints enforce gates (`learnSkill`, fresh seeds); UI reads surfaced `unlocked` fields.
- Each mode has its own save slot (`save:sandbox` / `save:curated`) plus a `save-active-mode` marker. `switchProgressionMode(target)` is non-destructive: flush current slot, then load or seed the target slot.

## Combat engine (`src/engine/`)
Deterministic, round-based **spatial** sim on a per-battle grid. See `src/engine/CLAUDE.md` for mechanics.

- **Determinism**: no RNG; damage variation is a pure fn(round, combatant index). Loot/spawn RNG lives in the *store*, not the engine. Same roster+tactics replays 1:1. Engine changes MUST keep snapshot replays byte-identical.
- Store owns game state/time/stats and loot/spawn RNG. `adapter.ts` is the only `Unit`/`MonsterDef` + `DerivedStats` → `EngineUnitInput` seam and never mutates inputs.
- **Snapshots** (`snapshot.ts`): `serializeBattle` → `BSNAP.<base64>` (everything the sim reads; not events/trace). `deserializeBattle` replays 1:1; `.<len>x<hash>` integrity guard. ⎘-state button in BattleView; replay via `npm run bsnap`.

## Tactics (the player's combat lever)
- `TACTIC_REGISTRY`; each tactic on exactly one **channel**: movement/targeting/action/reaction/passive. Evaluated per channel in priority order each turn.
- Unit equips ≤ `MAX_UNIT_TACTICS`=4 (`unit.tactics`); party shares ≤ `MAX_PARTY_TACTICS`=2 (`partyTactics`). Scope enforced by `TacticDef.scope`. Reorder within a channel only.
- **Only skills change numbers; tactics are pure behaviour.** Shield Wall / Last Stand are self-cast skills with gated cast tactics.
- **Consumables**: a hero's `Unit.pack` is separate from the stash. `Unit.consumableRules` generate action-channel item tactics (`src/engine/consumables.ts`) above skills; counts decrement on `Combatant.pack`, serialize in snapshots, and mirror back through the store tick. `reconcilePackInTown` syncs carry targets with stash while a hero is in a city.
- Per-turn resolution recorded in `Combatant.lastResolution` (BattleView Debug tab); `Combatant.trace` is a 20-entry ring buffer.

## Combat view (a mode of the Map tab)
- No standalone Combat tab: `mapMode` is `'world'` | `'battle'`. `BattleView` is the drop-in viewer for `combatLocationId`. The shell's roster rail (`RosterChip` in `ProtoApp.tsx`) stays pinned across both (scopes to the battlefield's heroes in battle mode and drives camera follow via `battleFollowId`).
- Drop in: double-tap a location or the **Drop in ›** button (`enterBattleView`); **⤢ Overworld** exits (`exitBattleView`).
- Only the *watched* battle full-sims per tick; others advance off-screen via `creditOffscreen` (rate extrapolation every `OFFSCREEN_CREDIT_TICKS`=25). World mode + tests full-sim every location.
- Motion rides CSS transitions (no rAF loop) via compositor `transform: translate` against the square size-container arena; never animate `left`/`top`. Combatants mutate in place, so `BattleChip` is **not** `React.memo`'d. LOD drops detail and collapses paper bodies to the merged silhouette (`simple` → `PAPER_MERGED`).
- Visual work lives in `src/render/` — read `src/render/CLAUDE.md` before touching it. `appearance.ts` is the only id→visual resolver; skins switch on resolved fields, never ids. New looks are bodies/assets/`ARENA_SKINS`, not BattleView edits. Paper assets use palette roles, seeded geometry, no filters/gradients; token bodies stay memo'd with primitive, quantized props; terrain bakes to one rasterized canvas bitmap.
- The selected-unit bottom sheet (Stats/Debug tabs, status chips, trace, ⎘-state) lives in `src/components/BattleUnitSheet.tsx`; `BattleView.tsx` is the field renderer (camera/Arena/chips/FX/minimap).

## Offline progression (`src/lib/offline.ts`)
- `catchUp` (`App.tsx`) → `batchTick(n)` for `n>10`. Does **not** re-simulate combat; extrapolates rewards from realized rates. Details live in `src/lib/CLAUDE.md`.

## Health (covered by `health.test.ts`; `src/lib/stats.ts`)
- `health` is an integer ≤ `maxHp`; floor when damage is written. KO/recovery/resting/regen rules must match `batchTick` offline behavior. Details live in `src/lib/CLAUDE.md`.

## Exp & leveling
- 1 XP per kill into a pool, split across the *surviving* party **proportional to level** (`splitExpByLevel`) — anti-power-leveling. Fractional shares; floored only at display. Same rule offline.

## Map & locations
- Map tab is a pannable overworld (`LOCATION_COORDS` in `ProtoStage.tsx`), not a list. `region` names the map page (`'world'`, `'geffen-dungeon'`, `'fixed-encounters'`); `mapPageId` selects it. Dungeons (`isDungeon`) are entered from `entryLocationId`.
- **Overworld = open-world locations only.** Every `region: 'world'` location is `openWorld` (cities included). The fixed-round **discrete-wave encounters** (proving/pathing arenas, Elemental Circle/Frontier, Elite Four, the early discrete fields) live in the **`'fixed-encounters'`** dungeon, entered from Prontera — but **sandbox-only** (`isRegionUnlocked`/`SANDBOX_ONLY_REGIONS` in `unlocks.ts`; the entry is hidden in curated). Curated class-change quests therefore must target monsters on the overworld (guarded by `world-map.test.ts`).
- Tap a location → select + detail panel (units present, monsters, Familiarity = `locationFamiliarity[id]/familiarityMax`, deploy).

## Procedural map generation (`src/mapgen/`; guide: `src/mapgen/CLAUDE.md`, ideas: `procedural-generation-ideas.md`)
- Pure deterministic leaf library baking a **MapSpec** with collision / surface / scatter / semantic planes. Save seed + params, never the baked spec.
- Recipes (`field`, `dungeon`, `city`) run as pass pipelines with per-pass RNG streams, then validation (`validate.ts`) handles reachability, apron, barrier budget, water coherence, and reroll policy. Human review runs through `?mapgen=1`.
- Game seam: `Location.mapGen = { recipe, seed? }` → `generateForLocationCached` → `createOpenBattleFor` consumes spec barriers/size. `terrain.tsx` consumes the same spec for surface, scatter, and material-aware visuals. Feature status and roadmap live in `BACKLOG.md`.

## Equipment & crafting
- Equip slots: `mainHand`, `offHand`, `sideboard1`, `sideboard2`, `armor`, `accessory`. Sideboard slots hold *reserved, stat-inactive* gear. A 2H weapon (`category 'weapon-2h'`) in `mainHand` locks `offHand`.
- Equip flow: tap a slot in a hero's Equipment lens (`EquipmentLens`, `src/proto/ProtoLens.tsx`) → `SwapMenu` opens, a full-screen candidate picker (stat-delta chips, class/level gating, cross-hero reservation checks) → tap a candidate to `equipItem`.
- Crafting: `learnedRecipes[]` + `RECIPE_REGISTRY`; Craft enabled when `miscItems` hold every ingredient; consumes them, produces the output.

## Live bug watchdog (`src/lib/bugwatch.ts`)
- Cheap, purely-observational live tick checks bank bug reports for stuck heroes and state invariants. Reports store repro tokens outside the game save (`bugReports`) and surface in Time→Debug → Bug watch. Detection must never mutate engine/RNG/battle state, so snapshot replays stay byte-identical. Details live in `src/lib/CLAUDE.md`.

## Testing & verification
- `npm run ci` = `tsc --noEmit` + full vitest suite. Keep green; engine changes must keep snapshot replays byte-identical.
- Browser: use **Playwright, not the chrome-devtools MCP** (flaky here). `npm run e2e:install` once, then `npm run e2e` (mobile CPU-throttled 4×; logged fps is the signal; screenshot at `e2e/__shots__/<project>.png`). `?perf=1` drops into the heavy open-world scene (`src/dev/perfSeed.ts`) — **deterministic** (seeded `Math.random`, `?seed=`, + fixed-cadence ticks), so one fps run is a trustworthy verdict. In DEV the store is on `window.__game`.
- **One-off live-UI checks** (confirming a tweak actually renders before calling it done — not the `e2e/` suite): `import { withPage } from './scripts/ui-probe.mjs'` instead of hand-rolling Playwright's launch/viewport/console-listener boilerplate each time (assumes `npm run dev` is already running). Write the throwaway script INTO THE REPO ROOT, not the scratchpad — module resolution needs `node_modules` ancestry, so a scratchpad-dir script can't resolve `@playwright/test`. Delete it after and `git status --short` before committing.
- **Terrain/load timing**: to repro a cold terrain load in Playwright, use a fresh `browser.newContext()` and stall `data:image/svg` image decode. For pan assertions, target the pan div by `will-change:transform`.
- `npm run bsnap -- <gist-url|raw-url|file|token|->` replays a `BSNAP` headlessly from TS source (`-n` rounds, `-w` watch ids, `-e` events). Caches to `.bsnap/last.txt`. **Debugging a stuck / misbehaving unit**: `-i`/`--inspect` dumps each watched unit's decision state per round (lock, team plan `hunt`/`focus`/`waypoint`, `moveOrder`/`wanderTarget`); `--reach <id>` adds a pathing diagnostic toward a combatant (dist / line-of-sight / `canReach` / `steerAround` first-corner — catches "walled off" and "route oscillating"). The canonical first stop for an open-world "why won't it move/fight?" report — extend `inspectLine`/`reachLine` in `scripts/bsnap.mjs` for new fields rather than hand-rolling a throwaway script.
- **Dead-code drift**: a big deletion (like the classic-UI removal) tends to leave orphaned exports/deps behind it that `tsc`/vitest can't see (an exported-but-uncalled component still type-checks fine). `npm run knip` (config: `knip.json`) flags unused files/exports/dependencies; a GitHub Actions workflow (`orphans.yml`) posts it as an advisory PR comment on every push — not a merge gate, since curated public-API barrels (`src/engine/index.ts`, `src/save/index.ts`) intentionally list more than today's internal callers use. Triage the comment, don't blindly delete everything it names.

## Branching & merging
- Develop on a feature branch; **merge to `main` when a feature is complete** (`git merge --ff-only <branch> && git push origin main`) — `main` is what gets browser-tested. Don't wait to be asked.
- When the primary worktree is dirty, do shippable work in a clean temp worktree branched from fresh `origin/main` (`git fetch origin main` first). Avoid branching from stale local `main`; it creates rebase friction and can accidentally mix local WIP into commits. In any mixed worktree, show/stage by explicit paths and call out excluded files.
- Codex sandbox may require approval for git commands that write `.git` (`switch`, `add`, `commit`, `push`); request it directly. If `gh auth status` fails, push with git and use the GitHub connector to open the PR.
- After pushing to `main`, include the commit hash in the chat reply.
- Open PRs auto-deploy to `https://tyleraland.github.io/incremental-20260418/pr-preview/pr-<N>/` (`pr-preview.yml`); share the exact URL.
