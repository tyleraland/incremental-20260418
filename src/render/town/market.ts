// ── Town: Market (fishmonger · produce cart · butcher hook · bakery cart · potter rack · awning · crate · scales) ──
//
// Bucket: PLAZA (city/village fixtures — where `marketstall`/`bench` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with
// NO shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   fishmonger/producecart/bakerycart  role trade → gameplay:['trade'], role:'accent'
//                                      (signature market pieces, low weight)
//   butcherhook           role '-' → role:'edge' (wall-mounted), layer:'wall'
//   cloth_awning          role '-' → role:'accent', layer:'canopy'
//   crateburlap           role search → gameplay:['search'], role:'field'
//   potterrack/scalesweigh role '-' → role:'field'
//
// LAYER: wall-edge (butcherhook) → layer:'wall'; canopy (cloth_awning) →
// layer:'canopy'; rest ground.
//
// COLLISIONS (digest WAVE 3):
//   marketstall → RE-DEFER. Existed before wave 2 and was deferred then; still a
//                 shared prop. Do NOT author it here.
//   crateburlap → FREE (burlap-covered crate; distinct from wave-1 `crate`).
//   fishmonger/producecart/butcherhook/bakerycart/potterrack/cloth_awning/
//   scalesweigh → FREE (no existing analogues).

import type { PropDef } from '@/render/props'
import { cutout, rect, ring, leaf, scatterDots, hashString } from './kit'

// ── fishmonger: a plank slab table with a cream ice bed and a row of three
// silvery fish laid out (steel almonds + ink eyes). Reads as "wet counter".
const FISH_TABLE = rect(-0.72, -0.42, 1.44, 0.84)
const FISH_ICE = rect(-0.6, -0.28, 1.2, 0.56)
const FISH_D =
  leaf(-0.36, -0.02, 0.24, 0.1, 0.08) +
  leaf(0.0, 0.07, 0.26, 0.11, -0.06) +
  leaf(0.36, -0.05, 0.24, 0.1, 0.11)
const FISH_EYES = ring(0.03, -0.13, -0.02) + ring(0.03, 0.25, 0.06) + ring(0.03, 0.6, -0.03)

// ── producecart: an angled plank bed on two wheels, heaped with round produce
// (a gourdOrange pile flecked with fruitRed tomatoes).
const CART_WHEELS = ring(0.16, -0.72, 0.16) + ring(0.16, 0.72, -0.16)
const CART_BED = 'M-0.7 -0.34L0.62 -0.44L0.7 0.34L-0.62 0.44Z'
const PRODUCE_ORANGE = scatterDots(hashString('producecart-o'), 6, 0.9, 0.1, 0.16)
const PRODUCE_RED = scatterDots(hashString('producecart-r'), 3, 0.7, 0.08, 0.12)

// ── butcherhook: a wall rail (wood) with two steel S-hooks and two hanging red
// meat cuts, each with a pale fat streak. Grim market fixture (layer:'wall').
const HOOK_RAIL = rect(-0.82, -0.66, 1.64, 0.16)
const HOOK_S = 'M-0.4 -0.5C-0.5 -0.36 -0.32 -0.34 -0.4 -0.2M0.4 -0.5C0.3 -0.36 0.48 -0.34 0.4 -0.2'
const MEAT_D =
  'M-0.56 -0.16C-0.58 0.2 -0.5 0.5 -0.4 0.5C-0.3 0.5 -0.22 0.2 -0.24 -0.16C-0.26 -0.34 -0.54 -0.34 -0.56 -0.16Z' +
  'M0.24 -0.16C0.22 0.2 0.3 0.5 0.4 0.5C0.5 0.5 0.58 0.2 0.56 -0.16C0.54 -0.34 0.26 -0.34 0.24 -0.16Z'
const MEAT_FAT = 'M-0.4 -0.08L-0.4 0.44M0.4 -0.08L0.4 0.44'

