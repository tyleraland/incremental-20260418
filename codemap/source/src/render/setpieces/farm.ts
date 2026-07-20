// ── Setpieces: Farm & ranch (tilled soil · sprinkler · scarecrow var · troughs ·
//    egg nest · milking stool · giant crop …) ──
//
// Bucket: GRASS (farm/plains — where `scarecrow`/`haybale`/`fencerun`/`wheat`
// live). COMPLETE PropDefs flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads this array into `grass`, then variants().
// Geometry from './kit' only.
//
// COLLISIONS (per WAVE-2 digest): `scarecrow`/`haybale`/`fencerun`/`wheat`
// already exist → not re-authored. `scarecrow_var` is a NEW distinct second
// style (gourd-headed), not the auto `~` variant. `haypile` DEFERS to existing
// `haybale` (skipped). State pairs use `<baseid>_<suffix>` ids (W2.4):
// tilledsoil→tilledsoil_watered, eggnest→eggnest_empty, giantcrop→giantcrop_cut.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, lobeBlob, scatterDots, hash01, hashString } from './kit'

// A deterministic ring of small circles (spray droplets, radial studs). Seeded
// wobble in angle + radius so a variant re-cut keeps the family read.
function ringDots(n: number, r: number, dr: number, seed: number): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (hash01(seed + i * 53) - 0.5) * 0.5
    const rr = r + (hash01(seed + i * 131) - 0.5) * 0.12
    d += ring(dr, Math.cos(a) * rr, Math.sin(a) * rr)
  }
  return d
}

// ── tilled soil plot ─────────────────────────────────────────────────────────
const SOIL_PATCH = rect(-0.82, -0.55, 1.64, 1.1)
const SOIL_FURROWS = 'M-0.72 -0.3L0.72 -0.3M-0.72 0L0.72 0M-0.72 0.3L0.72 0.3'
const SOIL_CRUMBS = scatterDots(hashString('tilledsoil'), 7, 1.4, 0.025, 0.05)
const SOIL_SHEEN = 'M-0.55 -0.16L0.5 -0.16M-0.45 0.14L0.55 0.14'

// ── sprinkler head ───────────────────────────────────────────────────────────
const SPR_ARMS = 'M-0.52 0L0.52 0M0 -0.52L0 0.52'
const SPR_DROPS = ringDots(7, 0.6, 0.06, hashString('sprinkler'))

// ── scarecrow (gourd-headed variant) ─────────────────────────────────────────
const SCV_FRAME = 'M0 -0.72L0 0.62M-0.6 -0.15L0.6 -0.15'
const SCV_TUNIC = 'M-0.34 -0.15L0.34 -0.15L0.5 0.5L-0.5 0.5Z'
const SCV_STRAW = 'M-0.6 -0.15L-0.76 -0.25M-0.6 -0.15L-0.74 -0.05M0.6 -0.15L0.76 -0.25M0.6 -0.15L0.74 -0.05M-0.4 0.5L-0.5 0.64M0.4 0.5L0.5 0.64'
const SCV_HEAD = ring(0.25, 0, -0.56)
const SCV_RIBS = 'M0 -0.8L0 -0.32M-0.13 -0.78L-0.11 -0.34M0.13 -0.78L0.11 -0.34'
const SCV_FACE = 'M-0.09 -0.62A0.045 0.045 0 1 0 -0.18 -0.62A0.045 0.045 0 1 0 -0.09 -0.62ZM0.18 -0.62A0.045 0.045 0 1 0 0.09 -0.62A0.045 0.045 0 1 0 0.18 -0.62Z'
const SCV_MOUTH = 'M-0.12 -0.46Q0 -0.4 0.12 -0.46'

// ── watering trough ──────────────────────────────────────────────────────────
const WT_FRAME = rect(-0.78, -0.42, 1.56, 0.84)
const WT_WATER = rect(-0.62, -0.28, 1.24, 0.56)
const WT_SHEEN = 'M-0.5 -0.12L0.5 -0.12M-0.5 0.12L0.36 0.12'
const WT_SEAMS = 'M-0.4 -0.42L-0.4 -0.32M0.4 -0.42L0.4 -0.32M-0.4 0.42L-0.4 0.32M0.4 0.42L0.4 0.32'

// ── feed trough ──────────────────────────────────────────────────────────────
const FT_FRAME = rect(-0.76, -0.4, 1.52, 0.8)
const FT_FEED = rect(-0.6, -0.26, 1.2, 0.52)
const FT_GRAIN = scatterDots(hashString('feedtrough'), 9, 1.15, 0.03, 0.055)

// ── egg nest ─────────────────────────────────────────────────────────────────
const NEST_OUTER = lobeBlob(8, 0.56, 0.45)
const NEST_HOLLOW = ring(0.34)
const NEST_STRAW = 'M-0.5 -0.2Q-0.2 -0.34 0.1 -0.28M0.28 -0.42Q0.44 -0.16 0.5 0.14M-0.46 0.26Q-0.16 0.42 0.2 0.42'
const NEST_EGGS = ring(0.13, -0.14, 0.04) + ring(0.13, 0.16, -0.04) + ring(0.12, 0.03, 0.18)

