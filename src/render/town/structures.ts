// ── Town: Structures (signs · doors · shutters · chimneys · roof/overhang parts · courtyard) ──
//
// Bucket: PLAZA (city/village fixtures — where `signpost`/`statue` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with
// NO shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION (wave-3): the spec's `role` column mixes real
// PropRoles with VERBS. Verb values move into `gameplay`; only real placement
// roles stay `role`. `-` role → sensible default. Per-row resolution here:
//   innsign/shopsign  role '-'  → role:'edge'  (wall-line fixtures), gameplay:['read']
//   door_arched       role enter→ role:'edge',  gameplay:['enter','open'] (verb→gameplay)
//   shutters          role '-'  → role:'edge',  gameplay:['open'] (has _open state)
//   chimneypot        role '-'  → role:'accent' (small roof landmark)
//   jetty_upper/roofgable '-'   → role:'accent' (canopy structure parts)
//   courtyard         role '-'  → role:'field'  (flat ground decal)
//
// LAYER COLUMN: wall-edge → layer:'wall'; canopy → layer:'canopy'; ground →
// layer:'ground'. wall-edge/canopy parts → pass:'walkable'/'overhang' (they sit
// on/over a facade, don't block a cell); full standing structures stay 'solid'.
//
// UNIQUE STATE-ID RULE: companion state ids are `<baseid>_<suffix>`. This group
// owns `door_arched`→`door_open`, `shutters`→`shutters_open`, and
// `chimneypot`→`chimneypot_smoke` (NOT the bare `chimney_smoke` the spec reuses
// — hag-shack's `crookedchimney` owns `crookedchimney_smoke`). Companion reuses
// base geometry, kinds:[] + tags:['interactable'], still declares pass+footprint.
//
// COURTYARD/COBBLE arbitration: authored as a flat ground DECAL prop
// (rotate:'flat', pass:'walkable') for legacy/hand-authored maps + the gallery —
// distinct from the terrain SURFACE-material paving (which paints whole regions
// spec-side). They coexist; the decal is accent, not the road system.
//
// The 7 building 'set' rows (house_timber/house_thatch/cottage/shopfront/
// townhall/church/chapel_ruin) are SCATTER_SETS prefabs, NOT props — do not
// author them here. Their MEMBER part-props ARE authored here (signs, door,
// shutters, chimney, roof parts) PLUS three brand-new base props this group owns:
//   housewall  — plaster/timber-frame two-storey facade block (house/shop/hall/tavern base)
//   roofthatch — thatched roof cap (house_thatch, cottage)
//   steeple    — church tower + cross (church, chapel_ruin)
// The orchestrator wires the SCATTER_SETS entries post-build (member ids gated
// by AssetCatalog.test); member lists are documented in the digest (WAVE 3).

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, polyPath, blobPath, roughCircle, hashString } from './kit'

// ── shared silhouettes ──────────────────────────────────────────────────────

// Arched doorway: a stone surround + inner plank door (rounded top).
const DOOR_ARCH_OUTER = 'M-0.4 0.66L-0.4 -0.1A0.4 0.4 0 0 1 0.4 -0.1L0.4 0.66Z'
const DOOR_ARCH_INNER = 'M-0.28 0.64L-0.28 -0.04A0.28 0.28 0 0 1 0.28 -0.04L0.28 0.64Z'

// Two-storey Tudor facade block seen near-elevation.
const WALL_D = rect(-0.6, -0.82, 1.2, 1.5)
// timber frame: top plate + sill + corner posts + mid rail + tudor X-braces (one string)
const WALL_TIMBER =
  'M-0.6 -0.76L0.6 -0.76M-0.6 0.58L0.6 0.58' +           // top plate + sill
  'M-0.52 -0.82L-0.52 0.66M0.52 -0.82L0.52 0.66' +       // corner posts
  'M-0.6 -0.1L0.6 -0.1' +                                // mid rail (storey line)
  'M-0.52 -0.72L-0.16 -0.14M0.52 -0.72L0.16 -0.14' +     // upper X-brace
  'M-0.52 0.5L-0.16 -0.06M0.52 0.5L0.16 -0.06'           // lower X-brace
