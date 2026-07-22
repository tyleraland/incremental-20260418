// ── Setpieces: Spawners (monster spawner · egg clutch · spider nest · wasp hive · blight …) ──
//
// Bucket: STONE (dungeon/haunted enemy dens — where `cage`/`skull`/`cobweb` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `stone`, then variants(). Geometry
// from './kit' only.
//
// Gameplay verbs → GameplayTag: spawn / spread / hazard / destructible. `enemy`/
// `web`/`corrupt`/`glow`/`anim` are freeform `tags`. Glow props (spawner, blight)
// draw a flat glow-role `glowHalo` UNDER the body + declare `light` — never a
// filter/gradient (Palette.test fails). State pairs (spawner_dead / clutch_hatched
// / nest_cleared / blight_cleansed) reuse the base geometry, kinds:[] +
// ['interactable']. wasphive has no state ('-'). Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION: `slime`/`mimic` are MONSTER ids (different namespace) — these prop
// ids (spawner/eggclutch/spidernest/wasphive/blight) are all NEW, no clashes.

import type { PropDef } from '@/render/props'
import { cutout, lobeBlob, ring, scatterDots, glowHalo, hashString } from './kit'

// ── seeded detail (deterministic; same seed keeps a base+state pair in register) ──
const SPARK_SEED = hashString('spawner')
const EGG_SEED = hashString('eggclutch')
const BLIGHT_SEED = hashString('blight')

// spawner: a jagged stone maw ring, so the glow core wells through the centre
const SPAWNER_RIM = lobeBlob(9, 0.74, 0.54)
const SPAWNER_PIT = ring(0.4)
const SPAWNER_CORE = lobeBlob(6, 0.26, 0.16)
const SPAWNER_SPARKS = scatterDots(SPARK_SEED, 4, 0.42, 0.03, 0.06)
const SPAWNER_CRACK = 'M-0.12 -0.34L0.06 0.0L-0.05 0.36'

// eggclutch: a wet membrane nest cradling a cluster of pale eggs
const NEST_D = lobeBlob(7, 0.82, 0.58)
const EGGS_D = scatterDots(EGG_SEED, 5, 0.62, 0.14, 0.18)
const HATCH_HOLES = scatterDots(EGG_SEED, 5, 0.62, 0.06, 0.09) // same centres, cracked open

// spidernest: an octagonal orb-web (spokes + two rings) round a silk-wrapped sac
const WEB_SPOKES =
  'M0 0L0 -0.82M0 0L0.58 -0.58M0 0L0.82 0M0 0L0.58 0.58M0 0L0 0.82M0 0L-0.58 0.58M0 0L-0.82 0M0 0L-0.58 -0.58'
const WEB_ARCS =
  'M0 -0.66L0.47 -0.47L0.66 0L0.47 0.47L0 0.66L-0.47 0.47L-0.66 0L-0.47 -0.47Z' +
  'M0 -0.34L0.24 -0.24L0.34 0L0.24 0.24L0 0.34L-0.24 0.24L-0.34 0L-0.24 -0.24Z'
const SAC_D = lobeBlob(6, 0.34, 0.26)
const SAC_WRAP = 'M-0.28 -0.13Q0 -0.32 0.28 -0.11M-0.26 0.11Q0 0.26 0.26 0.09'
const WEB_TORN = 'M0 0L0 -0.7M0 0L0.52 0.5M0 0L-0.62 0.2M0 0L0.28 -0.56'

// wasphive: a hanging paper-comb onion with concentric ridges + a dark mouth
const HIVE_D = 'M0 -0.78C0.5 -0.5 0.56 0.2 0 0.64C-0.56 0.2 -0.5 -0.5 0 -0.78Z'
const HIVE_RIDGES =
  'M-0.34 -0.12Q0 -0.4 0.34 -0.12M-0.4 0.16Q0 -0.12 0.4 0.16M-0.3 0.4Q0 0.2 0.3 0.4'

// blight: a spreading corruption patch dotted with sickly bioluminescent spores
const BLIGHT_D = lobeBlob(8, 0.82, 0.54)
const BLIGHT_SPORES = scatterDots(BLIGHT_SEED, 6, 1.05, 0.06, 0.11)
const BLIGHT_RECOVER = scatterDots(BLIGHT_SEED, 5, 1.05, 0.05, 0.08)

