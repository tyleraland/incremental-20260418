// ── Setpieces: Furniture (table · chair · bed · bedroll · throne · hearth · rug · floor lamp …) ──
//
// Bucket: PLAZA (city interiors — where `bench`/`bookshelf`-adjacent decor live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only (rect() is the workhorse for tabletops/frames; ring() for
// round tops / lamp shades; glowHalo() for the lit hearth / lamp).
//
// Gameplay verbs → GameplayTag: rest/save/sit/warm/cook (all real GameplayTags).
// `furniture`/`regal`/`cloth`/`camp`/`light`/`flat`/`hidden`/`wall-edge` are
// freeform `tags`. Hearth → flat `ember` halo under the fire + light + anim +
// warm/cook. TOP-DOWN reads: a table is its top; a hearth a stone surround with a
// glowing mouth; a lamp concentric shade discs.
//
// STATE PAIRS (unique `<baseid>_<suffix>` ids, kinds:[] + tags:['interactable'],
// base carries the gameplay): hearth→hearth_cold, wallbanner→wallbanner_torn,
// floorlamp→floorlamp_lit (the spec reuses `lamp_lit` for both this and
// streetlamp — disambiguated here to `floorlamp_lit`; see town.ts's streetlamp).
// `table_var` = a distinct second-style prop (round table), NOT the auto `~`
// variant. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS (per digest W2.6): `bench`/`bookshelf` already props → DEFER (skip);
// `weaponrack` already a prop (artisan) → DEFER (skip). `table` does NOT exist
// despite the `table_var` spec row → author BOTH.

import type { PropDef } from '@/render/props'
import { cutout, rect, ring, glowHalo } from './kit'

// ── geometry ──────────────────────────────────────────────────────────────────
// table (rectangular tabletop, top-down = a rounded plank field with seams)
const TABLE_TOP = rect(-0.64, -0.44, 1.28, 0.88)
const TABLE_SEAMS = 'M-0.64 -0.15L0.64 -0.15M-0.64 0.15L0.64 0.15'
// table_var (round tabletop = a disc, a rim seam, a centre knot)
const TABLE_DISC = ring(0.6)
// chair (a seat square + a back rail at the head)
const CHAIR_SEAT = rect(-0.34, -0.26, 0.68, 0.62)
const CHAIR_BACK = rect(-0.4, -0.46, 0.8, 0.18)
const CHAIR_GRAIN = 'M-0.18 -0.12L-0.18 0.28M0.18 -0.12L0.18 0.28'
// bed (wood frame · coloured blanket · pillow at the head)
const BED_FRAME = rect(-0.5, -0.72, 1.0, 1.44)
const BED_SHEET = rect(-0.4, -0.34, 0.8, 1.02)
const BED_PILLOW = rect(-0.34, -0.62, 0.68, 0.28)
// bedroll (a rolled-out ground mat with a rolled bolster at the head, two straps)
const BEDROLL_MAT = rect(-0.28, -0.58, 0.56, 1.16)
const BEDROLL_BOLSTER = rect(-0.28, -0.64, 0.56, 0.22)
const BEDROLL_STRAPS = 'M-0.28 -0.08L0.28 -0.08M-0.28 0.28L0.28 0.28'
// throne (a U-frame back+arms surround · seat · cushion · gold crest jewel)
const THRONE_FRAME = 'M-0.5 -0.62L0.5 -0.62L0.5 0.42L0.36 0.42L0.36 -0.42L-0.36 -0.42L-0.36 0.42L-0.5 0.42Z'
const THRONE_SEAT = rect(-0.36, -0.36, 0.72, 0.78)
const THRONE_CUSHION = rect(-0.28, -0.28, 0.56, 0.6)
// hearth (a stone surround open at the front, a dark firebox, logs, live flame)
const HEARTH_SURROUND = 'M-0.62 -0.56L0.62 -0.56L0.62 0.28L0.46 0.28L0.46 -0.34L-0.46 -0.34L-0.46 0.28L-0.62 0.28Z'
const HEARTH_FIREBOX = rect(-0.46, -0.34, 0.92, 0.64)
const HEARTH_LOGS = 'M-0.22 0.1L0.22 -0.06M-0.22 -0.06L0.22 0.1'
// wallbanner (a crossbar + a swallowtail cloth + a roundel emblem)
const BANNER_BAR = rect(-0.42, -0.74, 0.84, 0.12)
const BANNER_CLOTH = 'M-0.34 -0.66L0.34 -0.66L0.34 0.5L0.14 0.68L0 0.52L-0.14 0.68L-0.34 0.5Z'
const BANNER_TORN = 'M-0.34 -0.66L0.34 -0.66L0.32 0.16L0.18 0.34L0.06 0.1L-0.08 0.3L-0.2 0.04L-0.34 0.22Z'
const BANNER_FRAY = 'M-0.2 0.06L-0.24 0.3M0.1 0.14L0.14 0.34'
// rug (a rectangular decal · gold border outline · centre medallion · end fringe)
const RUG_BODY = rect(-0.72, -0.5, 1.44, 1.0)
const RUG_BORDER = rect(-0.6, -0.4, 1.2, 0.8)
const RUG_FRINGE =
  'M-0.6 -0.5L-0.6 -0.58M-0.4 -0.5L-0.4 -0.58M-0.2 -0.5L-0.2 -0.58M0 -0.5L0 -0.58M0.2 -0.5L0.2 -0.58M0.4 -0.5L0.4 -0.58M0.6 -0.5L0.6 -0.58' +
  'M-0.6 0.5L-0.6 0.58M-0.4 0.5L-0.4 0.58M-0.2 0.5L-0.2 0.58M0 0.5L0 0.58M0.2 0.5L0.2 0.58M0.4 0.5L0.4 0.58M0.6 0.5L0.6 0.58'
