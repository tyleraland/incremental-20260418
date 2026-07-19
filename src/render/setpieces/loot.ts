// ── Setpieces: Loot & containers (strongbox · mimic chest · buried cache · pan spot) ──
//
// Bucket: STONE (dungeon/ruins — where `chest`/`hoard`/`coin`/`gem` live).
// Builder file: COMPLETE PropDefs (full inline placement meta) flow into
// TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts spreads this
// array into the `stone` bucket, then runs variants(). Geometry from './kit' only.
//
// Gameplay verbs → GameplayTag: lootable (existing) / lock / ambush / dig / pan.
// `treasure`/`locked`/`enemy`/`hidden`/`on-water`/`ore` are freeform `tags`.
// State-pair companions reuse the base geometry (lid ajar / mimic sprung / pit
// dug) with kinds:[] + tags:['interactable'] so they're exempt from the scatter
// reachability gate (like `chestopen`/`hoard_looted`). Full guide: WAVE 2 digest.
//
// COLLISIONS (defer-to-existing — NOT redefined here; orchestrator aligns meta):
//   chest, chestopen, hoard, hoard_looted, coin, gem already exist → skipped.
//   digspot deferred to the alignment lane. `mimic` is a monster BodyShape in a
//   different namespace (assetKey = category:id) — we use prop id `mimicchest`.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, scatterDots, blobPath, roughCircle, hashString } from './kit'

// ── strongbox: a small iron-banded lockbox, top-down. Distinct from `chest`
// (bigger, gold clasp dot): squarer wood body under two iron straps with a big
// square gold lock plate + keyhole — the "locked" signature. ──────────────────
const STRONGBOX_D = rect(-0.5, -0.42, 1.0, 0.84)
const STRONGBOX_BANDS = 'M-0.28 -0.42L-0.28 0.42M0.28 -0.42L0.28 0.42'
const STRONGBOX_LID = 'M-0.5 -0.04L0.5 -0.04'
const STRONGBOX_LOCK = rect(-0.12, -0.04, 0.24, 0.2)
const STRONGBOX_KEYHOLE = ring(0.045, 0, 0.08)
// opened companion: lid flipped up behind, dark hollow + gold glints, lock on lid.
const STRONGBOXOPEN_LID = rect(-0.5, -0.78, 1.0, 0.34)
const STRONGBOXOPEN_HOLLOW = rect(-0.4, -0.3, 0.8, 0.6)
const STRONGBOXOPEN_LOCK = rect(-0.12, -0.66, 0.24, 0.16)
const STRONGBOXOPEN_GLINTS = ring(0.06, -0.16, 0) + ring(0.05, 0.14, 0.1) + ring(0.045, 0.2, -0.16)

// ── mimicchest: a treasure chest that is a monster in disguise. HIDDEN, so it
// reads as a chest with subtle wrong tells — a faint sawtooth along the lid seam
// and two arcane eye-glints peeking under the lid. ───────────────────────────
const MIMIC_D = rect(-0.52, -0.4, 1.04, 0.8)
const MIMIC_STRAPS = 'M0 -0.4L0 0.4'
const MIMIC_CLASP = ring(0.13, 0, 0.18)
const MIMIC_TEETH = 'M-0.4 -0.02L-0.32 0.05L-0.24 -0.02L-0.16 0.05L-0.08 -0.02L0 0.05L0.08 -0.02L0.16 0.05L0.24 -0.02L0.32 0.05L0.4 -0.02'
const MIMIC_EYES = ring(0.05, -0.24, -0.24) + ring(0.05, 0.24, -0.24)
// sprung companion: lid flung up as an upper jaw, gaping dark maw ringed with
// teeth, a tongue, eyes lit — the same body base opened into a mouth.
const MIMICWAKE_UPPERJAW = rect(-0.52, -0.82, 1.04, 0.4)
const MIMICWAKE_MAW = rect(-0.42, -0.34, 0.84, 0.52)
const MIMICWAKE_TEETH =
  'M-0.42 -0.34L-0.32 -0.2L-0.22 -0.34L-0.12 -0.2L-0.02 -0.34L0.08 -0.2L0.18 -0.34L0.28 -0.2L0.38 -0.34' +
  'M-0.4 0.18L-0.3 0.04L-0.2 0.18L-0.1 0.04L0 0.18L0.1 0.04L0.2 0.18L0.3 0.04L0.4 0.18'
const MIMICWAKE_TONGUE = ring(0.12, 0, 0.0)
const MIMICWAKE_EYES = ring(0.06, -0.26, -0.52) + ring(0.06, 0.26, -0.52)

// ── buriedcache: a patch of disturbed earth hiding treasure — an X-marks-the-spot
// mound of two-tone dirt with a buried chest-corner + gold glint peeking through.
// HIDDEN; theme sand/dirt so it reads on desert/beach/plains. ─────────────────
const CACHE_SEED = hashString('buriedcache')
const CACHE_MOUND = blobPath(roughCircle(0, 0, 0.58, 9, CACHE_SEED))
const CACHE_XMARK = 'M-0.22 -0.22L0.22 0.22M-0.22 0.22L0.22 -0.22'
const CACHE_PEEK = 'M-0.16 0.36L0.16 0.36L0.12 0.14L-0.12 0.14Z'
const CACHE_GLINT = ring(0.05, 0.0, 0.24)
// dug companion: same mound, treasure scooped — a dark pit + one stray coin.
const CACHEDUG_PIT = blobPath(roughCircle(0, 0.02, 0.34, 8, CACHE_SEED + 7))
const CACHEDUG_STRAY = ring(0.05, 0.3, -0.22)

