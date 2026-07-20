// ── Hag: Witchery (big cauldron · herb drying · charms · potion shelf · raven · crow cage · fungi · scrying · effigy · salt circle · totem · spellbook · candles) ──
//
// Bucket: STONE (the witch's ritual kit — mirrors wave-2 ritual → stone).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `stone`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   cauldron_big          role use,brew → gameplay:['use','brew'], role:'accent'
//   herbdrying            role '-' → role:'accent', layer:'canopy'
//   hangingcharms         role '-' → role:'edge', layer:'wall'
//   potionshelf           role search → gameplay:['search'], role:'accent', state potionshelf_ransacked
//   ravenperch/gnarledtotem/crowcage/scryingpool/witcheffigy  role '-'/verb → role:'accent'
//   mushroomgarden/toadstoolbed  role forage → gameplay:['forage'], role:'cluster'
//   saltcircle            role '-' → role:'field' (flat decal, rotate:'flat')
//   spellbook             role read,loot → gameplay:['read','lootable'], role:'field'
//   candlecluster         role '-' → role:'field'
//
// LAYER: herbdrying → 'canopy'; hangingcharms → 'wall'; saltcircle → 'ground'
// (rotate 'flat'); scryingpool → 'ground' (FOUNTAIN PRECEDENT: spec tags
// 'water-surface' but themes carry NO water — a ground scrying basin, so 'ground'
// + 'water-surface' kept as a descriptive tag only). Rest ground.
//
// COLLISIONS (arbitrated in digest WAVE 3): cauldron_big KEEP (large witch pot ≠
// artisan `cauldron`), effigy → witcheffigy, bonepile → DEFER (wave-2 lore owns
// it; skipped here), crowcage/gnarledtotem/potionshelf/saltcircle/spellbook/
// candlecluster/mushroomgarden all FREE. Unique states: cauldron_big_bubbling,
// potionshelf_ransacked, crowcage_open, mushroomgarden_picked, witcheffigy_burned,
// saltcircle_broken, spellbook_taken, candlecluster_lit.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, leaf, radialStar, lobeBlob, scatterDots, glowHalo, hashString } from './kit'

const TAU = Math.PI * 2
const q = (v: number) => Math.round(v * 1000) / 1000

// A mushroom cap: an upward-bulging dome with a flat underside (sweep 0 = arc
// through the top in y-down space).
function dome(cx: number, cyBase: number, r: number): string {
  return `M${q(cx - r)} ${q(cyBase)}A${q(r)} ${q(r * 0.85)} 0 0 0 ${q(cx + r)} ${q(cyBase)}Z`
}
// A mushroom stem hanging below its cap base.
function stem(cx: number, cyBase: number, r: number): string {
  return rect(q(cx - r * 0.28), q(cyBase), q(r * 0.56), q(r * 0.92))
}
// n evenly-spaced dots on a circle of radius r (salt piles, votive marks, rim runes).
function dotsOn(n: number, r: number, dotR: number, rot = -Math.PI / 2): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU
    d += ring(dotR, Math.cos(a) * r, Math.sin(a) * r)
  }
  return d
}
// A candle-flame teardrop rising from a wick tip at (cx, topY).
function flame(cx: number, topY: number, s = 1): string {
  const h = 0.16 * s, w = 0.06 * s
  return `M${q(cx)} ${q(topY - h)}Q${q(cx - w)} ${q(topY - h * 0.3)} ${q(cx)} ${q(topY)}Q${q(cx + w)} ${q(topY - h * 0.3)} ${q(cx)} ${q(topY - h)}Z`
}
// A bottle: rectangular body + a short neck stub (potion vials on the shelf).
function vial(cx: number, cyBase: number, h: number, w: number): string {
  return rect(q(cx - w / 2), q(cyBase - h), q(w), q(h))
}
function neck(cx: number, topY: number): string {
  return rect(q(cx - 0.02), q(topY - 0.06), 0.04, 0.06)
}

// ── cauldron_big: bulbous iron pot on three legs over embers ──
const POT_D = 'M-0.5 -0.22C-0.66 0.12 -0.52 0.5 0 0.52C0.52 0.5 0.66 0.12 0.5 -0.22C0.5 -0.35 0.28 -0.42 0 -0.42C-0.28 -0.42 -0.5 -0.35 -0.5 -0.22Z'
const POT_MOUTH = 'M-0.44 -0.3A0.44 0.15 0 1 0 0.44 -0.3A0.44 0.15 0 1 0 -0.44 -0.3Z'
const POT_LEGS = 'M-0.34 0.46L-0.42 0.68M0 0.52L0 0.74M0.34 0.46L0.42 0.68'
const POT_BREW = 'M-0.38 -0.3A0.38 0.12 0 1 0 0.38 -0.3A0.38 0.12 0 1 0 -0.38 -0.3Z'
const POT_BUBBLES = ring(0.05, -0.14, -0.32) + ring(0.06, 0.1, -0.28) + ring(0.04, 0, -0.35) + ring(0.05, -0.02, -0.23)

