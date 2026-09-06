// ── Setpieces: Fishing (crab pot · fishing dock · tackle box) ────────────────
//
// Bucket: GRASS (water/beach — where `buoy`/`pier`/`rowboat`/`fishnet`/`seashells`
// live). Builder fills COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets
// with NO shared-file edits; props.ts spreads into `grass`, then variants().
// Geometry from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION VERDICTS (digest W2.6): buoy, pier, fishnet, rowboat, seashells,
// coral, tidepool, sandcastle already exist → DEFER (alignment lane owns them).
// Of this builder's spec rows we author the NEW ids only:
//   crabpot (+ crabpot_full state), fishingdock, tacklebox.
// SKIPPED (deferred, per digest): buoy (existing buoy), crabtidepool (existing
// tidepool — not in the fishing NEW list; the alignment lane adds `forage` there).
//
// Floating props (crabpot / fishingdock carry `on-water`) → layer:'water-surface',
// pass:'walkable' — SKIPPED on legacy no-water maps, so themes include water/beach.

import type { PropDef } from '@/render/props'
import { cutout, ring, wrectPath, polyPath, hashString } from './kit'

// ── crab pot: a woven wooden cage, top-down. Rounded-square body + a lattice
// crosshatch (the woven cane), a dark ink funnel mouth at the centre, and a
// tether rope out to a small marker float — the tell that it's a set trap, not a
// well or manhole. State-pair base (carries the gameplay). ──────────────────────
const CRABPOT_SEED = hashString('crabpot')
const CRABPOT_BODY = wrectPath(-0.58, -0.52, 1.16, 1.04, CRABPOT_SEED, 0.04, 0.16)
const CRABPOT_LATTICE =
  'M-0.5 -0.18L0.5 -0.18M-0.5 0.18L0.5 0.18M-0.2 -0.5L-0.2 0.5M0.22 -0.5L0.22 0.5'
const CRABPOT_ROPE = 'M0.5 -0.42Q0.72 -0.66 0.82 -0.78'
const CRABPOT_FLOAT = ring(0.1, 0.86, -0.82)
// caught catch for the `_full` state — a stubby crab in the funnel mouth
const CRAB_LEGS =
  'M-0.15 -0.02L-0.34 -0.14M0.15 -0.02L0.34 -0.14M-0.13 0.08L-0.3 0.2M0.13 0.08L0.3 0.2'

// ── fishing dock: an L-jetty (plank runway turning a corner into a T-head over
// the water), plank seams, mooring pilings at the wet corners, one water glint.
// Distinct silhouette from the straight `pier` deck it defers around. ───────────
const DOCK_D = polyPath([
  { x: -0.22, y: -0.82 }, { x: 0.2, y: -0.82 }, { x: 0.2, y: 0.28 },
  { x: 0.82, y: 0.28 }, { x: 0.82, y: 0.7 }, { x: -0.22, y: 0.7 },
])
const DOCK_SEAMS =
  'M-0.22 -0.48L0.2 -0.48M-0.22 -0.12L0.2 -0.12M-0.22 0.5L0.82 0.5M0.46 0.28L0.46 0.7'
const DOCK_POSTS = ring(0.075, 0.78, 0.34) + ring(0.075, 0.78, 0.66) + ring(0.07, -0.18, -0.78)
const DOCK_GLINT = 'M0.88 0.3Q1.0 0.5 0.88 0.68'

// ── tackle box: a rounded case, top-down, with an arched carry handle, a lid
// seam, a brass latch, and a red lure clipped to the lid — the fishing signature.
const TBOX_SEED = hashString('tacklebox')
const TBOX_BODY = wrectPath(-0.54, -0.28, 1.08, 0.6, TBOX_SEED, 0.03, 0.08)
const TBOX_HANDLE = 'M-0.28 -0.28Q0 -0.62 0.28 -0.28'
const TBOX_LATCH = 'M-0.08 0.04L0.08 0.04L0.08 0.16L-0.08 0.16Z'

