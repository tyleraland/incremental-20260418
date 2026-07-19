# Procedural map generation (`src/mapgen/`)

The generator scaffold. Idea inventory: `procedural-generation-ideas.md` (repo
root — §refs below point there); **target layer architecture + build-out
tracks: `procedural-generation-architecture-plan.md`** (repo root) — the reorg plan of record: the L0–L9
layer stack, the nav graph as the shared convergence layer with two producers
(authored for dungeon/city, derived for overworld — track B), and the settled
decisions (flat rects stay; the MODERATE barrier envelope LANDED — the P5
re-bench adopted 72 as the live pathing bound; mapgen emits pacing, store
consumes; cross-map manifest is a seam). This doc
is the working contract for what EXISTS: locked decisions, the hooks left
open, and where each future phase plugs in. Keep it terse and accurate.

## What this is (and isn't yet)

A **pure, deterministic, leaf library** (same discipline as `src/engine/`): no
store, render, game-state, RNG, or time imports. It bakes a **MapSpec** — four
planes over one shared substrate — and validates it. Three recipes ship —
`field` (overworld, field-first), `dungeon` (graph-first), `city` (road-first)
— plus the stamp/vault registry and the shared §M premise pass (every bake
names itself + one premise line); interactables and inter-map coherence are
*reserved seams*, not code.
Curated maps and roguelike maps are the
same engine at different knobs: curated = a location pinning `{recipe, seed}`
it liked (reviewed in the lab); roguelike = seeds drawn per run.

## Locked decisions (revisit deliberately, not accidentally)

1. **MapSpec is the contract** (`types.ts`): collision (engine) / surface
   (render) / scatter (render) / semantic (store/AI). Consumers adapt; the
   generator never reaches into them.
2. **Rects forever, two collision kinds** (`wall`/`cliff`), **materials on
   top** — deep water = cliff + `deep-water` material; the engine adapter
   drops materials (§B "one collision, many paints").
3. **Save = seed + params, never the baked spec.** `specVersion` marks breaking
   spec changes; regenerating on load is fine (live battles snapshot their own
   barriers via BSNAP).
4. **Per-pass named RNG streams** (`rng.ts`): inserting/removing/reordering a
   pass never reshuffles its neighbours' randomness. This is what keeps
   generator evolution reviewable — a change diffs one layer, not the world.
5. **Validation is mandatory at bake** (`validate.ts`), named machine-checkable
   rules + reroll/accept/throw policy. Reachability is written to become
   *conditional* (reachable-if-openable) when locks land (§D).
6. **Small fixed vocabularies** (§K): 7 barrier materials, 8 surface materials,
   6 scatter kinds, 7 POI kinds, 8 proficiency tags. Grow one entry at a time.
7. **Fields before features** (⭐1): passes read the shared `FieldBundle`
   (elevation/moisture/roughness), never private noise, so planes agree by
   construction (sand rings the lake because both consulted the same field).
8. **Barrier budget is a pather budget**: open-world routing cost grows with
   rect *count*. The live envelope is **72** (the P5 moderate-envelope
   re-bench, 2026-07: synthetic cost flattens past 64, realistic geometry is
   cheaper than synthetic at equal count; `map-perf-envelope.test.ts` records
   the measurement). Lib default `maxBarriers`=24; the dungeon's 72 default
   is now perf-viable live — adoption is a content decision. The field
   recipe's dials were retuned to SPEND it (2026-07): ~50–53 rects @200²,
   ~27–30 @96², first-attempt valid across the sweep; band pinned in
   `recipe-field.test.ts`.

## Module map

