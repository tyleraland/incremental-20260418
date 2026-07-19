// ── Setpieces: Artisan machines (furnace · forge · anvil · preservesjar · keg ·
//    cheesepress · loom · cauldron · alchemytable · charcoalkiln · beehouse · taptree) ──
//
// Bucket: PLAZA (city workshops — where `marketstall`/`bench`/`weaponrack` live).
// Builder file: complete PropDefs flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads ARTISAN into `plaza`, then runs variants().
// Geometry helpers come from './kit' only.
//
// Each machine reads TOP-DOWN (a furnace = a stone block with a glowing mouth +
// chimney; a loom = a threaded frame; an anvil = a horned iron block on a stump).
// Every one carries tags:['workstation'] PLUS its process verb as a GameplayTag
// (use/smelt/craft/process/brew). Hot machines (furnace/forge/cauldron/kiln) draw
// a flat `glowHalo` under the body (ember, or glowFungus for the witch's brew) +
// declare light:{…} — NO filters/gradients (Palette.test).
//
// STATE PAIRS (§6 / W2.4): furnace_lit / forge_cold / jar_full / keg_full /
// cauldron_bubbling / kiln_lit reuse the base geometry in the other state, carry
// kinds:[] + tags:['interactable'] (exempts them from the scatter gate), and still
// declare pass+footprint. The BASE carries kinds/themes/role/gameplay.
//
// COLLISION: none of the machine ids exist yet (all NEW). `weaponrack` already
// exists (deferred, not authored here).

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, lobeBlob, scatterDots, glowHalo, hashString } from './kit'

// ── geometry constants ───────────────────────────────────────────────────────
// furnace: a squat stone block with a chimney stub + a glowing front mouth
const FURNACE_BODY = rect(-0.5, -0.44, 1.0, 0.9)
const FURNACE_CHIMNEY = ring(0.15, 0, -0.62)
const FURNACE_SEAMS = 'M-0.5 -0.12L0.5 -0.12M-0.5 0.16L0.5 0.16'

// forge: a round stone hearth of glowing coals with a bellows nozzle off the left
const FORGE_RIM = lobeBlob(7, 0.6, 0.52)
const FORGE_BED = ring(0.36)
const FORGE_COALS = scatterDots(hashString('forgecoal'), 7, 0.5, 0.05, 0.1)
const FORGE_BELLOWS = 'M-0.58 -0.1L-0.94 -0.2L-0.96 0.16L-0.58 0.12Z'

// anvil: horned iron block on a round wood stump base
const ANVIL_STUMP = ring(0.46, 0, 0.06)
const ANVIL_BODY = 'M-0.78 0L-0.42 -0.13L0.32 -0.24L0.58 -0.13L0.58 0.13L0.32 0.24L-0.42 0.13Z'
const ANVIL_WAIST = 'M-0.4 -0.13L-0.4 0.13'

// preserves jar / keg: round ceramic + wood bodies, cloth-tied lid vs bung+spigot
const JAR_BODY = ring(0.42)
const KEG_BODY = ring(0.44)
const KEG_SPIGOT = 'M-0.06 0.42L0.06 0.42L0.05 0.66L-0.05 0.66Z'

// cheese press: round platen, a yellow cheese wheel, a screw arm across the top
const PRESS_BASE = ring(0.5)
const CHEESE = ring(0.32)
const PRESS_ARM = rect(-0.56, -0.09, 1.12, 0.18)

// loom: two side posts + top/bottom beams strung with warp, half-woven cloth
const LOOM_POSTS = 'M-0.5 -0.62L-0.34 -0.62L-0.34 0.62L-0.5 0.62Z M0.34 -0.62L0.5 -0.62L0.5 0.62L0.34 0.62Z'
const LOOM_BEAM_TOP = rect(-0.5, -0.62, 1.0, 0.16)
const LOOM_BEAM_BOT = rect(-0.5, 0.46, 1.0, 0.16)
const LOOM_WARP = 'M-0.22 -0.46L-0.22 0.46M-0.08 -0.46L-0.08 0.46M0.08 -0.46L0.08 0.46M0.22 -0.46L0.22 0.46'
const LOOM_CLOTH = rect(-0.28, 0.14, 0.56, 0.34)

