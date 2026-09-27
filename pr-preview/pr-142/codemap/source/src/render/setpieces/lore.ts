// ── Setpieces: Environmental storytelling (skeleton · battle debris · broken cart · shipwreck · scorch mark · bedroll) ──
//
// Bucket: GRASS (wilderness lore — where `gravestone`/`tent`/`campcold`/`camp`
// SCATTER_SET members live). COMPLETE PropDefs flow into TERRAIN_PROPS + listAssets
// with NO shared-file edits; props.ts spreads into `grass`, then variants().
// Geometry from './kit' only.
//
// Gameplay verbs → GameplayTag: search / lootable / rest. `lore`/`grim`/`camp`/
// `flat` stay freeform `tags`. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// `abandonedcamp` (spec kinds:'set') is a SCATTER_SETS PREFAB, not a prop — NOT
// authored here (do NOT touch props.ts's SCATTER_SETS). Its only MISSING member is
// `bedroll` (NEW, below); `tent`/`campcold`/`sack` already exist. The orchestrator
// wires the `abandonedcamp` set entry after this file merges.
//
// COLLISIONS (defer-to-existing, NOT authored here): gravestone, sarcophagus,
// sarcoph_open, tent, campcold, cage, skull, bone, bloodstain already props — so the
// spec's `crackedsarcoph → sarcoph_open` row is SKIPPED (the alignment lane owns the
// existing sarcophagus / sarcoph_open pair).

import type { PropDef } from '@/render/props'
import { cutout, ring, blobPath, roughCircle, polyPath, scatterDots, hashString } from './kit'

// ── skeleton: a sprawled skull + ribcage + splayed limb bones (top-down remains) ──
const SKELETON_LIMBS = 'M-0.07 -0.24L-0.42 0M0.07 -0.24L0.42 0M-0.05 0.04L-0.28 0.54M0.05 0.04L0.28 0.54'
const SKELETON_RIBS = 'M-0.16 -0.24Q0 -0.33 0.16 -0.24M-0.17 -0.11Q0 -0.2 0.17 -0.11M-0.16 0.02Q0 -0.07 0.16 0.02'
const SKELETON_SPINE = 'M0 -0.3L0 0.06'
const SKELETON_SKULL = ring(0.15, 0, -0.48)
const SKELETON_SOCKETS = ring(0.045, -0.06, -0.5) + ring(0.045, 0.06, -0.5)

// ── battledebris: a cracked shield, snapped weapons, a dented helm on churned ground ──
const BATTLEDEBRIS_SHIELD = ring(0.32, -0.3, 0.04)
const BATTLEDEBRIS_BOSS = ring(0.09, -0.3, 0.04)
const BATTLEDEBRIS_HELM = ring(0.17, 0.36, -0.24)

// ── brokencart: an overturned plank bed, one spoked wheel, a shattered second wheel ──
const BROKENCART_BED = polyPath([{ x: -0.5, y: -0.42 }, { x: 0.44, y: -0.5 }, { x: 0.54, y: 0.28 }, { x: -0.4, y: 0.42 }])
const BROKENCART_SEAMS = 'M-0.44 -0.2L0.48 -0.28M-0.42 0.04L0.5 -0.04'
const BROKENCART_WHEEL = ring(0.19, -0.58, 0.34)
const BROKENCART_SPOKES = 'M-0.75 0.34L-0.41 0.34M-0.58 0.17L-0.58 0.51'

// ── shipwreck: a beached broken hull (pointed bow), exposed ribs, an open hold, mast stub ──
const SHIPWRECK_HULL = blobPath([
  { x: -0.55, y: -0.3 }, { x: 0.34, y: -0.38 }, { x: 0.74, y: 0 },
  { x: 0.34, y: 0.38 }, { x: -0.55, y: 0.3 }, { x: -0.62, y: 0 },
])
const SHIPWRECK_HOLD = blobPath([
  { x: -0.3, y: -0.15 }, { x: 0.14, y: -0.17 }, { x: 0.34, y: 0 },
  { x: 0.14, y: 0.17 }, { x: -0.3, y: 0.15 },
])
const SHIPWRECK_RIBS = 'M-0.38 -0.32L-0.38 0.32M-0.13 -0.36L-0.13 0.36M0.14 -0.34L0.14 0.34'

