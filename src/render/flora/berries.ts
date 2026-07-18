// ── Flora catalog: Berry shrubs (blueberry · thornbush · hedgerow · gooseberry) ──
//
// Fruiting/woody shrubs, two with a picked-state pair (cf. the existing
// `berrybush`→`berrypicked`). COMPLETE PropDefs (full inline placement meta) —
// entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits.
// props.ts spreads this into the `grass` bucket, then variants().
//
// Geometry from './kit' only (type-only import of PropDef). Full guide:
// scratchpad/flora-digest.md — see the harvested-state convention section.

import type { PropDef } from '@/render/props'
import { cutout, lobeBlob, radialStar, scatterDots, hashString } from './kit'

// ── silhouettes ──────────────────────────────────────────────────────────────

// BLUEBERRY: a compact, slightly tall round bush; small dusty-purple berry dots.
const BLUEBERRY_D = lobeBlob(7, 0.7, 0.5, 0, -0.05)
const BLUEBERRY_DOTS = scatterDots(hashString('blueberry'), 7, 1.0, 0.05, 0.08)

// THORNBUSH: a spiky RADIAL tangle (sharp valleys, no smoothing) with a spray of
// straight thorn strokes jutting past the crown — the barrier "don't touch" tell.
const THORNBUSH_D = radialStar(8, 0.78, 0.5)
const THORNBUSH_SPIKES =
  'M0 -0.68L0 -0.96M0.5 -0.5L0.68 -0.68M0.7 -0.04L0.96 -0.04M0.5 0.46L0.66 0.64' +
  'M0 0.68L0 0.94M-0.5 0.46L-0.66 0.64M-0.7 -0.04L-0.96 -0.04M-0.5 -0.5L-0.68 -0.68'

// HEDGEROW: a WIDE, manicured trimmed hedge — a low rounded box, clearly not a
// round bush. Vertical clip seams read it as a boundary run (edge/fence).
const HEDGEROW_D =
  'M-0.92 0.82L-0.92 -0.28C-0.92 -0.5 -0.62 -0.54 -0.44 -0.48C-0.2 -0.4 0.12 -0.54 0.36 -0.48' +
  'C0.62 -0.42 0.92 -0.5 0.92 -0.28L0.92 0.82Z'
const HEDGEROW_SEAMS = 'M-0.34 -0.4L-0.34 0.78M0.32 -0.4L0.32 0.78'

// GOOSEBERRY: a BROAD, low mound (wider than blueberry), pale gooseberry berries
// (larger, greener) so the two fruiting bushes never read the same.
const GOOSEBERRY_D = lobeBlob(7, 0.82, 0.56, 0, 0.1)
const GOOSEBERRY_DOTS = scatterDots(hashString('gooseberry'), 6, 1.05, 0.07, 0.1)

export const BERRIES: PropDef[] = [
  // BLUEBERRY — round two-tone foliage dotted with seven small berryPurple berries.
  {
    id: 'blueberry', size: 1, wonk: 0.04,
    paths: [
      ...cutout(BLUEBERRY_D, 'foliageDeep', 'foliage'),
      { d: BLUEBERRY_DOTS, fill: 'berryPurple' },
    ],
    kinds: ['bush'], themes: ['forest', 'plains', 'mountain'], role: 'cluster',
    rotate: 'upright', weight: 0.5, layer: 'ground', pass: 'solid', footprint: 0.35,
    tags: ['fruit'], gameplay: ['harvestable'], clusterWith: ['blueberry'],
  },
  // BLUEBERRY_BARE — state pair: same silhouette, berries plucked; two faint
  // foliageDeep nub ticks stand in for the picked-clean gaps.
  {
    id: 'blueberry_bare', size: 1, wonk: 0.04,
    paths: [
      ...cutout(BLUEBERRY_D, 'foliageDeep', 'foliage'),
      { d: 'M-0.28 -0.2L-0.2 -0.12M0.18 0.06L0.26 0.14', stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35,
  },

  // THORNBUSH — spiky radial tangle + jutting ink thorns. Barrier (solid, fuller
  // footprint), no fruit; belongs to dark forest/swamp/haunted verges.
  {
    id: 'thornbush', size: 1, wonk: 0.05,
    paths: [
      ...cutout(THORNBUSH_D, 'foliageDeep', 'foliage'),
      { d: THORNBUSH_SPIKES, stroke: 'ink', sw: 0.045 },
    ],
    kinds: ['bush'], themes: ['forest', 'swamp', 'haunted'], role: 'cluster',
    rotate: 'upright', weight: 0.5, layer: 'ground', pass: 'solid', footprint: 0.45,
    tags: ['spiny', 'barrier'], clusterWith: ['thornbush'],
  },

  // HEDGEROW — wide trimmed box hedge with clip seams; an edge/fence run that
  // blocks. Rows tile along boundaries in plains/farm/city.
  {
    id: 'hedgerow', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(HEDGEROW_D, 'foliageDeep', 'foliage'),
      { d: HEDGEROW_SEAMS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 },
    ],
    kinds: ['bush'], themes: ['plains', 'farm', 'city'], role: 'edge',
    rotate: 'upright', weight: 0.6, layer: 'ground', pass: 'solid', footprint: 0.4,
    tags: ['fence', 'row'], clusterWith: ['hedgerow'],
  },

  // GOOSEBERRY — broad low mound with pale tileMoss berries (larger/greener than
  // blueberry's), harvestable.
  {
    id: 'gooseberry', size: 1, wonk: 0.04,
    paths: [
      ...cutout(GOOSEBERRY_D, 'foliageDeep', 'foliage'),
      { d: GOOSEBERRY_DOTS, fill: 'tileMoss' },
    ],
    kinds: ['bush'], themes: ['forest', 'plains'], role: 'cluster',
    rotate: 'upright', weight: 0.4, layer: 'ground', pass: 'solid', footprint: 0.3,
    tags: ['fruit'], gameplay: ['harvestable'], clusterWith: ['gooseberry'],
  },
  // GOOSEBERRY_BARE — state pair: same mound, berries gone; faint pick ticks.
  {
    id: 'gooseberry_bare', size: 1, wonk: 0.04,
    paths: [
      ...cutout(GOOSEBERRY_D, 'foliageDeep', 'foliage'),
      { d: 'M-0.24 0.02L-0.16 0.1M0.2 0.18L0.28 0.26', stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3,
  },
]
