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

### P0 — build/combat parity
1. **Action bar polish** — first cut shipped (assign learned *active* skills to the
   6 slots; Skill tree overlay learns/levels). Remaining: allow **item** entries
   (consumables) in slots + sideboard sync (`setActionSlot` already handles items),
   optional drag-reorder. **S–M**
2. **Skill tree depth** — learning works; consider tree/prereq visualisation,
   active-cap hints (`skillActiveCap`), and per-level descriptions. **S–M**
3. **Equip safety** — proto `equipItem` doesn't block level/class-restricted items
   or *reserve* gear already worn by another hero (production hides it). Enforce in
   the Gear picker + Items equip. **S–M**
4. **Party-tactics editing** (`equipPartyTactic`/`unequipPartyTactic`) + **inherited
   skill tactics** w/ decouple (`toggleInheritedTactic`). Lens shows party tactics
   read-only and omits inherited. **S–M**
5. **Attention clears + Report** — call `markUnitViewed` when a hero is viewed; add
   a Report button (`openReport`) to the Hero lens (sheet renders but is
   unreachable). **S**

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

## The switch-over
- Make `ProtoApp` the default shell; retire `TabBar` + standalone page routing in
  `App.tsx` (keep the page *components* — the proto already embeds Guild/Reports/
  Time and could embed Crafting the same way).
- Fold proto-only mock state into the real save, or drop it.
- Re-point the perf/e2e harness (`e2e/perf.spec.ts`, `e2e/proto.spec.ts`).

## Verification
`npm run ci` (tsc + 539 tests) stays green. `e2e/proto.spec.ts` walks the whole
shell on desktop + mobile (screenshots in `e2e/__shots__/`, gitignored).
