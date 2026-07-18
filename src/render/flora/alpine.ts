// ── Flora catalog: Alpine / tundra flora (edelweiss · frostfern · snowdrop) ──
//
// Cold-biome hardy growth. COMPLETE PropDefs with full inline placement meta —
// entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits.
// props.ts spreads this array into the `stone` bucket (where snow/mountain props
// live), then variants(). Themes are exactly ['mountain','tundra'] per the spec
// table; iced growth carries the `iced` tag and snow/snowShade roles.
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, radialStar, scatterDots, hashString } from './kit'

// EDELWEISS — the woolly alpine star. A double bract-rosette (a larger 8-point
// star overlaid by a smaller rotated 7-point one) reads as the felted, layered
// petals; a tight seeded cluster of golden florets marks the centre.
const EDEL_STAR = radialStar(8, 0.82, 0.3) + radialStar(7, 0.54, 0.2, 0.34)
const EDEL_FLORETS = scatterDots(hashString('edelweiss'), 5, 0.28, 0.05, 0.08)

// SNOWDROP — a nodding white bell on a thin arching stem with two upright
// leaf blades. The teardrop bell droops; a small green ovary caps its neck.
const SNOWDROP_STEMS =
  'M0 0.86Q0.14 0.12 0.05 -0.34M-0.08 0.86Q-0.34 0.18 -0.4 -0.5M0.03 0.86Q0.02 0.1 0.0 -0.62'
const SNOWDROP_BELL =
  'M0.05 -0.34C-0.24 -0.2 -0.26 0.32 0.05 0.46C0.36 0.32 0.34 -0.2 0.05 -0.34Z'

// FROSTFERN — a low frost-dusted frond fan. Pinnate fronds arch from a base;
// the inner set is lit; snow flecks freeze onto the tips for the `iced` read.
const FROSTFERN_DK =
  'M0 0.8Q-0.34 0.05 -0.66 -0.6M0 0.8Q-0.14 0 -0.28 -0.82M0 0.8Q0.02 -0.02 0.02 -0.9M0 0.8Q0.18 0 0.32 -0.8M0 0.8Q0.36 0.06 0.66 -0.56'
const FROSTFERN_LIT =
  'M0 0.8Q-0.14 0 -0.28 -0.82M0 0.8Q0.02 -0.02 0.02 -0.9M0 0.8Q0.18 0 0.32 -0.8'
const FROSTFERN_FROST = scatterDots(hashString('frostfern'), 6, 1.6, 0.05, 0.09)

export const ALPINE_FLORA: PropDef[] = [
  // EDELWEISS: woolly two-tone star rosette + golden floret centre. A rare
  // signature bloom on rock/tundra ground.
  {
    id: 'edelweiss', size: 0.8, wonk: 0.04,
    paths: [
      ...cutout(EDEL_STAR, 'snowShade', 'snow'),
      { d: EDEL_FLORETS, fill: 'petalGold' },
    ],
    kinds: ['flower'], themes: ['mountain', 'tundra'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.12, layer: 'ground',
    tags: ['bloom'], clusterWith: ['edelweiss'],
  },
  // FROSTFERN: low frond fan, frost-flecked tips. A hardy understory filler
  // clumping across cold ground.
  {
    id: 'frostfern', size: 0.95, wonk: 0.04,
    paths: [
      { d: FROSTFERN_DK, stroke: 'foliageDeep', sw: 0.1 },
      { d: FROSTFERN_LIT, stroke: 'pineLit', sw: 0.06, lit: true },
      { d: FROSTFERN_FROST, fill: 'snow', opacity: 0.9 },
    ],
    kinds: ['flower', 'bush'], themes: ['mountain', 'tundra'], role: 'understory', rotate: 'upright',
    weight: 0.5, pass: 'walkable', footprint: 0.22, layer: 'ground',
    tags: ['iced'], clusterWith: ['frostfern'],
  },
  // SNOWDROP: nodding white bell on an arching stem with two leaf blades. A
  // common early-spring ground bloom.
  {
    id: 'snowdrop', size: 0.85, wonk: 0.03,
    paths: [
      { d: SNOWDROP_STEMS, stroke: 'foliage', sw: 0.08 },
      ...cutout(SNOWDROP_BELL, 'snowShade', 'snow'),
      { d: 'M0.05 -0.34A0.09 0.07 0 1 0 0.06 -0.34Z', fill: 'mossBase' },
    ],
    kinds: ['flower'], themes: ['mountain', 'tundra'], role: 'field', rotate: 'upright',
    weight: 0.5, pass: 'walkable', footprint: 0.12, layer: 'ground',
    tags: ['bloom'], clusterWith: ['snowdrop'],
  },
]
