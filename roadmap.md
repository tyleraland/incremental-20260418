# Feature Roadmap

Features grouped by coupling and complexity, ordered to minimize rework. Each tier builds on the tier(s) before it. Within a tier, items are roughly independent of each other.

---

## How to read this

**Coupling** = how many existing systems a feature touches or depends on being in place first.  
**Complexity** = implementation effort, ignoring dependencies.  
**Fun leverage** = how much richer the core optimization loop feels when this exists.

---

## Tier 0 — Foundation (Refactors, no user-facing features)

These are the items in `refactor-plan.md`. Do them before tier 1.

| Refactor | Why it must be first |
|---|---|
| Split store file into types + data + lib | Every tier 1+ feature adds to monsters, skills, or locations; a monolithic file is a bottleneck |
| Per-slot encounter model | Fixes shared-behavior bug; boss skills and per-unit priority both address slots, not monster types |
| Event log in store | Tier 1 console is just a UI skin over this |
| Saveable/ephemeral annotation | Save system is a serializer pass over PERSISTENT fields; annotation makes it trivial |
| Location `connections` field | Required by tier 4; costs nothing now |
| Monster `element`, `size`, `isBoss` | Required by tier 2 (boss), tier 3 (elements); costs nothing now |
| Unit `travelPath` | Required by tier 4 |
| Weapon sets on Unit | Required by tier 3 |
| Skill type + target tags | Required by tier 3 (spells), tier 2 (aggro) |
| Item `slots` field | Required by tier 5 |

---

## Tier 1 — Persistence & Feedback

**Coupling:** Low. Largely additive. Touches the store and a new UI panel.  
**Complexity:** Medium. Save encoding has a few edge cases; console is straightforward.

### Save system (encoded string / cookie)

Serialize only `PERSISTENT` fields (see refactor-plan §8) to a compact base64 JSON string. Load on startup; auto-save on key events (level-up, craft, loot).

- No strong security needed; just needs to be reproducible and human-copyable.
- Keep the format versioned (`v1:…`) so future fields can be migrated.
- Things that do *not* go in the save: UI state, runtime encounter state (regenerated on load).

### Activity console

A collapsible panel (probably bottom-of-screen drawer) showing the last N log entries from the event log ring buffer (refactor-plan §7). Categories shown as colored chips: loot, level-up, KO, defeat, flee, craft, travel.

- Filter by category.
- Optional: toggle "show loot" on/off since loot is high-volume.

---

## Tier 2 — Combat Depth (Self-contained additions)

**Coupling:** Medium. Each feature adds to the tick loop and monster/skill definitions, but they don't depend on each other.  
**Complexity:** Low–medium individually.  
**Fun leverage:** High. These make every encounter feel more dynamic without requiring the player to do more work.

### Inter-encounter delay

Between a monster slot being defeated (progress → 1) and the next spawn, insert a delay drawn from a configurable distribution (e.g. uniform 3–8 ticks). Store per-slot as `respawnTicksLeft: number` in `EncounterSlot` (refactor-plan §9). No damage or progress during respawn. Effects (familiarity, skills) can shrink the range.

Why now: It's a clean slot-level property. Adding it after boss skills or card effects complicates the slot model.

### Free hit at encounter start (Archer / Mage)

When a slot's `respawnTicksLeft` reaches 0 (new spawn), units with the `archer` or `mage` class deal a one-time pre-combat hit. The hit magnitude is a function of their stats and is applied to the slot's progress directly (not through the normal per-tick formula).

Depends on: inter-encounter delay (we need a spawn event to hook onto).

### Boss monsters

Bosses are flagged with `isBoss: true` in the monster registry. Differences:

- Higher level cap and stat multipliers.
- Can have a `skills: SkillDef[]` array defined inline (a boss's skill list is private to that monster; it isn't in SKILL_REGISTRY).
- Skill effects fire on certain triggers: on-spawn, per-tick, on-unit-KO, on-low-health.
- Boss encounter slots are marked differently in the UI (distinct color/border).

Depends on: monster `isBoss` field (refactor-plan §3), per-slot encounter model (refactor-plan §9), skill type/target tagging (refactor-plan §10).

---

## Tier 3 — Weapon Intelligence & Spells