// ── herbdrying: bundles of herbs hanging from a twine (overhead) ──
const HERB_TWINE = 'M-0.82 -0.5L0.82 -0.42'
const HERB_BUNCHES =
  leaf(-0.5, -0.2, 0.28, 0.11, Math.PI / 2) + leaf(-0.58, -0.14, 0.22, 0.09, Math.PI / 2 + 0.35) + leaf(-0.42, -0.14, 0.22, 0.09, Math.PI / 2 - 0.35) +
  leaf(0.0, -0.16, 0.3, 0.12, Math.PI / 2) + leaf(-0.08, -0.1, 0.24, 0.1, Math.PI / 2 + 0.3) + leaf(0.08, -0.1, 0.24, 0.1, Math.PI / 2 - 0.3) +
  leaf(0.5, -0.14, 0.27, 0.11, Math.PI / 2) + leaf(0.42, -0.08, 0.22, 0.09, Math.PI / 2 + 0.35) + leaf(0.58, -0.08, 0.22, 0.09, Math.PI / 2 - 0.35)
const HERB_FLOWERS = ring(0.05, -0.5, 0.1) + ring(0.055, 0.0, 0.16) + ring(0.05, 0.5, 0.12)
const HERB_TIES = 'M-0.5 -0.46L-0.5 -0.38M0.0 -0.44L0.0 -0.36M0.5 -0.42L0.5 -0.34'

// ── hangingcharms: talismans/bones dangling from a wall rail ──
const CHARM_RAIL = rect(-0.72, -0.66, 1.44, 0.1)
const CHARM_STRINGS = 'M-0.5 -0.58L-0.52 0.14M-0.16 -0.58L-0.18 0.34M0.2 -0.58L0.22 0.05M0.52 -0.58L0.5 0.24'
const CHARM_SKULL = ring(0.12, -0.16, 0.44)
const CHARM_BONE = ring(0.045, -0.5, 0.12) + ring(0.045, -0.5, 0.3) + rect(-0.525, 0.11, 0.05, 0.2)
const CHARM_CREAM = CHARM_SKULL + CHARM_BONE
const CHARM_EYES = ring(0.028, -0.2, 0.42) + ring(0.028, -0.11, 0.42)
const CHARM_BEADS = ring(0.05, 0.19, 0.0) + ring(0.045, 0.21, 0.1) + ring(0.04, 0.2, 0.18)
const CHARM_FEATHER = leaf(0.5, 0.34, 0.14, 0.05, Math.PI / 2)

// ── potionshelf: cabinet of colored potion vials ──
const SHELF_FRAME = rect(-0.52, -0.62, 1.04, 1.22)
const SHELF_INTERIOR = rect(-0.44, -0.54, 0.88, 1.06)
const SHELF_LEDGES = 'M-0.52 -0.14L0.52 -0.14M-0.52 0.26L0.52 0.26'
const SHELF_PURPLE = vial(-0.22, -0.14, 0.22, 0.13)
const SHELF_TEAL = vial(0.22, -0.14, 0.24, 0.13)
const SHELF_RED = vial(-0.22, 0.26, 0.22, 0.13)
const SHELF_ARCANE = vial(0.22, 0.26, 0.2, 0.13)
const SHELF_NECKS = neck(-0.22, -0.36) + neck(0.22, -0.38) + neck(-0.22, 0.04) + neck(0.22, 0.06)
const SHELF_SAG = 'M-0.52 -0.14L0.1 -0.04L0.52 -0.2'
const SHELF_SHARDS = scatterDots(hashString('potionshelf-shards'), 7, 0.86, 0.03, 0.07)
const SHELF_SPILL = ring(0.14, -0.1, 0.4) + ring(0.1, 0.16, 0.42)

// ── ravenperch: a raven on a forked dead branch ──
const PERCH_BRANCH = 'M-0.1 0.62L-0.02 0.0L-0.26 -0.3L-0.13 -0.28L0.0 -0.05L0.16 -0.3L0.28 -0.24L0.06 0.02L0.12 0.62Z'
const RAVEN_D =
  lobeBlob(6, 0.28, 0.22, 0.02, -0.16) +
  ring(0.12, 0.3, -0.3) +
  'M-0.2 -0.1L-0.5 -0.02L-0.18 0.06Z' +
  'M0.42 -0.3L0.6 -0.26L0.42 -0.24Z'
const RAVEN_EYE = ring(0.028, 0.34, -0.32)

