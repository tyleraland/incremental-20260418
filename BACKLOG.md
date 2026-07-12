# Combat / Tactic Engine — Backlog

Deferred work, known debt, and future ideas for the game. This file is a
running list of things NOT yet built — implemented behavior belongs in
`CLAUDE.md` (root or subsystem) instead, so entries here should describe what
to do next, not narrate what already shipped. When an item ships, delete it
(or fold anything load-bearing into the relevant `CLAUDE.md`) rather than
marking it done in place.

## Quick wins

A handful of genuinely low-effort, low-judgment items pulled up from further
down, for anyone wanting a small task rather than reading the whole file:

- **Crafted equipment doesn't reach the real equipment array** — `craft()`
  never branches on equipment-category recipes; likely a small, scoped fix
  (*Data / spec drift*).
- **Merchant `goldDiscount` passive** — the shop itself is fully built; only
  this one class passive is missing (*Economy & resources*).
- **Reach-a-location quest objective** — trivial given existing
  `locationId`/map-page state (*Quest system*).
- **Content orphans** — `earth-bolt` skill, `versatile`/`calm` traits, an
  element id mismatch: each just needs a wire-up-or-delete decision, no
  design work (*Code health / tech debt*).
- **Cheap tactics** — 5 tactics need no new engine plumbing, just a tactic
  definition + counter-enemy tag (*Proposed tactics & counter-enemies*).
- **Sneak Attack skill** — scales an existing flat constant with level; small
  and self-contained (*AI & coordination*).
- **Location bounties** — fold the remaining mock quest locations onto the
  real bounty-board system "when convenient" (*Quest system*).

## Feature unfolding (progression modes)

`progressionMode` mechanics (sandbox/curated, gating, save slots) are
documented in root `CLAUDE.md` → *Feature unfolding*. Still to unfold (next
slices, in rough order):

- **Recipe unfolding driver.** Curated seeds few recipes but nothing *grants*
  more yet — wire recipe unlocks to quest completion / level / location
  familiarity (add an `unlock` to `RECIPE_REGISTRY` + a `learnRecipe` grant).
  Crafted equipment also doesn't reach the real equipment array yet (see
  *Data / spec drift* below).
- **Location / map reveal.** Curated only trims familiarity today; the
  overworld still draws every node. Gate visibility off familiarity/quest
  state in the shell stage, with a "rumored" vs "revealed" state.
- **Quest availability + dependency graph.** The proto quest layer
  (`protoStore.ts`: `LOCATION_QUESTS`, `CLASS_CHANGE_QUESTS`,
  `LOCATION_BOUNTIES`) is the natural unlock *driver* — commitment/progress
  state now persists via `questsCodec` (real save slice), so completed-quest
  ids are available to feed `isUnlocked`. Still to do: express
  quest→skill-tree→recipe prereqs as data.
- **Tactics / equipment-slot / ability unfolding** — same pattern (`unlock`
  metadata + mode-aware predicate) when those should ramp in rather than
  start fully open.
- **New-game UX.** No in-game mode picker yet (only Time→Debug + `?mode=`); a
  real curated game wants a front-door "new game" flow and onboarding copy.

## UI — "Tactician" shell (remaining work)

The split-screen Tactician shell (`src/proto/`) is the app's only UI — the
legacy tab-bar UI (`components/TabBar.tsx`, `RosterCarousel.tsx`,
`pages/Map.tsx`, `Units.tsx`, `Inventory.tsx`, `Guild.tsx`, the `?classic=1`
branch in `App.tsx`) was deleted once the shell's crash-guard and wiring
coverage was ported over (`TacticianLens.test.tsx`, `HeroLensSmoke.test.tsx`,
`RosterChip.test.tsx`, `WorldNode.test.tsx`). What's left:

- **Map polish (P2)** — scenario markers, an open-world badge on world nodes,
  a round counter in the breadcrumb.
- **Proto mock systems** (backed only by `protoStore`, not saved) to resolve
  before they can be considered shipped:
  - **Auto intelligence** (`ArmyMatrix.tsx`) — the two-tap Auto *assigns* for
    real, but the recommendation logic is a placeholder heuristic (casters →
    Kiter, else Charger; gear → best-in-slot in the worn category).
  - **Attunement / site upgrades** — scrapped; a placeholder stub in
    `LocationDetail`. The catalog/economy lives dormant in `protoStore.ts`
    (`LOCATION_UPGRADES`/`attunement*`) if ever revived.
  - **Proto UI state** (zoom level, hero locks, stage overlay, roster
    sort/multi-select) is ephemeral — decide what, if anything, should
    persist like the production expand/selection `localStorage` keys.
