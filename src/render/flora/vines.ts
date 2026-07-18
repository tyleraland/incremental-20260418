// ── Flora catalog: Climbing vines / creepers / ivy / overgrowth ──
//
// Trailing + wall-climbing growth (jungle drape, ivy sheet, kudzu blanket,
// wisteria raceme, thorn creeper). Builder-authored COMPLETE PropDefs (full
// inline placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this into the `grass` bucket, then
// variants(). Wall/drape growth uses layer:'wall' or 'ceiling'.
//
// Geometry from './kit' only (type-only import of PropDef). Guide: flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, leaf, lobeBlob, ring } from './kit'

// ── junglevine: thick cords draping from a top bar, each ending in a broad
//    jungle leaf, a couple mid-cord leaves. Reads as a heavy hanging drape. ──
const JV_CORDS =
  'M-0.7 -0.7Q-0.78 0 -0.6 0.7M-0.3 -0.75Q-0.24 0.05 -0.34 0.78M0.1 -0.75Q0.18 0.05 0.06 0.8M0.5 -0.72Q0.6 0 0.44 0.72'
const JV_CORDS_LIT = 'M-0.3 -0.75Q-0.24 0.05 -0.34 0.78M0.1 -0.75Q0.18 0.05 0.06 0.8'
const JV_LEAVES_DEEP = [
  leaf(-0.62, 0.66, 0.17, 0.1, 1.9),
  leaf(-0.34, 0.74, 0.18, 0.11, 1.6),
  leaf(0.06, 0.76, 0.18, 0.11, 1.5),
  leaf(0.46, 0.68, 0.17, 0.1, 1.2),
  leaf(-0.72, 0.14, 0.14, 0.08, 1.75),
  leaf(0.16, 0.2, 0.14, 0.08, 1.4),
].join('')
const JV_LEAVES_LIT = [leaf(-0.34, 0.74, 0.18, 0.11, 1.6), leaf(0.06, 0.76, 0.18, 0.11, 1.5)].join('')

// ── ivy: a spreading wall sheet — branching stems + a scatter of small trefoil
//    leaves filling the patch, lit subset up-left. ──
const IVY_STEMS =
  'M-0.72 0.62Q-0.42 0.24 -0.5 -0.28Q-0.56 -0.62 -0.22 -0.72M0.08 0.72Q0.32 0.26 0.22 -0.18Q0.16 -0.5 0.5 -0.62M-0.5 -0.28Q-0.1 -0.34 0.22 -0.18'
const IVY_LEAVES_DEEP = [
  leaf(-0.62, 0.5, 0.15, 0.11, 0.6),
  leaf(-0.5, 0.02, 0.15, 0.11, 2.4),
  leaf(-0.4, -0.5, 0.14, 0.1, 1.1),
  leaf(-0.18, -0.72, 0.14, 0.1, 0.2),
  leaf(0.1, 0.62, 0.15, 0.11, 2.5),
  leaf(0.28, 0.14, 0.14, 0.1, 0.5),
  leaf(0.16, -0.3, 0.14, 0.1, 2.0),
  leaf(0.5, -0.6, 0.14, 0.1, 1.0),
  leaf(-0.06, -0.06, 0.14, 0.1, 1.6),
].join('')
const IVY_LEAVES_LIT = [
  leaf(-0.4, -0.5, 0.14, 0.1, 1.1),
  leaf(0.28, 0.14, 0.14, 0.1, 0.5),
  leaf(-0.06, -0.06, 0.14, 0.1, 1.6),
].join('')

