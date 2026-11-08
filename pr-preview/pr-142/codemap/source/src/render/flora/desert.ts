// ── Flora catalog: Desert flora (barrel cactus · saguaro · agave · desert bloom) ──
//
// Arid succulents + a rain-triggered ephemeral bloom (complements the existing
// top-down `cactus`/`cactuspad`). COMPLETE PropDefs (full inline placement meta) —
// entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts
// spreads this into the `grass` bucket, then variants(). `desertbloom` has a
// harvested state pair (`desertbloom_bare`); spiny silhouettes carry `spiny`.
//
// Geometry from './kit' only (type-only import of PropDef). Full guide:
// scratchpad/flora-digest.md — see the harvested-state convention section.

import type { PropDef } from '@/render/props'
import { cutout, radialStar, ring, leaf } from './kit'

// ── silhouettes ──────────────────────────────────────────────────────────────

// BARREL CACTUS: a squat, fat rounded barrel (wider than the columnar saguaro),
// curved vertical ribs, cream areole flecks, and a small crown of desert-gold
// blooms on top (the barrel's signature) so it never reads as a plain green ball.
const BARREL_D =
  'M-0.5 0.72C-0.6 0.3 -0.58 -0.32 -0.34 -0.56C-0.14 -0.74 0.14 -0.74 0.34 -0.56' +
  'C0.58 -0.32 0.6 0.3 0.5 0.72C0.3 0.82 -0.3 0.82 -0.5 0.72Z'
const BARREL_RIBS =
  'M-0.28 -0.54C-0.34 -0.1 -0.34 0.3 -0.3 0.66M0 -0.66L0 0.74M0.28 -0.54C0.34 -0.1 0.34 0.3 0.3 0.66'
const BARREL_SPINES =
  ring(0.024, -0.28, -0.3) + ring(0.024, 0, -0.4) + ring(0.024, 0.28, -0.3) +
  ring(0.024, -0.3, 0.2) + ring(0.024, 0, 0.28) + ring(0.024, 0.3, 0.2)
const BARREL_CROWN = ring(0.1, 0, -0.62) + ring(0.09, -0.18, -0.54) + ring(0.09, 0.18, -0.54)

// SAGUARO: the iconic upright columnar cactus in profile — a domed-top trunk with
// two up-curving arms (asymmetric, right arm higher), three subpaths union'd under
// nonzero fill. Curved rib strokes + cream areole dots. The desert's marquee tree.
const SAGUARO_D =
  // trunk
  'M-0.16 0.85L-0.16 -0.66Q-0.16 -0.82 0 -0.82Q0.16 -0.82 0.16 -0.66L0.16 0.85Z' +
  // left arm (lower)
  'M-0.18 0.34L-0.3 0.3L-0.3 -0.12Q-0.3 -0.3 -0.44 -0.3Q-0.58 -0.3 -0.58 -0.12L-0.58 0.18Q-0.58 0.34 -0.42 0.36L-0.18 0.4Z' +
  // right arm (higher)
  'M0.18 0.14L0.3 0.1L0.3 -0.3Q0.3 -0.48 0.44 -0.48Q0.58 -0.48 0.58 -0.3L0.58 -0.02Q0.58 0.14 0.42 0.16L0.18 0.2Z'
const SAGUARO_RIBS =
  'M0 -0.72L0 0.8M-0.09 -0.55L-0.09 0.78M0.09 -0.55L0.09 0.78'
const SAGUARO_SPINES =
  ring(0.022, 0, -0.5) + ring(0.022, 0, -0.18) + ring(0.022, 0, 0.14) + ring(0.022, 0, 0.46) +
  ring(0.022, 0, 0.72) + ring(0.02, -0.44, -0.18) + ring(0.02, 0.44, -0.36)

// AGAVE: a spiky sword-leaf ROSETTE radiating from a dark heart, one point aimed
// up (rot -90°); cream terminal spines glint at the upper leaf tips. Radial + spiny.
const AGAVE_D = radialStar(9, 0.88, 0.26, -Math.PI / 2)
const AGAVE_TIPS =
  ring(0.03, 0, -0.86) + ring(0.028, 0.55, -0.66) + ring(0.028, 0.85, -0.15) +
  ring(0.028, -0.85, -0.15) + ring(0.028, -0.55, -0.66)

