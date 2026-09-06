// ── Flora catalog: Wetland flora (cattail · pitcher plant · papyrus · mangrove) ──
//
// SWAMP/WATER edge + floating growth. Entries flow into TERRAIN_PROPS + listAssets
// with NO shared-file edits. props.ts spreads this into the `grass` bucket, then
// variants(). Floating props are layer:'water-surface' + near:['water'] (skipped
// on legacy no-spec maps, by design). Geometry from './kit' only. Guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, lobeBlob } from './kit'

// A cattail (bulrush): tall leafy blades flanking the signature brown seed-spike
// (the "corn-dog" head) — a vertical two-tone capsule on a woody stalk.
const CATTAIL_SPIKE = 'M-0.02 -0.88C0.13 -0.88 0.14 -0.64 0.12 -0.44C0.11 -0.3 0.09 -0.22 -0.02 -0.22C-0.15 -0.22 -0.18 -0.34 -0.18 -0.52C-0.19 -0.72 -0.16 -0.88 -0.02 -0.88Z'

// A carnivorous PITCHER PLANT: a tall bellied trumpet-tube + a shorter one, each
// with a flared mauve mouth and (on the tall one) an overhanging hood.
const PITCHER_D =
  'M-0.34 0.6C-0.42 0.3 -0.44 0 -0.4 -0.24C-0.37 -0.44 -0.28 -0.56 -0.14 -0.56C-0.03 -0.56 0.03 -0.4 0.02 -0.18C0 0.08 -0.06 0.34 -0.12 0.6Z' +
  'M0.14 0.62C0.1 0.4 0.12 0.18 0.18 0C0.22 -0.12 0.34 -0.14 0.42 -0.02C0.48 0.16 0.46 0.4 0.44 0.62Z'
const PITCHER_MOUTHS =
  'M-0.4 -0.54A0.14 0.06 0 1 0 -0.12 -0.54A0.14 0.06 0 1 0 -0.4 -0.54Z' +
  'M0.18 -0.02A0.13 0.055 0 1 0 0.44 -0.02A0.13 0.055 0 1 0 0.18 -0.02Z'
const PITCHER_HOOD = 'M-0.4 -0.54Q-0.34 -0.84 -0.08 -0.72Q-0.14 -0.58 -0.12 -0.54Z'

// A MANGROVE: a lobed swamp canopy riding a splay of arching stilt/prop roots
// that fan down into the water.
const MANGROVE_CROWN = lobeBlob(7, 0.5, 0.36, 0, -0.45)

export const WETLAND_FLORA: PropDef[] = [
  // CATTAIL — reed edge on the water surface. Signature: the brown seed-spike.
  {
    id: 'cattail', size: 1, wonk: 0.04,
    paths: [
      { d: 'M-0.1 0.72Q-0.22 0 -0.42 -0.72M0.12 0.72Q0.26 -0.05 0.46 -0.58', stroke: 'foliageDeep', sw: 0.1 },
      { d: 'M-0.1 0.72Q-0.22 0 -0.42 -0.72', stroke: 'foliage', sw: 0.055, lit: true },
      ...cutout(CATTAIL_SPIKE, 'woodDeep', 'wood'),
      { d: 'M-0.02 -0.88Q-0.04 -1.0 -0.06 -1.08', stroke: 'woodLight', sw: 0.035 },
    ],
    kinds: ['reed'], themes: ['swamp', 'water'], role: 'edge', rotate: 'upright',
    weight: 0.7, pass: 'walkable', footprint: 0.18, layer: 'water-surface',
    near: ['water'], clusterWith: ['cattail'], tags: ['wetland', 'reed'],
    anchor: ['water-edge'], orient: 'along',
  },

  // PITCHER PLANT — carnivorous understory. Signature: the trumpet tubes + mouths.
  {
    id: 'pitcherplant', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(PITCHER_D, 'foliageDeep', 'foliage'),
      { d: PITCHER_HOOD, fill: 'mossBase' },
      { d: PITCHER_MOUTHS, fill: 'bloom' },
    ],
    kinds: ['flower', 'bush'], themes: ['swamp', 'jungle'], role: 'understory',
    rotate: 'upright', weight: 0.3, pass: 'walkable', footprint: 0.2, layer: 'ground',
    tags: ['carniv'],
  },

  // PAPYRUS — reed edge on the water surface. Signature: the radial umbel spray
  // crowning a tall stalk (stroke art like reeds/fern).
  {
    id: 'papyrus', size: 1.1, wonk: 0.04,
    paths: [
      { d: 'M-0.1 0.72Q-0.16 0.05 -0.26 -0.5M0.14 0.72Q0.2 0.05 0.3 -0.4', stroke: 'foliageDeep', sw: 0.08 },
      { d: 'M-0.26 -0.5L-0.52 -0.82M-0.26 -0.5L-0.34 -0.9M-0.26 -0.5L-0.16 -0.92M-0.26 -0.5L-0.02 -0.84M-0.26 -0.5L0.04 -0.72M0.3 -0.4L0.08 -0.7M0.3 -0.4L0.26 -0.78M0.3 -0.4L0.46 -0.74M0.3 -0.4L0.58 -0.6', stroke: 'foliage', sw: 0.05 },
      { d: 'M-0.26 -0.5L-0.16 -0.92M-0.26 -0.5L-0.02 -0.84M0.3 -0.4L0.26 -0.78', stroke: 'tileMoss', sw: 0.035, lit: true },
    ],
    kinds: ['reed'], themes: ['swamp', 'water', 'desert'], role: 'edge', rotate: 'upright',
    weight: 0.5, pass: 'walkable', footprint: 0.2, layer: 'water-surface',
    near: ['water'], clusterWith: ['papyrus'], tags: ['wetland', 'reed'],
    anchor: ['water-edge'], orient: 'along',
  },

  // MANGROVE — accent tree on the water surface. Signature: arching stilt roots.
  {
    id: 'mangrove', size: 1.2, wonk: 0.05,
    paths: [
      { d: 'M0.08 0.62A0.5 0.2 0 1 0 0.1 0.66Z', fill: 'shadow', opacity: 0.22 },
      { d: 'M0 0.02Q-0.34 0.24 -0.56 0.62M0 0.02Q-0.16 0.3 -0.22 0.64M0 0.02Q0 0.34 0.02 0.66M0 0.02Q0.2 0.3 0.28 0.64M0 0.02Q0.4 0.26 0.58 0.62', stroke: 'woodDeep', sw: 0.08 },
      { d: 'M0 0.02Q-0.16 0.3 -0.22 0.64M0 0.02Q0.2 0.3 0.28 0.64', stroke: 'wood', sw: 0.045, lit: true },
      ...cutout(MANGROVE_CROWN, 'foliageDeep', 'foliage'),
    ],
    kinds: ['tree'], themes: ['swamp', 'beach'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'overhang', footprint: 0.45, layer: 'water-surface',
    near: ['water'], tall: true, clusterWith: ['mangrove'], tags: ['stilt'],
    anchor: ['water-edge'],
  },
]
