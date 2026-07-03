# Procedural map generation (`src/mapgen/`)

The generator scaffold. Idea inventory: `procedural-generation-ideas.md` (repo
root — §refs below point there). This doc is the working contract: locked
decisions, the layer stack, the hooks left open, and where each future phase
plugs in. Keep it terse and accurate.

## What this is (and isn't yet)

A **pure, deterministic, leaf library** (same discipline as `src/engine/`): no
store, render, game-state, RNG, or time imports. It bakes a **MapSpec** — four
planes over one shared substrate — and validates it. Two recipes ship — `field`
(overworld, field-first) and `dungeon` (graph-first) — plus the stamp/vault
registry; city, locks, interactables, naming are *reserved seams*, not code.
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
| `recipes/dungeon.ts` | the graph-first, donjon-flavored dungeon: scattered polymorph rooms (closet→hall size table, L/T composites, cave-notch erosion) → cyclic corridor graph → errant door-to-door corridors + dead-end stubs → **maximal-rect cover** of the solid mask (free-form floor, rects-forever collision; ~30–60 rects): lab/encounter only until the pather perf pass |
| `stamps.ts` | `STAMP_REGISTRY` — authored MapSpec fragments placed by constraint (§I): pillar-vault, shrine, barred-cell (its vault is `optional`-tagged — the §J pocket and phase 4's lock-and-key test case) |
| `profile.ts` | `tacticalProfile` — the §L self-description shared by every recipe's semantic pass |
| `recipes/index.ts` | `RECIPE_REGISTRY` (`city` = road-first: reserved) |
| `adapter.ts` | the ONLY cross-boundary file: `specBarriers` (→ engine), `generateForLocation` (→ store) |

Consumers today (phase 2): `createOpenBattleFor` (store) honors
`Location.mapGen` via `generateForLocationCached` (pure generation + static
params → a session cache that never invalidates), and `terrain.tsx` reads the
spec's **surface plane** (material regions → organic washes via
`maskLoops`→`decimate`→`wonk`→`blobPath`; shallow-under-deep gives the
two-band water read), **scatter plane** (abstract kinds → biome prop
archetypes, `KIND_ARCHETYPE` — kinds never prop ids), and **materials**
(deep-water rects vanish under the lake wash; hedges paint foliage). First
live location: **`mirror-vale`** (96×96 field, cap 30). The lab explores with
`maxBarriers` 24; `generateForLocation` pins live maps to **16** (the
benched pathing envelope, gated in `map-perf-envelope.test.ts`).

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

1. ✅ **Scaffold**: pipeline, field recipe, validation, lab, seams.
2. ✅ **Render consumption** — terrain reads surface/scatter/materials;
   `mirror-vale` live; barrier budget pinned to the perf envelope. Left for
   later polish: landmark POI → big silhouette prop, richer water treatment
   (ripple props, ford highlight), spec-aware minimap.
3. ✅ **Dungeon recipe (graph-first, donjon-flavored)** — cyclic room graph
   (function-first: `layout` publishes nav nodes/edges + exact `doorAt`
   pinches, `carve` covers the solid mask with maximal rects), scattered
   polymorph rooms, errant corridors, dead-end stubs, stamp registry, lair +
   depth gradient, optional-POI reachability exemption. Left for later:
   1-wide labyrinth corridors (needs sub-cell pathing care), symmetric
   layouts, a cavern recipe (erosion-first), remove-deadends knob, live
   dungeon location (needs the pather pass).
4. 🟡 **Lock-and-key + proficiency gates — FOUNDATION SHIPPED, FEEL OPEN.**
   Mechanics are built and machine-gated (see the phase-4 section below);
   frequency, rewards, and surfacing need human play + iteration before any
   live location adopts gates.
5. **City recipe (road-first)** + inter-map coherence (§G adjacency/depth
   gradients) + naming/premise (§M — fill `semantic.premise`, never prose).
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

A `Lock` (semantic plane) names what opens it — today only `kind:
'proficiency'` is placed. The deploying party's tags
(`src/lib/proficiencies.ts` → `partyProficiencyTags`, class-based today) flow
in as `GenParams.proficiencies`; the dungeon's `gates` pass claims a dead-end
room, drops a prize POI tagged `locked:<id>`, a `gate` POI at the door pinch,
and — only if the party LACKS the tag — a sealing plug whose material follows
the tag (might=rubble, arcane=rune-sealed cut-stone, perception=bare rock
"hidden door", mobility=see-across chasm). **Variant-at-deploy, resolved once
at battle stand-up** — no dynamic barriers, no engine change; same seed ×
different party = a different playable map.

### What the validator GUARANTEES (don't re-litigate by eye)

- closed ⇒ every gated POI genuinely unreachable (no leaky seals);
- open ⇒ every gated POI reachable (the kit actually paid off);
- the gate site is approachable (the party can walk up and see the door);
- spawn/portal/lair are never gated (never gate the critical path);
- variants are byte-deterministic per (seed, sorted kit).

### What ONLY human play can judge (the open iteration)

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
5. **Field-recipe gates** — a ford revealed by mobility, a cliff shortcut:
   same machinery, different recipe; nothing placed yet.
6. **'key' and 'switch' lock kinds** — reserved shapes; need item plumbing /
   phase-6 interactables.

### How to iterate (the loop)

`?mapgen=1` → recipe `dungeon` → toggle **party kit** tags → the SAME seed
re-bakes with its gate open/closed (lock readout inline; validation panel
shows the `locks` rule both ways). Add a gate archetype = one `GATE_LOOKS`
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
