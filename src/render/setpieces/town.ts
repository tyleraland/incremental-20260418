// ── Setpieces: Town fixtures (mailbox · bulletin board · festival stall · fountain · trash can · street lamp) ──
//
// Bucket: PLAZA (city — where `bench`/`marketstall`/`signpost` live). Builder:
// fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only.
//
// Gameplay verbs → GameplayTag: read/quest/search. `social`/`seasonal`/`light`/
// `water-surface`/`interactable` are freeform `tags`.
// UNIQUE STATE-ID RULE: `streetlamp` lit-state is `streetlamp_lit` (NOT the bare
// `lamp_lit` the spec reuses — furniture owns `floorlamp_lit`). `mailbox`
// flag-up state is `mailbox_flag`.
//
// COLLISIONS (defer-to-existing, skipped here): well, signpost, bench,
// marketstall, statue, shrine, fishnet already props. `lamppost`/`banner` are
// the DECOR_RING assets (empty kinds by design) — untouched. NEW town ids below.
//
// NOTE ON `fountain`: spec tags it `water-surface,anim` but its authoritative
// themes are city,plains (no water). A plaza fountain is a ground-standing stone
// basin, not a prop floating on a water plane — layer:'water-surface' would skip
// it on every legacy city map (which W2.2 warns needs water/beach themes). So it
// is authored layer:'ground' (the basin holds water; the tag stays descriptive),
// keeping it placeable where a fountain belongs.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, glowHalo } from './kit'

// ── mailbox: an upright post-box icon, arched galvanized body on a wood post,
//    letter slot, and the signature red flag (down = base, up = mail waiting). ──
const MAILBOX_SHADOW = 'M-0.28 0.6A0.28 0.09 0 1 0 0.28 0.6A0.28 0.09 0 1 0 -0.28 0.6Z'
const MAILBOX_POST = rect(-0.07, 0.02, 0.14, 0.58)
const MAILBOX_BODY = 'M-0.4 0.12L-0.4 -0.14Q-0.4 -0.5 0 -0.5Q0.4 -0.5 0.4 -0.14L0.4 0.12Z'
const MAILBOX_SLOT = 'M-0.22 -0.28L0.22 -0.28'
const MAILBOX_FLAGPOLE = 'M0.44 0.12L0.44 -0.42'
const MAILBOX_FLAG_DOWN = 'M0.44 -0.06L0.64 -0.02L0.64 0.12L0.44 0.08Z'
const MAILBOX_FLAG_UP = 'M0.44 -0.42L0.64 -0.38L0.64 -0.24L0.44 -0.28Z'

// ── bulletin board: a plank notice board on two posts, pinned cream notices with
//    red quest pins — the town read/quest board. ──
const BULLETIN_POSTS = 'M-0.42 0.6L-0.42 -0.12M0.42 0.6L0.42 -0.12'
const BULLETIN_BOARD = rect(-0.54, -0.5, 1.08, 0.46)
const BULLETIN_NOTICES =
  'M-0.42 -0.42L-0.18 -0.42L-0.18 -0.12L-0.42 -0.12Z' +
  'M-0.04 -0.46L0.2 -0.46L0.2 -0.16L-0.04 -0.16Z' +
  'M0.28 -0.4L0.48 -0.4L0.48 -0.14L0.28 -0.14Z'
const BULLETIN_PINS = ring(0.03, -0.3, -0.42) + ring(0.03, 0.08, -0.46) + ring(0.03, 0.38, -0.4)

// ── festival stall: a wooden counter under a festive orange canopy strung with
//    a bunting line of gold + red triangle flags. ──
const FESTIVAL_COUNTER = rect(-0.5, 0.34, 1.0, 0.18)
const FESTIVAL_POSTS = 'M-0.5 0.55L-0.5 -0.1M0.5 0.55L0.5 -0.1'
const FESTIVAL_CANOPY = 'M-0.62 -0.1L-0.5 -0.4L0.5 -0.4L0.62 -0.1Z'
const FESTIVAL_BUNTING_LINE = 'M-0.66 -0.36Q0 -0.22 0.66 -0.36'
const FESTIVAL_BUNTING_GOLD =
  'M-0.5 -0.32L-0.38 -0.34L-0.44 -0.2Z' +
  'M-0.02 -0.27L0.1 -0.28L0.04 -0.14Z' +
  'M0.4 -0.32L0.52 -0.34L0.46 -0.2Z'