// ── kudzu: a smothering overgrowth blanket — one broad lumpy mound, trifoliate
//    leaf trios on the lit face, two escaping tendrils with tip leaves. ──
const KUDZU_D = lobeBlob(8, 0.82, 0.6)
const KUDZU_LEAVES = [
  leaf(-0.32, -0.28, 0.2, 0.12, 1.2),
  leaf(-0.12, -0.36, 0.2, 0.12, 1.7),
  leaf(0.1, -0.3, 0.2, 0.12, 2.2),
  leaf(0.34, 0.06, 0.18, 0.11, 0.6),
  leaf(-0.28, 0.16, 0.18, 0.11, 2.4),
].join('')
const KUDZU_RIBS = 'M-0.32 -0.28L-0.4 -0.46M-0.12 -0.36L-0.12 -0.56M0.1 -0.3L0.22 -0.48M0.34 0.06L0.5 0.12'
const KUDZU_TENDRILS = 'M-0.66 0.4Q-0.86 0.2 -0.82 -0.12M0.62 0.32Q0.86 0.1 0.8 -0.2'
const KUDZU_TIP_LEAVES = [leaf(-0.82, -0.16, 0.12, 0.07, 1.3), leaf(0.8, -0.24, 0.12, 0.07, 1.9)].join('')

// ── wisteria: hanging racemes — thin cords from a top bar dropping into drooping
//    cones of mauve blossom, pale spring dots on top. ──
const WIS_CORDS =
  'M-0.62 -0.72Q-0.6 -0.3 -0.5 0.08M-0.2 -0.75Q-0.16 -0.3 -0.12 0.22M0.22 -0.74Q0.28 -0.3 0.2 0.1M0.56 -0.72Q0.62 -0.35 0.5 0.06'
const WIS_RACEME_CENTERS: [number, number][] = [
  [-0.5, 0.32],
  [-0.12, 0.46],
  [0.2, 0.34],
  [0.5, 0.28],
]
const WIS_RACEME_D = WIS_RACEME_CENTERS.map(([x, y]) => lobeBlob(6, 0.16, 0.1, x, y) + ring(0.08, x, y + 0.2)).join('')
const WIS_BLOSSOMS = WIS_RACEME_CENTERS.map(
  ([x, y]) => ring(0.05, x - 0.06, y - 0.04) + ring(0.045, x + 0.06, y + 0.02) + ring(0.045, x, y + 0.12),
).join('')

// ── thorncreeper: a woody climbing creeper with sharp thorns along the forking
//    stems + a few dark leaves. Blocks (solid). ──
const TC_STEMS =
  'M-0.5 0.76Q-0.3 0.24 -0.36 -0.2Q-0.42 -0.6 -0.1 -0.8M-0.36 -0.2Q0.12 -0.12 0.42 -0.46M-0.3 0.3Q0.22 0.34 0.56 0.08'
const TC_THORNS = [
  'M-0.44 0.5L-0.58 0.46L-0.46 0.6Z',
  'M-0.3 0.06L-0.16 0.02L-0.28 0.16Z',
  'M-0.4 -0.44L-0.54 -0.5L-0.4 -0.56Z',
  'M-0.22 -0.72L-0.1 -0.82L-0.24 -0.84Z',
  'M0.14 -0.18L0.24 -0.06L0.28 -0.22Z',
  'M0.34 -0.4L0.44 -0.28L0.5 -0.44Z',
  'M0.16 0.34L0.24 0.46L0.3 0.32Z',
  'M0.42 0.16L0.56 0.14L0.46 0.28Z',
].join('')
const TC_LEAVES = [leaf(-0.12, -0.78, 0.12, 0.07, 0.3), leaf(0.42, -0.46, 0.12, 0.07, 1.1), leaf(0.54, 0.1, 0.12, 0.07, 1.7)].join('')

