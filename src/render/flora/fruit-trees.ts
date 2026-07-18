// ── Flora catalog: Orchard fruit trees (apple · cherry · citrus · banana ·
//    coconut · olive · pear · dead orchard) ──
//
// Top-down canopies with ripe fruit; every fruiting tree has a harvested-state
// pair (same crown, fruit stripped). Broadleaf trees are round two-tone crowns
// distinguished by their ONE signature accent (fruit colour); banana/coconut
// carry distinct splayed-frond silhouettes; the dead orchard is bare branches.
// Entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits.
// Registered fruit → gentle `wonk` so variants keep the fruit on the crown.
//
// Geometry from './kit' only (type-only import of PropDef). Guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, lobeBlob, leaf, ring, scatterDots, hashString } from './kit'

// ── Shared silhouettes ──────────────────────────────────────────────────────
// Round broadleaf crown (apple/cherry/citrus/pear), centred slightly high.
const CROWN_ROUND = lobeBlob(7, 0.82, 0.6, 0, -0.06)
// A tighter, taller crown for the pear.
const CROWN_PEAR = lobeBlob(6, 0.72, 0.52, 0, -0.12)
// A smaller, silvery, sparser crown for the olive.
const CROWN_OLIVE = lobeBlob(6, 0.62, 0.44, 0, -0.04)
// Soft ground shadow shared by the canopies (flat offset ellipse, behind).
const GROUND_SHADOW = 'M0.12 0.66A0.58 0.28 0 1 0 0.14 0.7Z'
// A couple of dark lobe clefts for the "broccoli" crown read.
const CROWN_CLEFTS = 'M0 -0.1L-0.3 -0.4M0 -0.1L0.32 -0.32M0 -0.1L0.4 0.12M0 -0.1L-0.06 0.42M0 -0.1L-0.4 0.06'

// Banana: a rosette of ~5 broad drooping leaves radiating from the crown.
const bananaLeaves = (angs: number[]): string =>
  angs.map((a) => leaf(Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.04, 0.5, 0.28, a)).join('')
const BANANA_ALL = bananaLeaves([-Math.PI / 2, -0.15, 0.7, Math.PI - 0.6, Math.PI + 0.35])
const BANANA_LIT = bananaLeaves([-Math.PI / 2, Math.PI - 0.6])
// Banana bunch: three short golden fingers near the centre.
const BANANA_BUNCH = 'M-0.06 0.06Q0.1 0.14 0.06 0.34Q-0.02 0.24 -0.06 0.06ZM0.1 0.02Q0.26 0.12 0.2 0.32Q0.12 0.2 0.1 0.02ZM-0.2 0.08Q-0.06 0.18 -0.12 0.36Q-0.2 0.24 -0.2 0.08Z'

// Coconut palm: many thin feathered fronds fanning out from the crown top.
const palmFronds = (n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2
    d += leaf(Math.cos(a) * 0.52, Math.sin(a) * 0.52 - 0.04, 0.52, 0.13, a)
  }
  return d
}
const PALM_ALL = palmFronds(9)
const palmFrondsLit = (): string =>
  [0.2, 0.2 + (Math.PI * 2) / 9 * 2, 0.2 + (Math.PI * 2) / 9 * 7]
    .map((a) => leaf(Math.cos(a) * 0.52, Math.sin(a) * 0.52 - 0.04, 0.52, 0.13, a)).join('')
const PALM_LIT = palmFrondsLit()
// Three coconuts clustered at the crown heart.
const COCONUTS = ring(0.12, -0.1, 0.02) + ring(0.11, 0.12, 0.06) + ring(0.1, 0, 0.18)

// Dead orchard: bare forking branches radiating from a knot (no leaves/fruit).
const DEAD_BRANCHES =
  'M0 0.1L-0.5 -0.5M-0.28 -0.14L-0.6 -0.16M0 0.1L0.12 -0.62M0.02 -0.3L0.34 -0.5M0 0.1L0.58 -0.28M0.3 -0.06L0.5 0.1M0 0.1L-0.24 0.56M-0.12 0.34L-0.42 0.4M0 0.1L0.4 0.46'
