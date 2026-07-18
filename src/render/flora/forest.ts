// ── Flora catalog: Temperate forest understory (fiddlehead · foxglove · fairy ring · shelf fungus) ──
//
// Broadleaf + understory FOREST growth (complements `canopy`/`fern`/`mushroom`).
// COMPLETE PropDefs with full inline placement meta — entries flow into
// TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts spreads this
// into the `grass` bucket, then variants(). Geometry from './kit' only.
// Full guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, ring } from './kit'

// ── fiddlehead: young fern crozier — a bold coiled spiral atop a green stem,
// with a smaller emerging coil behind it. The coil is the whole read. Stroke
// art (like fern/tuft), dark base + a lit inner subset. Harvestable spring edible.
const FIDDLE_MAIN =
  'M0.1 0.84C0.0 0.42 -0.2 0.14 -0.06 -0.14C0.06 -0.38 0.4 -0.34 0.42 -0.02C0.44 0.24 0.16 0.36 0.0 0.18C-0.12 0.04 -0.02 -0.1 0.14 -0.04'
const FIDDLE_SIDE =
  'M-0.04 0.66C-0.24 0.5 -0.36 0.28 -0.32 0.06C-0.29 -0.12 -0.08 -0.16 -0.02 0.0'
// harvested: the coils are picked, only the cut lower stems remain.
const FIDDLE_STUB = 'M0.1 0.84C0.02 0.54 -0.06 0.34 -0.02 0.12M-0.04 0.66C-0.16 0.52 -0.22 0.4 -0.2 0.28'

// ── foxglove: a tall vertical raceme of tubular bell flowers, larger low on the
// spike and tapering to buds at the tip — the classic foxglove silhouette. Two
// green base leaves anchor it. Bells two-tone (bloom base / blossom lit).
const FOX_STEM = 'M-0.02 0.86Q0.04 0.2 -0.02 -0.78'
const FOX_BELLS =
  ring(0.17, -0.22, 0.42) + ring(0.16, 0.16, 0.24) + ring(0.14, -0.18, 0.04) +
  ring(0.12, 0.13, -0.16) + ring(0.1, -0.11, -0.34) + ring(0.07, 0.06, -0.5)
const FOX_LEAVES =
  'M-0.06 0.84C-0.4 0.72 -0.56 0.5 -0.5 0.32C-0.3 0.42 -0.12 0.6 -0.06 0.84Z' +
  'M0.02 0.8C0.34 0.72 0.5 0.52 0.44 0.34C0.24 0.44 0.08 0.58 0.02 0.8Z'

// NOTE: `toadstoolring` (spec row 3) is intentionally NOT authored here — a
// complete `toadstoolring` PropDef already exists in props.ts (def at ~L2363,
// PROP_META at ~L514). My spec row lacked the "(already in ...)" parenthetical,
// but the prop pre-exists; re-adding it would duplicate the id (id-uniqueness +
// density test failures). Left to the canonical props.ts definition.

// ── shelffungus: stacked bracket fungus on a wall face (layer 'wall') — a column
// of D-shaped shelves jutting right off the left wall edge, banded with concentric
// growth rings (the bracket-fungus signature). Two-tone woody brackets. Harvestable.
function shelfBrackets() {
  const rows = [
    { y: -0.42, rw: 0.62, rh: 0.24 },
    { y: 0.02, rw: 0.78, rh: 0.3 },
    { y: 0.46, rw: 0.58, rh: 0.22 },
  ]
  const x0 = -0.62
  let shelves = '', bands = '', stubs = ''
  for (const { y, rw, rh } of rows) {
    shelves += `M${x0} ${y - rh}Q${x0 + rw} ${y - rh} ${x0 + rw} ${y}Q${x0 + rw} ${y + rh} ${x0} ${y + rh}Z`
    // two concentric growth-ring arcs following the outer rim
    bands += `M${x0} ${y - rh * 0.6}Q${x0 + rw * 0.6} ${y - rh * 0.6} ${x0 + rw * 0.62} ${y}Q${x0 + rw * 0.6} ${y + rh * 0.6} ${x0} ${y + rh * 0.6}`
    bands += `M${x0} ${y - rh * 0.28}Q${x0 + rw * 0.3} ${y - rh * 0.28} ${x0 + rw * 0.32} ${y}Q${x0 + rw * 0.3} ${y + rh * 0.28} ${x0} ${y + rh * 0.28}`
    // harvested nub scar left on the wall
    stubs += `M${x0} ${y - rh * 0.5}Q${x0 + rw * 0.22} ${y - rh * 0.5} ${x0 + rw * 0.22} ${y}Q${x0 + rw * 0.22} ${y + rh * 0.5} ${x0} ${y + rh * 0.5}Z`
  }
  return { shelves, bands, stubs }
}
const SHELF = shelfBrackets()

export const FOREST_FLORA: PropDef[] = [
  // fiddlehead — coiled fern crozier (harvestable)
  {
    id: 'fiddlehead', size: 0.9, wonk: 0.04,
    paths: [
      { d: FIDDLE_SIDE, stroke: 'foliageDeep', sw: 0.11 },
      { d: FIDDLE_MAIN, stroke: 'foliageDeep', sw: 0.15 },
      { d: FIDDLE_MAIN, stroke: 'foliage', sw: 0.08, lit: true },
    ],
    kinds: ['flower', 'bush'], themes: ['forest', 'swamp'], role: 'understory',
    rotate: 'upright', weight: 0.5, pass: 'walkable', footprint: 0.15, layer: 'ground',
    tags: ['spiral', 'root'], gameplay: ['harvestable'], clusterWith: ['fiddlehead'],
  },
  // fiddlehead_bare — cut stalks, coil picked (state pair)
  {
    id: 'fiddlehead_bare', size: 0.9, wonk: 0.04,
    paths: [
      { d: FIDDLE_STUB, stroke: 'foliageDeep', sw: 0.13 },
      { d: FIDDLE_STUB, stroke: 'foliage', sw: 0.06, lit: true },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.13, layer: 'ground',
  },
  // foxglove — tall spike of bell flowers
  {
    id: 'foxglove', size: 1.15, wonk: 0.04,
    paths: [
      { d: FOX_LEAVES, fill: 'foliage' },
      { d: FOX_STEM, stroke: 'foliageDeep', sw: 0.09 },
      ...cutout(FOX_BELLS, 'bloom', 'blossom'),
    ],
    kinds: ['flower'], themes: ['forest', 'plains'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'walkable', footprint: 0.15, layer: 'ground',
    tags: ['spike', 'bloom'], clusterWith: ['foxglove'],
  },
  // shelffungus — stacked bracket fungus on a wall (harvestable)
  {
    id: 'shelffungus', size: 1, wonk: 0.03,
    paths: [
      ...cutout(SHELF.shelves, 'woodDeep', 'woodLight'),
      { d: SHELF.bands, stroke: 'woodDeep', sw: 0.04, opacity: 0.7 },
    ],
    kinds: ['bush'], themes: ['forest', 'swamp'], role: 'understory',
    rotate: 'upright', weight: 0.5, pass: 'walkable', footprint: 0.25, layer: 'wall',
    tags: ['fungus'], gameplay: ['harvestable'], clusterWith: ['shelffungus'],
  },
  // shelffungus_bare — brackets cut, wall scar nubs remain (state pair)
  {
    id: 'shelffungus_bare', size: 1, wonk: 0.03,
    paths: [...cutout(SHELF.stubs, 'woodDeep', 'wood')],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.2, layer: 'wall',
  },
]