// DESERT BLOOM: a single bright composite flower (7 petals, mauve→blossom two-tone)
// with a gold heart, on a slim stem above two low leaves — the after-the-rain
// ephemeral. Harvested pair strips the flower to a green seed capsule.
const DBLOOM_STEM = 'M0 0.82L0 0.12'
const DBLOOM_LEAVES = leaf(-0.16, 0.55, 0.26, 0.1, -0.7) + leaf(0.16, 0.57, 0.26, 0.1, 0.7)
const DBLOOM_PETALS = radialStar(7, 0.6, 0.26)

export const DESERT_FLORA: PropDef[] = [
  // BARREL CACTUS — fat ribbed barrel with a small gold crown. Solid desert accent.
  {
    id: 'barrelcactus', size: 1, wonk: 0.04,
    paths: [
      ...cutout(BARREL_D, 'foliageDeep', 'foliage'),
      { d: BARREL_RIBS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 },
      { d: BARREL_SPINES, fill: 'cream', opacity: 0.6 },
      { d: BARREL_CROWN, fill: 'petalGold' },
    ],
    kinds: ['bush'], themes: ['desert'], role: 'accent', rotate: 'upright',
    weight: 0.4, layer: 'ground', pass: 'solid', footprint: 0.33,
    tags: ['spiny'], clusterWith: ['barrelcactus', 'saguaro'],
  },

  // SAGUARO — tall two-armed columnar cactus with ribs + areole flecks. Big tall
  // solid accent tree; low weight signature, clusters with barrel/pad.
  {
    id: 'saguaro', size: 1.2, wonk: 0.04,
    paths: [
      ...cutout(SAGUARO_D, 'foliageDeep', 'foliage'),
      { d: SAGUARO_RIBS, stroke: 'foliageDeep', sw: 0.045, opacity: 0.65 },
      { d: SAGUARO_SPINES, fill: 'cream', opacity: 0.6 },
    ],
    kinds: ['tree'], themes: ['desert'], role: 'accent', rotate: 'upright',
    weight: 0.3, layer: 'ground', pass: 'solid', footprint: 0.45, tall: true,
    tags: ['spiny'], clusterWith: ['saguaro', 'barrelcactus'], maxPerChunk: 2,
  },

  // AGAVE — spiky radial rosette of sword leaves, dark heart, cream tip spines.
  // Solid accent; desert + beach (dune succulent).
  {
    id: 'agave', size: 1.05, wonk: 0.04,
    paths: [
      ...cutout(AGAVE_D, 'foliageDeep', 'foliage'),
      { d: ring(0.13), fill: 'foliageDeep' },
      { d: AGAVE_TIPS, fill: 'cream', opacity: 0.7 },
    ],
    kinds: ['bush'], themes: ['desert', 'beach'], role: 'accent', rotate: 'upright',
    weight: 0.4, layer: 'ground', pass: 'solid', footprint: 0.35,
    tags: ['spiny', 'radial'], clusterWith: ['agave'],
  },

  // DESERT BLOOM — a single mauve/gold flower on a leafy stem; harvestable
  // ephemeral field flower.
  {
    id: 'desertbloom', size: 0.9, wonk: 0.04,
    paths: [
      { d: DBLOOM_STEM, stroke: 'foliage', sw: 0.06 },
      { d: DBLOOM_LEAVES, fill: 'foliage' },
      ...cutout(DBLOOM_PETALS, 'bloom', 'blossom'),
      { d: ring(0.17), fill: 'petalGold' },
    ],
    kinds: ['flower'], themes: ['desert'], role: 'field', rotate: 'upright',
    weight: 0.4, layer: 'ground', pass: 'walkable', footprint: 0.15,
    tags: ['ephemeral'], gameplay: ['harvestable'], clusterWith: ['desertbloom'],
    sim: { statePair: 'desertbloom_bare', resource: { respawn: 'slow' } },
  },
  // DESERT BLOOM (spent) — state pair: same stem + leaves, flower gone, a green
  // seed capsule left where the bloom was.
  {
    id: 'desertbloom_bare', size: 0.9, wonk: 0.04,
    paths: [
      { d: DBLOOM_STEM, stroke: 'foliage', sw: 0.06 },
      { d: DBLOOM_LEAVES, fill: 'foliage' },
      ...cutout(ring(0.12, 0, -0.02), 'foliageDeep', 'foliage'),
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.15,
  },
]
