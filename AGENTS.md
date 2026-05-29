# Collaborator Guide

We're iterating fast on UI. No tests yet. Don't over-engineer toward future features — three similar lines beats a premature abstraction.

## Architecture patterns

**Single Zustand store** (`src/stores/useGameStore.ts`) holds all game and UI state — units, equipment, inventory, plus UI bits (expanded rows, active tab, equip context, etc.). The one exception is live combat: per-location `BattleState` objects live in `battles[locationId]` (runtime-only, not persisted) and are produced by the combat engine, not hand-written by the store.

**The combat engine is a separate, pure module** (`src/engine/`). It is a deterministic, round-based *spatial* simulation on a 15×15 grid — units have positions, move, kite, flank, and body-block. It imports no game state, time, or stats; `src/engine/adapter.ts` is the only translation layer between game `Unit`/`MonsterDef` + `DerivedStats` and the engine's `EngineUnitInput`. The engine never mutates its inputs. See the Combat spec below and `BACKLOG.md` for deferred engine work.

**Derived stats are computed at render time**, never stored. `getDerivedStats(unit, equipment)` reads abilities + equipment bonuses + skill bonuses each time. Same for `getUnitTraits`, `getAvailableSkills`, etc.

**Registries are plain exported objects** — `TRAIT_REGISTRY`, `MONSTER_REGISTRY`, `SKILL_REGISTRY`, `RECIPE_REGISTRY`, `TACTIC_REGISTRY`. Add entries there; the UI and engine read them.

**Collapsible row pattern** throughout: header always visible, body toggled via `expandedXxxIds: string[]` in the store.

**Portal modals** (`createPortal`) for any popup that needs to escape an overflow container — see `TraitBubble`, `MonsterCodex`.

**Drag-and-drop**: PointerSensor only (no TouchSensor). Apply `touchAction: 'none' as const` in the draggable element's style object — not just during drag — so mobile browsers don't intercept the gesture before it starts.

## Priorities

- Playable feel on mobile first
- Visual iteration speed over correctness
- Tests and refactoring come later
- No persistence layer, no error boundaries, no abstractions the current features don't need

## Branching & Merging

- Develop on a feature branch, but **merge to `main` when the feature is complete** — main is what gets tested in the browser. Do not wait to be asked.
- Fast-forward merge when possible: `git merge --ff-only <branch> && git push origin main`.
- **After pushing to `main`, include the commit hash in the chat reply** (e.g. "Shipped to `main` (commit `abc1234`)") so I can match it to what I'm seeing in the debug UI.

---

## Feature Specifications

These are the implemented behaviors. Written so they can eventually become test cases.

### Health

- Unit health is a whole integer capped at `maxHp` (derived: `floor(50 + con * 10)`, see `src/lib/stats.ts`). `Math.floor` is applied at the moment damage is written, never at display time.
- A unit with `health <= 0` is KO'd. KO'd units (and units still in recovery) do not participate in combat.
- KO'd units enter a recovery phase: `recoveryTicksLeft` counts down from `RECOVERY_TICKS` (15) once per tick. **No regen during this phase.**
- When recovery ends the unit enters *resting* (`isResting`), regenerating `RESTING_REGEN_RATE` (1 HP/tick) until it reaches `maxHp`, at which point `isResting` clears.
- Units not assigned to any location regen `REGEN_RATE` (1 HP/tick) — idle recovery.
- Health is capped at `maxHp` after regen. `batchTick` applies the same logic in bulk for offline catch-up (it does **not** simulate combat — only regen/recovery/leveling).

### Map & Locations

- The Map tab is a **pannable overworld**, not a list. Each location's `region` field names the map *page* it lives on (`'world'`, `'geffen-dungeon'`); `mapPageId` selects the visible page. Region-grouped collapsible headers are gone.
- Locations sit on a fixed grid (`LOCATION_COORDS` in `Map.tsx`); adjacent path cells are adjacent on the grid so the route reads as a connected chain. The world is larger than a phone screen — the player drags the camera to navigate (mobile-first, no scroll-wheel assumed).
- Dungeon pages (`isDungeon`) are entered from a world location (`entryLocationId`) and exit back to it.
- Tapping a location selects it and opens a detail panel (units present, monsters, **Familiarity** meter = `locationFamiliarity[id] / familiarityMax`, deploy button).
- `expandedLocationIds` / `expandedRegionIds` localStorage keys persist (the latter defaults to `["world","geffen-dungeon"]`) but drive collapse state within panels, not the old region list.

### Combat — spatial tactic engine

Combat is a deterministic, round-based **spatial** simulation in `src/engine/`. The
old per-slot model (`encounterProgress`, `locationStrategy`, `focusSlots`, the
`normal`/`prioritize`/`ignore`/`avoid` dropdowns, the flee state machine) is **gone** —
it was fully replaced. Per-monster behavior dropdowns no longer exist; behaviour is
driven by **tactics** (below).