// ── scorchmark: a burnt decal — charred fringe, scorched core, ember flecks ──
const SCORCH_OUT = blobPath(roughCircle(0, 0, 0.6, 8, hashString('scorchout')))
const SCORCH_IN = blobPath(roughCircle(0, 0, 0.36, 7, hashString('scorchin')))
const SCORCH_FLECKS = scatterDots(hashString('scorchflecks'), 5, 1.1, 0.04, 0.08)

// ── bonepile: a heaped tangle of long bones topped by a skull (grim remains) ──
const BONEPILE_HEAP = blobPath(roughCircle(0, 0.18, 0.52, 9, hashString('bonepile-heap')))
const BONEPILE_BONES = 'M-0.46 0.36L0.08 0.04M-0.3 0.46L0.4 0.16M-0.44 0.14L0.32 0.4M0.02 0.5L0.46 0.18'
const BONEPILE_KNOBS = ring(0.05, -0.46, 0.36) + ring(0.05, 0.08, 0.04) + ring(0.05, 0.4, 0.16) + ring(0.05, 0.32, 0.4) + ring(0.05, -0.44, 0.14)
const BONEPILE_SKULL = ring(0.16, -0.06, -0.24)
const BONEPILE_SOCKETS = ring(0.04, -0.12, -0.26) + ring(0.04, 0.0, -0.26)

