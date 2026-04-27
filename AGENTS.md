# Collaborator Guide

We're iterating fast on UI. No tests yet. Don't over-engineer toward future features — three similar lines beats a premature abstraction.

## Architecture patterns

**Single Zustand store** (`src/stores/useGameStore.ts`) holds all state — game data and UI state alike (expanded rows, active tab, equip context, etc.).

**Derived stats are computed at render time**, never stored. `getDerivedStats(unit, equipment)` reads abilities + equipment bonuses + skill bonuses each time. Same for `getUnitTraits`, `getAvailableSkills`, etc.

**Registries are plain exported objects** — `TRAIT_REGISTRY`, `MONSTER_REGISTRY`, `SKILL_REGISTRY`, `RECIPE_REGISTRY`. Add entries there; the UI reads them.

**Collapsible row pattern** throughout: header always visible, body toggled via `expandedXxxIds: string[]` in the store.

**Portal modals** (`createPortal`) for any popup that needs to escape an overflow container — see `TraitBubble`, `MonsterCodex`.

**Drag-and-drop**: PointerSensor only (no TouchSensor). Apply `touchAction: 'none' as const` in the draggable element's style object — not just during drag — so mobile browsers don't intercept the gesture before it starts.

## Priorities

- Playable feel on mobile first
- Visual iteration speed over correctness
- Tests and refactoring come later
- No persistence layer, no error boundaries, no abstractions the current features don't need

---

## Feature Specifications

These are the implemented behaviors. Written so they can eventually become test cases.

### Health

- Unit health is stored as a whole integer (0–100). `Math.floor` is applied at the moment damage is written, never at display time.
- A unit with `health <= 0` is KO'd.
- KO'd units enter recovery: `recoveryTicksLeft` counts down from `RECOVERY_TICKS` (10) once per tick.
- Health regenerates at `REGEN_RATE` (5 HP) per tick during recovery — so a unit returns from KO with at least 5 HP, never 0.
- Units not assigned to any location also regen at `REGEN_RATE` per tick (idle recovery).
- Health is capped at 100 after regen.

### Locations & Regions

- Every location belongs to a `region` (string id).
- Locations are displayed grouped under their region header on the Locations tab.
- Each region header is independently collapsible. Expanded state persisted to `localStorage` key `expandedRegionIds`. Default: all regions expanded.
- Each location row is independently collapsible. Expanded state persisted to `localStorage` key `expandedLocationIds`. Default: all collapsed.
- A collapsed location with **no units assigned** renders as a compact name-only row (minimal padding, dimmed text).
- A collapsed location with **units assigned** renders its normal header plus the unit cards below it.
- Locations act as drop targets for drag-and-drop unit assignment.

### Encounters & Combat (tick-driven)

- Every location has an active encounter: a list of monster slots (`activeEncounters[locationId]`). A monster id may appear more than once.
- Monster kill progress is tracked per slot as a value 0–1 (`encounterProgress[locationId][slotIndex]`). Progress advances at `1 / (monster.level * 5)` per tick (i.e. `monster.level * 5` seconds per kill) for each attacked slot.
- When a slot reaches progress 1 the monster is defeated (loot & exp awarded) and its progress resets to 0 for the next spawn.
- Only slots in `attackedSlots` (see targeting below) advance progress. Slots not being attacked stay frozen.
- Monster HP bars animate continuously downward during combat and **snap instantly to full** on reset — no upward animation (`useLayoutEffect` suppresses the CSS transition on reset).
- Damage from monsters to units: each alive monster applies `monster.stats.attack / max(unit.defense, 1)` HP damage per tick to its target unit.
- Units that are KO'd (`health <= 0` or `recoveryTicksLeft > 0`) do not participate in combat on either side.

### Targeting

- **Monster → Unit** (who monsters attack): slot `i` targets `aliveUnits[i % aliveUnits.length]` round-robin. Shown on monster HP bar as `→ UnitName`.
- **Unit → Monster** (who units attack): determined by `focusSlots` (see behavior below). Unit `i` attacks `focusSlots[i % focusSlots.length]`. Shown on unit card as `→ MonsterName`.
- `aliveUnits` = units at the location with `health > 0` and `recoveryTicksLeft === 0`.

### Monster Behavior

Each monster slot at each location has an independently-set behavior (`locationStrategy[locationId][monsterId]`). Default is `'normal'`.

| Behavior | Effect on progress | Effect on damage | Flee trigger |
|---|---|---|---|
| `normal` | Advances if in attackedSlots | Monster deals damage to units | No |
| `prioritize` | Advances if in attackedSlots | Monster deals damage to units | No |
| `ignore` | Frozen (never advances) | Monster deals damage to units | Triggers flee if all remaining slots are ignore/avoid |
| `avoid` | Frozen (never advances) | Monster **does not** deal damage | Triggers flee immediately |

**Priority targeting**: `focusSlots` = all `prioritize` slots if any exist, otherwise all `normal` slots. `ignore` and `avoid` slots are never in `focusSlots` and so are never attacked.

**Flee state machine**:
- Flee triggers when: any `avoid` monster is present, OR all monster slots are `ignore`/`avoid`.
- On trigger: `locationFleeing[locationId]` is set to `FLEE_TICKS` (2).
- Each tick the counter decrements. On the final tick (counter reaches 0) encounter progress resets to all zeros.
- During flee: no damage is dealt in either direction; all target assignments are null; unit cards show `fleeing` instead of `→ MonsterName`; monster bars show no target.
- No loot is awarded for monsters that weren't fully defeated before the flee completed.

### Monster Behavior UI

- Tapping a monster card selects it (toggles); a behavior panel appears inline below the monsters row.
- The panel shows four compact pill buttons: Normal, Prioritize, Ignore, Avoid. The active one is highlighted with a behavior-specific color (Normal=blue, Prioritize=amber, Ignore=dim, Avoid=sky).
- One description line below the pills describes the **currently active** behavior only.
- A bordered `Codex →` button in the panel opens the MonsterCodex modal for that monster.
- Pressing ✕ or tapping the selected monster again closes the panel.
- Monster cards have a colored border tint when behavior ≠ normal (amber for prioritize, sky for avoid, dimmed for ignore).

### Unit Selection & Detail Card

- Tapping a unit card toggles its selection. Multiple units can be selected.
- When **exactly 1 unit** is selected on the Locations tab, a detail card is shown above the action bar containing:
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
| Region headers | `expandedRegionIds` | `expandedRegionIds` | all regions expanded |

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

