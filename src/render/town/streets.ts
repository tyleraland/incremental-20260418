// ── Town: Streets (paving decals · gates · walls · fences · archway · bridge · stocks · gallows · cross) ──
//
// Bucket: PLAZA (city/village fixtures). Builder: fill COMPLETE PropDefs — flow
// into TERRAIN_PROPS + listAssets with NO shared-file edits; props.ts spreads
// into `plaza`, then variants(). Geometry from './kit' only. Full guide:
// scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   cobbleroad/dirtlane   role edge → role:'edge' (real role), flat decals
//   towngate              role BARRIER → pass:'solid' + gameplay:['barrier','open'],
//                         role:'accent' (landmark), state gate_open
//   townwall              role BARRIER → pass:'solid' + gameplay:['barrier'], role:'edge'
//   woodenfence/wattlefence/stonewall_low  role edge → role:'edge'
//   footbridge            role edge → role:'edge'
//   archway/stocks/gallows/marketcross  role '-' → role:'accent' (landmarks)
//   wellstone             role gather → DEFERRED (see collisions)
//
// LAYER: all ground here. Flat paving decals (cobbleroad/dirtlane/courtyard-kin)
// → rotate:'flat', pass:'walkable', layer:'ground' — a DECAL, distinct from the
// terrain surface-material road system (they coexist; decal is accent/legacy).
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   woodenfence  → DEFER to existing `fencerun`. Do NOT author woodenfence.
//   wellstone    → DEFER to existing `well`.
//   towngate/footbridge/wattlefence/stonewall_low/archway/stocks/gallows/
//   marketcross → FREE.
//
// The `watchtower` 'set' row is a SCATTER_SETS prefab (NOT a prop). This group
// owns one brand-new base member for it:
//   towerbody — round stone watchtower shaft (watchtower set; reuse roofgable as cap)

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, polyPath, blobPath, roughCircle, hash01, hashString } from './kit'

// ── local seeded emitters ────────────────────────────────────────────────────

// A grid of jittered cobble discs filling a band (top-down paving read).
function cobblesBand(seed: number, cols: number, rows: number, halfW: number, halfH: number, r: number): string {
  let d = ''
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const s = seed + ix * 131 + iy * 977
      const jx = (hash01(s) - 0.5) * 0.14
      const jy = (hash01(s + 7) - 0.5) * 0.1
      const x = -halfW + ((ix + 0.5) / cols) * 2 * halfW + jx
      const y = -halfH + ((iy + 0.5) / rows) * 2 * halfH + jy
      d += ring(r * (0.78 + hash01(s + 3) * 0.34), x, y)
    }
  }
  return d
}

// `n` small square merlons stepped around a circle rim (battlement crenellation).
function rimMerlons(n: number, r: number, s: number): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    d += rect(Math.cos(a) * r - s / 2, Math.sin(a) * r - s / 2, s, s)
  }
  return d
}

// ── shared silhouettes ───────────────────────────────────────────────────────

// Cobbled road strip (slightly irregular horizontal band).
const COBBLE_BAND = polyPath([
  { x: -0.86, y: -0.3 }, { x: -0.4, y: -0.34 }, { x: 0.4, y: -0.32 }, { x: 0.86, y: -0.3 },
  { x: 0.86, y: 0.3 }, { x: 0.4, y: 0.33 }, { x: -0.4, y: 0.32 }, { x: -0.86, y: 0.3 },
])
const COBBLE_SETTS = cobblesBand(hashString('cobbleroad'), 6, 3, 0.76, 0.22, 0.13)

