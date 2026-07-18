// ── Flora catalog: Row crops I (cornstalk · pumpkin · sunflower · cabbage · tomato) ──
//
// Cultivated FARM row-crops. COMPLETE PropDefs with full inline placement meta
// (kinds/themes/role/pass/footprint …) so entries flow into TERRAIN_PROPS +
// listAssets with NO shared-file edits. props.ts spreads this array into the
// `grass` bucket and runs it through variants().
//
// Geometry from './kit'; types via `import type` — NEVER runtime-import props.ts.
// Column→field map, palette roles, harvested-state convention: flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, ring, leaf, radialStar, lobeBlob, scatterDots, hashString } from './kit'

// ── cornstalk: tall stem + two arching sword leaves, one golden ear ──
const CORN_STEM = 'M-0.06 0.92C-0.14 0.4 -0.16 -0.3 -0.04 -0.94C0.08 -0.3 0.12 0.4 0.06 0.92Z'
const CORN_GREEN = CORN_STEM + leaf(-0.28, 0.02, 0.46, 0.13, -0.6) + leaf(0.3, 0.12, 0.46, 0.13, 0.6)
const CORN_EAR = 'M-0.07 0.2A0.13 0.28 0 1 0 0.19 0.2A0.13 0.28 0 1 0 -0.07 0.2Z'
const CORN_SILK = 'M0.02 -0.06Q-0.05 -0.2 -0.1 -0.28M0.08 -0.06Q0.1 -0.22 0.13 -0.3M0.13 -0.02Q0.2 -0.16 0.26 -0.24'
// stubble: two short cut stalks, pale severed tips
const CORNSTUB_D = 'M-0.2 0.92C-0.26 0.55 -0.22 0.35 -0.14 0.28C-0.08 0.4 -0.08 0.66 -0.06 0.92ZM0.1 0.92C0.06 0.5 0.12 0.32 0.22 0.26C0.26 0.42 0.24 0.68 0.24 0.92Z'
const CORNSTUB_CUT = 'M-0.16 0.28L-0.05 0.24M0.14 0.26L0.24 0.22'

// ── pumpkin: squat ribbed gourd, wood stem nub, one vine leaf ──
const PUMPKIN_D = 'M-0.64 0.12C-0.68 -0.3 -0.36 -0.52 0 -0.52C0.36 -0.52 0.68 -0.3 0.64 0.12C0.62 0.5 0.34 0.62 0 0.62C-0.34 0.62 -0.62 0.5 -0.64 0.12Z'
const PUMPKIN_RIBS = 'M0 -0.5C-0.02 0 0 0.4 0 0.6M-0.32 -0.42C-0.44 -0.05 -0.4 0.32 -0.3 0.54M0.32 -0.42C0.44 -0.05 0.4 0.32 0.3 0.54'
const PUMPKIN_STEM = 'M-0.06 -0.5L-0.05 -0.74L0.09 -0.74L0.08 -0.5Z'
// harvested: pumpkin gone, low vine coil + severed stem stub
const PUMPKINCUT_VINE = 'M-0.5 0.4C-0.56 0.2 -0.3 0.12 -0.1 0.2C0.1 0.1 0.4 0.16 0.5 0.36C0.56 0.52 0.3 0.6 0 0.58C-0.3 0.6 -0.5 0.56 -0.5 0.4Z'
const PUMPKINCUT_STEM = 'M-0.04 0.2L-0.03 0.02L0.07 0.02L0.06 0.2Z'

// ── sunflower: radial gold bloom + dark seed disc at origin, stem below ──
const SUN_STEM = 'M-0.05 0.94C-0.08 0.5 -0.06 0.2 -0.02 0.02C0.03 0.2 0.07 0.5 0.05 0.94Z'
const SUN_GREEN = SUN_STEM + leaf(-0.24, 0.5, 0.24, 0.11, -0.3) + leaf(0.26, 0.56, 0.24, 0.11, 0.3)
const SUN_PETALS = radialStar(14, 0.6, 0.32)
const SUN_DISC = ring(0.26)
const SUN_SEEDS = scatterDots(hashString('sunflower-seeds'), 7, 0.34, 0.03, 0.05)

// ── cabbage: ruffled outer leaves wrapping a pale tight head ──
const CABBAGE_OUT = lobeBlob(7, 0.82, 0.56)
const CABBAGE_IN = lobeBlob(6, 0.5, 0.32)
const CABBAGE_VEINS = 'M0 0C-0.3 -0.2 -0.5 -0.3 -0.62 -0.4M0 0C0.3 -0.15 0.55 -0.1 0.7 -0.05M0 0C-0.1 0.3 -0.2 0.5 -0.28 0.68M0 0C0.25 0.3 0.4 0.45 0.5 0.6'
// harvested: outer leaves splayed, a cut-stem stump where the head was
const CABBAGECUT_STUMP = ring(0.2)

