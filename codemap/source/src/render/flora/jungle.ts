// ── Flora catalog: Jungle flora (elephant ear · bamboo · tree fern · bromeliad · orchid) ──
//
// Lush JUNGLE broadleaf understory + epiphytes. Entries flow into TERRAIN_PROPS
// + listAssets with NO shared-file edits; props.ts spreads this into the `grass`
// bucket, then variants(). Overhead growth uses layer:'canopy'; the wall-clinging
// orchid uses layer:'wall'. Geometry from './kit' only (type-only PropDef import).
// Full guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, ring, radialStar, lobeBlob } from './kit'

// ── elephant ear: one bold cordate broadleaf + a smaller side leaf, deep basal
//    notch (the taro/colocasia tell), midrib + two lateral veins. ──
const ELEPHANT_LEAF =
  'M0 0.85C-0.4 0.48 -0.8 0 -0.6 -0.5C-0.44 -0.86 -0.1 -0.8 0 -0.46C0.1 -0.8 0.44 -0.86 0.6 -0.5C0.8 0 0.4 0.48 0 0.85Z'
const ELEPHANT_LEAF2 =
  'M-0.34 0.55C-0.54 0.3 -0.78 -0.02 -0.62 -0.34C-0.5 -0.56 -0.26 -0.5 -0.22 -0.24C-0.12 -0.44 0.06 -0.38 0.06 -0.14C0.06 0.14 -0.14 0.4 -0.34 0.55Z'
const ELEPHANT_D = ELEPHANT_LEAF + ELEPHANT_LEAF2
const ELEPHANT_RIB = 'M0 0.8Q-0.06 0.1 -0.02 -0.4M-0.02 0.12Q-0.3 -0.02 -0.44 -0.2M0 0.2Q0.28 0.05 0.42 -0.16'

// ── bamboo: three vertical tapered culms, cream node bands, a spray of top leaves.
//    Companion `bamboo_cut` reuses the culm geometry chopped to diagonal stubs. ──
const BAMBOO_CULMS =
  'M-0.07 0.86L-0.055 -0.88L0.055 -0.88L0.07 0.86Z' +
  'M-0.4 0.86L-0.34 -0.55L-0.24 -0.55L-0.26 0.86Z' +
  'M0.24 0.86L0.27 -0.7L0.37 -0.7L0.34 0.86Z'
const BAMBOO_NODES =
  'M-0.075 -0.5L0.075 -0.5M-0.08 -0.1L0.08 -0.1M-0.085 0.3L0.085 0.3' +
  'M-0.4 -0.28L-0.24 -0.28M-0.42 0.22L-0.25 0.22M0.24 -0.34L0.37 -0.34M0.25 0.16L0.36 0.16'
const BAMBOO_LEAVES =
  'M0 -0.86Q-0.28 -0.96 -0.34 -0.7M0.02 -0.86Q0.24 -1 0.3 -0.72M-0.02 -0.86Q0 -1 -0.16 -0.98' +
  'M-0.3 -0.55Q-0.5 -0.66 -0.5 -0.42M0.32 -0.7Q0.52 -0.82 0.5 -0.58'
const BAMBOO_CUT_CULMS =
  'M-0.07 0.86L-0.06 0.32L0.055 0.4L0.07 0.86Z' +
  'M-0.4 0.86L-0.37 0.45L-0.25 0.5L-0.26 0.86Z' +
  'M0.24 0.86L0.28 0.38L0.37 0.46L0.34 0.86Z'
const BAMBOO_CUT_HOLLOW = ring(0.05, 0, 0.36) + ring(0.045, -0.31, 0.475) + ring(0.05, 0.32, 0.42)
const BAMBOO_CUT_NODE = 'M-0.075 0.6L0.075 0.6M-0.39 0.65L-0.26 0.65M0.25 0.6L0.36 0.6'

// ── tree fern: a feathery radial crown (canopy) with a pale unfurling fiddlehead
//    crozier at the axis — the 'spiral' signature. ──
const FERNTREE_SHADOW = 'M0.14 0.62A0.58 0.3 0 1 0 0.16 0.66Z'
const FERNTREE_CROWN = radialStar(9, 0.88, 0.42)
const FERNTREE_FRONDS =
  'M0 0L0 -0.85M0 0L0.6 -0.6M0 0L0.85 0.05M0 0L0.55 0.62M0 0L-0.05 0.85M0 0L-0.6 0.6M0 0L-0.85 0M0 0L-0.55 -0.62'
const FERNTREE_SPIRAL =
  'M0.02 0.02Q0.14 -0.02 0.12 -0.16Q0.1 -0.3 -0.06 -0.28Q-0.24 -0.26 -0.22 -0.06Q-0.2 0.18 0.06 0.2Q0.34 0.22 0.34 -0.1'

// ── bromeliad: pointed strap-leaf rosette with a bright red central bract +
//    gold flower — the 'color' pop that keeps it off a plain-bush read. ──
const BROMELIAD_ROSETTE = radialStar(8, 0.82, 0.34)
const BROMELIAD_BRACT = radialStar(6, 0.34, 0.14, 0.3)
const BROMELIAD_CENTER = ring(0.1)

// ── orchid: a wall-clinging epiphyte — two two-tone strap pads, a fan of aerial
//    roots, and a spray of three mauve blooms with gold throats. Companion
//    `orchid_bare` keeps the pads + roots, blooms spent to small nubs. ──
const ORCHID_PADS =
  'M0 0.1C-0.3 0.15 -0.6 0.35 -0.7 0.62C-0.44 0.4 -0.14 0.34 0.04 0.4C-0.02 0.2 0 0.14 0 0.1Z' +
  'M0.05 0.12C0.32 0.18 0.58 0.4 0.66 0.66C0.44 0.42 0.16 0.36 0.02 0.42C0.06 0.22 0.06 0.16 0.05 0.12Z'