export const SPAWNERS: PropDef[] = [
  // MONSTER SPAWNER: jagged stone maw ringing a dark pit, an arcane core welling
  // up through it (flat halo + light). Ominous dungeon/cave den accent.
  {
    id: 'spawner', size: 1.05, wonk: 0.035,
    paths: [
      { d: glowHalo(0.78), fill: 'arcaneGlow', opacity: 0.28 },
      ...cutout(SPAWNER_RIM, 'rockDeep', 'rock'),
      { d: SPAWNER_PIT, fill: 'stoneDark' },
      { d: SPAWNER_CORE, fill: 'arcaneGlow', opacity: 0.9 },
      { d: SPAWNER_SPARKS, fill: 'cream', opacity: 0.8 },
    ],
    kinds: ['rock'], themes: ['dungeon', 'haunted', 'cave'], role: 'accent', rotate: 'free',
    weight: 0.2, pass: 'solid', footprint: 0.45, layer: 'ground',
    tags: ['enemy', 'glow'], gameplay: ['spawn'], light: { color: 'arcaneGlow', radius: 2 },
    maxPerChunk: 2, sim: { encounter: 'spawner', statePair: 'spawner_dead' },
  },
  // SPAWNER (dead): same maw + pit, glow snuffed to a cold cracked core.
  {
    id: 'spawner_dead', size: 1.05, wonk: 0.035,
    paths: [
      ...cutout(SPAWNER_RIM, 'rockDeep', 'rock'),
      { d: SPAWNER_PIT, fill: 'stoneDark' },
      { d: SPAWNER_CORE, fill: 'ink' },
      { d: SPAWNER_CRACK, stroke: 'rockDeep', sw: 0.045, opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.45,
  },

  // EGG CLUTCH: a wet membrane nest of pale two-tone eggs. Squishable enemy field
  // filler for caves/swamps/deserts.
  {
    id: 'eggclutch', size: 0.9, wonk: 0.04,
    paths: [
      ...cutout(NEST_D, 'murkDeep', 'murk'),
      ...cutout(EGGS_D, 'snowShade', 'cream'),
    ],
    kinds: ['flower', 'rock'], themes: ['cave', 'swamp', 'desert'], role: 'field', rotate: 'free',
    weight: 0.5, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['enemy'], gameplay: ['spawn', 'destructible'],
    sim: { encounter: 'spawner', statePair: 'clutch_hatched' },
  },
  // EGG CLUTCH (hatched): same nest, eggs dulled to empty shells with dark mouths.
  {
    id: 'clutch_hatched', size: 0.9, wonk: 0.04,
    paths: [
      ...cutout(NEST_D, 'murkDeep', 'murk'),
      { d: EGGS_D, fill: 'snowShade', opacity: 0.7 },
      { d: HATCH_HOLES, fill: 'stoneDark' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25,
  },

  // SPIDER NEST: an octagonal orb-web strung round a silk-wrapped egg sac. Web
  // edge-liner for caves/forests/dungeons.
  {
    id: 'spidernest', size: 1.05, wonk: 0.03,
    paths: [
      { d: WEB_SPOKES, stroke: 'cream', sw: 0.02, opacity: 0.45 },
      { d: WEB_ARCS, stroke: 'cream', sw: 0.018, opacity: 0.4 },
      ...cutout(SAC_D, 'murkDeep', 'snowShade'),
      { d: SAC_WRAP, stroke: 'cream', sw: 0.03, opacity: 0.6 },
    ],
    kinds: ['flower', 'bush'], themes: ['cave', 'forest', 'dungeon'], role: 'edge', rotate: 'free',
    weight: 0.5, pass: 'solid', footprint: 0.35, layer: 'ground',
    tags: ['enemy', 'web'], gameplay: ['spawn'],
    anchor: ['corner'], sim: { encounter: 'spawner', statePair: 'nest_cleared' },
  },
  // SPIDER NEST (cleared): the sac gone, only torn silk strands left.
  {
    id: 'nest_cleared', size: 1.05, wonk: 0.03,
    paths: [
      { d: WEB_TORN, stroke: 'cream', sw: 0.02, opacity: 0.35 },
      { d: ring(0.08), fill: 'stoneDark', opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25,
  },

  // WASP HIVE: a hanging paper-comb onion with concentric ridges and a dark mouth
  // hole. Forest/jungle accent; destructible.
  {
    id: 'wasphive', size: 0.95, wonk: 0.035,
    paths: [
      { d: ring(0.2, 0.28, 0.4), fill: 'shadow', opacity: 0.24 },
      ...cutout(HIVE_D, 'woodDeep', 'canvas'),
      { d: HIVE_RIDGES, stroke: 'woodDeep', sw: 0.035, opacity: 0.6 },
      { d: ring(0.09, 0, 0.5), fill: 'ink' },
    ],
    kinds: ['bush'], themes: ['forest', 'jungle'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.35, layer: 'ground',
    tags: ['enemy'], gameplay: ['spawn', 'destructible'],
    sim: { encounter: 'spawner' },
  },

  // BLIGHT: a spreading corruption patch, sickly glowFungus spores welling through
  // a dark ooze (flat halo + light + pulse). Hazard field for haunted/swamp.
  {
    id: 'blight', size: 1, wonk: 0.04,
    paths: [
      { d: glowHalo(0.84), fill: 'glowFungus', opacity: 0.2 },
      ...cutout(BLIGHT_D, 'murkDeep', 'murk'),
      { d: BLIGHT_SPORES, fill: 'glowFungus', opacity: 0.9 },
    ],
    kinds: ['bush', 'flower'], themes: ['haunted', 'swamp'], role: 'field', rotate: 'free',
    weight: 0.5, pass: 'walkable', footprint: 0.3, layer: 'ground',
    tags: ['corrupt', 'glow', 'anim'], gameplay: ['spread', 'hazard'],
    light: { color: 'glowFungus', radius: 2 }, anim: true,
    sim: { statePair: 'blight_cleansed' },
  },
  // BLIGHT (cleansed): same footprint scoured to bleached earth with moss recovery.
  {
    id: 'blight_cleansed', size: 1, wonk: 0.04,
    paths: [
      { d: BLIGHT_D, fill: 'dirtPath', opacity: 0.7 },
      { d: BLIGHT_RECOVER, fill: 'mossBase', opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25,
  },
]