const FESTIVAL_BUNTING_RED =
  'M-0.26 -0.29L-0.14 -0.3L-0.2 -0.16Z' +
  'M0.16 -0.29L0.28 -0.3L0.22 -0.16Z'

// ── fountain: top-down circular stone basin, blue water pool, concentric ripple
//    rings, central spout column + water crown. ──
const FOUNTAIN_SHADOW = ring(0.76)
const FOUNTAIN_BASIN = ring(0.72)
const FOUNTAIN_WATER = ring(0.5)
const FOUNTAIN_RIPPLES = ring(0.34) + ring(0.2)
const FOUNTAIN_SPOUT = ring(0.12)
const FOUNTAIN_CROWN = ring(0.065)

// ── trash can: a tapered galvanized bin with rib lines and a domed lid + knob. ──
const TRASHCAN_BODY = 'M-0.34 0.48L-0.4 -0.24L0.4 -0.24L0.34 0.48Z'
const TRASHCAN_RIBS = 'M-0.22 -0.16L-0.26 0.42M0 -0.18L0 0.44M0.22 -0.16L0.26 0.42'
const TRASHCAN_LID = 'M-0.44 -0.24A0.44 0.13 0 1 0 0.44 -0.24A0.44 0.13 0 1 0 -0.44 -0.24Z'
const TRASHCAN_KNOB = ring(0.06, 0, -0.32)

// ── street lamp: an iron post with a footed base + collar arm and a trapezoid
//    lantern head (base = unlit iron, companion = glowing glass + halo). ──
const STREETLAMP_SHADOW = 'M-0.16 0.6A0.16 0.06 0 1 0 0.16 0.6A0.16 0.06 0 1 0 -0.16 0.6Z'
const STREETLAMP_POST =
  'M-0.06 0.58L-0.045 -0.16L0.045 -0.16L0.06 0.58Z' +
  'M-0.17 0.6L0.17 0.6L0.12 0.48L-0.12 0.48Z'
const STREETLAMP_ARM = 'M-0.17 -0.16L0.17 -0.16'
const STREETLAMP_LANTERN = 'M-0.17 -0.16L-0.13 -0.56L0.13 -0.56L0.17 -0.16Z'
const STREETLAMP_CAP = 'M-0.1 -0.56L0.1 -0.56L0 -0.7Z'

