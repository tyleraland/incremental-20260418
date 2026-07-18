// ── Flora catalog: Row crops II / climbers (grapevine · beanpole · carrottop · hops) ──
//
// Trellised + pole FARM crops. COMPLETE PropDefs with full inline placement meta
// (kinds/themes/role/pass/footprint …) so entries flow into TERRAIN_PROPS +
// listAssets with NO shared-file edits. props.ts spreads this array into the
// `grass` bucket and runs it through variants().
//
// Geometry from './kit'; types via `import type` — NEVER runtime-import props.ts.
// Column→field map, palette roles, harvested-state convention: flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, ring, leaf, rect, lobeBlob } from './kit'

// ── grapevine: two-post trellis draped with grape leaves + hanging purple bunches ──
const GRAPE_TRELLIS =
  rect(-0.46, -0.88, 0.1, 1.76) + rect(0.36, -0.88, 0.1, 1.76) +
  rect(-0.46, -0.42, 0.92, 0.08) + rect(-0.46, 0.2, 0.92, 0.08)
const GRAPE_LEAVES = lobeBlob(5, 0.24, 0.15, -0.02, -0.6) + lobeBlob(5, 0.22, 0.14, 0.16, -0.14)
// a downward-narrowing triangular bunch of berries
const grapeBunch = (cx: number, cy: number): string =>
  ring(0.075, cx - 0.09, cy) + ring(0.075, cx + 0.01, cy) + ring(0.075, cx + 0.11, cy) +
  ring(0.075, cx - 0.04, cy + 0.13) + ring(0.075, cx + 0.06, cy + 0.13) +
  ring(0.075, cx + 0.02, cy + 0.26)
const GRAPES = grapeBunch(-0.14, -0.12) + grapeBunch(0.18, 0.2)

// ── beanpole: single stake spiralled by a bean vine hung with bright pods ──
const BEAN_POLE = rect(-0.06, -0.92, 0.12, 1.84)
const BEAN_VINE = 'M0 0.86C-0.3 0.62 0.3 0.5 0 0.24C-0.3 -0.02 0.3 -0.16 0 -0.44C-0.26 -0.68 0.22 -0.8 0 -0.9'
const BEAN_LEAVES = lobeBlob(4, 0.17, 0.1, -0.24, -0.5) + lobeBlob(4, 0.16, 0.1, 0.24, -0.12) + lobeBlob(4, 0.15, 0.09, -0.2, 0.3)
const BEAN_PODS = leaf(-0.24, 0.05, 0.16, 0.045, 1.5) + leaf(0.24, -0.2, 0.16, 0.045, 1.6) + leaf(-0.16, -0.5, 0.15, 0.045, 1.5)

// ── carrottop: feathery ground greens over an orange crown poking from soil ──
const CARROT_FRONDS_DK = 'M0 0.58Q-0.32 0.08 -0.52 -0.6M0 0.58Q-0.14 0.04 -0.22 -0.82M0 0.58Q0 -0.02 0.02 -0.88M0 0.58Q0.14 0.04 0.26 -0.8M0 0.58Q0.32 0.08 0.54 -0.56'
const CARROT_FRONDS_LIT = 'M0 0.58Q-0.14 0.04 -0.22 -0.82M0 0.58Q0 -0.02 0.02 -0.88M0 0.58Q0.14 0.04 0.26 -0.8'
const CARROT_CROWN = 'M-0.17 0.6C-0.15 0.46 0.15 0.46 0.17 0.6C0.13 0.82 -0.13 0.82 -0.17 0.6Z'
// harvested: an empty soil hole rimmed in dirt, a couple limp leftover leaves
const CARROT_HOLE_RIM = ring(0.3, 0, 0.42)
const CARROT_HOLE = ring(0.19, 0, 0.44)
const CARROT_LIMP = 'M-0.12 0.4Q-0.4 0.34 -0.62 0.46M0.12 0.4Q0.4 0.36 0.6 0.5'

// ── hops: slim string trellis with a bine of leaves + dangling pale cone clusters ──
const HOP_POLE = rect(-0.05, -0.92, 0.1, 1.84)
const HOP_VINE = 'M0 0.86C-0.26 0.6 0.28 0.48 0.02 0.22C-0.24 -0.04 0.28 -0.18 0.02 -0.44C-0.22 -0.68 0.2 -0.8 0 -0.9'
const HOP_LEAVES = lobeBlob(5, 0.2, 0.12, -0.22, -0.45) + lobeBlob(5, 0.18, 0.11, 0.24, -0.05)
const HOP_CONES = leaf(-0.24, 0.1, 0.15, 0.08, 1.5) + leaf(0.22, -0.15, 0.15, 0.08, 1.55) + leaf(-0.02, -0.4, 0.14, 0.08, 1.5)

