// ── Flora catalog: Arcane flora (crystalbloom · seedpod · manaflower · soulwillow) ──
//
// Magical growth that GLOWS/PULSES/FLOATS. Entries flow into TERRAIN_PROPS +
// listAssets with NO shared-file edits. props.ts spreads this array into the
// `stone` bucket (where arcane props live), then variants().
//
// GLOW WITHOUT FILTERS: draw a flat `glowHalo(r)` blob filled `arcaneGlow` at low
// fill-opacity (≈0.25–0.35) UNDER the plant — never a filter/blur/gradient. Also
// set `light: { color: 'arcaneGlow', radius }` (+ `anim: true` for pulse). Full
// guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, glowHalo, ring, radialStar, lobeBlob } from './kit'

// ── crystalbloom: faceted violet crystal shards growing from a small rock base,
// sitting in an arcane glow disc. flower+rock, harvestable → crystalbloom_spent.
// Angular polygon spikes (not organic) so it reads as a crystal, not a flower.
const CRYSTAL_SHARDS =
  'M0 -0.86L0.14 -0.28L0 0.12L-0.14 -0.28Z' + // tall centre spike
  'M-0.36 -0.5L-0.2 -0.06L-0.4 0.16L-0.52 -0.2Z' + // left shard
  'M0.38 -0.44L0.5 -0.06L0.28 0.18L0.2 -0.14Z' // right shard
// lit crystalline glints — one facet edge per shard, cream at low opacity
const CRYSTAL_GLINTS = 'M0 -0.82L0.11 -0.3M-0.34 -0.44L-0.22 -0.08M0.36 -0.38L0.46 -0.08'
const CRYSTAL_ROCK = lobeBlob(6, 0.36, 0.26, 0, 0.34)
// spent: the rock base with three snapped-off shard stumps (same footprint)
const CRYSTAL_STUBS =
  'M-0.07 0.05L0.07 0.05L0.05 0.28L-0.05 0.28Z' +
  'M-0.36 0.1L-0.24 0.1L-0.28 0.3L-0.42 0.3Z' +
  'M0.24 0.08L0.36 0.08L0.4 0.3L0.28 0.3Z'

// ── seedpod: a floating spore-puff — a small green pod at the hub with radiating
// filaments tipped by pale seeds. free-rotate reads as a drifting dandelion head.
const SEEDPOD_FILAMENTS =
  'M0 0L0 -0.72M0 0L0.5 -0.5M0 0L0.72 0M0 0L0.5 0.5M0 0L0 0.72M0 0L-0.5 0.5M0 0L-0.72 0M0 0L-0.5 -0.5'
const SEEDPOD_SEEDS =
  ring(0.05, 0, -0.72) + ring(0.05, 0.5, -0.5) + ring(0.05, 0.72, 0) + ring(0.05, 0.5, 0.5) +
  ring(0.05, 0, 0.72) + ring(0.05, -0.5, 0.5) + ring(0.05, -0.72, 0) + ring(0.05, -0.5, -0.5)
const SEEDPOD_HUB = ring(0.16)

// ── manaflower: a glowing violet bloom on a leafy stem, pulsing arcane core.
// flower, harvestable → manaflower_spent. radialStar petals + bright core.
const MANAFLOWER_STEM = 'M0 0.82Q0.03 0.2 0 -0.24'
const MANAFLOWER_LEAVES =
  'M0 0.34Q-0.34 0.24 -0.42 0.5Q-0.14 0.5 0 0.34ZM0 0.16Q0.32 0.06 0.42 0.3Q0.14 0.32 0 0.16Z'
const MANAFLOWER_BLOOM = radialStar(6, 0.62, 0.3, -Math.PI / 2)
const MANAFLOWER_CORE = ring(0.17, 0, -0.24)
// spent: bare stem + leaves, bloom replaced by a small closed seed nub, no glow
const MANAFLOWER_NUB = ring(0.11, 0, -0.2)

// ── soulwillow: a ghostly weeping willow — round crown with drooping fronds that
// glow arcane at the tips. tree, drape+glow, canopy layer. No harvest.
const SOULWILLOW_CROWN = lobeBlob(7, 0.66, 0.48, 0, -0.16)
// drooping frond strands sweeping down off the crown's lower edge
const SOULWILLOW_FRONDS =
  'M-0.58 -0.12Q-0.66 0.4 -0.5 0.86M-0.3 0.1Q-0.34 0.55 -0.24 0.96M0 0.16Q0.02 0.6 -0.02 1M0.32 0.08Q0.38 0.55 0.28 0.94M0.58 -0.1Q0.68 0.42 0.52 0.84'
// lit subset of the fronds (inner three) nudged up-left by cutout renderer
const SOULWILLOW_FRONDS_LIT = 'M-0.3 0.1Q-0.34 0.55 -0.24 0.96M0 0.16Q0.02 0.6 -0.02 1M0.32 0.08Q0.38 0.55 0.28 0.94'
// glowing frond tips — small arcane dots where the strands end
const SOULWILLOW_TIPS =
  ring(0.045, -0.5, 0.86) + ring(0.045, -0.24, 0.96) + ring(0.045, -0.02, 1) +
  ring(0.045, 0.28, 0.94) + ring(0.045, 0.52, 0.84)

