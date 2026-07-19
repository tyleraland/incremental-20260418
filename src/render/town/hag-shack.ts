// ── Hag: Shack structure (crooked chimney · sagging roof · bone fence · ward post · crooked sign · porch) ──
//
// Bucket: GRASS (swamp/forest structures — mirrors farm/lore hovel props).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   crookedchimney        role '-' → role:'accent', state crookedchimney_smoke, anim
//   saggingroof           role '-' → role:'accent', layer:'canopy'
//   bonefence             role edge → role:'edge', tags fence,grim
//   wardpost              role '-' → role:'field', tags ominous,ward
//   crookedsign           role read → gameplay:['read'], role:'edge', layer:'wall'
//   ricketyporch          role '-' → role:'accent' (structure part)
//
// LAYER: saggingroof → layer:'canopy'; crookedsign → layer:'wall'; rest ground.
//
// UNIQUE STATE-ID RULE: `crookedchimney`→`crookedchimney_smoke` (NOT the bare
// `chimney_smoke` — structures' `chimneypot` owns `chimneypot_smoke`; both
// derive from the same spec `chimney_smoke`). Companion (a puffing-smoke frame)
// reuses base geometry, kinds:[] + tags:['interactable'], declares pass+footprint.
//
// COLLISIONS: all FREE (bonefence distinct from `fencerun`; wardpost/crookedsign/
// ricketyporch/saggingroof no existing analogues).
//
// The `hagshack` 'set' row is a SCATTER_SETS prefab (NOT a prop): its members are
// this group's parts + one brand-new base this group owns:
//   shackwall — leaning warped-plank hovel wall (hagshack base)
// plus saggingroof/crookedchimney/ricketyporch/bonefence/wardpost/crookedsign +
// hag-witchery's `cauldron_big`. Orchestrator wires it post-build; member list
// in the digest.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, blobPath, roughCircle, hashString } from './kit'

// ── shared silhouettes ──────────────────────────────────────────────────────

// Leaning warped-plank hovel wall (near-elevation, tilts right).
const SHACK_WALL = 'M-0.4 -0.74L0.62 -0.62L0.52 0.72L-0.56 0.66Z'
const SHACK_PLANKS = 'M-0.16 -0.72L-0.26 0.68M0.08 -0.7L0 0.7M0.32 -0.66L0.26 0.71'
const SHACK_DOOR = 'M-0.16 0.68L-0.18 0.06L0.12 0.02L0.14 0.68Z'
const SHACK_WINDOW = 'M-0.32 -0.46L-0.08 -0.48L-0.08 -0.2L-0.32 -0.18Z'

// Crooked stone-and-mud chimney stack (leaning, tapered) + flue collar.
const CHIM_STACK = 'M-0.26 0.7L-0.16 -0.36L0.28 -0.5L0.32 0.66Z'
const CHIM_COURSES = 'M-0.22 0.36L0.3 0.3M-0.2 0.02L0.3 -0.04M-0.17 -0.3L0.28 -0.42'
const CHIM_SMOKE = ring(0.13, 0.1, -0.68) + ring(0.1, -0.02, -0.84) + ring(0.075, 0.14, -0.97)

// Sagging warped shingle roof cap seen from above (ridge dips at centre).
const ROOF_SAG = 'M-0.72 -0.28Q0 -0.06 0.72 -0.32L0.64 0.36Q0 0.58 -0.64 0.4Z'
const ROOF_RIDGE = 'M-0.66 -0.12Q0 0.12 0.66 -0.16'
const ROOF_COURSES = 'M-0.6 0.08Q0 0.3 0.6 0.04M-0.5 -0.2Q0 0.02 0.5 -0.24'
const ROOF_HOLE = blobPath(roughCircle(0.22, 0.06, 0.14, 7, hashString('saggingroof-hole')))

// Bone fence: three pale posts + two rib rails, skull on the middle post.
const BONE_POSTS = rect(-0.56, -0.5, 0.12, 1.1) + rect(-0.06, -0.56, 0.12, 1.16) + rect(0.44, -0.48, 0.12, 1.06)
const BONE_KNOBS = ring(0.09, -0.5, -0.5) + ring(0.11, 0, -0.56) + ring(0.09, 0.5, -0.48)
const BONE_EYES = ring(0.028, -0.04, -0.58) + ring(0.028, 0.04, -0.58)

// Ward post: leaning stake, skull finial, dried-blood runes.
const WARD_POST = 'M-0.09 0.72L-0.13 -0.26L0.11 -0.3L0.08 0.72Z'
const WARD_SKULL = blobPath(roughCircle(-0.01, -0.46, 0.2, 9, hashString('wardpost-skull')))
const WARD_EYES = ring(0.045, -0.08, -0.48) + ring(0.045, 0.06, -0.48)
const WARD_RUNES = 'M-0.06 0.12L0.05 0.08M-0.05 0.34L0.05 0.28M-0.02 -0.06L0.03 0.0'

