# Features

Mobile-first incremental game: worker placement, skill trees, resources, crafting.
Built with Vite + React 18 + TypeScript + Tailwind CSS + Zustand + @dnd-kit/core.
Deployed to GitHub Pages via GitHub Actions on push to `main`.

---

## Shell

- Fixed bottom tab bar: **Map**, **Units**, **Inventory**
- Dark game theme with custom Tailwind color palette (`game-bg`, `game-surface`, `game-primary` #6366f1, `game-accent` #22d3ee, `game-gold`, `game-green`, etc.)
- Collapsible row pattern used throughout: header always visible, content toggled; expanded state stored in Zustand (`expandedLocationIds`, `expandedUnitIds`)

---

## Map tab

- **Unassigned pool** at the top — drop zone for units with no location
- **Location rows** — four locations (King's Forest, Duskwood, Lake Arawok, Gray Hills), each with description and environment Trait bubbles when expanded
- **Always-visible unit strip** — assigned units shown as compact cards below each location header even when collapsed
- **Drag-and-drop assignment** — PointerSensor only (`distance: 8`, `touchAction: none`) so mobile scroll isn't blocked; dragging a selected unit moves the whole selection
- **Multi-select + Move To** — tap unit cards to select; fixed bottom bar shows count, "Move to" dropdown, and dismiss; works alongside drag-and-drop

---

## Units tab

- **Unit rows** — name, level, class badge, location badge, health dot; expand to see full detail
- **Gold `!` badge** on collapsed row when ability or skill points are available to spend

### Inside expanded unit

| Section | Detail |
|---|---|
| Identity | Level, Age, Class in a 3-column grid |
| Health / EXP | Progress bars with color thresholds (green / gold / red) |
| Traits | Class and proficiency trait bubbles (tappable, see Traits) |
| Abilities | STR / AGI / DEX / CON with `[+]` spend buttons; shows point cost per upgrade; remaining ability points badge |
| Combat stats | 7-stat derived grid: ATK, DEF, M.ATK, M.DEF, SPD, ACC, DOD — computed at render from abilities + equipment + skill bonuses |
| Skills | Available / Learned toggle; see Skills section below |
| Equipment | 5 slots: Main Hand, Off Hand, Armor, Accessory, Tool (full-width); tapping opens equip picker in Inventory tab |

**Ability point cost tiers:** `floor((current - 1) / 10) + 1` — costs 1pt for levels 1–10, 2pt for 11–20, etc.

**Derived stat formulas:**
- ATK = STR×2 + equipment ATK + skill ATK bonuses
- DEF = CON×1.5 + equipment DEF
- M.ATK = DEX×1.5 + equipment M.ATK
- M.DEF = CON + DEX×0.5 + equipment M.DEF
- SPD = AGI×2
- ACC = DEX×1.5 + AGI×0.5
- DOD = AGI×2 + DEX×0.5
- All floored, minimum 1; skill bonuses that affect abilities (e.g. Keen Eyes → DEX) are applied first

---

## Inventory tab

- **Equipment section** — all items grouped by category with Trait bubbles
- **Misc section** — stackable items (Wood, Iron Ore, Fish, Herbs) with quantity
- **Equip picker** — triggered from a unit's equipment slot button; navigates to Inventory tab showing only compatible items for that slot; stat delta display (green/red); "Upgrade ↑" badge; "Equipped" badge; Remove option; off-hand locked when 2H weapon equipped

---

## Traits

Tappable colored pill badges. Tapping opens a centered modal (via React portal) showing label, category, and description.

Categories and colors: damage-type (red), element (orange), stat (yellow), item-type (violet), environment (emerald), class (blue), proficiency (indigo), general (gray).

Item traits are synthesized from both the explicit `traits` array and non-zero stat values (+N ATK, etc.).

---

## Skills

Four placeholder skills in two chains:

```
Keen Eyes (DEX +lv)  →  Eagle Eyes (AGI +lv)
1H Sword Mastery (ATK +lv×3)  →  2H Sword Mastery (ATK +lv×5)
```

- All skills go to level 10
- Prerequisite skills must be learned (≥ level 1) before unlocking dependents
- Skill bonuses that affect abilities are folded into derived stats
- Locked skills shown in Available tab with prereq listed in muted italic
- Spending 1 skill point advances a skill by 1 level

---

## Data (hardcoded / prototype)

**Locations:** King's Forest, Duskwood Forest, Lake Arawok, Gray Hills

**Units:** Aldric (Warrior, Lv3), Mira (Lv2), Theron (Mage, Lv4), Sera (Lv1), Davan (Lv2), Lyra (Rogue, Lv5)

**Equipment:** Handaxe, Pickaxe, Skinning Knife, Lockpick, Iron Sword, Shortsword, Wand, Greatsword, Staff, Wooden Shield, Iron Shield, Leather Armor, Chain Mail

**Misc:** Wood ×42, Iron Ore ×18, Fish ×7, Herbs ×23

---

## Not yet built

- Resource generation (units assigned to locations produce nothing yet)
- Crafting
- Combat / encounters
- Leveling up / EXP gain
- Save / load (state resets on refresh)
- More skills and a real skill tree UI
- Character creation / recruitment
