// Map generation — THE UNIVERSE (idea catalog → types).
//
// This file is the scaffold's hardest deliverable: the fixed vocabularies and the
// MapSpec contract every layer, recipe, consumer, and future phase builds against.
// Vocabularies are deliberately SMALL (catalog §K: "small fixed vocabularies or
// authoring explodes") — grow them one entry at a time, never per-feature.
//
// The load-bearing hinge (catalog intro): the engine only needs a collision
// graph; everything else is a skin. A generator emits a MapSpec of four planes —
// collision (engine), surface (render), scatter (render), semantic (store/AI) —
// all derived from one shared substrate so features agree by construction.
//
// MapSpec is DATA ONLY: plain JSON-able values (plus one Uint8Array), no
// functions, no class instances. Save = seed + params, never the baked spec
// (§K); anything that must survive a save must be reconstructible from GenParams.

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

// ── Collision plane (consumer: engine) ──────────────────────────────────────--
// Rects forever (locked): two collision kinds only, matching engine Barrier —
// 'wall' blocks movement + sight, 'cliff' blocks movement only (see-across).
// Deep water, ravines, fences, hedges are NOT new engine primitives: they are
// one of these two kinds wearing a different MATERIAL (catalog §B: "one
// collision, many paints"). The engine adapter drops the material; only the
// render layer reads it.

export type CollisionKind = 'wall' | 'cliff'

export const BARRIER_MATERIALS = [
  'rock',        // natural outcrop / boulder mass (wall)
  'cut-stone',   // built wall / ruin course (wall)
  'wood',        // palisade / fallen timber (wall)
  'hedge',       // dense growth: blocks path, see-across (cliff)
  'deep-water',  // impassable water: see-across (cliff) — locked decision
  'ravine',      // chasm / drop: see-across (cliff)
  'rubble',      // collapsed structure (wall) — the ruins/history motif (§I)
  'bars',        // portcullis / cell bars: see-across (cliff) — §J "target it, can't reach it"
] as const
export type BarrierMaterial = (typeof BARRIER_MATERIALS)[number]

export interface CollisionRect extends Rect {
  kind: CollisionKind
  material: BarrierMaterial
  // A lock's seal plug — set by gates.ts so lock geometry is first-class: the
  // solvability layer (solve.ts) and validator identify a plug by its lock id
  // instead of inferring positionally. The engine adapter drops it (specBarriers
  // destructures the bare rect), so the engine never sees locks.
  lockId?: string
}

// ── Surface plane (consumer: render; engine reads nothing here today) ────────
// One walkable material per fine-grid cell — the "coherent pattern, not noise".
// `cellsPerUnit` is the two-resolutions hook (§B): collision rects live in world
// units; the surface grid may later run finer than 1 cell/unit for richer paper
// visuals without touching collision. 1 today.

export const SURFACE_MATERIALS = [
  'grass',
  'meadow',          // lush grass band (high moisture)
  'dirt',
  'sand',
  'shallow-water',   // walkable ford/shore — crossable by construction (locked)
  'deep-water',      // visual twin of the deep-water collision rects covering it
  'stone-floor',
  'road',            // reserved for the city/dungeon recipes' nav skeleton
] as const
export type SurfaceMaterial = (typeof SURFACE_MATERIALS)[number]

export interface SurfacePlane {
  cols: number
  rows: number
  cellsPerUnit: number            // fine-grid resolution hook; always 1 today
  grid: Uint8Array                // row-major [y * cols + x] → SURFACE_MATERIALS index
}

// ── Scatter plane (consumer: render; optional future collision) ──────────────
// Discrete props placed by the generator so they can respect the substrate
// (trees where it's moist) and the semantic plane (clear of spawns/portals).
// Abstract KINDS, not prop ids — the skin translates kind → its own prop
// archetype (same seam rule as appearance.ts: switch on tags, never ids).
// `solid: true` is the hook for props that also emit a collision rect; the
// scaffold places decorative-only scatter.
//
// PLACEMENT INTENT (phase 2): the generator states HOW a prop wants to be laid
// down — an area filler, a grove/bed member, an understory sprig — and the
// render matches that intent to a prop's `role` (props.ts `PropRole`) when it
// resolves the kind to a concrete prop. Mapgen stays a pure leaf (it can't
// import render/props), so it reasons about kind + intent only; render owns the
// (kind, intent) → prop pick. Phase 2 emits `field`/`cluster`/`understory`;
// `edge`/`accent` are reserved for phase 3 (verge lines, hero props).
export const SCATTER_INTENTS = ['field', 'cluster', 'edge', 'understory', 'accent'] as const
export type ScatterIntent = (typeof SCATTER_INTENTS)[number]

