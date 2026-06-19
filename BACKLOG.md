# Combat / Tactic Engine — Backlog

Deferred work and known shortcuts for the combat engine (`src/engine`).
Implemented behavior is in `CLAUDE.md` → Feature Specifications.

## UI — "Tactician" shell (remaining work)

The split-screen Tactician shell (`src/proto/`) is now the **default app UI**
(legacy tab-bar UI behind `?classic=1`). The P0 build/combat-parity gaps and P1
#6–8 (beast companion, dungeons/multi-page maps, multi-select bulk deploy) and
the P2 Items polish (equipped/held filter + "held by <hero>" labels) are **done**.
What's left:

- **Classic-UI retirement (cleanup).** Once the shell is proven in the wild,
  delete the legacy tab-bar path. Dependency graph traced 2026-06 (importers
  outside tests + `App.tsx`):
  - **Removable (classic-only):** `components/TabBar.tsx`,
    `components/RosterCarousel.tsx` (only `App.tsx` imports it — the shell has
    its own roster rail; the `ProtoApp` "RosterCarousel" mention is a comment,
    not an import), `pages/Map.tsx`, `pages/Units.tsx`, `pages/Inventory.tsx`,
    and the `?classic=1` / `classicMode` branch + those imports in `App.tsx`.
  - **Keep (shared):** `pages/Guild`, `pages/Reports`, `pages/Time` (embedded in
    `ProtoApp`), and the shared components `BattleView`, `MonsterCodex`,
    `TraitBubble`, `UnitReportSheet`, `OfflineSummary`.
  - **Tests to port, not just delete (real coverage loss otherwise):** the only
    UI-rendering tests live against the classic pages and have **no proto
    equivalent** — `__tests__/ui/UnitRect.test.tsx` (3, → `pages/Map`),
    `__tests__/ui/TacticsTab.test.tsx` (7, → `pages/Units`),
    `__tests__/ui/UnitsPage.test.tsx` (6, → `pages/Units`) = 16 test blocks.
    Re-point them at the shell lenses (`TacticianLens`/`GearLens`/the stage)
    before removing the pages. `TabBar` and `pages/Inventory` have no tests.
  - **Blocker:** the dev `?perf` harness still renders the classic path for the
    single-screen `BattleView`, so keep a minimal perf render path (or point it
    at the shell's battle stage) before deleting the `classicMode` branch.
- **Crafting** (`craft`, `learnedRecipes`) — not surfaced in the shell. Note it's
  **broken even in production**: drops are `drop-*` and recipe outputs `craft-*`,
  neither of which are real item defs (see *Economy & resources* below). Data
  work first, then a crafting surface (could embed like Guild/Reports).
- **Map polish (P2)** — scenario markers, an open-world badge on world nodes, a
  round counter in the breadcrumb, and the full `LocationCodex` in the Location
  lens (only the per-monster `MonsterCodex` card is wired today).
- **Proto mock systems** (backed only by `protoStore`, not saved) to resolve
  before they can be considered shipped:
  - **Saga / lore** (`lore.ts`) — deterministic flavour text; cosmetic.
  - **Auto intelligence** (`ArmyMatrix.tsx`) — the two-tap Auto *assigns* for
    real, but the recommendation logic is a placeholder heuristic (casters →
    Kiter, else Charger; gear → best-in-slot in the worn category).
  - **Attunement / site upgrades** — scrapped; a placeholder stub in
    `LocationDetail`. The catalog/economy lives dormant in `protoStore.ts`
    (`LOCATION_UPGRADES`/`attunement*`) if ever revived.
  - **Proto UI state** (zoom level, hero locks, stage overlay, roster
    sort/multi-select) is ephemeral — decide what, if anything, should persist
    like the production expand/selection `localStorage` keys.
- **Explicit non-gaps** (don't build unless the underlying feature lands):
  *Weapon-set A/B switch* has no production analog (weapon sets aren't a real
  game feature yet); the shell intentionally edits only the active set.

## Long-horizon shape changes

- **✅ Combat lives inside the Map tab.** Done — the standalone Combat tab is
  gone; the battlefield is a `mapMode === 'battle'` drop-in of the Map tab
  (`BattleView` + `RosterCarousel`). Single-tap selects a location; double-tap
  (or the **Drop in ›** button) zooms in; the **⤢ Overworld** chip zooms back
  out. Known follow-ups:
  - *Sizing* — the arena is `aspect-square` filling its flex region; verify it
    on short / landscape viewports (the proportions differ a lot from the
    overworld layout — expect a couple more tuning passes).
  - *Roster taps in battle mode are currently inert* (no action bar there). A
    natural next step: tapping a roster hero in battle mode highlights/centres
    their chip, or surfaces a slim deploy/recall control.
- **🟡 Open world instead of single encounters (first iteration shipped).**
  A location can now set `openWorld: true` to run a *persistent* battle
  (`BattleState.mode === 'open'`) instead of the discrete wave model:
  - The battle never self-terminates — `evalOutcome` returns `'ongoing'` in
    open mode; the store owns teardown (no eligible heroes → battle removed).
  - Monsters trickle back in via the engine's new `addCombatant`, one at a
    time, up to a fixed per-location `openWorldCap`, every
    `OPEN_WORLD_SPAWN_TICKS`. Picked at random from `monsterIds`.
  - Heroes join / leave the live fight as they deploy or recover
    (`reconcileOpenPlayers`), so the party adapts to who's standing.
  - Discrete encounters are unchanged and still the default — scenarios,
    the Elite Four, cities and the dungeon stay deterministic for tests.
  Second iteration (shipped): a **large per-battle map** (`cols/rows`, default
  100×100 via `openWorldSize`), **vision-limited targeting** (`visionRange` —
  heroes 10, monsters 8), and **wander** — heroes roam a shared waypoint and
  converge on engaged allies; idle monsters lurk then hop locally. Monsters
  **scatter** across the field; the camera follows the party. Per-battle bounds
  live in `engine/arena.ts` so no movement clamp hardcodes a size.
  Follow-ups still open:
  - *Overworld travel between locations* — a deployed unit walking from one
    open-world map to a connected one (the `travelPath` field exists but isn't
    driven yet). The engine **move-order** primitive (`issueMoveOrder`, paths to
    a point / holds if blocked, instantaneous in grid steps) is the building
    block; this would make it non-instantaneous and cross-location, and likely
    add a teleport-style movement ability that satisfies an otherwise-impossible
    path (the move-order tests already model the impossible case). *En-route
    hunting* (roadmap Tier 4): a unit in transit fights/loots/earns at each
    waypoint location it passes through, dwelling a few ticks before advancing —
    needs a location graph (`connections`) + BFS routing to populate `travelPath`.
  - *Smarter spawns* — per-location monster *distributions* (weights, level
    bands, time-of-day) and non-uniform spawn timers. Today it's an equal-weight
    random pick on a fixed timer, scattered uniformly across the map.
  - *Seeded RNG for determinism* — spawn picks / loot / scatter use
    `Math.random` in the store. Live open-world play is no longer "same inputs →
    same outputs"; tests pin `Math.random`. A seeded generator would make
    replays exact. (Engine wander/vision are already deterministic.)
  - *Hunt pacing* — 🟡 first iteration shipped. The blackboard now routes the
    party to the nearest enemy ANY member can *see* (fog-of-war) and marches the
    whole group there together (`defaultPlanner` → `pickHuntTarget`, committed via
    `TeamPlan.huntTargetId`); nothing in sight → roam to explore. Still open:
    *scattered hunt* (split the party across 2–3 objectives to clear faster
    instead of one tight group), hysteresis on a flickering edge-of-vision target,
    and tuning the vision/speed/cap/size knobs. The residual cloaked-rogue
    "jitter next to an engaged fight" (separation crowding at the rally point) is
    cosmetic and separate.

## Offline progression

- **✅ Sampled Offline Progression ("Warm Catch-up") — Phases 1 & 2 shipped.**
  `batchTick` no longer does *only* regen/recovery/aging — it now **extrapolates
  offline combat rewards** instead of re-simulating (`src/lib/offline.ts`). See
  `CLAUDE.md` → **Offline progression** for the implemented behavior. In short:
  - *Phase 1 (warm).* `projectOfflineRewards` scales each deployed location's
    realized rate (`getLocationCombatReport`, window = `startTick`→`endTick`) by
    the offline ticks. exp/gold/kills are deterministic (floored EV); loot is
    **rolled** per projected kill (`rollOfflineLoot`) so rare drops aren't lost to
    the floor. Credits heroes' exp, folds gold/loot into `miscItems`, advances
    `monsterDefeated` + `locationStats`.
  - *Phase 2 (cold).* `primeColdLocation` runs a budgeted real-combat slice
    (`PRIME_ROUND_CAP` = 300 rounds / `PRIME_MS_BUDGET` = 50ms) to settle the
    in-flight fight and seed a sample, then extrapolates the rest on that rate.
  - *Plumbing.* `worldCodec` now persists `savedAt`→`lastTickAt` so catch-up fires
    across a real app restart; an `OfflineSummary` modal recaps the absence.
  Still deferred:
  - *Web Worker offload* — priming runs on the main thread within the 50ms budget.
    If it ever gets heavy, move it behind a loading buffer in a worker (the
    `serializeBattle`/`deserializeBattle` BSNAP tokens already make a battle
    worker-portable).
  - *Seeded RNG for exact loot* — offline loot rolls use `Math.random` in the
    store (tests pin it), same as live loot. A seeded generator would make offline
    replays exact (tracks the same backlog item under the open-world section).
  - *Cold-priming HP fidelity* — priming settles the fight and seeds a rate but
    the regen/recovery pass owns final unit HP (units fast-heal anyway); priming
    doesn't separately model offline KO downtime.

## Economy & resources

- **Passive resource generation from assigned units.** The original prototype
  direction (from the now-deleted `features.md`): a unit stationed at a location
  passively produces resources over time (Wood, Iron Ore, Fish, Herbs — the
  `miscItems` the crafting loop wants) with no combat. Superseded by the combat /
  open-world direction, where locations spawn fights that drop loot instead.
  If revived it overlaps the **Gather-and-guard** tactic below (resource nodes +
  a "go work that node" move-order behaviour) — the difference is *passive*
  (just-assigned, ticks yield) vs *active* (a hero peels off to a node while the
  party screens). Wiring either into crafting would also close the "crafting loop
  is disconnected at the joints" gap under **Data / spec drift**.
- **Shop / merchant economy (gold sink).** Gold is *earned* (combat + offline
  rewards) but there's nowhere to spend it — no shop, no sell. Add a vendor to
  buy gear/consumables and **sell** surplus loot (pairs with the inventory
  *sell mode* below), and a **Merchant** class passive that grants a
  `goldDiscount` (the skill can exist in the tree with no effect until the shop
  lands). Closes the loot → gold → power loop. (Mined from the old roadmap Tier 6.)

## Quest system (objective types)

The class-change quests (`src/proto/protoStore.ts`, `LOCATION_QUESTS` is the
older mock board) are the seed of a WoW-style quest framework. Each quest has an
**objective** the player works toward, and kill/collect objectives carry a
**scope: `'hero'` (only the committed hero's actions count) or `'global'` (any
hero)** — class-change quests are inherently hero-scoped, but the objective model
supports both so future party/board quests can be global.

Objective types, roughly easiest → most plumbing:

- **Kill / cull N of a type** — *DONE for the kill case* (`{ kind:'kill', count,
  monsterId?, scope }`). Hero-scope per-type rides `unitStats[hero].killsByMonster`
  (added with this work); global per-type rides the persisted `monsterDefeated`
  map; "any monster" uses the flat lifetime kill count. Progress = current −
  baseline snapshotted at commit.
- **Collect a dropped quest item** — *DONE*. A quest seeds a *temporary* drop on
  a target monster; each pickup increments an item-addressable ledger
  (`questItems` by itemId) tracked in the **quest detail only, never in
  `miscItems`/Inventory.** Hero-scoped ("while *this* hero is on the map where X
  dies") or global ("any hero, Y dies"). Generic `QuestDropRule` registry rolled
  in `rewardKills` alongside loot; completion consumes (hands in) the collected
  items behind a confirm.
- **Hand-in from inventory** — *DONE*. Turn in items you already hold; completion
  CONSUMES them behind an explicit "will be consumed" confirm. `source:
  'inventory'` decrements a real `miscItems` material (e.g. Boar Hide — Path of
  the Ranger); `source: 'quest'` decrements an ephemeral `questItems` entry.
  Progress = how many you currently hold, so a quest can be ready the moment you
  have enough.
- **Crafting / transformational.** Consume reagents A+B+C → grant reward Z, with a
  clear **"Items consumed"** panel (reagents are ordinary materials, *not*
  quest-specific items). Overlaps the dormant `RECIPE_REGISTRY` (see "crafting
  loop disconnected" below) — a chance to wire that up.
- **Reach a location.** Travel-to-X objective (e.g. "reach Geffen Dungeon F3").
  Tiny given existing `locationId` / map-page state.

**Location bounties (hero-less, chained)** — *DONE* (first cut). Beyond the
hero-bound class paths, a location can post a board of `LOCATION_BOUNTIES`
(`protoStore`) the whole guild works toward — progress reads global
inventory/kills, no hero commitment. Bounties **chain via `requires`**: a bounty
stays **hidden** until its prerequisites are in `bountyDone`, so finishing one
reveals the next. First example: Boar Meadow's "Trapper's Order" (hand in 20
Boar Hides) → unlocks "The Tannery's Bulk Order" (100 hides). Reward is gold
(`grantMiscItem`). The dormant mock `LOCATION_QUESTS` board is suppressed where a
real bounty board exists — fold the remaining mock locations onto this system
when convenient.

Cross-cutting follow-ups: class-quest commitments + objective progress are
currently **unpersisted proto state** (a reload resets an in-flight quest) and
the per-hero `killsByMonster` map is persisted but the *baseline* lives in the
proto store — fold quest state into a real save slice when the system graduates
out of `src/proto`.

### Quest log / journal — a global "who's on what" view — *DONE* (option #2)

A top-bar **📜 Quests** button (next to Guild) opens the `QuestJournal`
(`src/proto/QuestJournal.tsx`) — a single roll-up of every quest (class paths +
bounties) built by `buildQuestBoard` (`protoStore`). Each row shows status, the
committed hero (hero chip) vs guild scope, live progress, completion count, and a
**"Go ›"** that focuses the map on the quest's site + opens its Location lens
(`setMapPage` + `setSelectedLocation` + `requestZoom(1)` + a new
`requestLocationTab`). Filters: status (ready / in-progress / available /
upcoming / completed), scope (everyone / hero / guild), and a per-location
group/filter. The **nudge**: the Quests button carries a gold badge with the
"ready to collect" count.

Follow-ups: a "completed archive" view (repeatable history beyond the ✓N chip);
a compact "active paths" strip mirrored in the Party lens; and map-pin markers
(a `?`/`!` on world-map locations) as a second nudge surface — see the
`questCompletions` tally for a future "quests completed" report.

**Quest detail screen + rewards** — *DONE*. Tapping a quest in either surface (the
location board or the journal) no longer expands inline / jumps to the map — it
opens the **full quest detail on the top-half `StageOverlay`** (over the
map/battlefield, lens stays). Board rows are `summary` mode; the overlay renders
the same `ClassQuestRow`/`BountyRow` in `detail` mode (story, objective, progress,
actions, and a "View on the map" link). Quests now carry structured
`rewards: QuestReward[]` (gold + gear) granted on completion (`grantEquipment`
mints owned instances; gold via `grantMiscItem`); reward chips are **inspectable**
— tapping gear opens the `ItemCodex` (stats/requirements/sockets) over the
overlay. Item-reward *equipment* currently mints fresh instances — fine for the
prototype, but revisit stacking/dedupe if the inventory grows noisy.

## Combat content

- **Per-location quests & async choices.** Each location grows a small
  pool of quest hooks (kill X, escort Y, recover Z) and pinch-point
  choices the player resolves out-of-combat. Resolution is async — the
  party at the location ticks toward the objective in the background,
  and choice nodes surface in a notification / location panel for the
  player to answer when convenient. Folds into the open-world shape
  (above) and the location codex, so each cell is more than "the wave
  it spawns."
- **Boss monsters with phase / trigger skills.** The **Elite Four**
  (`data/monsters.ts`) are just high-stat monsters with ordinary skills+tactics
  today — there's no boss *system*. Add an `isBoss` flag (+ stat/HP multipliers,
  distinct token/border in `BattleView`) and **trigger-driven** skills that fire
  on events rather than the normal cooldown cadence: on-spawn, on-low-health
  (**phase transitions** — enrage / new ability set below a HP threshold),
  on-ally-KO, periodic. The engine already has per-monster `skills`/`tactics` and
  statuses; this needs a trigger hook in `advanceRound`/`takeTurn` and a place to
  declare a monster's private (not-in-`SKILL_REGISTRY`) boss kit. (Roadmap Tier 2.)
- **Consumable combat items (auto-use).** Engine scaffolding exists
  (`EngineUnitInput.potions` → `potionsLeft`/`potionsConsumed`) but isn't wired to
  inventory or any use logic. Let a unit be configured with a `combatItem` (points
  at a `miscItems` consumable — Fish Stew / Herb Salve already craftable) that's
  auto-consumed in combat on a trigger (e.g. self-heal below a HP threshold, or
  per-N-rounds), decrementing inventory and firing the effect; degrade gracefully
  when it runs out. Gives crafted consumables a combat purpose. (Roadmap Tier 6.)
- **🟡 Minions — first iteration shipped.** The engine now supports owned,
  leashed combatants: `Combatant.ownerId` / `leashRange` / `summonTtl` / `summonTag`,
  a baseline owner-leash in `takeTurn` (`applyLeash` — strays return to the owner,
  mirroring the Charger/Flanker leash but owner-anchored), per-round despawn (TTL
  expiry + crumble when the owner dies, in `advanceRound`), and a `type: 'summon'`
  skill effect (`EngineSkill.summon` → `spawnSummons`, capped by `summon.maxActive`).
  All four fields round-trip in the snapshot. Two features ride on it:
  - **Beast Companion** (passive skill `beast-companion`): a permanent melee pet
    (`Unit.companion`, `companionToEngineInput`) that fields beside its hero in
    both battle modes (`createBattleFor` / `createOpenBattleFor` / `reconcileOpenPlayers`),
    scales its stats off the owner's level, and has its own tactic loadout edited
    on the Units **Pet** tab (`equip/unequip/moveCompanionTactic`). Excluded from
    the per-hero analytics, XP split, and HP-sync (it isn't a game unit).
  - **Summon Skeletons** (active skill): two low-stat melee bodies, Guardian +
    short leash, ~12s TTL, cap 2.
  Deferred follow-ups:
  - *Companion XP / independent level* — it currently tracks the owner's level
    ("levels with you"); a real per-pet XP bar + growth is the named next step.
  - *Companion revive* — a fallen pet only returns when its hero next deploys
    (open-world) or on the next wave (encounter); add an in-fight revive timer/cooldown.
  - *Multiple beasts / species* (`speciesId` is stored but only 'wolf' exists),
    pet gear/abilities, and an action-bar pet command (sic / heel / guard).
  - *Summon variety* — ranged/caster summons, summon-on-death, dismiss flow.
- **Pneuma / protective zones** — friendly zone that blocks (or halves) ranged
  damage to allies inside. Needs `blocksRanged` on `BattleZone`.
- **Reaction-channel skills** — Counter and Pneuma as equippable skills (we
  still only have the built-in `counterattacker` tactic). Extend
  `makeSkillTactic` to emit reaction-channel tactics.
- **Type-conditional / vs-type skills** — Turn Undead-style instant defeat
  vs a *type*. The element matrix covers radiant×undead damage already;
  the type flag is separate (`monsterType` on Combatant + `vsType` on
  EngineSkill).
- **Element on DoT / zones** — Poison and Firewall ticks bypass the matrix;
  a fire-immune enemy still burns in a Firewall.
- **Weapon-imbue from traits** — `element` trait category exists; not wired
  through `getUnitTraits` → `getDerivedStats`.
- **Per-unit elemental resistances** beyond a single armor element.
- **Combat UI for elements** — `resisted / 2×` indicator on damage numbers;
  show effective vs current armor element on the card.
- **Combat log UI** — event stream is rich (every hit, heal, status,
  interrupt); only floating numbers render. No history of "Aldric hit Slime
  for 24."

## Items, cards & sockets

- **Monster cards + socketing (the upgrade layer).** Only the *persistence*
  scaffolding exists — `EquipmentItem.slots` (0–4) and `itemSockets` (`itemInstanceId
  → card itemIds`, persisted via `socketsCodec`). The actual system isn't built:
  - *Card definitions + drops* — one `CardDef` per monster type (a `MiscItem` with
    a `cardEffect`), dropping at a very low rate (~0.5–2%) from that monster. Folds
    into the existing loot-roll path (`rewardKills` / `rollOfflineLoot`) and the codex.
  - *Card effects* — a typed union (`stat-bonus` / `elemental-bonus` / `regen-bonus`
    / `drop-rate-bonus` to start, extended as cards are designed) folded into
    `getDerivedStats` the same additive way skill/equipment bonuses already are.
  - *Socketing UI* — select item → select socket → pick a card from inventory →
    consume it into `itemSockets[instanceId]` (mobile: tap-through, mirrors the
    equip-picker flow). Stat deltas shown like the equip picker.
  (Mined from roadmap Tier 5 — the data fields were laid in for it but it's inert.)

## Inventory UX (at scale)

- **Search / pagination / sell / recipe-plan.** Inventory already has **category
  filter pills** (`InvFilter`: all / consumable / weapon / armor / accessory /
  misc) and an equipped-state filter (`Inventory.tsx`). Once cards + more gear land
  the list gets long; still missing: a **name search**, **sort** (stat score / slot
  count / name), **pagination / virtual list** for cheap mobile render, a **sell
  mode** (bulk-mark → gold preview → confirm; needs the shop/merchant economy
  above), and a recipe **"plan"** button that highlights missing ingredients in
  Misc. (Roadmap Tier 8.)

## AI & coordination

The biggest open chunk. Today every unit picks targets and paths
independently; `HERD_BIAS = 4` is a one-line hack that approximates "go the
same way" by penalising left-side detours.

- **🟡 Team blackboard (first iteration shipped).** Per-team scratchpad
  recomputed each round by a pluggable **planner** and stashed on
  `BattleState.plans: Partial<Record<Team, TeamPlan>>`, where
  `TeamPlan = { waypoint, focusTargetId, threat }`. Wired in so far:
  - *Wander reads the plan* — the party's shared roam `waypoint` (regroups on a
    fight, else roams the interior) lives on the blackboard; `executeWander`
    just reads it, so "wander together" is shared state, not coincidence.
  - `defaultPlanner` also computes an advisory `focusTargetId` (lowest-HP
    visible enemy) and a per-enemy `threat` score; both are exposed in the
    BattleView **Debug tab** and asserted in `blackboard.test.ts`.
  - *Targeting reads the plan* — `focus-fire` (party floor), `finish-them`
    (party, near-dead gate) and `opportunist` (unit) all pile onto the shared
    `focusTargetId` now, so an equipped party can already coordinate fire.
  Still open: add `disableTargetId` (an "avoid"/ignore channel), and use the
  blackboard to replace the `HERD_BIAS` path detour (flanker pulling a rogue the
  long way around).
- **Smart-party baseline (beyond opt-in tactics).** Focus-fire/finish-them are
  *opt-in* party tactics today — a player has to equip them. A group of competent
  humans would coordinate by default: softly converge fire on one foe, **avoid
  over-pulling** (not wake mobs outside the engagement radius into a fight already
  in progress), **hold ground / a chokepoint** (zone control), and **stay grouped**
  rather than each peeling off after a different target. Future blackboard
  iterations: a planner-chosen *party focus* the team biases toward without an
  equipped tactic; a pull/aggro-radius model so wanderers aren't dragged in; and a
  "formation/anchor" plan field for zone control + cohesion. (Raised 2026-06; the
  Charger/Flanker leashes are the first cohesion-over-chase step.)
- **Strategies = multi-channel tactic bundles.** A `STRATEGY_REGISTRY` where
  each entry expands to TacticRefs across channels + an optional planner.
  Examples: *Assassinate* (focus-squishy + flank + cloak/back-stab),
  *Lock & Focus* (Controller + Focus Fire), *Kite* (existing + maintain LoS).
- **🟡 Robust range selection / positioning (kite vs. hold-and-let-approach).**
  Kiting is now **opt-in** (Kiter / Wary Caster tactics) and the default is
  "close to `castRange` and hold, letting the enemy approach" — a deliberate
  *tune-it* state while we decide what the default should be (2026-06). Open
  threads: (a) decide the default per role (squishy caster behind a tank may want
  hold; a solo kiter wants kite) — the **team blackboard** could pick it from the
  party composition (is there a front line to trust?); (b) make the kite itself
  *really* robust (the recurring edge cases — anchor on the right skill range,
  cliffs/LoS, not stranding) argue for the movement layer asking the action layer
  "what will I actually cast here, and from how far?" instead of inferring from raw
  skill ranges; (c) a placement/anchor plan field (hold a line / chokepoint) so
  "let them approach" can mean "to *this* spot," not just "wherever I stopped."
- **🟡 Threat model — extensions (core shipped).** A WoW-style threat table now
  drives the default targeting fallback (`selectTarget`), with damage + healing
  generating threat, hysteresis for the aggro wobble, and a hard **Taunt** skill +
  **Defensive Stance** threat-multiplier passive (see the §threat section in
  AGENTS.md; `threat.test.ts`; the Threat Trial showcase). Still open:
  - *AoE / aura threat* — a tank generating threat on *all* nearby foes each round
    (a Defensive Stance aura, or a cleave), so one tank can hold several mobs.
    Today threat is single-target per hit, so a tank holds only what it's hitting
    and the other mobs drift toward the highest-damage hero (which, against an
    immobile mob, can read as it standing idle "wanting" an unreachable target).
  - *Reachability-aware targeting* — fold "can I actually path to it?" (`canReach`)
    into the threat score so a unit doesn't lock a high-threat foe it can never
    engage; pairs with the AoE-threat fix above.
  - *Threat decay / leashing* and *taunt diminishing returns* — WoW niceties for
    longer fights; not needed for the current encounter lengths.
  - *Tune the showcase* — the Stone Sentinel / kiter / tank numbers (threatMult,
    sentinel DPS, Taunt cooldown) want a browser pass to make the wobble feel
    right; the engine constants (`THREAT_WEIGHT`, `PULL_FRACTION`) are the knobs.
- **🟡 Offensive-option scoring — more scorers (`estimateDamageVs` shipped).**
  Target-aware attack selection picks the hardest-hitting single-target *attack*
  vs the locked enemy (`reorderAttacksForTarget` → `estimateDamageVs`, element
  matrix + magic/physical mitigation; conservative-margin by default, the
  **Exploit Weakness** tactic drops the margin). It's deliberately the one hook
  every future "which option deals the most?" decision should route through.
  Still open:
  - *AoE spread value* — score an area skill by **expected total** damage across
    everyone it'd catch (cluster size × per-target effective dmg), so a unit
    favors a multi-hit AoE over a single bolt when the foes are bunched. Today
    AoE/`type:'aoe'` skills are excluded from the re-rank and gated separately
    (channeled-AoE worth-it gate); this folds them into the same comparison.
  - *Position for the preferred attack* — `estimateDamageVs` now amortizes channel
    time (so Frost Bolt is preferred over a slow Lightning Bolt vs a fire foe), but
    the action channel still fires the highest-priority *in-range* ready attack. A
    longer-range lower-throughput skill (Lightning Bolt r8) therefore opens a fight
    before the unit closes into the preferred shorter-range skill's band (Frost Bolt
    r6). Fix options: have a caster hold/close to its *preferred* attack's range
    rather than the longest skill range, or let a unit "hold fire" a beat while it
    closes when the preferred attack is out of range but reachable.
  - *Sideboard / weapon-swap candidates* — the motivating future case: a unit
    with a stowed loadout (e.g. a fire sword vs a frost sword) evaluates each
    *basic-attack element* (and skill set) it could swap to via `estimateDamageVs`
    and switches when the gain clears a swap cost. Needs a `Loadout`/sideboard on
    the unit + a swap action; the scorer already takes `skill: null` (basic
    attack) so it's swap-ready.
  - *Status-synergy & on-hit value* — fold a skill's rider (freeze→amplify,
    poison stacks, knockback peel) into its score, not just raw damage, so a
    setup hit can out-rank a slightly bigger nuke. Also: include the stealth
    bonus and `vulnerable/armored` factors in the estimate once it scores
    cross-target (right now they're constant per target, so omitted).
- **Ambush combo** — primitives exist (cloak, back-stab, flanker,
  focus-casters, **ambusher** — stalk-while-cloaked); needs an orchestrator
  that holds Cloak until in Back Stab range of the focus target.
- **Sneak Attack skill** — a learnable skill that scales the base
  `STEALTH_ATTACK_BONUS` (currently a flat +25% on any strike from stealth) up
  with level, so investing in stealth makes the opening ambush hit harder.
  Today the bonus is a single engine constant; the skill would read its level
  and feed a per-unit multiplier through the adapter.
- **1v1 chase circling** — a lone chaser orbits a barrier after a fleeing
  target forever. Multi-unit fights converge so this rarely bites in
  practice; would need a "cut the corner" intercept.
- **Gather-and-guard (open world)** — a tactic that peels a unit off to work a
  nearby resource node (ore vein, lumber, forage) while the rest of the party
  screens for it — or lets it solo the node outright when the area's clear of
  threats. Needs: resource nodes as a new open-world entity (position + yield +
  work-time), a "go work that node" behavior built on the **move-order**
  primitive (path to the node, hold and gather on arrival), and a party-side
  read so guardians interpose between the gatherer and known threats — the
  **team blackboard** is the natural home (a gather assignment / `protectTargetId`
  the screening tactic reads, alongside the existing shared `waypoint`). A
  safety gate keys off vision/threat (no enemies in sight, or the escort
  outnumbers the threats nearby) so the party only commits when it can afford to.

### Monster aggression & packs (extensions)

First iteration shipped — `Combatant.provoked` + the `skittish` / `pack-tactics`
/ `pack-hunter` / `flee` (monsterOnly) tactics, aggro-on-hit in `applyDamageRaw`,
`rallyPack` in `takeTurn`, and `aggro`/`rally` events with BattleView feedback +
a codex disposition note. Deferred:

- **Call range / frequency.** `rallyPack` calls at full `visionRange` every turn.
  Add a louder/longer-range or cooldown-gated "howl" (rank-scaled) instead of an
  every-turn full-sight call.
- **Threat-based retargeting.** Rallied kin adopt the *caller's* target only;
  shift aggro toward whoever's dealing the most damage (incl. other party
  members), reading the planner's `threat` map.
- **Cross-species / faction packs.** Calls match exact `name` today; allow
  "call any allied monster nearby" or tagged faction groups.
- **Passive herd-wander.** Passive herds (skittish, no `pack-hunter`) lurk in
  place; give them a non-hunting "graze together" group roam (vs. `pack-hunter`,
  which converges on heroes via the team waypoint).
- **Flee polish.** `flee` runs toward the unit's own edge (+ cohesion); make it
  flee *directly away from* the nearest threat, seek terrain/cover, and regroup
  with the pack rather than corner itself.
- **Aggression decay / leashing.** `provoked` is permanent; let monsters calm
  down and de-aggro when heroes break contact, or leash to a home area.
- **Tiered dispositions.** Beyond skittish/aggressive: *territorial* (aggro only
  within a radius), *ambush* (passive until a hero is adjacent), *fearful*
  (flees on sight).
- **Alert propagation.** A provoked monster alerts kin who then *hunt* the
  party's last-known position even out of sight (vs. only adopting a live lock).
- **Pack roles.** Leader/follower — kill the leader and the pack scatters/flees;
  or coordinated flank/surround driven by the team blackboard.

## Proposed tactics & counter-enemies (raised 2026-06)

A design pass on new player tactics — each either unlocks a hunting strategy
(solo or party) or counters an enemy archetype we haven't built yet (the enemy
is listed so the tactic and its foil ship together). Inspirations: Ragnarok
Online, WoW, botting, Kittens Game, Guild Wars, RimWorld, Dwarf Fortress, LoL.
Grouped by how much engine plumbing they need. None are built yet.