// ── tomato: bushy foliage on a wooden stake+tie, red fruit ──
const TOMATO_POLE = 'M-0.05 -0.85L0.05 -0.85L0.05 0.92L-0.05 0.92ZM-0.32 -0.36L0.32 -0.36L0.32 -0.26L-0.32 -0.26Z'
const TOMATO_BUSH = lobeBlob(7, 0.62, 0.42, 0, 0.1)
const TOMATO_FRUIT = scatterDots(hashString('tomato-fruit'), 4, 0.9, 0.09, 0.13)

export const CROPS_A: PropDef[] = [
  // cornstalk — tall reed row-crop with a signature golden ear
  {
    id: 'cornstalk', size: 1.15, wonk: 0.05,
    paths: [
      ...cutout(CORN_GREEN, 'foliageDeep', 'foliage'),
      ...cutout(CORN_EAR, 'petalGoldDeep', 'petalGold'),
      { d: CORN_SILK, stroke: 'petalGold', sw: 0.04, opacity: 0.85 },
    ],
    kinds: ['reed'], themes: ['farm', 'plains'], role: 'field', rotate: 'upright',
    weight: 0.9, pass: 'solid', footprint: 0.3, layer: 'ground', tall: true,
    tags: ['row'], gameplay: ['harvestable'], clusterWith: ['cornstalk'],
  },
  { id: 'cornstub', size: 1.15, wonk: 0.05,
    paths: [
      ...cutout(CORNSTUB_D, 'foliageDeep', 'foliage'),
      { d: CORNSTUB_CUT, stroke: 'petalGoldDeep', sw: 0.045, opacity: 0.8 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.22 },

  // pumpkin — squat ribbed gourd; unmistakable wide low orange dome
  {
    id: 'pumpkin', size: 1, wonk: 0.04,
    paths: [
      ...cutout(PUMPKIN_D, 'gourdOrangeDeep', 'gourdOrange'),
      { d: PUMPKIN_RIBS, stroke: 'gourdOrangeDeep', sw: 0.05, opacity: 0.8 },
      { d: PUMPKIN_STEM, fill: 'woodDeep' },
      { d: leaf(0.32, -0.5, 0.2, 0.09, 0.5), fill: 'foliage' },
    ],
    kinds: ['bush'], themes: ['farm', 'plains', 'haunted'], role: 'field', rotate: 'free',
    weight: 0.6, pass: 'solid', footprint: 0.38, layer: 'ground',
    tags: ['row', 'vine'], gameplay: ['harvestable'], clusterWith: ['pumpkin'],
  },
  { id: 'pumpkin_cut', size: 1,
    paths: [
      ...cutout(PUMPKINCUT_VINE, 'foliageDeep', 'foliage'),
      { d: PUMPKINCUT_STEM, fill: 'woodDeep' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.28 },

  // sunflower — big golden radial head with dark seed disc
  {
    id: 'sunflower', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(SUN_GREEN, 'foliageDeep', 'foliage'),
      ...cutout(SUN_PETALS, 'petalGoldDeep', 'petalGold'),
      { d: SUN_DISC, fill: 'woodDeep' },
      { d: SUN_SEEDS, fill: 'ink', opacity: 0.5 },
    ],
    kinds: ['flower'], themes: ['farm', 'plains'], role: 'field', rotate: 'upright',
    weight: 0.6, pass: 'solid', footprint: 0.26, layer: 'ground', tall: true,
    tags: ['row', 'helio'], gameplay: ['harvestable'], clusterWith: ['sunflower'],
  },
  { id: 'sunflower_bare', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(SUN_GREEN, 'foliageDeep', 'foliage'),
      { d: SUN_DISC, fill: 'woodDeep' },
      { d: SUN_SEEDS, fill: 'ink', opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.22 },

  // cabbage — ruffled leaf head wrapping a pale tight core
  {
    id: 'cabbage', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(CABBAGE_OUT, 'foliageDeep', 'foliage'),
      { d: CABBAGE_IN, fill: 'tileMoss', opacity: 0.9 },
      { d: CABBAGE_VEINS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 },
    ],
    kinds: ['bush'], themes: ['farm'], role: 'field', rotate: 'upright',
    weight: 0.7, pass: 'solid', footprint: 0.32, layer: 'ground',
    tags: ['row'], gameplay: ['harvestable'], clusterWith: ['cabbage'],
  },
  { id: 'cabbage_cut', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(CABBAGE_OUT, 'foliageDeep', 'foliage'),
      { d: CABBAGECUT_STUMP, fill: 'canvas' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.28 },

  // tomato — staked bush (reed+bush) hung with red fruit
  {
    id: 'tomato', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(TOMATO_POLE, 'woodDeep', 'wood'),
      ...cutout(TOMATO_BUSH, 'foliageDeep', 'foliage'),
      { d: TOMATO_FRUIT, fill: 'fruitRed' },
    ],
    kinds: ['reed', 'bush'], themes: ['farm'], role: 'field', rotate: 'upright',
    weight: 0.6, pass: 'solid', footprint: 0.36, layer: 'ground', tall: true,
    tags: ['row', 'trellis'], gameplay: ['harvestable'], clusterWith: ['tomato'],
  },
  { id: 'tomato_bare', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(TOMATO_POLE, 'woodDeep', 'wood'),
      ...cutout(TOMATO_BUSH, 'foliageDeep', 'foliage'),
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3 },
]