export const ARCANE_FLORA: PropDef[] = [
  // crystalbloom — faceted crystal shards from a rock base in an arcane glow disc.
  {
    id: 'crystalbloom', size: 0.95, wonk: 0.04,
    paths: [
      { d: glowHalo(0.62, 0, -0.1), fill: 'arcaneGlow', opacity: 0.3 },
      ...cutout(CRYSTAL_ROCK, 'rockDeep', 'rock'),
      ...cutout(CRYSTAL_SHARDS, 'berryPurpleDeep', 'berryPurple'),
      { d: CRYSTAL_GLINTS, stroke: 'cream', sw: 0.045, opacity: 0.55 },
    ],
    kinds: ['flower', 'rock'], themes: ['arcane', 'dungeon'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['glow', 'crystal'], gameplay: ['harvestable'], clusterWith: ['crystalbloom'],
    light: { color: 'arcaneGlow', radius: 2 }, maxPerChunk: 3,
  },
  // crystalbloom_spent — same rock base, shards snapped to stumps, glow gone.
  {
    id: 'crystalbloom_spent', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(CRYSTAL_ROCK, 'rockDeep', 'rock'),
      ...cutout(CRYSTAL_STUBS, 'berryPurpleDeep', 'berryPurple'),
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3, layer: 'ground',
  },

  // seedpod — floating spore-puff: green hub, radial filaments, pale seed tips.
  {
    id: 'seedpod', size: 0.7, wonk: 0.03,
    paths: [
      { d: SEEDPOD_FILAMENTS, stroke: 'snowShade', sw: 0.03, opacity: 0.55 },
      ...cutout(SEEDPOD_HUB, 'foliageDeep', 'foliage'),
      { d: SEEDPOD_SEEDS, fill: 'cream', opacity: 0.8 },
    ],
    kinds: ['flower'], themes: ['arcane', 'swamp'], role: 'field', rotate: 'free',
    weight: 0.4, pass: 'walkable', footprint: 0.15, layer: 'canopy',
    anim: true, tags: ['float', 'anim'],
  },

  // manaflower — glowing violet bloom on a leafy stem, pulsing arcane core.
  {
    id: 'manaflower', size: 0.9, wonk: 0.04,
    paths: [
      { d: glowHalo(0.55, 0, -0.24), fill: 'arcaneGlow', opacity: 0.32 },
      { d: MANAFLOWER_STEM, stroke: 'foliageDeep', sw: 0.08 },
      { d: MANAFLOWER_LEAVES, fill: 'foliage' },
      ...cutout(MANAFLOWER_BLOOM, 'berryPurpleDeep', 'berryPurple'),
      { d: MANAFLOWER_CORE, fill: 'arcaneGlow' },
    ],
    kinds: ['flower'], themes: ['arcane'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'walkable', footprint: 0.2, layer: 'ground',
    anim: true, tags: ['glow', 'pulse'], gameplay: ['harvestable'], clusterWith: ['manaflower'],
    light: { color: 'arcaneGlow', radius: 2 }, maxPerChunk: 3,
  },
  // manaflower_spent — same stem + leaves, bloom closed to a seed nub, no glow.
  {
    id: 'manaflower_spent', size: 0.9, wonk: 0.04,
    paths: [
      { d: MANAFLOWER_STEM, stroke: 'foliageDeep', sw: 0.08 },
      { d: MANAFLOWER_LEAVES, fill: 'foliage' },
      ...cutout(MANAFLOWER_NUB, 'foliageDeep', 'foliage'),
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.2, layer: 'ground',
  },

  // soulwillow — ghostly weeping willow: round crown, drooping fronds, arcane
  // glowing tips. Big upright canopy accent.
  {
    id: 'soulwillow', size: 1.3, wonk: 0.05,
    paths: [
      { d: glowHalo(0.9, 0, 0.1), fill: 'arcaneGlow', opacity: 0.2 },
      { d: SOULWILLOW_FRONDS, stroke: 'foliageDeep', sw: 0.06 },
      { d: SOULWILLOW_FRONDS_LIT, stroke: 'foliage', sw: 0.05, lit: true },
      ...cutout(SOULWILLOW_CROWN, 'foliageDeep', 'foliage'),
      { d: SOULWILLOW_TIPS, fill: 'arcaneGlow', opacity: 0.85 },
    ],
    kinds: ['tree'], themes: ['haunted', 'arcane', 'swamp'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'overhang', footprint: 0.5, layer: 'canopy', tall: true,
    anim: true, tags: ['drape', 'glow'], clusterWith: ['soulwillow'],
    light: { color: 'arcaneGlow', radius: 3 }, maxPerChunk: 2,
  },
]