Cross-refs: several overlap themes already noted under **AI & coordination →
Smart-party baseline** (chokepoint / over-pull / formation) and **Gather-and-
guard** — these are the *equippable-tactic* expression of those.

**Cheap — pure tactics on existing hooks:**

- **Spread Out** (movement · floor · unit/party). Hold a minimum gap from allies
  so one enemy AoE / cleave / ground zone can't catch the whole party. Reads ally
  `centroid` + the existing separation system. *Counter-enemy:* **Bombardier**
  (lobs a `zone`) or **Cleaver** (large `aoeRadius` melee). The stack-vs-spread
  decision the roster currently can't express.
- **Conserve / Don't Overkill** (action · unit). Basic-attack trash; bank big
  cooldowns for elites/bosses, and never spend an expensive nuke on a target a
  basic will finish. Reads target HP, `skillDamageEstimate` / `estimateDamageVs`,
  `isBoss`. *Unlocks:* higher sustained throughput on long AFK runs — and it
  shows up directly in the new battle-report DPS/efficiency numbers.
- **Last Hit (Secure)** (targeting · trigger · unit). Snap to an enemy a single
  swing can kill, to secure the killing blow. Because kills credit the killer for
  `monstersDefeated` / `itemsFound` and seed the level-split, this lets a player
  steer XP/loot to a chosen hero — LoL last-hitting meets our credit model, and
  now legible in the per-hero reports. Reads `estimateDamageVs`.