// ── milking stool ────────────────────────────────────────────────────────────
const STOOL_LEGS = 'M0 -0.35L0 -0.6M-0.3 0.18L-0.5 0.34M0.3 0.18L0.5 0.34'
const STOOL_SEAT = ring(0.42)
const STOOL_GRAIN = 'M-0.24 -0.12Q0 -0.02 0.24 -0.12M-0.2 0.14Q0 0.24 0.2 0.14'

// ── giant crop (giant pumpkin) ───────────────────────────────────────────────
const GC_SHADOW = 'M-0.05 0.62A0.62 0.2 0 1 0 0.05 0.66Z'
const GC_GOURD = lobeBlob(7, 0.74, 0.62)
const GC_RIBS = 'M-0.02 -0.68Q-0.52 0 -0.02 0.7M-0.38 -0.6Q-0.76 0 -0.38 0.62M0.34 -0.6Q0.74 0 0.34 0.62'
const GC_CROWN = lobeBlob(6, 0.32, 0.2, 0.02, -0.6)
const GC_STEM = 'M0.02 -0.62L0.09 -0.84'

// ── giant crop (harvested stump) ─────────────────────────────────────────────
const GCC_LEAVES = lobeBlob(6, 0.5, 0.38, 0, 0.16)
const GCC_CUT = ring(0.17, 0, 0.04)
const GCC_CORE = ring(0.09, 0, 0.04)