- **Explicit non-gaps** (don't build unless the underlying feature lands):
  *Weapon-set A/B switch* has no production analog (weapon sets aren't a real
  game feature yet); the shell intentionally edits only the active set.

### Tactician shell — plumbing gaps (mock → real)

The shell (`src/proto/`) already covers every surface the classic tab-bar UI
once did — Map = the stage, Heroes = the Hero lens, Guild/Reports/Time/
Settings = the ☰ drawer, Inventory = **Town → Stash** (gear · cards · mats ·
consumables · craft) + the per-hero Equipment lens. The remaining work is
wiring display-only / mock seams to real, persisted state:

- **Card sockets — inert.** The shell's socket pips read `protoStore.sockets`
  (mock, display-only) and `getDerivedStats` **doesn't read sockets at all**,
  so cards currently change nothing. The real persisted slice (`itemSockets`,
  `socketsCodec`) exists, but the shell UI (`CardBits`/`EquipmentLens`)
  neither reads nor writes it. → point the socket UI at `itemSockets` and have
  derived stats apply socket bonuses. (See also *Items, cards & sockets*.)
- **Pack carry — half-real.** `unit.pack` (consumables) is real + persisted,
  but the carried "loot bag" weight in `PackStrip`/`economy.ts` comes from
  `protoStore.packs` (fake drops from `simulateHunt`, unpersisted), and the
  **overweight penalty is displayed but not applied** ("coming soon" in
  `PackStrip`/`ExpeditionPanel`). → feed real combat loot into carry and apply
  the penalty. (Overlaps *Loot realism* / *Consumables*.)
- **Settings panel** (`ProtoApp` `GlobalOverlay`) — Audio / Notifications /
  Display / Save&sync / Accessibility are all "soon" placeholders; only Pause
  works. → build the real toggles or trim to what exists.
- **Nav cost from the 2026-07 top-row reclaim:** Town + Decisions moved off
  the always-on header into the ☰ drawer (one extra tap each); the ☰ badge
  keeps the urgent-decisions count glanceable. Re-surface either on the rail
  if the extra tap proves annoying in play.
- **Crafting data break** — see *Data / spec drift* below (`craft()` never
  grants equipment-category outputs into the real equipment array).

## Long-horizon shape changes

- **Combat view — known follow-ups.** The battlefield is a
  `mapMode === 'battle'` drop-in of the Map tab (see CLAUDE.md → *Combat
  view*).
  - *Sizing* — the arena is `aspect-square` filling its flex region; verify it
    on short / landscape viewports (the proportions differ a lot from the
    overworld layout — expect a couple more tuning passes).
- **Open world instead of single encounters.** A location can set
  `openWorld: true` for a persistent battle (`BattleState.mode === 'open'`) on
  a large per-battle map (`cols/rows`, `engine/arena.ts`) instead of the
  discrete wave model — monsters trickle-spawn, heroes join/leave as they
  deploy/recover, vision-limited targeting + wander via the team blackboard.
  Discrete encounters (scenarios, Elite Four, cities, dungeon) are unchanged.
  Follow-ups still open:
  - *Overworld travel between locations* is shipped for the automatic
    logistics loop — `travelGraph.ts`'s BFS/Dijkstra routing + `handleTravel`'s
    per-tick portal-crossing multi-hop a unit toward `routeUnitTo`'s target
    (used by the town-return trip). Still open: the player-facing Deploy/Move
    "walk" mode only does a single portal-adjacent hop (`assignUnits`'s
    `canWalk`), falling back to instant teleport for anything farther —
    extend it to call `routeUnitTo` for real multi-hop deploys. *En-route
    hunting* is also still open: a transiting unit only reactively
    defends/ignores hostiles per `travelEngage` while marching through; it
    doesn't deliberately stop to fight/loot at waypoints.
  - *Smarter spawns* — per-location monster *distributions* (weights, level
    bands, time-of-day) and non-uniform spawn timers. Today it's an
    equal-weight random pick on a fixed timer, scattered uniformly.
  - *Seeded RNG for determinism* — spawn picks / loot / scatter use
    `Math.random` in the store. Live open-world play is no longer "same
    inputs → same outputs" (tests pin `Math.random`). A seeded generator
    would make replays exact.
  - *Scattered hunt* — split the party across 2–3 objectives to clear faster
    instead of one tight group, hysteresis on a flickering edge-of-vision
    target, and tuning the vision/speed/cap/size knobs.
  - *Zoom feel — choppy + slow.* Auto-fit changes `cam.size` per round
    (discrete steps) and eases each over `--seg-ms` (up to 900 ms), so a zoom
    reads as slow, stepped breathing. Options: a snappier fixed transition for
    `cam.size` changes (decouple zoom easing from the position `--seg-ms`),
    and/or rate-limit / smooth the per-round auto-fit target so it doesn't
    step every round.

## Procedural map generation (guide: `src/mapgen/CLAUDE.md`, architecture: `procedural-generation-architecture-plan.md`, ideas: `procedural-generation-ideas.md`)

Pure deterministic leaf library baking a MapSpec (collision/surface/scatter/
semantic planes) through recipe pass pipelines + validation; shipped
mechanics and roadmap rationale live in the guide. The **layer architecture**
(shipped: shared graph/gates modules, scratch tier, manifest seam, derived
region graph, rivers+crossings, overworld gates, cyclic dungeons, the 72-rect
envelope) and its extension **seams** live in
`procedural-generation-architecture-plan.md`. Open work below is grouped:
future feature tracks, then discrete tech-debt/polish chunks, then the
deferred content phases.

### Open feature tracks (each a distinct future build)

- **Desire-path pass (track C tail).** Paint dirt/road surface along the
  spawn→portal→landmark graph route through the pinches (zero rect cost) —
  makes the derived graph *visible* and routes readable. Pure L7 dressing.
- **Spend the 72 envelope (track C tail).** P5 landed the cap but the field
  recipe plateaus real spend at ~21 rects @96² / ~38 @200² — RIVER_DIALS /
  outcrop target / GATE_DIALS allotments were tuned for the old 40. Retune
  them deliberately (lab-reviewed) so the moderate envelope buys richer
  geography; nothing spends the headroom today.
- **Track D — flow/tension derived plane.** Distance-to-goal BFS in
  `draft.scratch`, digested to a per-node `intensity` scalar on the semantic
  plane; store consumes it for spawn/reward pacing (mapgen makes the stage,
  store populates — settle the split in that PR). Gives `field` the depth
  notion it lacks. Attaches at the L6 scratch seam.
- **Track F — tactical legibility as a generation target.** Sightline-ribbon
  pass (reserve 1–2 straight lanes pre-obstacles; pure AABB) turning
  `longLanes` from annotation into guarantee; `tacticalTargets` in GenParams
  scored by validator/reroll (the ASP idea without the solver). Ship paired
  with consuming AI tactics (see AI & coordination).
- **Track G — world director (Phase-0).** Computes `GenParams.manifest`
  plants across the location graph (cross-map lock/key solvability). The L0
  seam is typed and plumbed; gated behind single-map key logistics (phase 6).
- **More dungeon rewrite steps (track E tail).** Key-fetch chains, extra
  cycles, secret shortcuts — the cycle-as-primitive skeleton + shortcut-lock
  rewrite shipped as the first step; key-fetch needs phase-6 item plumbing.

### Tech debt & polish — discrete chunks (each independently pickable)

*Graph / derivation (P1):*
- **Pinch-width quantization.** `deriveRegions` clearance is integer, so
  width-3 and width-4 corridors are indistinguishable (share clearance 2). A
  chamfer/Euclidean distance transform would allow half-cell ford tuning.
- **Portal→node linking.** One `poiId` per region node, spawn-first — on a
  1-region map every portal POI goes unlinked (note()d, unconsumed). Graph
  contract rule 2 (portal on the ungated subgraph) will eventually need real
  portal→node enforcement, not just the note.
- **Lab region tinting.** Surface the `regions` claims plane in `?mapgen=1`
  (tint cells by region in the layer inspector) — the derived graph is
  invisible in the lab today.

*River (P2):*
- **River→lake feed.** The river ignores the lake as a destination
  (edge-to-edge guarantees bisection); feeding it into the lake is coherence
  polish.
- **Centre-crossing rivers.** The lane design keeps the river beside the
  spawn apron, so it never crosses the map centre. An apron-band detour
  (instead of a whole-course lane) would allow centre-crossing courses.
- **Rim-sliver far bank.** The river often hugs its lane's outer margin, so
  region 2 can be a thin rim strip rather than a playable bank — review
  `RIVER_DIALS.laneMargin` in the lab.
- **Outcrop L/T ford seal.** The outcrops pass's second (L/T) rect bypasses
  `isPlaceable` and can land in a 2-cell ford gap; tolerated at `fordCount`
  2 (validation backstops, 0 retries observed) — a hazard only if fordCount
  ever drops to 1.

*Gates (P3):*
- **Manufactured vault pockets.** Natural degree-1 pocket regions are
  ~0/600 bakes, so the perception vault only fires on a synthetic test. A
  dressing pass (outcrop-horseshoe / river-oxbow) that creates degree-1
  candidates would let the real vault path fire and the synthetic test
  become a real-bake assertion.
- **Bridge seal render.** A closed might/wood bridge gate draws as a 4.5×4.5
  *building* straddling the river; wants a collapsed-planks look.
- **Kit scatter drift.** Decorative scatter may differ between kit variants
  near an opened pinch (scatter runs after gates, reads collision). The
  collision + semantic planes are exact; this is cosmetic and shared with
  the dungeon — pin the true contract (`collision` set-minus-plug) in tests
  if it ever matters.
- **Dry-gap gate mapping.** The might/rock "rockfall" mapping never fires —
  no dry pinches derive on current geography; revisit when ridge/pass
  geometry lands.

*Dungeon (P4):*
- **Both-arcs-empty promotion path.** The degenerate-layout guard that keeps
  the ≥3-room cycle guarantee has no exercising seed or test (traced sound
  by review). Add a crafted unit test before trusting the guarantee on
  pathological layouts.
- **2-room floor bakes a tree.** Legitimate, but nothing flags the missing
  cycle — a validation note or rule would make the guarantee's boundary
  explicit.
- **Shortcut goal-filter untestable.** The "never touches goal" filter is
  code-enforced but `goalId` lives only in `draft.scratch`, so no spec-level
  test can pin it — publish a goal marker if a test should assert it.
- **Shortcut doorAt hit rate.** The long-way flood rejects candidates whose
  plug would swallow a small room's centre; nudging the plug's `doorAt`
  outward into the corridor would raise the shortcut fire rate.

*Cross-cutting infra:*
- **`GenResult.notes` cross-attempt bleed.** Notes accumulate across reroll
  attempts, so note-matching tests/tools can see notes from rejected
  attempts. Scope notes per-attempt (or tag them with the attempt index).
- **`Math.hypot` tie-break determinism.** Strict-inequality tie-breaks over
  `Math.hypot` are same-process deterministic (the save contract holds), but
  cross-engine seed replay could flip a near-tie. Swap to squared distances
  if cross-engine replay ever becomes a requirement.
- **Tactical-profile heuristics are v0.** `chokepoints`/`longLanes`/
  `coverClusters` are unvalidated against play and consumed by nothing;
  they need the consuming AI tactics (hold-chokepoint / use-cover — see AI &
  coordination) and should ship as a pair (⭐10).
- **Lab authoring loop.** `?mapgen=1` could grow an export-to-Location
  snippet button (the curated-map authoring loop) and a bulk CLI sweep
  (`npm run mapgen-sweep`) if the vitest fuzz gate ever gets slow.

### Feel-iteration knobs (need human play, not code)

- **Shortcut-lock knobs (dungeon).** 0.5 fire chance, mid-arc-only, closest-3
  chord pick, 0.4×axis degenerate-arc threshold — all first guesses awaiting
  the phase-4 feel pass; iterate via the lab's party toggles.
- **Overworld gate knobs.** `GATE_DIALS.routeChance` 0.6, one route + one
  vault per map, terrain→tag mappings — first guesses; no live location has
  opted into gates yet (`mapGen.gates`), which is deliberately the gate.

### Live adoption (content wiring, not perf)

- **Live dungeon location.** The dungeon recipe is perf-viable (P5 benched
  72); what remains is content — a Location adopting `recipe: 'dungeon'`,
  spawn/lair wiring, and monster population.
- **Live overworld gates.** `mirror-vale` etc. can set `mapGen.gates: true`
  once the phase-4 gate feel (frequency, rewards, surfacing) is judged
  good; the machinery and the opt-in are both in place.

Deferred phases (each independently shippable):

- **Phase 4 — lock-and-key + proficiency gates.** Foundation is in (enriched
  `Lock` model, the dungeon `gates` pass, proficiency tags) but feel needs
  human iteration — the handoff list lives in `src/mapgen/CLAUDE.md` → phase
  4: gate frequency & placement feel, store-side rewards (familiarity/xp/loot
  multipliers off the `prize` POI tags), surfacing in Reports/event log
  ("Shae's perception found a hidden door"), party-change re-resolve
  semantics, field-recipe gates, 'key'/'switch' lock kinds (phase 6).
  **Biggest unbuilt piece — puzzle-SOLVING as a play flow:** today's gates are
  a static have-the-tag check; the intended system is discovery (clues
  noticed as a function of INT/knowledge + time), key logistics (items found
  on-map unlocking other locks — real sequencing chains), and planning AI
  (the autobattler routes the party through fetch-key-then-open-door).
- **Phase 5 — inter-map coherence.** The `city` recipe + naming pass shipped;
  still open: **inter-map adjacency/depth gradients** as first-class;
  **NPC/merchant placement reading the semantic plane** (today they're
  hand-placed on the plaza in `npcs.ts`, not read from the spec's
  `landmark`/`nav` nodes); premise → Reports/offline-summary wiring.
- **Phase 6 — interactables / dynamic barriers.** The one invariant-breaker
  (BSNAP byte-identical replay must survive it); gated behind everything
  above.
- **Cross-cutting.** The dungeon recipe is perf-viable live (P5 benched 72);
  what remains for a live dungeon is content wiring (a location adopting the
  recipe, spawn/lair integration). `GenResult.notes` accumulate across reroll
  attempts — note-matching tests/tools can see notes from rejected attempts;
  consider per-attempt note scoping. `Math.hypot` feeds strict-inequality
  tie-breaks in mapgen sorts — same-process determinism (the save contract)
  is safe, but cross-engine seed replay could in principle flip a near-tie;
  swap to squared distances if that ever matters. Tactical-profile
  heuristics (chokepoint/lane counts) are v0, unvalidated against play; map
  features need consuming AI (hold-chokepoint / use-cover tactics — see AI &
  coordination) and should ship as pairs. `?mapgen=1` lab could grow an
  export-to-Location snippet button (curated-map authoring loop) and a bulk
  CLI sweep (`npm run mapgen-sweep`) if the vitest fuzz gate gets slow.

## Offline progression

`batchTick` extrapolates offline combat rewards rather than re-simulating
(warm rate-scaling + a budgeted cold-prime slice); implemented behavior is in
CLAUDE.md → **Offline progression**. Still deferred:

- *Web Worker offload* — priming runs on the main thread within the 50ms
  budget. If it ever gets heavy, move it behind a loading buffer in a worker
  (the `serializeBattle`/`deserializeBattle` BSNAP tokens already make a
  battle worker-portable).
- *Seeded RNG for exact loot* — offline loot rolls use `Math.random` in the
  store (tests pin it), same as live loot. A seeded generator would make
  offline replays exact.
- *Cold-priming HP fidelity* — priming settles the fight and seeds a rate but
  the regen/recovery pass owns final unit HP (units fast-heal anyway);
  priming doesn't separately model offline KO downtime.

### Offline return-to-town loop (§logistics) — known gaps

`projectOfflineCycles` (`src/lib/offline.ts`) + the `batchTick` wiring
extrapolate the hunt→fill→travel→deposit→restock→(stall) loop from the
realized loot rate + a slice-measured potion burn. Remaining gaps (most are
deliberate first-cut simplifications; **numbers need feel-tuning via the
Time→Debug Offline simulator**):

- **Trip fires on pack-full even for a `supplies-out`-only hero.**
  `projectOfflineCycles` returns whenever the pack fills, regardless of
  `returnOn`; live (`expeditionDriver` phase 2e) only returns on pack-full
  when it's a configured trigger. Pass a `returnOnPackFull` flag and model
  "pack full, no return trigger → stop gaining (overflow)" to match live.
  (Med.)
- **Empty-`returnOn` deployed hero diverges.** With `returnOn: []` the
  offline loop is skipped (legacy: all loot → stash, no trips) but live
  overflows-and-loses once the pack saturates. Reconcile the two. (Med.)
- **Bulky residual can be silently dropped.** `distributeResidualInto` places
  per-hero, so a single item heavier than any one hero's remaining room is
  dropped even when the party's *combined* room fits it. Spill to the stash
  or log it. (Med/low.)
- **Offline never drains `Unit.pack` carried supplies.** The supply cost is
  charged to stash/gold only; a hero the model reports `stalled` still shows
  full carried potions on next load. Decide whether an offline stall should
  leave carried supplies drained (so the stall is visible) or stay a pure
  stash/gold cost. (Low.)
- **`huntFraction` flooring drops rare (qty-1) drops.** Loot is rolled over
  the full span then floored by `huntFraction`; a `q=1` rare with
  `huntFraction<1` floors to 0. Roll loot *after* scaling, or round rare
  drops up. (Low.)
- **Warm/short absences never model supply drain or stalls** (no sim slice →
  `burn=0`). Intended for short absences; revisit if it feels off. (Low.)
- **Burn-rate measurement is rough** — sampled windows never restock between
  slices (can undercount sustained burn), and a hero KO'd mid-slice counts
  its whole carry as "used" (over-count). Track cumulative burn instead of an
  end-of-slice diff. (Low.)
- **Divergences from the live driver the offline model ignores** (deliberate
  first cut): party loot/supply **sharing** flags (`shareLoot`/`acceptLoot`/
  mule); real **merchant prices** + storage-vs-merchant sourcing (offline
  uses a flat `OFFLINE_RESTOCK_PRICE`=12 for any consumable);
  **`deployMode`** travel (offline always prices `townDwell +
  2·hops·travel`, even in `instant` mode where live has none); a configured
  farther **`returnTown`** (offline overheads to `nearestCity`); and the
  cycle model is gated on `loc.openWorld` (wave-based huntable locations use
  the legacy path offline). Fold these in as the economy/travel systems
  become real, or document as live-only.
- **Feel-tuning** — `OFFLINE_RESTOCK_PRICE` (const in `useGameStore.ts`),
  `SAMPLING.cycleTownDwellTicks`/`cycleTravelPerHopTicks` (Time→Debug knobs)
  are conservative guesses; tune against `TOWN_RESUPPLY_TICKS` + real travel
  time using the Offline simulator, then bake the winners.

## Economy & resources

- **Passive resource generation from assigned units.** The original prototype
  direction (from the now-deleted `features.md`): a unit stationed at a
  location passively produces resources over time (Wood, Iron Ore, Fish,
  Herbs — the `miscItems` the crafting loop wants) with no combat. Superseded
  by the combat / open-world direction, where locations spawn fights that
  drop loot instead. If revived it overlaps the **Gather-and-guard** tactic
  below (resource nodes + a "go work that node" move-order behaviour) — the
  difference is *passive* (just-assigned, ticks yield) vs *active* (a hero
  peels off to a node while the party screens).
- **Merchant `goldDiscount` passive.** The buy/sell shop itself is shipped
  (`Town.tsx`'s Market, backed by `data/merchants.ts` — real gold both ways).
  Still missing: a **Merchant** class passive that discounts buy prices; the
  skill can exist in the tree with no effect until then.

## Quest system (objective types)

The class-change quests (`src/proto/protoStore.ts`) are the seed of a
WoW-style quest framework. Each quest has an **objective** the player works
toward, and kill/collect objectives carry a **scope: `'hero'`** (only the
committed hero's actions count) or **`'global'`** (any hero) — class-change
quests are inherently hero-scoped, but the objective model supports both so
future party/board quests can be global.

Objective types not yet built:

- **Crafting / transformational.** Consume reagents A+B+C → grant reward Z,
  with a clear **"Items consumed"** panel (reagents are ordinary materials,
  not quest-specific items). `RECIPE_REGISTRY` is live (a real `craft()`
  action, Town's craft tab) — this would reuse that, not build it fresh.
- **Reach a location.** Travel-to-X objective (e.g. "reach Geffen Dungeon
  F3"). Tiny given existing `locationId` / map-page state.

**Location bounties** — fold the remaining mock `LOCATION_QUESTS` locations
onto the real bounty-board system (`LOCATION_BOUNTIES`, chained via
`requires`) when convenient.

Quest commitments/progress/completion state (`activeQuest`, `questProgress`,
`completedQuests`, `classQuestCommit`, `bountyDone`, `bountyClaimed`,
`questCompletions`) and the collect-objective drop-rule ledger
(`questDropRules`/`questItems`) now live on `useGameStore`, persisted via
`questsCodec` — they round-trip through export/import and per-mode save slots
like everything else. Quest *definitions* (`CLASS_CHANGE_QUESTS` etc.) and the
action functions that mutate this state still live in `src/proto/protoStore.ts`
as plain exported functions (not zustand actions on `useProtoStore`).

**Quest journal follow-ups** (`src/proto/QuestJournal.tsx`): a "completed
archive" view (repeatable history beyond the ✓N chip); a compact "active
paths" strip mirrored in the Party lens; and map-pin markers (a `?`/`!` on
world-map locations) as a second nudge surface.

**Quest rewards** currently mint fresh equipment instances on grant — fine
for the prototype, but revisit stacking/dedupe if the inventory grows noisy.

## Combat content

- **Per-location quests & async choices.** Each location grows a small pool
  of quest hooks (kill X, escort Y, recover Z) and pinch-point choices the
  player resolves out-of-combat. Resolution is async — the party at the
  location ticks toward the objective in the background, and choice nodes
  surface in a notification / location panel for the player to answer when
  convenient. Folds into the open-world shape (above) and the location
  codex, so each cell is more than "the wave it spawns."
- **Boss monsters with phase / trigger skills.** The **Elite Four**
  (`data/monsters.ts`) are just high-stat monsters with ordinary skills+tactics
  today — there's no boss *system*. `isBoss?: boolean` already exists on
  `MonsterDef` (`types.ts`) but nothing reads it yet; wire it to stat/HP
  multipliers and a distinct token/border in `BattleView`, and add
  **trigger-driven** skills that fire on events rather than the normal
  cooldown cadence: on-spawn, on-low-health (**phase transitions** — enrage /
  new ability set below a HP threshold), on-ally-KO, periodic. The engine
  already has per-monster `skills`/`tactics` and statuses; this needs a
  trigger hook in `advanceRound`/`takeTurn` and a place to declare a
  monster's private (not-in-`SKILL_REGISTRY`) boss kit.
- **Consumable combat items (auto-use).** Engine scaffolding exists
  (`EngineUnitInput.potions` → `potionsLeft`/`potionsConsumed`) but isn't wired to
  inventory or any use logic. Let a unit be configured with a `combatItem` (points
  at a `miscItems` consumable — Fish Stew / Herb Salve already craftable) that's
  auto-consumed in combat on a trigger (e.g. self-heal below a HP threshold, or
  per-N-rounds), decrementing inventory and firing the effect; degrade gracefully
  when it runs out. Gives crafted consumables a combat purpose.
- **Minions.** The engine supports owned, leashed combatants
  (`Combatant.ownerId`/`leashRange`/`summonTtl`/`summonTag`, owner-leash in
  `takeTurn`, per-round despawn, `type: 'summon'` skill effect). Beast
  Companion (permanent pet) and Summon Skeletons (active skill) ride on it.
  Deferred follow-ups:
  - *Companion XP / independent level* — it currently tracks the owner's level
    ("levels with you"); a real per-pet XP bar + growth is the named next step.
  - *Companion revive* — a fallen pet only returns when its hero next deploys
    (open-world) or on the next wave (encounter); add an in-fight revive
    timer/cooldown.
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

- **Monster cards + socketing (the upgrade layer).** `CARD_REGISTRY` (12 cards)
  and the socketing UI (`CardBits.tsx` — `SocketEditor`/`CardChip`/`CardCodex`,
  insert/remove) are both built, polished, and reachable from the Equipment
  lens. But it's all mock: `ownedCards`/`sockets` live in `protoStore`
  (dev-seeded via `seedCards`, not saved), not the real persisted
  `itemSockets`/`socketsCodec` slice — and cards don't actually drop from
  monster kills yet (`rewardKills`/`rollOfflineLoot` never grant one). Same
  root gap as *Card sockets — inert* under **Tactician shell — plumbing
  gaps** (which also covers `getDerivedStats` not reading socket bonuses at
  all) — one fix closes both.

## Consumables — pack & use rules

Mechanics (`Unit.pack`, `consumableRules`, `CONSUMABLE_REGISTRY`,
`reconcilePackInTown`) are documented in CLAUDE.md → Tactics → *Consumables*.
The proto logistics loadout (`GameState.expeditions`, `src/proto/expedition.ts`,
persisted via `logisticsCodec`) drives `Unit.pack` carry targets and the return
loop instant-deploys a returning hero to town for resupply (`expeditionDriver`
phase R). Deferred next slices:

- **Open-world routing for returns.** The resupply trip teleports for now; the
  `deployMode` lever's `'open-world'` branch still just runs heroes to the map
  edge (no town arrival). Replace with real land routing + travel time, and
  interpolate the trip instead of instant-deploy.
- **Merchant purchase + cost.** A loadout supply's `merchant` source flag only
  feeds a cost display (`loadoutCost`); reconcile is stash-only, and the gold
  is never charged. Wire **merchant purchase** for the shortfall
  (`MERCHANT_REGISTRY`; needs a real store-side buy action — currently
  proto-only) and actually debit gold, or hide the affordance until then.
- **Action-bar equip quantity.** Putting a consumable on the action-bar `+`
  auto-adds it to the loadout at the default supply qty (10), silently
  committing the hero to carry+withdraw that many. Let the player pick the
  carry count at equip time (or seed from a smarter default). (Offline
  `batchTick` doesn't run town auto-fill or consume potions — it resumes on
  the live tick; revisit if it matters.)
- **More effects.** Only `heal-max` exists; the apply branch in `takeTurn`
  hardcodes heal-to-max. Generalize via the `ConsumableEffect` union
  (fixed-heal, cure-status, buff) — the effect descriptor already crosses
  the engine boundary on `ConsumableSpec`.
- **Loot policy (blocklist / priority).** Hero- or guild-wide rules to
  ignore/drop some drops and prioritize others by name / rarity / item-level
  (item-level not modelled yet). Sits beside the pack as a shared policy
  object.
- **Saved loadout templates.** Save a hero's pack + use rules (+ future
  restock targets) as a named template; apply/tweak on any other hero to cut
  per-hero monotony. New small persisted registry + apply action.

## Loot realism

Kill loot is credited per-hero into the pack in real time (`rewardKills` →
`foundLootByUnit` → `pendingPackLoot` → `proto.packs`); pinned by
`loot-to-pack.test.ts`. Open follow-ups: pack overflow beyond `WEIGHT_LIMIT`
is dropped (real carry pressure, but silent) — surface it; off-screen
per-hero attribution is round-robin, not true kill credit.

- **Ground-drop loot pickup.** When a monster dies, spill its rolled drops
  onto the battlefield as pickup tokens the hero walks over to collect into
  their pack (a small collect radius / auto-path to nearby loot). Turns loot
  from an instant ledger bump into a spatial act, and makes carry weight /
  pack-full a real in-field pressure. Needs: a `groundLoot` layer on the open
  battle (position + itemId + qty, store-owned like spawn RNG — NOT in the
  engine, to keep replays clean), a pickup step in the tick (hero within
  radius → move qty into pack), a render layer (drop tokens + a pickup pop),
  and a decay/vacuum rule so uncollected loot doesn't pile up.

## Inventory UX (at scale)

- **Search / pagination / bulk sell / recipe-plan.** The shell's Items lens
  (`ProtoLens.tsx`, guild stash) already has tri-state category filters
  (weapon/armor/accessory/material) and an equipped-state filter. The
  Market (`Town.tsx`) already sells one item at a time. Once cards + more
  gear land the list gets long; still missing: a **name search**, **sort**
  (stat score / slot count / name), **pagination / virtual list** for cheap
  mobile render, a **bulk sell mode** from the stash itself (multi-mark →
  gold preview → confirm, vs. today's one-at-a-time Market row), and a
  recipe **"plan"** button that highlights missing ingredients in Misc.

## AI & coordination

**Design: `tactical-coordination.md`** — TeamPlan v2, planner pipeline +
pull model, directives (player lever), host objectives (escort / hold /
work), sliced into milestones. **M0–M3 shipped** (engagement/kill-order/
avoid list; pullSetOf + mutual-TTK race + Puller; stance/anchor/formation/
standing guard/corridor; acumen gates) — see the doc's milestone ledger and
`src/engine/CLAUDE.md` §coordination. Still open: **M2.5 rove/jungler**,
**M4 directives** (subsumes the old "Strategies = multi-channel tactic
bundles" idea — Assassinate / Lock & Focus / Hold the Line as one registry
entry each), **M5 objectives + chaperone**, **M6 rollout experiment**, and
the **intel mask** independent track (imperfect information).

**Sequencing (agreed).** Next headline slice: **M4 directives** — the player's
party-scope lever, and the payoff the whole system was built to enable; most
of its substrate (Assignment roles, stance/anchor, the planner pipeline)
already exists, so it's mostly the registry + a persisted party slot + adapter
injection + curated gating + the ambush/cloak-timing orchestration. Run the
**intel mask** as a parallel independent track (touches no planner code —
mergeable anytime). Slot a **browser tuning pass** on the ⏱ knobs alongside,
using the 14 sandbox showcases as the QA rig — `ACUMEN.stance = 90` (vs a fresh
roster's ≈75, hides all of M3 from early curated play) is the highest-risk knob
to confirm first. M2.5 rove, M5 objectives/chaperone, M6 rollout follow in the
doc's build-value order.

**M1–M3 follow-ups (from the phase bug-hunt reviews + live showcase QA):**

- ***Abandon has no execution — it's bookkeeping.*** When the mutual-TTK
  re-price crosses `ENGAGE_EXIT` the plan drops the `engagement`, but nothing
  in `executeMovement` acts on it: units keep their sticky lock + threat and
  fight on (the `fold-when-losing` showcase decides to fold, then dies anyway).
  Wire abandon → a real disengage: on the round an engagement is dropped for
  "losing the race" (not "everything's dead"), have members break off toward
  the party edge / a safe rally, reusing the Retreater / kite back-off
  movement. Higher value than the rest here — it turns an already-shipped
  *decision* into visible *behavior*, and pairs naturally with M4 (a Skirmish
  directive's whole point is knowing when to fold).
- *Roam-into-avoided-camp gets stuck* — when the party correctly declines an
  unaffordable camp and roams away, `pickRoamPoint` / the fanned waypoint can
  route it THROUGH the sleeping pack's physical cluster, where `enforceSeparation`
  against the tight body of monsters jams it (the `dont-over-pull` party ends
  up wedged in the middle of the pack). The avoid decision is right; the
  *pathing* isn't avoid-aware. Make the roam/hunt waypoint (and/or its
  fan-out) steer clear of avoid-listed clusters, or treat a dense avoided
  camp as a soft obstacle for the roam route.
- *Corridor hysteresis* — `corridor` re-derives from the live centroid each
  decision round with no stickiness; a centroid straddling a barrier midline
  could alternate corners round-to-round (party zigzag). Add a committed-
  corner hold like `escapeDir`/`avoidSide`.
- *Unify the two guard pickers* — the Guardian tactic targets
  `squishiestAlly` (lowest raw def) while the planner's standing guard picks
  `fragilityOutlier` (toughness vs party median); a Guardian-equipped unit
  can protect someone other than the plan's `allyId` (advisory-only today —
  comment at `executeMovement`'s guard branch).
- *Stance/anchor refresh on primary handoff* — stance+anchor recompute on
  fresh commit or uninvited re-anchor only; a plain primary handoff inside a
  held engagement carries a possibly-stale hold anchor (LoS was checked vs
  the OLD primary). Deliberate commit-time design; revisit if it reads wrong.
- *`FOCUS_WEIGHT` feel* — convergence steers pre-contact and idle units;
  accrued threat deliberately outbids it once damage flows. If focus reads
  cosmetic in real fights, raise it or make it scale with acumen.
- *`ACUMEN.stance` dormancy* — 90 vs a fresh roster's ≈75 means stance/
  formation is late-game content by default; tune with the curated ramp.
- *Moving-fight pull prediction* — `pullSetOf` prices membership at the
  commit point; the no-drift test is stationary. A dragged fight re-anchors
  via the uninvited-joiner path (covered by test), but a regression pinning
  prediction quality for a genuinely mobile pull would strengthen it.
- *Coordination outcomes are id-tiebreak-sensitive* — plan picks
  (kill-order, puller, guard, formation slots) break ties on `id`, which
  cascades through the deterministic multi-round sim; the showcase scenes
  proved robust only after picking specific ids. Not a correctness bug
  (determinism holds), but tie-break choices can flip a whole fight — worth
  a look at whether a more stable secondary key (position, index) reads
  better than raw id in the coordination pickers.
- **Threat model — extensions.** WoW-style threat table drives default
  targeting (`selectTarget`, §threat in AGENTS.md). Open: AoE/aura threat (a
  tank holding several mobs at once, not just what it's hitting),
  reachability-aware threat (don't lock a foe you can't path to), threat
  decay/leashing, and a browser-tuning pass on the showcase numbers
  (`THREAT_WEIGHT`, `PULL_FRACTION`).
- **Offensive-option scoring — more scorers.** `estimateDamageVs` is the
  hook (consumers: `reorderAttacksForTarget`, the plan layer's
  `preferredAttackVs`/`forecastAction`). Open: **AoE spread value** (score
  by expected total damage across everyone hit — AoE skills are excluded
  from the re-rank AND invisible to the plan seam, which keeps Storm Caller
  un-unified and `exposureAt` scoring AoE monsters by basic attack — one
  scorer fixes all three), sideboard/weapon-swap candidates (scorer already
  takes `skill: null` so it's swap-ready), and folding status-synergy/on-hit
  value into the score.
- **Planning seams — the plan layer's next rungs** (`movement-action-coupling.md`;
  the seam today is greedy 1-ply utility over a small candidate set — these are
  the deeper interfaces it opens, roughly in build-value order):
  - **Lookahead / rollout.** `simulateCandidate(state, self, cand, plies)` that
    CLONES the BattleState and `advanceRound`s a few rounds, scoring the
    *resulting* state instead of the immediate forecast. Turns greedy into
    shallow search behind the same `scoreCandidate` interface; cheap and
    trustworthy because the engine is RNG-free (one rollout = a real verdict).
    Highest-leverage next seam — directly tests whether 1-ply is the ceiling.
  - **Team-plan (joint) scoring — deepen.** v1 shipped in M3 (`cohesionW`
    anchor-drift term conditions `scoreCandidate` on the plan). Open: more
    plan-conditioned terms (slot conformance for candidates, guard coverage
    value) rather than only anchor distance.
  - **Strategy commitment — the tactic-bundle half.** Engagement-level
    commit-and-abandon shipped (M1/M2 hysteresis + abandon predicates); the
    remaining half is M4 directives — a player-chosen Strategy expanding to
    tactics + planner hints, held until its own abandon predicate fires.
  - **Enemy prediction (exposure horizon > 0).** `exposureAt` prices threats
    where they *stand* today. The forecast is already symmetric (it runs
    `preferredAttackVs` for enemies), so running it forward a few rounds for the
    ENEMY predicts pursuit/target movement — pricing chasers into corridors and
    into blink-landing choices. Extension, not invention.
  - **Utility vector / objectives.** "Value" is `forecast − exposure` today. A
    composable utility (protect the objective, grab loot, conserve cooldowns…)
    generalises the posture *columns* into content-declared objectives feeding
    the same `scoreCandidate`.
- **Blink landing quality** (extends M4 `tryBlinkEscape`). The escape scorer
  ranks landings by raw euclidean clearance from provoked foes + cohesion. It
  does NOT (a) prefer a landing that puts a BARRIER between the unit and its
  pursuers — a cliff/wall is greater real distance for the chaser to clear AND
  known ground (blinking back across a canyon should often beat a sideways hop);
  (b) price EXPOSURE at the landing, so it can blink *into* danger (worse with
  limited vision). Wants barrier-aware pursuer-distance (reuse `canReach` for
  post-blink reachability) + `exposureAt` at each candidate landing. Ties into
  Enemy prediction above.
- **Hybrid-caster interrupt trap.** A melee+spell unit (e.g. a Bash + Frost Bolt
  battlemage) stuck in melee, once its melee skill is on cooldown, prefers a
  channeled bolt over closing — and gets the channel interrupted every round by
  the adjacent foe, casting nothing. Casters have no basic-attack fallback
  (`chooseAction`), so it just stalls. `forecastAction` already exposes
  `finishable`; the action layer could prefer a melee/instant option when the
  channel provably won't land (or an eventual "ignore/resist interrupt" passive
  could change the math). Low priority — surfaced by the `kite-anchor` showcase.
- **Ambush combo** — primitives exist (cloak, back-stab, flanker, ambusher);
  needs an orchestrator holding Cloak until in Back Stab range.
- **Sneak Attack skill** — a learnable skill scaling the flat
  `STEALTH_ATTACK_BONUS` with level.
- **1v1 chase circling** — a lone chaser can orbit a barrier forever behind a
  fleeing target; rare in multi-unit fights. Needs a "cut the corner" intercept.
- **Gather-and-guard (open world)** — a tactic peeling a unit off to work a
  resource node while the party screens (or solos it when clear). Needs
  resource nodes as a new open-world entity, a move-order-based "work the
  node" behavior, and a blackboard-read guard assignment gated on
  vision/threat so the party only commits when safe.

### Monster aggression & packs (extensions)

Provoked state, aggro-on-hit, and pack rally (`rallyPack`) are shipped.
Deferred:

- **Call range / frequency.** `rallyPack` calls at full `visionRange` every
  turn. Add a louder/longer-range or cooldown-gated "howl" (rank-scaled)
  instead of an every-turn full-sight call.
- **Threat-based retargeting.** Rallied kin adopt the *caller's* target only;
  shift aggro toward whoever's dealing the most damage (incl. other party
  members), reading the planner's `threat` map.
- **Cross-species / faction packs.** Calls match exact `name` today; allow
  "call any allied monster nearby" or tagged faction groups.
- **Passive herd-wander.** Passive herds (skittish, no `pack-hunter`) lurk in
  place; give them a non-hunting "graze together" group roam (vs.
  `pack-hunter`, which converges on heroes via the team waypoint).
- **Flee polish.** `flee` runs toward the unit's own edge (+ cohesion); make
  it flee *directly away from* the nearest threat, seek terrain/cover, and
  regroup with the pack rather than corner itself.
- **Aggression decay / leashing.** `provoked` is permanent; let monsters calm
  down and de-aggro when heroes break contact, or leash to a home area.
- **Tiered dispositions.** Beyond skittish/aggressive: *territorial* (aggro
  only within a radius), *ambush* (passive until a hero is adjacent),
  *fearful* (flees on sight).
- **Alert propagation.** A provoked monster alerts kin who then *hunt* the
  party's last-known position even out of sight (vs. only adopting a live
  lock).
- **Pack roles.** Leader/follower — kill the leader and the pack
  scatters/flees; or coordinated flank/surround driven by the team
  blackboard.

## Proposed tactics & counter-enemies

A design pass on new player tactics — each either unlocks a hunting strategy
(solo or party) or counters an enemy archetype we haven't built yet (the enemy
is listed so the tactic and its foil ship together). Inspirations: Ragnarok
Online, WoW, botting, Kittens Game, Guild Wars, RimWorld, Dwarf Fortress, LoL.
Grouped by how much engine plumbing they need. None are built yet.

Cross-refs: several overlap themes already noted under **AI & coordination →
Smart-party baseline** (chokepoint / over-pull / formation) and **Gather-and-
guard** — these are the *equippable-tactic* expression of those.

**Cheap — pure tactics on existing hooks:**

- **Spread Out** (movement · floor). Hold a minimum ally gap so one AoE/cleave/
  zone can't catch the party. *Counters* Bombardier/Cleaver-style enemies.
- **Conserve / Don't Overkill** (action). Basic-attack trash; bank cooldowns
  for elites/bosses. Reads `skillDamageEstimate`/`estimateDamageVs`/`isBoss`.
- **Last Hit (Secure)** (targeting · trigger). Snap to a kill a basic swing
  secures — steers XP/loot credit to a chosen hero.
- **Decapitate (Kill the Summoner)** (targeting · trigger). Focus
  `SkillType: 'summon'`/buff casters before adds snowball. *Counters*
  Necromancer/Shaman archetypes.
- **Bodyguard / Peel-the-carry** (movement · trigger). Body-blocks for the
  highest-damage ally, not the squishiest. *Counters* a back-line-diving Assassin.

**Needs engine plumbing:**

- **Sidestep (Hazard Dance)** (movement · trigger). Step out of a damaging
  ground zone instead of holding. *Counters* hazard-layer casters (a future
  Lava Drake/Plague Toad). Units currently stand in fire.
- **Break Line of Sight (Juke)** (movement · trigger). A focused squishy ducks
  behind cover to break ranged/caster LoS. *Counters* Sniper/Artillery
  archetypes; pairs with the channeled-LoS-at-resolve engine gap below.
- **Cleanser / Triage** (targeting + action). Dispel the worst control off the
  ally nearest death (`EngineSkill.dispelCategory` exists). *Counters* a
  debuff-stacking Hexer.

**Party positioning:**

- **Hold the Line / Chokepoint** (party). The planner already anchors hold-
  stance formations at barrier corners (M3); the remaining half is the
  player lever — a Hold-the-Line *directive* (tactical-coordination.md M4)
  that forces the anchor policy. (Puller shipped in M2 as an equippable
  tactic + the planner's pull assignment.)

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

## Code health / tech debt

Grouped by theme; each is left for a focused pass because it's
behavior-sensitive, a refactor, or a product decision.

- **`tick` vs `batchTick` KO/recovery/regen duplication.** The per-kill drop-roll
  and blank `LocationCombatStats` literal duplication is fixed (`rollDrops()` /
  `emptyLocationStats()`). Still duplicated: `tick`'s per-tick KO→recovery→
  resting→regen step (`useGameStore.ts`, live) vs `batchTick`'s closed-form
  n-tick collapse of the same state machine (offline). These are two genuinely
  different algorithms (iterative vs. closed-form), not copy-paste, so
  unifying them isn't a small mechanical extraction — the safer route, if ever
  worth it, is verifying `batchTick`'s closed form specializes correctly to
  `n=1` and having `tick` call it as a special case. Bigger and riskier than it
  looks; not a quick win.
- **Store monolith + duplicated initial state.** `useGameStore.ts` (~1.8k lines)
  holds engine-adjacent offline sim/priming (~lines 220-672) that could move to
  `lib/offline.ts`; the initial-state literals (familiarity/seen/recipe ids —
  `partyTactics` is now deduped via `worldCodec`'s exported `DEFAULT_PARTY_TACTICS`)
  are still duplicated verbatim between the store initializer and `resetSave` →
  extract `INITIAL_*` factories.
- **Per-weapon elements / dual-wield.** Attack element is simplified to "mainHand
  wins" (one element per unit, `lib/stats.ts`). The richer model: a fire mainHand +
  frost offHand each strike with their own element on their own cadence — needs real
  dual-wield support (separate attack timing) first.
- **Save robustness / codec dedup.** `combatStatsCodec.byUnit` is documented to
  "migrate to {}" but has no `migrate`/backfill (needs discussion before any
  implementation). The near-identical single-record codecs (codex/combatStats/
  unitStats/unitHistory/sockets) could share a `makeRecordCodec` that also fixes
  the `?? {}` guard drift in one place. (None are `version`-migrated; first
  required-field shape change needs a migration story.)
- **Duplicated UI tables.** `CLASS_ICON` is fixed — `ArmyMatrix.tsx`,
  `ProtoApp.tsx`, and `MonsterLab.tsx` now import the canonical copy from
  `render/appearance.ts` instead of re-declaring it. Still open: `fmt` number
  formatters (SamplingDebug ↔ TallyBreakdown — confirmed NOT byte-identical:
  different rounding precision below 100 and different NaN handling, so this
  needs a judgment call, not a mechanical hoist), `Window`/`WINDOWS`
  (UnitReportSheet ↔ Reports).
- **`src/proto/` buttons mostly lack `aria-label`s (~15% coverage, 174
  buttons).** Fine for a11y today (icon+text usually gives context visually),
  but it's a real testability tax: writing a shell-side RTL test for an
  icon-only control (▲/▼/✕ in `TacticianLens`, etc.) means matching on the
  glyph's exact text content instead of a stable label — brittle if the glyph
  or wrapping ever changes. Worth a light `aria-label` pass on the
  interactive icon-only controls next time one of them needs a test anyway,
  rather than retrofitting the whole shell at once.
- **Vision cache global-state dependency.** The per-turn `visibleEnemiesOf` memo
  (`spatial.ts`) is process-global and correct only because one battle is stepped at
  a time. If concurrent/interleaved battle stepping is ever added, key it on battle
  identity or it can collide on `self.id`.
- **Latent type trap.** `StatModifiers.acc` is tracked/shown but never rolled in combat.
- **Magic-number literals worth centralizing.** `380ms` token/cam transitions vs
  `ROUND_MS` (`BattleView`), the `300`ms double-tap window duplicated across
  `ProtoStage`/`ProtoApp`'s tap handlers, and engine tuning literals (taunt
  `+10%`, "arrived" radius `0.6`, summon fan-out offsets). Name them where it
  reduces drift risk (plan-layer knobs belong in `engine/tuning.ts`).
- **Content orphans (keep-for-future vs remove).** `earth-bolt` skill (defined in both
  registries, equipped by nothing); `versatile`/`calm` traits (unreferenced); element
  id scheme inconsistency (a `lightning` *trait* exists but items use `wind`, e.g.
  "Spark Knife" `element:'wind'`). Decide and either wire up or delete.
- **React index keys.** eventLog / battle-trace / status rows keyed by array index;
  fine while append-only, but a prepend/trim would reuse wrong rows.

## Performance (large-battle render & engine)

Tick-cadence, LOD, and compositor-transform work already shipped is
documented in CLAUDE.md → *Combat view* and gated by `Cadence.test.ts` /
`map-perf-envelope.test.ts` / `tick-cadence.test.ts`. Past investigations
(root causes found, approaches tried and abandoned) are archived in
`performance.md` — check it before re-chasing an old jitter/lag report.

Open items:

- **Knockback reads as a lurch — it's a discrete multi-cell teleport.** Arrow
  Shower (`knockback: 3`) jumps a target up to 3 cells in one round; the
  renderer has no notion of distance, so it glides that jump over the same
  `--seg-ms` as a ~0.45-cell walk step → ~7× apparent speed for one segment,
  then a crawl. Two options: (a) **engine** — spread the push across the
  `timeScale` sub-rounds like retreat (`RETREAT_SPEED_MULT`); lowest visual
  risk but breaks byte-identical snapshot replay (needs a snapshot version
  bump + replay regen). (b) **render-only** — per-token distance-aware
  duration or an ease-out timing fn for knocked tokens; no determinism risk,
  but must not also slow-glide respawns/camera-retargets (gate on the round's
  `knockback` events).
- **Boost Agility "slow-fast" is render-side, not a movement change.**
  `agi-up` adds `spd:6`, which doesn't feed `moveSpeedOf` (only
  `moveSpeed`/`moveSpeedMult` status mods do) — so travel distance is
  unchanged. It reshuffles turn order (SPD-desc re-sort) and `onAttackBeat`
  cadence instead, which the fixed-duration glide used to amplify; the
  adaptive-cadence fix (`--seg-ms`) dampens it. If it still reads rough, the
  lever is `enforceSeparation` adding a shove on top of the move each round —
  already `÷ timeScale`'d; further smoothing would be a separation-resolution
  change, not a render one.
- **Fold in stray glide artifacts if they read wrong.** World-anchored floats
  (fixed world point) and one-shot AoE/hit/spawn/rally rings still snap on
  mount instead of riding a compositor glide (harmless today — short-lived,
  not unit-anchored).
- **Round-boundary reconcile** — the remaining long-tasks are the per-round
  React re-render of 50+ tokens. Next ceiling if more headroom is needed:
  fewer per-token DOM nodes, or a value-mirror memo (a naive `React.memo` on
  `BattleChip` doesn't work — the engine mutates combatant objects in place,
  so `prevProps.c`/`nextProps.c` are the same object reference; a correct memo
  needs every displayed mutable field passed as primitive mirror props plus a
  value-comparing custom comparator).
- **Phase 4 — run the sim in a Web Worker.** The highest ceiling, the most
  work. BSNAP tokens already make a battle worker-portable. Would decouple
  render cadence from sim cost (the root of residual cadence jitter under
  main-thread stalls) but would NOT fix the knockback lurch above (a
  render-side distance issue). Only reach for it if the render-side levers
  above aren't enough — on-device profiling found the engine is ~1% of wall
  clock even at 15 heroes / 34 enemies, so this is a ceiling for much higher
  entity counts, not today's bottleneck.
- **Spatial hash for zone-membership & spawn-separation — intentionally NOT
  done.** The hash is a round-start snapshot; `addCombatant`/`spawnSummons`
  add combatants mid-round, deliberately invisible to it (the established
  deterministic baseline). `zoneMembers` and spawn `enforceSeparation`
  brute-scan precisely to catch those mid-round additions — routing them
  through the round-start hash would silently drop summons from zones / let
  spawns stack, breaking byte-identical replay. Revisit only with an
  incrementally-maintained hash (insert on `addCombatant`), which would also
  change mid-round-summon vision/targeting — bigger than the win justifies at
  current scale (zone scans guarded by `state.zones.length === 0`; spawns are
  ~1 per 30 ticks).

An on-device profiling probe (branch `claude/battlefield-perf-profiling-f5xg6s`,
unmerged, throwaway) found real-phone lag is round-boundary reconcile/paint,
not engine AI or React render — see `src/engine/profile.ts`'s pattern if this
needs re-running (determinism-neutral: phase-mark timings via an ambient
profiler). What shipped from it: PR #55's finer `ROUND_TIME_SCALE=6`
tick-every-tick pacing with density-adaptive backoff. If revived, re-cut
`profile.ts` off `main` rather than merging the throwaway branch wholesale.

## Graphics / visual evolution (art direction)

Direction: Unexplored-style flat-vector "paper cutout" (procedural SVG, not a
pixel tileset or bitmap atlas) — see CLAUDE.md → Combat view → *Skinning
seam* and `src/render/CLAUDE.md` for the shipped foundation
(`appearance.ts` resolver, `skins.tsx` bodies, the `paper` skin). Open work:

### Asset discoverability + gallery + procgen wiring

Every prop self-declares mapgen `kinds` + `playerSelectable`/`tags`
(`PROP_META` in `render/props.ts`), and `render/assets.ts` `listAssets()` is
the single discoverable catalog. Next slices (build on the catalog, not new
registries):

- **Dev asset gallery** (`?gallery=1` extension or new `?assets=1`) — every
  `listAssets()` entry as a searchable/filterable swatch, with multi-select +
  "copy names" for bulk feedback.
- **Procgen option wiring** — expose per-recipe knobs (scatter density,
  `ScatterKind` weights, biome) as tunable MapSpec params in `?mapgen=1`.
- **Player-selectable assets** — `playerSelectable` is wired but nothing's
  flagged `true` yet; designate candidates (banner crest? building style?)
  and build the picker.
- **More building looks** — the timber-house/half-timbered palette families
  are authored but unwired; add `BUILDING_LOOKS` entries so Prontera has >3
  building types.

### Asset placement tags — phased scatter richness

Weighted/theme-filtered scatter placement, density-field blue-noise, and
edge/understory features are shipped (schema in `render/props.ts`: `weight`/
`themes`/`role`/`near`/`avoid`/`rotate`/`clusterWith`). Every phase must
EXPOSE tunable dials and land as an isolatable pass reviewable in
`?mapgen=1` — the per-pass RNG streams already support toggling one behavior
at a time.

- **Phase 4 — paths / trails.** Two layers, function-first:
  - *Intra-map trail (render/scatter slice):* a `desire-path` nav edge → a
    walkable `dirt`/`road` ribbon across the field, props giving it a berth
    (`avoid: ['path']`); reuses the inked `cobble()`/paving. A `scatter`/
    paving pass like the others (own stream, dials, skippable in `?mapgen=1`).
  - *Inter-map connectivity (the bigger idea):* paths are for traveling
    between map LOCATIONS, so a path is an edge in the overworld graph
    surfaced on the tile. A generated map may bake with a connecting path
    (its `pois`/portals wired to a road reaching the map edge toward the
    neighbour) or without one. When absent, offer to ADD one to an existing
    map — a player-driven "build a road" action (quest reward,
    settlement/map development sink): re-bake or overlay a path pass
    connecting two portal POIs. Ties into inter-map adjacency + the
    interactables/dynamic-barriers work. Save = still seed+params (+ a
    "roads built" set), never the baked spec. Sequence AFTER the intra-map
    trail primitive exists.
- **Phase 5 — per-material surface texture** (finer surface-plane paint
  feeding distinct washes/patterns per `SurfaceMaterial`).

**Asset-coverage gaps** (checklist — confirm against the live `?workshop=1`
theme-coverage table, which is the source of truth, before working one):
desert / volcanic / arcane have NO props at all (total cross-theme fallback);
plains / forest / mountain have no edge/ribbon prop; beach / water are thin
(edge-only — no cluster/accent, few kinds); `understory` is forest-only.
Filling one = tagging (or authoring) a prop in `PROP_META` (`props.ts`) with
that theme + role.

### Remaining visual polish

- **Team-tint restyle to the paper palette** is still open (ground biomes /
  paper-skin work landed without it).
- **Blood-splatter decals** — a bounded ring buffer of ~64 tiny divs on
  damage events; a canvas layer only if they should accumulate indefinitely.
- **City tile catalog polish** — per-theme roof/wall palettes
  (desert/haunted), crenellated city-wall rim, grass-tuft/dirt inking on the
  yards, lamps/banners lining streets (needs the recipe to place them), and
  NPC/merchant placement reading the spec's semantic plane.
- **If licensed/bespoke art ever lands** — `Appearance.spriteId` is the
  reserved hook: a sprite skin is just another `TOKEN_SKINS` entry mapping to
  an atlas, falling back to `paper`/`circle` when absent.

### Monster idle / breathing loop — extensions

The `idle: 'breathe' | 'sway'` mechanism (LOD-gated, seeded per-unit) is
shipped, `thiefBug` first. Still open:

- *Dedicated many-idlers probe* — `?perf` never idles (dense → far-LOD), so
  the worst case (≤`LOD_TOKEN_COUNT`=16 on-screen tokens all breathing at
  close zoom) is bounded but unmeasured; an `e2e/idle-probe.spec.ts` off
  `dense-probe` with `?lod=on` forced would pin the number.
- *Alternate/occasional idles* (claw-clack, tail-twitch) layered over the
  breathe, and a `bob` keyframe for floaters (wraiths, sprites).
- Retro-tag the existing bestiary (wolf ribcage breathe, slime core wobble,
  mandragora frond sway…) — each is a one-line `idle:` tag now.

### Monster asset pipeline at scale

The `?riglab=1` quadruped prototype establishes a parameterized joint tree,
z-aware layered preview, pose clips, direct touch editing, local persistence,
and share/import JSON. Open production work, in leverage order:

1. *Prove a second family* — adapt the humanoid reference (or a segmented body)
   to expose assumptions accidentally baked into `quadruped-v0`; only then
   freeze/version the producer schema and add template migration.
2. *Choose the runtime seam with measurements* — either compile a rig draft to
   the existing lean `BodyPart[]` + CSS tags, or add a LOD-gated rig skin and
   compare it on `skin-ab`. The lab's continuously sampled SVG is an authoring
   preview, not the battle delivery model.
3. *Choose skin attachment data* — procedural primitives vs producer-owned flat
   paths weighted to bones (likely a hybrid), while preserving palette roles,
   merged far-LOD silhouettes, deterministic output, and bounded path counts.
4. *Golden regression for the shared renderer* — one skins.tsx tweak restyles
   every creature; a vitest SNAPSHOT of each body's rendered svg markup (per
   shape, one pose) rides `npm run ci` and names exactly which creatures a
   change touched (pixel goldens don't fit ci — Playwright isn't in it).

### Sprite / detailed-background roadmap (2026-06 analysis, still governing)

Original goal: replace circle tokens with animated sprites, and the flat
tint arena with a detailed background. Paper skin substantially delivered on
the "detailed background + expressive token" goals via procedural SVG rather
than sprite atlases (no licensing/resolution/texture-memory questions). The
render architecture is DOM + CSS-`transform`: **keep per-round motion on
`transform` (compositor-only) and keep idle tokens from continuously
repainting** — that's what makes the current renderer fast, and the easiest
thing to accidentally throw away.

Still open, in cost order (measure with the `perf`/`jerk`/`many-entities`
harnesses, which separate engine vs render cost):

- **Frame-animated sprites (idle/walk/attack)** would be the real new
  bottleneck if pursued via CSS `steps()` + `background-position` — repaints
  every animation frame even standing still. Gate any such per-frame
  animation behind the existing LOD (`LOD_CAM_SIZE`/`LOD_TOKEN_COUNT`) if
  built, same pattern as the monster idle/breathing loop.
- **Only if the mob itself must animate at scale → port the arena to WebGL
  (PixiJS).** The engine is pure and substrate-agnostic (it emits positions;
  it knows nothing about divs), so a Pixi stage could batch thousands of
  animated sprites into a few draw calls — something DOM can't do — leaving
  engine/store/tick loop/snapshots untouched. Keep text/UI (floating numbers,
  HP bars, cast labels, the detail sheet) as a DOM overlay on top. Don't pay
  this complexity until LOD-gated DOM animation demonstrably isn't enough.

## Heuristic shortcuts

- `HERD_BIAS = 4` — residual left-tax for path side-picking. The plan
  `corridor` (M3) now herds waypoint travel; the residual only matters for
  combat-approach `moveToward` in encounters (no waypoint). Retirement was
  probed in M3 with no clear win — kill it only with a corridor-style hint
  threaded into the approach path too.
- **Magic focus `range` stat** — rod / wand / staff carry `range` to make
  casters ranged in the engine. Class (Mage / Cleric) should set this, not
  weapons.
- **`MAX_UNIT_TACTICS = 4`** — caused awkward swap-outs (Lyra lost `nimble`
  for `flanker`). Bumping to 5–6 might be more honest now.

## Data / spec drift

- **Crafted equipment never reaches the real equipment array.** The
  drops→recipes chain itself works — several recipes already consume
  `drop-*` monster drops alongside starter `m1`–`m4`/`craft-*` materials, and
  equipment-category recipes' `outputItemId`s (`eq-shortsword`, `eq-leather`,
  …) are real defs in `equipment.ts`. The actual bug: `craft()`
  (`useGameStore.ts`) unconditionally writes every recipe's output into
  `miscItems` — it never branches on `recipe.category === 'equipment'` to
  grant it into the real `equipment` array — so a crafted sword sits in
  Misc as an inert material, unequippable. Likely a small, scoped fix.
