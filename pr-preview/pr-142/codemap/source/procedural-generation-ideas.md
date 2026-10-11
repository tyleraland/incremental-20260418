# Procedural Map Generation — Idea Catalog

Brainstorm output for a procedural generator producing **overworld fields, dungeons, and
cities** as combat battlefields. This is a *what-to-consider* inventory — the universe of
building blocks, layers, and coherence types we may want — **not** a plan or a how-to.
We'll later treat these as unbuilt blocks to sequence, smash together, and iterate on.

Scope note: **NPCs that live on the map and monster spawns are out of scope** here (owned by
the store, not the map generator).

References mined: Minecraft (shape-before-biome, hydrology, coherent worldgen), Brogue
(never *force* hazard traversal; keep levels explorable), DCSS (vaults / authored fragments
stamped into random layouts), Into the Breach & FFT (tiny tile vocabulary → dense tactics;
height/LoS), [Unexplored / Boris the Brave](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/)
(cyclic generation, abstract lock-and-key, graph-rewrite grammars, biome tags, set pieces),
[RimWorld & Dwarf Fortress storytelling](https://www.gamedeveloper.com/design/rimworld-dwarf-fortress-and-procedurally-generated-story-telling)
(story generator vs world generator, apophenia, narrative ellipsis, consequences with duration).

---

## Two decisions already locked
- **Rects forever** for collision; all curves live in the **paper SVG** render layer on top.
- **Water**: impassable **deep** water reuses the existing `cliff` (see-across) collision;
  **shallow** water is a walkable surface material (crossable ford). No new engine primitive.

## The load-bearing hinge
The engine only needs a **collision graph**; everything else is a skin. Today's flow is
`hand-authored barriers → terrain.tsx derives visuals`. Procedural gen **inverts** it: a
**shared substrate** (noise fields) drives *both* the collision layer and the visual layer so
features agree by construction (river in the valley, sand by the water, trees where it's moist).

A generator emits a **MapSpec** with ~4 planes:

| Plane | Consumer | Content |
|---|---|---|
| **Collision** | engine | barrier rects (`wall` / `cliff`=see-across), arena size, bridges/fords = passable gaps |
| **Surface** | render (+ maybe engine) | biome/material per cell — the "coherent pattern, not noise" |
| **Scatter** | render (+ optional collision) | discrete props: trees, rocks, buildings — decorative vs solid |
| **Semantic** | store / gameplay | entry points, POIs, road/room graph, region tags, waypoint hints, tactical profile |

---

## A. Generation layers (the substrate stack)
Ordered passes; each an independent, prototypable building block.
1. **Params / seed** — biome, size, theme, difficulty; `seed = hash(locationId)`, deterministic, no `Math.random`.
2. **Macro fields** — elevation, moisture, roughness, vegetation, settlement-suitability. The shared substrate that makes features *agree*.
3. **Material / biome partition** — fields → surface regions (grass/dirt/sand/water bands).
4. **Hard geography** — coasts, rivers, ridges, ravines, wetlands, cliffs, forest masses (derived from fields).
5. **Navigation skeleton** — the connectivity **graph**: roads / corridors / streets / room-graph + POI nodes.
6. **Structure pass** — loops vs trees, lock-and-key placement, dead-ends, boss lair (§D).
7. **Tactical masks** — derive chokepoints, long-LoS lanes, blind pockets, cover clusters from the graph.
8. **Stamp / vault pass** — authored fragments placed at nodes under constraints (§I).
9. **Detail / decor** — mottling, scatter, props (today's `terrain.tsx`, now a *consumer* of MapSpec).
10. **Bake + validate** — flatten to planes; reachability check (now *conditional* through gates/keys); repair or reroll.

Passes are reorderable/skippable — ship Layer 3 alone (pretty ground, no gameplay change) and add layers without rewrites.

## B. Spatial primitives (the fixed vocabulary)
- **Two collision kinds only**: `wall` (blocks move + LoS) and `cliff` / **see-across** (blocks move, sight passes).
- **Material tags** on top — *one collision, many paints* (fence / rail / bars / water / parapet / ravine / hedge all = see-across, different SVG). Engine stays pure `{x,y,w,h,kind}`; material lives in MapSpec, read only by the paper layer.
- **Zones** — ground effects (hazard / slow / buff); already exist; the home for traps & wards.
- **Scatter** — decorative vs solid props, blue-noise placed.
- **Surface** — walkable material bands (grass / dirt / sand / shallow-water), visual-only.
- **Two resolutions**: coarse collision-rect grid (fast pathing) + fine material grid (rich paper visuals); they need not align cell-for-cell.

## C. Tactical-function features (geometry that changes the fight)
Keep the *categories*, not a 50-item list. **Filter every candidate:** *does it change the auto-battle, or only a human's navigation?* Keep the former (we have no cursor-explorer).
- **Chokepoints / funnels** — ridge gaps, gates, causeways, bridgeheads.
- **Cover / broken firing lanes** — pillar fields, boulder gardens, courtyards.
- **Vision architecture** — forest rooms + glades, hedgerows, corners, scalloped edges.
- **See-across tension** — bars, railings, canals, ravines: "target it, can't reach it."
- **Route-shaping negative space** — rivers, chasms, braided islands, peninsulas.

## D. Structure & topology (Unexplored)
- **Cyclic layout (loops, not trees)** — two arcs between entry and goal → back-routes, flanking, pacing, less backtracking. Big for a *battlefield*: forces arrive from two sides.
- **Abstract lock-and-key gating** — a "lock" on an edge + its "key" placed reachable elsewhere; the lock can be *anything* (enemy, proficiency gate, switch, puzzle). **The unifier for §E, §F, §J.**
- **Graph-grammar / rewrite mindset** — place *function* first ("a gate here"), resolve to *themed concrete* later.
- **Dead-ends worth risking** — optional leaf vaults, never on the critical path.
- **Boss & boss lair** — terminal special-arena set-piece, often at max depth.
- **Multi-floor routing** — cross-map links are **topology only** (location graph), never live transfer (§E).

## E. Interaction & state
- **Interactable = position + on-arrival action** (generic: lever, elevator, gate control, exit).
- **Objective-channel AI** — AI targets non-combatant *objectives*, not just enemies; slots into the team planner + an equippable tactic ("work the gate").
- **Effect taxonomy**: mutate barrier/zone · teleport within arena · **route to another location (store-side, ~free)** · ~~channel-switch / live instance transfer (CUT)~~.
- **Dynamic barriers** — the one invariant-breaker (snapshot + byte-identical replay must survive it). Own phase, **gated behind static gen**.
- **Traps** — a `zone` armed or inert; can be turned on monsters.
- **Monster symmetry** — monsters use switches too (portcullis-slam, release-pen); ship the tactic with its foil.

### Scope boundary (locked)
- **Everything rich is "on map" = one `BattleState`.** Protects the invariants: one battle stepped at a time (vision cache is process-global), snapshots byte-identical. **No entity ever streams between two live instances.**
- **Cross-map is topology only** — the existing location graph (`entryLocationId`, `mapPageId`, regions). An in-arena exit/stairs/lift is *just* an Interactable whose effect is `route(toLocationId)`, handled by the store like existing dungeon entry. Engine cost zero. Genuinely optional ("only maybe").

## F. Party-conditioned content (D&D gates & puzzles)
- **`getProficiencies(unit)`** — a derive alongside `getDerivedStats` / `getUnitTraits`; a **small abstract tag set** (perception, disarm, might, mobility, arcane, holy, light, lore). Switch on **tags, never class ids** (same seam as `appearance.ts`).
- **Composition gate** — `predicate(partyProficiencies) → effect`, **resolved at deploy** (map variant chosen at build time → *no dynamic barriers needed*, cheaper than switches).
- **Puzzles the party solves — or doesn't — based on who's present** (fun to watch): secret passage (perception), disarm (rogue), rune door (arcane), rubble (might), chasm shortcut (mobility), dark (light).
- **Rewards fit an incremental**: fewer casualties, higher yield, familiarity/loot/xp multipliers — not just secret rooms; gives non-combat proficiencies a reason to exist.
- **Never gate the critical path** (Brogue's rule, doubled: no active recourse in an autobattler).
- **Replayability**: same seed × different party = a different playable map; curated dungeons get multiple solutions.

## G. Kinds of coherence (a distinct axis)
- **Intra-map** — shared substrate makes features agree (river in the valley, sand by water).
- **Theme / biome tags** — a tag conditionally enables compatible content across systems, no explicit coordination (Unexplored).
- **Function-then-theme(-then-history)** — abstract gate resolved late into a themed concrete (fire biome → rune door), then given a past (§M).
- **Inter-map / adjacency** — neighboring locations share palette / biome / motifs; a region blends rather than hard-cuts.
- **Depth / progression gradient** — hold the theme, **crank one motif gradually with depth** (intensity ramp = difficulty + aesthetic climb toward the boss lair).

## H. Aesthetics & sense of place (paper SVG layer)
- **Aesthetic depth = layered detail resolution** — macro shape → material → mottle → scatter → props.
- **Landmark silhouettes** — statues, shrines, towers, giant trees at high-centrality graph nodes (orientation on mobile).
- **Boundary bands** — legible transitions (beach → dune → scrub → forest).
- **Organic paper edges hugging boxy collision** — today's `terrain.tsx` discipline: seeded, no `Math.random`, baked to one data-URI, not live SVG DOM.

## I. Motifs & set pieces
- **Stamp / vault registry** — authored MapSpec fragments (courtyard, pillar hall, barred cell, plaza, ring room, bridgehead), placed by constraint, mirrored/eroded (DCSS + Unexplored set pieces). Fits our plain-object-registry pattern. **Highest-leverage single item.**
- **Repeated signature motifs** — a recurring shape/prop that ties a region or dungeon together.
- **Ruins / history** — broken walls, collapsed streets, false symmetry (authored-feel + cover).

## J. Secrets & surprise
- **Secret passage** — perception-gated shortcut.
- **Visible-unreachable goal pocket** — see the reward through bars/chasm before finding the route.
- **Optional dead-end vaults**, **false symmetry with one broken side**.
- All **optional**, never required.

## K. Cross-cutting invariants / constraints (guardrails)
- **Determinism / seed** — pure passes; **save = seed, not the baked map** (tiny saves, matches codec philosophy).
- **Rects forever**; paper owns curves.
- **Single-arena engine scope**; cross-map = routing only.
- **Reachability validation** — mandatory; now *conditional* (reachable-if-openable / if-key-obtainable). Repair or reroll.
- **Never gate the critical path.**
- **Small fixed vocabularies** (2 collision kinds, ~8 proficiency tags) or authoring explodes.

## L. Game-loop hooks (why it pays off)
- **Tactical-profile annotation** — each map self-describes (open/enclosed, chokepoint count, `rewards:{perception,arcane}`) for the deploy UI + AI waypoint hints. The bridge from generator to the worker-assignment loop.
- **Deploy leverage** — "send the right *kit*," not "send the strongest."
- **Replayability** — seed × party variation.
- **Dependency**: geometry is inert without AI that uses it — the pending **smart-party "hold chokepoint / use cover / zone control" tactics** (BACKLOG) are the consumer. **Ship map features and consuming tactics as a pair.**

## M. Story & lore (RimWorld / DF)
Generate a **story *scaffold*, not prose** — the player projects the rest (apophenia; our paper minimalism is the asset). Two sources:

**M1. Place-embedded (environmental storytelling baked into geometry)**
- **Site premise** — a one-line generated premise ("flooded quarry town," "burnt watchtower on a ridge") biases fields, motifs, stamps, gates coherently.
- **History pass** — extend function→theme into **function → theme → history**: this ruin was a temple → stamp temple, then collapse it. History *shapes* geometry, not a text overlay.
- **Artifacts / relics with tiny generated legends** — a reward/landmark carries a name + one-line origin, tying loot to place.
- **Procedural naming** — place names + a legend line; the tactical-profile annotation gains a *narrative* annotation. Makes a farmed location memorable.

**M2. Sim-emergent (the player's own narrative)**
- Who you deployed × how the auto-battle went × which puzzles the party solved-or-didn't = the story. We make outcomes **legible and variable**; **proficiency gates (§F) are literally story engines.**
- **Lands on surfaces we already own**: Reports tab, combat-report helpers, offline summary. Point them at the map.
- **Narrative ellipsis is free** — off-screen `creditOffscreen` + offline battles are unobserved drama reconstructed from a report.

**Principles / guardrails**
- **Apophenia over authored text** — scaffolds (premise, ruin, name, legend line), never paragraphs.
- **Shape randomness to be dramatic, not uniform** — a **director** that tunes *contrast* and escalation. Same knob as the depth/adjacency gradient: narrative arc and challenge arc are one dial.
- **Constrained freedom** — the backstory is a *given* you build around; matches determinism / save-as-seed.
- **Push away (scope)**: no Dwarf-Fortress world-history simulation, no autonomous map NPCs. Place-embedded + sim-emergent only.

---

## ⭐ Do-not-forget shortlist (easy to lose in design)
1. **Shared-substrate fields** — the source of *all* coherence; build fields before features.
2. **Material tags over 2 collision kinds** — the cheapest big unlock; ~20 features for free.
3. **Abstract lock-and-key** — the one abstraction unifying gates, switches, secrets, traps, proficiency puzzles. Model this well and most of §E/§F/§J fall out of it.
4. **Cyclic (loop) layout** — designs the *battlefield*, not just navigation; don't default to trees.
5. **Function-first, theme-late resolution** — place "a gate," decide "rune door" later; makes coherence + depth-gradients + adjacency tractable.
6. **`getProficiencies` derive + composition gates at deploy** — on-genre, cheap, the replayability engine.
7. **Save = seed; reachability validation mandatory and now conditional.**
8. **Tactical-profile annotation** — the bridge to the deploy / worker-assignment loop; without it the richness never reaches player decisions.
9. **Depth / adjacency coherence as first-class** — not an afterthought skin; it's why a *world* feels like a world.
10. **Geometry needs consuming AI** — pair map features with smart-party tactics.
11. **Generate story scaffolds, not prose** — a premise + a name + a ruin; let apophenia + paper minimalism do the rest.
12. **Aim narrative at surfaces we already have** — Reports, offline summary, familiarity, persistent map state. Mostly plumbing, not new tech.
13. **One "director" dial** unifies difficulty gradient, depth escalation, dramatic contrast, and adjacency.
14. **Proficiency gates are story engines** — "who you brought" is the cheapest emergent-narrative source; §F and §M are the same feature seen twice.

---

## Prototyping order (a path that ships something each step)
1. **Surface-only overworld** — noise fields → biome coloring, *no collision change*. Proves the substrate; `terrain.tsx` starts reading fields.
2. **+ Elevation cliffs & scattered trees** — first generated *gameplay* geometry, reusing `cliff`/`wall` + the reachability validator.
3. **+ Hydrology (one lake or river) + fords/bridges** — proves layers compose (crossing = gap in the deep-water barrier chain).
4. **+ Buildings & roads** — unlocks the city recipe.
5. **Dungeon recipe** — graph-first branch (rooms/corridors, cyclic layout, lock-and-key), sharing the bake/validate tail.

Three map types = three **recipes** over one pipeline: overworld = *field-first*; dungeon =
*graph-first*; city = *road-first*. Same MapSpec contract, same "ordered passes" shape.
