// ── Setpieces: Traps & hazards (pressure plate · pit · fire jet · gas vent · ──
//    bear trap · rolling boulder · dart wall · cave-in · tar pit · lava pool) ──
//
// Bucket: STONE (dungeon/mountain — where `spiketrap`/`cage` already live).
// Entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits;
// props.ts spreads this array into the `stone` bucket, then variants().
//
// Geometry from './kit' only (type-only PropDef import). Gameplay verbs →
// GameplayTag: trigger/fall/damage/barrier/hazard/snare (all in the union).
// `trap`/`hidden`/`anim`/`glow`/`flat`/`wall-edge`/`on-lava` are freeform tags.
// Hidden armed traps read as subtle floor tiles; their state pair is the sprung
// form (same geometry, minus the disguise / jaws shut) — kinds:[] + interactable.
//
// COLLISION: `spiketrap` already exists (stone; dungeon) — NOT redefined here.

import type { PropDef } from '@/render/props'
import {
  cutout, ring, rect, radialStar, glowHalo, blobPath, roughCircle, hashString,
} from './kit'

// ── seeded silhouettes ───────────────────────────────────────────────────────
const PLATE_SOCKET = rect(-0.58, -0.58, 1.16, 1.16)
const PLATE_INNER  = rect(-0.4, -0.4, 0.8, 0.8)

const PIT_COVER  = ring(0.48)
const PIT_CRACKS = 'M-0.34 -0.1L0.06 0.06L0.3 -0.02M-0.08 -0.36L0.02 0.02L-0.18 0.34'

const NOZZLE     = ring(0.26)
const JET_FLAME_OUT = radialStar(7, 0.36, 0.13)
const JET_FLAME_IN  = radialStar(7, 0.22, 0.08)

const VENT_STONE = ring(0.32)
const GAS_LOW  = blobPath(roughCircle(0, -0.12, 0.4, 5, hashString('gasvent-lo')))
const GAS_HI   = blobPath(roughCircle(0.05, -0.3, 0.22, 4, hashString('gasvent-hi')))

const TRAP_TEETH  = radialStar(12, 0.46, 0.32)
const TRAP_CLENCH = radialStar(12, 0.4, 0.13)

const BOULDER = blobPath(roughCircle(0, 0, 0.62, 9, hashString('boulderroll')))
const BOULDER_CRACKS = 'M-0.28 -0.34L-0.02 -0.02L0.3 0.14M0.04 -0.4L-0.1 0.1L0.06 0.4'

const DART_PLATE = rect(-0.56, -0.32, 1.12, 0.64)
const DART_HOLES = ring(0.08, -0.3, 0) + ring(0.08, 0, 0) + ring(0.08, 0.3, 0)
const DART_TIPS  = 'M-0.3 0L-0.12 0M0 0L0.18 0M0.3 0L0.48 0'

const HEAP = blobPath(roughCircle(0, 0.06, 0.68, 8, hashString('cavein')))
const HEAP_FACETS = 'M-0.4 0.05L-0.12 -0.28M0.1 -0.32L0.34 -0.02M-0.05 0.1L0.2 0.4M-0.36 0.3L-0.14 0.02'

const TAR_POOL  = blobPath(roughCircle(0, 0, 0.6, 8, hashString('tarpit')))
const TAR_STAIN = blobPath(roughCircle(0.02, 0.03, 0.72, 7, hashString('tarpit-stain')))
const TAR_BUBBLES = ring(0.08, -0.18, 0.14) + ring(0.05, 0.22, -0.1) + ring(0.06, 0.06, 0.28)

const LAVA_POOL   = blobPath(roughCircle(0, 0, 0.62, 8, hashString('lavapool')))
const LAVA_MOLTEN = blobPath(roughCircle(0.02, 0.02, 0.44, 7, hashString('lavapool-mid')))
const LAVA_CORE   = blobPath(roughCircle(-0.02, -0.02, 0.24, 6, hashString('lavapool-core')))
const LAVA_CRACKS = 'M-0.5 -0.14L-0.2 -0.04M0.5 0.1L0.22 0.02M0.02 0.52L-0.04 0.24M-0.1 -0.5L0 -0.22'

