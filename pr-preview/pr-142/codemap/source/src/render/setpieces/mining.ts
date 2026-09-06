// ── Setpieces: Mining (ore node · gem cluster · geode · meteorite · mine ladder · slime …) ──
//
// Bucket: STONE (mountain/cave — where `orevein`/`minecart`/`mineentrance` live).
// Builder fills COMPLETE PropDefs; props.ts spreads MINING into `stone`, runs
// variants(). Geometry from './kit' only. These are TOP-DOWN props: an ore rock
// reads as a boulder studded with metal glints; a gem cluster as shards on a rock
// mound seen from above; a mine ladder as a shaft-hole with rungs; a slime as a
// gooey blob with eyes.
//
// Gameplay verbs → GameplayTag: mine/descend/spawn/squish + harvestable. `ore`/
// `glow`/`fungus`/`portal`/`enemy` are freeform `tags`. Glow = a FLAT `glowHalo`
// UNDER the object at low opacity + `light:{…}` (never a filter). Mined-out
// companions (state pairs) reuse the rock silhouette with the vein struck out:
// kinds:[] + ['interactable']. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS: orevein/minecart/mineentrance already props → DEFER (alignment lane
// adds `mine`). `crystalspire` (spec row) ALSO already exists (stone bucket) →
// SKIP it + its `spire_shattered` state (would duplicate the assetKey). Everything
// below is a NEW id.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, radialStar, lobeBlob, glowHalo } from './kit'

// ── orenode: rounded boulder studded with metal ore nuggets + gold glints ──────
// (distinct from `orevein`, whose signature is a jagged gold SEAM across the rock)
const ORENODE_ROCK =
  'M-0.62 0.08C-0.68 -0.26 -0.4 -0.52 -0.02 -0.54C0.36 -0.56 0.66 -0.32 0.64 0.04C0.62 0.34 0.34 0.52 -0.04 0.5C-0.4 0.48 -0.56 0.36 -0.62 0.08Z'
const ORENODE_NUGGETS = ring(0.1, -0.24, -0.1) + ring(0.08, 0.18, 0.06) + ring(0.07, 0.02, 0.28) + ring(0.065, 0.34, -0.24)
const ORENODE_GLINT = ring(0.04, -0.26, -0.14) + ring(0.03, 0.16, 0.02) + ring(0.03, 0.32, -0.28)
const ORENODE_PITS = ring(0.08, -0.24, -0.1) + ring(0.06, 0.18, 0.06) + ring(0.055, 0.02, 0.28) + ring(0.05, 0.34, -0.24)

// ── gemcluster: violet crystal shards sprouting from a low rock mound, glowing ──
const GEMCLUSTER_ROCK =
  'M-0.58 0.5C-0.68 0.24 -0.52 0.02 -0.24 -0.02C0.04 -0.06 0.36 0.0 0.52 0.16C0.64 0.3 0.6 0.46 0.5 0.52Z'
const GEMCLUSTER_GEMS =
  'M-0.06 -0.52L0.09 -0.16L-0.02 0.08L-0.17 -0.16Z M-0.44 -0.24L-0.3 0.02L-0.48 0.18L-0.58 -0.06Z M0.34 -0.36L0.49 -0.06L0.36 0.14L0.22 -0.1Z'
const GEMCLUSTER_GLINT = 'M-0.07 -0.46L-0.11 -0.16M-0.4 -0.18L-0.46 0.06M0.36 -0.28L0.3 -0.02'
const GEMCLUSTER_STUBS =
  'M-0.12 -0.04L0.08 -0.04L0.03 -0.18L-0.07 -0.18Z M-0.48 0.04L-0.32 0.04L-0.37 -0.08L-0.45 -0.08Z M0.26 0.0L0.44 0.0L0.42 -0.12L0.3 -0.12Z'

// ── geode: whole = plain ovoid stone; cracked = crystal-lined hollow reveal ─────
const GEODE_D =
  'M-0.5 0.06C-0.56 -0.2 -0.34 -0.42 -0.02 -0.44C0.3 -0.46 0.54 -0.26 0.52 0.02C0.5 0.3 0.28 0.46 -0.04 0.44C-0.32 0.42 -0.46 0.3 -0.5 0.06Z'