// ── bakerycart: a plank bed on a wheel, heaped with golden two-tone loaves
// (fat ellipses) each scored with a woodDeep bake-slash.
const BAKE_WHEEL = ring(0.17, 0.72, 0.2)
const BAKE_BED = 'M-0.68 -0.3L0.6 -0.4L0.68 0.3L-0.6 0.4Z'
const LOAF_D =
  'M-0.46 -0.06A0.2 0.13 0 1 0 -0.06 -0.06A0.2 0.13 0 1 0 -0.46 -0.06Z' +
  'M0.02 -0.14A0.19 0.12 0 1 0 0.4 -0.14A0.19 0.12 0 1 0 0.02 -0.14Z' +
  'M-0.24 0.2A0.2 0.13 0 1 0 0.16 0.2A0.2 0.13 0 1 0 -0.24 0.2Z'
const LOAF_SCORE = 'M-0.36 -0.1L-0.16 -0.02M0.12 -0.18L0.3 -0.1M-0.14 0.16L0.06 0.24'

// ── potterrack: a wood shelf backing with a 2×3 grid of round terracotta pots
// (gourdOrange rings, dark mouths) split by a shelf seam.
const RACK_BACK = rect(-0.76, -0.5, 1.52, 1.0)
const RACK_SEAM = 'M-0.72 0L0.72 0'
const POT_XS = [-0.42, 0, 0.42]
const POT_YS = [-0.25, 0.25]
const POT_RINGS = POT_YS.flatMap((y) => POT_XS.map((x) => ring(0.18, x, y))).join('')
const POT_MOUTHS = POT_YS.flatMap((y) => POT_XS.map((x) => ring(0.09, x, y))).join('')

// ── cloth_awning: a striped market canopy (bannerBlue field, cream + gold
// stripes) with a scalloped front edge. layer:'canopy'.
const AWN_BASE = 'M-0.78 -0.4L0.78 -0.4L0.66 0.34L-0.66 0.34Z'
const AWN_CREAM = 'M-0.5 -0.4L-0.28 -0.4L-0.24 0.34L-0.44 0.34ZM0.28 -0.4L0.5 -0.4L0.44 0.34L0.24 0.34Z'
const AWN_GOLD = 'M-0.11 -0.4L0.11 -0.4L0.1 0.34L-0.1 0.34Z'
const AWN_SCALLOP =
  'M-0.66 0.34Q-0.55 0.5 -0.44 0.34Q-0.33 0.5 -0.22 0.34Q-0.11 0.5 0 0.34' +
  'Q0.11 0.5 0.22 0.34Q0.33 0.5 0.44 0.34Q0.55 0.5 0.66 0.34Z'

// ── crateburlap: a wood crate topped with a draped burlap sack tied with a
// cord (searchable stash; distinct from the bare `crate`).
const CRB_BOX = rect(-0.6, -0.5, 1.2, 1.0)
const CRB_BURLAP =
  'M-0.56 -0.28C-0.6 -0.62 0.6 -0.62 0.56 -0.28C0.5 -0.04 0.4 0.04 0 0.04C-0.4 0.04 -0.5 -0.04 -0.56 -0.28Z'
const CRB_TIE = 'M-0.4 -0.12Q0 -0.24 0.4 -0.12'

// ── scalesweigh: a balance scale — a rockDeep stand, a two-tone steel beam, and
// two hanging steel pans on chains. Reads as merchant scales.
const SCL_STAND = 'M-0.11 0.44L0.11 0.44L0.05 -0.06L-0.05 -0.06Z'
const SCL_BEAM = rect(-0.66, -0.08, 1.32, 0.13)
const SCL_PANS = ring(0.2, -0.56, 0.16) + ring(0.2, 0.56, 0.16)
const SCL_CHAINS =
  'M-0.62 0.02L-0.68 0.16M-0.62 0.02L-0.44 0.16M0.62 0.02L0.68 0.16M0.62 0.02L0.44 0.16'