// Dirt lane strip + twin wheel ruts + loose pebbles.
const DIRT_BAND = polyPath([
  { x: -0.85, y: -0.28 }, { x: -0.3, y: -0.32 }, { x: 0.35, y: -0.3 }, { x: 0.85, y: -0.26 },
  { x: 0.85, y: 0.28 }, { x: 0.3, y: 0.32 }, { x: -0.35, y: 0.3 }, { x: -0.85, y: 0.26 },
])
const DIRT_RUTS = 'M-0.78 -0.11Q0 -0.15 0.78 -0.11M-0.78 0.11Q0 0.15 0.78 0.11'
const DIRT_PEBBLES =
  ring(0.05, -0.5, 0.02) + ring(0.045, 0.12, -0.06) + ring(0.055, 0.56, 0.05) + ring(0.04, -0.14, 0.2)

// Town gate: two stone piers flanking closed timber doors.
const GATE_PIER_L = rect(-0.8, -0.6, 0.32, 1.2)
const GATE_PIER_R = rect(0.48, -0.6, 0.32, 1.2)
const GATE_DOOR_L = rect(-0.48, -0.44, 0.48, 0.88)
const GATE_DOOR_R = rect(0, -0.44, 0.48, 0.88)
const GATE_PLANKS = 'M-0.32 -0.42L-0.32 0.42M-0.16 -0.42L-0.16 0.42M0.16 -0.42L0.16 0.42M0.32 -0.42L0.32 0.42'
const GATE_STUDS = ring(0.035, -0.34, -0.3) + ring(0.035, -0.34, 0.3) + ring(0.035, 0.34, -0.3) + ring(0.035, 0.34, 0.3)
// merlon squares along the outer ends of both piers (top-down battlement read)
const GATE_CRENEL = rect(-0.78, -0.66, 0.1, 0.1) + rect(-0.58, -0.66, 0.1, 0.1) + rect(0.5, -0.66, 0.1, 0.1) + rect(0.7, -0.66, 0.1, 0.1)
// Gate open: void between piers, leaves folded back against the pier inner faces.
const GATE_VOID = rect(-0.36, -0.44, 0.72, 0.88)
const GATE_LEAF_L = rect(-0.46, -0.44, 0.1, 0.88)
const GATE_LEAF_R = rect(0.36, -0.44, 0.1, 0.88)

// Town wall: a thick masonry band with a crenellated top edge + running-bond seams.
const WALL_BAND = rect(-0.85, -0.2, 1.7, 0.48)
const WALL_MERLONS =
  rect(-0.78, -0.32, 0.16, 0.12) + rect(-0.42, -0.32, 0.16, 0.12) + rect(-0.06, -0.32, 0.16, 0.12) +
  rect(0.3, -0.32, 0.16, 0.12) + rect(0.62, -0.32, 0.16, 0.12)
const WALL_SEAMS =
  'M-0.85 0.04L0.85 0.04M-0.6 -0.2L-0.6 0.04M-0.24 0.04L-0.24 0.28M0.12 -0.2L0.12 0.04M0.48 0.04L0.48 0.28'

// Wattle fence: woven withies (wavy horizontal bands) between upright stakes.
const WATTLE_POSTS = rect(-0.66, -0.32, 0.09, 0.66) + rect(-0.24, -0.32, 0.09, 0.66) + rect(0.18, -0.32, 0.09, 0.66) + rect(0.6, -0.32, 0.09, 0.66)
const WATTLE_WEAVE_A = 'M-0.78 -0.16Q-0.5 -0.24 -0.22 -0.16Q0.06 -0.08 0.34 -0.16Q0.62 -0.24 0.82 -0.16'
const WATTLE_WEAVE_B = 'M-0.78 0.04Q-0.5 -0.04 -0.22 0.04Q0.06 0.12 0.34 0.04Q0.62 -0.04 0.82 0.04'
const WATTLE_WEAVE_C = 'M-0.78 0.22Q-0.5 0.14 -0.22 0.22Q0.06 0.3 0.34 0.22Q0.62 0.14 0.82 0.22'