// ── crowcage: a hanging gibbet cage with bones inside ──
const CAGE_OUTLINE = 'M-0.36 0.28C-0.4 -0.16 -0.26 -0.48 0 -0.48C0.26 -0.48 0.4 -0.16 0.36 0.28C0.32 0.44 -0.32 0.44 -0.36 0.28Z'
const CAGE_CHAIN = 'M0 -0.5L0 -0.72'
const CAGE_RINGTOP = ring(0.05, 0, -0.75)
const CAGE_INMATE = lobeBlob(5, 0.16, 0.12, 0, 0.14)
const CAGE_SKULL = ring(0.08, 0, -0.04)
const CAGE_BARS = 'M-0.18 -0.44L-0.22 0.34M0 -0.48L0 0.4M0.18 -0.44L0.22 0.34M-0.4 -0.06Q0 0.06 0.4 -0.06M-0.38 0.2Q0 0.32 0.38 0.2'
const CAGE_BARS_OPEN = 'M-0.18 -0.44L-0.22 0.34M0 -0.48L0 0.4M-0.4 -0.06Q0 0.06 0.4 -0.06'
const CAGE_DOOR = 'M0.34 -0.2L0.6 -0.12M0.34 0.0L0.62 0.06M0.34 0.2L0.58 0.24'
const CAGE_FEATHER = leaf(0.06, 0.5, 0.1, 0.04, Math.PI / 2 - 0.3)

// ── mushroomgarden: bed of glowing (teal) mushrooms ──
const MUSH_MOUND = lobeBlob(7, 0.62, 0.5, 0, 0.3)
const MUSH_CAPS = dome(-0.3, 0.28, 0.2) + dome(0.02, 0.12, 0.26) + dome(0.3, 0.3, 0.18) + dome(0.14, 0.34, 0.14)
const MUSH_STEMS = stem(-0.3, 0.28, 0.2) + stem(0.02, 0.12, 0.26) + stem(0.3, 0.3, 0.18) + stem(0.14, 0.34, 0.14)
const MUSH_SPOTS = ring(0.045, -0.3, 0.2) + ring(0.05, 0.02, 0.02) + ring(0.04, 0.3, 0.24) + ring(0.035, 0.14, 0.28)
const MUSH_STUBS = rect(-0.36, 0.26, 0.11, 0.14) + rect(-0.05, 0.14, 0.14, 0.16) + rect(0.25, 0.3, 0.1, 0.12) + rect(0.09, 0.34, 0.09, 0.1)

// ── toadstoolbed: bed of red (amanita) toadstools ──
const TOAD_MOUND = lobeBlob(7, 0.6, 0.48, 0, 0.32)
const TOAD_CAPS = dome(-0.28, 0.3, 0.2) + dome(0.06, 0.14, 0.26) + dome(0.3, 0.32, 0.17)
const TOAD_STEMS = stem(-0.28, 0.3, 0.2) + stem(0.06, 0.14, 0.26) + stem(0.3, 0.32, 0.17)
const TOAD_SPOTS = ring(0.04, -0.3, 0.22) + ring(0.045, 0.06, 0.04) + ring(0.035, 0.12, 0.06) + ring(0.035, 0.3, 0.26)

// ── scryingpool: a stone basin of dark water reflecting arcane light ──
const POOL_BASIN = ring(0.52)
const POOL_WATER = ring(0.38)
const POOL_SHEEN = ring(0.32)
const POOL_VISION = ring(0.12, -0.04, -0.04)
const POOL_RUNES = dotsOn(6, 0.45, 0.03)
const POOL_REFLECT = 'M-0.22 -0.14A0.28 0.28 0 0 1 0.12 -0.26'

// ── witcheffigy: a bound straw figure on a stake ──
const EFFIGY_FRAME = 'M-0.03 0.64L0 -0.15M-0.4 -0.02L0.42 -0.05'
const EFFIGY_BODY = lobeBlob(6, 0.26, 0.2, 0, 0.16) + ring(0.15, 0, -0.28)
const EFFIGY_HANDS = ring(0.06, -0.4, -0.02) + ring(0.06, 0.42, -0.05)
const EFFIGY_CORD = 'M-0.2 0.1Q0 0.16 0.2 0.1'
const EFFIGY_EYES = 'M-0.08 -0.32L-0.03 -0.27M-0.03 -0.32L-0.08 -0.27M0.03 -0.32L0.08 -0.27M0.08 -0.32L0.03 -0.27'
const EFFIGY_MOUTH = 'M-0.06 -0.2L0.06 -0.2'
const EFFIGY_EMBERS = ring(0.04, -0.08, 0.0) + ring(0.05, 0.06, -0.1) + ring(0.03, 0, 0.12)
const EFFIGY_ASH = scatterDots(hashString('witcheffigy-ash'), 5, 0.6, 0.02, 0.045)