export const MARKET: PropDef[] = [
  {
    id: 'fishmonger', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(FISH_TABLE, 'woodDeep', 'wood'),
      { d: FISH_ICE, fill: 'cream', opacity: 0.7 },
      { d: FISH_D, fill: 'steel' },
      { d: FISH_EYES, fill: 'ink' },
    ],
    kinds: ['stump', 'tree'], themes: ['city', 'village', 'beach'], role: 'accent',
    rotate: 'upright', weight: 0.22, pass: 'solid', footprint: 0.42,
    gameplay: ['trade'], tags: ['social', 'fish'],
  },
  {
    id: 'producecart', size: 1.05, wonk: 0.03,
    paths: [
      { d: CART_WHEELS, fill: 'woodLight' },
      ...cutout(CART_BED, 'woodDeep', 'wood'),
      { d: PRODUCE_ORANGE, fill: 'gourdOrange' },
      { d: PRODUCE_RED, fill: 'fruitRed' },
    ],
    kinds: ['stump', 'rock'], themes: ['village', 'farm'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'solid', footprint: 0.38,
    gameplay: ['trade'], tags: ['social'],
  },
  {
    id: 'butcherhook', size: 1, wonk: 0.03,
    paths: [
      ...cutout(HOOK_RAIL, 'woodDeep', 'wood'),
      { d: HOOK_S, stroke: 'steel', sw: 0.05 },
      ...cutout(MEAT_D, 'fruitRedDeep', 'fruitRed'),
      { d: MEAT_FAT, stroke: 'cream', sw: 0.04, opacity: 0.55 },
    ],
    kinds: ['tree', 'stump'], themes: ['city', 'village'], role: 'edge',
    rotate: 'upright', weight: 0.3, pass: 'solid', footprint: 0.3,
    layer: 'wall', tags: ['grim', 'trade'],
  },
  {
    id: 'bakerycart', size: 1.05, wonk: 0.03,
    paths: [
      { d: BAKE_WHEEL, fill: 'woodLight' },
      ...cutout(BAKE_BED, 'woodDeep', 'wood'),
      ...cutout(LOAF_D, 'petalGoldDeep', 'petalGold'),
      { d: LOAF_SCORE, stroke: 'woodDeep', sw: 0.03, opacity: 0.7 },
    ],
    kinds: ['stump'], themes: ['city', 'village'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'solid', footprint: 0.38,
    gameplay: ['trade'], tags: ['social'],
  },
  {
    id: 'potterrack', size: 1.05, wonk: 0.03,
    paths: [
      ...cutout(RACK_BACK, 'woodDeep', 'wood'),
      { d: RACK_SEAM, stroke: 'woodDeep', sw: 0.045, opacity: 0.7 },
      { d: POT_RINGS, fill: 'gourdOrange' },
      { d: POT_MOUTHS, fill: 'gourdOrangeDeep' },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'village'], role: 'field',
    rotate: 'upright', weight: 0.4, pass: 'solid', footprint: 0.36,
    tags: ['trade'],
  },
  {
    id: 'cloth_awning', size: 1, wonk: 0.03,
    paths: [
      { d: AWN_BASE, fill: 'bannerBlue' },
      { d: AWN_CREAM, fill: 'cream' },
      { d: AWN_GOLD, fill: 'bannerGold' },
      { d: AWN_SCALLOP, fill: 'bannerBlue' },
    ],
    kinds: ['flower', 'bush'], themes: ['city', 'village'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'overhang', footprint: 0.45,
    layer: 'canopy', tags: ['cloth', 'color'],
  },
  {
    id: 'crateburlap', size: 1, wonk: 0.04,
    paths: [
      ...cutout(CRB_BOX, 'woodDeep', 'wood'),
      ...cutout(CRB_BURLAP, 'woodDeep', 'canvas'),
      { d: CRB_TIE, stroke: 'woodDeep', sw: 0.045, opacity: 0.7 },
    ],
    kinds: ['stump'], themes: ['city', 'village'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.32,
    gameplay: ['search'], tags: ['sacking'],
  },
  {
    id: 'scalesweigh', size: 0.95, wonk: 0.03,
    paths: [
      { d: SCL_STAND, fill: 'rockDeep' },
      { d: SCL_CHAINS, stroke: 'steel', sw: 0.03 },
      ...cutout(SCL_PANS, 'rockDeep', 'steel'),
      ...cutout(SCL_BEAM, 'rockDeep', 'steel'),
    ],
    kinds: ['rock', 'stump'], themes: ['city'], role: 'field',
    rotate: 'upright', weight: 0.35, pass: 'solid', footprint: 0.26,
    tags: ['trade'],
  },
]
