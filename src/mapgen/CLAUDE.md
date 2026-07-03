# Procedural map generation (`src/mapgen/`)

The generator scaffold. Idea inventory: `procedural-generation-ideas.md` (repo
root — §refs below point there). This doc is the working contract: locked
decisions, the layer stack, the hooks left open, and where each future phase
plugs in. Keep it terse and accurate.

## What this is (and isn't yet)

A **pure, deterministic, leaf library** (same discipline as `src/engine/`): no
store, render, game-state, RNG, or time imports. It bakes a **MapSpec** — four
planes over one shared substrate — and validates it. Today one recipe (`field`)
proves the layers compose; dungeon/city recipes, stamps, locks, interactables,
naming are *reserved seams*, not code. Curated maps and roguelike maps are the
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
   rect *count* (store `BARRIER_CAP`=16). Default `maxBarriers`=24 — any recipe
   spending near it needs a perf pass before a live location adopts it.

## Module map

| file | what lives there |
|---|---|
| `types.ts` | the universe: MapSpec planes, all vocabularies, GenParams, report shapes |
| `rng.ts` | `hashString`/`hash01`, `makeRng`, `streamRng` (the stream splitter) |
| `fields.ts` | value-noise fBm; `makeFields` → the shared FieldBundle |
| `draft.ts` | MapDraft + plane helpers (`paint`/`addBarrier`/`addPoi`/`isPlaceable`), `bake` |
| `pipeline.ts` | `generateMap(recipe, params)`: pass runner, per-pass streams, skipPasses, bake→validate→reroll |
| `validate.ts` | the coherence harness: bounds / vocab / barrier-budget / spawn+apron / reachable (flood-fill) / water-coherence |
| `recipes/field.ts` | the field-first overworld recipe: surface → hydrology (lake+ford) → outcrops → scatter → semantic |
| `recipes/index.ts` | `RECIPE_REGISTRY` (`dungeon` = graph-first, `city` = road-first: reserved) |
| `adapter.ts` | the ONLY cross-boundary file: `specBarriers` (→ engine), `generateForLocation` (→ store) |

Consumers today: `createOpenBattleFor` (store) honors `Location.mapGen`
(barriers + arena size from the spec; **no live location sets it yet**), and
the dev lab. `terrain.tsx` consuming surface/scatter is its own phase —
deliberately not stubbed.

## Harnesses (the human-validation bottleneck is the design center)

- **`?mapgen=1` lab** (`src/dev/MapgenLab.tsx`, dev-only): 3×3 seed contact
  sheet (nine maps per glance), focused view with **plane toggles** and
  **per-pass skips** (the layer inspector — stream isolation means skipping a
  pass changes only that layer), validation report + pass notes beside the
  picture. Review recipe changes here first; screenshot for PRs.
- **Fuzz gate** (`src/__tests__/mapgen/recipe-field.test.ts`): every sweep seed
  must bake valid; themed sweeps assert features actually fire (lakes form).
  Widen the sweep before widening a recipe's ambition.
- **Contract tests**: pipeline determinism + stream isolation
  (`pipeline.test.ts`), one crafted violation + fix per rule
  (`validate.test.ts`), engine smoke through the adapter (`adapter.test.ts`).
- Passes `note()` everything they cap or drop — no silent truncation; notes
  surface in the lab and in `GenResult.notes`.

## Phase roadmap (each ships something; catalog "prototyping order")

1. ✅ **Scaffold** (this): pipeline, field recipe, validation, lab, seams.
2. **Render consumption** — `terrain.tsx`/`ARENA_SKINS` read surface+scatter
   (mottles/props become MapSpec consumers); flip one sandbox location's
   `mapGen` on; perf-pass barrier counts (`skin-ab`, `map-perf-envelope`).
3. **Dungeon recipe (graph-first)** — room/corridor graph, **cyclic layouts**
   (⭐4), stamp/vault registry (§I — "highest-leverage single item"), lair POI.
4. **Lock-and-key + proficiency gates** — `Lock` placement, conditional
   reachability in `validate.ts`, `getProficiencies` derive, variants resolved
   at deploy (§F — no dynamic barriers needed).
5. **City recipe (road-first)** + inter-map coherence (§G adjacency/depth
   gradients) + naming/premise (§M — fill `semantic.premise`, never prose).
6. **Interactables / dynamic barriers** — the one invariant-breaker (snapshot
   replay must survive it); gated behind everything above (§E).

Consuming-AI dependency (⭐10): map features and the tactics that use them
(hold-chokepoint, use-cover) ship as pairs — see BACKLOG → AI & coordination.

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