// ── saltcircle: a protective salt ring with a sigil (flat decal) ──
const SALT_RING = ring(0.68)
const SALT_INNER = ring(0.46)
const SALT_SIGIL = radialStar(5, 0.34, 0.15, -Math.PI / 2)
const SALT_DOTS = dotsOn(6, 0.68, 0.05)
const SALT_BROKEN = 'M-0.68 0.0A0.68 0.68 0 1 1 0.4 -0.55'
const SALT_SCATTER = scatterDots(hashString('saltcircle-broken'), 8, 1.2, 0.03, 0.06)

// ── gnarledtotem: a twisted warding totem post ──
const TOTEM_POST = 'M-0.24 0.62C-0.32 0.34 -0.14 0.22 -0.2 -0.02C-0.26 -0.28 -0.14 -0.5 0 -0.58C0.16 -0.5 0.28 -0.3 0.22 -0.04C0.16 0.22 0.32 0.34 0.24 0.62Z'
const TOTEM_KNOTS = ring(0.06, -0.08, -0.28) + ring(0.06, 0.08, -0.28)
const TOTEM_MOUTH = 'M-0.1 -0.12L0 -0.05L0.1 -0.12'
const TOTEM_WARD = 'M-0.12 0.12Q0 0.06 0.12 0.14Q0.04 0.22 -0.06 0.18'
const TOTEM_BONE = ring(0.04, -0.24, 0.32) + ring(0.04, 0.24, 0.34) + rect(-0.24, 0.31, 0.48, 0.045)
const TOTEM_CORD = 'M0 0.3L0 0.42'

// ── spellbook: an open grimoire glowing with arcane runes ──
const BOOK_COVER = 'M-0.56 -0.36Q-0.6 -0.4 -0.5 -0.4L0.5 -0.4Q0.6 -0.4 0.56 -0.36L0.56 0.36Q0.6 0.4 0.5 0.4L-0.5 0.4Q-0.6 0.4 -0.56 0.36Z'
const BOOK_PAGES = 'M-0.5 -0.32L-0.04 -0.28L-0.04 0.3L-0.5 0.34Z' + 'M0.5 -0.32L0.04 -0.28L0.04 0.3L0.5 0.34Z'
const BOOK_SPINE = 'M0 -0.3L0 0.32'
const BOOK_RUNES = 'M-0.42 -0.16L-0.12 -0.14M-0.42 -0.04L-0.14 -0.02M-0.42 0.08L-0.16 0.1M0.12 -0.14L0.42 -0.16M0.14 -0.02L0.42 -0.04M0.16 0.1L0.42 0.08'
const BOOK_SIGIL = ring(0.06, 0.28, -0.1)
const BOOK_SPINE_L = 'M-0.5 -0.36L-0.5 0.36'
const BOOK_CLASP = 'M0.4 -0.08L0.56 -0.02L0.4 0.04'

// ── candlecluster: a cluster of tallow candles on a wax pool ──
const CANDLE_POOL = lobeBlob(7, 0.48, 0.38, 0, 0.42)
const CANDLE_STICKS = rect(-0.34, -0.06, 0.13, 0.5) + rect(-0.07, -0.16, 0.14, 0.66) + rect(0.2, -0.02, 0.12, 0.44) + rect(0.09, 0.14, 0.11, 0.32)
const CANDLE_WICKS = 'M-0.28 -0.06L-0.28 -0.11M0 -0.16L0 -0.21M0.26 -0.02L0.26 -0.07M0.145 0.14L0.145 0.1'
const CANDLE_FLAMES = flame(-0.28, -0.11) + flame(0, -0.21, 1.15) + flame(0.26, -0.07) + flame(0.145, 0.1, 0.85)
const CANDLE_FLAMES_IN = flame(-0.28, -0.11, 0.5) + flame(0, -0.21, 0.6) + flame(0.26, -0.07, 0.5) + flame(0.145, 0.1, 0.45)