export const TRAPS: PropDef[] = [
  // PRESSURE PLATE (armed): a floor-set square plate sitting proud in its stone
  // socket, a hairline seam betraying that it moves. Hidden trigger.
  {
    id: 'pressureplate', size: 0.9, wonk: 0.025,
    paths: [
      ...cutout(PLATE_SOCKET, 'rockDeep', 'rock'),
      ...cutout(PLATE_INNER, 'stoneDark', 'stoneBase'),
      { d: PLATE_INNER, stroke: 'ink', sw: 0.03, opacity: 0.45 },
    ],
    kinds: ['rock', 'stump'], themes: ['dungeon', 'ruins'], role: 'field',
    rotate: 'free', weight: 0.35, pass: 'walkable', footprint: 0.3,
    tags: ['trap', 'hidden'], gameplay: ['trigger'],
  },
  // PRESSURE PLATE (sprung): same socket, the inner plate pressed flush and dark,
  // seam gapped open. State pair with `pressureplate`.
  {
    id: 'plate_sprung', size: 0.9, wonk: 0.025,
    paths: [
      ...cutout(PLATE_SOCKET, 'rockDeep', 'rock'),
      { d: PLATE_INNER, fill: 'stoneDark' },
      { d: PLATE_INNER, stroke: 'ink', sw: 0.05, opacity: 0.6 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3,
  },

  // PIT TRAP (armed): a round debris-and-dirt lid disguising a dark shaft, betrayed
  // only by hairline cracks radiating from the seam. Hidden trigger + fall.
  {
    id: 'pittrap', size: 1, wonk: 0.035,
    paths: [
      { d: ring(0.54), fill: 'rockDeep' },
      ...cutout(PIT_COVER, 'dirtPath', 'sand'),
      { d: PIT_CRACKS, stroke: 'ink', sw: 0.03, opacity: 0.5 },
    ],
    kinds: ['rock'], themes: ['dungeon', 'ruins', 'forest'], role: 'field',
    rotate: 'free', weight: 0.3, pass: 'walkable', footprint: 0.4,
    tags: ['trap', 'hidden'], gameplay: ['trigger', 'fall'],
  },
  // PIT (open): the lid gone — a yawning shaft, stone rim over a darkening throat.
  // State pair with `pittrap`.
  {
    id: 'pit_open', size: 1, wonk: 0.035,
    paths: [
      ...cutout(ring(0.56), 'rockDeep', 'rock'),
      { d: ring(0.42), fill: 'stoneDark' },
      { d: ring(0.28), fill: 'ink' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.35,
  },

  // FIRE JET (active): a metal floor nozzle erupting a flame plume, ember glow
  // pooled beneath. Damage hazard; animated + emissive.
  {
    id: 'firejet', size: 0.9, wonk: 0.03,
    paths: [
      { d: glowHalo(0.6), fill: 'ember', opacity: 0.3 },
      ...cutout(NOZZLE, 'rockDeep', 'steel'),
      { d: JET_FLAME_OUT, fill: 'emberDeep' },
      { d: JET_FLAME_IN, fill: 'ember' },
    ],
    kinds: ['rock'], themes: ['dungeon', 'volcanic'], role: 'field',
    rotate: 'free', weight: 0.3, pass: 'solid', footprint: 0.2,
    tags: ['trap', 'anim', 'light', 'glow'], gameplay: ['damage'],
    light: { color: 'ember', radius: 1.5 }, anim: true,
  },
  // FIRE JET (dormant): the same nozzle, flame out, a cold dark bore. State pair
  // with `firejet`.
  {
    id: 'jet_off', size: 0.9, wonk: 0.03,
    paths: [
      ...cutout(NOZZLE, 'rockDeep', 'steel'),
      { d: ring(0.12), fill: 'ink' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.2,
  },

  // GAS VENT: a fissured stone vent breathing a toxic murk-green cloud. Damage
  // hazard; animated (no state pair — it vents continuously).
  {
    id: 'gasvent', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(VENT_STONE, 'rockDeep', 'rock'),
      { d: ring(0.15), fill: 'murkDeep' },
      { d: GAS_LOW, fill: 'murk', opacity: 0.42 },
      { d: GAS_HI, fill: 'mossBase', opacity: 0.4 },
    ],
    kinds: ['flower', 'rock'], themes: ['dungeon', 'swamp', 'ruins'], role: 'field',
    rotate: 'free', weight: 0.4, pass: 'walkable', footprint: 0.25,
    tags: ['trap', 'anim'], gameplay: ['damage'], anim: true,
  },

  // BEAR TRAP (armed): open steel jaws splayed flat, teeth ringing a dark maw
  // around the trigger pan, set in a scuff of dirt. Trigger + damage.
  {
    id: 'beartrap', size: 0.9, wonk: 0.03,
    paths: [
      { d: ring(0.5), fill: 'ink', opacity: 0.32 },
      { d: TRAP_TEETH, fill: 'steel' },
      { d: ring(0.3), fill: 'ink' },
      ...cutout(ring(0.16), 'rockDeep', 'steel'),
    ],
    kinds: ['rock', 'stump'], themes: ['forest', 'plains'], role: 'field',
    rotate: 'free', weight: 0.3, pass: 'walkable', footprint: 0.3,
    tags: ['trap'], gameplay: ['trigger', 'damage'],
  },
  // BEAR TRAP (sprung): jaws snapped shut, teeth interlocked over a seam. State
  // pair with `beartrap`.
  {
    id: 'beartrap_sprung', size: 0.9, wonk: 0.03,
    paths: [
      { d: ring(0.5), fill: 'ink', opacity: 0.32 },
      { d: TRAP_CLENCH, fill: 'steel' },
      { d: ring(0.1), fill: 'rockDeep' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3,
  },

  // ROLLING BOULDER: a big cracked stone sphere poised to roll a corridor, its
  // flat drop shadow offset down-right. Trigger + damage; animated. Accent.
  {
    id: 'boulderroll', size: 1.1, wonk: 0.05,
    paths: [
      { d: ring(0.6, 0.12, 0.14), fill: 'shadow', opacity: 0.22 },
      ...cutout(BOULDER, 'rockDeep', 'rock'),
      { d: BOULDER_CRACKS, stroke: 'stoneDark', sw: 0.045, opacity: 0.55 },
    ],
    kinds: ['rock'], themes: ['dungeon', 'mountain'], role: 'accent',
    rotate: 'free', weight: 0.2, pass: 'solid', footprint: 0.5,
    tags: ['trap', 'anim'], gameplay: ['trigger', 'damage'], anim: true,
  },

  // DART WALL: a wall-mounted stone plaque pierced by a row of bore holes, steel
  // dart tips glinting. Damage; wall-edge decal. Edge role.
  {
    id: 'darttrap', size: 0.95, wonk: 0.03,
    paths: [
      ...cutout(DART_PLATE, 'rockDeep', 'stoneBase'),
      { d: DART_HOLES, fill: 'ink' },
      { d: DART_TIPS, stroke: 'steel', sw: 0.035, opacity: 0.75 },
    ],
    kinds: ['rock'], themes: ['dungeon', 'ruins'], role: 'edge',
    rotate: 'flat', weight: 0.5, pass: 'walkable', footprint: 0.2,
    layer: 'wall', tags: ['trap', 'wall-edge'], gameplay: ['damage'],
  },

  // CAVE-IN: a heap of collapsed rubble blocking the passage, faceted into a few
  // big fallen boulders. Barrier; destructible. Accent.
  {
    id: 'cavein', size: 1.15, wonk: 0.05,
    paths: [
      { d: ring(0.6, 0.12, 0.18), fill: 'shadow', opacity: 0.22 },
      ...cutout(HEAP, 'rockDeep', 'rock'),
      { d: HEAP_FACETS, stroke: 'stoneDark', sw: 0.05, opacity: 0.6 },
    ],
    kinds: ['rock'], themes: ['dungeon', 'mountain', 'cave'], role: 'accent',
    rotate: 'free', weight: 0.2, pass: 'solid', footprint: 0.55,
    gameplay: ['barrier', 'destructible'],
  },

  // TAR PIT: a glossy black pool sunk in a stained apron, dull bubbles welling.
  // Hazard + snare; flat ground decal.
  {
    id: 'tarpit', size: 1.1, wonk: 0.04,
    paths: [
      { d: TAR_STAIN, fill: 'bloodDry', opacity: 0.4 },
      ...cutout(TAR_POOL, 'stoneDark', 'ink'),
      { d: TAR_BUBBLES, fill: 'stoneBase', opacity: 0.35 },
    ],
    kinds: ['flower', 'rock'], themes: ['swamp', 'desert'], role: 'field',
    rotate: 'flat', weight: 0.4, pass: 'walkable', footprint: 0.4,
    layer: 'ground', tags: ['hazard', 'flat'], gameplay: ['hazard', 'snare'],
  },

  // LAVA POOL: a cooled-crust rim over molten ember with a bright core and glowing
  // fissures, ember glow pooled beneath. Hazard; emissive + animated.
  {
    id: 'lavapool', size: 1.1, wonk: 0.04,
    paths: [
      { d: glowHalo(0.7), fill: 'ember', opacity: 0.3 },
      { d: LAVA_POOL, fill: 'stoneDark' },
      { d: LAVA_MOLTEN, fill: 'emberDeep' },
      { d: LAVA_CORE, fill: 'ember' },
      { d: LAVA_CRACKS, stroke: 'ember', sw: 0.03, opacity: 0.7 },
    ],
    kinds: ['rock'], themes: ['volcanic', 'dungeon', 'cave'], role: 'field',
    rotate: 'free', weight: 0.4, pass: 'walkable', footprint: 0.45,
    tags: ['light', 'anim', 'on-lava', 'glow'], gameplay: ['hazard'],
    light: { color: 'ember', radius: 2 }, anim: true,
  },
]