- **Decapitate (Kill the Summoner)** (targeting · trigger · unit). Focus enemies
  carrying `summon` / buff skills before the adds snowball (Assassinate covers
  healers; this covers force-multipliers). *Counter-enemy:* **Necromancer /
  Shaman** using the existing `SkillType: 'summon'`.
- **Bodyguard / Peel-the-carry** (movement · trigger · unit). Like Guardian but
  body-blocks for the *highest-damage* ally, not the squishiest. *Counter-enemy:*
  an **Assassin** that dives the back line. Reads ally damage / `guardPoint`.

**Needs engine plumbing:**

- **Sidestep (Hazard Dance)** (movement · trigger · unit). If standing in a
  damaging ground zone, step to the nearest safe cell instead of holding. *Needs:*
  expose `state.zones` cells to tactics + a "nearest cell not in a damaging zone"
  helper. *Counter-enemy:* hazard-layers (Molasses/Lightning-Storm casters, a
  future **Lava Drake** / **Plague Toad**). Today units happily stand in fire.
- **Break Line of Sight (Juke)** (movement · trigger · unit). A focused squishy
  ducks behind the nearest wall to break a ranged/caster's LoS (we already block
  caster fire through walls). *Needs:* an LoS-aware "find cover cell vs threat"
  helper over `barriers` (`canReach` / `steerAround` exist). *Counter-enemy:*
  **Sniper / Artillery** (long range, slow channel). Pairs with the open
  "channeled spells don't recheck LoS at resolve" gap below.
