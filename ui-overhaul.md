# UI Overhaul — "Tactician" shell

Plan + handoff for the `?proto=1` UI overhaul on branch
`claude/ui-overhaul-prototype-itimiw`. Goal: make this split-screen shell the
real app. This doc is the source of truth for another engineer picking it up.

Try it: `…/?proto=1` (locally `http://localhost:5173/incremental-20260418/?proto=1`).
Effort sizes: **S** ≈ hours, **M** ≈ ~a day, **L** ≈ multi-day.

## Vision
One screen, always live:
- **Top half = the Stage** — overworld ⇄ locale ⇄ battlefield on a continuous
  zoom (breadcrumb + `‹ ›` occupied-location stepper). The roster rail sits above
  it, grouped (area/class/to-do) and sorted.
- **Bottom half = the Lens** — context for the selected hero / location: Location,
  Hero (Summary/Skills/Gear/Tactics/Saga), Party (matrix), Items.
- Global screens (Guild / Reports / Time / Settings) live in the top nav bar as
  full-screen overlays.

### Core interaction principle — decisions bottom, details top
**Quick decisions happen in the bottom Lens; deep details/research are drawn over
the Stage (top), in front of the battlefield.** This lets you assign/tune while
watching the fight (and eventually see effects live). Implemented examples:
- **Skills**: action bar (assign skills) in the Lens; **Skill tree** (learn/level)
  as a Stage overlay (`StageOverlay`, `protoStore.stageOverlay`).
- **Roster**: single-tap = quiet select (no camera move); double-tap = focus (fly
  camera + drill to Hero).
Apply the same split to the rest as they're built:
- **Equipment**: equip decisions in the Lens; item detail / compare on top.
- **Codex**: monster card from the Location lens; deep codex/research on top.

## File map (`src/proto/`)
- `ProtoApp.tsx` — shell: top nav bar (Guild/Reports/Time/Settings overlays),
  grouped+sorted roster rail, split layout, on-load hero focus.
- `ProtoStage.tsx` — the zoomable stage (world/battle crossfade), breadcrumb,
  `‹ ›` stepper; renders `StageOverlay`.
- `ProtoLens.tsx` — the bottom lens + all sub-lenses (Summary, Skills, Gear,
  Tactician, Saga, Items, FocusCue, BattleStatus) and the tab shell.
- `ArmyMatrix.tsx` — Party matrix (Tactics/Gear facets, cell pickers, Auto).
- `LocationDetail.tsx` — locale management (familiarity, foes→codex, deploy,
  story; **upgrades = placeholder stub**).
- `StageOverlay.tsx` — top "details/research" overlay (Skill tree today).
- `lore.ts` — mock Saga text. `protoStore.ts` — proto-only UI state.
- Wiring: `App.tsx` gates on `?proto=1`. `e2e/proto.spec.ts` is the walkthrough.

## Already at parity (reuse — no work)
The proto embeds the real components, so these are done: **Time** (calendar,
pause, save export/import, reset, sampling debug), **Guild** (recruit), **Reports**,
**BattleView** + combatant **bottom sheet** (`UnitDetailOverlay`, now a portal),
**Offline summary**, **Unit report sheet**, abilities (spend), derived stats,
traits, equip-with-deltas, manual unit tactics, deploy/recall, monster codex.

## Built on this branch (proto-new)
Split stage+lens, continuous zoom morph, occupied-location stepper, grouped
roster + focus cues, quiet-select vs focus, **Army matrix** (Tactics+Gear facets,
cell pickers, locks), **Auto** (two-tap), **Items** (scope/tri-state filters/
collapsible + objective chips & relative deltas), **Skills action bar + Skill-tree
overlay**, Location lens.

### Auto button (Army matrix) — current behaviour
One **Auto** button, two-tap commit: 1st tap *arms* (ghosts the proposed loadout,
Auto highlights/pulses as "tap again", a **Cancel** appears); 2nd tap (now
**Apply**) commits via `equipTactic`/`equipItem`; locked heroes (🔒) are skipped.
**Intelligence is a placeholder**: tactics → casters (Mage/Cleric) get **Kiter**,
everyone else **Charger**; gear → best-in-slot within the worn category. Real
recommendation logic is future work (`ArmyMatrix.tsx`, the `tacticProps`/`gearProps`
block).

## Gaps to close for full production parity (prioritised)