// cauldron: round iron pot on three legs, dark brew surface, teal bubbles
const CAULD_BODY = ring(0.46)
const CAULD_LEGS = 'M-0.34 0.42L-0.44 0.62M0.34 0.42L0.44 0.62M0 0.46L0 0.66'
const CAULD_BREW = ring(0.32)

// alchemy table: rectangular bench, etched arcane circle, three coloured flasks
const ATABLE_TOP = rect(-0.56, -0.4, 1.12, 0.8)
const ATABLE_CIRCLE = ring(0.26)
const ATABLE_FLASKS = ring(0.09, -0.32, -0.14) + ring(0.08, 0.3, -0.16) + ring(0.075, 0.34, 0.14)
const ATABLE_GLINTS = ring(0.03, -0.34, -0.16) + ring(0.03, 0.28, -0.18) + ring(0.03, 0.32, 0.12)

// charcoal kiln: earthen/stone dome with peeking log-ends + a smoking crown vent
const KILN_MOUND = lobeBlob(7, 0.55, 0.47)
const KILN_LOGS = scatterDots(hashString('kilnlog'), 6, 1.02, 0.045, 0.075)

// beehouse: a stacked wooden box hive with a landing slot + bees on the wing
const HIVE_BOX = rect(-0.42, -0.44, 0.84, 0.88)
const HIVE_SEAMS = 'M-0.42 -0.14L0.42 -0.14M-0.42 0.14L0.42 0.14'
const HIVE_ROOF = rect(-0.46, -0.5, 0.92, 0.12)
const HIVE_ENTRANCE = rect(-0.2, 0.34, 0.4, 0.1)
const HIVE_BEES = scatterDots(hashString('beehousebee'), 4, 1.5, 0.025, 0.045)

// tap tree: a maple crown with a trunk core, a tap spout + a hanging sap bucket
const TAP_CROWN = lobeBlob(8, 0.62, 0.5)
const TAP_MAPLE = scatterDots(hashString('taptreeleaf'), 6, 0.9, 0.05, 0.09)
const TAP_BUCKET = ring(0.13, 0.5, 0.36)