export const SCATTER_KINDS = ['tree', 'bush', 'rock', 'stump', 'flower', 'reed'] as const
export type ScatterKind = (typeof SCATTER_KINDS)[number]

export interface ScatterItem extends Pt {
  kind: ScatterKind
  size: number       // relative footprint, ~0.5–1.5
  seed: number       // per-item wonk seed for the render layer's variant pick
  solid: boolean
  intent?: ScatterIntent   // placement intent → render matches to a prop role (default 'field')
}

// ── Semantic plane (consumer: store / gameplay / AI) ─────────────────────────
// Everything a map knows about itself that isn't geometry: named points, the
// navigation skeleton, gating, self-description. This is the bridge from the
// generator to the deploy loop (§L) and the story scaffold (§M).

export const POI_KINDS = [
  'spawn',      // party form-up anchor (validation: apron kept clear)
  'portal',     // a travel edge's on-field cell (pre-placed via GenParams.pois)
  'landmark',   // orientation silhouette site (§H) — render may stamp a big prop
  'lair',       // boss/set-piece terminal node (§D) — dungeon recipe
  'vault',      // optional off-critical-path reward pocket (§J)
  'gate',       // a Lock's physical site (§D lock-and-key)
  'key',        // where a Lock's opener lives
] as const
export type PoiKind = (typeof POI_KINDS)[number]

export interface Poi {
  id: string
  kind: PoiKind
  at: Pt
  tags: string[]     // free-form annotations ('vista', 'boss', a lock id…)
}

// Navigation skeleton (§A layer 5) — THE CONVERGENCE LAYER (procedural-generation-architecture-plan.md
// L4): the connectivity graph every downstream shared system (locks, depth,
// secrets, paths, validation) reads. Two producers, one model: dungeon/city
// AUTHOR the graph (the plan publishes it, geometry realizes it); the
// overworld DERIVES it from geography (regions segmented from the walk mask,
// natural pinches — fords, passes, gaps — become edges; `deriveRegions` in
// graph.ts, consumed by the field recipe's `regions` pass).
export interface NavNode {
  id: string
  at: Pt
  poiId?: string
  area?: Rect        // the node's floor footprint (a dungeon room, a city block, a region bbox)
  depth?: number     // graph distance from the entry node (§G depth gradient)
  // Track D flow/tension digest: normalized remoteness from the spawn, in
  // [0,1] — the node's anchor-cell BFS distance on the AS-IF-OPEN walk mask
  // (pre-gate-plugs, so it's kit-invariant) ÷ the map's max cell distance
  // (digestIntensity in graph.ts documents the exact formula). The store reads
  // it to pace spawns/rewards (decision 4: mapgen makes the stage, the store
  // populates); the cell-resolution plane stays in draft.scratch, never baked.
  intensity?: number
}
export interface NavEdge {
  a: string
  b: string
  // 'crossing' is the natural-pinch kind (ford / bridge / mountain pass /
  // cliff gap) — the overworld's derived edges (procedural-generation-architecture-plan.md track B/C).
  kind: 'road' | 'corridor' | 'desire-path' | 'crossing'
  doorAt?: Pt        // the edge's physical pinch (a dungeon door, a ford) — choke-tactic anchor
  lockId?: string    // edge gated by a Lock (conditional reachability)
}