// Crooked signboard on a leaning post.
const SIGN_POST = 'M-0.07 0.72L-0.11 -0.28L0.05 -0.32L0.02 0.72Z'
const SIGN_BOARD = 'M-0.5 -0.28L0.46 -0.5L0.52 0.02L-0.44 0.24Z'
const SIGN_FACE = 'M-0.4 -0.24L0.4 -0.44L0.44 -0.04L-0.36 0.16Z'
const SIGN_MARK = 'M-0.28 -0.28L0.28 -0.06M0.28 -0.28L-0.28 -0.06'

// Rickety plank porch/deck seen from above (skewed, one board missing).
const PORCH_DECK = 'M-0.66 -0.2L0.66 -0.28L0.6 0.5L-0.6 0.42Z'
const PORCH_PLANKS = 'M-0.6 -0.02L0.62 -0.1M-0.58 0.18L0.6 0.1M-0.62 0.34L0.6 0.28'
const PORCH_GAP = 'M0.12 -0.24L0.34 -0.26L0.3 0.46L0.08 0.44Z'
const PORCH_POSTS = ring(0.06, -0.6, -0.2) + ring(0.06, 0.6, -0.26) + ring(0.06, -0.58, 0.42) + ring(0.06, 0.58, 0.48)

export const HAG_SHACK: PropDef[] = [
  // ── shack base (invented set-member; full scatter meta) ─────────────────────
  // SHACKWALL: a leaning wall of warped grey planks with a black doorway, a
  // boarded-over window and moss creeping the sill — the hovel every hagshack set
  // stacks a sagging roof + crooked chimney onto.
  {
    id: 'shackwall', size: 1.2, wonk: 0.045,
    paths: [
      { d: 'M-0.32 -0.66L0.68 -0.54L0.58 0.78L-0.48 0.72Z', fill: 'shadow', opacity: 0.2 },
      ...cutout(SHACK_WALL, 'woodDeep', 'wood'),
      { d: SHACK_PLANKS, stroke: 'woodDeep', sw: 0.045, opacity: 0.6 },
      { d: SHACK_WINDOW, fill: 'ink', opacity: 0.9 },
      { d: 'M-0.34 -0.34L-0.06 -0.32', stroke: 'wood', sw: 0.05 },
      { d: SHACK_DOOR, fill: 'ink' },
      { d: ring(0.1, -0.42, 0.6) + ring(0.07, 0.32, 0.66), fill: 'mossBase', opacity: 0.8 },
    ],
    kinds: ['tree', 'stump'], themes: ['swamp', 'haunted', 'forest'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.5, layer: 'ground', tall: true,
    tags: ['building', 'ominous'], clusterWith: ['saggingroof', 'crookedchimney'],
  },

  // ── crooked chimney (roof accent) + smoking state ───────────────────────────
  // CROOKEDCHIMNEY: a leaning, tapered stone-and-mud stack with a dark flue mouth
  // and moss at its foot — the hovel's crooked landmark.
  {
    id: 'crookedchimney', size: 0.9, wonk: 0.04,
    paths: [
      { d: 'M-0.2 0.72L-0.1 -0.32L0.32 -0.46L0.38 0.68Z', fill: 'shadow', opacity: 0.2 },
      ...cutout(CHIM_STACK, 'rockDeep', 'rock'),
      { d: CHIM_COURSES, stroke: 'rockDeep', sw: 0.03, opacity: 0.6 },
      { d: ring(0.17, 0.06, -0.46), fill: 'woodDeep' },
      { d: ring(0.11, 0.06, -0.46), fill: 'ink' },
      { d: ring(0.08, -0.14, 0.5) + ring(0.06, 0.24, 0.6), fill: 'mossBase', opacity: 0.8 },
    ],
    kinds: ['rock', 'stump'], themes: ['swamp', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'walkable', footprint: 0.25, layer: 'ground', tall: true,
    tags: ['ominous', 'roof'],
  },
  // chimney smoking: the same crooked stack with a drifting soot plume (anim).
  {
    id: 'crookedchimney_smoke', size: 0.9, wonk: 0.04,
    paths: [
      { d: 'M-0.2 0.72L-0.1 -0.32L0.32 -0.46L0.38 0.68Z', fill: 'shadow', opacity: 0.2 },
      ...cutout(CHIM_STACK, 'rockDeep', 'rock'),
      { d: CHIM_COURSES, stroke: 'rockDeep', sw: 0.03, opacity: 0.6 },
      { d: ring(0.17, 0.06, -0.46), fill: 'woodDeep' },
      { d: ring(0.11, 0.06, -0.46), fill: 'ink' },
      { d: CHIM_SMOKE, fill: 'snowShade', opacity: 0.4 },
    ],
    kinds: [], tags: ['interactable', 'anim', 'ominous'], anim: true,
    pass: 'walkable', footprint: 0.25, layer: 'ground',
  },

  // ── sagging roof (canopy) ───────────────────────────────────────────────────
  // SAGGINGROOF: a warped split-shingle roof cap whose ridge dips in the middle,
  // one patch of shingles rotted through to a black hole.
  {
    id: 'saggingroof', size: 1.1, wonk: 0.035,
    paths: [
      { d: 'M-0.66 -0.2L0.72 -0.24L0.66 0.46L-0.6 0.5Z', fill: 'shadow', opacity: 0.2 },
      ...cutout(ROOF_SAG, 'roofShingleDark', 'roofShingle'),
      { d: ROOF_COURSES, stroke: 'shingleInk', sw: 0.03, opacity: 0.5 },
      { d: ROOF_HOLE, fill: 'ink', opacity: 0.85 },
      { d: ROOF_RIDGE, stroke: 'shingleInk', sw: 0.06 },
      { d: ring(0.09, -0.42, 0.28) + ring(0.06, -0.3, -0.08), fill: 'mossBase', opacity: 0.75 },
    ],
    kinds: ['stump'], themes: ['swamp', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'overhang', footprint: 0.5, layer: 'canopy',
    tags: ['ominous', 'roof'],
  },

  // ── bone fence (edge) ───────────────────────────────────────────────────────
  // BONEFENCE: a run of pale bone stakes lashed with two rib rails, a leering
  // skull capping the centre post — the hag's grim boundary.
  {
    id: 'bonefence', size: 1, wonk: 0.04,
    paths: [
      { d: 'M-0.78 0.66L0.78 0.6', stroke: 'shadow', sw: 0.08, opacity: 0.2 },
      { d: 'M-0.82 0.1L0.82 -0.02M-0.8 0.36L0.8 0.26', stroke: 'cream', sw: 0.045 },
      ...cutout(BONE_POSTS, 'stoneWallDark', 'cream'),
      { d: BONE_KNOBS, fill: 'cream' },
      { d: BONE_EYES, fill: 'ink' },
    ],
    kinds: ['rock', 'stump'], themes: ['swamp', 'haunted'], role: 'edge',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['fence', 'grim'],
  },

  // ── ward post (yard field prop) ─────────────────────────────────────────────
  // WARDPOST: a leaning stake topped with a bone skull and daubed with dried-blood
  // runes — a warding totem staked at the shack's edge.
  {
    id: 'wardpost', size: 0.9, wonk: 0.04,
    paths: [
      { d: ring(0.24, 0.02, 0.66), fill: 'shadow', opacity: 0.22 },
      ...cutout(WARD_POST, 'woodDeep', 'wood'),
      { d: WARD_RUNES, stroke: 'bloodDry', sw: 0.045 },
      ...cutout(WARD_SKULL, 'stoneWallDark', 'cream'),
      { d: WARD_EYES, fill: 'ink' },
    ],
    kinds: ['tree', 'stump'], themes: ['swamp', 'haunted', 'arcane'], role: 'field',
    rotate: 'upright', weight: 0.35, pass: 'solid', footprint: 0.2, layer: 'ground', tall: true,
    tags: ['ominous', 'ward'],
  },

  // ── crooked sign (wall-edge, read) ──────────────────────────────────────────
  // CROOKEDSIGN: a weather-warped board hung askew on a leaning post, a crude
  // dried-blood cross scrawled across a pale face — a "keep out" warning.
  {
    id: 'crookedsign', size: 0.95, wonk: 0.035,
    paths: [
      { d: 'M-0.44 -0.42L0.5 -0.44L0.5 0.26L-0.4 0.28Z', fill: 'shadow', opacity: 0.18 },
      ...cutout(SIGN_POST, 'woodDeep', 'wood'),
      ...cutout(SIGN_BOARD, 'woodDeep', 'wood'),
      { d: SIGN_FACE, fill: 'cream' },
      { d: SIGN_MARK, stroke: 'bloodDry', sw: 0.06 },
    ],
    kinds: ['tree'], themes: ['swamp', 'haunted'], role: 'edge',
    rotate: 'upright', weight: 0.3, pass: 'walkable', footprint: 0.2, layer: 'wall', tall: true,
    gameplay: ['read'], tags: ['ominous', 'sign'],
  },

  // ── rickety porch (structure accent) ────────────────────────────────────────
  // RICKETYPORCH: a skewed deck of warped planks on stub posts, one board rotted
  // clean away — the shack's sagging front step.
  {
    id: 'ricketyporch', size: 1.1, wonk: 0.035,
    paths: [
      { d: 'M-0.6 -0.14L0.7 -0.22L0.64 0.56L-0.54 0.48Z', fill: 'shadow', opacity: 0.2 },
      { d: PORCH_POSTS, fill: 'woodDeep' },
      ...cutout(PORCH_DECK, 'woodDeep', 'wood'),
      { d: PORCH_PLANKS, stroke: 'woodDeep', sw: 0.035, opacity: 0.6 },
      { d: PORCH_GAP, fill: 'ink', opacity: 0.85 },
    ],
    kinds: ['stump'], themes: ['swamp', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'walkable', footprint: 0.4, layer: 'ground',
    tags: ['structure'],
  },
]