const ORCHID_ROOTS = 'M-0.1 0.3Q-0.3 0.6 -0.2 0.85M0.05 0.32Q0.2 0.62 0.12 0.86M-0.02 0.34Q-0.02 0.6 -0.04 0.88'
const ORCHID_BLOOMS = lobeBlob(5, 0.22, 0.1, -0.3, -0.4) + lobeBlob(5, 0.2, 0.09, 0.18, -0.55) + lobeBlob(5, 0.16, 0.07, 0.42, -0.18)
const ORCHID_THROATS = ring(0.07, -0.3, -0.4) + ring(0.06, 0.18, -0.55) + ring(0.05, 0.42, -0.18)
const ORCHID_NUBS = 'M-0.3 -0.34L-0.3 -0.46M0.18 -0.48L0.18 -0.6M0.42 -0.12L0.42 -0.24'

export const JUNGLE_FLORA: PropDef[] = [
  // ELEPHANT EAR — giant cordate broadleaf understory clump.
  {
    id: 'elephantear', size: 1.15, wonk: 0.04,
    paths: [
      ...cutout(ELEPHANT_D, 'foliageDeep', 'foliage'),
      { d: ELEPHANT_RIB, stroke: 'foliageDeep', sw: 0.05, opacity: 0.75 },
    ],
    kinds: ['bush'], themes: ['jungle'], role: 'understory', rotate: 'upright',
    weight: 0.6, pass: 'solid', footprint: 0.35, layer: 'ground', tags: ['broadleaf'],
  },
  // BAMBOO — segmented culm cluster; harvestable (state pair: bamboo_cut).
  {
    id: 'bamboo', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(BAMBOO_CULMS, 'foliage', 'pineLit'),
      { d: BAMBOO_NODES, stroke: 'cream', sw: 0.05 },
      { d: BAMBOO_LEAVES, stroke: 'foliageDeep', sw: 0.06 },
    ],
    kinds: ['reed'], themes: ['jungle', 'city'], role: 'cluster', rotate: 'upright',
    weight: 0.6, pass: 'solid', footprint: 0.3, layer: 'ground', tall: true,
    tags: ['pole'], gameplay: ['harvestable'], clusterWith: ['bamboo'],
    sim: { statePair: 'bamboo_cut', resource: { respawn: 'slow' } },
  },
  // BAMBOO_CUT — harvested state: same culms chopped to diagonal stubs, hollow tops.
  {
    id: 'bamboo_cut', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(BAMBOO_CUT_CULMS, 'foliage', 'pineLit'),
      { d: BAMBOO_CUT_HOLLOW, fill: 'cream', opacity: 0.7 },
      { d: BAMBOO_CUT_NODE, stroke: 'cream', sw: 0.05 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25, layer: 'ground',
  },
  // TREE FERN — feathery radial canopy crown with a fiddlehead spiral centre.
  {
    id: 'ferntree', size: 1.25, wonk: 0.04,
    paths: [
      { d: FERNTREE_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(FERNTREE_CROWN, 'foliageDeep', 'foliage'),
      { d: FERNTREE_FRONDS, stroke: 'foliage', sw: 0.045, lit: true },
      { d: FERNTREE_SPIRAL, stroke: 'cream', sw: 0.045, opacity: 0.7 },
    ],
    kinds: ['tree'], themes: ['jungle', 'forest'], role: 'cluster', rotate: 'upright',
    weight: 0.4, pass: 'overhang', footprint: 0.5, layer: 'canopy', tall: true, tags: ['spiral'],
  },
  // BROMELIAD — strap-leaf rosette with a vivid red bract + gold flower.
  {
    id: 'bromeliad', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(BROMELIAD_ROSETTE, 'foliageDeep', 'foliage'),
      { d: BROMELIAD_BRACT, fill: 'fruitRed' },
      { d: BROMELIAD_CENTER, fill: 'petalGold' },
    ],
    kinds: ['flower'], themes: ['jungle'], role: 'understory', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.2, layer: 'ground', tags: ['color'],
  },
  // ORCHID — wall-clinging epiphyte spray; harvestable (state pair: orchid_bare).
  {
    id: 'orchid', size: 0.85, wonk: 0.04,
    paths: [
      ...cutout(ORCHID_PADS, 'foliageDeep', 'foliage'),
      { d: ORCHID_ROOTS, stroke: 'foliageDeep', sw: 0.04, opacity: 0.7 },
      { d: ORCHID_BLOOMS, fill: 'bloom' },
      { d: ORCHID_THROATS, fill: 'petalGold' },
    ],
    kinds: ['flower'], themes: ['jungle', 'arcane'], role: 'understory', rotate: 'free',
    weight: 0.3, pass: 'walkable', footprint: 0.18, layer: 'wall',
    tags: ['epiphyte'], gameplay: ['harvestable'], clusterWith: ['orchid'],
    anchor: ['wall'], orient: 'face-open',
    sim: { statePair: 'orchid_bare', resource: { respawn: 'slow' } },
  },
  // ORCHID_BARE — harvested state: same pads + roots, blooms plucked to nubs.
  {
    id: 'orchid_bare', size: 0.85, wonk: 0.04,
    paths: [
      ...cutout(ORCHID_PADS, 'foliageDeep', 'foliage'),
      { d: ORCHID_ROOTS, stroke: 'foliageDeep', sw: 0.04, opacity: 0.7 },
      { d: ORCHID_NUBS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.8 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.15, layer: 'wall', rotate: 'free',
  },
]
