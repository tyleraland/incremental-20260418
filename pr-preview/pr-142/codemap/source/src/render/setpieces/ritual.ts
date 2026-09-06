// ── Setpieces: Arcane ritual (summon circle · rune glyph · standing stones · mana font · teleport pad · cursed idol · offering bowl) ──
//
// Bucket: STONE (arcane/dungeon/haunted/ruins — where `altar`/`runestone`/
// `magiccircle`/`brazier` live). Builder file: COMPLETE PropDefs flow into
// TERRAIN_PROPS + listAssets with NO shared-file edits; props.ts spreads this
// array into `stone` and runs variants().
//
// GLOW WITHOUT FILTERS: flat `glowHalo(r)` filled `arcaneGlow` (ritual/portal) or
// `lampGlow` (votive) at low opacity, drawn FIRST (under the object); set
// light:{ color, radius } (+ anim:true for pulsing wards). Gameplay verbs map to
// GameplayTags: trigger/ritual/drink/restore/warp/offer/curse. `menhir`/`ominous`/
// `glow`/`light`/`flat` are freeform tags[]. Full guide: scratchpad/flora-digest.md.
//
// COLLISIONS (defer-to-existing, do NOT author): altar, runestone, magiccircle,
// portalframe, brazier, shrine already exist — this file owns only the NEW ids.

import type { PropDef } from '@/render/props'
import { cutout, ring, radialStar, polyPath, scatterDots, glowHalo, hashString } from './kit'

const TAU = Math.PI * 2
const q = (v: number) => Math.round(v * 1000) / 1000

// n evenly-spaced dots on a circle of radius r (rune nodes, votive marks).
function dotsOn(n: number, r: number, dotR: number, rot = -Math.PI / 2): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU
    d += ring(dotR, Math.cos(a) * r, Math.sin(a) * r)
  }
  return d
}

// n radial tick marks from r0 out to r1 (inscribed rune ticks around a ring).
function ticksOn(n: number, r0: number, r1: number, rot = -Math.PI / 2): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU
    const c = Math.cos(a), s = Math.sin(a)
    d += `M${q(c * r0)} ${q(s * r0)}L${q(c * r1)} ${q(s * r1)}`
  }
  return d
}

// A tapered cut-stone standing slab (menhir), top slightly narrower than base.
function menhir(cx: number, cy: number, w: number, h: number): string {
  return polyPath([
    { x: cx - w, y: cy + h },
    { x: cx - w * 0.72, y: cy - h },
    { x: cx + w * 0.72, y: cy - h },
    { x: cx + w, y: cy + h },
  ])
}

// ── summon circle: double inscribed ring + pentacle star + node dots, glowing ──
const SUMMON_RINGS = ring(0.8) + ring(0.64)
const SUMMON_STAR = radialStar(5, 0.6, 0.26, -Math.PI / 2)
const SUMMON_NODES = dotsOn(5, 0.72, 0.055)
const SUMMON_TICKS = ticksOn(10, 0.82, 0.92)
const SUMMON_CHAR = scatterDots(hashString('summoncircle-spent'), 6, 1.0, 0.06, 0.12)

// ── rune glyph: single carved sigil on the floor ──
const GLYPH_RING = ring(0.44)
const GLYPH_MARK = 'M-0.16 -0.26L0.16 -0.08L-0.12 0.06L0.2 0.28M-0.02 -0.16L0.08 -0.02'

// ── standing stones: three tapered menhirs of a small ring ──
const STONES_D = menhir(-0.44, 0.06, 0.2, 0.48) + menhir(0.4, -0.06, 0.18, 0.58) + menhir(0.02, 0.28, 0.15, 0.36)
const STONES_SHADOW = ring(0.2, -0.44, 0.56) + ring(0.17, 0.4, 0.54) + ring(0.14, 0.02, 0.66)

// ── mana font: round stone basin welling glowing mana ──
const FONT_DISC = ring(0.5)
const FONT_RECESS = ring(0.34)
const FONT_CRACKS = 'M-0.12 -0.28L0.02 -0.02L-0.06 0.24M0.18 -0.18L0.06 0.04'