// dark openings: door (arched) + two upper windows (one string)
const WALL_OPENINGS =
  'M-0.14 0.58L-0.14 0.18A0.14 0.14 0 0 1 0.14 0.18L0.14 0.58Z' +   // door
  'M-0.42 -0.56L-0.18 -0.56L-0.18 -0.28L-0.42 -0.28Z' +            // window L
  'M0.18 -0.56L0.42 -0.56L0.42 -0.28L0.18 -0.28Z'                  // window R

// Gable roof cap from above: ridge line + tile-course columns each slope.
const ROOF_D = rect(-0.78, -0.6, 1.56, 1.2)
const ROOF_RIDGE = 'M0 -0.56L0 0.56'
const ROOF_COURSES =
  'M-0.5 -0.5L-0.5 0.5M-0.26 -0.54L-0.26 0.54M0.26 -0.54L0.26 0.54M0.5 -0.5L0.5 0.5'
const ROOF_BATTENS = 'M-0.76 -0.2L0.76 -0.2M-0.76 0.2L0.76 0.2'

// Thatch roof cap: bulging rounded silhouette + straw ridge + eave fringe.
const THATCH_D = blobPath([
  { x: -0.75, y: -0.5 }, { x: 0, y: -0.6 }, { x: 0.75, y: -0.5 }, { x: 0.84, y: 0 },
  { x: 0.75, y: 0.5 }, { x: 0, y: 0.6 }, { x: -0.75, y: 0.5 }, { x: -0.84, y: 0 },
])
const THATCH_RIDGE = 'M0 -0.54L0 0.54'
const THATCH_COURSES = 'M-0.42 -0.46L-0.42 0.46M0.42 -0.46L0.42 0.46'
const THATCH_FRINGE =
  'M-0.6 0.52L-0.6 0.66M-0.3 0.56L-0.3 0.7M0 0.58L0 0.72M0.3 0.56L0.3 0.7M0.6 0.52L0.6 0.66'

// Cobbled courtyard patch (flat ground decal): an ANGULAR flagstone outline
// (polyPath, not a puffy blob) so the patch reads as pavement, not a mound.
const COURT_PATCH = polyPath(roughCircle(0, 0, 0.82, 9, hashString('courtyard')))
// Flat inset mortar seams — a faint darker grid of setts (no lit/raised faces).
const COURT_SEAMS =
  'M-0.66 -0.3L0.66 -0.3M-0.7 0L0.7 0M-0.66 0.3L0.66 0.3' +          // course rows
  'M-0.34 -0.62L-0.34 0.62M0.04 -0.66L0.04 0.66M0.42 -0.6L0.42 0.6'  // staggered seams

// Church steeple from above: stone tower + slate pyramid spire + cross finial.
const STEEPLE_TOWER = rect(-0.44, -0.44, 0.88, 0.88)
const STEEPLE_SPIRE = polyPath([
  { x: 0, y: -0.34 }, { x: 0.34, y: 0 }, { x: 0, y: 0.34 }, { x: -0.34, y: 0 },
])
const STEEPLE_HIPS = 'M0 0L0 -0.34M0 0L0.34 0M0 0L0 0.34M0 0L-0.34 0'
const STEEPLE_CROSS = 'M0 -0.14L0 0.14M-0.1 -0.02L0.1 -0.02'