- **Cleanser / Triage** (targeting + action · unit). Dispel the worst control
  (`taunted` / `rooted` / `frozen` / `slowed` / `poisoned`) off the ally nearest
  death. `EngineSkill.dispelCategory` already exists; *needs:* the dispel skill +
  a "worst-afflicted ally" selector. *Counter-enemy:* a **Hexer** that stacks
  debuffs.

**Party positioning (overlaps Smart-party baseline — promote to equippable):**

- **Puller** (movement + targeting · trigger · unit). One hero tags a distant mob
  and retreats toward the party `waypoint`, dragging it back rather than diving
  the pack — controlled aggro via `moveOrder` + threat. *Unlocks:* the classic
  "pull to the party" solo/duo loop; *counters* dense packs (avoids over-pull
  wipes). Wants the aggro-radius model already noted under Smart-party baseline.
- **Hold the Line / Chokepoint** (movement · party). Form up on a barrier gap so
  melee enemies funnel in one or two at a time (`barriers` + `guardPoint` +
  holds). *Counter-enemy:* a **Swarm** (many weak, high `openWorldCap`). The
  equippable version of the "hold ground / a chokepoint" zone-control idea above.

Other archetype counters worth a tactic when the enemy lands: **anti-stealth /
Detector** (reveal + strike cloaked foes via `removesStatusId`, vs an **Assassin
/ Phantom**), and an **Executioner** (execute-range damage surge, vs high-HP
**Bruisers**) — both lower-priority than the cheap set above.