// ── teleport pad: inscribed stone disc, glowing core, up-warp chevrons ──
const PAD_DISC = ring(0.68)
const PAD_RING = ring(0.5)
const PAD_RUNES = ticksOn(12, 0.5, 0.62)
const PAD_CORE = ring(0.16)
const PAD_CHEVRONS = 'M-0.16 0.12L0 -0.06L0.16 0.12M-0.16 -0.02L0 -0.2L0.16 -0.02'

// ── cursed idol: carved totem post with an ominous face (top-down stylised) ──
const IDOL_D = 'M-0.3 0.62L-0.34 -0.2Q-0.34 -0.62 0 -0.62Q0.34 -0.62 0.34 -0.2L0.3 0.62Z'
const IDOL_EYES = ring(0.075, -0.14, -0.2) + ring(0.075, 0.14, -0.2)
const IDOL_MOUTH = 'M-0.17 0.12L-0.09 0.22L0 0.12L0.09 0.22L0.17 0.12'
const IDOL_BROKEN_D = 'M-0.3 0.62L-0.32 0.02L-0.06 -0.18L0.14 0.08L0.32 0.0L0.3 0.62Z'
const IDOL_CRACK = 'M-0.02 0.58L0.04 0.28L-0.04 0.06'

// ── offering bowl: stone bowl of flower offerings; lit companion flames ──
const BOWL_DISC = ring(0.48)
const BOWL_RECESS = ring(0.32)
const BOWL_PETALS = scatterDots(hashString('offeringbowl-petals'), 5, 0.42, 0.05, 0.08)