const GEODE_SEAM = 'M-0.34 -0.28Q-0.02 -0.12 0.36 -0.22'
const GEODE_LINING = radialStar(11, 0.27, 0.15)
const GEODE_CORE = ring(0.12)
const GEODE_GLINT = ring(0.05, -0.04, -0.05)

// ── meteorite: charred pitted rock veined with molten ember cracks, glowing ─────
const METEORITE_D =
  'M-0.5 0.1C-0.58 -0.18 -0.36 -0.44 -0.04 -0.46C0.3 -0.48 0.54 -0.24 0.5 0.06C0.46 0.32 0.24 0.48 -0.06 0.46C-0.34 0.44 -0.44 0.32 -0.5 0.1Z'
const METEORITE_CRACKS = 'M-0.3 -0.2L-0.06 -0.02L0.06 -0.24L0.28 -0.06M-0.06 -0.02L-0.02 0.26'
const METEORITE_PITS = ring(0.06, -0.28, 0.18) + ring(0.05, 0.3, 0.24) + ring(0.045, 0.12, -0.3)
const METEORITE_CRATER = ring(0.2)

// ── mushroomcolony: cluster of glowing caps seen top-down (cave/swamp fungi) ────
const COLONY_CAPS =
  ring(0.28, -0.02, -0.06) + ring(0.2, -0.4, 0.12) + ring(0.22, 0.38, 0.02) + ring(0.16, 0.06, 0.34) + ring(0.14, 0.2, -0.34)
const COLONY_SPOTS = ring(0.05, -0.02, -0.12) + ring(0.04, -0.4, 0.08) + ring(0.045, 0.36, -0.02) + ring(0.035, 0.06, 0.3)
const COLONY_STUBS =
  ring(0.09, -0.02, -0.06) + ring(0.07, -0.4, 0.12) + ring(0.08, 0.38, 0.02) + ring(0.06, 0.06, 0.34) + ring(0.05, 0.2, -0.34)

// ── mineladder: rock-framed descent shaft with a timber ladder down into ink ────
const MINELADDER_ROCK =
  'M-0.6 -0.56C-0.2 -0.66 0.24 -0.66 0.6 -0.56C0.7 -0.2 0.7 0.2 0.6 0.56C0.24 0.66 -0.2 0.66 -0.6 0.56C-0.7 0.2 -0.7 -0.2 -0.6 -0.56Z'
const MINELADDER_SHAFT = rect(-0.32, -0.46, 0.64, 0.92)
const MINELADDER_RAILS = 'M-0.16 -0.44L-0.16 0.44M0.16 -0.44L0.16 0.44'
const MINELADDER_RUNGS = 'M-0.16 -0.3L0.16 -0.3M-0.16 -0.08L0.16 -0.08M-0.16 0.14L0.16 0.14M-0.16 0.36L0.16 0.36'

// ── slime: gooey round blob with a shine + eye pair (spawner enemy prop) ────────
const SLIME_D = lobeBlob(7, 0.62, 0.52)
const SLIME_EYES = ring(0.065, -0.16, -0.02) + ring(0.065, 0.16, -0.02)
const SLIME_CATCH = ring(0.025, -0.18, -0.05) + ring(0.025, 0.14, -0.05)
const SLIME_SHINE = ring(0.13, -0.22, -0.24)