**Coupling:** High between sub-features; medium with tier 2.  
**Complexity:** Medium–high. Weapon-choice AI touches the tick loop; spells add a new resource dimension.  
**Fun leverage:** Very high. This is the core optimization axis — players set up weapon sets and skill combos that exploit vulnerabilities, then watch the payoff.

### Elemental vulnerability system

Each monster has an `element` (refactor-plan §3). Each damage source (weapon, spell) has an element via its traits (trait system already has fire, lightning, ice, earth, wind). Apply a multiplier table:

```
attacker element → target element: modifier
fire → ice:       1.5×
lightning → water: 1.5×
(symmetric weakness/resistance pairs)
```

Vulnerability multiplier applied inside `getDerivedStats` or as a combat modifier in the tick loop.

### Sideboard weapon sets & best-weapon selection

Units have two weapon sets (refactor-plan §5). At the start of each combat tick, before damage is applied, the unit selects the set that yields the highest effective attack against its current target's element. `activeWeaponSet` is updated per-tick (or per-encounter, configurable).

The UI exposes both sets in the Gear tab — weapon set A / B switcher — and shows a preview of the damage delta vs the location's monsters.

### Spells as equippable items + spell slots

Spells are a new equipment category that can be placed in weapon hand slots (or a new dedicated `spell` slot). Each spell:

- Has an element and an attack formula (using `magicAttack`).
- Costs N spell slots per use.

`spellSlots: number` is a derived stat (base from intelligence, bonus from skills/gear). The tick loop tracks `currentSpellSlots` and regenerates 1 per tick. The best-weapon selection includes available spells alongside physical weapons.