export const FARM: PropDef[] = [
  // TILLED SOIL: a flat plowed plot — dirt patch scored by three furrow ridges,
  // fresh sand crumbs kicked across it. Plantable, sits flat on the ground.
  {
    id: 'tilledsoil', size: 1.1, wonk: 0.035, rotate: 'flat', layer: 'ground',
    paths: [
      ...cutout(SOIL_PATCH, 'woodDeep', 'dirtPath'),
      { d: SOIL_FURROWS, stroke: 'woodDeep', sw: 0.06, opacity: 0.6 },
      { d: SOIL_CRUMBS, fill: 'sandLit', opacity: 0.7 },
    ],
    kinds: ['rock'], themes: ['farm'], role: 'field', weight: 0.5,
    pass: 'walkable', footprint: 0.3, gameplay: ['plantable'], tags: ['farm', 'flat'],
    sim: { statePair: 'tilledsoil_watered' },
  },
  // TILLED SOIL (watered): the same plot soaked dark, furrows inked deep, a wet
  // sheen catching the light. State pair with `tilledsoil`.
  {
    id: 'tilledsoil_watered', size: 1.1, wonk: 0.035, rotate: 'flat', layer: 'ground',
    paths: [
      ...cutout(SOIL_PATCH, 'ink', 'woodDeep'),
      { d: SOIL_FURROWS, stroke: 'ink', sw: 0.06, opacity: 0.7 },
      { d: SOIL_SHEEN, stroke: 'waterHi', sw: 0.04, opacity: 0.3 },
    ],
    kinds: [], pass: 'walkable', footprint: 0.3, tags: ['interactable'],
  },
  // SPRINKLER: a rotary irrigation head — stone hub on crossed spray arms
  // flinging a ring of water droplets. A field workstation.
  {
    id: 'sprinkler', size: 0.85, wonk: 0.03,
    paths: [
      { d: SPR_ARMS, stroke: 'rock', sw: 0.05 },
      ...cutout(ring(0.22), 'rockDeep', 'rock'),
      { d: ring(0.09), fill: 'woodDeep' },
      { d: ring(0.045), fill: 'waterHi' },
      { d: SPR_DROPS, fill: 'waterHi', opacity: 0.8 },
    ],
    kinds: ['rock', 'stump'], themes: ['farm'], role: 'field', weight: 0.4,
    pass: 'solid', footprint: 0.25, gameplay: ['use'], tags: ['farm', 'workstation'],
  },
  // SCARECROW (gourd-headed variant): a carved gourd head grins atop the
  // cross-pole, ragged tunic below, straw bursting from the cuffs and hem. A
  // distinct second look next to the straw-hatted `scarecrow`.
  {
    id: 'scarecrow_var', size: 1.1, wonk: 0.035,
    paths: [
      { d: SCV_FRAME, stroke: 'woodDeep', sw: 0.1 },
      { d: SCV_STRAW, stroke: 'th4', sw: 0.05 },
      ...cutout(SCV_TUNIC, 'dirtPath', 'canvas'),
      ...cutout(SCV_HEAD, 'gourdOrangeDeep', 'gourdOrange'),
      { d: SCV_RIBS, stroke: 'gourdOrangeDeep', sw: 0.04, opacity: 0.6 },
      { d: SCV_FACE, fill: 'ink' },
      { d: SCV_MOUTH, stroke: 'ink', sw: 0.04 },
    ],
    kinds: ['tree'], themes: ['farm', 'plains'], role: 'accent', weight: 0.2,
    rotate: 'upright', pass: 'solid', footprint: 0.3, tall: true, maxPerChunk: 1,
    tags: ['farm'],
  },
  // WATERING TROUGH: a wooden livestock trough brimming with water, plank seams
  // notched at the ends, a pale sheen on the surface.
  {
    id: 'wateringtrough', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(WT_FRAME, 'woodDeep', 'wood'),
      { d: WT_WATER, fill: 'waterShallow' },
      { d: WT_SHEEN, stroke: 'waterHi', sw: 0.04, opacity: 0.5 },
      { d: WT_SEAMS, stroke: 'ink', sw: 0.04, opacity: 0.5 },
    ],
    kinds: ['stump', 'rock'], themes: ['farm', 'village'], role: 'field', weight: 0.45,
    rotate: 'upright', pass: 'solid', footprint: 0.35, gameplay: ['use'], tags: ['farm'],
  },
  // FEED TROUGH: the same trough form heaped with golden feed instead of water,
  // loose grain scattered across the top.
  {
    id: 'feedtrough', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(FT_FRAME, 'woodDeep', 'wood'),
      ...cutout(FT_FEED, 'th4', 'th3'),
      { d: FT_GRAIN, fill: 'thatchInk', opacity: 0.7 },
    ],
    kinds: ['stump'], themes: ['farm'], role: 'field', weight: 0.45,
    rotate: 'upright', pass: 'solid', footprint: 0.3, gameplay: ['use'], tags: ['farm'],
  },
  // EGG NEST: a woven straw ring cradling a clutch of pale eggs in a dark hollow.
  // Gatherable; flips to the emptied nest.
  {
    id: 'eggnest', size: 0.8, wonk: 0.04,
    paths: [
      ...cutout(NEST_OUTER, 'thatchInk', 'th4'),
      { d: NEST_HOLLOW, fill: 'woodDeep' },
      { d: NEST_STRAW, stroke: 'th0', sw: 0.04, opacity: 0.7 },
      ...cutout(NEST_EGGS, 'sand', 'cream'),
    ],
    kinds: ['stump', 'bush'], themes: ['farm'], role: 'field', weight: 0.4,
    rotate: 'free', pass: 'solid', footprint: 0.25, gameplay: ['gather'], tags: ['farm'],
    sim: { resource: { respawn: 'slow' }, statePair: 'eggnest_empty' },
  },
  // EGG NEST (empty): the same straw ring and dark hollow, eggs gathered. State
  // pair with `eggnest`.
  {
    id: 'eggnest_empty', size: 0.8, wonk: 0.04,
    paths: [
      ...cutout(NEST_OUTER, 'thatchInk', 'th4'),
      { d: NEST_HOLLOW, fill: 'woodDeep' },
      { d: NEST_STRAW, stroke: 'th0', sw: 0.04, opacity: 0.7 },
    ],
    kinds: [], pass: 'solid', footprint: 0.25, tags: ['interactable'],
  },
  // MILKING STOOL: a round wooden seat on three splayed legs poking past the rim,
  // two grain arcs scored into the top.
  {
    id: 'milkstool', size: 0.7, wonk: 0.03,
    paths: [
      { d: STOOL_LEGS, stroke: 'woodDeep', sw: 0.09 },
      ...cutout(STOOL_SEAT, 'woodDeep', 'wood'),
      { d: STOOL_GRAIN, stroke: 'woodLight', sw: 0.04, opacity: 0.6 },
    ],
    kinds: ['stump'], themes: ['farm'], role: 'field', weight: 0.4,
    rotate: 'free', pass: 'solid', footprint: 0.22, tags: ['farm'],
  },
  // GIANT CROP: a prize pumpkin swollen to head height — ribbed orange gourd
  // under a leafy crown and curled stem. A rare field hero; harvestable.
  {
    id: 'giantcrop', size: 1.2, wonk: 0.04,
    paths: [
      { d: GC_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(GC_GOURD, 'gourdOrangeDeep', 'gourdOrange'),
      { d: GC_RIBS, stroke: 'gourdOrangeDeep', sw: 0.05, opacity: 0.55 },
      ...cutout(GC_CROWN, 'foliageDeep', 'foliage'),
      { d: GC_STEM, stroke: 'wood', sw: 0.06 },
    ],
    kinds: ['bush', 'tree'], themes: ['farm'], role: 'accent', weight: 0.2,
    rotate: 'upright', pass: 'solid', footprint: 0.45, tall: true, maxPerChunk: 1,
    gameplay: ['harvestable'], tags: ['farm', 'rare'],
    sim: { resource: { respawn: 'slow' }, statePair: 'giantcrop_cut' },
  },
  // GIANT CROP (harvested): the gourd cut away, leaving a low leaf clump and the
  // pale sliced core at the stem. State pair with `giantcrop`.
  {
    id: 'giantcrop_cut', size: 1.2, wonk: 0.04,
    paths: [
      ...cutout(GCC_LEAVES, 'foliageDeep', 'foliage'),
      { d: GCC_CUT, fill: 'sandLit' },
      { d: GCC_CORE, fill: 'cream', opacity: 0.85 },
    ],
    kinds: [], pass: 'walkable', footprint: 0.3, tags: ['interactable'],
  },
]