const DEAD_BRANCHES_LIT = 'M0 0.1L-0.5 -0.5M0 0.1L0.58 -0.28M0 0.1L0.12 -0.62'

// Seeded fruit sprays (deterministic, one multi-subpath so the crown stays lit-synced).
const APPLE_FRUIT = scatterDots(hashString('appletree'), 5, 1.15, 0.09, 0.12)
const CHERRY_FRUIT = scatterDots(hashString('cherrytree'), 8, 1.2, 0.05, 0.07)
const CHERRY_BLOOM = scatterDots(hashString('cherrybloom'), 6, 1.25, 0.05, 0.08)
const CITRUS_FRUIT = scatterDots(hashString('citrustree'), 5, 1.1, 0.1, 0.13)
const PEAR_FRUIT = scatterDots(hashString('peartree'), 5, 1.0, 0.08, 0.11)
const OLIVE_FRUIT = scatterDots(hashString('olivetree'), 8, 1.0, 0.04, 0.06)

export const FRUIT_TREES: PropDef[] = [
  // ── Apple: round crown, a few big red apples ──
  {
    id: 'appletree', size: 1.2, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_ROUND, 'foliageDeep', 'foliage'),
      { d: CROWN_CLEFTS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.55 },
      { d: APPLE_FRUIT, fill: 'fruitRed' },
    ],
    kinds: ['tree'], themes: ['orchard', 'plains', 'forest'], role: 'cluster', rotate: 'upright',
    weight: 0.4, pass: 'overhang', footprint: 0.5, tall: true, layer: 'canopy',
    tags: ['fruit', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['appletree'],
  },
  {
    id: 'appletree_bare', size: 1.2, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_ROUND, 'foliageDeep', 'foliage'),
      { d: CROWN_CLEFTS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.55 },
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.5, layer: 'canopy',
  },

  // ── Cherry: round crown dusted with pale blossom + small red cherries ──
  {
    id: 'cherrytree', size: 1.15, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_ROUND, 'foliageDeep', 'foliage'),
      { d: CHERRY_BLOOM, fill: 'blossom', opacity: 0.9 },
      { d: CHERRY_FRUIT, fill: 'fruitRed' },
    ],
    kinds: ['tree'], themes: ['orchard', 'plains'], role: 'cluster', rotate: 'upright',
    weight: 0.35, pass: 'overhang', footprint: 0.48, tall: true, layer: 'canopy',
    tags: ['fruit', 'bloom', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['cherrytree'],
  },
  {
    id: 'cherrytree_bare', size: 1.15, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_ROUND, 'foliageDeep', 'foliage'),
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.48, layer: 'canopy',
  },

  // ── Citrus: round crown, fat orange fruit ──
  {
    id: 'citrustree', size: 1.1, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_ROUND, 'foliageDeep', 'foliage'),
      { d: CROWN_CLEFTS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.5 },
      { d: CITRUS_FRUIT, fill: 'gourdOrange' },
    ],
    kinds: ['tree'], themes: ['orchard', 'beach'], role: 'cluster', rotate: 'upright',
    weight: 0.3, pass: 'overhang', footprint: 0.48, tall: true, layer: 'canopy',
    tags: ['fruit', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['citrustree'],
  },
  {
    id: 'citrustree_bare', size: 1.1, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_ROUND, 'foliageDeep', 'foliage'),
      { d: CROWN_CLEFTS, stroke: 'foliageDeep', sw: 0.05, opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.48, layer: 'canopy',
  },

  // ── Banana: splayed broad drooping leaves + a golden bunch ──
  {
    id: 'bananatree', size: 1.15, wonk: 0.05,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.2 },
      { d: BANANA_ALL, fill: 'foliageDeep' },
      { d: BANANA_LIT, fill: 'foliage', lit: true },
      { d: BANANA_BUNCH, fill: 'petalGold' },
    ],
    kinds: ['tree'], themes: ['jungle', 'beach'], role: 'cluster', rotate: 'upright',
    weight: 0.3, pass: 'overhang', footprint: 0.48, tall: true, layer: 'canopy',
    tags: ['fruit', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['bananatree'],
  },
  {
    id: 'bananatree_bare', size: 1.15, wonk: 0.05,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.2 },
      { d: BANANA_ALL, fill: 'foliageDeep' },
      { d: BANANA_LIT, fill: 'foliage', lit: true },
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.48, layer: 'canopy',
  },

  // ── Coconut palm: fan of thin fronds + a knot of coconuts ──
  {
    id: 'coconutpalm', size: 1.2, wonk: 0.05,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.2 },
      { d: PALM_ALL, fill: 'foliageDeep' },
      { d: PALM_LIT, fill: 'foliage', lit: true },
      { d: COCONUTS, fill: 'woodDeep' },
      { d: ring(0.06, -0.08, -0.02), fill: 'woodLight' },
    ],
    kinds: ['tree'], themes: ['desert', 'beach'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'overhang', footprint: 0.5, tall: true, layer: 'canopy',
    tags: ['fruit', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['coconutpalm'],
  },
  {
    id: 'coconutpalm_bare', size: 1.2, wonk: 0.05,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.2 },
      { d: PALM_ALL, fill: 'foliageDeep' },
      { d: PALM_LIT, fill: 'foliage', lit: true },
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.5, layer: 'canopy',
  },

  // ── Olive: small silvery-green crown, tiny dark olives ──
  {
    id: 'olivetree', size: 1.0, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.2 },
      ...cutout(CROWN_OLIVE, 'mossBase', 'tileMoss'),
      { d: 'M0 -0.06L-0.24 -0.3M0 -0.06L0.28 -0.24M0 -0.06L-0.02 0.3', stroke: 'mossInk', sw: 0.04, opacity: 0.55 },
      { d: OLIVE_FRUIT, fill: 'berryPurpleDeep' },
    ],
    kinds: ['tree'], themes: ['desert', 'plains', 'ruins'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'overhang', footprint: 0.42, tall: true, layer: 'canopy',
    tags: ['fruit', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['olivetree'],
  },
  {
    id: 'olivetree_bare', size: 1.0, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.2 },
      ...cutout(CROWN_OLIVE, 'mossBase', 'tileMoss'),
      { d: 'M0 -0.06L-0.24 -0.3M0 -0.06L0.28 -0.24M0 -0.06L-0.02 0.3', stroke: 'mossInk', sw: 0.04, opacity: 0.55 },
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.42, layer: 'canopy',
  },

  // ── Pear: tighter upright crown, golden-green pears ──
  {
    id: 'peartree', size: 1.15, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_PEAR, 'foliageDeep', 'foliage'),
      { d: 'M0 -0.14L-0.28 -0.44M0 -0.14L0.3 -0.4M0 -0.14L0.06 0.38', stroke: 'foliageDeep', sw: 0.05, opacity: 0.5 },
      { d: PEAR_FRUIT, fill: 'petalGold' },
    ],
    kinds: ['tree'], themes: ['orchard', 'plains'], role: 'cluster', rotate: 'upright',
    weight: 0.3, pass: 'overhang', footprint: 0.46, tall: true, layer: 'canopy',
    tags: ['fruit', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['peartree'],
  },
  {
    id: 'peartree_bare', size: 1.15, wonk: 0.04,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(CROWN_PEAR, 'foliageDeep', 'foliage'),
      { d: 'M0 -0.14L-0.28 -0.44M0 -0.14L0.3 -0.4M0 -0.14L0.06 0.38', stroke: 'foliageDeep', sw: 0.05, opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.46, layer: 'canopy',
  },

  // ── Dead orchard: bare forking branches, no leaves or fruit ──
  {
    id: 'deadorchard', size: 1.1, wonk: 0.06,
    paths: [
      { d: GROUND_SHADOW, fill: 'shadow', opacity: 0.18 },
      { d: DEAD_BRANCHES, stroke: 'woodDeep', sw: 0.1 },
      { d: DEAD_BRANCHES_LIT, stroke: 'wood', sw: 0.06, lit: true },
      { d: ring(0.08, 0, 0.1), fill: 'woodDeep' },
    ],
    kinds: ['tree'], themes: ['haunted', 'ruins'], role: 'accent', rotate: 'upright',
    weight: 0.25, pass: 'overhang', footprint: 0.4, tall: true, layer: 'canopy',
  },
]