Depends on: weapon sets (#above), skill type/target tags (refactor-plan §10), elemental system (#above).

---

## Tier 4 — World Graph & Travel

**Coupling:** Medium. Self-contained within the location/unit assignment systems.  
**Complexity:** Medium. Path-finding is simple on a small graph; the complexity is the tick-loop integration.  
**Fun leverage:** Medium. Adds a satisfying "unit progression through the world" feel.

### Location graph (connections)

Fill in `connections` arrays (refactor-plan §2) for all existing locations. Render connections in the Map tab as lines or a simple adjacency list. No logic change yet.

### Shortest-path routing

`assignUnits(unitIds, destinationId)` now computes the shortest path via BFS (the graph is small and unweighted — travel cost per edge is 1 for now, or configurable per-location-pair). The path is stored as `unit.travelPath`.

### En-route hunting

Each tick, a traveling unit checks `travelPath[0]`. It enters that location as a normal participant (combat, loot, exp). A counter tracks ticks-at-this-waypoint. When the counter reaches a threshold (e.g. the location's `transitDwell` value, default 30 ticks), the unit advances to the next waypoint. On arrival at destination, `travelPath` is set to `null`.

Units in transit show a "→ Destination (via waypoint)" label. Drag-and-drop still works: dropping a unit mid-travel recalculates the path from its current waypoint.

---

## Tier 5 — Card & Item Upgrade System

**Coupling:** Very high. Depends on item slots (refactor-plan §6), monster cards (new drop type), card effect registry (new system), and the encounter slot model.  
**Complexity:** High. Card effects are an open-ended effect bus that can touch any system.  
**Fun leverage:** Very high — but only after the card variety and monster grind are meaningful.

### Monster cards (rare drops)

Every monster type has exactly one card definition. Cards drop at a very low rate (e.g. 0.5–2%) from any instance of that monster. A card is a `MiscItem` with a `cardEffect` field referencing a card registry entry.

Card registry:
```typescript
interface CardDef {
  monsterId: string       // one card per monster type
  name: string
  description: string
  effect: CardEffect      // typed union of effect kinds
}
```

### Item slots and socketing

Items have 0–4 `slots` (refactor-plan §6). A slot can be filled with a card from inventory. The socketing action is: select item → select socket → select card from inventory → confirm. The card is consumed from `miscItems` and recorded in `itemSockets[instanceId]`.

`getDerivedStats` folds in socketed card effects the same way it folds in skill bonuses — additive passes over the card list.

### Card effect types (start small, extend over time)

Start with a typed union and a handful of concrete effects:

```typescript
type CardEffect =
  | { kind: 'stat-bonus'; stat: StatKey; value: number }
  | { kind: 'elemental-bonus'; element: Element; value: number }
  | { kind: 'regen-bonus'; value: number }
  | { kind: 'drop-rate-bonus'; value: number }
```

New effect kinds are added to the union as cards are designed — no architectural change required.

---

## Tier 6 — Active Combat Items & Economy

**Coupling:** Medium. Depends on item system (tier 5) and spell slots (tier 3) for the cost model.  
**Complexity:** Medium.

### Items used in combat (consumable per tick)

Units can be configured to use a `MiscItem` during combat. A new unit field `combatItem: string | null` points to a misc item. Each tick in combat, one unit of that item is consumed from inventory and its effect fires (e.g. +10 HP regen this tick, or deal bonus damage). If the item runs out, the unit continues combat without it.

### Merchant class skill (buy rate)

A new class-specific skill (type: passive, target: self) that gives a `goldDiscount` bonus. When a future shop system exists, this discount applies. Even before a shop exists, the skill can appear in the skill tree — it just has no mechanical effect until the shop is built.

---

## Tier 7 — Targeting Intelligence (Per-unit strategy)

**Coupling:** High. Depends on per-slot encounter model (refactor-plan §9) and skill type/target tags (refactor-plan §10). Also interacts with flee logic and boss targeting.  
**Complexity:** Medium. Priority is a sorted list; aggro is a weight on the round-robin.

### Per-unit monster priority ranking

In addition to the location-level behavior (Normal / Prioritize / Ignore / Avoid), each unit has a `unitStrategy: Record<monsterId, number>` — a priority weight (default 0) for each monster type at its current location. Resets on unit reassignment.

The targeting formula picks `focusSlots` by: location behavior first (prioritize → normal), then breaks ties by per-unit weight. Higher weight = unit prefers to attack that slot.

The UI exposes this as a draggable ranking panel visible when a unit is selected and at a location with 2+ monster types.

### Skills that affect aggro

Skills tagged `target: 'aggro'` (refactor-plan §10) modify the monster → unit targeting weights. A taunt skill increases the probability a monster targets the unit; a stealth skill decreases it. The round-robin targeting becomes weighted round-robin: weight proportional to `1 + (aggro bonus)`.

---

## Tier 8 — Inventory UX at Scale

**Coupling:** Low. Purely a UI concern, no game logic changes.  
**Complexity:** Medium. Needs careful design to be genuinely low-friction on mobile.

### Paging, filtering, and search

Once the item system (tiers 5–6) is in, inventory can have dozens of item categories and hundreds of distinct item instances. Needed UX:

- **Filter bar** at the top: category pills (Weapons, Armor, Tools, Spells, Cards, Misc, All).
- **Sort options**: by stat score, by slot count, by name.
- **Search**: text input filters by name substring; matches highlighted.
- **Pagination**: virtual list or paginate at 20 items per page to keep mobile render cheap.
- **Sell mode**: toggle to mark items for bulk-sell; shows gold preview; confirm to sell.
- **Crafting shortcut**: "plan" button per recipe that highlights missing ingredients in Misc.

---

## Summary table

| Tier | Theme | Coupling | Complexity | Fun Leverage |
|------|-------|----------|------------|--------------|
| 0 | Refactors | — | Low | Unblocks everything |
| 1 | Persistence & Feedback | Low | Medium | Medium |
| 2 | Combat Depth | Medium | Low–Med | High |
| 3 | Weapon Intelligence & Spells | High (internal) | Med–High | Very High |
| 4 | World Graph & Travel | Medium | Medium | Medium |
| 5 | Card & Item Upgrades | Very High | High | Very High |
| 6 | Active Items & Economy | Medium | Medium | Medium |
| 7 | Targeting Intelligence | High | Medium | High |
| 8 | Inventory UX at Scale | Low | Medium | Medium |

---

## Design principles to carry through all tiers

**Okay defaults everywhere.** Every new system should have a sensible automatic behavior so a player who never touches it still makes progress. The optimization surface is opt-in.

**Mobile-first interaction budget.** Each new UI affordance must pass the "one thumb on a phone" test. Drag, tap, and swipe; no hover-required interactions.

**Avoid hidden state.** Any automatic decision the game makes (weapon set chosen, target selected) should be visible in the UI — even as a small indicator — so the player can understand and tune it.

**Three similar lines beat a premature abstraction.** The card effect system, the skill effect system, and the item-in-combat system might eventually converge into one unified effect bus. Don't force that convergence until three concrete systems exist and the pattern is obvious.