## Engine inconsistencies & gaps

- **Channeled spells don't recheck LoS at resolve time** — a target can step
  behind a wall mid-channel and still get hit on resolve.
- **Heal / buff / reveal don't check LoS** — only enemy targeting does.
  Probably desirable, but inconsistent.
- **`enforceSeparation` against walls** — corners can briefly produce
  two-unit pile-ups before things resolve.
- **Visibility graph rebuilt per nav call** — fine at this scale; cache
  corner-corner edges per battle if terrain grows.

## Code health / tech debt (2026-06 audit follow-ups)

Deferred items from the codebase audit (the obvious stale-comment / dead-code /
small-bug wins were already cleaned up). Grouped by theme; each is left for a
focused pass because it's behavior-sensitive, a refactor, or a product decision.

- **15-grid constants used unscaled on big arenas (behavior + replay-sensitive).**
  `PERIMETER_LEFT=2`/`PERIMETER_RIGHT=13` (`constants.ts`, via `grid.ts` `isPerimeter`)
  and `steerAround`'s herd-bias pivot `COLS/2` (`barriers.ts:170`) are baked for a
  15-wide grid; on a 50×50 open-world map "perimeter" and the left-side path
  surcharge pivot around x≈7.5 regardless of true width. Should read `arenaCols()`.
  Touches movement → verify open-world replays after. (Relates to the *Grid-size
  independence* invariant below — these are the known violations.)