export const TOWN: PropDef[] = [
  // MAILBOX — post-box with the red flag down (base/read state).
  {
    id: 'mailbox', size: 0.95, wonk: 0.03,
    paths: [
      { d: MAILBOX_SHADOW, fill: 'shadow', opacity: 0.25 },
      { d: MAILBOX_POST, fill: 'woodDeep' },
      ...cutout(MAILBOX_BODY, 'rockDeep', 'rock'),
      { d: MAILBOX_SLOT, stroke: 'ink', sw: 0.055, opacity: 0.6 },
      { d: MAILBOX_FLAGPOLE, stroke: 'lampPost', sw: 0.045 },
      { d: MAILBOX_FLAG_DOWN, fill: 'fruitRed' },
    ],
    kinds: ['stump', 'rock'], themes: ['city', 'farm', 'plains'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.2,
    gameplay: ['read'], tags: ['social'],
  },
  // MAILBOX_FLAG — state pair: same box, flag RAISED (mail waiting).
  {
    id: 'mailbox_flag', size: 0.95, wonk: 0.03,
    paths: [
      { d: MAILBOX_SHADOW, fill: 'shadow', opacity: 0.25 },
      { d: MAILBOX_POST, fill: 'woodDeep' },
      ...cutout(MAILBOX_BODY, 'rockDeep', 'rock'),
      { d: MAILBOX_SLOT, stroke: 'ink', sw: 0.055, opacity: 0.6 },
      { d: MAILBOX_FLAGPOLE, stroke: 'lampPost', sw: 0.045 },
      { d: MAILBOX_FLAG_UP, fill: 'fruitRed' },
    ],
    kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.2,
  },
  // BULLETIN BOARD — plank notice board on posts, pinned notices + quest pins.
  {
    id: 'bulletinboard', size: 1.05, wonk: 0.03,
    paths: [
      { d: BULLETIN_POSTS, stroke: 'woodDeep', sw: 0.1 },
      ...cutout(BULLETIN_BOARD, 'woodDeep', 'wood'),
      { d: BULLETIN_NOTICES, fill: 'cream' },
      { d: BULLETIN_PINS, fill: 'fruitRed' },
    ],
    kinds: ['tree', 'stump'], themes: ['city', 'village', 'farm'], role: 'edge',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.25,
    gameplay: ['read', 'quest'], tags: ['social'],
  },
  // FESTIVAL STALL — counter under a festive canopy strung with bunting flags.
  {
    id: 'festivalstall', size: 1.1, wonk: 0.03,
    paths: [
      { d: FESTIVAL_COUNTER, fill: 'wood' },
      { d: FESTIVAL_POSTS, stroke: 'woodDeep', sw: 0.09 },
      ...cutout(FESTIVAL_CANOPY, 'gourdOrangeDeep', 'gourdOrange'),
      { d: FESTIVAL_BUNTING_LINE, stroke: 'canvas', sw: 0.03 },
      { d: FESTIVAL_BUNTING_GOLD, fill: 'petalGold' },
      { d: FESTIVAL_BUNTING_RED, fill: 'fruitRed' },
    ],
    kinds: ['stump', 'tree'], themes: ['city', 'plains'], role: 'accent',
    rotate: 'upright', weight: 0.25, pass: 'solid', footprint: 0.35,
    tags: ['social', 'seasonal'],
  },
  // FOUNTAIN — top-down stone basin with a water pool, ripples and a spout.
  {
    id: 'fountain', size: 1.1, wonk: 0.03,
    paths: [
      { d: FOUNTAIN_SHADOW, fill: 'shadow', opacity: 0.18 },
      ...cutout(FOUNTAIN_BASIN, 'rockDeep', 'rock'),
      { d: FOUNTAIN_WATER, fill: 'fountainWater' },
      { d: FOUNTAIN_RIPPLES, stroke: 'cream', sw: 0.028, opacity: 0.28 },
      { d: FOUNTAIN_SPOUT, fill: 'rock' },
      { d: FOUNTAIN_CROWN, fill: 'cream', opacity: 0.7 },
    ],
    kinds: ['rock', 'stump'], themes: ['city', 'plains'], role: 'accent',
    rotate: 'free', weight: 0.2, pass: 'solid', footprint: 0.5,
    layer: 'ground', anim: true, tags: ['water-surface', 'anim'],
  },
  // TRASH CAN — tapered galvanized bin with ribs and a domed lid.
  {
    id: 'trashcan', size: 0.9, wonk: 0.03,
    paths: [
      ...cutout(TRASHCAN_BODY, 'rockDeep', 'rock'),
      { d: TRASHCAN_RIBS, stroke: 'ink', sw: 0.035, opacity: 0.4 },
      ...cutout(TRASHCAN_LID, 'rockDeep', 'rock'),
      { d: TRASHCAN_KNOB, fill: 'ink' },
    ],
    kinds: ['stump', 'rock'], themes: ['city'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.2,
    gameplay: ['search'], tags: ['social'],
  },
  // STREET LAMP — iron post + lantern, UNLIT (base state).
  {
    id: 'streetlamp', size: 1.1, wonk: 0.03,
    paths: [
      { d: STREETLAMP_SHADOW, fill: 'shadow', opacity: 0.2 },
      { d: STREETLAMP_POST, fill: 'lampPost' },
      { d: STREETLAMP_ARM, stroke: 'lampPost', sw: 0.06 },
      ...cutout(STREETLAMP_LANTERN, 'lampPost', 'rock'),
      { d: STREETLAMP_CAP, fill: 'lampPost' },
    ],
    kinds: ['rock', 'stump'], themes: ['city'], role: 'accent',
    rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.18,
    tall: true, tags: ['light'],
  },
  // STREETLAMP_LIT — state pair: lantern glass glowing + warm halo.
  {
    id: 'streetlamp_lit', size: 1.1, wonk: 0.03,
    paths: [
      { d: glowHalo(0.42, 0, -0.36), fill: 'lampGlow', opacity: 0.3 },
      { d: STREETLAMP_SHADOW, fill: 'shadow', opacity: 0.2 },
      { d: STREETLAMP_POST, fill: 'lampPost' },
      { d: STREETLAMP_ARM, stroke: 'lampPost', sw: 0.06 },
      { d: STREETLAMP_LANTERN, fill: 'lampGlow' },
      { d: STREETLAMP_LANTERN, stroke: 'lampPost', sw: 0.045 },
      { d: STREETLAMP_CAP, fill: 'lampPost' },
    ],
    kinds: [], tags: ['interactable', 'light'], pass: 'solid', footprint: 0.18,
    light: { color: 'lampGlow', radius: 2 },
  },
]