export const FISHING: PropDef[] = [
  // CRAB POT (base, set/empty): woven cage + funnel mouth + tether float.
  {
    id: 'crabpot', size: 0.85, wonk: 0.035,
    paths: [
      ...cutout(CRABPOT_BODY, 'woodDeep', 'wood'),
      { d: CRABPOT_LATTICE, stroke: 'woodDeep', sw: 0.04, opacity: 0.55 },
      { d: ring(0.15, 0, 0.02), fill: 'ink' },
      { d: CRABPOT_ROPE, stroke: 'wood', sw: 0.045 },
      { d: CRABPOT_FLOAT, fill: 'cream' },
    ],
    kinds: ['stump', 'rock'], themes: ['water', 'beach', 'swamp'], role: 'field',
    rotate: 'free', weight: 0.3, layer: 'water-surface', pass: 'walkable',
    footprint: 0.25, near: ['water'], tags: ['fish', 'on-water', 'water-surface'],
    gameplay: ['use', 'gather'], anchor: ['water'],
    sim: { resource: { respawn: 'fast' }, statePair: 'crabpot_full' },
  },
  // CRAB POT (full state): same cage + lattice + float, the funnel now holds a
  // caught crab. State pair with `crabpot` (kinds:[] exempts the reach gate).
  {
    id: 'crabpot_full', size: 0.85, wonk: 0.035,
    paths: [
      ...cutout(CRABPOT_BODY, 'woodDeep', 'wood'),
      { d: CRABPOT_LATTICE, stroke: 'woodDeep', sw: 0.04, opacity: 0.55 },
      { d: ring(0.16, 0, 0.03), fill: 'fruitRed' },
      { d: CRAB_LEGS, stroke: 'fruitRedDeep', sw: 0.045 },
      { d: CRABPOT_ROPE, stroke: 'wood', sw: 0.045 },
      { d: CRABPOT_FLOAT, fill: 'cream' },
    ],
    kinds: [], layer: 'water-surface', pass: 'walkable', footprint: 0.25,
    tags: ['interactable'],
  },
  // FISHING DOCK: L-jetty over the water — plank runway + T-head, seams, pilings.
  {
    id: 'fishingdock', size: 1.15, wonk: 0.03,
    paths: [
      { d: DOCK_GLINT, stroke: 'waterHi', sw: 0.04, opacity: 0.45 },
      ...cutout(DOCK_D, 'woodDeep', 'wood'),
      { d: DOCK_SEAMS, stroke: 'ink', sw: 0.03, opacity: 0.4 },
      { d: DOCK_POSTS, fill: 'woodDeep' },
    ],
    kinds: ['stump'], themes: ['water', 'beach', 'swamp'], role: 'edge',
    rotate: 'free', weight: 0.2, layer: 'water-surface', pass: 'walkable',
    footprint: 0.4, near: ['water'], tags: ['fish', 'on-water', 'water-surface'],
    gameplay: ['fish'], anchor: ['water-edge'], orient: 'along',
    sim: { resource: { respawn: 'fast' } },
  },
  // TACKLE BOX: rounded case + carry handle + brass latch + red lure signature.
  {
    id: 'tacklebox', size: 0.75, wonk: 0.03,
    paths: [
      ...cutout(TBOX_BODY, 'woodDeep', 'wood'),
      { d: 'M-0.54 0.02L0.54 0.02', stroke: 'ink', sw: 0.03, opacity: 0.4 },
      { d: TBOX_HANDLE, stroke: 'woodDeep', sw: 0.06 },
      { d: TBOX_LATCH, fill: 'bannerGold' },
      { d: ring(0.06, 0.36, -0.02), fill: 'fruitRed' },
    ],
    kinds: ['stump'], themes: ['water', 'beach', 'city'], role: 'field',
    rotate: 'upright', weight: 0.35, pass: 'solid', footprint: 0.22,
    near: ['water'], tags: ['fish'],
  },
]
