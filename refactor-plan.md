# Refactor Plan

Changes to make *before* adding the next wave of features. Each entry notes what future work it unblocks and why retrofitting later costs more than doing it now.

---

## 1. Split the monolithic store file

**Current state:** `src/stores/useGameStore.ts` is ~1500 lines holding types, constants, all four registries, helper functions, and the Zustand store body.

**Problem:** Every new feature — monster elements, spells, boss skills, card effects — requires touching this file. It's already hard to grep for one thing without pulling up noise.

**Split into:**

```
src/
  types.ts                    — all interfaces & enums (Unit, Location, Monster, EquipmentItem, …)
  data/
    monsters.ts               — MONSTER_REGISTRY + DROP_ITEMS
    traits.ts                 — TRAIT_REGISTRY
    skills.ts                 — SKILL_REGISTRY
    recipes.ts                — RECIPE_REGISTRY
    locations.ts              — location definitions
  lib/
    stats.ts                  — getDerivedStats, skillBonusTotal, getUnitTraits, getItemTraits, getAvailableSkills
    combat.ts                 — targeting helpers, flee logic, progress math (extracted from tick)
    time.ts                   — ticksToCalendar, constants (TICKS_PER_DAY, etc.)
  stores/
    useGameStore.ts           — Zustand store + actions only
```

**Unblocks:** Every feature from roadmap tiers 2–9. Adds monster elements/size, boss flag, spell definitions, card definitions, and travel graph each as a one-file addition.

---

## 2. Add `connections` to Location

**Current state:**
```typescript
interface Location { id, name, region, description, traits, monsterIds, familiarityMax }
```

**Add:**
```typescript
interface Location {
  connections: string[]   // locationIds reachable directly from here
}
```
Set to `[]` for all existing locations now; fill in as the map takes shape.

**Why now:** Travel time, shortest-path routing, and en-route hunting all require this field. Adding it after travel logic is written means touching the travel code, the store, and the UI simultaneously. Adding it now is a two-minute type change.

---

## 3. Add `element`, `size`, and `isBoss` to Monster

**Current state:**
```typescript
interface Monster { id, name, level, stats, drops }
```

**Add:**
```typescript
type Element = 'fire' | 'lightning' | 'ice' | 'earth' | 'wind' | 'neutral'
type Size    = 'small' | 'medium' | 'large'

interface Monster {
  element: Element   // default 'neutral'
  size: Size         // default 'medium'
  isBoss?: boolean
}
```

The trait system already models these for units and items. Monsters need the same so elemental vulnerability, boss differentiation, and card identity all key off a single canonical field rather than being inferred from name strings.

**Unblocks:** Elemental damage, weapon-choice AI, boss skills, monster cards (each card is tied to a monster type).

---

## 4. Add `travelPath` to Unit

**Current state:** `unit.locationId: string | null`. `assignUnits()` teleports instantly.

**Add:**
```typescript
interface Unit {
  travelPath: string[] | null   // ordered locationIds remaining in journey; null = at destination
}
```

The tick loop checks `travelPath`: if non-null and non-empty, the unit is "in transit" — it engages the next location in the path for combat, then advances the pointer when ready to move on.

**Why now:** En-route hunting requires the tick loop to treat a traveling unit differently from an assigned unit. Adding this field now means the tick refactor touches one place. Adding it after travel UI exists means auditing every place that reads `locationId`.

---

## 5. Add weapon sets to Unit

**Current state:** `unit.equipment: Record<EquipSlot, string | null>` — one flat record.

**Change to:**
```typescript
type WeaponRecord = { mainHand: string | null; offHand: string | null }

interface Unit {
  weaponSets: [WeaponRecord, WeaponRecord]   // set A and set B
  activeWeaponSet: 0 | 1
  equipment: { armor: string | null; tool: string | null; accessory: string | null }
}
```

Armor, tool, and accessory are shared across sets; only the hand slots switch. `getDerivedStats` reads `weaponSets[activeWeaponSet]` merged with `equipment` to compute the active loadout.

**Unblocks:** Sideboard weapon preview, best-weapon-per-target AI, spell slot weapon set.

---

## 6. Add `slots` to EquipmentItem

**Current state:** `EquipmentItem` has no concept of upgrade sockets.

**Add:**
```typescript
interface EquipmentItem {
  slots: number          // 0–4, determined at item definition time
}
```