// Abstract lock-and-key (§D — "the one abstraction unifying gates, switches,
// secrets, traps, proficiency puzzles"). A Lock names what opens it; resolution
// to a themed concrete (rune door, rubble, hidden door, chasm) happens
// function-first, theme-late. PROFICIENCY_TAGS is the §F vocabulary — switch on
// tags, never class ids (same seam rule as appearance.ts).
//
// LOCKED DECISION (phase 4): proficiency locks resolve AT BAKE TIME — the
// composition gate. The deploying party's tags arrive in GenParams; a matching
// lock bakes OPEN (its sealing geometry is simply omitted), a non-matching one
// bakes CLOSED (sealed + its prizes exempt from reachability). Same seed ×
// different party = a different playable map, with NO dynamic barriers and no
// engine change — the replayability engine, resolved once per battle stand-up.
// 'key' locks resolve the same way against GenParams.heldKeys (the deploy-time
// seam; store-side pickup is phase 6) — solve.ts proves each bake's key flow
// solvable. 'switch' (interactable) stays a reserved shape.
export const PROFICIENCY_TAGS = [
  'perception', 'disarm', 'might', 'mobility', 'arcane', 'holy', 'light', 'lore',
] as const
export type ProficiencyTag = (typeof PROFICIENCY_TAGS)[number]

export interface Lock {
  id: string
  kind: 'enemy' | 'switch' | 'key' | 'proficiency'
  tag?: ProficiencyTag     // for kind 'proficiency'
  at?: Pt                  // the gate's physical site (mirrored by a 'gate' POI)
  open: boolean            // bake-time resolution: true = the party's kit opened it
  gates: string[]          // POI ids behind this lock (each also tagged `locked:<id>`)
}

// L0 world-directives seam (procedural-generation-architecture-plan.md, decision 5): opaque tokens a
// future world DIRECTOR plants into a bake — "this map must contain the key
// for lock X on map Y" — the early cross-map constraint. Typed now so the
// plumbing exists and GenParams doesn't reshape later; consumed by NOTHING
// yet (track G). `kind: 'key'` binds to the reserved Lock kind of the same
// name; 'clue' is discovery bait (phase-4 puzzle-solving); 'poi' is a bare
// must-contain site.
export interface ManifestToken {
  id: string
  kind: 'key' | 'clue' | 'poi'
  forLock?: string         // the (possibly cross-map) lock id this token serves
  tags?: string[]
}

// Tactical-profile annotation (§L): the map self-describes so richness reaches
// player decisions (deploy UI: "enclosed, 2 chokepoints, rewards perception").
// Heuristic numbers, not promises — refine per phase.
export interface TacticalProfile {
  openness: number        // unblocked area fraction, 0–1
  barrierCount: number
  chokepoints: number     // narrow-gap count between barrier pairs
  longLanes: number       // unbroken sight lanes spanning most of the map
  coverClusters: number   // distinct wall clusters usable as cover
}

export interface SemanticPlane {
  pois: Poi[]
  nav: { nodes: NavNode[]; edges: NavEdge[] }
  locks: Lock[]
  regionTags: string[]        // theme tags echoed for cross-system coherence (§G)
  name: string | null         // §M procedural place name ('Meremoor') — filled by the shared premise pass
  premise: string | null      // §M1 story scaffold — ONE line, never prose (the premise pass fills it)
  tactical: TacticalProfile
}

// ── The contract ─────────────────────────────────────────────────────────────

export interface MapSpec {
  specVersion: 1
  recipe: string
  seed: number               // the resolved numeric seed actually used (post-reroll)
  cols: number
  rows: number
  collision: CollisionRect[]
  surface: SurfacePlane
  scatter: ScatterItem[]
  semantic: SemanticPlane
}

// ── Generation params ────────────────────────────────────────────────────────
// Themes reuse the location-trait words (biomeForLocation's vocabulary) so a
// Location's `traits` project straight onto the generator — one tag enabling
// compatible content across systems with no explicit coordination (§G).

export const THEME_TAGS = [
  'plains', 'forest', 'beach', 'water', 'mountain', 'desert',
  'ruins', 'city', 'dungeon', 'haunted', 'volcanic', 'arcane', 'swamp',
  'snow', 'cave', 'jungle',
] as const
export type ThemeTag = (typeof THEME_TAGS)[number]

