// ── Setpieces: Foraging (wild berry · forage mushroom · wild leek · seashell · driftwood · wildflower bed · hazel bush …) ──
//
// Bucket: GRASS (nature — where `digspot`/`beehive`/`mushroom` live). Builder:
// fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only.
//
// Gameplay verb `forage` → GameplayTag 'forage' (a state-pair base also carries
// 'harvestable' per the §6 convention). `forage`/`fungus`/`seasonal`/`flat` are
// freeform `tags`. Gathered/picked companion (state pair) reuses geometry,
// cropped: kinds:[] + tags:['interactable']. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION (defer-to-existing — orchestrator owns it): `digspot` already exists
// (grass; desert/beach; lootable). The orchestrator aligns its meta + adds
// `digspot_dug`. NOT authored here. This file's `seashell` (singular) is distinct
// from the existing `seashells` (plural) fan-scatter — confirmed free.

import type { PropDef } from '@/render/props'
import { cutout, ring, lobeBlob, scatterDots, hashString } from './kit'

// ── wildberry: round foliage bush dotted with deep-purple wild berries ──
// (distinct from existing `berrybush` — pink bloom — by its purple fruit)
const WILDBERRY_D     = lobeBlob(7, 0.78, 0.56)
const WILDBERRY_DOTS  = scatterDots(hashString('wildberry'), 7, 1.02, 0.07, 0.1)
const WILDBERRY_NOTCH = 'M-0.34 0.02Q-0.24 0.14 -0.14 0.05M0.12 -0.12Q0.22 -0.02 0.32 -0.1'

// ── foragemush: a clump of three spotted forage-mushroom caps (fungus) ──
const MUSH_CAPS  = ring(0.26, -0.2, -0.02) + ring(0.2, 0.24, 0.08) + ring(0.16, 0.03, -0.3)
const MUSH_SPECK = scatterDots(hashString('foragemush'), 7, 0.9, 0.03, 0.05)
const MUSH_STUBS = ring(0.09, -0.2, -0.02) + ring(0.08, 0.24, 0.08) + ring(0.06, 0.03, -0.3)

// ── wildleek: fan of green blades rising from a pale swollen bulb ──
const LEEK_BLADES     = 'M0 0.38Q-0.3 -0.1 -0.5 -0.7M0 0.38Q-0.12 -0.2 -0.16 -0.86M0 0.38Q0.02 -0.2 0.04 -0.9M0 0.38Q0.16 -0.2 0.26 -0.82M0 0.38Q0.32 -0.1 0.5 -0.66'
const LEEK_BLADES_LIT = 'M0 0.38Q-0.12 -0.2 -0.16 -0.86M0 0.38Q0.02 -0.2 0.04 -0.9M0 0.38Q0.16 -0.2 0.26 -0.82'
const LEEK_BULB       = ring(0.16, 0, 0.4)
const LEEK_STUBS      = 'M0 0.38Q-0.06 0.22 -0.13 0.02M0 0.38Q0 0.2 0.02 -0.02M0 0.38Q0.06 0.22 0.15 0.05'
const LEEK_HOLE       = ring(0.12, 0, 0.42)

// ── seashell: a single scalloped fan shell (flat decal on the sand) ──
const SHELL_D      = 'M0 0.44C-0.52 0.36 -0.6 -0.28 -0.34 -0.5L-0.18 -0.4L-0.02 -0.52L0.16 -0.4L0.34 -0.5C0.6 -0.28 0.52 0.36 0 0.44Z'
const SHELL_RIDGES = 'M0 0.4L-0.3 -0.44M0 0.4L-0.14 -0.46M0 0.4L0.02 -0.5M0 0.4L0.16 -0.46M0 0.4L0.32 -0.44'