- **Reward model duplicated across live / batch / offline.** `tick` vs `batchTick`
  vs offline `runCombatSlice`/`rewardKills`/`rollOfflineLoot` re-implement
  kill→loot→reward + recovery/level-up separately; the per-kill drop-roll is
  copy-pasted 3× and the empty `LocationCombatStats` literal ~4× (no
  `emptyLocationStats()` factory like `emptyTally()`). Drift risk if drop/exp
  semantics change. Consolidate the shared core.
- **Store monolith + duplicated initial state.** `useGameStore.ts` (~1.8k lines)
  holds engine-adjacent offline sim/priming (~lines 220-672) that could move to
  `lib/offline.ts`; the initial-state literals (familiarity/seen/partyTactics/recipe
  ids) are duplicated verbatim between the store initializer and `resetSave` →
  extract `INITIAL_*` factories. Also: `resetSave` omits clearing persistent
  `unitStatHistory` and `lastCatchUp` (stale data survives a reset).
- **Vestigial `tool` equip slot.** No `tool` slot in the live 6-slot model
  (`mainHand/offHand/sideboard1/sideboard2/armor/accessory`); handaxe/pickaxe/
  lockpick are unreachable gear and CLAUDE.md still lists `tool` as a slot. Decide:
  remove the plumbing, or wire it to a gather/resource feature (see *Economy &
  resources*). Update CLAUDE.md either way.
- **Now-orphaned `'flee'` LogCategory.** After fixing the inverted victory chip,
  `'flee'` is emitted nowhere (only `victory`/`defeat` are). Either wire it to
  monster-flee events or drop it from `LogCategory` + `LOG_META` + the filter list.
- **Per-weapon elements / dual-wield.** Attack element is simplified to "mainHand
  wins" (one element per unit, `lib/stats.ts`). The richer model: a fire mainHand +
  frost offHand each strike with their own element on their own cadence — needs real
  dual-wield support (separate attack timing) first.
- **Save robustness / codec dedup.** `combatStatsCodec.byUnit` is documented to
  "migrate to {}" but has no `migrate`/backfill; `worldCodec.deserialize` defaults
  `partyTactics ?? []` while `migrate`/`empty` default to `DEFAULT_PARTY_TACTICS`
  (a current save with the field absent loses the default tactic). The near-identical
  single-record codecs (codex/combatStats/unitStats/unitHistory/sockets) could share
  a `makeRecordCodec` that also fixes the `?? {}` guard drift in one place. (None are
  `version`-migrated; first required-field shape change needs a migration story.)
- **Duplicated UI tables.** `CLASS_ICON` (BattleView ↔ RosterCarousel), `ELEMENT_COLORS`
  (Map ↔ LocationCodex, while a canonical copy sits unused in `lib/elements.ts`),
  `fmt` number formatters (SamplingDebug ↔ TallyBreakdown), `Window`/`WINDOWS`
  (UnitReportSheet ↔ Reports). Hoist to shared modules (verify the class strings are
  byte-identical before collapsing, to avoid a visual regression).
- **App-root re-render.** `App.tsx` subscribes `units` only to pass to
  `RosterCarousel`; per-tick HP sync then re-renders the whole tree. Let
  RosterCarousel subscribe internally (mobile perf).
- **Vision cache global-state dependency.** The per-turn `visibleEnemiesOf` memo
  (`spatial.ts`) is process-global and correct only because one battle is stepped at
  a time. If concurrent/interleaved battle stepping is ever added, key it on battle
  identity or it can collide on `self.id`.
- **Latent type traps.** `damage.ts` `StatKey` includes `'magicDef'` but `STAT_KEYS`
  excludes it (a formula using it silently resolves to 0); `StatModifiers.acc` is
  tracked/shown but never rolled in combat.
- **Magic-number literals worth centralizing.** `380ms` token/cam transitions vs
  `ROUND_MS` (BattleView/RosterCarousel), the `300`ms double-tap window + drag
  threshold duplicated across Map/RosterCarousel handlers, and engine tuning literals
  (taunt `+10%`, kite dead-band `0.4`, "arrived" radius `0.6`, summon fan-out offsets).
  Name them where it reduces drift risk.
- **Content orphans (keep-for-future vs remove).** `earth-bolt` skill (defined in both
  registries, equipped by nothing); `versatile`/`calm` traits (unreferenced); element
  id scheme inconsistency (a `lightning` *trait* exists but items use `wind`, e.g.
  "Spark Knife" `element:'wind'`). Decide and either wire up or delete.
- **React index keys.** eventLog / battle-trace / status rows keyed by array index;
  fine while append-only, but a prepend/trim would reuse wrong rows.

## Performance (large-battle render & engine)

### ✅ ROOT CAUSE of the "fast-slow" found & fixed (2026-06)

**It was a tick-scheduler phase bug, not render or engine cost.** `tick()` set
`lastTickAt = Date.now()` *after* the reducer ran, landing it tens of ms past the
200ms boundary; the next `catchUp` then floored `(now − lastTickAt)/TICK_MS` to
**n=0 and skipped** — dropping ~40% of ticks, so rounds applied at ~2× the interval,
*irregularly*. The CSS glide faithfully rendered that as fast-slow. Fix: advance
`lastTickAt` by a **fixed `TICK_MS`** (preserve the remainder, stay phase-aligned;
`batchTick` still resyncs to `Date.now()`). Measured (perf scene, 4× CPU): per-round
321→201ms, dropped ticks 40%→8%, 3.4→5.0 rounds/sec. Glide is now smooth with **no
lag, no interpolation**. Guard: `tick-cadence.test.ts`. (Corrects the Phase-4 note
below: the cadence jitter was NOT mainly `advanceBattles` long-tasks — engine is
~8ms/tick; `--seg-ms` Phase 1.1 was papering over this scheduler bug.)