export interface GenParams {
  recipe: string
  seed: number | string       // string → hashString; save = this, never the spec
  size: number                // square arena side, world units
  themes: ThemeTag[]
  // Pather budget: open-world routing cost grows with BARRIER COUNT, not map
  // area. The live envelope is 72 (P5 re-bench; the adapter pins it, the
  // barrier-budget validation rule enforces it per bake); the lib default
  // stays a lean 24 for lab exploration.
  maxBarriers?: number
  spawnApron?: number         // clear radius around the spawn POI (default scales with size)
  keepClear?: Rect[]          // externally-owned cells (portals) no pass may cover
  pois?: { kind: PoiKind; at: Pt; id?: string; tags?: string[] }[]  // pre-placed anchors (portals)
  // §F composition gates: the deploying party's proficiency tags. A recipe's
  // gate pass resolves each proficiency Lock against this set at bake (see the
  // Lock docs above). Empty/absent = every lock bakes closed — also what the
  // lab's contact sheet and the fuzz gates review by default.
  proficiencies?: ProficiencyTag[]
  // §D key logistics: lock ids the deploying party already holds keys for. A
  // matching 'key' lock bakes OPEN (plug omitted) — the same variant-at-deploy
  // resolution as `proficiencies`. Ids are stable per seed (placement is
  // key-invariant), so keys found in a closed bake resolve future re-bakes.
  // Store passes nothing yet (pickup play-flow is phase 6).
  heldKeys?: string[]
  // L0 world-directives seam — see ManifestToken. RESERVED: typed and carried
  // through normalization so the director (track G) slots in like
  // `proficiencies` did, but no pass consumes it yet.
  manifest?: ManifestToken[]
  // Composition-gate master switch (phase-4 policy): lib/lab default is ON
  // (fuzz gates and the ?mapgen=1 party toggles exercise gates freely), but
  // the ADAPTER defaults live locations to OFF — a location adopts gates
  // deliberately via `mapGen.gates: true`, after the phase-4 feel pass.
  gates?: boolean
  // Layer-inspector hook: pass ids to skip. Stream-isolated RNG guarantees the
  // remaining passes produce byte-identical output — the ?mapgen=1 lab's
  // layer-by-layer buildup rides this.
  skipPasses?: string[]
  // DEV-ONLY debug channel (the ?mapgen=1 lab). When true, generateMap attaches
  // the accepted attempt's `draft.scratch` (the L6 derived planes — walk /
  // regions / flow / desire-paths masks) to GenResult.scratch so the lab can
  // render them. Drawn from NOWHERE in generation logic: no pass, RNG stream,
  // bake, or validation reads it, so a debug bake is byte-identical to a
  // non-debug one (pinned in pipeline.test.ts). NEVER baked/serialized — scratch
  // rides only the in-memory GenResult (locked decision: save = seed + params).
  debug?: boolean
  // Validation policy: 'reroll' (default) re-runs with a derived seed up to
  // MAX_ATTEMPTS; 'accept' returns the first attempt with its failing report
  // (the lab wants to SEE bad maps); 'throw' for callers that must not ship one.
  onFail?: 'reroll' | 'accept' | 'throw'
}

// ── Validation harness output ────────────────────────────────────────────────
// Machine-checkable coherence (§A layer 10). Every rule is named so harnesses
// (fuzz gates, the lab, future CI sweeps) report failures a human can triage
// without rendering the map.

export interface RuleResult { rule: string; ok: boolean; detail: string }
export interface ValidationReport { ok: boolean; rules: RuleResult[] }

export interface GenResult {
  spec: MapSpec
  report: ValidationReport
  attempts: number            // 1 = first roll validated
  notes: string[]             // per-pass breadcrumbs (what was capped/dropped — no silent truncation)
  // DEV-ONLY (GenParams.debug): the accepted attempt's `draft.scratch` — the L6
  // derived planes (walk mask, region claims, flow distances, desire-path mask)
  // one pass produces and later passes consume. Present ONLY when params.debug
  // is set; NEVER baked into the spec or serialized (scratch stays unbaked —
  // the spec carries only digested summaries like NavNode.intensity). The
  // ?mapgen=1 lab reads it to draw the per-layer overlays.
  scratch?: Map<string, unknown>
}
