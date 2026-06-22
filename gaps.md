# GAPS — bridging the prototype from mock to production

The `?proto` "Tactician" shell (now the default UI, `src/proto/`) is feature-rich
but much of its *data* is mock: derived on the fly, held in `useProtoStore`
(unpersisted, not wired into the save format or the combat/offline loops). This
doc is the punch-list for turning each mock surface into real, persisted,
loop-connected data. It complements `BACKLOG.md` (which holds design intent);
this file is the **plumbing checklist**.

## The bridging pattern (apply to every subsystem below)

A subsystem is "production-plumbed" when all five hold:

1. **Authored data** — real defs/values in `src/data/` registries (plain exported
   objects), not values *derived* in a proto helper. e.g. items carry an authored
   `value`, not `equipmentValue(it)`.
2. **Source of truth in `useGameStore`** — gameplay state lives in the game store
   (or a dedicated slice), not `useProtoStore`. `useProtoStore` should shrink to
   *ephemeral view state* only (zoom, tab requests, inspected foe, pickers).
3. **A save slice + codec** — one `SliceCodec` per concern in `src/save/*Codec.ts`,
   registered in `ALL_CODECS` (`src/save/index.ts`), with `serialize/deserialize/
   empty` (+ `migrate` when the shape later changes). Missing slice → `empty()`.
4. **Loop wiring** — the numbers flow through the real loops: combat drops via the
   store's loot RNG, stats via `getDerivedStats`, catch-up via `batchTick` /
   `projectOfflineRewards`.
5. **Mock retired** — the proto helper/mock state is deleted (or reduced to a thin
   adapter) so there's one source of truth, not two.

### Mock-state inventory (`useProtoStore`) → destination

| Mock field(s) | What it is | Destination |
|---|---|---|
| `zoomLevel`, `zoomRequest`, `*TabRequest`, `selectedFoe`, `battleInspectRequest`, `battleCardDismiss`, `stageOverlay` | pure view state | **stays** in proto store (ephemeral; fine) |
| `attunementSpent` + `LOCATION_UPGRADES`/`upgrades` | per-location upgrade currency derived from the clock | game store + `locationUpgradesCodec` (§1) |
| `storyChoice` | per-location narrative branch | locations slice / `worldCodec` (§1) |
| `activeQuest`/`questProgress`/`completedQuests`, `classQuestCommit`, `bountyDone`/`bountyClaimed`/`questCompletions` | quest commitments & progress | game store + `questsCodec` (§2) |
| `packs`, `packsSeeded` | per-hero carried loot | unit field + combat-drop wiring (§3) |
| `ownedCards`, `sockets`, `cardsSeeded` | card inventory + socketing | game store + `itemSockets` slice (already exists!) (§4) |

---

## 1. Economy — prices, gold sink, location upgrades

**Mock today**
- `src/proto/economy.ts` *derives* every sell value (`materialValue`,
  `equipmentValue`) because items have **no authored `value`**; gold only drops
  1/kill.
- `src/data/merchants.ts` (`MERCHANT_REGISTRY`) is authored but flagged "All mock —
  no save wiring"; wandering-merchant location is derived from the clock.
- `Town.tsx` buy/sell *does* call real `grantMiscItem`/`consumeMiscItem`/
  `grantEquipment`, so transactions are real — only the **pricing** is mock.
- `attunement` (`LOCATION_UPGRADES`) is a second currency minted from `ticks`,
  fully unpersisted.

**To plumb**
- [ ] Add an authored `value: number` to `MiscItem`/`EquipmentItem` defs (or a
  `PRICE_REGISTRY`), and make `economy.ts` read it (keep the helpers as the single
  read-path; just back them with data). Drop the per-id `MATERIAL_VALUE` map.
- [ ] Decide gold's model: keep `m-gold` as a `miscItem`, or promote to a typed
  store field. Either way it already persists via `inventoryCodec` if it stays a
  miscItem — confirm and document.
- [ ] Merchant inventory/restock that survives reload: move `wants/stock/restock`
  counters into a `merchantsCodec` (wandering position can stay clock-derived).
- [ ] Wire `goldDiscount` (BACKLOG → Economy) so a real skill can affect buy price.
- [ ] Location upgrades: move `upgrades`/`attunementSpent` into the game store and
  a `locationUpgradesCodec`; make the upgrade *effects* real (Trade Post → a
  merchant actually appears; Rich Veins → real drop-rate multiplier read by the
  loot roll; Ward Stones → real `openWorldCap` reduction).

**Acceptance**: prices come from authored data; a buy/sell + an upgrade survive a
reload and a cold restart; upgrade effects change real numbers.

---

## 2. Quests — commitments, progress, persistence

**Mock today**
- Class-change quests **do** write the real outcome (`unit.class` + `grantRewards`
  into real equipment/gold) — good. But the **commitment + kill baseline +
  progress** (`classQuestCommit`, `bountyDone`, `bountyClaimed`, `questProgress`,
  `completedQuests`, `questCompletions`) are unpersisted: a reload mid-quest resets
  an in-flight quest (BACKLOG calls this out explicitly).
- `LOCATION_QUESTS` is an older mock board superseded by class-change + bounties.
- The collect/drop path (`QuestDropRule`, `questItems`) is already wired through
  the real store — that part is production-shaped.