- **No save migrations** — recent INITIAL_UNITS overhauls, new skills, new
  equipment fields (range on rod/wand/staff) would invalidate any saved
  state if persistence assumptions change without a migration story.

## Verification gaps — spot-check until codified

Behaviors not covered by automated tests; apt to regress silently. Run
through after relevant changes (or before any release-worthy commit),
then promote to a real test once stable.

**Combat view** (after `BattleView.tsx` / render changes):

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

**Plan-layer tuning** (the ⏱ knobs + POSTURES rows in `src/engine/tuning.ts`
were chosen analytically, not by play — each needs a human-QA pass; watch the
Debug tab's Plan panel while judging, it shows the exact numbers the AI is
acting on):

- **Posture spread reads on screen** — same hero, same fight, three
  postures: bold should *visibly* stand its ground under fire where wary
  visibly stands off / disengages, with steady between. If you can't tell
  them apart in 30 seconds of watching, widen `exposureW`/`blinkGain` gaps.
- **`travelBudget` (the toll-ring judgment)** — order a hero through a ring
  of ranged monsters ('avoid'). Look for: plowing that reads reckless (HP
  bar visibly chunks past ~⅓) → budget too high; clearing-first when the
  crossing would obviously have been cheap → too low; per-posture: bold
  plows what steady clears.
- **`TRAVEL_CLEAR_EXIT` (hysteresis)** — during a clear-first fight, the
  hero must NOT flip march↔fight repeatedly as ring monsters die (watch the
  ⚔ clearing flag in the Plan panel); one flip back to marching, total.
- **`exposureW` at steady** — a kiter with two equally-good firing spots
  should drift to the less-covered one, but must NEVER refuse to fight
  (hiding out of its own range = weight too high).
- **`blinkGain`/`BLINK_WALK_MIN` (cornered feel)** — chase a blink mage into
  a dead-end: it should shuffle briefly (not instantly panic-blink on first
  contact) and jump BEFORE taking more than a couple of hits. Blink wasted
  on an open-field retreat = cornered test too loose.
- **`GAP_W`/`KITE_DEAD_BAND` (hold feel)** — a kiter at its ring must stand
  visually STILL (no 1-cell shuffling each round), yet re-close promptly
  when its target backs away.

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