Pace is now a single knob: **`ROUND_EVERY_TICKS`** (ticks per engine round; 5 = ~1
round/sec). It also drives the offline rounds↔ticks conversion, so live+offline stay
in sync — change it alone. For smoothness at a *given* pace, the lever is
`ROUND_TIME_SCALE` (finer sub-steps), NOT the pace.

**Dead ends — measured no-ops/regressions, do NOT retry for the fast-slow:**
- *Entity interpolation* (render N ms in the past): works, but needs ≥1 round of
  delay, and the heavy-scene cadence is ≥ that, so lag (~300ms) can't be tuned out
  without stutter. Felt worse than the jitter. Also needs camera interpolation or
  tokens clip backward on each camera step.
- *Per-frame spring toward the latest pos*: **worse** (CoV 0.6→1.8). Easing toward a
  *held step* target decays velocity to zero each round = a sawtooth.
- *Extrapolation*: lag-free but overshoots → backward correction on every stop/turn.
- *Constant-velocity CSS glide* (scale duration by step distance): no-op. CSS
  transitions restart every round → interrupted-segment ceiling ~0.65 CoV regardless.
- *Per-round target EMA* feeding the glide: noise, no reliable win.
- *Softening `enforceSeparation`* (DEV `?sep=`): movingStepCoV ~0.49 unchanged →
  separation is NOT the dominant per-round step jitter.
- *Stop-go*: units hold only ~5% of rounds → not the cause.
- *Skipping render content* (DEV `?nomini/?nofx/?nochips`): cadence unchanged → the
  per-round React *content* was never the bottleneck (the scheduler was).

Target: ~25+ entity open-world battles smooth on mobile. **Phases 1–3 of the
old `performance.md` plan are done** (that file was folded in here and deleted):

- **✅ Phase 1 — motion decoupled from React.** The per-frame rAF `setFrame`
  loop is gone; open-world tokens + every camera-following element ride CSS
  transitions, so the battle subtree renders ~5×/sec (one per engine round)
  instead of ~65×/sec. Measured ~2× mobile fps. Screen-space coords unchanged
  (a static frame is pixel-identical).
- **✅ Phase 1.1 — adaptive motion cadence (`--seg-ms`).** Phase 1 dropped the rAF
  loop but also threw out `useSmoothScene`'s EMA-of-round-interval timing, hardcoding
  a fixed `380/400ms` glide. Under per-tick load the round interval jitters (the store
  ticks on a 200ms `setInterval`, but each tick's sim+render overruns and `catchUp`
  batches late ticks), so a fixed glide alternately parks early (stall-then-jump) or
  sprints a batched multi-cell step — the "slow-fast" wobble. LiveBattle now writes
  `--seg-ms` (EMA of the real round-render gap × `CADENCE_RUNWAY`=1.7, clamped
  160–900ms) imperatively on the arena wrapper each round; every positional transition
  reads `var(--seg-ms)`. Re-derives the deleted EMA win declaratively — no rAF, zero
  extra React renders, just CSS inheritance. Verified live: ~620ms under CPU-throttled
  mobile (real cadence ~365ms) vs the old 380ms that was *shorter* than the jittery
  interval. (`BattleView.tsx`.)
- **✅ Phase 1.2 — heavy-field cadence: half the sim rate AND half the pace, for
  smoothness (the "lighter" Phase-4 alt).** The watched battle is the only one
  full-simmed, and on mobile a crowded field's per-tick `advanceRound` overruns the
  frame budget (the long-tasks behind the choppiness). A high-cap open-world field
  (`openWorldCap >= HEAVY_FIELD_CAP`=16) advances every 2 ticks instead of every tick,
  halving the `advanceRound` work. It keeps the **fine** `timeScale 2` granularity, so
  its logical pace also halves — a deliberate trade: crowded *watched* fights resolve
  slower but glide smoothly (off-screen/offline rewards are rate-extrapolated
  regardless). Cadence lives in one place (`cadenceFor`) so `timeScale`/`everyTicks`
  can't drift; static per battle so timeScale never thrashes mid-battle and snapshot
  replays stay byte-identical (open-world store tests use cap 3, unaffected).
  *Why fine + slow, not coarse + full-pace:* the first cut held pace identical by
  dropping to `timeScale 1` (`everyTicks × timeScale` = const) — but the jerk-metric
  sweep (`e2e/jerk.spec.ts`, median CoV of per-token on-screen speed under 4× CPU)
  showed **granularity, not tempo, is the smoothness lever**: `timeScale 1` is the
  *coarsest*, jerkiest step (CoV ~0.8–1.1) while `timeScale 2` every-2-ticks measures
  ~0.65 at the same CPU; slowing tempo *alone* (coarse + `hevery 4`) barely helps. DEV
  `?hts=`/`?hevery=`/`?ts=` params + `data-cid` on tokens drive the sweep.
  (`useGameStore.ts`: `HEAVY_FIELD_CAP`, `cadenceFor`; `e2e/jerk.spec.ts`.)
- **✅ Phase 2 — LOD tokens.** `BattleChip` drops its floating plate + facing/
  moving nubs (most per-token DOM) when zoomed past `LOD_CAM_SIZE` or with more
  than `LOD_TOKEN_COUNT` on-screen tokens (`Lod.test.tsx`).
- **✅ Phase 3 — cheap engine wins (the safe subset).**
  - *Vision cache* — `visibleEnemiesOf` (the hottest read, 3–5× per unit/turn)
    is memoized per combatant, keyed on a per-`takeTurn` generation + the
    querier's live position, gated on the spatial-hash ambient so it's active
    only inside a live round (`src/engine/spatial.ts`). Byte-identical: only
    `self` moves during its turn; direct test calls bypass it.
  - *Minion lock-clear* — the crumble pass batches dead-minion ids and clears
    locks in one roster pass instead of one-per-crumble (was O(minions × N),
    `advanceRound`). Non-spatial, so the hash doesn't apply.

Residual smoothness (after Phase 1.1, lower priority than throughput):

