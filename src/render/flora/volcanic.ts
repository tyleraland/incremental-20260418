// ── Flora catalog: Volcanic flora (emberflower · ashfern · firelily) ──
//
// Heat-adapted + charred growth. COMPLETE PropDefs (full inline placement meta) —
// entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts
// spreads this array into the `stone` bucket (where volcanic props live), then
// variants().
//
// GLOW WITHOUT FILTERS: a flat `glowHalo(r)` blob filled `ember` at low
// fill-opacity UNDER the plant + `light: { color: 'ember', radius }` + `anim`.
// Charred silhouettes use ink/emberDeep. Geometry from './kit' only (type-only
// PropDef). Full guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
import { cutout, glowHalo, ring, radialStar, leaf } from './kit'

// ── emberflower: a low molten-bloom, ember two-tone spiky crown around a hot
// gold-white core, over a flat ember glow halo. Reads as a glowing coal-flower.
const EMBERFLOWER_CROWN = radialStar(7, 0.78, 0.34)

// ── firelily: an upright recurved 6-petal lily head (ember two-tone) with a hot
// gold throat over a bloom-high glow halo, on a stem with two strap leaves.
const FIRELILY_CROWN = radialStar(6, 0.46, 0.19)
const FIRELILY_STEM = 'M0 0.12Q0.06 0.5 0 0.94'
const FIRELILY_LEAF_L = leaf(-0.24, 0.5, 0.3, 0.09, -2.3)
const FIRELILY_LEAF_R = leaf(0.24, 0.44, 0.28, 0.09, -0.9)

// ── ashfern: a charred fern fan — dark ink fronds, a burnt-warm emberDeep sheen
// on the inner fronds, a few live ember cinders smoldering at the base.
const ASHFERN_FRONDS =
  'M0 0.74Q-0.32 0.1 -0.62 -0.5M0 0.74Q-0.14 0.02 -0.26 -0.8M0 0.74Q0.02 -0.02 0.02 -0.88M0 0.74Q0.16 0.02 0.3 -0.78M0 0.74Q0.34 0.12 0.6 -0.46'
const ASHFERN_INNER =
  'M0 0.74Q-0.14 0.02 -0.26 -0.8M0 0.74Q0.02 -0.02 0.02 -0.88M0 0.74Q0.16 0.02 0.3 -0.78'
const ASHFERN_CINDERS = ring(0.05, -0.12, 0.56) + ring(0.045, 0.1, 0.62) + ring(0.035, 0.02, 0.48)

export const VOLCANIC_FLORA: PropDef[] = [
  // EMBERFLOWER: molten coal-bloom, glowing gold core over an ember-petal crown.
  {
    id: 'emberflower', size: 0.85, wonk: 0.04,
    paths: [
      { d: glowHalo(0.78), fill: 'ember', opacity: 0.28 },
      ...cutout(EMBERFLOWER_CROWN, 'emberDeep', 'ember'),
      { d: ring(0.24), fill: 'gourdOrange' },
      { d: ring(0.11), fill: 'petalGold' },
    ],
    kinds: ['flower'], themes: ['volcanic'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.15, layer: 'ground',
    light: { color: 'ember', radius: 1.5 }, anim: true, tags: ['glow', 'heat'],
    maxPerChunk: 4,
  },
  // ASHFERN: charred fern fan — dark fronds, burnt inner sheen, base cinders.
  {
    id: 'ashfern', size: 1, wonk: 0.04,
    paths: [
      { d: ASHFERN_FRONDS, stroke: 'ink', sw: 0.1 },
      { d: ASHFERN_INNER, stroke: 'emberDeep', sw: 0.055, lit: true },
      { d: ASHFERN_CINDERS, fill: 'ember', opacity: 0.8 },
    ],
    kinds: ['flower', 'bush'], themes: ['volcanic', 'haunted'], role: 'understory',
    rotate: 'upright', weight: 0.5, pass: 'walkable', footprint: 0.22, layer: 'ground',
    tags: ['charred'],
  },
  // FIRELILY: harvestable upright lily — recurved ember petals, hot gold throat,
  // glow halo, strap leaves. Flip to firelily_spent = same stem/leaves, bloom gone.
  {
    id: 'firelily', size: 1, wonk: 0.04,
    paths: [
      { d: glowHalo(0.6, 0, 0.02), fill: 'ember', opacity: 0.28 },
      { d: FIRELILY_STEM, stroke: 'foliageDeep', sw: 0.08 },
      { d: FIRELILY_STEM, stroke: 'foliage', sw: 0.045, lit: true },
      ...cutout(FIRELILY_LEAF_L, 'foliageDeep', 'foliage'),
      ...cutout(FIRELILY_LEAF_R, 'foliageDeep', 'foliage'),
      ...cutout(FIRELILY_CROWN, 'emberDeep', 'ember'),
      { d: ring(0.17), fill: 'gourdOrange' },
      { d: ring(0.075), fill: 'petalGold' },
    ],
    kinds: ['flower'], themes: ['volcanic'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.15, layer: 'ground',
    gameplay: ['harvestable'], light: { color: 'ember', radius: 1.5 }, anim: true,
    tags: ['glow'], maxPerChunk: 4,
  },
  // FIRELILY_SPENT: harvested state — same stem + strap leaves, bloom snipped off
  // (no crown, no throat, no glow); a small cut nub caps the stem.
  {
    id: 'firelily_spent', size: 1, wonk: 0.04,
    paths: [
      { d: FIRELILY_STEM, stroke: 'foliageDeep', sw: 0.08 },
      { d: FIRELILY_STEM, stroke: 'foliage', sw: 0.045, lit: true },
      ...cutout(FIRELILY_LEAF_L, 'foliageDeep', 'foliage'),
      ...cutout(FIRELILY_LEAF_R, 'foliageDeep', 'foliage'),
      { d: ring(0.07, 0, 0.11), fill: 'foliageDeep' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.15, layer: 'ground',
  },
]