// Dry-stone low wall: a lumpy run of stacked field stones + division seams.
const STONEWALL_BAND = blobPath([
  { x: -0.84, y: -0.16 }, { x: -0.4, y: -0.24 }, { x: 0.1, y: -0.18 }, { x: 0.5, y: -0.24 }, { x: 0.84, y: -0.14 },
  { x: 0.84, y: 0.22 }, { x: 0.4, y: 0.28 }, { x: -0.1, y: 0.2 }, { x: -0.5, y: 0.28 }, { x: -0.84, y: 0.2 },
])
const STONEWALL_CAPS =
  ring(0.14, -0.56, -0.02) + ring(0.13, -0.18, 0.02) + ring(0.15, 0.24, -0.03) + ring(0.13, 0.6, 0.03)
const STONEWALL_SEAMS = 'M-0.38 -0.2L-0.34 0.24M0.06 -0.16L0.1 0.22M0.44 -0.2L0.42 0.24'

// Freestanding stone archway: two piers joined by a semicircular voussoir ring.
const ARCH_PIER_L = rect(-0.62, -0.02, 0.28, 0.72)
const ARCH_PIER_R = rect(0.34, -0.02, 0.28, 0.72)
const ARCH_RING = 'M-0.62 0A0.62 0.62 0 0 1 0.62 0L0.34 0A0.34 0.34 0 0 0 -0.34 0Z'
const ARCH_VOUSSOIRS = 'M-0.48 0L-0.26 -0.34M0 -0.62L0 -0.34M0.48 0L0.26 -0.34'
const ARCH_KEYSTONE = 'M-0.08 -0.34L0.08 -0.34L0.06 -0.62L-0.06 -0.62Z'

// Arched footbridge: a bowed (humpbacked) plank deck with cross-planks + rails.
const BRIDGE_DECK = polyPath([
  { x: -0.7, y: -0.26 }, { x: -0.4, y: -0.34 }, { x: 0, y: -0.36 }, { x: 0.4, y: -0.34 }, { x: 0.7, y: -0.26 },
  { x: 0.7, y: 0.26 }, { x: 0.4, y: 0.34 }, { x: 0, y: 0.36 }, { x: -0.4, y: 0.34 }, { x: -0.7, y: 0.26 },
])
const BRIDGE_PLANKS = 'M-0.5 -0.3L-0.5 0.3M-0.25 -0.34L-0.25 0.34M0 -0.36L0 0.36M0.25 -0.34L0.25 0.34M0.5 -0.3L0.5 0.3'
const BRIDGE_RAILS = 'M-0.7 -0.28Q0 -0.4 0.7 -0.28M-0.7 0.28Q0 0.4 0.7 0.28'

// Stocks: a horizontal pillory board with head + hand holes on two posts.
const STOCKS_POSTS = rect(-0.44, -0.02, 0.12, 0.6) + rect(0.32, -0.02, 0.12, 0.6)
const STOCKS_BEAM = rect(-0.56, -0.16, 1.12, 0.3)
const STOCKS_HOLES = ring(0.09, 0, -0.01) + ring(0.06, -0.32, -0.01) + ring(0.06, 0.32, -0.01)
const STOCKS_SPLIT = 'M-0.56 0L0.56 0'

// Gallows: a scaffold deck, upright post, cross-arm and dangling noose.
const GALLOWS_DECK = rect(-0.56, -0.5, 0.72, 1.0)
const GALLOWS_TRAP = 'M-0.44 -0.1L-0.02 -0.1L-0.02 0.34L-0.44 0.34Z'
const GALLOWS_POST = rect(-0.28, -0.62, 0.14, 1.24)
const GALLOWS_ARM = 'M-0.21 -0.55L0.5 -0.55'
const GALLOWS_NOOSE = 'M0.42 -0.5L0.42 -0.28'

// Market cross: a stepped octagonal plinth with a central shaft + cross finial.
const MC_STEP1 = polyPath(roughCircle(0, 0, 0.72, 8, hashString('marketcross-1')))
const MC_STEP2 = polyPath(roughCircle(0, 0, 0.5, 8, hashString('marketcross-2')))
const MC_STEP3 = polyPath(roughCircle(0, 0, 0.32, 8, hashString('marketcross-3')))
const MC_SHAFT = ring(0.13)
const MC_CROSS = 'M0 -0.2L0 0.2M-0.14 -0.06L0.14 -0.06'