### P0 — build/combat parity  *(✅ done — the shell is now the default UI)*
1. ✅ **Action bar polish** — Skills lens assigns learned *active* skills to the 6
   slots and now also stages **items** (any usable, non-reserved equipment →
   reserved into the sideboard via `setActionSlot`'s item sync); slot labels
   resolve real item names. Skill-tree overlay learns/levels. *(drag-reorder still
   deferred — tap-to-assign covers it.)*
2. ◑ **Skill tree depth** — learning works; the overlay now shows a per-level
   **→ Lv N+1** preview + prereq chains. *Active-cap hints (`skillActiveCap`) need
   live combat state (active count), so they stay on the battle card — deferred.*
3. ✅ **Equip safety** — Gear picker + Items equip now block level/class-restricted
   items (locked w/ reason) and hide gear *reserved* by another hero
   (`equipRestriction`/`reservedByOthers`, mirroring the production Inventory).
4. ✅ **Party-tactics editing** — the Tactics lens edits party doctrine
   (`equip/unequipPartyTactic`, capped) and surfaces **inherited skill tactics**
   with decouple (`toggleInheritedTactic`); inherited ids are excluded from the
   manual catalog.
5. ✅ **Attention clears + Report** — viewing a hero's lens calls `markUnitViewed`;
   a **Report ▸** button (`openReport`) sits in the Hero sub-tab row (the
   `UnitReportSheet` renders globally).

### P1 — important parity
6. **Beast companion** (`equip/unequip/moveCompanionTactic`, companion stats) —
   only once a hero has one. **M**
7. **Dungeons / multi-page maps** (`setMapPage`, `dungeonEntryRegion`: Geffen
   Dungeon, Sky Aerie). The stage only renders the `world` region. **M**
8. **Multi-unit select + bulk deploy**. **S–M**
9. **Crafting** (`craft`, `learnedRecipes`). Note: crafting is **broken even in
   production** (drops `drop-*` / outputs `craft-*` aren't real item defs — see
   BACKLOG); likely data work first. **M + data**

### P2 — polish
- Items: equipped/unequipped filter + "held by <hero>" labels.
- Map: scenario markers, open-world badge, round counter in the breadcrumb,
  full `LocationCodex`.
- Decide if any proto UI state should persist (currently ephemeral).

## Explicit decisions (from review)
- **Weapon-set A/B switch**: *no production analog — unimplemented in the game.*
  Not a parity gap; build only if/when weapon sets become a real feature.
- **Attunement bar + site upgrades**: **scrapped for now**, left as a placeholder
  stub in `LocationDetail`. The catalog/economy still lives dormant in
  `protoStore.ts` (LOCATION_UPGRADES/attunement*) if revived.
- **Auto**: should *actually assign* (done) via the two-tap flow above; real
  recommendation intelligence is deferred.

## Mock systems to resolve before shipping
Backed only by `protoStore` (not saved):
- **Saga / lore** — deterministic flavour text (`lore.ts`); cosmetic.
- **Auto intelligence** — placeholder heuristic (see above).
- **Attunement/upgrades** — dormant placeholder (see above).
- **Proto UI state** (zoom level, hero locks, stage overlay) is ephemeral; decide
  what (if anything) persists like the production expand/selection localStorage keys.

## The switch-over  *(✅ done)*
- ✅ `ProtoApp` is now the **default** shell (`App.tsx`). The legacy tab-bar UI is
  kept as a fallback behind **`?classic=1`** (and the dev `?perf` harness, which
  still expects the single-screen BattleView). Page *components* (Guild/Reports/
  Time) stay embedded in the shell; `TabBar`/`Map`/`Units`/`Inventory` remain only
  for the classic fallback. Settings ▸ **↩ Classic UI** jumps to `?classic=1`.
- ⏳ Proto-only mock state (Saga/lore, attunement/upgrades, hero locks, zoom,
  stage overlay) is still **ephemeral** — consistent with production's ephemeral
  UI tier. Folding any of it into the save is deferred (see *Mock systems*).
- ✅ `e2e/proto.spec.ts` now drives the default route (no `?proto`); `?proto=1`
  still resolves to the shell. `e2e/perf.spec.ts` (`?perf`) is unaffected.

## Verification
`npm run ci` (tsc + 539 tests) stays green. `e2e/proto.spec.ts` walks the whole
shell on desktop + mobile (screenshots in `e2e/__shots__/`, gitignored).