export const RITUAL: PropDef[] = [
  // SUMMON CIRCLE: double inked ring, glowing pentacle + node dots, arcane halo
  // pulsing beneath. A ritual trigger decal (flat, on the ground).
  {
    id: 'summoncircle', size: 1.2, wonk: 0.02,
    paths: [
      { d: glowHalo(0.86), fill: 'arcaneGlow', opacity: 0.3 },
      { d: SUMMON_RINGS, stroke: 'ink', sw: 0.04 },
      { d: SUMMON_TICKS, stroke: 'arcaneGlow', sw: 0.04, opacity: 0.85 },
      { d: SUMMON_STAR, stroke: 'arcaneGlow', sw: 0.05 },
      { d: SUMMON_NODES, fill: 'arcaneGlow' },
    ],
    kinds: ['flower', 'rock'], themes: ['arcane', 'dungeon', 'haunted'], role: 'accent',
    rotate: 'flat', weight: 0.2, pass: 'walkable', footprint: 0.42, maxPerChunk: 2,
    tags: ['glow', 'anim', 'flat'], gameplay: ['trigger', 'ritual'],
    light: { color: 'arcaneGlow', radius: 2 }, anim: true,
    sim: { mystery: true, statePair: 'circle_spent' },
  },
  // circle_spent (state): the ring burnt out — faded inscription, ashen star,
  // scorch scatter in the middle, no glow.
  {
    id: 'circle_spent', size: 1.2, wonk: 0.02,
    paths: [
      { d: SUMMON_RINGS, stroke: 'ink', sw: 0.04, opacity: 0.45 },
      { d: SUMMON_STAR, stroke: 'rockDeep', sw: 0.05, opacity: 0.6 },
      { d: SUMMON_CHAR, fill: 'bloodDry', opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.42,
  },

  // RUNE GLYPH: a single carved sigil ringed on the floor, glowing arcane — a
  // walk-over trigger. Field filler decal.
  {
    id: 'runeglyph', size: 0.85, wonk: 0.025,
    paths: [
      { d: glowHalo(0.5), fill: 'arcaneGlow', opacity: 0.28 },
      { d: GLYPH_RING, stroke: 'ink', sw: 0.045 },
      { d: GLYPH_MARK, stroke: 'arcaneGlow', sw: 0.06 },
    ],
    kinds: ['rock'], themes: ['arcane', 'dungeon', 'ruins'], role: 'field',
    rotate: 'flat', weight: 0.5, pass: 'walkable', footprint: 0.22,
    tags: ['glow', 'flat'], gameplay: ['trigger'],
    light: { color: 'arcaneGlow', radius: 1.4 },
    sim: { mystery: true, statePair: 'glyph_spent' },
  },
  // glyph_spent (state): the same ring + sigil gone inert (grey, unlit).
  {
    id: 'glyph_spent', size: 0.85, wonk: 0.025,
    paths: [
      { d: GLYPH_RING, stroke: 'ink', sw: 0.045, opacity: 0.55 },
      { d: GLYPH_MARK, stroke: 'rockDeep', sw: 0.06, opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.22,
  },

  // STANDING STONES: three tapered menhirs of a small ritual ring, two-tone cut
  // stone over ground shadows. A ritual accent (upright occluders).
  {
    id: 'standingstones', size: 1.15, wonk: 0.04,
    paths: [
      { d: STONES_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(STONES_D, 'rockDeep', 'rock'),
    ],
    kinds: ['rock', 'stump'], themes: ['arcane', 'plains', 'tundra'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.46, tall: true,
    maxPerChunk: 2, tags: ['menhir'], gameplay: ['ritual'],
    sim: { mystery: true },
  },

  // MANA FONT: round stone basin with glowing mana welling in the recess, halo
  // pulsing beneath. Drink to restore — an arcane accent.
  {
    id: 'manafont', size: 1.05, wonk: 0.03,
    paths: [
      { d: glowHalo(0.62), fill: 'arcaneGlow', opacity: 0.3 },
      ...cutout(FONT_DISC, 'rockDeep', 'rock'),
      { d: FONT_RECESS, fill: 'ink' },
      { d: ring(0.3), fill: 'arcaneGlow', opacity: 0.9 },
      { d: ring(0.13, -0.03, -0.03), fill: 'arcaneGlow' },
      { d: 'M-0.24 -0.14A0.28 0.28 0 0 1 0.1 -0.26', stroke: 'cream', sw: 0.035, opacity: 0.7 },
    ],
    kinds: ['flower', 'rock'], themes: ['arcane', 'dungeon'], role: 'accent',
    rotate: 'free', weight: 0.2, pass: 'solid', footprint: 0.4, maxPerChunk: 2,
    tags: ['glow', 'light', 'anim'], gameplay: ['drink', 'restore'],
    light: { color: 'arcaneGlow', radius: 2 }, anim: true,
    sim: { mystery: true, statePair: 'font_dry' },
  },
  // font_dry (state): the same basin drained — dark empty recess, hairline
  // cracks, no glow.
  {
    id: 'font_dry', size: 1.05, wonk: 0.03,
    paths: [
      ...cutout(FONT_DISC, 'rockDeep', 'rock'),
      { d: FONT_RECESS, fill: 'stoneDark' },
      { d: FONT_CRACKS, stroke: 'rockDeep', sw: 0.04, opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.4,
  },

  // TELEPORT PAD: inscribed stone disc, glowing rune ticks, bright core and
  // up-warp chevrons. A warp accent (flat, on the ground).
  {
    id: 'teleportpad', size: 1.15, wonk: 0.025,
    paths: [
      { d: glowHalo(0.8), fill: 'arcaneGlow', opacity: 0.3 },
      ...cutout(PAD_DISC, 'rockDeep', 'rock'),
      { d: PAD_RING, stroke: 'ink', sw: 0.04 },
      { d: PAD_RUNES, stroke: 'arcaneGlow', sw: 0.045, opacity: 0.85 },
      { d: PAD_CORE, fill: 'arcaneGlow', opacity: 0.9 },
      { d: PAD_CHEVRONS, stroke: 'arcaneGlow', sw: 0.05 },
    ],
    kinds: ['rock', 'stump'], themes: ['arcane', 'ruins', 'dungeon'], role: 'accent',
    rotate: 'flat', weight: 0.2, pass: 'walkable', footprint: 0.46, maxPerChunk: 2,
    tags: ['glow', 'light', 'flat'], gameplay: ['warp'],
    light: { color: 'arcaneGlow', radius: 2 },
    sim: { statePair: 'pad_dormant' },
  },
  // pad_dormant (state): the same disc gone dark — inked ring, dead core, no glow.
  {
    id: 'pad_dormant', size: 1.15, wonk: 0.025,
    paths: [
      ...cutout(PAD_DISC, 'rockDeep', 'rock'),
      { d: PAD_RING, stroke: 'ink', sw: 0.04 },
      { d: PAD_RUNES, stroke: 'ink', sw: 0.04, opacity: 0.5 },
      { d: PAD_CORE, fill: 'stoneDark' },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.46,
  },

  // CURSED IDOL: a carved totem post with an ominous sunken face (top-down
  // stylised, like `statue`). Trigger a curse — a haunted accent.
  {
    id: 'cursedidol', size: 1.05, wonk: 0.035,
    paths: [
      { d: ring(0.26, 0, 0.56), fill: 'shadow', opacity: 0.25 },
      ...cutout(IDOL_D, 'woodDeep', 'wood'),
      { d: IDOL_EYES, fill: 'ink' },
      { d: 'M-0.14 -0.2A0.075 0.075 0 0 1 -0.05 -0.24M0.14 -0.2A0.075 0.075 0 0 0 0.05 -0.24', stroke: 'bloodDry', sw: 0.03, opacity: 0.85 },
      { d: IDOL_MOUTH, stroke: 'ink', sw: 0.05 },
      { d: IDOL_MOUTH, stroke: 'cream', sw: 0.025, opacity: 0.6, lit: true },
    ],
    kinds: ['tree', 'stump'], themes: ['haunted', 'ruins', 'jungle'], role: 'accent',
    rotate: 'upright', weight: 0.22, pass: 'solid', footprint: 0.38, tall: true,
    maxPerChunk: 2, tags: ['ominous'], gameplay: ['trigger', 'curse'],
    sim: { encounter: 'trigger', statePair: 'idol_broken' },
  },
  // idol_broken (state): the idol shattered — a cracked lower stub, face gone,
  // a fracture running up. Walk over the rubble.
  {
    id: 'idol_broken', size: 1.05, wonk: 0.04,
    paths: [
      { d: ring(0.26, 0, 0.56), fill: 'shadow', opacity: 0.22 },
      ...cutout(IDOL_BROKEN_D, 'woodDeep', 'wood'),
      { d: IDOL_CRACK, stroke: 'ink', sw: 0.05, opacity: 0.8 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3,
  },

  // OFFERING BOWL: a stone bowl heaped with flower offerings. Make an offering —
  // a field prop; its lit companion burns a votive flame.
  {
    id: 'offeringbowl', size: 0.9, wonk: 0.035,
    paths: [
      ...cutout(BOWL_DISC, 'rockDeep', 'rock'),
      { d: BOWL_RECESS, fill: 'ink' },
      { d: BOWL_PETALS, fill: 'bloom' },
    ],
    kinds: ['rock', 'flower'], themes: ['arcane', 'ruins', 'city'], role: 'field',
    rotate: 'free', weight: 0.45, pass: 'solid', footprint: 0.3,
    tags: ['light'], gameplay: ['offer'],
    sim: { mystery: true, statePair: 'bowl_lit' },
  },
  // bowl_lit (state): the same bowl kindled — a votive flame in the recess and a
  // warm halo beneath.
  {
    id: 'bowl_lit', size: 0.9, wonk: 0.035,
    paths: [
      { d: glowHalo(0.5), fill: 'lampGlow', opacity: 0.28 },
      ...cutout(BOWL_DISC, 'rockDeep', 'rock'),
      { d: BOWL_RECESS, fill: 'ink' },
      { d: ring(0.12, 0, -0.02), fill: 'emberDeep' },
      { d: ring(0.07, 0, -0.05), fill: 'ember' },
      { d: ring(0.035, 0, -0.08), fill: 'lampGlow' },
    ],
    kinds: [], tags: ['interactable', 'light', 'glow'], pass: 'solid', footprint: 0.3,
    light: { color: 'lampGlow', radius: 1.5 },
  },
]