// ── driftforage: a bleached driftwood log with a draped kelp strand ──
const DRIFT_D     = 'M-0.72 -0.06C-0.78 -0.28 -0.42 -0.34 -0.02 -0.3C0.4 -0.26 0.76 -0.3 0.72 -0.04C0.68 0.2 0.38 0.22 -0.02 0.2C-0.44 0.18 -0.66 0.14 -0.72 -0.06Z'
const DRIFT_BORE  = ring(0.09, 0.62, -0.06)
const DRIFT_GRAIN = 'M-0.5 -0.14Q0 -0.2 0.5 -0.12M-0.5 0.04Q0 0 0.5 0.06'
const DRIFT_KELP  = 'M-0.34 -0.3Q-0.54 0.12 -0.22 0.36Q0.04 0.1 -0.04 -0.24'

// ── wildflowerbed: a low leaf mat spread with mixed blossom + gold blooms ──
const BED_D       = lobeBlob(6, 0.72, 0.5)
const BED_BLOSSOM = scatterDots(hashString('wfbed-a'), 4, 1.2, 0.1, 0.13)
const BED_GOLD    = scatterDots(hashString('wfbed-b'), 3, 1.05, 0.09, 0.12)
const BED_CENTERS = scatterDots(hashString('wfbed-a'), 4, 1.2, 0.04, 0.055) // concentric on BED_BLOSSOM → flower centres

// ── hazelbush: leafy shrub hung with pale-scarred hazelnuts ──
const HAZEL_D    = lobeBlob(8, 0.8, 0.54)
const HAZEL_NUTS = scatterDots(hashString('hazelbush'), 6, 0.96, 0.09, 0.11)
const HAZEL_CAPS = scatterDots(hashString('hazelbush'), 6, 0.96, 0.04, 0.05) // concentric pale nut scars