// ── panspot: a gold-panning spot in shallow water (Stardew "pan"): concentric
// ripple rings over a submerged gravel bed with a scatter of gold flakes — the
// `ore` signature. Floats on the water plane (layer water-surface). ───────────
const PANSPOT_RIPPLE_OUT = ring(0.55)
const PANSPOT_RIPPLE_IN = ring(0.34)
const PANSPOT_BED = blobPath(roughCircle(0, 0.04, 0.24, 7, hashString('panspot')))
const PANSPOT_FLAKES = scatterDots(hashString('panflake'), 4, 0.46, 0.03, 0.055)

export const LOOT: PropDef[] = [
  // ── strongbox (locked container) + opened state ──
  {
    id: 'strongbox', size: 0.78, wonk: 0.03,
    paths: [
      ...cutout(STRONGBOX_D, 'woodDeep', 'wood'),
      { d: STRONGBOX_BANDS, stroke: 'steel', sw: 0.08 },
      { d: STRONGBOX_LID, stroke: 'ink', sw: 0.05, opacity: 0.7 },
      { d: STRONGBOX_LOCK, fill: 'bannerGold' },
      { d: STRONGBOX_KEYHOLE, fill: 'ink' },
    ],
    kinds: ['stump', 'rock'], themes: ['dungeon', 'city', 'ruins'], role: 'field',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.3, maxPerChunk: 2,
    tags: ['treasure', 'locked'], gameplay: ['lootable', 'lock'],
  },
  {
    id: 'strongbox_open', size: 0.78, wonk: 0.03,
    paths: [
      { d: STRONGBOXOPEN_LID, fill: 'woodLight' },
      ...cutout(STRONGBOX_D, 'woodDeep', 'wood'),
      { d: STRONGBOX_BANDS, stroke: 'steel', sw: 0.08 },
      { d: STRONGBOXOPEN_HOLLOW, fill: 'ink' },
      { d: STRONGBOXOPEN_LOCK, fill: 'bannerGold' },
      { d: STRONGBOXOPEN_GLINTS, fill: 'bannerGold' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3,
  },

  // ── mimicchest (disguised monster) + sprung state ──
  {
    id: 'mimicchest', size: 0.85, wonk: 0.03,
    paths: [
      ...cutout(MIMIC_D, 'woodDeep', 'wood'),
      { d: MIMIC_TEETH, stroke: 'cream', sw: 0.03, opacity: 0.55 },
      { d: MIMIC_STRAPS, stroke: 'ink', sw: 0.06, opacity: 0.7 },
      { d: MIMIC_CLASP, fill: 'bannerGold' },
      { d: MIMIC_EYES, fill: 'arcaneGlow', opacity: 0.75 },
    ],
    kinds: ['stump', 'rock'], themes: ['dungeon', 'arcane'], role: 'accent',
    rotate: 'upright', weight: 0.15, pass: 'solid', footprint: 0.32, maxPerChunk: 1,
    tags: ['treasure', 'enemy', 'hidden'], gameplay: ['ambush'],
  },
  {
    id: 'mimicchest_wake', size: 0.85, wonk: 0.03,
    paths: [
      { d: MIMICWAKE_UPPERJAW, fill: 'woodLight' },
      ...cutout(MIMIC_D, 'woodDeep', 'wood'),
      { d: MIMICWAKE_MAW, fill: 'ink' },
      { d: MIMICWAKE_TONGUE, fill: 'bloodDry' },
      { d: MIMICWAKE_TEETH, stroke: 'cream', sw: 0.045 },
      { d: MIMICWAKE_EYES, fill: 'arcaneGlow' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.32,
  },

  // ── buriedcache (hidden dig cache) + dug state ──
  {
    id: 'buriedcache', size: 1.0, wonk: 0.04,
    paths: [
      ...cutout(CACHE_MOUND, 'dirtPath', 'sand'),
      { d: CACHE_XMARK, stroke: 'woodDeep', sw: 0.06, opacity: 0.6 },
      { d: CACHE_PEEK, fill: 'woodDeep' },
      { d: CACHE_GLINT, fill: 'bannerGold' },
    ],
    kinds: ['rock', 'flower'], themes: ['desert', 'plains', 'beach'], role: 'field',
    rotate: 'free', weight: 0.2, pass: 'walkable', footprint: 0.3, maxPerChunk: 2,
    tags: ['treasure', 'hidden'], gameplay: ['dig', 'lootable'],
  },
  {
    id: 'cache_dug', size: 1.0, wonk: 0.04,
    paths: [
      ...cutout(CACHE_MOUND, 'dirtPath', 'sand'),
      { d: CACHEDUG_PIT, fill: 'ink', opacity: 0.7 },
      { d: CACHEDUG_STRAY, fill: 'bannerGold', opacity: 0.6 },
    ],
    kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3,
  },

  // ── panspot (gold-panning spot on water) — no state pair ──
  {
    id: 'panspot', size: 1.0, wonk: 0.04,
    paths: [
      { d: PANSPOT_RIPPLE_OUT, stroke: 'waterHi', sw: 0.045, opacity: 0.5 },
      ...cutout(PANSPOT_BED, 'rockDeep', 'rock'),
      { d: PANSPOT_RIPPLE_IN, stroke: 'waterHi', sw: 0.05, opacity: 0.65 },
      { d: PANSPOT_FLAKES, fill: 'bannerGold', opacity: 0.85 },
    ],
    kinds: ['reed', 'rock'], themes: ['water', 'mountain'], role: 'field',
    rotate: 'free', weight: 0.3, pass: 'walkable', footprint: 0.28,
    layer: 'water-surface', tags: ['on-water', 'ore'], gameplay: ['pan', 'lootable'],
  },
]