- **Knockback reads as a lurch — it's a discrete multi-cell teleport.** Arrow
  Shower (`knockback: 3`) jumps a target up to 3 cells in one round; the renderer
  has no notion of distance, so it glides that 3-cell jump over the same `--seg-ms`
  as a ~0.45-cell walk step → ~7× apparent speed for one segment, then a crawl. The
  cadence fix (1.1) fixes *timing* jitter, not this *distance* disparity. The engine
  already speed-limits the analogous case — retreat/flee (`RETREAT_SPEED_MULT`, the
  "units speed up ~4×" jank, `engine.ts`). Two options: (a) **engine** — spread the
  push across the `timeScale` sub-rounds like retreat; lowest visual risk but it
  changes per-round positions, so it **breaks byte-identical snapshot replay** (needs
  a snapshot version bump + replay regen). (b) **render-only** — per-token
  distance-aware duration (longer glide when it moved far, so apparent velocity is
  constant) or an ease-out timing fn for knocked tokens; no determinism risk, but
  must not also slow-glide respawns / camera-retargets across the map (distance alone
  is ambiguous — gate on the round's `knockback` events).
- **Boost Agility "slow-fast" is render-side, not a movement change.** `agi-up` adds
  `spd:6`, and `spd` does **not** feed `moveSpeedOf` (only `moveSpeed`/`moveSpeedMult`
  status mods do) — so per-round travel distance is unchanged. What it changes: turn
  order (SPD-desc re-sort → the buffed unit now moves before/after the units it
  `enforceSeparation`-shoves against, reshuffling sub-cell shoves round to round) and
  `onAttackBeat` cadence (more attack floats). The perceived jerk is that reshuffle
  amplified by the old fixed-duration glide; 1.1 dampens it. If it still reads rough,
  the lever is `enforceSeparation` adding a shove on top of the move each round (the
  renderer can't tell a shove from travel) — already `÷ timeScale`'d; further smoothing
  would be a separation-resolution change, not a render one.

Deferred / not worth it:

- **Spatial hash for zone-membership & spawn-separation — intentionally NOT
  done.** The hash is a **round-start snapshot**; `addCombatant`/`spawnSummons`
  add combatants **mid-round**, which are deliberately invisible to it (that's
  the established deterministic baseline — later units don't see same-round
  summons via the hash). `zoneMembers` and the spawn `enforceSeparation`
  currently **brute-scan precisely so they catch those mid-round additions** —
  routing them through the round-start hash would silently drop summons from
  zones / let spawns stack, breaking byte-identical replay. A safe version needs
  an incrementally-maintained hash (insert on `addCombatant`), which would *also*
  change mid-round-summon vision/targeting — a bigger change than the win
  justifies (zone scans are guarded by `state.zones.length === 0`; open-world
  spawns are ~1 per 30 ticks).
- **`React.memo` on `BattleChip` — not viable as a wrap; skipped.** The engine
  **mutates combatant objects in place** (the `battle.combatants` array reuses
  the same object refs; the store only shallow-clones the battle wrapper for
  identity). So in `memo`, `prevProps.c` and `nextProps.c` are the *same object*
  — comparing `c.hp`/`c.pos` can never see the old value, and a naive memo would
  freeze tokens. A correct memo needs every displayed mutable field (hp, alive,
  moving, facing, channel progress) passed as **primitive mirror props** plus a
  value-comparing custom comparator (cam/pos are fresh objects each render) — a
  fragile coupling to three child components for marginal gain now that the
  subtree only renders ~5×/sec and most tokens change every round anyway.
- **Phase 4 — run the sim in a Web Worker.** The highest ceiling, the most work.
  BSNAP tokens already make a battle worker-portable, so the engine compute can
  move off the main thread. (The lighter sim-rate throttle is now **done** — Phase
  1.2 above; off-screen battles are already rate-extrapolated.) Only reach for the
  worker if Phases 1–3 + 1.1/1.2 aren't enough. **Note (re: jerkiness):** the worker
  attacks the *root* of the cadence jitter Phase 1.1 papers over — main-thread sim
  stalls (`advanceBattles` long-tasks: ~1.5s/5s under CPU-throttled mobile in the
  `?perf` harness) are what make round-render gaps irregular. Moving the sim off-thread
  would make the render loop independent of sim cost, so cadence stays steady without
  needing the EMA stretch. It would **not** fix the knockback lurch (a render-side
  distance issue, above). So: 1.1 is the cheap smoothness win now; the worker is the
  throughput ceiling for very high entity counts; the two are complementary.

## Heuristic shortcuts

- `HERD_BIAS = 4` — numeric fudge for path side-picking. The team blackboard
  is the real fix.
- **Magic focus `range` stat** — rod / wand / staff carry `range` to make
  casters ranged in the engine. Class (Mage / Cleric) should set this, not
  weapons.
- **`MAX_UNIT_TACTICS = 4`** — caused awkward swap-outs (Lyra lost `nimble`
  for `flanker`). Bumping to 5–6 might be more honest now.

## Data / spec drift

- **Crafting loop is disconnected at the joints.** Monster drops add
  `drop-*` items to inventory, but recipes consume the starter items
  `m1`–`m4` (not the `drop-*` items), and recipe outputs are `craft-*`
  items that don't exist in `equipment.ts` — so nothing crafted is
  equippable. Closing drops → recipes → equipment is the main inventory
  gameplay gap.
- **Dead code removed** (was: `HelloWorld.tsx`, `Codex.tsx` page,
  `useResourceStore`). The codex UI lives embedded in `Map.tsx`.
- **Per-location terrain** is a single hardcoded map (`LOCATION_TERRAIN`)
  and `arenaBarriers()` returns one fixed cross regardless of location.
- **No save migrations** — recent INITIAL_UNITS overhaul, new skills, new
  equipment fields (range on rod/wand/staff) would invalidate any saved
  state if persistence is added later.

## Verification gaps — spot-check until codified

Behaviors not covered by automated tests; apt to regress silently. Run
through after relevant changes (or before any release-worthy commit),
then promote to a real test once stable.

**Combat view** (after `Combat.tsx` / render changes):

- Unit token at the arena edge stays fully on-screen (no clipping).
- Tap a chip opens a detail card with: name + team, HP bar + integer,
  STR/DEF/INT/SPD, per-skill cooldown meters with remaining rounds,
  statuses with duration, casting line when channeling. Tap the same
  chip again closes it.
- Walls render solid stone; cliffs render dashed / translucent.
- Channeling unit gets an amber "✦ \<spell\>" badge + ring.
- Floating numbers — red damage / green heal / fuchsia DoT; amber
  "interrupted" on disrupted casts.
- Hit flashes and attack arc lines appear and fade per round.
- Preview chips render before the wave starts; no leftover slice-to-5.

**Combat feel** (after engine / tactic / skill changes — run one Geffen
Dungeon Floor 2 fight and one open-field fight):

- Party files around the central cross at Geffen 2 without piling up;
  no permanent outliers taking the long way (the `HERD_BIAS` heuristic
  still doing its job).
- Open-field combat is clean: no units stalling, melee converges.
- Kiter holds at spell range, backs straight off in the open, arcs
  along walls instead of pinning into a corner.
- Faster units (high `spd`) visibly outpace slower ones over a few
  rounds.
- Casters refuse to fire through walls (Theron behind a cross arm);
  do fire through cliffs when a location uses them.
- Knockback stops against barriers AND the arena perimeter; nothing
  leaves the map.
- Frozen units skip a turn but stay frozen; stunned units skip and the
  stun is consumed.
- Stealthed units can't be targeted by enemies; basic attacks reveal
  the attacker after the strike.

**Catalog / data** (after `INITIAL_UNITS`, equipment, or skill catalog
edits):

- All six heroes have a class and a deep, role-built loadout; casters
  and the archer deploy back-line, melee front-line.
- Geffen 2 wave (3 tough-slime + 2 bat) still resolves without stalling.
- New active skills appear in the skill tree and the action-bar drag
  picker.

**Persistence** (whenever save/load lands):

- New skills, new equipment fields (e.g. `range` on rod / wand / staff),
  and reshuffled `INITIAL_UNITS` need a migration story or they'll
  silently corrupt old saves.

## Grid-size independence (invariant — keep)

Arena size is now **per-battle** (`BattleState.cols/rows`), defaulting to
`COLS`/`ROWS` (15×15) for encounters and set large (100×100) for open-world.
Movement clamps read the active bounds via `engine/arena.ts`
(`setArenaBounds`/`arenaClamp`), set at each engine entry point — **no movement
clamp hardcodes a size**. **No tactic may hardcode absolute coordinates** —
everything is relative to enemies/allies/edges. Tuned-for-15×15 knobs that an
*encounter* still depends on (don't blindly scale them with the open-world map):
`BASE_MOVE_SPEED`, reach bands in the adapter, `startingPosition` formations,
`SEPARATION`, `HERD_BIAS`, kiter probe distance, `DEFAULT_CAM_SIZE`. Open-world
has its own `followCamera` + `OPEN_CAM_SIZE`.