export const MINING: PropDef[] = [
  // ORE NODE: boulder with metal nuggets + gold glints — the "mine country" filler.
  {
    id: 'orenode', size: 0.95, wonk: 0.03,
    paths: [
      ...cutout(ORENODE_ROCK, 'rockDeep', 'rock'),
      { d: ORENODE_NUGGETS, fill: 'steel', opacity: 0.85 },
      { d: ORENODE_GLINT, fill: 'bannerGold', opacity: 0.9 },
    ],
    kinds: ['rock'], themes: ['mountain', 'cave', 'dungeon'], role: 'field', rotate: 'free',
    weight: 0.5, near: ['wall', 'rock'], pass: 'solid', footprint: 0.35,
    tags: ['ore'], gameplay: ['mine', 'harvestable'],
    sim: { resource: { respawn: 'never' }, statePair: 'orenode_spent' },
  },
  // ORE NODE (mined out): same boulder, nuggets struck out to dark pits.
  {
    id: 'orenode_spent', size: 0.95, wonk: 0.03,
    paths: [
      ...cutout(ORENODE_ROCK, 'rockDeep', 'rock'),
      { d: ORENODE_PITS, fill: 'ink', opacity: 0.6 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35,
  },

  // GEM CLUSTER: violet shards on a rock mound over a flat arcane halo — glows.
  {
    id: 'gemcluster', size: 1, wonk: 0.03,
    paths: [
      { d: glowHalo(0.72), fill: 'arcaneGlow', opacity: 0.3 },
      ...cutout(GEMCLUSTER_ROCK, 'rockDeep', 'rock'),
      ...cutout(GEMCLUSTER_GEMS, 'berryPurpleDeep', 'berryPurple'),
      { d: GEMCLUSTER_GLINT, stroke: 'cream', sw: 0.04, opacity: 0.8 },
    ],
    kinds: ['rock'], themes: ['cave', 'mountain', 'dungeon'], role: 'field', rotate: 'upright',
    weight: 0.4, near: ['wall', 'rock'], pass: 'solid', footprint: 0.35, maxPerChunk: 3,
    tags: ['ore', 'glow'], gameplay: ['mine', 'harvestable'], light: { color: 'arcaneGlow', radius: 2 },
    sim: { resource: { respawn: 'never' }, statePair: 'gemcluster_spent' },
  },
  // GEM CLUSTER (mined out): rock mound with the shards broken to dark stubs, no glow.
  {
    id: 'gemcluster_spent', size: 1, wonk: 0.03,
    paths: [
      ...cutout(GEMCLUSTER_ROCK, 'rockDeep', 'rock'),
      { d: GEMCLUSTER_STUBS, fill: 'berryPurpleDeep', opacity: 0.75 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35,
  },

  // GEODE: plain ovoid stone with a faint seam + a crystal peek — accent hero rock.
  {
    id: 'geode', size: 0.85, wonk: 0.035,
    paths: [
      ...cutout(GEODE_D, 'rockDeep', 'rock'),
      { d: GEODE_SEAM, stroke: 'ink', sw: 0.03, opacity: 0.4 },
      { d: ring(0.05, 0.3, -0.2), fill: 'cream', opacity: 0.55 },
    ],
    kinds: ['rock'], themes: ['cave', 'mountain'], role: 'accent', rotate: 'free',
    weight: 0.25, near: ['wall', 'rock'], pass: 'solid', footprint: 0.3, maxPerChunk: 2,
    tags: ['ore'], gameplay: ['mine', 'harvestable'],
    sim: { resource: { respawn: 'never' }, statePair: 'geode_cracked' },
  },
  // GEODE (cracked): same shell split to a dark hollow lined with pale crystal.
  {
    id: 'geode_cracked', size: 0.85, wonk: 0.035,
    paths: [
      ...cutout(GEODE_D, 'rockDeep', 'rock'),
      { d: ring(0.28), fill: 'ink' },
      { d: GEODE_LINING, fill: 'bannerBlueDk' },
      { d: GEODE_CORE, fill: 'bannerBlue' },
      { d: GEODE_GLINT, fill: 'cream', opacity: 0.85 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3,
  },

  // METEORITE: charred pitted rock veined with molten ember cracks over a heat halo.
  {
    id: 'meteorite', size: 0.9, wonk: 0.035,
    paths: [
      { d: glowHalo(0.62), fill: 'ember', opacity: 0.25 },
      ...cutout(METEORITE_D, 'rockDeep', 'rock'),
      { d: METEORITE_PITS, fill: 'ink', opacity: 0.6 },
      { d: METEORITE_CRACKS, stroke: 'emberDeep', sw: 0.07 },
      { d: METEORITE_CRACKS, stroke: 'ember', sw: 0.04, lit: true },
    ],
    kinds: ['rock'], themes: ['plains', 'volcanic', 'tundra'], role: 'accent', rotate: 'free',
    weight: 0.2, pass: 'solid', footprint: 0.3, maxPerChunk: 1,
    tags: ['ore', 'glow'], gameplay: ['mine', 'harvestable'], light: { color: 'ember', radius: 2 },
    sim: { resource: { respawn: 'never' }, statePair: 'meteorite_mined' },
  },
  // METEORITE (mined): the molten core dug to a cold crater, cracks gone dark, no glow.
  {
    id: 'meteorite_mined', size: 0.9, wonk: 0.035,
    paths: [
      ...cutout(METEORITE_D, 'rockDeep', 'rock'),
      { d: METEORITE_CRATER, fill: 'ink' },
      { d: METEORITE_CRACKS, stroke: 'rockDeep', sw: 0.06 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3,
  },

  // MUSHROOM COLONY: a cluster of glowing teal caps (top-down) over a soft halo.
  {
    id: 'mushroomcolony', size: 1, wonk: 0.03,
    paths: [
      { d: glowHalo(0.78), fill: 'glowFungus', opacity: 0.14 },
      ...cutout(COLONY_CAPS, 'murkDeep', 'glowFungus'),
      { d: COLONY_SPOTS, fill: 'murkDeep', opacity: 0.7 },
    ],
    kinds: ['bush', 'flower'], themes: ['cave', 'swamp'], role: 'field', rotate: 'upright',
    weight: 0.45, pass: 'walkable', footprint: 0.25, clusterWith: ['mushroomcolony'],
    tags: ['fungus', 'glow'], gameplay: ['harvestable'], light: { color: 'glowFungus', radius: 1.5 },
    sim: { resource: { respawn: 'slow' }, statePair: 'colony_picked' },
  },
  // MUSHROOM COLONY (picked): caps gone, only the stem stubs remain, no glow.
  {
    id: 'colony_picked', size: 1, wonk: 0.03,
    paths: [
      { d: COLONY_STUBS, fill: 'murkDeep', opacity: 0.75 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25,
  },

  // MINE LADDER: rock-framed descent shaft with a timber ladder into ink — a portal.
  {
    id: 'mineladder', size: 1.05, wonk: 0.03,
    paths: [
      ...cutout(MINELADDER_ROCK, 'rockDeep', 'rock'),
      { d: MINELADDER_SHAFT, fill: 'ink' },
      { d: MINELADDER_RAILS, stroke: 'wood', sw: 0.07 },
      { d: MINELADDER_RUNGS, stroke: 'woodDeep', sw: 0.055 },
    ],
    kinds: ['rock', 'stump'], themes: ['cave', 'dungeon', 'mountain'], role: 'accent', rotate: 'upright',
    weight: 0.2, near: ['wall'], pass: 'solid', footprint: 0.4, maxPerChunk: 1,
    tags: ['portal'], gameplay: ['descend'], anchor: ['boundary'],
  },

  // SLIME: a gooey round green blob with a shine + eye pair — the spawner enemy.
  {
    id: 'slime', size: 0.85, wonk: 0.035,
    paths: [
      ...cutout(SLIME_D, 'mossInk', 'tileMoss'),
      { d: SLIME_SHINE, fill: 'cream', opacity: 0.22 },
      { d: SLIME_EYES, fill: 'ink' },
      { d: SLIME_CATCH, fill: 'cream', opacity: 0.85 },
    ],
    kinds: ['bush'], themes: ['cave', 'swamp', 'dungeon'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'solid', footprint: 0.3, maxPerChunk: 3,
    tags: ['enemy', 'anim'], gameplay: ['spawn', 'squish'], anim: true,
    sim: { encounter: 'spawner' },
  },
]