**One battle per location.** `battles[locationId]` holds a `BattleState` with
`combatants[]` (cloned from inputs, never mutated), positions on a 15×15 grid
(`COLS = ROWS = 15`, grid units — *not* the game's feet), ground `zones[]`,
`barriers[]`, `round`, `outcome`, `events[]`, and accumulating `stats`.

**Tick → round cadence** (`useGameStore.tick` → `advanceBattles`):
- The app ticks `TICKS_PER_SECOND` (5) times/sec (200 ms/tick). One engine round
  advances every `ROUND_EVERY_TICKS` (2) ticks → ~2.5 rounds/sec.
- For each location with eligible units (`health > 0`, `recoveryTicksLeft === 0`,
  not resting) **and** at least one monster: spawn a fresh battle if none exists or
  the last one finished (after a `BATTLE_RESPAWN_TICKS` = 15 cooldown), otherwise
  advance one round.
- After each round, kills award exp (to surviving player units), gold, and loot
  (each defeated monster rolls its `drops` by `dropRate`). Live player HP is synced
  back to the unit records every tick.
- Player units that die in a round get `recoveryTicksLeft = RECOVERY_TICKS`.

**A round** (`advanceRound`, `src/engine/engine.ts`): tick statuses (DoT, age-out) →
tick ground zones → tick cooldowns → sort turn order by SPD desc (deterministic id
tiebreak) → each alive combatant takes a turn → evaluate `outcome`
(`victory`/`defeat`/`draw`; draw at `MAX_ROUNDS` = 200).

**Determinism:** the engine uses no RNG — damage variation is a pure function of
round + combatant index. (Loot rolls use `Math.random` in the *store*, outside the
engine.) The same roster + tactics replays identically.

**Movement is spatial:** units move toward targets, kite at range, flank, and
body-block; `moveSpeed` is decoupled from `attackSpeed`. Barriers block movement and
line-of-sight; casters won't fire through walls (but will through cliffs); knockback
stops at walls and the arena perimeter.

### Tactics (the player's combat lever)

- Tactics are named behaviours in `TACTIC_REGISTRY`, each on exactly one **channel**:
  `movement`, `targeting`, `action`, `reaction`, or `passive`. The engine evaluates
  the equipped tactics per channel in priority order each turn.
- Each unit equips up to `MAX_UNIT_TACTICS` (4) tactics (`unit.tactics`); the party
  shares up to `MAX_PARTY_TACTICS` (2) party-scope tactics (`partyTactics`). Scope is
  enforced against `TacticDef.scope`.
- **Skills granted as tactics:** action-bar skills are injected as action-channel
  tactics via the adapter, so equipping a skill gives a unit a combat action without a
  separate tactic slot.
- Monsters may carry their own skills and tactics (see `monsterToEngineInput`).
- Targeting examples that ship today: `tank-buster` (lock highest-DEF enemy),
  `opportunist`, kiter/flanker/guardian movement tactics, etc.

### Combat view (Combat tab → being folded into Map)

- A pannable arena shows circular unit/monster tokens with floating name + HP,
  attack lines, hit flashes, cast lines, and floating damage/heal/DoT numbers.
- Monster HP bars animate down during combat and **snap to full** on respawn (no
  upward animation).
- Tapping a token opens a detail card (name, team, HP, stats, per-skill cooldowns,
  statuses, casting line).
- **Direction (`BACKLOG.md`):** the standalone Combat tab is slated to fold into Map —
  zooming from the overworld into a location's battlefield as a drop-in view. Treat
  Combat/Map as converging; check `BACKLOG.md` before investing in either in isolation.

### Unit Selection & Detail Card

- Tapping a unit card toggles its selection. Multiple units can be selected.
- When **exactly 1 unit** is selected on the Map tab, a detail card is shown above the action bar containing:
  - Unit name and class badge.
  - Exact integer HP (color-coded: green ≥75, gold ≥40, red <40) and an HP bar.
  - Element trait badges (filtered from `getUnitTraits`).
  - Four derived stats in a grid: ATK, DEF, SPD, ACC (from `getDerivedStats`).
  - A `View ›` button that navigates to the Units tab with that unit's row expanded.
- The action bar always shows a `Move to ▾` dropdown for assigning selected units to any location or back to Unassigned.

### Expand/Collapse Persistence

All collapsible sections remember their state across tab switches via localStorage:

| Section | Store field | localStorage key | Default |
|---|---|---|---|
| Location rows | `expandedLocationIds` | `expandedLocationIds` | `[]` (all collapsed) |
| Unit rows | `expandedUnitIds` | `expandedUnitIds` | `[]` (all collapsed) |
| Inventory sections | `expandedInventorySections` | `expandedInventorySections` | all three expanded |
| Map pages | `expandedRegionIds` | `expandedRegionIds` | `["world","geffen-dungeon"]` |

### Crafting

- Learned recipes are listed in `learnedRecipes[]`; definitions live in `RECIPE_REGISTRY`.
- The Craft button is enabled only when every ingredient has sufficient quantity in `miscItems`.
- Crafting consumes the listed ingredients and produces the output item (adds to `equipment` or `miscItems`).

### Equipment

- Equipment slots per unit: `mainHand`, `offHand`, `tool`, `armor`, `accessory`.
- Equipping a 2H weapon in `mainHand` locks the `offHand` slot (cannot equip anything there).
- Equip flow: tap a slot in the Units tab → Inventory tab opens in equip-context mode → select an item → returns to Units tab with item equipped.
- Items in the equip picker show stat deltas vs the currently equipped item in that slot.
- An `↑ Upgrade` badge appears when an item's total stat score exceeds the currently equipped one.