Instance-level socketing (which card fills which slot) lives in a separate store map keyed by item instance id rather than item definition id, because the same item definition can appear multiple times in inventory with different cards.

```typescript
// In GameState:
itemSockets: Record<itemInstanceId, string[]>   // card itemIds per socket
```

**Why now:** The inventory UX already renders items; adding a socket display later requires retrofitting the item rendering layer. Adding the field now costs nothing and keeps the inventory component stable.

---

## 7. Add event log to store

**Current state:** The only feedback mechanism is `offlineSummary` (a single banner) and monster HP bars. There is no running log.

**Add:**
```typescript
type LogCategory = 'loot' | 'levelup' | 'ko' | 'defeat' | 'flee' | 'craft' | 'travel'

interface LogEntry {
  tick: number
  category: LogCategory
  message: string
}

// In GameState:
eventLog: LogEntry[]   // ring buffer; trim to last 200 on each write
```

The tick loop and action handlers call a `logEvent(category, message)` helper. The console UI (roadmap tier 1) then just renders this slice — no structural changes needed at that point.

**Unblocks:** Activity console, richer offline summary, future notifications.

---

## 8. Make saveable vs. ephemeral state explicit

**Current state:** All state lives in one Zustand object. There is no distinction between what represents game progress vs. what is transient UI.

**Approach:** Annotate fields in comments as one of three categories, then the save serializer only encodes `PERSISTENT` fields.

| Category | Examples | Save behavior |
|---|---|---|
| `PERSISTENT` | units, equipment, miscItems, learnedRecipes, locationFamiliarity, monsterDefeated | Encoded in save string |
| `EPHEMERAL_UI` | selectedUnitIds, expandedLocationIds, expandedRegionIds, equipContext | localStorage only |
| `RUNTIME` | activeEncounters, encounterProgress, encounterTargets, locationFleeing | Regenerated fresh on load |

This annotation costs nothing now and makes the save system (roadmap tier 1) a clean read-and-encode pass rather than a guessing game about what to include.

---

## 9. Move to per-slot encounter model

**Current state:** Encounters are parallel arrays: `activeEncounters[loc]` (monsterId[]), `encounterProgress[loc]` (number[]), `encounterTargets[loc]` (unitId|null[]). Strategy is keyed by monsterId, so two wolves in the same location share one behavior setting.

**Change to:**
```typescript
interface EncounterSlot {
  monsterId: string
  progress: number
  targetUnitId: string | null
  behavior: MonsterBehavior
}

// In GameState (replace the three parallel arrays):
encounters: Record<locationId, EncounterSlot[]>
```

**Why:** (a) The shared-behavior bug: two wolves today must have identical behavior; a boss wolf and a fodder wolf can't be distinguished. (b) Per-slot timers (inter-encounter delay), boss abilities, and per-unit priority ranking all need to address a specific slot, not a monster type. (c) The tick logic reads three arrays in lock-step — collapsing them into one array of objects makes the intent clearer and eliminates a class of off-by-one error.

---

## 10. Tag skills with type and target

**Current state:**
```typescript
interface SkillDef { id, name, maxLevel, description, requires, getBonuses }
```
All skills are implicitly passive stat bonuses.

**Add:**
```typescript
type SkillType   = 'passive' | 'active'
type SkillTarget = 'self' | 'party' | 'monster-target' | 'aggro'

interface SkillDef {
  type: SkillType       // default 'passive'
  target: SkillTarget   // default 'self'
}
```

Existing skills are `passive / self` by default — no behavior change. The targeting loop checks `type === 'active'` before considering the skill as a combat option. Aggro/taunt skills set `target: 'aggro'` so the targeting system knows to redirect monster focus.

**Unblocks:** Active skills, aggro/taunt skills, spell system (spells are `active / monster-target`).

---

## Order of operations

These refactors are roughly independent of each other. A sensible sequence:

1. **File split (#1)** first — every subsequent refactor is easier when the types file is separate.
2. **Encounter model (#9)** — fixes the shared-behavior correctness issue now, before more combat features layer on.
3. **Event log (#7)** — cheap, enables feedback for everything that follows.
4. **Saveable annotation (#8)** — also cheap, guides the save system implementation.
5. **Location connections (#2), Monster fields (#3), Unit travel path (#4)** — data model extensions, order doesn't matter.
6. **Weapon sets (#5), Item slots (#6)** — touch the equipment UI, do together.
7. **Skill tagging (#10)** — do before any active skill or spell feature work begins.
