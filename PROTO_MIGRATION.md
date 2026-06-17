# Prototype → Production: functional gap analysis

Scope: what the `?proto=1` "Tactician" UI (`src/proto/*`) would need to fully
replace the tab-based production UI (`src/pages/*`, `src/components/TabBar.tsx`)
without losing capability. Effort: **S** ≈ hours, **M** ≈ ~a day, **L** ≈ multi-day.

## Already covered (no work)
The prototype embeds the real components, so these are at parity by reuse:
- **Time** (calendar, pause, event-log filters, export/import save, reset, sampling
  debug, catch-up readout) — top-bar overlay renders `<Time/>`.
- **Guild** (recruit) — overlay renders `<Guild/>`.
- **Reports** (per-hero/per-location tallies, 5m/1h/life windows) — overlay `<Reports/>`.
- **Battle** — `<BattleView/>` in the stage; combatant detail is the production
  `UnitDetailOverlay` (now a portal bottom sheet).
- **Offline summary** + **Unit report sheet** — `App.tsx` renders both in proto mode.
- **Hero abilities** (spend points), **derived stats**, **traits**, **equip with
  stat deltas**, **manual unit tactics** (equip/unequip/reorder), **deploy/recall**,
  **monster codex** (from Location → foes), **world pan/zoom + battle**.

## Gaps to close (prioritized)

### P0 — combat/build parity (can't fully play without these)
1. **Action bar (combat skill loadout)** — `setActionSlot`. The 6-slot action bar
   is how a hero's *skills* enter combat (adapter injects them as action-channel
   tactics). The prototype has **no way to choose a hero's combat skills**. Port
   into a Hero sub-tab (tap-to-assign is fine; drag optional). **M**
2. **Skills tab (learn skills / spend skill points)** — `learnSkill`, prereqs,
   learnable/mastered filters. No skill progression in the prototype today. **M**
3. **Equip safety: restrictions + reservation** — proto `equipItem` doesn't block
   level/class-restricted items and doesn't hide gear already worn by another
   hero (production reserves it). Risk: equipping junk / double-assigning one item.
   Enforce in the Gear picker + Items equip button. **S–M**
4. **Weapon-set A/B switch** — proto reads `activeWeaponSet` but can't switch sets
   or equip into set B. Add a toggle to the Gear lens. **S**
5. **Party-tactics editing** (`equipPartyTactic`/`unequipPartyTactic`) + **inherited
   skill tactics** w/ decouple (`toggleInheritedTactic`). Proto shows party tactics
   read-only and omits inherited tactics entirely. **S–M**
6. **Attention clears + Report access** — call `markUnitViewed` when a hero is
   viewed (badges never clear now); add a Report button (`openReport`) to the Hero
   lens (sheet is rendered but unreachable in proto). **S**

### P1 — important parity
7. **Beast companion tab** — `equip/unequip/moveCompanionTactic` + companion stats.
   Only relevant once a hero has a companion. **M**
8. **Dungeons / multi-page maps** — `setMapPage`, `dungeonEntryRegion` (Geffen
   Dungeon, Sky Aerie). The proto stage only renders the `world` region. **M**
9. **Multi-unit select + bulk deploy** — production selects many heroes and deploys
   them together; proto deploys one at a time. **S–M**
10. **Crafting** — `craft`, `learnedRecipes`, ingredient checks. Not in proto. Note:
    the crafting loop is a **known-broken gap even in production** (drops `drop-*`
    and recipe outputs `craft-*` aren't real item defs — see BACKLOG). Consider
    fixing data first or deferring. **M** (+ data work)

### P2 — polish / parity-of-detail
- Items: **equipped/unequipped filter** + **"held by <hero>"** labels (who owns each item).
- Map: **scenario markers**, **open-world badge** on cells, **round counter** in the
  battle breadcrumb, full **LocationCodex** deep view.
- Roster: confirm `showUnitOnMap`/`setBattleFollow` parity (double-tap focus covers it).

## Mock systems to resolve before "shipping" the proto
These exist only in the prototype and are **not backed by real state** (`protoStore`,
not saved):
- **Location attunement upgrades** (vendors/drop-rate/spawn-cap…) — purely cosmetic;
  either implement real effects + persistence, or gate as "experimental / coming soon".
- **Saga / lore** — deterministic flavour text; harmless but not game data.
- **Army-matrix Optimize** — crude class/stat heuristic ("what-if" ghosts); fine as a
  helper but label it as a suggestion, not balance truth.
- **Proto UI state** (zoom level, hero locks, matrix proposals) is ephemeral; decide
  if any should persist (localStorage) like the production expand/selection keys.

## Net-new prototype wins to keep
Split-screen stage+lens, continuous zoom morph (world⇄locale⇄battle), `‹ ›`
occupied-location stepper, grouped roster (area/class/to-do) with focus cues,
single-tap quiet-select vs double-tap focus, Army matrix (tactics+gear facets),
Items scope/filters/collapse with objective+relative stats, combatant bottom sheet.

## The switch-over
`App.tsx` gates the proto on `?proto=1`. To "move to this branch":
- Make `ProtoApp` the default shell; retire `TabBar` + standalone page routing
  (keep the page *components* — proto already embeds Guild/Reports/Time and could
  embed Skills/Crafting the same way).
- Fold the proto-only mock state into the real save (or drop it).
- Re-point the e2e/perf harness at the new shell.

## Rough order of work
P0 (1→6) is the critical path to "playable parity" — realistically ~3–5 focused
days. P1 (7→10) another ~3–4 days. P2 + mock-resolution as polish. Crafting is the
one item that likely needs **content/data** work, not just UI.