export const VINES: PropDef[] = [
  // JUNGLEVINE — reed-kind ceiling drape for jungle/swamp canopies. Free-rotates
  // for variety in the overhead layer.
  {
    id: 'junglevine', size: 1.05, wonk: 0.04,
    paths: [
      { d: JV_CORDS, stroke: 'foliageDeep', sw: 0.09 },
      { d: JV_CORDS_LIT, stroke: 'foliage', sw: 0.055, lit: true },
      { d: JV_LEAVES_DEEP, fill: 'foliageDeep' },
      { d: JV_LEAVES_LIT, fill: 'foliage', lit: true },
    ],
    kinds: ['reed'], themes: ['jungle', 'swamp'], role: 'edge', rotate: 'free',
    weight: 0.7, pass: 'walkable', footprint: 0.2, layer: 'ceiling',
    near: ['tree'], clusterWith: ['junglevine'], tags: ['vine', 'drape'],
  },
  // IVY — spreading wall sheet of small trefoil leaves on branching stems.
  {
    id: 'ivy', size: 1.0, wonk: 0.045,
    paths: [
      { d: IVY_STEMS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.8 },
      { d: IVY_LEAVES_DEEP, fill: 'foliageDeep' },
      { d: IVY_LEAVES_LIT, fill: 'foliage', lit: true },
    ],
    kinds: ['bush'], themes: ['ruins', 'forest', 'city'], role: 'edge', rotate: 'flat',
    weight: 0.7, pass: 'walkable', footprint: 0.2, layer: 'wall',
    near: ['wall'], clusterWith: ['ivy'], tags: ['vine', 'climb', 'cover'],
    gameplay: ['climbable', 'cover'],
  },
  // KUDZU — smothering overgrowth blanket: one broad mound + trifoliate leaf
  // trios + two escaping tendrils.
  {
    id: 'kudzu', size: 1.1, wonk: 0.045,
    paths: [
      ...cutout(KUDZU_D, 'foliageDeep', 'foliage'),
      { d: KUDZU_LEAVES, fill: 'mossBase', opacity: 0.9, lit: true },
      { d: KUDZU_RIBS, stroke: 'foliageDeep', sw: 0.04, opacity: 0.7 },
      { d: KUDZU_TENDRILS, stroke: 'foliageDeep', sw: 0.055 },
      { d: KUDZU_TIP_LEAVES, fill: 'foliage', lit: true },
    ],
    kinds: ['bush'], themes: ['ruins', 'swamp', 'haunted'], role: 'field', rotate: 'flat',
    weight: 0.5, pass: 'walkable', footprint: 0.3, layer: 'wall',
    near: ['wall'], clusterWith: ['kudzu'], tags: ['vine', 'overgrow', 'cover'],
    gameplay: ['cover'],
  },
  // WISTERIA — hanging mauve racemes dropping from thin cords; a bloom drape.
  {
    id: 'wisteria', size: 1.0, wonk: 0.035,
    paths: [
      { d: WIS_CORDS, stroke: 'foliageDeep', sw: 0.05 },
      ...cutout(WIS_RACEME_D, 'berryPurpleDeep', 'berryPurple'),
      { d: WIS_BLOSSOMS, fill: 'blossom' },
    ],
    kinds: ['flower'], themes: ['forest', 'city', 'arcane'], role: 'edge', rotate: 'free',
    weight: 0.4, pass: 'walkable', footprint: 0.2, layer: 'ceiling',
    near: ['tree'], clusterWith: ['wisteria'], tags: ['vine', 'drape', 'bloom'],
  },
  // THORNCREEPER — woody climbing creeper studded with thorns; blocks (solid).
  {
    id: 'thorncreeper', size: 1.0, wonk: 0.04,
    paths: [
      { d: TC_STEMS, stroke: 'woodDeep', sw: 0.09 },
      { d: TC_STEMS, stroke: 'wood', sw: 0.045, lit: true },
      { d: TC_THORNS, fill: 'woodDeep' },
      { d: TC_LEAVES, fill: 'foliageDeep' },
    ],
    kinds: ['reed', 'bush'], themes: ['ruins', 'haunted'], role: 'edge', rotate: 'flat',
    weight: 0.4, pass: 'solid', footprint: 0.28, layer: 'wall',
    near: ['wall'], clusterWith: ['thorncreeper'], tags: ['vine', 'climb', 'solid', 'spiny'],
    gameplay: ['climbable'],
  },
]