// Watchtower shaft (top-down): big stone drum, rim merlons, course rings, arrow slit.
const TOWER_DRUM = ring(0.62)
const TOWER_MERLONS = rimMerlons(8, 0.62, 0.16)
const TOWER_COURSES = ring(0.44) + ring(0.24)
const TOWER_SLIT = 'M-0.03 -0.34L0.03 -0.34L0.02 0.02L-0.02 0.02Z'

// ── props ────────────────────────────────────────────────────────────────────

export const STREETS: PropDef[] = [
  // ── paving decals (flat ground) ──────────────────────────────────────────
  // COBBLE ROAD: a strip of pale two-tone setts — a paved road accent for legacy
  // maps + the gallery (coexists with the spec-side surface road system).
  {
    id: 'cobbleroad', size: 1.15, wonk: 0.03,
    paths: [
      ...cutout(COBBLE_BAND, 'roadSeam', 'roadPave'),
      { d: COBBLE_SETTS, fill: 'roadPaveLit', opacity: 0.9 },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'village'], role: 'edge', rotate: 'flat',
    weight: 0.5, pass: 'walkable', footprint: 0.55, layer: 'ground',
    tags: ['flat', 'path'],
  },
  // DIRT LANE: a browner packed-earth strip with twin wheel ruts + loose pebbles.
  {
    id: 'dirtlane', size: 1.15, wonk: 0.03,
    paths: [
      ...cutout(DIRT_BAND, 'dirtPath', 'sand'),
      { d: DIRT_RUTS, stroke: 'ink', sw: 0.04, opacity: 0.4 },
      { d: DIRT_PEBBLES, fill: 'rock', opacity: 0.85 },
    ],
    kinds: ['rock'], themes: ['village', 'farm'], role: 'edge', rotate: 'flat',
    weight: 0.5, pass: 'walkable', footprint: 0.55, layer: 'ground',
    tags: ['flat', 'path'],
  },

  // ── gate (barrier) + open state ──────────────────────────────────────────
  // TOWN GATE (closed): twin crenellated stone piers flanking studded timber
  // doors meeting at a centre seam — the walled-city entrance.
  {
    id: 'towngate', size: 1.2, wonk: 0.03,
    paths: [
      { d: GATE_CRENEL, fill: 'stoneWallDark' },
      ...cutout(GATE_PIER_L, 'stoneWallDark', 'stoneWall'),
      ...cutout(GATE_PIER_R, 'stoneWallDark', 'stoneWall'),
      ...cutout(GATE_DOOR_L, 'woodDeep', 'wood'),
      ...cutout(GATE_DOOR_R, 'woodDeep', 'wood'),
      { d: GATE_PLANKS, stroke: 'ink', sw: 0.03, opacity: 0.5 },
      { d: 'M0 -0.44L0 0.44', stroke: 'ink', sw: 0.05 },
      { d: GATE_STUDS, fill: 'ink' },
    ],
    kinds: ['stump', 'tree'], themes: ['city'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.55, layer: 'ground', tall: true, maxPerChunk: 1,
    gameplay: ['barrier', 'open'], tags: ['structure'],
  },
  // gate open: same piers + crenellation, dark gateway void, both leaves folded
  // back flat against the pier inner faces.
  {
    id: 'gate_open', size: 1.2, wonk: 0.03,
    paths: [
      { d: GATE_CRENEL, fill: 'stoneWallDark' },
      ...cutout(GATE_PIER_L, 'stoneWallDark', 'stoneWall'),
      ...cutout(GATE_PIER_R, 'stoneWallDark', 'stoneWall'),
      { d: GATE_VOID, fill: 'ink', opacity: 0.9 },
      ...cutout(GATE_LEAF_L, 'woodDeep', 'wood'),
      ...cutout(GATE_LEAF_R, 'woodDeep', 'wood'),
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.55, layer: 'ground',
  },

  // ── town wall (barrier / edge) ───────────────────────────────────────────
  // TOWN WALL: a thick two-tone masonry band, crenellated top edge and running-
  // bond seams — the city curtain-wall segment.
  {
    id: 'townwall', size: 1.2, wonk: 0.03,
    paths: [
      { d: WALL_MERLONS, fill: 'stoneWallDark' },
      ...cutout(WALL_BAND, 'stoneWallDark', 'stoneWall'),
      { d: WALL_SEAMS, stroke: 'mortarInk', sw: 0.03, opacity: 0.7 },
    ],
    kinds: ['rock', 'stump'], themes: ['city'], role: 'edge', rotate: 'upright',
    weight: 0.5, pass: 'solid', footprint: 0.5, layer: 'ground',
    gameplay: ['barrier'], tags: ['structure'],
  },

  // ── fences (edge) ────────────────────────────────────────────────────────
  // WATTLE FENCE: woven willow withies threading over-under between upright
  // stakes — the rustic hurdle fence.
  {
    id: 'wattlefence', size: 1.05, wonk: 0.03,
    paths: [
      { d: WATTLE_POSTS, fill: 'woodDeep' },
      { d: WATTLE_WEAVE_A, stroke: 'canvas', sw: 0.06 },
      { d: WATTLE_WEAVE_B, stroke: 'cream', sw: 0.055, opacity: 0.85 },
      { d: WATTLE_WEAVE_C, stroke: 'canvas', sw: 0.06 },
    ],
    kinds: ['reed', 'stump'], themes: ['village', 'farm'], role: 'edge', rotate: 'upright',
    weight: 0.5, pass: 'solid', footprint: 0.28, layer: 'ground',
    tags: ['fence', 'wattle'],
  },
  // LOW STONE WALL: a lumpy dry-stone run of stacked field stones with lit caps
  // and division seams — the pasture boundary.
  {
    id: 'stonewall_low', size: 1.05, wonk: 0.035,
    paths: [
      ...cutout(STONEWALL_BAND, 'rockDeep', 'rock'),
      { d: STONEWALL_CAPS, fill: 'stoneBase', opacity: 0.85 },
      { d: STONEWALL_SEAMS, stroke: 'mortarInk', sw: 0.03, opacity: 0.6 },
    ],
    kinds: ['rock', 'stump'], themes: ['village', 'farm'], role: 'edge', rotate: 'upright',
    weight: 0.5, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['fence'],
  },

  // ── archway (accent) ─────────────────────────────────────────────────────
  // ARCHWAY: a freestanding dressed-stone arch — two piers spanned by a
  // semicircular voussoir ring with a keystone; a city/ruin landmark.
  {
    id: 'archway', size: 1.15, wonk: 0.025,
    paths: [
      { d: ring(0.5, 0, 0.4), fill: 'shadow', opacity: 0.2 },
      ...cutout(ARCH_PIER_L, 'stoneWallDark', 'stoneWall'),
      ...cutout(ARCH_PIER_R, 'stoneWallDark', 'stoneWall'),
      ...cutout(ARCH_RING, 'stoneWallDark', 'stoneWall'),
      { d: ARCH_VOUSSOIRS, stroke: 'mortarInk', sw: 0.03, opacity: 0.7 },
      ...cutout(ARCH_KEYSTONE, 'stoneWallDark', 'stoneWall'),
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'ruins'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.5, layer: 'ground', tall: true, maxPerChunk: 1,
    tags: ['structure'],
  },

  // ── footbridge (edge) ────────────────────────────────────────────────────
  // FOOTBRIDGE: a bowed humpback plank deck with cross-planks between two arched
  // side rails — the ornamental town-garden crossing (distinct from bridgeplank).
  {
    id: 'footbridge', size: 1.2, wonk: 0.03,
    paths: [
      { d: BRIDGE_RAILS, stroke: 'woodDeep', sw: 0.1 },
      ...cutout(BRIDGE_DECK, 'woodDeep', 'wood'),
      { d: BRIDGE_PLANKS, stroke: 'ink', sw: 0.03, opacity: 0.5 },
      { d: BRIDGE_RAILS, stroke: 'woodLight', sw: 0.04, opacity: 0.8 },
    ],
    kinds: ['stump', 'rock'], themes: ['city', 'village'], role: 'edge', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.4, layer: 'ground',
    tags: ['bridge'],
  },

  // ── stocks / gallows / market cross (accents) ────────────────────────────
  // STOCKS: a pillory board with a head hole and two hand holes on twin posts —
  // the village-green punishment fixture.
  {
    id: 'stocks', size: 0.9, wonk: 0.03,
    paths: [
      { d: STOCKS_POSTS, fill: 'woodDeep' },
      ...cutout(STOCKS_BEAM, 'woodDeep', 'wood'),
      { d: STOCKS_SPLIT, stroke: 'ink', sw: 0.03, opacity: 0.6 },
      { d: STOCKS_HOLES, fill: 'ink' },
    ],
    kinds: ['tree', 'stump'], themes: ['city', 'village'], role: 'accent', rotate: 'upright',
    weight: 0.25, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['social', 'grim'],
  },
  // GALLOWS: a scaffold deck with a trapdoor, an upright post, cross-arm and a
  // dangling noose — the grim town-square execution frame.
  {
    id: 'gallows', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(GALLOWS_DECK, 'woodDeep', 'wood'),
      { d: GALLOWS_TRAP, fill: 'ink', opacity: 0.7 },
      { d: GALLOWS_POST, fill: 'woodDeep' },
      { d: GALLOWS_ARM, stroke: 'woodDeep', sw: 0.08 },
      { d: GALLOWS_NOOSE, stroke: 'canvas', sw: 0.05 },
      { d: ring(0.06, 0.42, -0.24), fill: 'canvas' },
      { d: ring(0.03, 0.42, -0.24), fill: 'ink' },
    ],
    kinds: ['tree', 'stump'], themes: ['city', 'haunted'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.4, layer: 'ground', tall: true, maxPerChunk: 1,
    tags: ['grim', 'lore'],
  },
  // MARKET CROSS: a stepped octagonal stone plinth rising to a central shaft
  // topped by a cross finial — the market-square meeting landmark.
  {
    id: 'marketcross', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(MC_STEP1, 'stoneWallDark', 'stoneWall'),
      ...cutout(MC_STEP2, 'stoneWallDark', 'stoneWall'),
      ...cutout(MC_STEP3, 'mortarInk', 'stoneWall'),
      { d: MC_SHAFT, fill: 'stoneWall' },
      { d: MC_CROSS, stroke: 'cream', sw: 0.045 },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'village'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.45, layer: 'ground', maxPerChunk: 1,
    tags: ['social', 'landmark'],
  },

  // ── invented set-base member (watchtower set) ────────────────────────────
  // TOWER BODY: a round stone watchtower drum from above — crenellated rim,
  // concentric course rings and an arrow slit. The orchestrator caps it with
  // roofgable to wire the `watchtower` SCATTER_SETS prefab post-build.
  {
    id: 'towerbody', size: 1.2, wonk: 0.03,
    paths: [
      { d: ring(0.6, 0.05, 0.06), fill: 'shadow', opacity: 0.22 },
      { d: TOWER_MERLONS, fill: 'stoneWallDark' },
      ...cutout(TOWER_DRUM, 'stoneWallDark', 'stoneWall'),
      { d: TOWER_COURSES, stroke: 'mortarInk', sw: 0.03, opacity: 0.6 },
      { d: TOWER_SLIT, fill: 'ink' },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'ruins'], role: 'accent', rotate: 'free',
    weight: 0.15, pass: 'solid', footprint: 0.55, layer: 'ground', tall: true, maxPerChunk: 1,
    tags: ['structure'], clusterWith: ['roofgable'],
  },
]
