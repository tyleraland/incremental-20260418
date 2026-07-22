// ── Town: Faith / churchyard (grave cross · gravestone var · lychgate · wayside shrine · tomb slab) ──
//
// Bucket: GRASS (graveyard — where the existing `gravestone` lives). Builder:
// fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   gravecross/gravestone_var  role '-' → role:'cluster' (graves clump in yards)
//   lychgate              role '-' → role:'accent' (gate landmark), tags structure,holy
//   shrine_wayside        role pray → gameplay:['pray'], role:'accent'
//   tombslab              role search → gameplay:['search'], role:'accent', state tombslab_ajar
//
// LAYER: all ground.
//
// COLLISIONS (digest WAVE 3):
//   gravestone_var → FREE. A distinct authored second-style prop (like wave-2
//                    `table_var`); the existing `gravestone` stays untouched.
//   shrine_wayside → FREE (distinct wayside cross-shrine; near-miss with existing
//                    `shrine` but a different silhouette — keep, note the near-miss).
//   gravecross/lychgate/tombslab → FREE.
//
// UNIQUE STATE-ID RULE: `tombslab`→`tombslab_ajar` (NOT the bare `slab_ajar` the
// spec names). Companion reuses base geometry, kinds:[] + tags:['interactable'],
// still declares pass+footprint.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, polyPath, scatterDots, hashString } from './kit'

// ── grave CROSS: a Latin cross planted upright in a low earth mound, seen from
// above as a stone plus over a moss-flecked barrow. Chunky arms → gentle wonk. ──
const CROSS_D = polyPath([
  { x: -0.12, y: -0.82 }, { x: 0.12, y: -0.82 }, { x: 0.12, y: -0.36 },
  { x: 0.4, y: -0.36 }, { x: 0.4, y: -0.12 }, { x: 0.12, y: -0.12 },
  { x: 0.12, y: 0.56 }, { x: -0.12, y: 0.56 }, { x: -0.12, y: -0.12 },
  { x: -0.4, y: -0.12 }, { x: -0.4, y: -0.36 }, { x: -0.12, y: -0.36 },
])
const MOUND_D = 'M-0.4 0.4Q-0.24 0.72 0 0.72Q0.24 0.72 0.4 0.4Q0.2 0.52 0 0.52Q-0.2 0.52 -0.4 0.4Z'
const CROSS_MOSS = ring(0.055, -0.07, -0.3) + ring(0.04, 0.06, 0.02)

// ── GRAVESTONE var: a gothic peaked headstone (distinct from the existing rounded
// `gravestone`) — gabled slab with an incised cross and a hairline crack. ──
const GRAVEVAR_D = polyPath([
  { x: -0.3, y: 0.52 }, { x: -0.3, y: -0.42 }, { x: 0, y: -0.78 },
  { x: 0.3, y: -0.42 }, { x: 0.3, y: 0.52 },
])
const GRAVEVAR_MOUND = 'M-0.36 0.42Q-0.2 0.7 0 0.7Q0.2 0.7 0.36 0.42Q0.18 0.54 0 0.54Q-0.18 0.54 -0.36 0.42Z'
const GRAVEVAR_INCISE = 'M0 -0.5L0 0.1M-0.16 -0.32L0.16 -0.32'
const GRAVEVAR_CRACK = 'M0.14 -0.56L0.03 -0.24L0.15 0.06L0.05 0.42'

// ── LYCHGATE: a churchyard's covered gate, read top-down as a pitched shingle
// roof (ridge split + tile seams) over four timber corner posts, a gable cross
// marking the holy threshold. ──
const LG_POSTS = rect(-0.56, -0.6, 0.16, 0.16) + rect(0.4, -0.6, 0.16, 0.16) +
  rect(-0.56, 0.44, 0.16, 0.16) + rect(0.4, 0.44, 0.16, 0.16)
const LG_ROOF = rect(-0.48, -0.52, 0.96, 1.04)
const LG_RIDGE = 'M-0.48 0L0.48 0'
const LG_SEAMS = 'M-0.28 -0.52L-0.28 0.52M-0.08 -0.52L-0.08 0.52M0.12 -0.52L0.12 0.52M0.32 -0.52L0.32 0.52'
const LG_CROSS = 'M0 -0.72L0 -0.5M-0.07 -0.64L0.07 -0.64'

// ── wayside SHRINE: a roadside cross on a stepped stone plinth with a spray of
// flower offerings at its foot — the traveller's prayer stop. ──
const WS_PLINTH = rect(-0.34, 0.34, 0.68, 0.26) + rect(-0.24, 0.14, 0.48, 0.22)
const WS_CROSS = polyPath([
  { x: -0.08, y: -0.66 }, { x: 0.08, y: -0.66 }, { x: 0.08, y: -0.42 },
  { x: 0.28, y: -0.42 }, { x: 0.28, y: -0.22 }, { x: 0.08, y: -0.22 },
  { x: 0.08, y: 0.14 }, { x: -0.08, y: 0.14 }, { x: -0.08, y: -0.22 },
  { x: -0.28, y: -0.22 }, { x: -0.28, y: -0.42 }, { x: -0.08, y: -0.42 },
])
const WS_FLOWERS = ring(0.06, -0.27, 0.5) + ring(0.055, 0.25, 0.52) + ring(0.05, -0.02, 0.6)