export const LORE: PropDef[] = [
  // sprawled SKELETON — skull, ribcage, splayed limbs. field lore, examinable.
  {
    id: 'skeleton', size: 0.9, wonk: 0.025,
    paths: [
      { d: ring(0.42, 0, 0.1), fill: 'shadow', opacity: 0.2 },
      { d: SKELETON_LIMBS, stroke: 'cream', sw: 0.07, opacity: 0.9 },
      { d: SKELETON_RIBS, stroke: 'cream', sw: 0.05, opacity: 0.9 },
      { d: SKELETON_SPINE, stroke: 'cream', sw: 0.05, opacity: 0.9 },
      ...cutout(SKELETON_SKULL, 'rockDeep', 'cream'),
      { d: SKELETON_SOCKETS, fill: 'ink' },
    ],
    kinds: ['flower', 'rock'], themes: ['dungeon', 'desert', 'haunted'], role: 'field',
    rotate: 'upright', weight: 0.4, pass: 'walkable', footprint: 0.3,
    tags: ['lore', 'grim'], gameplay: ['search'],
    sim: { lore: true },
  },
  // BATTLEDEBRIS — a cracked shield, snapped sword + spear, a helm. field, lootable.
  {
    id: 'battledebris', size: 1, wonk: 0.04,
    paths: [
      { d: ring(0.44, 0, 0.06), fill: 'shadow', opacity: 0.2 },
      { d: 'M0.02 -0.48L0.46 0.34', stroke: 'steel', sw: 0.07 },
      { d: 'M0.52 -0.3L0.08 0.44', stroke: 'wood', sw: 0.09 },
      { d: 'M0.52 -0.3L0.66 -0.48', stroke: 'steel', sw: 0.06 },
      ...cutout(BATTLEDEBRIS_SHIELD, 'woodDeep', 'wood'),
      { d: BATTLEDEBRIS_BOSS, fill: 'ink', opacity: 0.7 },
      ...cutout(BATTLEDEBRIS_HELM, 'rockDeep', 'steel'),
      { d: ring(0.06, 0.36, -0.24), fill: 'ink' },
    ],
    kinds: ['rock', 'stump'], themes: ['plains', 'ruins'], role: 'field',
    rotate: 'free', weight: 0.4, pass: 'walkable', footprint: 0.35,
    tags: ['lore'], gameplay: ['lootable'],
    sim: { lore: true },
  },
  // BROKENCART — an overturned plank bed, one spoked wheel, a smashed wheel. accent.
  {
    id: 'brokencart', size: 1.1, wonk: 0.04,
    paths: [
      { d: ring(0.52, 0.04, 0.04), fill: 'shadow', opacity: 0.2 },
      ...cutout(BROKENCART_BED, 'woodDeep', 'wood'),
      { d: BROKENCART_SEAMS, stroke: 'ink', sw: 0.04, opacity: 0.5 },
      { d: BROKENCART_WHEEL, stroke: 'woodDeep', sw: 0.08 },
      { d: BROKENCART_SPOKES, stroke: 'woodDeep', sw: 0.05 },
      { d: 'M0.42 0.52A0.22 0.22 0 0 1 0.68 0.4', stroke: 'woodDeep', sw: 0.07 },
      { d: 'M-0.18 0.46L0.14 0.64', stroke: 'wood', sw: 0.06 },
    ],
    kinds: ['stump', 'rock'], themes: ['plains', 'forest', 'ruins'], role: 'accent',
    rotate: 'free', weight: 0.25, pass: 'solid', footprint: 0.45,
    tags: ['lore'], gameplay: ['search'],
    sim: { lore: true },
  },
  // SHIPWRECK — a beached broken hull, exposed ribs, an open hold, a mast stub. accent.
  {
    id: 'shipwreck', size: 1.15, wonk: 0.035,
    paths: [
      { d: ring(0.6, 0, 0.08), fill: 'shadow', opacity: 0.2 },
      ...cutout(SHIPWRECK_HULL, 'woodDeep', 'wood'),
      { d: SHIPWRECK_HOLD, fill: 'ink', opacity: 0.6 },
      { d: SHIPWRECK_RIBS, stroke: 'woodDeep', sw: 0.06 },
      { d: ring(0.07, -0.14, -0.02), fill: 'woodLight' },
    ],
    kinds: ['stump', 'tree'], themes: ['beach', 'water', 'swamp'], role: 'accent',
    rotate: 'free', weight: 0.22, pass: 'solid', footprint: 0.55,
    tags: ['lore'], gameplay: ['search', 'lootable'],
    sim: { lore: true },
  },
  // SCORCHMARK — a flat burnt decal (charred fringe, scorched core, ember flecks). field.
  {
    id: 'scorchmark', size: 1.05,
    paths: [
      { d: SCORCH_OUT, fill: 'bloodDry', opacity: 0.4 },
      { d: SCORCH_IN, fill: 'ink', opacity: 0.6 },
      { d: SCORCH_FLECKS, fill: 'emberDeep', opacity: 0.5 },
    ],
    kinds: ['flower'], themes: ['plains', 'volcanic', 'ruins'], role: 'field',
    rotate: 'flat', weight: 0.5, pass: 'walkable', footprint: 0.3,
    tags: ['lore', 'flat'],
    sim: { lore: true },
  },
  // BONEPILE — a heaped tangle of long bones topped by a skull. field lore,
  // lootable. Themes carry swamp + haunted so the hag-witchery group can defer to
  // it (digest W3.6: witchery `bonepile` → this wave-2 lore base).
  {
    id: 'bonepile', size: 1, wonk: 0.035,
    paths: [
      { d: ring(0.5, 0, 0.16), fill: 'shadow', opacity: 0.2 },
      ...cutout(BONEPILE_HEAP, 'rockDeep', 'rock'),
      { d: BONEPILE_BONES, stroke: 'cream', sw: 0.06, opacity: 0.92 },
      { d: BONEPILE_KNOBS, fill: 'cream' },
      ...cutout(BONEPILE_SKULL, 'rockDeep', 'cream'),
      { d: BONEPILE_SOCKETS, fill: 'ink' },
    ],
    kinds: ['rock', 'stump'], themes: ['dungeon', 'haunted', 'swamp'], role: 'field',
    rotate: 'free', weight: 0.35, pass: 'solid', footprint: 0.35,
    tags: ['lore', 'grim'], gameplay: ['lootable'],
    sim: { lore: true },
  },
  // NOTE: `bedroll` (the abandonedcamp SCATTER_SET member) is authored by the
  // furniture group (setpieces/furniture.ts) — a complete camp bedroll with the
  // same plains/forest/mountain themes + `rest` gameplay. Prop ids are globally
  // unique across buckets, so lore DEFERS to avoid a duplicate assetKey; the set's
  // `bedroll` member still exists for AssetCatalog's existence gate.
]