export const CROPS_B: PropDef[] = [
  // grapevine — wide two-post trellis, its signature the hanging purple bunches
  {
    id: 'grapevine', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(GRAPE_TRELLIS, 'woodDeep', 'wood'),
      ...cutout(GRAPE_LEAVES, 'foliageDeep', 'foliage'),
      { d: GRAPES, fill: 'berryPurple' },
    ],
    kinds: ['reed'], themes: ['farm', 'city'], role: 'edge', rotate: 'upright',
    weight: 0.5, pass: 'solid', footprint: 0.32, layer: 'wall', tall: true,
    tags: ['row', 'trellis'], gameplay: ['harvestable'], clusterWith: ['grapevine'],
  },
  { id: 'grapevine_bare', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(GRAPE_TRELLIS, 'woodDeep', 'wood'),
      ...cutout(GRAPE_LEAVES, 'foliageDeep', 'foliage'),
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.32 },

  // beanpole — single stake with a spiralling vine and bright green pods
  {
    id: 'beanpole', size: 1.1, wonk: 0.05,
    paths: [
      ...cutout(BEAN_POLE, 'woodDeep', 'wood'),
      { d: BEAN_VINE, stroke: 'foliageDeep', sw: 0.07 },
      ...cutout(BEAN_LEAVES, 'foliageDeep', 'foliage'),
      { d: BEAN_PODS, fill: 'tileMoss' },
    ],
    kinds: ['reed'], themes: ['farm'], role: 'field', rotate: 'upright',
    weight: 0.6, pass: 'solid', footprint: 0.26, layer: 'ground', tall: true,
    tags: ['row'], gameplay: ['harvestable'], clusterWith: ['beanpole'],
  },
  { id: 'beanpole_bare', size: 1.1, wonk: 0.05,
    paths: [
      ...cutout(BEAN_POLE, 'woodDeep', 'wood'),
      { d: BEAN_VINE, stroke: 'foliageDeep', sw: 0.07 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.22 },

  // carrottop — low feathery greens over an orange shoulder at the soil line
  {
    id: 'carrottop', size: 0.9, wonk: 0.04,
    paths: [
      { d: CARROT_FRONDS_DK, stroke: 'foliageDeep', sw: 0.09 },
      { d: CARROT_FRONDS_LIT, stroke: 'foliage', sw: 0.055, lit: true },
      ...cutout(CARROT_CROWN, 'gourdOrangeDeep', 'gourdOrange'),
    ],
    kinds: ['flower'], themes: ['farm'], role: 'field', rotate: 'upright',
    weight: 0.7, pass: 'walkable', footprint: 0.18, layer: 'ground',
    tags: ['row', 'root'], gameplay: ['harvestable'], clusterWith: ['carrottop'],
  },
  { id: 'carrot_hole', size: 0.9,
    paths: [
      { d: CARROT_HOLE_RIM, fill: 'dirtPath' },
      { d: CARROT_HOLE, fill: 'ink', opacity: 0.75 },
      { d: CARROT_LIMP, stroke: 'foliageDeep', sw: 0.06, opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.18 },

  // hops — slim string trellis; the pale dangling cone clusters are the read
  {
    id: 'hops', size: 1.1, wonk: 0.05,
    paths: [
      ...cutout(HOP_POLE, 'woodDeep', 'wood'),
      { d: HOP_VINE, stroke: 'foliageDeep', sw: 0.06 },
      ...cutout(HOP_LEAVES, 'foliageDeep', 'foliage'),
      ...cutout(HOP_CONES, 'mossBase', 'tileMoss'),
    ],
    kinds: ['reed'], themes: ['farm'], role: 'edge', rotate: 'upright',
    weight: 0.4, pass: 'solid', footprint: 0.28, layer: 'wall', tall: true,
    tags: ['row', 'trellis'], gameplay: ['harvestable'], clusterWith: ['hops'],
  },
  { id: 'hops_bare', size: 1.1, wonk: 0.05,
    paths: [
      ...cutout(HOP_POLE, 'woodDeep', 'wood'),
      { d: HOP_VINE, stroke: 'foliageDeep', sw: 0.06 },
      ...cutout(HOP_LEAVES, 'foliageDeep', 'foliage'),
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.24 },
]