// ── TOMB SLAB: a flat ledger stone / sarcophagus lid, top-down — a carved-border
// rectangle with an incised cross. State pair slides the lid ajar over a void. ──
const SLAB_D = rect(-0.62, -0.72, 1.24, 1.44)
const SLAB_BORDER = rect(-0.5, -0.6, 1.0, 1.2)
const SLAB_INCISE = 'M0 -0.48L0 0.5M-0.3 -0.16L0.3 -0.16'
const SLAB_MOSS = ring(0.05, -0.44, 0.54) + ring(0.038, 0.4, -0.5)
// ajar: lid shoved up-left over the exposed grave void.
const SLAB_VOID = rect(-0.5, 0.44, 1.06, 0.3)
const SLAB_AJAR = rect(-0.68, -0.84, 1.24, 1.44)
const SLAB_AJAR_BORDER = rect(-0.56, -0.72, 1.0, 1.2)
const SLAB_AJAR_INCISE = 'M-0.06 -0.6L-0.06 0.38M-0.36 -0.28L0.24 -0.28'

export const FAITH: PropDef[] = [
  {
    id: 'gravecross', size: 0.85, wonk: 0.04,
    paths: [
      { d: MOUND_D, fill: 'dirtPath', opacity: 0.9 },
      ...cutout(CROSS_D, 'rockDeep', 'stoneBase'),
      { d: CROSS_MOSS, fill: 'mossBase', opacity: 0.85 },
    ],
    kinds: ['rock', 'stump'], themes: ['village', 'haunted'], role: 'cluster',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.2,
    clusterWith: ['gravecross', 'gravestone_var'], tags: ['grim'], sim: { lore: true },
  },
  {
    id: 'gravestone_var', size: 0.85, wonk: 0.03,
    paths: [
      { d: GRAVEVAR_MOUND, fill: 'dirtPath', opacity: 0.9 },
      ...cutout(GRAVEVAR_D, 'rockDeep', 'stoneBase'),
      { d: GRAVEVAR_INCISE, stroke: 'ink', sw: 0.035, opacity: 0.5 },
      { d: GRAVEVAR_CRACK, stroke: 'ink', sw: 0.025, opacity: 0.4 },
    ],
    kinds: ['rock', 'stump'], themes: ['village', 'haunted'], role: 'cluster',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.22,
    clusterWith: ['gravestone_var', 'gravecross'], tags: ['grim'], sim: { lore: true },
  },
  {
    id: 'lychgate', size: 1.15, wonk: 0.03,
    paths: [
      { d: LG_POSTS, fill: 'woodDeep' },
      ...cutout(LG_ROOF, 'woodDeep', 'woodLight'),
      { d: LG_RIDGE, stroke: 'woodDeep', sw: 0.06 },
      { d: LG_SEAMS, stroke: 'woodDeep', sw: 0.025, opacity: 0.4 },
      { d: LG_CROSS, stroke: 'cream', sw: 0.03 },
    ],
    kinds: ['stump', 'tree'], themes: ['village', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.5, tall: true,
    tags: ['structure', 'holy'], anchor: ['entrance'],
  },
  {
    id: 'shrine_wayside', size: 0.95, wonk: 0.03,
    paths: [
      ...cutout(WS_PLINTH, 'rockDeep', 'rock'),
      ...cutout(WS_CROSS, 'woodDeep', 'wood'),
      { d: WS_FLOWERS, fill: 'blossom' },
    ],
    kinds: ['rock', 'flower'], themes: ['village', 'plains', 'mountain'],
    role: 'accent', rotate: 'upright', weight: 0.25, pass: 'solid', footprint: 0.3,
    gameplay: ['pray'], tags: ['holy', 'social'], sim: { mystery: true },
  },
  {
    id: 'tombslab', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(SLAB_D, 'rockDeep', 'stoneBase'),
      { d: SLAB_BORDER, stroke: 'mortarInk', sw: 0.03, opacity: 0.6 },
      { d: SLAB_INCISE, stroke: 'ink', sw: 0.04, opacity: 0.5 },
      { d: SLAB_MOSS, fill: 'mossBase', opacity: 0.8 },
    ],
    kinds: ['rock', 'stump'], themes: ['village', 'ruins', 'haunted'],
    role: 'accent', rotate: 'upright', weight: 0.3, pass: 'solid', footprint: 0.4,
    gameplay: ['search'], tags: ['grim', 'lore'], sim: { lore: true, statePair: 'tombslab_ajar' },
  },
  // state pair — same ledger stone, lid slid ajar over an exposed grave void.
  {
    id: 'tombslab_ajar', size: 1.1, wonk: 0.03,
    paths: [
      { d: SLAB_VOID, fill: 'ink' },
      ...cutout(SLAB_AJAR, 'rockDeep', 'stoneBase'),
      { d: SLAB_AJAR_BORDER, stroke: 'mortarInk', sw: 0.03, opacity: 0.6 },
      { d: SLAB_AJAR_INCISE, stroke: 'ink', sw: 0.04, opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.35,
  },
]
