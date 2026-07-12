# Mapgen layer architecture (the reorg plan of record)

How the generator is layered so **overworld and dungeon can diverge in
generation philosophy** (noise-first vs. graph-first) while **sharing
lock-and-key, coherence, and validation** — and so cross-map "planted seeds"
can land later without a rewrite. `CLAUDE.md` stays the working contract for
what EXISTS; this doc is the target structure and the reasoning behind it.
When a track below ships, move its facts into `CLAUDE.md` and shrink it here.

## The pivot (one sentence)

**The nav graph is the convergence point**: dungeons *author* the graph and
realize geometry from it; the overworld *derives* the graph from geography
(natural pinches — fords, passes, gaps — become edges); everything downstream
— locks, gates, depth gradients, secrets, paths, cross-map seeds, conditional
reachability — reads the graph and never cares which philosophy produced it.

## The layer stack

A *dependency* stack, not a strict temporal order — a dungeon runs L4 before
its geometry exists (the plan IS the graph), the overworld runs it after
(the graph is segmented out of the geography). The invariant is the handoff:
**by the time L5 runs, `semantic.nav` is a truthful connectivity model of the
collision plane.**

| # | layer | owner | status |
|---|---|---|---|
| L0 | **World directives** — cross-map manifest (`GenParams.manifest`): opaque "must-contain" tokens a future world director injects (a key for another map's lock). | pre-recipe seam | seam only (typed, unconsumed) |
| L1 | **Params + seed** — `GenParams` → `NormParams`; save = seed + params, never the spec. | `draft.ts` | shipped |
| L2 | **Substrate** — `FieldBundle` noise fields (elevation/moisture/roughness); the source of intra-map coherence. | `fields.ts` | shipped |
| L3 | **Production** — THE DIVERGENCE LAYER, one per recipe family: overworld = geography-first (surface bands, hydrology, ridges, outcrops); dungeon = graph-first (rooms → cycles → carve); city = road-first (skeleton → pave → buildings). All philosophy differences are quarantined here. | `recipes/*` | shipped (upgrades tracked below) |
| L4 | **Nav/region graph** — THE CONVERGENCE LAYER: one shared model (`NavNode`/`NavEdge`), two producers — *authored* (dungeon, city: plan publishes it, geometry realizes it) and *derived* (overworld: segment passable space into regions; pinches become edges). Shared ops in `graph.ts`. | `graph.ts` + producers | authored ✅ · derived ❌ (track B — the biggest new build) |
| L5 | **Gating** — recipe-agnostic lock-and-key over graph edges (`gates.ts`): a `Lock` names what opens it, resolves against the party kit (and later, carried keys / world manifest). Dungeon doors and overworld fords are the same mechanism wearing different materials. | `gates.ts` | shipped (dungeon); overworld gates arrive with track C |
| L6 | **Derived planes** — the computed-fields tier: named intermediate products one pass produces and later passes consume (`draft.scratch`): walk masks, road-distance transforms today; flow/distance-to-goal, tension budget, sightline masks tomorrow. Never baked; the spec only carries digested summaries (e.g. `NavNode.depth`). | `draft.ts` scratch | shipped (masks); flow/tension = track D |
| L7 | **Dressing** — stamps/vaults, scatter, paths/desire-paths, decor. Reads L2–L6, adds no connectivity. | `stamps.ts`, recipe passes | shipped |
| L8 | **Semantic annotation** — POIs, tactical profile, naming/premise. Describes, never steers. | `profile.ts`, `naming.ts` | shipped |
| L9 | **Bake → validate → reroll** — coherence harness; reachability is *conditional* through locks and reads the graph. | `draft.ts`, `validate.ts`, `pipeline.ts` | shipped |

What this quarantines: swapping the dungeon's MST+spares for real cyclic
generation (track E), or teaching the overworld to derive regions (track B),
each touches exactly one layer — L5–L9 don't move.

## The graph contract (L4)

The shared model both producers must satisfy (validation grows a
`graph-truthful` rule with track B):

- `NavNode` = a **region anchor**: a dungeon room, a city block/junction, an
  overworld region (the land between rivers/ridges). `area` is its
  representative rect; `depth` = graph distance from the entry node.
- `NavEdge` = a **traversable connection with a physical pinch site**
  (`doorAt` — a dungeon door, a ford, a mountain pass, a bridgehead). Kinds:
  `corridor` / `road` / `desire-path` / `crossing` (the natural-pinch kind:
  ford, bridge, pass, gap). `lockId` makes an edge conditional.
- Rules (the validator's guarantees, some shipped, some with track B):
  1. the graph is connected when every lock is open;
  2. spawn and every portal live on the **ungated** subgraph — never gate the
     critical path (Brogue's rule, already enforced for POIs by `locks`);
  3. a closed lock's edge is genuinely impassable, an open one genuinely
     passable (shipped: the `locks` rule, both directions);
  4. (track B) every published edge is physically real — flood-fill agrees.

### The derived producer (track B — the one genuinely new build)

`deriveRegions(walkMask, minPinchWidth)` in `graph.ts`:
distance-transform the walkable mask → erode by the pinch threshold →
connected components of the eroded mask = regions → boundary corridors
between two regions = edges, each's narrowest cell = the pinch (`doorAt`).
Pure, deterministic, O(cells). The field recipe then publishes real
nodes+edges instead of today's POI-only node stubs — and the entire L5 gate
machinery starts working on the overworld with zero changes to it.

## Decisions (weighed, settled — revisit deliberately)

1. **Topology: one shared graph layer with two producers**, not two
   subsystems. Downstream (locks, validation, depth, secrets, director) is
   ~80% built and recipe-agnostic already; forking it would duplicate the
   hardest-won code. Divergence lives in L3 + the producer choice, nowhere
   else.
2. **Representation: flat rect list stays; corner-stitching rejected for
   now.** Its O(√N) local queries beat O(N) scans only at N far above our
   ceiling — the live barrier budget is 40 rects and even the lab dungeon is
   ~72; flood-fill on a ≤200² grid is microseconds. It also collides with two
   locked decisions (rects-forever as the engine seam; the adapter drops to
   bare rects). Revisit trigger: budget ≥ ~200 rects, or validation/derivation
   shows up in a profile.
3. **Barrier budget: aim for a MODERATE envelope; 40 is the currently-benched
   number, not a design ceiling.** Napkin: lake ≈ 4–8 rects (today's band
   cover), river ≈ 8–14 (band cover per reach), ridge line ≈ 4–8, outcrops
   want ≥ 12, gate plugs 1–2 each. At 40 that means ~2 macro geography
   features per map; a moderate envelope (~56–72, the lab dungeon's
   territory) fits 2–3 plus healthy outcrops — which is the ambition level
   we actually want for rivers + ridges + gates. The pather cost is rect
   *count* and the envelope has already moved once (16 → 40 with the
   steerAround visibility-graph cache), so the path is: re-bench in
   `map-perf-envelope.test.ts` with realistic river-map geometry and raise
   the live cap to whatever moderate number holds — one bench serves both
   track C and the live-dungeon debt (the dungeon's 72 is waiting on the
   same pass). Until it lands, geography passes take explicit per-pass
   allotments (dials, `note()` the spend) instead of racing for the shared
   budget. Moderate ≠ unbounded: hundreds of rects is corner-stitching
   territory (decision 2) and off the table.
4. **Mapgen ↔ store boundary for flow/tension: mapgen makes the stage, the
   store populates it.** Mapgen computes flow/tension as L6 derived planes
   and bakes only digested per-node summaries on the semantic plane
   (`NavNode.depth` today; a node `intensity` scalar with track D). The store
   reads those to pace spawns/rewards; mapgen never places monsters (locked
   scope). Cell-resolution planes stay in scratch — the spec stays small.
5. **Cross-map is a seam, not a build.** `GenParams.manifest` carries opaque
   planted tokens (typed now, consumed by nothing); `Lock.kind: 'key'` is the
   reserved shape it will bind to. The Phase-0 world director that computes
   manifests (plant key on map A for lock on map B, solvability-ordered) is
   track G — after single-map key logistics exist (phase-6 interactables).
   Mirrors how `proficiencies` already flows in, so the plumbing is proven.
6. **Technique verdicts** (research packet §4):
   - **Flow-field / distance-to-goal** — adopt as an L6 derived plane
     (track D). Cheap (one BFS), gives the field recipe the depth notion it
     lacks and the store a pacing dial.
   - **Sightline-ribbon carving** — adopt as an optional L3 pass (track F):
     reserve 1–2 straight lanes before obstacle placement; passes then treat
     lane cells as keep-clear. Pure AABB math, targets our exact
     wall/see-across split; turns `longLanes` from an annotation into a
     guarantee.
   - **Tactics-as-constraint via ASP/clingo** — reject the tool (external
     solver, NP-complete, determinism-across-versions risk on mobile TS);
     adopt the *principle* as `tacticalTargets` in GenParams + validator
     rules / reroll scoring against the existing `tacticalProfile` (track F).
     Rejection sampling over a deterministic reroll chain keeps every
     guarantee we already have.
   - **Corner-stitching** — defer (decision 2).

## What this buys the overworld (rivers, bridges, paths, secrets)

All of it lands as L3 production + L4 derivation + existing L5/L7 machinery:

- **Rivers** (hydrology v2): trace a descending polyline on the elevation
  field (edge → lake/edge), carve a deep-water band (cliff + `deep-water`
  rects, the lake's band-cover trick per reach). The river is the region
  *divider* that makes derived edges meaningful.
- **Crossings**: punched at graph-chosen pinches — **ford** = shallow strip
  (walkable by construction, the default ungated edge), **bridge** = the same
  gap wearing `road` surface (city-adjacent themes). Both are `crossing`
  edges; validation already knows how to prove them.
- **Gated natural terrain**: a *second* crossing gated by kit — a
  mobility-only ford, a perception-only hidden trail through the ridge, a
  might-cleared rockfall — `placeProficiencyLock` on a derived edge, same
  seal-plug machinery as the dungeon, materials from the same table. Never
  the only route (contract rule 2).
- **Paths**: a `desire-path` L7 pass paints dirt/road surface along the graph
  route spawn → portals → landmark, through the pinches. Zero barrier cost,
  makes the derived graph *visible* and routes readable.
- **Secrets** (§J): a vault POI in a small region whose only edge is locked
  (perception) — the `locks` rule already guarantees sealed-when-closed /
  delivered-when-open. See-across materials (ravine, deep-water) give
  "visible but unreachable" for free.

## Build-out tracks (each independently shippable; sequence ≈ this order)

- **A. Layer scaffolding** *(this change)*: `graph.ts` (shared ops),
  `gates.ts` (recipe-agnostic lock placement), `draft.scratch` (L6 floor —
  the WeakMap side channels made first-class), `crossing` edge kind,
  `GenParams.manifest` seam, this doc.
- **B. Derived graph producer**: `deriveRegions` + the `graph-truthful`
  validator rule; field recipe publishes real edges. Unblocks everything
  overworld.
- **C. Rivers + crossings + desire paths**: hydrology v2, ford/bridge edges,
  the paths pass, first overworld proficiency gate. Starts with the
  moderate-envelope bench (decision 3): re-bench `map-perf-envelope` on
  river-map geometry, raise the live cap to what holds (~56–72 target),
  then spend it.
- **D. Flow/tension derived plane**: distance-to-goal BFS in scratch, node
  `intensity` on the semantic plane, store-side pacing consumption (settle
  the §4 ownership split in that PR, per decision 4).
- **E. Real cyclic dungeon generation**: cycle-as-primitive templates +
  lock/key/shortcut rewrite steps (Unexplored-style) replacing MST+2-spares.
  A pure L3/L4-producer swap — L5–L9 untouched by construction.
- **F. Tactical legibility as a target**: sightline-ribbon pass +
  `tacticalTargets` scoring/validation. Pairs with the consuming AI tactics
  (BACKLOG → AI & coordination) — ship feature and consumer together (⭐10).
- **G. World director (Phase-0)**: computes `manifest` plants across the
  location graph (cross-map lock/key solvability). Needs single-map key
  logistics (phase-6 interactables) first.

Tracks B/C/E are pure-mapgen; D and F each have a small store/AI counterpart;
G is store+mapgen. Existing phase numbering in `CLAUDE.md` (phases 4–6) maps
onto these: phase-4 feel iteration rides B/C (overworld gates), phase 5's
inter-map coherence rides D/G, phase 6 (interactables) gates G.