export const HAG_WITCHERY: PropDef[] = [
  // CAULDRON_BIG: a bulbous iron pot on three legs over glowing embers — the
  // witch's brewing workstation. Distinct large hero prop from artisan `cauldron`.
  {
    id: 'cauldron_big', size: 1.05, wonk: 0.03,
    paths: [
      { d: glowHalo(0.52, 0, 0.36), fill: 'ember', opacity: 0.22 },
      { d: POT_LEGS, stroke: 'ink', sw: 0.07 },
      ...cutout(POT_D, 'rockDeep', 'rock'),
      { d: POT_MOUTH, fill: 'ink' },
      { d: POT_MOUTH, stroke: 'rock', sw: 0.04, opacity: 0.7 },
    ],
    kinds: ['rock', 'stump'], themes: ['swamp', 'haunted', 'arcane'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.4, maxPerChunk: 2,
    gameplay: ['use', 'brew'], light: { color: 'ember', radius: 2 }, anim: true,
    tags: ['workstation', 'light', 'anim'], sim: { statePair: 'cauldron_big_bubbling' },
  },
  // cauldron_big_bubbling (state): the same pot with a bubbling green brew in the
  // mouth and steam glowing above.
  {
    id: 'cauldron_big_bubbling', size: 1.05, wonk: 0.03,
    paths: [
      { d: glowHalo(0.55, 0, 0.36), fill: 'ember', opacity: 0.24 },
      { d: POT_LEGS, stroke: 'ink', sw: 0.07 },
      ...cutout(POT_D, 'rockDeep', 'rock'),
      { d: POT_MOUTH, fill: 'ink' },
      { d: POT_BREW, fill: 'foliageDeep' },
      { d: POT_BUBBLES, fill: 'glowFungus' },
      { d: glowHalo(0.22, 0, -0.42), fill: 'glowFungus', opacity: 0.3 },
    ],
    kinds: [], tags: ['interactable', 'light', 'anim'], pass: 'solid', footprint: 0.4,
    light: { color: 'glowFungus', radius: 1.6 }, anim: true,
  },

  // HERBDRYING: bundles of herbs hung to dry from a twine — an overhead canopy
  // drape (cloth/forage). Two-tone leaf bunches with a few flower tips.
  {
    id: 'herbdrying', size: 1, wonk: 0.045,
    paths: [
      { d: HERB_TWINE, stroke: 'woodDeep', sw: 0.035 },
      ...cutout(HERB_BUNCHES, 'foliageDeep', 'foliage'),
      { d: HERB_FLOWERS, fill: 'bloom' },
      { d: HERB_TIES, stroke: 'canvas', sw: 0.05 },
    ],
    kinds: ['reed', 'flower'], themes: ['swamp', 'haunted', 'city'], role: 'accent',
    rotate: 'upright', weight: 0.35, pass: 'overhang', footprint: 0.35, layer: 'canopy',
    tags: ['cloth', 'forage'],
  },

  // HANGINGCHARMS: bones, a skull, beads and a feather dangling from a wall rail —
  // a warding fetish. Wall-edge fixture (ominous/ward).
  {
    id: 'hangingcharms', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(CHARM_RAIL, 'woodDeep', 'wood'),
      { d: CHARM_STRINGS, stroke: 'ink', sw: 0.02, opacity: 0.7 },
      { d: CHARM_CREAM, fill: 'cream' },
      { d: CHARM_EYES, fill: 'ink' },
      { d: CHARM_BEADS, fill: 'bloom' },
      { d: CHARM_FEATHER, fill: 'canvas' },
    ],
    kinds: ['flower', 'stump'], themes: ['swamp', 'haunted', 'arcane'], role: 'edge',
    rotate: 'upright', weight: 0.35, pass: 'walkable', footprint: 0.22, layer: 'wall',
    tags: ['ominous', 'ward'], anchor: ['wall'], orient: 'face-open',
  },

  // POTIONSHELF: a cabinet of colored potion vials — search it. Furniture accent.
  {
    id: 'potionshelf', size: 1.05, wonk: 0.03,
    paths: [
      ...cutout(SHELF_FRAME, 'woodDeep', 'wood'),
      { d: SHELF_INTERIOR, fill: 'stoneDark', opacity: 0.7 },
      { d: SHELF_PURPLE, fill: 'berryPurple' },
      { d: SHELF_TEAL, fill: 'glowFungus' },
      { d: SHELF_RED, fill: 'fruitRed' },
      { d: SHELF_ARCANE, fill: 'arcaneGlow', opacity: 0.9 },
      { d: SHELF_NECKS, fill: 'cream', opacity: 0.7 },
      { d: SHELF_LEDGES, stroke: 'woodDeep', sw: 0.05 },
    ],
    kinds: ['stump', 'flower'], themes: ['haunted', 'arcane'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'solid', footprint: 0.35, maxPerChunk: 2,
    gameplay: ['search'], tags: ['furniture'], sim: { statePair: 'potionshelf_ransacked' },
  },
  // potionshelf_ransacked (state): the same cabinet ransacked — a sagging shelf,
  // shattered glass, a spilled stain, no vials.
  {
    id: 'potionshelf_ransacked', size: 1.05, wonk: 0.03,
    paths: [
      ...cutout(SHELF_FRAME, 'woodDeep', 'wood'),
      { d: SHELF_INTERIOR, fill: 'stoneDark', opacity: 0.7 },
      { d: SHELF_SPILL, fill: 'berryPurpleDeep', opacity: 0.5 },
      { d: SHELF_SAG, stroke: 'woodDeep', sw: 0.05 },
      { d: SHELF_SHARDS, fill: 'cream', opacity: 0.7 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35,
  },

  // RAVENPERCH: a raven perched on a forked dead branch — an ominous accent.
  {
    id: 'ravenperch', size: 1.05, wonk: 0.045,
    paths: [
      { d: ring(0.24, 0, 0.6), fill: 'shadow', opacity: 0.22 },
      ...cutout(PERCH_BRANCH, 'woodDeep', 'wood'),
      ...cutout(RAVEN_D, 'stoneDark', 'rockDeep'),
      { d: RAVEN_EYE, fill: 'cream' },
    ],
    kinds: ['tree', 'stump'], themes: ['swamp', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.35, tall: true,
    maxPerChunk: 2, tags: ['ominous'],
  },

  // CROWCAGE: a hanging gibbet cage with bones inside — grim accent.
  {
    id: 'crowcage', size: 1.05, wonk: 0.03,
    paths: [
      { d: ring(0.2, 0, 0.62), fill: 'shadow', opacity: 0.2 },
      { d: CAGE_CHAIN, stroke: 'ink', sw: 0.03 },
      { d: CAGE_RINGTOP, stroke: 'ink', sw: 0.03 },
      { d: CAGE_OUTLINE, fill: 'stoneDark' },
      { d: CAGE_INMATE, fill: 'ink' },
      { d: CAGE_SKULL, fill: 'cream' },
      { d: CAGE_BARS, stroke: 'rockDeep', sw: 0.035 },
      { d: CAGE_OUTLINE, stroke: 'rock', sw: 0.04, opacity: 0.8 },
    ],
    kinds: ['stump', 'tree'], themes: ['swamp', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.35, tall: true,
    maxPerChunk: 2, tags: ['ominous', 'grim'], sim: { statePair: 'crowcage_open' },
  },
  // crowcage_open (state): the cage door swung open, the occupant gone — a stray
  // feather left below.
  {
    id: 'crowcage_open', size: 1.05, wonk: 0.03,
    paths: [
      { d: ring(0.2, 0, 0.62), fill: 'shadow', opacity: 0.2 },
      { d: CAGE_CHAIN, stroke: 'ink', sw: 0.03 },
      { d: CAGE_RINGTOP, stroke: 'ink', sw: 0.03 },
      { d: CAGE_OUTLINE, fill: 'stoneDark' },
      { d: CAGE_BARS_OPEN, stroke: 'rockDeep', sw: 0.035 },
      { d: CAGE_DOOR, stroke: 'rockDeep', sw: 0.035 },
      { d: CAGE_OUTLINE, stroke: 'rock', sw: 0.04, opacity: 0.8 },
      { d: CAGE_FEATHER, fill: 'ink' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35,
  },

  // MUSHROOMGARDEN: a bed of glowing teal mushrooms on a swampy mound — forage
  // them. Glows (glowFungus); a fungal cluster.
  {
    id: 'mushroomgarden', size: 1, wonk: 0.035,
    paths: [
      { d: glowHalo(0.72), fill: 'glowFungus', opacity: 0.28 },
      ...cutout(MUSH_MOUND, 'murkDeep', 'murk'),
      { d: MUSH_STEMS, fill: 'cream' },
      ...cutout(MUSH_CAPS, 'foliageDeep', 'glowFungus'),
      { d: MUSH_SPOTS, fill: 'cream' },
    ],
    kinds: ['bush', 'flower'], themes: ['swamp', 'haunted'], role: 'cluster',
    rotate: 'upright', weight: 0.4, pass: 'solid', footprint: 0.3,
    gameplay: ['forage'], light: { color: 'glowFungus', radius: 1.6 },
    tags: ['forage', 'fungus', 'glow'], clusterWith: ['mushroomgarden'],
    sim: { resource: { respawn: 'slow' }, statePair: 'mushroomgarden_picked' },
  },
  // mushroomgarden_picked (state): the caps harvested — cut stubs on the same
  // mound, no glow.
  {
    id: 'mushroomgarden_picked', size: 1, wonk: 0.035,
    paths: [
      ...cutout(MUSH_MOUND, 'murkDeep', 'murk'),
      { d: MUSH_STUBS, fill: 'cream', opacity: 0.85 },
      { d: MUSH_SPOTS, fill: 'cream', opacity: 0.4 },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3,
  },

  // TOADSTOOLBED: a bed of red-capped amanita toadstools with white spots — forage
  // them. A fae fungal cluster (distinct red read vs the glowing garden).
  {
    id: 'toadstoolbed', size: 1, wonk: 0.035,
    paths: [
      ...cutout(TOAD_MOUND, 'foliageDeep', 'foliage'),
      { d: TOAD_STEMS, fill: 'cream' },
      ...cutout(TOAD_CAPS, 'fruitRedDeep', 'fruitRed'),
      { d: TOAD_SPOTS, fill: 'cream' },
    ],
    kinds: ['flower', 'bush'], themes: ['swamp', 'haunted', 'arcane'], role: 'cluster',
    rotate: 'upright', weight: 0.45, pass: 'solid', footprint: 0.3,
    gameplay: ['forage'], tags: ['fungus', 'fae'], clusterWith: ['toadstoolbed'],
    sim: { resource: { respawn: 'slow' } },
  },

  // SCRYINGPOOL: a stone basin of dark water reflecting arcane light — scry it. A
  // ground scrying basin (fountain precedent: no water plane), arcane glow.
  {
    id: 'scryingpool', size: 1.05, wonk: 0.03,
    paths: [
      { d: glowHalo(0.64), fill: 'arcaneGlow', opacity: 0.28 },
      ...cutout(POOL_BASIN, 'rockDeep', 'rock'),
      { d: POOL_WATER, fill: 'murkDeep' },
      { d: POOL_SHEEN, fill: 'arcaneGlow', opacity: 0.5 },
      { d: POOL_RUNES, fill: 'arcaneGlow', opacity: 0.8 },
      { d: POOL_VISION, fill: 'arcaneGlow' },
      { d: POOL_REFLECT, stroke: 'cream', sw: 0.03, opacity: 0.6 },
    ],
    kinds: ['flower', 'rock'], themes: ['swamp', 'haunted', 'arcane'], role: 'accent',
    rotate: 'free', weight: 0.2, pass: 'solid', footprint: 0.4, layer: 'ground',
    maxPerChunk: 2, gameplay: ['scry'], light: { color: 'arcaneGlow', radius: 2 },
    anim: true, tags: ['water-surface', 'glow', 'anim'], sim: { mystery: true },
  },

  // WITCHEFFIGY: a bound straw figure on a stake with a stitched face — trigger it.
  // Ominous ritual accent (renamed from `effigy`; wave-2 owns the bare id).
  {
    id: 'witcheffigy', size: 1.05, wonk: 0.04,
    paths: [
      { d: ring(0.22, 0, 0.62), fill: 'shadow', opacity: 0.2 },
      { d: EFFIGY_FRAME, stroke: 'woodDeep', sw: 0.08 },
      { d: EFFIGY_FRAME, stroke: 'wood', sw: 0.04, opacity: 0.8 },
      ...cutout(EFFIGY_BODY, 'thatchInk', 'sand'),
      { d: EFFIGY_HANDS, fill: 'sand' },
      { d: EFFIGY_CORD, stroke: 'bloodDry', sw: 0.03 },
      { d: EFFIGY_EYES, stroke: 'ink', sw: 0.025 },
      { d: EFFIGY_MOUTH, stroke: 'ink', sw: 0.03 },
    ],
    kinds: ['tree', 'stump'], themes: ['swamp', 'haunted'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.38, tall: true,
    maxPerChunk: 2, gameplay: ['trigger'], tags: ['ominous', 'ritual'],
    sim: { encounter: 'trigger', statePair: 'witcheffigy_burned' },
  },
  // witcheffigy_burned (state): the effigy set alight — charred straw, embers and
  // a warm halo.
  {
    id: 'witcheffigy_burned', size: 1.05, wonk: 0.045,
    paths: [
      { d: glowHalo(0.4, 0, 0.2), fill: 'ember', opacity: 0.25 },
      { d: EFFIGY_FRAME, stroke: 'ink', sw: 0.07 },
      ...cutout(EFFIGY_BODY, 'ink', 'bloodDry'),
      { d: EFFIGY_EMBERS, fill: 'ember' },
      { d: EFFIGY_ASH, fill: 'cream', opacity: 0.4 },
    ],
    kinds: [], tags: ['interactable', 'light', 'anim'], pass: 'solid', footprint: 0.38,
    light: { color: 'ember', radius: 1.4 }, anim: true,
  },

  // SALTCIRCLE: a protective salt ring with a warding sigil — a flat ground decal.
  {
    id: 'saltcircle', size: 1.1, wonk: 0.025,
    paths: [
      { d: SALT_RING, stroke: 'cream', sw: 0.07 },
      { d: SALT_INNER, stroke: 'cream', sw: 0.035, opacity: 0.7 },
      { d: SALT_SIGIL, stroke: 'arcaneGlow', sw: 0.03, opacity: 0.8 },
      { d: SALT_DOTS, fill: 'cream' },
    ],
    kinds: ['flower'], themes: ['haunted', 'arcane'], role: 'field',
    rotate: 'flat', weight: 0.4, pass: 'walkable', footprint: 0.35, layer: 'ground',
    maxPerChunk: 3, tags: ['ward', 'flat'], sim: { mystery: true, statePair: 'saltcircle_broken' },
  },
  // saltcircle_broken (state): the ring smeared and broken — an open arc, salt
  // scattered, the sigil gone inert.
  {
    id: 'saltcircle_broken', size: 1.1, wonk: 0.025,
    paths: [
      { d: SALT_BROKEN, stroke: 'cream', sw: 0.07, opacity: 0.85 },
      { d: SALT_SCATTER, fill: 'cream', opacity: 0.7 },
      { d: SALT_SIGIL, stroke: 'rockDeep', sw: 0.03, opacity: 0.5 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.35,
  },

  // GNARLEDTOTEM: a twisted warding totem post with a carved face and a lashed
  // bone — ominous/ward accent (distinct from the bare `totem`).
  {
    id: 'gnarledtotem', size: 1.05, wonk: 0.04,
    paths: [
      { d: ring(0.22, 0, 0.62), fill: 'shadow', opacity: 0.2 },
      ...cutout(TOTEM_POST, 'woodDeep', 'wood'),
      { d: TOTEM_KNOTS, fill: 'ink' },
      { d: TOTEM_MOUTH, stroke: 'ink', sw: 0.04 },
      { d: TOTEM_WARD, stroke: 'bloodDry', sw: 0.03 },
      { d: TOTEM_BONE, fill: 'cream' },
      { d: TOTEM_CORD, stroke: 'bloodDry', sw: 0.025 },
    ],
    kinds: ['tree', 'stump'], themes: ['swamp', 'haunted', 'jungle'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.38, tall: true,
    maxPerChunk: 2, tags: ['ominous', 'ward'], sim: { mystery: true },
  },

  // SPELLBOOK: an open grimoire glowing with arcane runes — read or loot it. Lore
  // field prop.
  {
    id: 'spellbook', size: 0.9, wonk: 0.025,
    paths: [
      ...cutout(BOOK_COVER, 'woodDeep', 'wood'),
      { d: BOOK_PAGES, fill: 'cream' },
      { d: BOOK_SPINE, stroke: 'woodDeep', sw: 0.03 },
      { d: BOOK_RUNES, stroke: 'arcaneGlow', sw: 0.03, opacity: 0.85 },
      { d: BOOK_SIGIL, fill: 'arcaneGlow' },
    ],
    kinds: ['stump', 'flower'], themes: ['haunted', 'arcane'], role: 'field',
    rotate: 'free', weight: 0.3, pass: 'walkable', footprint: 0.28,
    gameplay: ['read', 'lootable', 'search'], tags: ['lore', 'arcane'],
    sim: { collect: true, statePair: 'spellbook_taken' },
  },
  // spellbook_taken (state): the book closed and inert — a clasped leather cover,
  // no pages, no glow.
  {
    id: 'spellbook_taken', size: 0.9, wonk: 0.025,
    paths: [
      ...cutout(BOOK_COVER, 'woodDeep', 'wood'),
      { d: BOOK_SPINE_L, stroke: 'woodDeep', sw: 0.06 },
      { d: BOOK_CLASP, stroke: 'bannerGold', sw: 0.04 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.28,
  },

  // CANDLECLUSTER: a cluster of tallow candles on a melted-wax pool — unlit base,
  // its lit companion burns. Field decor (light/anim).
  {
    id: 'candlecluster', size: 0.9, wonk: 0.03,
    paths: [
      ...cutout(CANDLE_POOL, 'canvas', 'cream'),
      ...cutout(CANDLE_STICKS, 'canvas', 'cream'),
      { d: CANDLE_WICKS, stroke: 'ink', sw: 0.02 },
    ],
    kinds: ['rock', 'flower'], themes: ['haunted', 'arcane'], role: 'field',
    rotate: 'free', weight: 0.4, pass: 'solid', footprint: 0.28,
    tags: ['light', 'anim'], sim: { statePair: 'candlecluster_lit' },
  },
  // candlecluster_lit (state): the candles kindled — flames on every wick and a
  // warm halo beneath.
  {
    id: 'candlecluster_lit', size: 0.9, wonk: 0.03,
    paths: [
      { d: glowHalo(0.6, 0, -0.05), fill: 'lampGlow', opacity: 0.28 },
      ...cutout(CANDLE_POOL, 'canvas', 'cream'),
      ...cutout(CANDLE_STICKS, 'canvas', 'cream'),
      { d: CANDLE_WICKS, stroke: 'ink', sw: 0.02 },
      { d: CANDLE_FLAMES, fill: 'emberDeep' },
      { d: CANDLE_FLAMES_IN, fill: 'lampGlow' },
    ],
    kinds: [], tags: ['interactable', 'light', 'glow', 'anim'], pass: 'solid', footprint: 0.28,
    light: { color: 'lampGlow', radius: 1.6 }, anim: true,
  },
]