**To plumb**
- [ ] `questsCodec`: persist `classQuestCommit`, `bountyDone`, `bountyClaimed`,
  `questCompletions` (and retire `LOCATION_QUESTS`/`activeQuest` mock or fold it in).
- [ ] Move the quest *definitions* (`CLASS_CHANGE_QUESTS`, `LOCATION_BOUNTIES`) from
  `protoStore.ts` into `src/data/quests.ts` (registry), leaving only live state in
  the store.
- [ ] Move the live state out of `useProtoStore` into `useGameStore` so offline
  catch-up can advance kill/collect objectives during `batchTick`.

**Acceptance**: an in-flight class change or bounty survives reload/restart and
advances correctly through an offline absence.

---

## 3. Per-hero carry (packs) — connect to real drops

**Mock today**
- `packs[unitId]` is a mock pack filled by `simulateHunt` (fake drops);
  `depositPack` folds it into real `miscItems`. So the *sink* is real but the
  *source* is fake, the pack is unpersisted, and it isn't wired to combat.
- Crosses the **crafting gap**: monster drops are `drop-*` ids with no item defs;
  recipe outputs are `craft-*` not in `equipment.ts` (CLAUDE.md known gap), so the
  loot→craft loop is disconnected.

**To plumb**
- [ ] Author the drop catalog: real defs for `drop-*` (and `craft-*` outputs) in
  `src/data/`, so a kill yields a real item id.
- [ ] Make the store's existing loot RNG (per-kill, in the store not the engine)
  deposit into a real per-hero pack: add `unit.pack` (or a `packsCodec`) and roll
  into it on kill instead of straight into shared `miscItems`.
- [ ] Capacity/“carry full” as a real rule; deposit on returning to town.
- [ ] Offline: `projectOfflineRewards` should fill packs from projected kills
  (today it folds loot into `miscItems` directly).
- [ ] Delete `simulateHunt`.

**Acceptance**: real kills fill a hero's pack with real drop items, persist, and
depositing routes them to the stash; crafting can consume them.

---

## 4. Cards & sockets — make the bonuses real

**Mock today**
- `src/data/cards.ts` (`CARD_REGISTRY`) is authored, but bonuses are **display-only**
  — `getDerivedStats` does **not** read sockets, and the proto holds a *parallel*
  mock `ownedCards`/`sockets` in `useProtoStore`.
- A **real `socketsCodec` / `itemSockets` slice already exists** in the game store
  (per CLAUDE.md) — the proto just isn't using it.

**To plumb**
- [ ] Point the proto card UI (`CardBits.tsx`, `socketsOf`) at the real
  `itemSockets` store slice; delete the mock `ownedCards`/`sockets`.
- [ ] Model owned cards as real inventory (`miscItems` or a typed pool) and drop
  them from monsters (overlaps §3 drop catalog — cards are `monsterId`-named).
- [ ] Wire the math: have `getDerivedStats` (`src/lib/stats.ts`) add socketed
  `CardBonus` for the active weapon set + worn armor/accessory. Keep it pure and at
  render-time per the "derived at render" rule; ensure combat reads the same.
- [ ] Engine determinism: socket bonuses feed combat via the **adapter**
  (`src/engine/adapter.ts`) so snapshot replays stay byte-identical.

**Acceptance**: socketing a card changes `getDerivedStats` and battle outcomes;
sockets persist; one source of truth (no proto mock).

---

## 5. The "Suggest" recommendation engine (Army Matrix)

**Mock today**
- `ArmyMatrix.tsx` ghosts placeholder picks: tactics = "casters kite, everyone
  else charges"; gear = crude class-weighted `itemScore`/`bestInSlot`.

**To plumb**
- [ ] Replace with a real recommendation pass (class/role-aware tactic kits,
  proper best-in-slot using authored values from §1, threat/element awareness).
  Pure function, fed the same data combat uses. (BACKLOG → UI Tactician shell.)

**Acceptance**: suggestions reflect real fit, not a two-branch placeholder.

---

## 6. Cross-cutting

- [ ] **Shrink `useProtoStore`** to ephemeral view state only (table above). Every
  gameplay field migrates to the game store + a codec.
- [ ] **`exportSave`/`importSave` round-trip** every new slice (Time tab → Debug).
- [ ] **Offline parity**: each newly-persisted economy/quest/pack number must be
  advanced (or correctly frozen) by `batchTick`/`projectOfflineRewards`, not just
  the live tick.
- [ ] **Migrations**: as proto data graduates into slices, give each codec a
  `migrate` for the first real shape so early saves don't wipe.
- [ ] **Tests**: add codec round-trip + offline-projection tests alongside the new
  slices (`npm run ci` stays green; engine snapshots byte-identical).

## Suggested order

1. §1 item `value` + drop/craft catalog (§3 data) — unblocks pricing, packs, cards.
2. §4 cards onto the real `itemSockets` slice + stats wiring (highest "feel" win).
3. §2 quests codec (stops reload data-loss).
4. §3 packs from real drops; §1 merchant/upgrade persistence.
5. §5 recommendation engine last (pure polish over now-real data).