export const FORAGING: PropDef[] = [
  // WILD BERRY bush — round two-tone foliage blob with seven purple berries.
  {
    id: 'wildberry', size: 1, wonk: 0.04,
    paths: [...cutout(WILDBERRY_D, 'foliageDeep', 'foliage'), { d: WILDBERRY_DOTS, fill: 'berryPurple' }],
    kinds: ['bush'], themes: ['forest', 'plains'], role: 'cluster', rotate: 'upright',
    weight: 0.45, pass: 'solid', footprint: 0.34, tags: ['forage', 'seasonal'],
    gameplay: ['forage', 'harvestable'], clusterWith: ['wildberry'],
  },
  // picked-clean state pair: same silhouette, no berries + two pinch notches.
  {
    id: 'wildberry_bare', size: 1, wonk: 0.04,
    paths: [...cutout(WILDBERRY_D, 'foliageDeep', 'foliage'), { d: WILDBERRY_NOTCH, stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 }],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.34,
  },

  // FORAGE MUSHROOM clump — three spotted caps (gourd-orange two-tone) + cream flecks.
  {
    id: 'foragemush', size: 0.75, wonk: 0.04,
    paths: [...cutout(MUSH_CAPS, 'woodDeep', 'gourdOrange'), { d: MUSH_SPECK, fill: 'cream' }],
    kinds: ['flower', 'bush'], themes: ['forest', 'cave', 'swamp'], role: 'understory', rotate: 'upright',
    weight: 0.4, pass: 'walkable', footprint: 0.2, tags: ['forage', 'fungus'],
    gameplay: ['forage', 'harvestable'], clusterWith: ['foragemush'],
  },
  // picked state pair: caps gone, just three low cut stem stubs.
  {
    id: 'foragemush_bare', size: 0.75, wonk: 0.04,
    paths: [...cutout(MUSH_STUBS, 'woodDeep', 'woodLight')],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.15,
  },

  // WILD LEEK — green blade fan over a pale two-tone bulb.
  {
    id: 'wildleek', size: 0.9, wonk: 0.04,
    paths: [
      { d: LEEK_BLADES, stroke: 'foliageDeep', sw: 0.1 },
      { d: LEEK_BLADES_LIT, stroke: 'foliage', sw: 0.055, lit: true },
      ...cutout(LEEK_BULB, 'sandLit', 'cream'),
    ],
    kinds: ['flower'], themes: ['plains', 'forest'], role: 'field', rotate: 'upright',
    weight: 0.5, pass: 'walkable', footprint: 0.15, tags: ['forage', 'seasonal'],
    gameplay: ['forage', 'harvestable'], clusterWith: ['wildleek'],
  },
  // pulled state pair: bulb gone (dark hole) + short cut blade stubs.
  {
    id: 'wildleek_bare', size: 0.9, wonk: 0.04,
    paths: [
      { d: LEEK_HOLE, fill: 'ink', opacity: 0.7 },
      { d: LEEK_STUBS, stroke: 'foliageDeep', sw: 0.08 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.12,
  },

  // SEASHELL — a single scalloped fan shell, flat on the sand (rotate flat).
  {
    id: 'seashell', size: 0.6, wonk: 0.03,
    paths: [...cutout(SHELL_D, 'sandLit', 'cream'), { d: SHELL_RIDGES, stroke: 'ink', sw: 0.025, opacity: 0.4 }],
    kinds: ['rock'], themes: ['beach', 'water'], role: 'field', rotate: 'flat', layer: 'ground',
    weight: 0.5, pass: 'walkable', footprint: 0.12, tags: ['forage', 'flat'],
    gameplay: ['forage'],
  },

  // DRIFTWOOD forage — bleached weathered log, end-bore, grain, a draped kelp strand.
  {
    id: 'driftforage', size: 1.1, wonk: 0.04,
    paths: [
      ...cutout(DRIFT_D, 'wood', 'sandLit'),
      { d: DRIFT_BORE, fill: 'ink' },
      { d: DRIFT_GRAIN, stroke: 'woodDeep', sw: 0.04, opacity: 0.6 },
      { d: DRIFT_KELP, stroke: 'mossBase', sw: 0.08, opacity: 0.85 },
    ],
    kinds: ['stump'], themes: ['beach', 'water'], role: 'field', rotate: 'free', layer: 'ground',
    weight: 0.4, pass: 'solid', footprint: 0.3, tags: ['forage'],
    gameplay: ['forage'],
  },

  // WILDFLOWER BED — low two-tone leaf mat spread with mixed blossom + gold blooms.
  {
    id: 'wildflowerbed', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(BED_D, 'foliageDeep', 'foliage'),
      { d: BED_BLOSSOM, fill: 'blossom' },
      { d: BED_GOLD, fill: 'petalGold' },
      { d: BED_CENTERS, fill: 'bloom' },
    ],
    kinds: ['flower'], themes: ['plains', 'forest', 'mountain'], role: 'cluster', rotate: 'upright',
    weight: 0.45, pass: 'walkable', footprint: 0.22, tags: ['forage', 'seasonal'],
    gameplay: ['forage'], clusterWith: ['wildflowerbed'],
  },

  // HAZEL BUSH — leafy shrub hung with six pale-scarred hazelnuts.
  {
    id: 'hazelbush', size: 1, wonk: 0.04,
    paths: [
      ...cutout(HAZEL_D, 'foliageDeep', 'foliage'),
      { d: HAZEL_NUTS, fill: 'wood' },
      { d: HAZEL_CAPS, fill: 'cream' },
    ],
    kinds: ['bush'], themes: ['forest'], role: 'cluster', rotate: 'upright',
    weight: 0.4, pass: 'solid', footprint: 0.34, tags: ['forage', 'seasonal'],
    gameplay: ['forage', 'harvestable'], clusterWith: ['hazelbush'],
  },
  // stripped state pair: same shrub, nuts gone.
  {
    id: 'hazelbush_bare', size: 1, wonk: 0.04,
    paths: [...cutout(HAZEL_D, 'foliageDeep', 'foliage')],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.34,
  },
]