export const ARTISAN: PropDef[] = [
  // ── FURNACE (base: banked & glowing) ──
  { id: 'furnace', size: 1.05, wonk: 0.03, paths: [
      { d: glowHalo(0.42, 0, 0.16), fill: 'ember', opacity: 0.3 },
      ...cutout(FURNACE_BODY, 'rockDeep', 'rock'),
      ...cutout(FURNACE_CHIMNEY, 'rockDeep', 'rock'),
      { d: FURNACE_SEAMS, stroke: 'mortarInk', sw: 0.04, opacity: 0.6 },
      { d: ring(0.2, 0, 0.16), fill: 'emberDeep' },
      { d: ring(0.11, 0, 0.16), fill: 'ember' },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'mountain'], role: 'field', rotate: 'upright',
    weight: 0.35, pass: 'solid', footprint: 0.42, layer: 'ground', maxPerChunk: 2,
    tags: ['workstation', 'light', 'glow'], gameplay: ['use', 'smelt'],
    light: { color: 'ember', radius: 1.6 } },
  // furnace_lit — same block, fully fired: brighter mouth + white-hot core
  { id: 'furnace_lit', size: 1.05, wonk: 0.03, paths: [
      { d: glowHalo(0.54, 0, 0.16), fill: 'ember', opacity: 0.42 },
      ...cutout(FURNACE_BODY, 'rockDeep', 'rock'),
      ...cutout(FURNACE_CHIMNEY, 'rockDeep', 'rock'),
      { d: FURNACE_SEAMS, stroke: 'mortarInk', sw: 0.04, opacity: 0.6 },
      { d: ring(0.24, 0, 0.16), fill: 'emberDeep' },
      { d: ring(0.15, 0, 0.16), fill: 'ember' },
      { d: ring(0.07, 0, 0.13), fill: 'lampGlow' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.42 },

  // ── FORGE (base: working, glowing coals) ──
  { id: 'forge', size: 1, wonk: 0.035, paths: [
      { d: glowHalo(0.56), fill: 'ember', opacity: 0.38 },
      { d: FORGE_BELLOWS, fill: 'woodDeep' },
      ...cutout(FORGE_RIM, 'rockDeep', 'rock'),
      { d: FORGE_BED, fill: 'emberDeep' },
      { d: FORGE_COALS, fill: 'ember' },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'mountain', 'volcanic'], role: 'accent', rotate: 'upright',
    weight: 0.22, pass: 'solid', footprint: 0.4, layer: 'ground', maxPerChunk: 2,
    tags: ['workstation', 'light', 'glow'], gameplay: ['use', 'craft'],
    light: { color: 'ember', radius: 1.8 } },
  // forge_cold — banked hearth: dead coals, no glow, a pale ash fleck
  { id: 'forge_cold', size: 1, wonk: 0.035, paths: [
      { d: FORGE_BELLOWS, fill: 'woodDeep' },
      ...cutout(FORGE_RIM, 'rockDeep', 'rock'),
      { d: FORGE_BED, fill: 'stoneDark' },
      { d: FORGE_COALS, fill: 'rockDeep', opacity: 0.7 },
      { d: ring(0.08, 0.05, -0.05), fill: 'cream', opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.4 },

  // ── ANVIL (no state) ──
  { id: 'anvil', size: 1, wonk: 0.03, paths: [
      ...cutout(ANVIL_STUMP, 'woodDeep', 'wood'),
      ...cutout(ANVIL_BODY, 'rockDeep', 'steel'),
      { d: ANVIL_WAIST, stroke: 'ink', sw: 0.05, opacity: 0.5 },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'dungeon'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'solid', footprint: 0.32, layer: 'ground',
    tags: ['workstation'], gameplay: ['use', 'craft'] },

  // ── PRESERVES JAR (base: sealed, faint content peek) ──
  { id: 'preservesjar', size: 0.85, wonk: 0.03, paths: [
      ...cutout(JAR_BODY, 'woodDeep', 'woodLight'),
      { d: ring(0.3), fill: 'canvas' },
      { d: ring(0.3), stroke: 'ink', sw: 0.045, opacity: 0.5 },
      { d: ring(0.1), fill: 'fruitRedDeep', opacity: 0.5 },
    ],
    kinds: ['stump', 'rock'], themes: ['city', 'farm'], role: 'field', rotate: 'free',
    weight: 0.5, pass: 'solid', footprint: 0.28, layer: 'ground',
    tags: ['workstation'], gameplay: ['use', 'process'] },
  // jar_full — same jar brimming with red preserves
  { id: 'jar_full', size: 0.85, wonk: 0.03, paths: [
      ...cutout(JAR_BODY, 'woodDeep', 'woodLight'),
      { d: ring(0.32), fill: 'fruitRedDeep' },
      { d: ring(0.22), fill: 'fruitRed' },
      { d: ring(0.07, -0.08, -0.08), fill: 'cream', opacity: 0.6 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.28 },

  // ── KEG (base: sealed, bung + spigot) ──
  { id: 'keg', size: 0.9, wonk: 0.03, paths: [
      ...cutout(KEG_BODY, 'woodDeep', 'wood'),
      { d: ring(0.44), stroke: 'ink', sw: 0.05, opacity: 0.5 },
      { d: ring(0.26), stroke: 'ink', sw: 0.045, opacity: 0.45 },
      { d: ring(0.1), fill: 'woodDeep' },
      { d: KEG_SPIGOT, fill: 'woodLight' },
    ],
    kinds: ['stump'], themes: ['city', 'farm'], role: 'field', rotate: 'free',
    weight: 0.5, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['workstation'], gameplay: ['use', 'process'] },
  // keg_full — same keg brimming with amber ale + froth
  { id: 'keg_full', size: 0.9, wonk: 0.03, paths: [
      ...cutout(KEG_BODY, 'woodDeep', 'wood'),
      { d: ring(0.3), fill: 'petalGoldDeep' },
      { d: ring(0.22), fill: 'petalGold' },
      { d: scatterDots(hashString('kegfroth'), 5, 0.4, 0.03, 0.055), fill: 'cream', opacity: 0.7 },
      { d: KEG_SPIGOT, fill: 'woodLight' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3 },

  // ── CHEESE PRESS (no state) ──
  { id: 'cheesepress', size: 1, wonk: 0.03, paths: [
      ...cutout(PRESS_BASE, 'woodDeep', 'wood'),
      { d: CHEESE, fill: 'petalGold' },
      { d: CHEESE, stroke: 'woodDeep', sw: 0.05, opacity: 0.6 },
      ...cutout(PRESS_ARM, 'woodDeep', 'woodLight'),
      { d: ring(0.11, 0.56, 0), fill: 'woodLight' },
    ],
    kinds: ['stump', 'rock'], themes: ['city', 'farm'], role: 'field', rotate: 'free',
    weight: 0.4, pass: 'solid', footprint: 0.35, layer: 'ground',
    tags: ['workstation'], gameplay: ['use', 'process'] },

  // ── LOOM (no state) ──
  { id: 'loom', size: 1.05, wonk: 0.03, paths: [
      { d: LOOM_POSTS, fill: 'woodDeep' },
      ...cutout(LOOM_BEAM_TOP, 'woodDeep', 'wood'),
      ...cutout(LOOM_BEAM_BOT, 'woodDeep', 'wood'),
      { d: LOOM_WARP, stroke: 'canvas', sw: 0.03, opacity: 0.8 },
      { d: LOOM_CLOTH, fill: 'canvas' },
    ],
    kinds: ['stump'], themes: ['city', 'farm', 'plains'], role: 'field', rotate: 'upright',
    weight: 0.35, pass: 'solid', footprint: 0.4, layer: 'ground',
    tags: ['workstation'], gameplay: ['use', 'process'] },

  // ── CAULDRON (base: simmering, faint teal glow, anim) ──
  { id: 'cauldron', size: 0.95, wonk: 0.035, paths: [
      { d: glowHalo(0.4), fill: 'glowFungus', opacity: 0.28 },
      { d: CAULD_LEGS, stroke: 'ink', sw: 0.06 },
      ...cutout(CAULD_BODY, 'rockDeep', 'rock'),
      { d: CAULD_BREW, fill: 'murkDeep' },
      { d: scatterDots(hashString('cauldbub'), 5, 0.42, 0.04, 0.075), fill: 'glowFungus', opacity: 0.7 },
    ],
    kinds: ['rock', 'stump'], themes: ['swamp', 'haunted', 'city'], role: 'field', rotate: 'free',
    weight: 0.4, pass: 'solid', footprint: 0.38, layer: 'ground', maxPerChunk: 2,
    tags: ['workstation', 'light', 'glow', 'anim'], gameplay: ['use', 'brew'],
    light: { color: 'glowFungus', radius: 1.5 }, anim: true },
  // cauldron_bubbling — same pot boiling over: bright brew + frothing bubbles
  { id: 'cauldron_bubbling', size: 0.95, wonk: 0.035, paths: [
      { d: glowHalo(0.5), fill: 'glowFungus', opacity: 0.42 },
      { d: CAULD_LEGS, stroke: 'ink', sw: 0.06 },
      ...cutout(CAULD_BODY, 'rockDeep', 'rock'),
      { d: CAULD_BREW, fill: 'glowFungus', opacity: 0.85 },
      { d: scatterDots(hashString('cauldboil'), 7, 0.42, 0.05, 0.09), fill: 'cream', opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.38 },

  // ── ALCHEMY TABLE (no state) ──
  { id: 'alchemytable', size: 1.1, wonk: 0.03, paths: [
      { d: ring(0.56, 0.06, 0.12), fill: 'shadow', opacity: 0.2 },
      ...cutout(ATABLE_TOP, 'woodDeep', 'wood'),
      { d: ATABLE_CIRCLE, stroke: 'arcaneGlow', sw: 0.04, opacity: 0.55 },
      { d: ring(0.09, -0.32, -0.14), fill: 'berryPurple' },
      { d: ring(0.08, 0.3, -0.16), fill: 'glowFungus' },
      { d: ring(0.075, 0.34, 0.14), fill: 'gourdOrange' },
      { d: ATABLE_GLINTS, fill: 'cream', opacity: 0.7 },
    ],
    kinds: ['stump', 'rock'], themes: ['arcane', 'city'], role: 'accent', rotate: 'upright',
    weight: 0.22, pass: 'solid', footprint: 0.4, layer: 'ground', maxPerChunk: 2,
    tags: ['workstation'], gameplay: ['use', 'craft'] },

  // ── CHARCOAL KILN (base: smoldering, faint vent glow) ──
  { id: 'charcoalkiln', size: 1.05, wonk: 0.04, paths: [
      { d: glowHalo(0.34), fill: 'ember', opacity: 0.24 },
      { d: KILN_LOGS, fill: 'woodLight', opacity: 0.85 },
      ...cutout(KILN_MOUND, 'rockDeep', 'rock'),
      { d: ring(0.15), fill: 'emberDeep' },
      { d: ring(0.08), fill: 'ember' },
    ],
    kinds: ['rock', 'stump'], themes: ['forest', 'city'], role: 'field', rotate: 'free',
    weight: 0.4, pass: 'solid', footprint: 0.42, layer: 'ground', maxPerChunk: 2,
    tags: ['workstation', 'light', 'glow'], gameplay: ['use', 'process'],
    light: { color: 'ember', radius: 1.4 } },
  // kiln_lit — same dome burning down: bright vent + white-hot heart
  { id: 'kiln_lit', size: 1.05, wonk: 0.04, paths: [
      { d: glowHalo(0.46), fill: 'ember', opacity: 0.4 },
      { d: KILN_LOGS, fill: 'woodLight', opacity: 0.85 },
      ...cutout(KILN_MOUND, 'rockDeep', 'rock'),
      { d: ring(0.18), fill: 'emberDeep' },
      { d: ring(0.1), fill: 'ember' },
      { d: ring(0.05), fill: 'lampGlow' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.42 },

  // ── BEEHOUSE (harvestable, no state) ──
  { id: 'beehouse', size: 0.9, wonk: 0.03, paths: [
      { d: ring(0.5, 0.06, 0.1), fill: 'shadow', opacity: 0.2 },
      ...cutout(HIVE_BOX, 'woodDeep', 'wood'),
      { d: HIVE_SEAMS, stroke: 'ink', sw: 0.04, opacity: 0.55 },
      ...cutout(HIVE_ROOF, 'woodDeep', 'woodLight'),
      { d: HIVE_ENTRANCE, fill: 'ink' },
      { d: HIVE_BEES, fill: 'petalGold' },
    ],
    kinds: ['stump'], themes: ['farm', 'forest', 'plains'], role: 'field', rotate: 'upright',
    weight: 0.45, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['workstation'], gameplay: ['harvestable', 'forage'] },

  // ── TAP TREE (maple tapper — harvestable, no state) ──
  { id: 'taptree', size: 1.15, wonk: 0.05, paths: [
      { d: ring(0.6, 0.06, 0.12), fill: 'shadow', opacity: 0.24 },
      ...cutout(TAP_CROWN, 'foliageDeep', 'foliage'),
      { d: TAP_MAPLE, fill: 'gourdOrange', opacity: 0.85 },
      { d: ring(0.1), fill: 'woodDeep' },
      { d: 'M0.36 0.28L0.5 0.34', stroke: 'woodLight', sw: 0.05 },
      ...cutout(TAP_BUCKET, 'woodDeep', 'canvas'),
      { d: ring(0.07, 0.5, 0.36), fill: 'petalGold', opacity: 0.8 },
    ],
    kinds: ['tree'], themes: ['forest', 'farm'], role: 'accent', rotate: 'upright',
    weight: 0.22, pass: 'solid', footprint: 0.5, layer: 'ground', tall: true, maxPerChunk: 2,
    tags: ['workstation'], gameplay: ['harvestable'] },
]
