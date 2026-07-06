# Combat / Tactic Engine — Backlog

Deferred work and known shortcuts for the combat engine (`src/engine`).
Implemented behavior is in `CLAUDE.md` → Feature Specifications.

## Feature unfolding (progression modes)

A `progressionMode` (`'sandbox' | 'curated'`) now gates content so a new player
isn't handed everything at once. **Scaffold + first slice are in** (`src/lib/unlocks.ts`,
persisted via `worldCodec`, switchable in Time → Debug or `?mode=curated`):

- **Sandbox** (default; the game as it always was): full party, all recipes, every
  skill. The dev/“whole toy box” stance — gating is its *absence*.
- **Curated**: starts a single unclassed **Novice** (`freshGameSeed` in the store);
  slim recipe seed (`recipe-herb-salve`); trimmed location familiarity. The first
  unfold is **picking a class** via the existing city class-change quests
  (`protoStore` `CLASS_CHANGE_QUESTS`), which writes the real `unit.class`. Class
  then opens that class's **skill kit** (`CLASS_SKILL_KITS`): gating is centralised
  in `isSkillUnlocked`, enforced hard in the store's `learnSkill` chokepoint, and
  reflected in both learn surfaces (`pages/Units` skill list, `proto/StageOverlay`
  skill tree) via the new `unlocked` field on `getAvailableSkills(unit, mode)`.
- **Separate saves per mode** (`save:sandbox` / `save:curated` + a `save-active-mode`
  marker). `persistSave`/`resetSave` only touch the active slot; `switchProgressionMode`
  is non-destructive (flush current → load other, or fresh-seed). Legacy single
  saves migrate into the matching slot on first load. *Note:* switching loads the
  target's saved `savedAt`, so the normal offline catch-up runs for the time since
  that mode was last played (may pop an OfflineSummary on switch — fine for now;
  revisit if it feels noisy).

Still to unfold (next slices, in rough order):
- **Recipe unfolding driver.** Curated seeds few recipes but nothing *grants* more
  yet — wire recipe unlocks to quest completion / level / location familiarity
  (add an `unlock` to `RECIPE_REGISTRY` + a `learnRecipe` grant). The crafting loop
  is also still broken end-to-end (see *Economy & resources* / Crafting below).
- **Location / map reveal.** Curated only trims familiarity today; the overworld
  still draws every node. Gate visibility off familiarity/quest state in `Map.tsx`
  (and the shell stage), with a “rumored” vs “revealed” state.
- **Quest availability + dependency graph.** The proto quest layer
  (`protoStore.ts`: `LOCATION_QUESTS`, `CLASS_CHANGE_QUESTS`, `LOCATION_BOUNTIES`)
  is the natural unlock *driver*, but it persists to its own `protoQuests`
  localStorage key — **graduate it into a real save slice** so completed-quest ids
  can feed `isUnlocked` (and survive export/import + offline). Then express
  quest→skill-tree→recipe prereqs as data.
- **Tactics / equipment-slot / ability unfolding** — same pattern (`unlock` metadata
  + mode-aware predicate) when those should ramp in rather than start fully open.
- **New-game UX.** No in-game mode picker yet (only Time→Debug + `?mode=`); a real
  curated game wants a front-door “new game” flow and onboarding copy.

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

### Tactician shell — plumbing gaps (mock → real, audited 2026-07)