// floorlamp (top-down concentric discs: a fabric shade + a rim + a centre finial)
const LAMP_SHADE = ring(0.36)

export const FURNITURE: PropDef[] = [
  // ── tables ──
  // RECTANGULAR table: a two-tone plank top with cross-plank seams.
  { id: 'table', size: 1, wonk: 0.03, paths: [
    { d: rect(-0.58, -0.34, 1.28, 0.9), fill: 'shadow', opacity: 0.2 },
    ...cutout(TABLE_TOP, 'woodDeep', 'wood'),
    { d: TABLE_SEAMS, stroke: 'ink', sw: 0.045, opacity: 0.4 },
  ],
    kinds: ['stump'], themes: ['city', 'village', 'dungeon', 'farm'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.4,
    near: ['wall'], clusterWith: ['chair'], tags: ['furniture'] },
  // ROUND table (second style): a disc top, a rim seam, a turned centre knot.
  { id: 'table_var', size: 1, wonk: 0.025, paths: [
    { d: ring(0.6, 0.06, 0.08), fill: 'shadow', opacity: 0.2 },
    ...cutout(TABLE_DISC, 'woodDeep', 'wood'),
    { d: ring(0.48), stroke: 'ink', sw: 0.04, opacity: 0.35 },
    { d: ring(0.1), fill: 'woodLight' },
  ],
    kinds: ['stump'], themes: ['city', 'village', 'dungeon', 'farm'], role: 'field',
    rotate: 'upright', weight: 0.4, pass: 'solid', footprint: 0.45,
    near: ['wall'], clusterWith: ['chair'], tags: ['furniture'] },
  // CHAIR: a seat square with a back rail at the head, plank grain.
  { id: 'chair', size: 0.85, wonk: 0.03, paths: [
    { d: rect(-0.3, -0.2, 0.7, 0.66), fill: 'shadow', opacity: 0.2 },
    ...cutout(CHAIR_BACK, 'woodDeep', 'wood'),
    ...cutout(CHAIR_SEAT, 'woodDeep', 'wood'),
    { d: CHAIR_GRAIN, stroke: 'ink', sw: 0.04, opacity: 0.3 },
  ],
    kinds: ['stump'], themes: ['city', 'dungeon', 'farm'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.28,
    near: ['wall'], clusterWith: ['table'], gameplay: ['sit'], tags: ['furniture'] },
  // ── beds ──
  // BED: a wood frame, a blue blanket over the foot, a cream pillow at the head.
  { id: 'bed', size: 1.1, wonk: 0.03, paths: [
    { d: rect(-0.44, -0.66, 1.0, 1.46), fill: 'shadow', opacity: 0.2 },
    ...cutout(BED_FRAME, 'woodDeep', 'wood'),
    ...cutout(BED_SHEET, 'bannerBlueDk', 'bannerBlue'),
    ...cutout(BED_PILLOW, 'canvas', 'cream'),
    { d: 'M-0.4 0.02L0.4 0.02', stroke: 'bannerBlueDk', sw: 0.05, opacity: 0.6 },
  ],
    kinds: ['stump'], themes: ['city', 'dungeon', 'farm'], role: 'field',
    rotate: 'upright', weight: 0.4, pass: 'solid', footprint: 0.5,
    near: ['wall'], gameplay: ['rest', 'save'], tags: ['furniture'] },
  // BEDROLL: a canvas ground mat, a rolled bolster at the head, two tie straps.
  { id: 'bedroll', size: 1, wonk: 0.035, paths: [
    { d: rect(-0.24, -0.56, 0.58, 1.16), fill: 'shadow', opacity: 0.2 },
    ...cutout(BEDROLL_MAT, 'woodDeep', 'canvas'),
    ...cutout(BEDROLL_BOLSTER, 'dirtPath', 'sandLit'),
    { d: BEDROLL_STRAPS, stroke: 'woodDeep', sw: 0.05, opacity: 0.7 },
  ],
    kinds: ['stump', 'bush'], themes: ['plains', 'forest', 'mountain'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'walkable', footprint: 0.3,
    clusterWith: ['bedroll'], gameplay: ['rest', 'save'], tags: ['camp'] },
  // ── seats of state ──
  // THRONE: a heavy U-frame (back + arms) around a seat, a blue cushion, a gold
  // crest jewel at the head — the regal hero seat.
  { id: 'throne', size: 1.05, wonk: 0.025, paths: [
    { d: rect(-0.42, -0.56, 0.9, 1.3), fill: 'shadow', opacity: 0.22 },
    ...cutout(THRONE_FRAME, 'woodDeep', 'wood'),
    { d: THRONE_SEAT, fill: 'wood' },
    ...cutout(THRONE_CUSHION, 'bannerBlueDk', 'bannerBlue'),
    { d: ring(0.1, 0, -0.5), fill: 'bannerGold' },
    { d: ring(0.045, 0, -0.5), fill: 'cream' },
  ],
    kinds: ['stump', 'rock'], themes: ['ruins', 'dungeon', 'city'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.45,
    near: ['wall'], gameplay: ['sit'], tags: ['regal'] },
  // ── hearth (lit) + cold state pair ──
  // HEARTH: a stone surround open at the front over a dark firebox with logs and
  // a live two-stage flame — a flat ember halo under it (the only glow), light +
  // anim declared. State pair with `hearth_cold`.
  { id: 'hearth', size: 1, wonk: 0.03, paths: [
    { d: HEARTH_FIREBOX, fill: 'ink' },
    ...cutout(HEARTH_SURROUND, 'rockDeep', 'rock'),
    { d: glowHalo(0.4, 0, -0.02), fill: 'ember', opacity: 0.35 },
    { d: HEARTH_LOGS, stroke: 'woodDeep', sw: 0.09 },
    { d: ring(0.16, 0, -0.02), fill: 'emberDeep' },
    { d: ring(0.09, 0, -0.04), fill: 'ember' },
  ],
    kinds: ['rock', 'stump'], themes: ['city', 'mountain', 'farm'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'solid', footprint: 0.5,
    near: ['wall'], gameplay: ['warm', 'cook'],
    light: { color: 'ember', radius: 2 }, anim: true, tags: ['light', 'anim'] },
  // HEARTH (cold): the SAME surround + firebox, embers out — a char core and
  // cold logs instead of the flame. State pair with `hearth`.
  { id: 'hearth_cold', size: 1, wonk: 0.03, paths: [
    { d: HEARTH_FIREBOX, fill: 'ink' },
    ...cutout(HEARTH_SURROUND, 'rockDeep', 'rock'),
    { d: 'M-0.22 0.06L0.22 -0.1M-0.22 -0.1L0.22 0.06', stroke: 'woodDeep', sw: 0.08 },
    { d: ring(0.13, 0, -0.03), fill: 'stoneDark' },
  ],
    kinds: [], pass: 'solid', footprint: 0.5, tags: ['interactable'] },
  // ── wall banner (whole) + torn state pair ──
  // WALLBANNER: a crossbar-hung swallowtail cloth with a gold roundel emblem —
  // wall-mounted (layer:wall, rotate:flat). State pair with `wallbanner_torn`.
  { id: 'wallbanner', size: 1, wonk: 0.03, paths: [
    ...cutout(BANNER_CLOTH, 'bannerBlueDk', 'bannerBlue'),
    ...cutout(BANNER_BAR, 'woodDeep', 'wood'),
    { d: ring(0.12, 0, -0.04), fill: 'bannerGold' },
    { d: ring(0.06, 0, -0.04), fill: 'bannerBlueDk' },
  ],
    kinds: ['tree', 'flower'], themes: ['city', 'dungeon', 'ruins'], role: 'edge',
    rotate: 'flat', layer: 'wall', weight: 0.4, pass: 'walkable', footprint: 0.3,
    near: ['wall'], tags: ['cloth', 'wall-edge'] },
  // WALLBANNER (torn): the SAME bar, a ragged faded shorter cloth, fray ticks, no
  // emblem. State pair with `wallbanner`.
  { id: 'wallbanner_torn', size: 1, wonk: 0.045, paths: [
    ...cutout(BANNER_TORN, 'bannerBlueDk', 'bannerBlue'),
    ...cutout(BANNER_BAR, 'woodDeep', 'wood'),
    { d: BANNER_FRAY, stroke: 'ink', sw: 0.035, opacity: 0.6 },
  ],
    kinds: [], layer: 'wall', pass: 'walkable', footprint: 0.3, tags: ['interactable'] },
  // ── rug ──
  // RUG: a two-tone rectangular decal (rotate:flat) with a gold border outline, a
  // centre medallion and end fringe — `hidden` marks it as concealing something.
  { id: 'rug', size: 1, wonk: 0.03, paths: [
    ...cutout(RUG_BODY, 'fruitRedDeep', 'fruitRed'),
    { d: RUG_BORDER, stroke: 'bannerGold', sw: 0.05, opacity: 0.85 },
    { d: ring(0.22), fill: 'bannerGold' },
    { d: ring(0.13), fill: 'fruitRedDeep' },
    { d: ring(0.06), fill: 'cream' },
    { d: RUG_FRINGE, stroke: 'cream', sw: 0.03, opacity: 0.7 },
  ],
    kinds: ['flower', 'bush'], themes: ['city', 'dungeon', 'farm'], role: 'field',
    rotate: 'flat', weight: 0.4, pass: 'walkable', footprint: 0.12,
    tags: ['furniture', 'flat', 'hidden'] },
  // ── floor lamp (unlit) + lit state pair ──
  // FLOORLAMP: top-down concentric discs — a fabric shade, an ink rim, a dark
  // (unlit) finial. State pair with `floorlamp_lit`.
  { id: 'floorlamp', size: 0.8, wonk: 0.03, paths: [
    { d: ring(0.34, 0.05, 0.06), fill: 'shadow', opacity: 0.22 },
    ...cutout(LAMP_SHADE, 'woodDeep', 'canvas'),
    { d: ring(0.36), stroke: 'ink', sw: 0.04, opacity: 0.4 },
    { d: ring(0.1), fill: 'lampPost' },
  ],
    kinds: ['rock', 'stump'], themes: ['city', 'dungeon'], role: 'field',
    rotate: 'free', weight: 0.45, pass: 'solid', footprint: 0.25,
    near: ['wall'], tags: ['light'] },
  // FLOORLAMP (lit): the SAME shade, a warm lampGlow halo under it and a glowing
  // finial — light declared. State pair with `floorlamp`.
  { id: 'floorlamp_lit', size: 0.8, wonk: 0.03, paths: [
    { d: glowHalo(0.55), fill: 'lampGlow', opacity: 0.35 },
    ...cutout(LAMP_SHADE, 'woodDeep', 'canvas'),
    { d: ring(0.36), stroke: 'ink', sw: 0.04, opacity: 0.4 },
    { d: ring(0.14), fill: 'lampGlow' },
    { d: ring(0.07), fill: 'cream' },
  ],
    kinds: [], pass: 'solid', footprint: 0.25,
    light: { color: 'lampGlow', radius: 2 }, tags: ['interactable', 'light', 'glow'] },
]