export const STRUCTURES: PropDef[] = [
  // ── hanging signs (wall fixtures) ──────────────────────────────────────────
  // INN SIGN: iron bracket arm off the wall, a hanging framed board with a
  // frothing-tankard emblem — the tavern's Tudor read.
  {
    id: 'innsign', size: 0.95, wonk: 0.03,
    paths: [
      { d: 'M-0.34 -0.02L0.28 -0.02L0.28 0.5L-0.34 0.5Z', fill: 'shadow', opacity: 0.22 },
      { d: 'M-0.72 -0.58L0.3 -0.5M-0.72 -0.2L0.02 -0.52', stroke: 'ink', sw: 0.055 },
      { d: 'M-0.18 -0.5L-0.18 -0.3M0.18 -0.5L0.18 -0.32', stroke: 'ink', sw: 0.03 },
      ...cutout('M-0.32 -0.3L0.3 -0.28L0.28 0.34L-0.34 0.32Z', 'woodDeep', 'wood'),
      { d: rect(-0.24, -0.22, 0.46, 0.44), fill: 'cream' },
      { d: ring(0.12, -0.01, 0.03), fill: 'emberDeep' },
      { d: ring(0.05, -0.01, -0.07), fill: 'cream' },
    ],
    kinds: ['tree', 'flower'], themes: ['city', 'village'], role: 'edge', rotate: 'upright',
    weight: 0.3, pass: 'walkable', footprint: 0.2, layer: 'wall',
    gameplay: ['read'], tags: ['tudor', 'sign'],
  },
  // SHOP SIGN: a shorter bracket + small square shingle with a painted
  // merchant-coin symbol — distinct compact silhouette from the inn's tall board.
  {
    id: 'shopsign', size: 0.9, wonk: 0.03,
    paths: [
      { d: 'M-0.3 -0.14L0.22 -0.14L0.22 0.38L-0.3 0.38Z', fill: 'shadow', opacity: 0.22 },
      { d: 'M-0.66 -0.4L0 -0.36', stroke: 'ink', sw: 0.05 },
      { d: 'M-0.3 -0.36L-0.3 -0.2M0.04 -0.36L0.04 -0.22', stroke: 'ink', sw: 0.03 },
      ...cutout('M-0.32 -0.2L0.22 -0.2L0.2 0.32L-0.34 0.3Z', 'woodDeep', 'wood'),
      { d: rect(-0.24, -0.12, 0.4, 0.36), fill: 'cream' },
      { d: ring(0.12, -0.04, 0.06), fill: 'bannerGold' },
      { d: ring(0.05, -0.04, 0.06), fill: 'woodDeep' },
    ],
    kinds: ['tree', 'flower'], themes: ['city', 'village'], role: 'edge', rotate: 'upright',
    weight: 0.3, pass: 'walkable', footprint: 0.2, layer: 'wall',
    gameplay: ['read'], tags: ['sign'],
  },

  // ── doorway (wall-edge) + open state ───────────────────────────────────────
  // ARCHED DOOR: dressed-stone surround around a rounded plank door with a ring
  // pull — the house/shop entrance.
  {
    id: 'door_arched', size: 0.95, wonk: 0.03,
    paths: [
      ...cutout(DOOR_ARCH_OUTER, 'stoneWallDark', 'stoneWall'),
      ...cutout(DOOR_ARCH_INNER, 'woodDeep', 'wood'),
      { d: 'M-0.1 0.6L-0.1 -0.02M0.1 0.6L0.1 -0.02', stroke: 'woodDeep', sw: 0.045, opacity: 0.7 },
      { d: ring(0.045, 0.16, 0.3), fill: 'ink' },
    ],
    kinds: ['stump', 'rock'], themes: ['city', 'village'], role: 'edge', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.2, layer: 'wall',
    gameplay: ['enter', 'open'], tags: ['building'],
  },
  // door swung open: same stone surround, dark void where the leaf was, one
  // plank leaf hinged to the left.
  {
    id: 'door_open', size: 0.95, wonk: 0.03,
    paths: [
      ...cutout(DOOR_ARCH_OUTER, 'stoneWallDark', 'stoneWall'),
      { d: DOOR_ARCH_INNER, fill: 'ink' },
      { d: rect(-0.36, -0.02, 0.09, 0.58), fill: 'woodDeep' },
      { d: 'M-0.27 0L-0.27 0.56', stroke: 'wood', sw: 0.03 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.2, layer: 'wall',
  },

  // ── window shutters (wall-edge) + open state ───────────────────────────────
  // SHUTTERS (closed): plaster surround, two louvred leaves meeting at a centre
  // seam — the Tudor window read.
  {
    id: 'shutters', size: 0.9, wonk: 0.03,
    paths: [
      ...cutout(rect(-0.42, -0.5, 0.84, 1.0), 'plasterDark', 'plaster'),
      ...cutout(rect(-0.3, -0.4, 0.6, 0.8), 'woodDeep', 'wood'),
      { d: 'M0 -0.4L0 0.4', stroke: 'ink', sw: 0.05 },
      { d: 'M-0.28 -0.24L-0.02 -0.24M0.02 -0.24L0.28 -0.24M-0.28 0L-0.02 0M0.02 0L0.28 0M-0.28 0.24L-0.02 0.24M0.02 0.24L0.28 0.24', stroke: 'woodDeep', sw: 0.03, opacity: 0.6 },
    ],
    kinds: ['stump'], themes: ['city', 'village'], role: 'edge', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.2, layer: 'wall',
    gameplay: ['open'], tags: ['tudor', 'window'],
  },
  // shutters open: same plaster surround, dark glazing with a mullion cross,
  // leaves folded to the edges.
  {
    id: 'shutters_open', size: 0.9, wonk: 0.03,
    paths: [
      ...cutout(rect(-0.42, -0.5, 0.84, 1.0), 'plasterDark', 'plaster'),
      { d: rect(-0.22, -0.4, 0.44, 0.8), fill: 'ink' },
      { d: 'M0 -0.4L0 0.4M-0.22 0L0.22 0', stroke: 'steel', sw: 0.04, opacity: 0.7 },
      { d: rect(-0.3, -0.4, 0.08, 0.8) + rect(0.22, -0.4, 0.08, 0.8), fill: 'woodDeep' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.2, layer: 'wall',
  },

  // ── chimney (roof accent) + smoking state ──────────────────────────────────
  // CHIMNEY POT: a plastered brick stack from above with twin terracotta pots.
  {
    id: 'chimneypot', size: 0.75, wonk: 0.03,
    paths: [
      { d: ring(0.34, 0.06, 0.28), fill: 'shadow', opacity: 0.22 },
      ...cutout(rect(-0.3, -0.12, 0.6, 0.62), 'plasterDark', 'plaster'),
      { d: 'M-0.3 0.1L0.3 0.1M-0.3 0.3L0.3 0.3', stroke: 'plasterDark', sw: 0.03, opacity: 0.6 },
      { d: ring(0.13, -0.15, -0.05) + ring(0.13, 0.15, -0.05), fill: 'gourdOrange' },
      { d: ring(0.07, -0.15, -0.05) + ring(0.07, 0.15, -0.05), fill: 'ink' },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'village'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'walkable', footprint: 0.25, layer: 'ground',
    tags: ['tudor', 'roof'],
  },
  // chimney smoking: same stack + pots with a drifting smoke plume (anim).
  {
    id: 'chimneypot_smoke', size: 0.75, wonk: 0.03,
    paths: [
      { d: ring(0.34, 0.06, 0.28), fill: 'shadow', opacity: 0.22 },
      ...cutout(rect(-0.3, -0.12, 0.6, 0.62), 'plasterDark', 'plaster'),
      { d: 'M-0.3 0.1L0.3 0.1M-0.3 0.3L0.3 0.3', stroke: 'plasterDark', sw: 0.03, opacity: 0.6 },
      { d: ring(0.13, -0.15, -0.05) + ring(0.13, 0.15, -0.05), fill: 'gourdOrange' },
      { d: ring(0.07, -0.15, -0.05) + ring(0.07, 0.15, -0.05), fill: 'ink' },
      { d: ring(0.15, 0.15, -0.42) + ring(0.12, 0.02, -0.64) + ring(0.09, 0.16, -0.82), fill: 'snowShade', opacity: 0.4 },
    ],
    kinds: [], tags: ['interactable', 'anim'], anim: true, pass: 'walkable', footprint: 0.25, layer: 'ground',
  },

  // ── overhang / roof structure parts (canopy) ───────────────────────────────
  // JETTY (overhanging upper storey): a timber-framed plaster ledge projecting
  // over the street on diagonal brackets — the Tudor overhang.
  {
    id: 'jetty_upper', size: 1.05, wonk: 0.03,
    paths: [
      { d: rect(-0.64, 0.12, 1.36, 0.32), fill: 'shadow', opacity: 0.22 },
      ...cutout(rect(-0.7, -0.2, 1.4, 0.36), 'plasterDark', 'plaster'),
      { d: 'M-0.7 0.14L0.7 0.14M-0.4 -0.18L-0.4 0.14M0 -0.18L0 0.14M0.4 -0.18L0.4 0.14', stroke: 'timberFrame', sw: 0.05 },
      { d: 'M-0.5 0.18L-0.62 0.44M0.5 0.18L0.62 0.44', stroke: 'wood', sw: 0.06 },
    ],
    kinds: ['stump'], themes: ['city'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'overhang', footprint: 0.5, layer: 'canopy',
    tags: ['tudor', 'overhang'],
  },
  // GABLE ROOF cap (tiled, from above): ridge line splitting a two-tone tile
  // field with course columns.
  {
    id: 'roofgable', size: 1.1, wonk: 0.03,
    paths: [
      { d: rect(-0.66, -0.48, 1.56, 1.2), fill: 'shadow', opacity: 0.2 },
      ...cutout(ROOF_D, 'roofTileDark', 'roofTile'),
      { d: ROOF_BATTENS, stroke: 'roofRidge', sw: 0.025, opacity: 0.4 },
      { d: ROOF_COURSES, stroke: 'roofRidge', sw: 0.03, opacity: 0.5 },
      { d: ROOF_RIDGE, stroke: 'roofRidge', sw: 0.06 },
    ],
    kinds: ['stump'], themes: ['city', 'village'], role: 'accent', rotate: 'upright',
    weight: 0.25, pass: 'overhang', footprint: 0.5, layer: 'canopy',
    tags: ['tudor', 'roof'],
  },
  // THATCH ROOF cap: a bulging straw mass with a rope ridge and an eave fringe.
  {
    id: 'roofthatch', size: 1.1, wonk: 0.03,
    paths: [
      { d: rect(-0.66, -0.46, 1.5, 1.16), fill: 'shadow', opacity: 0.2 },
      { d: THATCH_FRINGE, stroke: 'thatchInk', sw: 0.03 },
      ...cutout(THATCH_D, 'th2', 'th1'),
      { d: THATCH_COURSES, stroke: 'thatchInk', sw: 0.03, opacity: 0.5 },
      { d: THATCH_RIDGE, stroke: 'thatchInk', sw: 0.07 },
    ],
    kinds: ['stump'], themes: ['village', 'farm', 'plains'], role: 'accent', rotate: 'upright',
    weight: 0.25, pass: 'overhang', footprint: 0.5, layer: 'canopy',
    tags: ['building', 'roof'],
  },

  // ── courtyard (flat ground decal) ──────────────────────────────────────────
  // COURTYARD: an irregular patch of pale two-tone cobble setts — a paved
  // accent for legacy maps + the gallery (coexists with spec-side road paving).
  {
    id: 'courtyard', size: 1.15, wonk: 0.03,
    paths: [
      { d: COURT_PATCH, fill: 'roadPave' },
      { d: COURT_SEAMS, stroke: 'roadSeam', sw: 0.035, opacity: 0.55 },
    ],
    kinds: ['rock', 'stump'], themes: ['city'], role: 'field', rotate: 'flat',
    weight: 0.5, pass: 'walkable', footprint: 0.6, layer: 'ground',
    tags: ['cobble', 'flat'],
  },

  // ── invented set-base structures (full scatter meta) ───────────────────────
  // HOUSEWALL: a two-storey plaster facade with a Tudor timber frame, stone
  // plinth, arched door and paired windows — the base block every building set
  // stacks a roof onto.
  {
    id: 'housewall', size: 1.2, wonk: 0.03,
    paths: [
      { d: rect(-0.5, -0.72, 1.2, 1.5), fill: 'shadow', opacity: 0.2 },
      ...cutout(WALL_D, 'plasterDark', 'plaster'),
      { d: rect(-0.62, 0.5, 1.24, 0.24), fill: 'stoneWall' },
      { d: WALL_OPENINGS, fill: 'ink', opacity: 0.85 },
      { d: WALL_TIMBER, stroke: 'timberFrame', sw: 0.055 },
    ],
    kinds: ['tree', 'stump'], themes: ['city', 'village', 'farm'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.5, layer: 'ground', tall: true,
    tags: ['tudor', 'building'], clusterWith: ['roofgable', 'roofthatch'],
  },
  // STEEPLE: a square stone church tower capped by a slate pyramid spire with a
  // cross finial — the church/chapel landmark.
  {
    id: 'steeple', size: 1.15, wonk: 0.03,
    paths: [
      { d: ring(0.5, 0.06, 0.08), fill: 'shadow', opacity: 0.22 },
      ...cutout(STEEPLE_TOWER, 'stoneWallDark', 'stoneWall'),
      ...cutout(STEEPLE_SPIRE, 'roofSlateDark', 'roofSlate'),
      { d: STEEPLE_HIPS, stroke: 'roofRidge', sw: 0.03, opacity: 0.7 },
      { d: STEEPLE_CROSS, stroke: 'cream', sw: 0.045 },
    ],
    kinds: ['tree'], themes: ['city', 'village', 'ruins'], role: 'accent', rotate: 'upright',
    weight: 0.15, pass: 'solid', footprint: 0.5, layer: 'ground', tall: true,
    tags: ['building', 'holy'],
  },
]