| file | what lives there |
|---|---|
| `../../procedural-generation-architecture-plan.md` (repo root) | the target layer stack + delegation-packet build order (L0–L9), settled reorg decisions, build-out tracks A–G |
| `types.ts` | the universe: MapSpec planes, all vocabularies, GenParams (incl. the reserved `manifest` cross-map seam), report shapes |
| `rng.ts` | `hashString`/`hash01`, `makeRng`, `streamRng` (the stream splitter) |
| `fields.ts` | value-noise fBm; `makeFields` → the shared FieldBundle |
| `draft.ts` | MapDraft + plane helpers (`paint`/`addBarrier`/`addPoi`/`isPlaceable`), `bake`; `draft.scratch` = the derived-planes tier (walk masks, distance transforms — produced by one pass, consumed by later ones, never baked) |
| `graph.ts` | the shared nav-graph layer: ops (`bfsDepth`, `nodeDegrees`) + `deriveRegions` — the DERIVED producer (walk mask → border-aware clearance BFS → erode by pinch width → region components → one `crossing` edge per contiguous pinch, `doorAt` at min clearance; also returns the per-cell `claims` plane) + the track-D flow pair: `flowField` (cell BFS distance over a walk mask, RNG-free) and `digestIntensity` (→ `NavNode.intensity` = anchor-cell distance ÷ map max, rounded to 3 decimals, in [0,1]; disconnected anchor → 0, neutral not maximal, so an off-map pocket can't become the hottest spawn zone). KIT-INVARIANT: recipes feed it the AS-IF-OPEN mask (pre-gate-plugs), so every kit variant publishes identical values |
| `gates.ts` | recipe-agnostic lock-and-key: `placeProficiencyLock` (prize + gate POIs + tag-themed seal plug, resolved against the party kit), `placeShortcutLock` (`gates: []` — locks a ROUTE, not a prize), and `placeKeyLock` (prize + gate + `key` POI, resolved against `params.heldKeys`; seal = bars, `KEY_LOOK`; id = key-lock ordinal, stable across variants because placement is kit/key-invariant). Plugs carry `CollisionRect.lockId` so lock geometry is first-class (solver/validator; the adapter drops it). `GATE_LOOKS`/`GATE_TAGS` |
| `solve.ts` | the solvability layer (the L5 flow seam): the shared occupancy model (`occupancyGrid` + `floodOpen` — validate.ts floods the same reality, re-exporting `occupancyGrid`) and `solveLockFlow` — RNG-free fixpoint over spec-level data (flood from spawn with closed plugs, collect reached `key` POIs, remove their plugs by `lockId`, re-flood) → `{order, openable, blocked}`. Chains resolve; circles/self-seals report blocked. Future consumers: multi-link placement, discovery, planning AI, cross-map manifest |
| `pipeline.ts` | `generateMap(recipe, params)`: pass runner, per-pass streams, skipPasses, bake→validate→reroll |
| `validate.ts` | the coherence harness: bounds / vocab / barrier-budget / spawn+apron / reachable (flood-fill) / intensity (every published `NavNode.intensity` finite and in [0,1]) / graph-truthful (every unlocked/open nav edge connects its endpoints' flood components — anchors in substantial components speak for themselves exactly; only buried/tiny-pocket anchors get a ±4 envelope; `doorAt` open; closed-locked edges exempt) / **key-flow** (every closed `key` lock provably openable per `solveLockFlow` — a missing key, a key behind its own gate, or a circular chain fails the bake) / water-coherence. Re-exports `occupancyGrid` (the shared PAD-inflated rasterizer, hosted in solve.ts) |
| `recipes/field.ts` | the field-first overworld recipe: surface → hydrology (lake+ford) → **river** (P2: descending edge-to-edge channel in a lane beside the spawn apron, 2-wide punched fords — the pinches that become `crossing` edges — 35% dress one as a `road` bridge; explicit `RIVER_DIALS` allotment with `outcropReserve` headroom) → outcrops (`OUTCROP_DIALS`) → **regions** (no-RNG: rasterizes collision → scratch `walk`/`regions` planes → `deriveRegions` publishes real nav nodes+edges, depth rooted at the spawn region) → **flow** (track D, no-RNG: `flowField` on the pre-gates scratch `walk` mask from the spawn → scratch `'flow'` plane + `digestIntensity` onto the nodes — the field's cell-remoteness depth notion, kit-invariant because no plug exists yet) → **gates** (P3: kit-invariant route lock on a redundant crossing + vault lock on natural pockets, `GATE_DIALS`; skipped when `params.gates` is false — the adapter's live default) → semantic (links POIs onto region nodes; falls back to POI stubs when regions is skipped) → **desire-paths** (RNG-free L7 dressing: BFS the UNGATED nav subgraph spawn→portals→landmark, realize each leg on the pre-gates scratch `walk` mask through each edge's `doorAt`, paint `dirt` width 1–2 by the roughness field — zero rect cost, kit-invariant; skips trivial 1-region/no-portal graphs) → scatter (props keep off the trail via the `desire-paths` scratch mask) |
| `recipes/dungeon.ts` | the graph-first, donjon-flavored dungeon: scattered polymorph rooms (closet→hall size table, L/T composites, cave-notch erosion) → **flow** (same track-D digest as the field, on `plan.walk` — entry reads 0, the deep end ~1; complements graph-hop `depth`) → **cycle-as-primitive skeleton** (entry→goal via two axis-split arcs — a real cycle by construction at ≥3 rooms — leaves tree-attached, optional chord for a second loop) → errant door-to-door corridors + dead-end stubs → **maximal-rect cover** of the solid mask (free-form floor, rects-forever collision; ~30–60 rects) → rewrite steps (the `shortcut` pass: a proficiency plug on a mid-arc cycle edge — closed forces the long way around; the `keyfetch` pass: ~0.5 chance, key-locks a SECOND seal-tight dead-end and drops its `key` POI in the deepest room of the proven-ungated subgraph — the doorAt vetted open + clear of other plugs so the OPEN variant survives graph-truthful; every rewrite decision is KIT/KEY-INVARIANT: budgets count as-if-all-locks-closed so an open kit or held key only ever removes seal geometry): lab/encounter only until the pather perf pass |
| `recipes/city.ts` | the road-first town: plaza + jittered gate roads + cross-street loops (nav skeleton FIRST) → paving (ground → road/stone) → street-fronting building rects (road-distance transform: every house ≥2 cells off pavement, ≤4 from a street) → yard/market scatter → plaza landmark. Generates the STAGE for a city (NPCs/spawns stay store-owned); **live on `prontera-city`** (`data/locations.ts`) — under a tighter budget it just starves to fewer houses. Publishes NO `intensity` (settled: peaceful town, junction nodes — nothing to pace; revisit if cities host combat) |
| `naming.ts` | the §M premise pass shared by every recipe: theme-conditioned place name + ONE-line premise, written LAST so it reads what the bake actually grew (ford / sealed door / lair depth / road count). Scaffold, never prose; describes the map, never steers it |
| `stamps.ts` | `STAMP_REGISTRY` — authored MapSpec fragments placed by constraint (§I): pillar-vault, shrine, barred-cell (its vault is `optional`-tagged — the §J pocket and phase 4's lock-and-key test case) |
| `profile.ts` | `tacticalProfile` — the §L self-description shared by every recipe's semantic pass |
| `recipes/index.ts` | `RECIPE_REGISTRY` — field / dungeon / city. Recipes own the DIVERGENCE layer (noise-first vs graph-first vs road-first, quarantined to production passes); the nav graph is where they converge (`procedural-generation-architecture-plan.md`) |
| `adapter.ts` | the ONLY cross-boundary file: `specBarriers` (→ engine), `generateForLocation` (→ store; pins live maxBarriers 72 (P5 re-bench) and defaults `gates: false` — a live location opts into composition gates via `mapGen.gates: true`), `intensityAt(spec,x,y)` (→ store, track D: containing/nearest node's `intensity`, 0 fallback — the store's open-world trickle weights its spawn-position pick by it and never walks the semantic plane itself) |

Consumers today (phase 2): `createOpenBattleFor` (store) honors
`Location.mapGen` via `generateForLocationCached` (pure generation + static
params → a session cache that never invalidates), and `terrain.tsx` reads the
spec's **surface plane** (material regions → organic washes via
`maskLoops`→`decimate`→`wonk`→`blobPath`; shallow-under-deep gives the
two-band water read), **scatter plane** (abstract kinds → biome prop
archetypes, `KIND_ARCHETYPE` — kinds never prop ids), and **materials**
(deep-water rects vanish under the lake wash; hedges paint foliage). First
live location: **`mirror-vale`** (96×96 field, cap 30; ~28 rects since the
2026-07 dial retune). The lab explores with `maxBarriers` 24;
`generateForLocation` pins live maps to **72** (the P5 moderate-envelope
re-bench, 2026-07, gated in `map-perf-envelope.test.ts`; the field dials now
spend ~52 of it at 200² — still under the bench's 64-rect plateau region).

## Harnesses (the human-validation bottleneck is the design center)

- **`?mapgen=1` lab** (`src/dev/MapgenLab.tsx`, dev-only): a **staged layer
  inspector** — one tab per meaningful STAGE (a group of passes), not per pass.
  Tab 1 is the **Final Map** (every pass, all planes full brightness — the
  deliverable, with the 3×3 seed contact sheet beside it and editable plane
  toggles). Each later tab bakes the recipe **THROUGH** its stage
  (`generateMap` with `skipPasses` = every pass strictly after the stage's
  `throughPass`, so the spec+scratch is exactly the cumulative content up to
  that stage — stream isolation makes the omission byte-clean) and renders
  **cumulative + highlight**: the accreted earlier layers drawn DIM (0.35× via
  `drawSpec`'s `dim` set) with THIS stage's OWNED structure at full brightness
  on top. You watch the map accrete stage by stage. Stage tables (`STAGES` in
  the lab) are derived from each recipe's real pass ids (`assertStages` warns in
  dev on drift): FIELD → Final · Surface · Geography · Nav Graph + Flow · Gates +
  Secrets · Dressing; DUNGEON → Final · Layout · Carve · Gates + Secrets ·
  Dressing; CITY → Final · Roads · Buildings · Dressing.
  - **Modular influence**: a persistent TOP BAR carries the cross-cutting params
    (recipe / size / seed / themes / gates / party-kit); each layer tab surfaces
    the **pass-skip checkboxes for its own stage**. A manual skip composes
    (union) with the auto-skip-later-passes, so unchecking `river` on Geography
    drops it there AND on every downstream tab — that IS the "influence at each
    modular level" lever. Auto-skipped later passes are listed muted per tab.
  - Surfaces the DERIVED structure, not just the four baked planes:
    a **graph** overlay draws `spec.semantic.nav` (nodes heat-colored by
    `intensity`, labeled `d<depth> i<intensity>`; edges through their `doorAt`
    pinch; locked edges dashed + tagged from `spec.semantic.locks`), plus the
    cell-resolution scratch planes — **regions** (claims tint), **flow** (the
    BFS distance-to-spawn heatmap = full-res `intensity`), **paths** (the
    desire-path mask), **walk** (the occupancy mask). Each tab's owned/dim sets
    pick from these; the Final tab lets you toggle them freely.
  - The scratch planes ride `GenResult.scratch`, attached ONLY when the lab
    passes `debug: true` (GenParams). Never baked/serialized — determinism-
    neutral (pinned in `pipeline.test.ts`: `debug` bakes an equal spec).
    Skipping a producing pass (`regions`/`flow`/`desire-paths`) just empties
    the matching overlay — reading an absent scratch key draws nothing.
  - The **validation report** shows always (it runs on the through-stage spec);
    **pass notes** filter to the passes at/before the stage on a layer tab.
  - A **showcase preset row** jumps to curated verified seeds (river+fords,
    gated crossing, intensity gradient, desire paths, secret vault, cyclic
    dungeon, living city); a preset sets the params and lands on the **Final
    tab**, opened on its illustrative overlays. A **gates** toggle + party-kit
    (both persistent) + preset-driven portals extend the influence levers; the
    Gates + Secrets tab is where you toggle the kit and watch locks open/close.
- **Fuzz gate** (`src/__tests__/mapgen/recipe-field.test.ts`): every sweep seed
  must bake valid; themed sweeps assert features actually fire (lakes form).
  Widen the sweep before widening a recipe's ambition.
- **Contract tests**: pipeline determinism + stream isolation
  (`pipeline.test.ts`), one crafted violation + fix per rule
  (`validate.test.ts`), engine smoke through the adapter (`adapter.test.ts`).
- Passes `note()` everything they cap or drop — no silent truncation; notes
  surface in the lab and in `GenResult.notes`.

## Phase roadmap (each ships something; catalog "prototyping order")

1. ✅ **Scaffold**: pipeline, field recipe, validation, lab, seams.
2. ✅ **Render consumption** — terrain reads surface/scatter/materials;
   `mirror-vale` live; barrier budget pinned to the perf envelope. Left for
   later polish: landmark POI → big silhouette prop, richer water treatment
   (ripple props, ford highlight), spec-aware minimap.
3. ✅ **Dungeon recipe (graph-first, donjon-flavored)** — cycle-as-primitive
   room graph (function-first: `layout` builds entry→goal arcs — a real cycle
   by construction — publishes nav nodes/edges + exact `doorAt` pinches,
   `carve` covers the solid mask with maximal rects), scattered polymorph
   rooms, errant corridors, dead-end stubs, the `shortcut` rewrite step
   (route-locking a mid-arc cycle edge, kit-invariant), stamp registry, lair
   + depth gradient, optional-POI reachability exemption. Left for later:
   more rewrite steps (multi-link key chains — single-link `keyfetch`
   shipped; the solver already handles chains), 1-wide labyrinth
   corridors (needs sub-cell pathing care), symmetric layouts, a cavern
   recipe (erosion-first), remove-deadends knob, live dungeon location
   (needs the pather pass).
4. 🟡 **Lock-and-key + proficiency gates — FOUNDATION SHIPPED, FEEL OPEN.**
   Mechanics are built and machine-gated (see the phase-4 section below);
   frequency, rewards, and surfacing need human play + iteration before any
   live location adopts gates.
5. 🟡 **City recipe (road-first) + naming/premise — SHIPPED, first live city
   landed; inter-map coherence open.** `city` bakes plaza/roads/buildings (fuzz
   gate: `recipe-city.test.ts`); the shared `premise` pass fills `semantic.name`
   + `semantic.premise` for every recipe (gate: `naming.test.ts`; surfaced in
   the lab and both location-detail panels — Reports/offline surfacing is
   BACKLOG). **`prontera-city` is live** (50×50, `mapGen: {recipe:'city'}`):
   `src/render/buildings.ts` draws the cut-stone/wood wall rects as paper-cutout
   buildings, `terrain.tsx` paints cobbled/flagstone/dirt washes. Still open: §G
   inter-map adjacency/depth gradients as first-class, NPC/merchant placement
   reading the spec's semantic plane (today they're hand-placed on the plaza),
   premise → Reports/event-log wiring.
6. **Interactables / dynamic barriers** — the one invariant-breaker (snapshot
   replay must survive it); gated behind everything above (§E).

Consuming-AI dependency (⭐10): map features and the tactics that use them
(hold-chokepoint, use-cover) ship as pairs — see BACKLOG → AI & coordination.

## Phase 4 — lock-and-key + proficiency gates (foundation)

**Status: the mechanics are DONE and machine-verified; the FEEL is not.**
Everything below the "guarantees" line is a first guess that needs human play
before a live location turns gates on. This section is the handoff for that
iteration.

### How it works (one paragraph)

A `Lock` (semantic plane) names what opens it — `kind: 'proficiency'` and
`kind: 'key'` are placed today. The deploying party's tags
(`src/lib/proficiencies.ts` → `partyProficiencyTags`, class-based today) flow
in as `GenParams.proficiencies`; the dungeon's `gates` pass claims a dead-end
room, drops a prize POI tagged `locked:<id>`, a `gate` POI at the door pinch,
and — only if the party LACKS the tag — a sealing plug whose material follows
the tag (might=rubble, arcane=rune-sealed cut-stone, perception=bare rock
"hidden door", mobility=see-across chasm). **Variant-at-deploy, resolved once
at battle stand-up** — no dynamic barriers, no engine change; same seed ×
different party = a different playable map. Key locks (`placeKeyLock`, the
dungeon's `keyfetch` pass) resolve identically against `GenParams.heldKeys`
and add a `key` POI on the ungated subgraph — the fetch detour is baked, the
pickup play-flow is not (phase 6).

### What the validator GUARANTEES (don't re-litigate by eye)

- closed ⇒ every gated POI genuinely unreachable (no leaky seals);
- open ⇒ every gated POI reachable (the kit actually paid off);
- the gate site is approachable (the party can walk up and see the door);
- spawn/portal/lair are never gated (never gate the critical path);
- every closed key lock is solvable (`key-flow` rule ← `solveLockFlow`: the
  key is acquirable without passing its own lock; chains fixpoint, circles fail);
- variants are byte-deterministic per (seed, sorted kit, sorted heldKeys).

### What ONLY human play can judge (the open iteration)

0. **Puzzle-SOLVING is not built — today's gates are a static kit check.**
   The resolved model (variant-at-deploy) asks only "does the party HAVE the
   tag"; the intended end-state is the party actively working the puzzle, and
   none of that flow exists yet:
   - **Discovery**: clues on the map the party must notice before a gate is
     even known (a perception sweep near the hidden door, a legible rune) —
     plausibly a function of INT/knowledge stats and time spent, not a boolean.
   - **Key logistics**: the BAKE side exists (key locks, `key` POIs, the
     `heldKeys` param seam, `solveLockFlow` proving chains) — what's missing is
     the STORE side: tracking found keys, the pickup play-flow, feeding
     `heldKeys` at deploy. Multi-link chains are solver-supported but no pass
     places them yet (recipe v1 is single-link).
   - **Planning AI**: the autobattler must route the party THROUGH the chain —
     "fetch the key from the east room, then open the rune door" — which needs
     the §E objective-channel AI (AI targets non-combatant objectives; an
     equippable "work the gate" tactic) layered on the team planner.
   The bake-time variant model was chosen precisely so this can grow UNDER it:
   discovery/keys/planning can resolve locks at PLAY time later (via
   interactable-style state or staged re-bakes) without invalidating the Lock
   vocabulary, the validator's guarantees, or any placed content. Treat the
   current model as the floor, not the design.

1. **Frequency & placement feel** — one gate per floor, dead-ends only,
   uniform tag pick: all first guesses. Too rare and kits never matter; too
   common and it's a checklist. Tune in `gatesPass` (`recipes/dungeon.ts`).
2. **Rewards** — the prize is an annotation (`vault` POI, `prize` tag). The
   store consumes NOTHING yet. §F wants incremental-native rewards
   (familiarity/xp/loot multipliers, fewer casualties), not just chests —
   that's store work, keyed off the POI tags.
3. **Surfacing** — nobody tells the player "Shae's perception found a hidden
   door." §M says this is the cheapest emergent-story source; aim it at
   Reports / the event log when a battle stands up with an open lock.
4. **Party-change semantics** — gates resolve ONCE at stand-up; heroes joining
   later don't re-resolve (documented in `adapter.ts`). Revisit when a live
   location has gates: re-resolve on reconcile? announce missed gates?
5. **Field-recipe gates — LANDED (P3).** The field `gates` pass route-locks a
   redundant derived crossing via the same `placeShortcutLock` the dungeon
   uses (ford → mobility/deep-water with the plug's surface repainted deep so
   the seal renders; bridge → might/wood; dry gap → might/rock, reserved) and
   vault-locks natural degree-1 pocket regions (perception — none derive on
   today's geography; synthetic-tested). **Live locations bake with gates OFF
   until they opt in via `mapGen.gates: true`** (adapter default — this
   phase-4 feel iteration is exactly why). `GATE_DIALS` in field.ts.
6. **'key' lock kind — PLACED/VALIDATED/VISUALIZED** (`placeKeyLock`, the
   dungeon `keyfetch` pass, the `key-flow` rule, the lab's 🗝 + held-keys
   toggle); store-side pickup is phase 6. Fire rate is low (~4%/floor — the
   `gates` pass usually claims the lone dead-end): a feel knob, tune with
   frequency (point 1). **'switch'** stays a reserved shape (needs phase-6
   interactables).

### How to iterate (the loop)

`?mapgen=1` → recipe `dungeon` → toggle **party kit** tags (or a **held key**
— key locks list per-bake checkboxes) → the SAME seed re-bakes with its gate
open/closed (lock readout inline; validation panel shows the `locks` and
`key-flow` rules both ways). Add a gate archetype = one `GATE_LOOKS`
entry (+ a material vocab entry if needed); add a tag source = extend
`getProficiencyTags` (extension points documented in the file); add a lock
kind = extend the `Lock` union + teach `validate.ts` its openability.
`locks.test.ts` pins every guarantee above — extend it with each change.

## Adding to the generator

- **New pass**: object `{id, run(ctx)}` into a recipe's `passes`. Draw
  randomness only from `ctx.rng(name)`; read substrate from `ctx.fields`;
  write via `draft.ts` helpers; `note()` what you drop. Add a fuzz-gate
  assertion that the pass's feature actually fires.
- **New recipe**: compose passes, register in `RECIPE_REGISTRY`. The
  bake/validate tail is free.
- **New vocabulary entry**: add to the const array in `types.ts`; if it's a
  barrier material, map its collision kind in `validate.ts` `MATERIAL_KIND`;
  give the lab a debug color.
- **New validation rule**: named `rule(id, ok, detail)` in `validate.ts` + a
  crafted violation/fix pair in `validate.test.ts`.