Screen-reachability audit (2026-07): **no** classic screen is unreachable from the
shell — Map = the stage, Heroes = the Hero lens, Guild/Reports/Time/Settings = the
☰ drawer, and Inventory = **Town → Stash** (gear · cards · mats · consumables ·
craft) + the per-hero Equipment lens. (So the "Crafting — not surfaced in the
shell" note above is now stale: `Town.tsx`'s Stash already has a `craft` sub-tab.
The *data* break — `drop-*`/`craft-*` aren't real item defs — still stands.) The
remaining work is wiring these display-only / mock seams to real, persisted state:

- **Card sockets — inert.** The shell's socket pips read `protoStore.sockets`
  (mock, display-only) and `getDerivedStats` **doesn't read sockets at all**, so
  cards currently change nothing. The real persisted slice (`itemSockets`,
  `socketsCodec`) exists, but the shell UI (`CardBits`/`EquipmentLens`) neither
  reads nor writes it. → point the socket UI at `itemSockets` and have derived
  stats apply socket bonuses. (See also *Items, cards & sockets*.)
- **Pack carry — half-real.** `unit.pack` (consumables) is real + persisted, but
  the carried "loot bag" weight in `PackStrip`/`economy.ts` comes from
  `protoStore.packs` (fake drops from `simulateHunt`, unpersisted), and the
  **overweight penalty is displayed but not applied** ("coming soon" in
  `PackStrip`/`ExpeditionPanel`). → feed real combat loot into carry and apply the
  penalty. (Overlaps *Loot realism* / *Consumables*.)
- **Quest board — commit/completion state is ephemeral.** `useQuestBoard`
  computes progress from REAL state (kills, items) and class-change paths do real
  work (write `unit.class`), but the commitment/bounty/completion bookkeeping
  (`protoStore.classQuestCommit`/`bountyDone`/`bountyClaimed`/`questCompletions`)
  is unpersisted — lost on reload, and bounty rewards aren't fully plumbed. This
  feeds the Decisions "Quest ready / New quest" rows and the journal. → move that
  state into a save codec. (See *Quest system*.)
- **Settings panel** (`ProtoApp` `GlobalOverlay`) — Audio / Notifications /
  Display / Save&sync / Accessibility are all "soon" placeholders; only Pause +
  "Classic UI" work. → build the real toggles or trim to what exists.
- **Nav cost from the 2026-07 top-row reclaim:** Town + Decisions moved off the
  always-on header into the ☰ drawer (one extra tap each); the ☰ badge keeps the
  urgent-decisions count glanceable. Re-surface either on the rail if the extra
  tap proves annoying in play.

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
  - *Open-world camera (`BattleView`) — controls reworked 2026-06.* **Three explicit
    modes** the top-left toggle cycles: **party** (auto-fit + centre on the group,
    default), **hero** (follow the roster-selected hero, fixed zoom), **free** (hold a
    look-point; drag to pan, pinch to zoom). Roster/minimap tap → hero; minimap
    ground tap or a drag → free. Fixed across this work: (a) **drag-pan is live** —
    the look-point follows the finger directly, clamped to the map so it can't
    over-drag, with the glide held at 0 (`panningRef` → `--seg-ms` 0) so the board
    tracks instantly. This replaced a freeze→pixel-offset→commit-on-release scheme
    that **stuck while held and snapped back on release** (the pixel nudge could
    over-drag past the edge, then the camera clamped on commit). (b) **auto-fit zoom
    no longer "breathes" while looking elsewhere** — auto-fit applies ONLY in party
    mode (`effSize`). (c) **grid no longer slides against the barriers during a zoom**
    — grid `backgroundSize` is `%` of the ground layer (scales WITH it) not `cqmin`.
    (d) **explicit follow-hero-vs-party toggle** — done (the 3-state cycle above).
    Still open:
    - *Live-pan re-render cost — ✅ rAF-coalesced.* The live pan re-renders the battle
      subtree per pointermove (glide is suppressed so paint is cheap, but React
      reconcile of 50+ tokens each move can lag the camera behind the finger when a
      120 Hz touch panel fires moves faster than frames). Now coalesced to ONE
      `setManualCenter` per animation frame (`Arena` `panRafRef`/`flushPan`; final
      position applied exactly on release). If a very crowded field still drags
      heavily, the next lever is a single compositor wrapper transform during the drag
      (the tokens wouldn't re-render at all) — tried once and backed out because the
      edge-clamp on commit was finicky (snap-back near the map edge); revisit with a
      camera snapshot captured at drag-start used for BOTH the move-clamp and commit.
    - *Zoom feel — choppy + slow.* Auto-fit changes `cam.size` per round (discrete
      steps) and eases each over `--seg-ms` (up to 900 ms), so a zoom reads as slow,
      stepped breathing. Options to paper over: a snappier fixed transition for
      `cam.size` changes (decouple zoom easing from the position `--seg-ms`), and/or
      rate-limit / smooth the per-round auto-fit target so it doesn't step every round.

## Procedural map generation (scaffold shipped 2026-07; guide: `src/mapgen/CLAUDE.md`)

The pipeline + MapSpec contract + validation harness + `field` recipe + `?mapgen=1`
lab landed. Idea inventory: `procedural-generation-ideas.md`. Deferred phases (each
independently shippable; ordering rationale in the guide's roadmap):

- **✅ Phase 2 — render consumption + first live location (shipped 2026-07).**
  `terrain.tsx` consumes the spec: surface plane → organic washes (`maskLoops`
  boundary tracing in `authoring.ts`; shallow-under-deep water + shoreline),
  scatter plane → biome prop archetypes (`KIND_ARCHETYPE`), material-aware
  collision paint (deep-water rects vanish under the lake, hedges go foliage).
  **`mirror-vale`** (96×96 `field`, south of Kanto Beach) is the first live
  generated location; `generateForLocation` pins live maps to the benched
  pathing envelope (16 at ship; 40 since the 2026-07 pather perf pass) and
  `map-perf-envelope.test.ts` gates every `mapGen` location (valid bake +
  barrier bound). Deferred polish: landmark POI → big silhouette prop,
  spec-aware minimap tint, ford/ripple accents, `skin-ab` run on a spec'd
  perf scene (the ?perf scene has no spec, so the benchmark is unaffected today).
- **✅ Phase 3 — dungeon recipe, graph-first (shipped 2026-07).** `layout`
  publishes a cyclic room graph on the nav skeleton (spanning tree + loop
  edges; `doorAt` per corridor), `carve` realizes it as ~20–35 wall rects with
  door-gap chokepoints, `stamps.ts` places authored vaults by constraint
  (pillar-vault / shrine / barred-cell — whose treasure is `optional`-tagged:
  reachability-exempt, the standing §J pocket and phase-4 lock test case),
  debris grades with depth, lair at max graph depth. Refined donjon-style
  (2026-07, after review of donjon.bin.sh's vocabulary): free-placed
  **polymorph rooms** (closet→hall weighted size table, L/T composite lobes,
  cave-notch erosion off the roughness field), **errant door-to-door
  corridors** (0–2 jittered jogs, width 2–3) + kept dead-end stubs, and a
  greedy **maximal-rect cover** of the solid mask (free-form floor, exact
  coverage, ~30–60 rects, budget 72). Deferred: 1-wide labyrinth corridors,
  symmetric layouts, an erosion-first cavern recipe, a remove-deadends knob,
  corridor pathfinding AROUND rooms (today a corridor may clip a room it
  passes — reads as an extra entrance), multi-floor chains via
  `dungeonEntryRegion`, a LIVE dungeon location (blocked on the pather perf
  pass — rect count is ~4× the open-world envelope; fine for discrete
  encounters).
- **🟡 Phase 4 — lock-and-key + proficiency gates (FOUNDATION shipped 2026-07;
  feel needs human iteration).** Shipped: enriched `Lock` model (open/gates),
  `GenParams.proficiencies`, conditional reachability + the `locks` rule
  (closed-seals / open-delivers / gate-approachable / critical-path-never-gated),
  the dungeon `gates` pass (tag-themed seals: rubble/rune-door/hidden-door/chasm,
  variant resolved ONCE at battle stand-up), `getProficiencyTags` +
  `partyProficiencyTags` (class-based; extension points for skills/equipment
  documented in `src/lib/proficiencies.ts`), lab party-kit toggles, store seam
  wired (dormant — no live location has gates). **Open for iteration (the
  handoff list lives in `src/mapgen/CLAUDE.md` → phase 4):** gate frequency &
  placement feel, store-side rewards (familiarity/xp/loot multipliers off the
  `prize` POI tags), surfacing in Reports/event log ("Shae's perception found a
  hidden door"), party-change re-resolve semantics, field-recipe gates,
  'key'/'switch' lock kinds (phase 6). **Biggest unbuilt piece — puzzle-SOLVING
  as a play flow:** today's gates are a static have-the-tag check; the intended
  system is discovery (clues noticed as a function of INT/knowledge + time),
  key logistics (items found on-map unlocking other locks — real sequencing
  chains), and planning AI (§E objective-channel: the autobattler routes the
  party through fetch-key-then-open-door). The variant-at-deploy model is the
  floor this grows under — the Lock vocabulary and validator guarantees are
  designed to survive play-time resolution when it lands.
- **🟡 Phase 5 — city recipe + naming (SHIPPED 2026-07); inter-map coherence
  open.** `city` recipe (road-first: plaza + jittered gate roads +
  cross-street loops → paving → street-fronting buildings via a road-distance
  transform → yard/market scatter → plaza landmark; fuzz gate
  `recipe-city.test.ts`) and the shared §M **premise pass** (`naming.ts`:
  theme-conditioned place name + one-line premise on every recipe's bake,
  reading what the map actually grew — ford/sealed door/lair depth/road
  count; gate `naming.test.ts`). Premise surfaces in the `?mapgen=1` lab and
  both location-detail panels (proto Lore section + classic Map). **First live
  city landed 2026-07: `prontera-city`** (50×50, `mapGen: {recipe:'city'}`) —
  `src/render/buildings.ts` renders the cut-stone/wood wall rects as
  paper-cutout buildings and `terrain.tsx` paints the road/plaza/dirt surface
  washes (see Graphics → *City tile catalog*). Still open: **inter-map
  adjacency/depth gradients** (§G) as first-class; **NPC/merchant placement
  reading the semantic plane** (today they're hand-placed on the plaza in
  `npcs.ts`, not read from the spec's `landmark`/`nav` nodes); premise →
  Reports/offline-summary wiring (§M2 "aim narrative at surfaces we own").
- **Phase 6 — interactables / dynamic barriers.** The one invariant-breaker
  (BSNAP byte-identical replay must survive it); gated behind everything above.
- **Cross-cutting debts:** ✅ *pather perf pass (2026-07)* — `steerAround` now
  caches its visibility graph per barrier set (corner nodes + ordered pairwise
  clearance/distances, WeakMap on the barrier array; byte-identical, pinned by
  `steer-cache.test.ts` differential fuzz). Worst-tick at 72 rects fell
  ~7.5× (572→76ms on the throttled harness; `cadence-profile.spec.ts`
  "barriers" sweep, `?perf&barriers=N`). Live envelope raised 16→40
  (adapter pin + `map-perf-envelope.test.ts`) — big water maps and denser
  cities are unblocked; the dungeon's 72-rect budget still wants either a
  further pass or a trimmed live variant. NOTE: the raise re-baked
  `mirror-vale` (its outcrops were budget-starved at 16). Remaining: tactical
  profile heuristics are v0 (chokepoint/lane counts unvalidated against play);
  map features need consuming AI (hold-chokepoint / use-cover tactics — see AI
  & coordination) and should ship as pairs; `?mapgen=1` lab could grow an
  export-to-Location snippet button (curated-map authoring loop) and a bulk
  CLI sweep (`npm run mapgen-sweep`) if the vitest fuzz gate gets slow.

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
  - *✅ Reward rate is now realized, not saturated.* The cold/sampled prime used to
    refill the field to cap **every round** (`runCombatSlice`→`restockField`), so a
    party that out-clears the open-world spawn trickle measured a kill rate ~**13×**
    the realized one (and the sampled path re-paid that initial clear every window,
    ~2×). The slice now trickles monsters in on the live spawn cadence
    (`trickleField`) and the sampled path no longer re-stocks to cap between windows
    — so projected kills/exp/loot track realized play (measured ~1.15× cold,
    ~1.03× sampled; guarded by `offline-reward-rate.test.ts`). The synthetic
    **damage** breakdown also no longer feeds the rolling rate-history; the catch-up
    live-sims the final minute instead (`App.tsx` `REALIZED_TAIL_TICKS`).
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

**Quest rewards (inline)** — *DONE*. Quest rows stay **inline expand/collapse** in
the location board (a top-half detail overlay was tried and reverted — the
expandable sections read better). Quests carry structured `rewards:
QuestReward[]` (gold + gear) granted on completion (`grantEquipment` mints owned
instances; gold via `grantMiscItem`); in the expanded row, reward chips are
**inspectable** — tapping gear opens the `ItemCodex` (stats/requirements/sockets).
The journal's "Go ›" still focuses the map on the quest's location, where its row
lives. Item-reward *equipment* currently mints fresh instances — fine for the
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

## Consumables — pack & use rules (iteration 1 shipped)

The carried-consumable loop is in (the health-potion slice): a per-hero **pack**
(`Unit.pack: PackItem[]`, separate from the `miscItems` stash), player-allowed
**use rules** (`Unit.consumableRules` — "use `<item>` when HP < X%"), and the
engine wiring (`src/engine/consumables.ts` `makeConsumableTactic` → an
action-channel tactic; `Combatant.pack`/`consumableSpecs` decremented in-engine,
mirrored back in the tick via `packByUnit`; snapshot round-trips them). Pack
reconciles to its carry targets from the stash automatically while a hero is in a
`'city'` location (`reconcilePackInTown` — withdraws the shortfall or deposits the
surplus so the carried count matches the target). UI: a **Pack** section in Units →
Gear (`PackSection`) and a **Consumables** section in the proto Equipment lens.
`CONSUMABLE_REGISTRY` (`src/data/consumables.ts`) holds graded healing potions.
Configure carry targets + thresholds, deploy to town to stock, deploy to a hunt
to use.

**Logistics ⇄ consumables bridge (shipped).** The proto logistics loadout
(`expeditionStore`) is now the *target* that drives `Unit.pack` carry targets
(`syncTargets` → `setCarryTarget`/`clearCarryTarget`); carried consumables count
against carry weight (`economy.heroCarried`/`heroRoom`/`heroFull`); the Equipment
action-bar picker sources from carried ∪ stash; the guild Stash has a Consumables
view + where/equipped filters; and the return loop instant-deploys a returning
hero to a town for `TOWN_RESUPPLY_TICKS` (~30s) — depositing loot + restocking —
then redeploys to the hunt anchor (`expeditionDriver` phase R, gated on
`deployMode === 'instant'`). Deferred next slices:

- **Open-world routing for returns.** The resupply trip teleports for now; the
  `deployMode` lever's `'open-world'` branch still just runs heroes to the map
  edge (no town arrival). Replace with real land routing + travel time, and
  interpolate the trip instead of instant-deploy.
- **Loadout persistence.** `expeditionStore` is unpersisted; on reload `ensure`
  rehydrates each hero's loadout from the surviving `Unit.pack` targets
  (`loadoutFromPack`), so a hero who *deliberately* cleared all potions gets the
  default re-seeded (can't distinguish "empty" from "never configured"). Persist
  the loadout (its own slice) to fix this and the share-flag/return-rule churn.
- **Merchant purchase + cost.** A loadout supply's `merchant` source flag only
  feeds a cost display (`loadoutCost`); reconcile is stash-only, and the gold is
  never charged. Wire **merchant purchase** for the shortfall (`MERCHANT_REGISTRY`;
  needs a real store-side buy action — currently proto-only) and actually debit
  gold, or hide the affordance until then.
- **Action-bar equip quantity.** Putting a consumable on the action-bar `+`
  auto-adds it to the loadout at the default supply qty (10), silently committing
  the hero to carry+withdraw that many. Let the player pick the carry count at
  equip time (or seed from a smarter default). (Offline `batchTick` doesn't run
  town auto-fill or consume potions — it resumes on the live tick; revisit if it
  matters.)
- **More effects.** Only `heal-max` exists; the apply branch in `takeTurn`
  hardcodes heal-to-max. Generalize via the `ConsumableEffect` union (fixed-heal,
  cure-status, buff) — the effect descriptor already crosses the engine boundary
  on `ConsumableSpec`.
- **Loot policy (blocklist / priority).** Hero- or guild-wide rules to ignore/drop
  some drops and prioritize others by name / rarity / item-level (item-level not
  modelled yet). Sits beside the pack as a shared policy object.
- **Saved loadout templates.** Save a hero's pack + use rules (+ future restock
  targets) as a named template; apply/tweak on any other hero to cut per-hero
  monotony. New small persisted registry + apply action.

## Loot realism — pack fills on kills, not a wall-clock timer (SHIPPED 2026-07, Fork A)

**Was:** the proto expedition loot pack (`proto.packs[unitId]`, shown as each
hero's carry weight/% and the `pack-full` → return trigger) was filled by a
wall-clock MOCK (`expeditionDriver` phase 2c: `progress += lootItemsPerSec × dt`
→ `oneDrop`/`simulateHunt`), decoupled from kills — so pack weight climbed
(and could send a hero home) **before any monster died** and trickled out of
sync with deaths, while the *real* kill drops rolled invisibly into the guild
stash. Two disconnected loot systems; the visible one was fake (reported on
Kanto Beach).

**Now (Fork A — the pack is the real loot buffer):**
  - `rewardKills` (`useGameStore`) credits each kill's real rolled drops to the
    **killer** as a per-hero `foundLootByUnit` delta (batched with the kill),
    instead of writing them to the shared stash. Uncredited (minion) kills and
    the offline `batchTick` path still mail drops to the stash; `creditOffscreen`
    round-robins its extrapolated drops onto the party's packs so unwatched
    hunts keep loading up too. Gold stays a stash currency.
  - The tick accumulates that into `pendingPackLoot` (RUNTIME tier, unpersisted).
    The expedition driver drains it each tick (`takePendingPackLoot`) into
    `proto.packs`, capacity-gated, honoring share/accept/`lootCats` — the old
    `lootItemsPerSec`/`oneDrop` mock is deleted.
  - **Self-healing:** if no driver is mounted (classic UI / perf harness), the
    tick flushes last tick's undrained `pendingPackLoot` to the stash so loot
    is never stranded. (With the driver present it's always drained first → no-op.)
  - Pinned by `loot-to-pack.test.ts` (kill-gated: no loot before a kill;
    credited per hero; drops === `itemsFound`, none lost/doubled; `takePending…`
    atomic) and verified live on the beach (kills=0 → pack=0; pack tracks kills;
    zero stash leakage). `resetStore` now also clears the per-run stat
    accumulators so tests don't leak loot/kills between cases.
  - *Open follow-ups:* pack overflow beyond `WEIGHT_LIMIT` is dropped (real carry
    pressure, but silent) — surface it; and off-screen per-hero attribution is
    round-robin, not true kill credit.

- **Ground-drop loot pickup (requested — future, builds on fork A).** When a
  monster dies, spill its rolled drops onto the battlefield as pickup tokens the
  hero walks over to collect into their pack (a small collect radius / auto-path
  to nearby loot). Turns loot from an instant ledger bump into a spatial act,
  and makes carry weight / pack-full a real in-field pressure. Needs: a
  `groundLoot` layer on the open battle (position + itemId + qty, store-owned
  like spawn RNG — NOT in the engine, to keep replays clean), a pickup step in
  the tick (hero within radius → move qty into pack), a render layer (drop
  tokens + a pickup pop), and a decay/vacuum rule so uncollected loot doesn't
  pile up. Depends on the pack being the real loot buffer (fork A).

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
  interval. (`BattleView.tsx`.) **2026-07 fix: the ceiling is now cadence-aware.**
  The fixed 900ms ceil predated the Phase-1.2 slow tiers: a cap-200+ field
  legitimately rounds every ~1.2s (timeScale 1 × everyTicks 6), so its glide was
  clamped 300ms short of the gap and every token parked between rounds — the
  "step, step, step" walk on big maps (Kanto Beach) while small fields glided.
  Ceil = max(900, expected gap × runway), where expected = `everyTicksFor(timeScale)`
  × tick ms — so a real stall still caps, but a slow TIER isn't mistaken for one;
  the EMA also seeds at the expected gap so round one glides. Verified live:
  beach-1 seg ≈1909ms (gap 1200ms — always mid-glide when retargeted),
  harpy-roost unchanged ≈341ms.
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
- **✅ Cadence tiers re-validated + barrier fast path (2026-07,
  `e2e/cadence-profile.spec.ts`).** Asked "are the slow tiers still necessary,
  or can big/dense fields run full-granularity every tick?" — profiled the
  ?perf scene shaped like Kanto Beach (cap 220, 200×200) and a dense 60×60
  packing, mobile-chrome 4×, sweeping `?hts/?hevery/?decide`.
  - *First finding: the engine was 81% barrier checks.* `traceMove`/`lineClear`
    sampled every 0.2 cells × every barrier; on a 200-wide map one wander line
    is 500+ samples, so sim cost scaled with map size × entities. Fixed with
    exact per-barrier **slab-window clipping** (`sampleWindow`, barriers.ts):
    same predicate at the same sample positions, only provably-outside samples
    skipped — byte-identical by construction, pinned by a 4000-case
    differential fuzz against the old scan verbatim
    (`barriers-fastpath.test.ts`). Cap-220 worst tick 430ms → 44ms (~10×);
    beach *shipped* fps 26.6 → 36 — the per-round hitch on big maps is gone.
  - *Answer: tiers still needed, but the DEEP ones retired.* Reading note
    first: fps across separate harness runs is NOT comparable — container CPU
    drift produced 8-vs-29-fps readings for the identical config an hour
    apart; only within-run A/B gaps are trustworthy. A same-conditions ladder
    (Pixel-5 4×, cap-220 spread field): old coarse ts1/e6 ≈ 52 fps ·
    ts3/e2 ≈ 39-41 · full-rip ts6/e1 ≈ 29 median with dips to 17; dense
    60×60 packing still collapses at any fine tier (≈ 5) — VISIBLE DENSITY,
    not cap, is the render driver (spread cap-220 shows only ~13 tokens).
    `decide=1` re-confirmed the decision throttle (tick 15 → 68ms without).
  - *Retier (2026-07):* the ts1/ts2 tiers are gone — their ~1.2s coarse
    rounds caused the Kanto Beach incoherence reports (render lags the engine
    by ~0.7 round-step ≈ 840ms: melee FX "from afar", arcs not point-to-point,
    loot while apparently walking, seconds-dead drop-in). Two regression
    tests now pin the coherence contract so it can't silently drift again:
    `Cadence.test.ts` (render/cadence.ts budgets: glide must outlast the round
    gap — no parking; render lag ≤ 500ms; round gap ≤ 600ms — checked for
    every real map's tier) and `map-perf-envelope.test.ts` (every open-world
    map's derived load params — cap / packing density / scenario barrier
    count — must stay inside what the SYNTHETIC benchmark has measured;
    replaces the old brittle "perf-test the densest real map" approach, which
    play-tuning kept re-sorting).
  - **FULL-GRANULARITY EXPERIMENT (2026-07, live):** `openWorldTimeScale` now
    returns 6 for EVERY cap — even Kanto Beach runs fine rounds every tick.
    Perfect coherence, measured ~29 fps median with dip windows to ~17 on the
    Pixel-5 4× harness (vs ~39-41 at ts3, ~52 at the old coarse tier). We're
    trying the dips in exchange for the feel; REVERT = uncomment the one tier
    line in `openWorldTimeScale` (the pairing, glide ceiling, and tests all
    keep working at any tier). Dip probe (trace + slow-stretch JS profile):
    the dips are HEAVY TICKS — sim round + React commit flushing in one
    80-130ms timer task — not raster/layout (post-slab traces show no Layout
    dominance). Attribution inside slow stretches: ~45% browser-internal
    `(program)`, ~7.5% dev-build React overhead (jsxDEV/validateProperty —
    absent in prod, so the harness UNDERSTATES prod fps), ~14% spread engine
    tail (sampleWindow / distance / spatialhash.near / zoneMembers — no
    single villain), ~5% GC (allocation pressure). Next levers, in order:
    (1) value-mirror token memo to shrink the per-round commit (Performance
    § below), (2) engine micro-tail (zoneMembers scans all combatants per
    zone; alloc churn in hot loops → GC), (3) profile a PROD build — the
    dev-only overhead is measurement noise we're currently eating.
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

### ✅ "Many entities" is RENDER-bound, not engine-bound — composited transforms (2026-06)

A focused pass on the *many-entities* case (15 casters + 30–40 monsters = 40–57
combatants), distinct from the fast-slow work above. **Finding: at 50+ entities
the engine is cheap and the renderer is the bottleneck.** New harness
(`e2e/many-entities.spec.ts` + `?heroes`/`?cap` on `perfSeed`) separates the two
costs by pausing the store loop and timing raw `tick()` vs sampling rAF fps:

- *Engine* (4× CPU, 57 combatants): mean **~6 ms/tick**, worst single tick (the one
  running `advanceRound`) **~26 ms** — comfortably inside the 200 ms tick budget. So
  the **Web Worker (Phase 4) is NOT the lever for this case**; it only matters for
  far higher entity counts or to harden cadence under *engine* stalls.
- *Render* was the cost: fps fell 43→**22** as on-screen tokens grew 8→57, with
  uniformly low fps *between* rounds (not just at round boundaries) — the tell that
  it's per-frame work, not React reconcile. Confirmed by probe: killing all CSS
  transitions ~doubled fps.

**Root cause: every per-round glide animated layout-/paint-triggering properties.**
Tokens, ground hazards, terrain, the team-split, edge markers and the minimap box
all eased `left`/`top`/`width`/`height`, and the grid eased `background-position` —
each forces a full **layout** (or full-arena **repaint**) every animation frame, ×
dozens of elements. **Fix: drive every per-round glide with `transform: translate`
(compositor-only) instead.** `cqw`/`cqh` units resolve against the square
size-container arena, so a world point maps to `translate(<pct>cqw, <pct>cqh)`
(+ `calc(… - 50%)` for centred elements). The grid became a single **full-map**
layer (`mapCols/mapRows` on `Arena`) translated with the camera, so its pattern is
fixed and never repaints. Elements whose own keyframes animate `transform`
(`BattleChip` spawn-pop, `Float` lob/fade) got an **outer position layer + inner
keyframe layer** so the two transforms don't clash. (`BattleView.tsx`:
`fxPct`/`fyPct`, `XFORM_TRANSITION`; the old `CAM_TRANSITION` is gone.)

**Result (4× CPU mobile, 57 combatants): 22 → 46 fps (~2×)** — at the
"transitions-off" ceiling, so the per-frame layout cost is essentially eliminated.
Compositor motion also keeps overlays glued to their token **under main-thread
jank** (a busy main thread stalls a left/top transition mid-glide → a label/zone
visibly desyncs from its token — the reported "spell name drifts / AoE snaps to the
right spot a beat later"). Still open if it shows on-device:

- *Residual mount-snap.* A freshly-mounted overlay appears at its final position
  instantly while already-mounted tokens glide in over `--seg-ms` (up to 900 ms under
  load) → a one-segment misalignment. **✅ Fixed for cast labels** — the lingering
  "✦ &lt;skill&gt;" labels now render as a **child of the caster's `BattleChip`**
  (above the circle), so they inherit the chip's compositor glide exactly (zero drift)
  and cost no separate positioned/transitioned element or per-token `byId`/`isOnScreen`
  scan (`castLabelsBySource` map → `BattleChip castLabels` prop). Still snap-on-mount,
  but harmless because they're not unit-anchored: world-anchored **floats** (fixed
  world point) and the one-shot **AoE/hit/spawn/rally rings** (no position
  transition, ~1 round life). Fold those in only if they read wrong.
- *✅ Ground effects now live in the GROUND LAYER (planted, zero drift).* The AoE
  **zone** circle (and **firewalls**) visibly slid to its spot a round after being
  cast under load. Root cause (measured: a fresh zone drifted ~8 px relative to the
  grid, scaling up under bigger camera moves): each ground element computed its OWN
  screen `transform` from the camera and eased it, but the grid is a full-map layer
  that eases `translate` **+ `width` scale** — two different easing structures, so a
  lone zone desynced from the grid during any camera change, and a fresh zone snapped
  to the camera basis while the grid was mid-ease. (An earlier attempt — moving the
  `-50%` out of the eased transform via an outer/inner split — *reduced* it but
  didn't eliminate it, because the structures still differed.) **Real fix: render
  terrain barriers + zones + firewalls as CHILDREN of the one ground layer, in
  map-fraction coords** (`Arena groundOverlay`, `gx/gy` in `LiveBattle`). They now
  inherit the grid's exact transform/scale, so they're planted on the terrain by
  construction — a fresh element rides the layer's in-progress ease instead of
  snapping. Probe (fresh-zone centre as a fraction of the grid rect, pan/zoom
  invariant): **8 px → 0.0 px drift**, no fps change. *Rule:* anything that must stay
  glued to the terrain belongs IN the ground layer, not positioned independently from
  the camera. (Tokens stay independent — they move per-round anyway, so their own
  ease reads fine; only under a manual *zoom* do they transiently differ from the
  ground, which is unnoticeable.)
- *Round-boundary reconcile.* The remaining long-tasks (~260–440 ms / 4 s) are the
  per-round React re-render of 50+ tokens. The next ceiling if more headroom is
  needed (fewer per-token nodes / a value-mirror memo — see the `React.memo` note
  below for why a naive wrap doesn't work).

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

### ✅ On-device perf probe — what it found, and where it lives (2026-06)

The Playwright harnesses (`many-entities`/`jerk`) only measure a **4× CPU-throttled
desktop** — they can't say what a *real phone* spends time on in a crowded battle.
PR #54 (**throwaway**, branch `claude/battlefield-perf-profiling-f5xg6s`, never
merged to `main`) added an **in-app probe you run on the actual device** to settle
the long-running question directly: is the lag the engine's **decision-making AI**,
the per-round **React render**, or raw **frame/paint** cost?

- **How it measured.** An ambient engine profiler (`src/engine/profile.ts`, same
  pattern as `timescale.ts`/`arena.ts` — **default-off + determinism-neutral**, so
  snapshot replays stay byte-identical) timed each phase inside `advanceRound`:
  `plan` (team-coordination AI) and, per `takeTurn`, `decide` (targeting/tactics =
  the per-unit "AI"), `move` (pathing/steering), `act` (skills/attacks), plus
  `zoneApply`/`outcome`. A React `<Profiler>` around the battle subtree gave commit
  ms/rate; a rAF+long-task sampler gave the real on-device frame signal; the report
  also captured scene + device (entity/token/DOM counts, UA, cores, DPR, memory).
  Run via `?perf=1&probe=1&heroes=N&cap=M` → ⏱ panel → Start / play ~20s / Stop /
  ⎘ Copy → paste into a gist. (Files: `engine/profile.ts`, phase marks in
  `engine.ts`, `dev/perfProbe.ts` collector on `window.__perf`, `dev/PerfPanel.tsx`,
  a `<Profiler>` mount in `BattleView.tsx`, `?probe` plumbing in `App.tsx`,
  `e2e/probe-smoke.spec.ts`.)
- **The finding (real throttled Android, 15 heroes / 34 enemies).** Engine **~13
  ms/round = ~1 % of wall clock**; React render **~7 ms/commit**; but worst frame
  **~100 ms** with several **~60 ms long-tasks** per window. So the felt lag is
  **round-boundary reconcile/paint long-tasks, NOT the AI** — `decide`/`plan` are a
  tiny slice. This **confirms the "many-entities is render-bound" finding on real
  hardware**, and means the Web Worker (Phase 4) is *not* the lever at these counts
  (the engine already fits the budget with room to spare); fewer per-token nodes /
  a value-mirror memo is the render ceiling if more headroom is ever needed.
- **What shipped from it.** The probe was the evidence base for **PR #55** (merged
  to `main`): since pace, not compute, was the felt problem, advance the sim **every
  tick** at a finer `ROUND_TIME_SCALE=6` (~0.83 logical rounds/s, ~1.67× faster +
  smoother), with a **density-adaptive step cadence** (`openWorldEveryTicks`) that
  backs off only for a genuinely huge crowd. The probe branch itself stays unmerged.
- **If revived:** the ambient-profiler pattern is the reusable part — re-cut
  `profile.ts` + the phase marks off `main` (they're determinism-neutral) and
  re-add the `?probe` panel; don't merge the throwaway branch wholesale (it predates
  the #55 pacing changes).

## Graphics / visual evolution (art direction + restyle roadmap)

**Direction chosen 2026-07: Unexplored-style flat-vector "paper cutout", NOT a
pixel tileset.** (A free pixel tileset was tried before and read as janky/
unprofessional.) The reference look: flat two-tone shapes with a weapon glyph and
facing baked into the token, muted tiled floors, soft offset shadows, vignette
lighting — something between 3D and a tileset. Crucially this look is
**procedural** (drawn from code as SVG/CSS), so it needs no assets to license,
stays crisp at any zoom, and every "sprite" question below about atlases becomes
optional rather than blocking.

**Foundation shipped 2026-07** (see CLAUDE.md → Combat view → *Skinning seam*):
`src/render/appearance.ts` (entity → visual resolver) + `src/render/skins.tsx`
(token bodies behind the `TokenBodyProps` contract + per-skin arena ground),
runtime-switched by store `battleSkin` (Time→Debug / `?skin=paper`). The first
art-directed skin, **`paper`**, ships there: two-tone cutout body, facing blade,
offset-shape shadow (no CSS filters), one-data-URI parquet ground. Restyle
iteration = editing shapes/palettes in that one file, A/B-able live against
`circle` on the same battle.

### Asset discoverability + gallery + procgen wiring (foundation shipped 2026-07)

*Shipped (the plumbing):* every prop self-declares its mapgen `kinds` +
`playerSelectable`/`tags` (`PROP_META` in `render/props.ts`), scatter placement
spreads a kind across ALL tagged props (so no authored prop goes dark on a
generated map — `AssetCatalog.test.ts` guards it), and `render/assets.ts`
`listAssets()` is the single discoverable catalog of every prop/body/weapon/
building/ground as `AssetDescriptor`. This is the seam the items below hang off.

*Next slices (build on the catalog, not new registries):*
- **Dev asset gallery (`?gallery=1` extension or a new `?assets=1` page):** render
  every `listAssets()` entry as a swatch, grouped by category, with search/filter
  (by biome, kind, `playerSelectable`). **Multi-select + "copy names"**: click to
  toggle selection, a Copy button writes the selected `assetKey()`s (`category:id`,
  one per line) to the clipboard for bulk feedback. Pure read of the catalog +
  the existing `propMarkup`/`Body` renderers.
- **Procgen option wiring:** expose per-recipe knobs (scatter density, which
  `ScatterKind`s a recipe emits + weights, biome) as MapSpec params surfaced in
  `?mapgen=1`, so a designer tunes what a map grows without editing recipe code.
  The city recipe emitting `reed` (currently never) would light up the reed-tagged
  props (`coil`/`crack`/`reeds`).
- **Player-selectable assets:** `playerSelectable` is wired through the catalog but
  no asset is flagged `true` yet — designate which (guild banner crest? town
  building style?) and build the picker that reads `playerSelectableAssets()`.
- **More building looks:** the timber-house + half-timbered "Ragnarok townhouse"
  palette families (`PAPER_PALETTE`, ~13 roles) are authored but unwired — add
  `BUILDING_LOOKS` entries so Prontera has >3 building types (they'll appear in the
  catalog automatically).

### Asset placement tags — phased scatter richness (Phase 1 shipped 2026-07)

The uniform, blanket-rotated scatter pick (a rare canopy as likely as filler
grass; every prop rotated a flat ±12°) is being replaced by a declarative
**placement-tag schema** on every prop (`PropMeta`/`PropDef` in
`render/props.ts`: `weight`/`themes`/`role`/`near`/`avoid`/`rotate`/
`clusterWith`), tagged for the LATER phases but consumed incrementally.

- **Phase 1 (SHIPPED):** the schema + a **weighted, theme-filtered,
  rotation-aware** render pick (`terrain.tsx` spec + legacy branches, helpers
  `matchesThemes`/`weightedPick`/`rotForPolicy` in `props.ts`) + `?workshop=1`
  catalog surfacing (tags shown read-only, emitted in "copy TS snippet"). Every
  scatterable prop must declare `role` + `themes` (`AssetCatalog.test.ts` gate).
  Mapgen unchanged beyond `regionTags` already echoing `params.themes`.
- **Phase 2:** density field + blue-noise placement + `role: 'cluster'` clumps
  (groves/flowerbeds via `clusterWith`) — a real mapgen scatter pass over the
  shared substrate, replacing today's independent per-item rolls.
- **Phase 3:** edge / understory features — the "Ribbon" assets (verge grass,
  shoreline reeds, wall moss/cobweb) placed along boundaries via `role: 'edge'`/
  `'understory'` + `near`/`avoid` affinities.
- **Phase 4:** field trails / desire-paths (nav `desire-path` edges → walkable
  ribbons, props avoiding them).
- **Phase 5:** per-material surface texture (finer surface-plane paint feeding
  distinct washes/patterns per `SurfaceMaterial`).

**Guiding principle:** every phase-2+ clustering behavior must EXPOSE tunable
dials and land as an ISOLATABLE layer/pass reviewable in `?mapgen=1` — the
per-pass RNG streams + per-pass skips already support toggling one behavior at a
time, so density, clumping, edges, and paths can each be reviewed/tweaked
independently without reshuffling the rest of the map.

*Perf lesson from landing it* (measured on the `?perf` scene, mobile-chrome 4×
throttle, via the new `skin-compare.spec.ts` A/B (`npm run skin-ab`) +
`skin-trace.spec.ts` CDP attribution): a richer body's cost is NOT the SVG
raster or the ground pattern — it's **React reconcile + style/layout of the
token subtrees**, multiplied by prop churn that defeats the body memo. Naive
paper ran 27 vs 38 fps; three fixes brought it to parity (~34 vs 35): `memo`'d
bodies with primitives-only props, **quantized** `chipDims` (camera auto-fit
"breathes" `cam.size` every round — eighth-cqmin steps keep the clamp strings
stable) and **quantized facing** (15° steps), and the hp-bearing `title` moved
off the body onto the chip wrapper. Any future skin/effect work should keep
per-token element count lean and props quantized — that's the contract
documented in `skins.tsx`, and it's PINNED by a regression test
(`BODY_RENDER_PROBE` in `skins.tsx` + Skins.test.tsx: "an unchanged battle
re-render reconciles zero token bodies") so breaking it fails vitest instead of
resurfacing as a mystery fps drop.

- **Deterministic perf scene — SHIPPED 2026-07.** `?perf` now replays 1:1:
  `perfSeed.ts` seeds the store's `Math.random` (mulberry32, `?seed=<n>`) before
  the first scatter, and App.tsx's wall-clock catch-up is replaced in perf mode
  by a fixed-cadence stepper (exactly one tick per interval callback, no
  elapsed-time batching) — verified byte-identical combatant digests at round
  100 across independent page loads. One `skin-ab` run is now a trustworthy
  verdict; the residual window-to-window fps spread is OS scheduling noise, not
  scene content. Two reading notes: (1) absolute fps is NOT comparable to
  pre-determinism numbers — the old wall-clock catch-up batched late rounds
  into fewer renders (hiding render cost under load), while the fixed-cadence
  stepper renders every round, the honest worst-case; read A/B gaps, not
  absolutes. (2) On a shared-CPU container (CI/cloud) the host itself adds
  ±20-30% window spread even with frozen content — layer-bisects there
  (hide vignette/ground/token svgs) showed paper≈circle within noise.

Next slices, roughly in order:

- **Paper-skin polish — variants SHIPPED 2026-07.** `Appearance` now carries the
  designed extension points: `bodyShape` ('humanoid'/'blob'/'beast'/'flyer',
  monster id → family map in `appearance.ts`, unlisted ids default 'beast') and
  `weapon` ('sword'/'bow'/'staff'/'dagger' keyed off class; Mage+Cleric share
  the staff). `PaperBody` draws them as shared flat paths (one silhouette path
  per family drawn twice for the two-tone; 1–2 primitives per weapon; creatures
  get a claw wedge instead of a sword) — the skin switches only on those fields,
  never ids. KO "crumpled" state SHIPPED 2026-07: the same silhouette squashed
  onto the ground line and tipped over (same two paths, flattened shadow, no
  glyph, no grayscale filter) — a paper heap instead of the generic ✕ + fade.
- **Ground biomes — SHIPPED 2026-07.** `biomeForLocation` (appearance.ts) maps
  location TRAITS → 'grass' / 'stone' / 'plaza' (city → plaza; dungeon/
  underground/cave/mountain/ruins/arena/cliff → stone; else grass); the paper
  `ARENA_SKINS` entry carries one data-URI tile per biome plus `barrierWall`/
  `barrierCliff` restyles (flat two-tone cutout, zero-blur inset face) and a
  single static `vignette` overlay (one compositor layer, never repaints).
  Team-tint restyle to the paper palette is still open.
- **Effects pass — restyle SHIPPED 2026-07.** `FX_SKINS` (skins.tsx) styles the
  combat-feedback layer per skin (attack arcs / hit flash ring / zones /
  firewalls / portals); BattleView keeps the geometry+animation and reads the
  look from the seam. Paper: muted ink arcs, cream flash ring, dashed
  hand-drawn zone circles, solid flat fire/portal — no gradients, no glow
  shadows. Circle keeps its classic look verbatim. Lunge nudge SHIPPED
  2026-07: a `melee_attack` event nudges the attacker's token toward its
  target and back (one-shot `transform` keyframe on a permanent wrapper
  INSIDE the chip, direction via `--lunge-x/y`; two identical keyframe sets
  alternate on round parity so consecutive attacks restart via a class swap,
  never a remount of the memo'd body). Skin-agnostic (both skins get it);
  ranged/spell hits deliberately don't lunge. Perf lesson (skin-ab): a
  transform animation PROMOTES the element to its own compositor layer for
  the 0.3s and drops it again — that per-round layer churn across a whole
  zoomed-out mob cost paper ~-7 fps (SVG-heavy token textures re-upload on
  every promotion). Fix: the lunge is gated on the existing `tokenDetail`
  LOD — exactly the "animation gated by the existing LOD" rule from the
  phased plan below — so the watched party lunges, the crowd doesn't;
  measured back at circle/paper parity.
- **Organic terrain layer (the Unexplored ground read) — SHIPPED 2026-07.**
  All four sub-slices landed in `src/render/terrain.tsx` behind the
  `ArenaSkin.terrain` hook (Arena then SKIPS the rect barrier divs + classic
  perimeter ring): (1) wall/cliff blobs — wonky outlines with ~0.3-cell
  overhang around the unchanged collision rects, overlapping rects merged into
  one blob paint, lit depth face via a clipPath'd up-left copy; an organic
  evenodd rim replaces the perimeter ring; (2) floor mottling — large soft
  near-tile-shade patches; (3) per-biome scatter props (`TERRAIN_PROPS`:
  tufts/bushes/blooms · rubble/cracks/bones · crates/barrels/sacks), seeded
  placement avoiding barriers and portals; (4) the hero-anchored light — one
  radial-gradient div gliding with the party centroid, warmer in `peaceful`
  city fields (`ArenaSkin.heroLight`). Deterministic throughout (seeded
  `hash01`/`hashString(locationId)`, NO Math.random — pinned by
  `Terrain.test.tsx`). Two perf lessons, both measured on `skin-ab`:
  - *Static ≠ free if it's DOM inside the animated layer.* The first cut
    rendered ~230 live SVG elements into the ground layer and cost ~9 fps —
    they join every style/layout pass of the transformed subtree even though
    they never change. The shipped form bakes the whole picture into ONE
    data-URI SVG background image on a single div (exactly how the biome tiles
    ship): zero DOM, zero reconcile, zero layout — measured free, and arena
    node count actually DROPPED vs. the rect-barrier baseline (266 vs 301).
    Rule of thumb: static battlefield art ships as an IMAGE, not elements.
  - *Quantization steps are relative to element size.* The light's size in
    eighth-cqmin steps (chipDims' recipe, ~2% of a token) was ~0.1% of the
    ~107cqmin light — the auto-fit camera's breathing re-quantized it nearly
    every round, each step a restyle+repaint of a viewport-sized gradient
    (~5 fps). Coarse 8-cqmin steps (~7%, invisible in a soft gradient) fixed
    it. When quantizing to protect a memo/style string, size the step to the
    ELEMENT, not the formula.
  Still open: blood-splatter decals (a bounded ring buffer of ~64 tiny divs on
  damage events; a canvas layer only if they should accumulate indefinitely).

- **City tile catalog — SHIPPED 2026-07; UPSCALED to a hand-inked look
  (battlemap-kit port).** The town-asset layer for cities like Prontera, built
  material-first so procgen plugs straight in. `src/render/inked.ts` is a
  flat-fill port of an external top-down battlemap kit's technique — surfaces are
  MANY small individually-INKED, jittered pieces picked from value `INK_POOLS`
  (palette.ts), so texture reads from piece-to-piece value variation, NOT a
  gradient. The kit fakes light with gradient overlays + gaussian-blur shadows;
  we keep the hard rule (flat fills / palette roles, no gradients/filters —
  Palette.test) by using pool value-splits + flat offset shadows instead, and
  seed every piece (deterministic bake). `buildings.ts` (`BUILDING_LOOKS` keyed
  off `BarrierMaterial`: `wood` → red-tile townhouse, `cut-stone` → slate-tile
  hall, `rubble` → roofless ruin) draws each wall rect as a running-bond masonry
  wall RING around a weathered roof-TILE field split by a ridge (5% broken/moss
  tiles, plank door, dark windows, corner moss, bold silhouette ink).
  `terrain.tsx` dresses the plaza: the paved streets/plaza are drawn ENTIRELY as
  **inked cobblestones** (`cobble()`, a jittered 2×2 cluster per paved cell — no
  underlying pavement wash; the big single "swooping" road blob was dropped so
  the ragged stone edge is the street edge, the cell mask only a placement
  guide), plus an **inked fountain**
  (`fountainMarkup`: masonry ring of tangent blocks + layered water + ripples +
  plinth) at the `landmark` POI, ringed by **banners** + **lamps**, and city
  `tree` scatter → top-down **conifers**. All baked into the ONE terrain
  data-URI image (zero per-frame cost). `prontera-city` is the first live
  consumer (`recipe: 'city'`, 50×50; merchants on the plaza). Reviewable in
  `?gallery=1` → "city tile catalog". Same seam rule as everything else: switch
  on material/kind, never location ids — a future procedural city recipe
  inherits the look. **Cost caveat**: the inked city bakes a LARGE svg (~773KB /
  ~2900 paths for Prontera, ~1MB encoded data-URI) — heavy but a one-time
  decode/rasterize per location, memoized (`TERRAIN_BUILD_PROBE`), and only live
  on the one city; the piece density (course/tile sizes in `inked.ts`) is the
  dial if it needs trimming. Open polish: per-theme roof/wall palettes
  (desert/haunted), crenellated city-wall rim, grass-tuft/dirt inking on the
  yards, lamps/banners lining streets (needs the recipe to place them), and
  NPC/merchant placement reading the spec's semantic plane.

- **SVG asset pipeline & authoring tooling (groundwork for many fast
  iterations).** Findings from landing the paper variants, against the
  "could we reach Unexplored polish?" question:
  - *Hand-authorable?* Yes. Unexplored-level elements are 1–3 flat paths with
    4–10 anchors each — the 4 bodies + 5 weapons shipped are exactly this
    grade. Reaching reference density needs roughly 30–80 elements (~10 body
    families/variants, ~8 held items, 15–25 ground props per biome family, a
    few tiles + edge treatments) — a content problem, not a technical one.
  - *Repo fit?* Trivially. A path string is 100–300 bytes; a full prop
    0.5–1.5 KB of diffable source. Even 100+ elements ≈ tens of KB — a
    rounding error next to any bitmap atlas, with none of the licensing,
    resolution, or texture-memory questions.
  - *Where polish actually comes from:* NOT path complexity. It is (a) one
    shared palette, (b) one light direction (the two-tone offset), (c)
    deterministic hand-cut wonk, (d) good silhouettes. Tooling should enforce
    (a)–(c) mechanically so authoring effort (human or model) goes entirely
    into (d). The pipeline, in leverage order:
    1. **Skin gallery — SHIPPED 2026-07.** `?gallery=1` (dev-only,
       `src/dev/SkinGallery.tsx`) renders every body×tone, weapon, KO/cast/
       selected state, facing wheel, LOD sizes, ground tile, barrier and FX
       swatch for both skins on one page; `npm run gallery-shot` screenshots
       it. One image = whole-language review — this is the iteration loop for
       all skins work (and what a PR reviewer looks at).
    2. **Palette module — SHIPPED 2026-07.** `src/render/palette.ts` holds
       `PAPER_TONE` + ~20 named material roles; the last rogue hexes (weapon
       steel/wood, token shadow) migrated to roles. The contract is now a CI
       gate (`Palette.test.tsx`): roles-only + no filter/gradient, checked in
       the prop DATA, the emitted terrain svg, AND the rendered paper bodies.
    3. **Assets as data — SHIPPED 2026-07.** `src/render/props.ts`:
       `PropDef`/`PropPath` + the `TERRAIN_PROPS` registry (id → 1–3 paths of
       `{d, palette role, lit?}` in a ±1 unit box) + `cutout(d, base, lit)`
       emitting the standard two-tone pair. `propMarkup()` (terrain.tsx) is
       the ONE data→svg translation, shared by terrain and the workshop.
    4. **Style helpers — SHIPPED 2026-07.** `src/render/authoring.ts`: `wonk`,
       `blobPath`/`polyPath`, `roughCircle`, `rectOutline`, `scatter`,
       `hash01`/`hashString`. Authors write intent; the helpers apply the
       style rules — that is how 50 elements stay ONE style.
    5. **Import path — SHIPPED 2026-07.** `npm run import-svg -- file.svg`
       (`scripts/import-svg.mjs`): normalizes an Inkscape/Figma/traced SVG
       into PropDef data — flattens nested transforms (similarity transforms
       incl. arcs; skew/non-uniform over an arc errors with a fix hint), fits
       + quantizes into the unit box, snaps every color to the nearest palette
       role (printed report), REJECTS filters/gradients/masks/images/text.
       Drawing in a real editor (or commissioning pieces) now needs zero
       runtime changes. Loads the palette from TS source via the bsnap
       ssrLoadModule trick.
    6. **Asset workshop — SHIPPED 2026-07.** `?workshop=1` (dev-only,
       `src/dev/AssetWorkshop.tsx`): the type→see authoring loop. Edit a
       PropDef as JSON (or click an existing prop to fork it) and see it live
       on every biome ground, across the LOD size ladder, and scattered with
       the game's exact seeded jitter; per-keystroke validation names the
       offending path and points at the clickable palette board; "copy TS
       snippet" emits the paste-ready registry entry. This + import-svg is
       the "a less-practiced contributor can produce a fitting asset" path;
       the full guide lives in `src/render/CLAUDE.md`.
    7. **Variant generation — SHIPPED 2026-07.** Runtime, not a batch script
       (cheaper still: nothing to check in or regenerate): `wonkPathD`
       (authoring.ts) deterministically re-cuts a path's anchors/controls,
       and `variants()` (props.ts) multiplies every `TERRAIN_PROPS`
       archetype ×3 at module load — seeded by archetype id, structure/
       role-preserving (pinned by `Props.test.ts`), with a per-archetype
       `wonk:` amplitude override for fine-detail props (skull eyes). The
       density pass rode along: 8/8/7 archetypes per biome (stump, mushroom,
       reeds, log · pillar, skull, spikes, moss · wheel, pot, signpost,
       coil are new) → 24/24/21 registry entries, all reviewable in the
       gallery's new per-biome props section.

- **If licensed/bespoke art ever lands**: `Appearance.spriteId` is the reserved
  hook — a sprite skin is just another `TOKEN_SKINS` entry that maps it to an
  atlas, falling back to `paper`/`circle` when absent.

Raised 2026-06 (original analysis, still governing). Goal: replace the circle tokens with **animated sprites** and the
flat color-tint arena with a **detailed background**. The render architecture is
DOM + CSS-`transform` (see the two Performance blocks above), and that decides what's
cheap vs. what's a new bottleneck. **The one rule that governs all of this: keep
per-round motion on `transform` (compositor-only) and keep *idle* tokens from
continuously repainting** — that's the property that makes the current renderer fast,
and the easiest thing to accidentally throw away.

Cost of each change, against today's substrate (full-detail token ≈ 8–10 DOM nodes;
the `?perf` scene ≈ 460 nodes; fps cliff ≈ 75 tok=59 / 130=46 / 250=13 on a real
phone; engine ~1 % of wall clock):

- **Detailed *static* background → essentially free.** One paint, promoted to a GPU
  layer, then the camera just `translate`s it on the compositor exactly like the grid
  does today (`Arena` ground layer). Replaces the red/blue tint overlays + gradient
  grid. Only costs: art + download size + texture memory (keep ≲2–4k px). *Only* gets
  expensive if the background itself animates (rippling water / drifting fog =
  continuous paint) — gate any such effect behind LOD or skip it.
- **Static sprite instead of a circle → roughly node-neutral, maybe cheaper.** The
  circle is already a div with a background; swap it for an atlas-backed sprite. If
  one sprite subsumes the circle + facing nub + chevron, node count *drops*. Share a
  few atlases across classes/monsters (not per-unit textures) to keep GPU memory small.
- **Frame-animated sprites (idle/walk/attack) → the real new bottleneck.** CSS
  `steps()` + `background-position` **repaints that element every animation frame**,
  even when the unit stands still — converting today's zero-cost idle tokens into N
  elements painting continuously. DOM/CSS holds a *handful*; it falls over with a mob.

Phased plan (measure each step with the existing `perf`/`jerk`/`many-entities`
harnesses — they already separate engine vs render cost):

1. **Background + static sprites (stay on DOM, no risk).** Drop a detailed bg into
   the ground layer; replace circles with atlas sprites. Big visual jump, node-neutral.
2. **Animation gated by the existing LOD (stay on DOM, controlled cost).** Add
   `steps()` frame animation **only** for on-screen, zoomed-in, low-count tokens —
   reuse the exact `LOD_CAM_SIZE`/`LOD_TOKEN_COUNT` thresholds that already strip token
   detail. Crowd or zoom-out → freeze to a single static frame. The watched party
   animates; the 200-token mob doesn't. Glide stays on `transform`.
3. **Only if the mob itself must animate at scale → port the arena to WebGL (PixiJS).**
   The codebase is unusually well-placed for this: **the engine is pure and
   substrate-agnostic** (it emits positions; it knows nothing about divs), so swap
   `BattleView`'s div tokens for a Pixi stage that batches thousands of animated
   sprites into a few draw calls (the thing DOM fundamentally can't do) and leave the
   engine, store, tick loop, and snapshots untouched. Keep text/UI (floating numbers,
   HP bars, cast labels, the detail sheet) as a **DOM overlay on top** — DOM is good at
   text, Pixi at sprites. Pixi also unlocks cheap particles/shaders for spell FX. Don't
   pay this complexity until Phase 2 demonstrably isn't enough (matches "no abstraction
   the current code doesn't need").

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
- ~~Per-location terrain is a single hardcoded map~~ — stale: scenarios carry
  per-location `barriers()` and open-world fields get a deterministic
  `openWorldBarriers` scatter (store), which the organic terrain layer draws.
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
