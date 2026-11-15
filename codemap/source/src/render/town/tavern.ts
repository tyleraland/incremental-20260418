// ── Town: Tavern (hitching post · lantern hook · torch bracket) + the tavern 'set' ──
//
// Bucket: PLAZA (city/village fixtures). Builder: fill COMPLETE PropDefs — flow
// into TERRAIN_PROPS + listAssets with NO shared-file edits; props.ts spreads
// into `plaza`, then variants(). Geometry from './kit' only. Full guide:
// scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   hitchingpost          role '-' → role:'field'
//   lanternhook/torchbracket role '-' → role:'edge', layer:'wall' (wall-mounted)
//
// LAYER: lanternhook/torchbracket → layer:'wall'; hitchingpost ground.
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   alebarrel    → DEFER to existing `keg` (both are barrels; `cask` also exists). Skip.
//   tavernbench  → DEFER to existing `bench` (orchestrator adds sit gameplay + village). Skip.
//   tavertable   → typo for taverntable; DEFER to existing `table`/`table_var`. Skip.
//   notice_board → DEFER to existing `bulletinboard` (orchestrator adds quest gameplay). Skip.
//   hitchingpost → FREE (no existing analogue).
//   torchbracket → FREE (wall-mounted torch; no existing `torch` prop). LIGHT +
//                  state `torchbracket_lit` (NOT bare `torch_lit` — unique-state rule).
//   lanternhook  → FREE. LIGHT + state `lanternhook_lit` (NOT bare `lantern_lit`).
//
// The `tavern` 'set' row is a SCATTER_SETS prefab (NOT a prop): reuses the
// structures group's `housewall`/`roofgable`/`door_arched`/`innsign` + existing
// `keg`/`bench` + this group's `hitchingpost`. Orchestrator wires it post-build.

import type { PropDef } from '@/render/props'
import { cutout, rect, ring, glowHalo } from './kit'

// ── hitchingpost: a low wooden hitching rail seen from above — a two-tone plank
// bar on two round post-caps, a coiled tie-rope hanging off it. Distinct wide
// horizontal silhouette (vs the upright torch/lantern fixtures). ──
const HP_RAIL = rect(-0.66, -0.14, 1.32, 0.26)
const HP_CAPS = ring(0.17, -0.62, 0) + ring(0.17, 0.62, 0)
const HP_CAPS_LIT = ring(0.08, -0.62, 0) + ring(0.08, 0.62, 0)
const HP_ROPE = ring(0.15, 0.14, 0.34)

// ── torchbracket: a wall-mounted pitch torch — an iron backplate + collar clamp,
// a tapered wood haft, a charred (unlit) cloth head. Lit state swaps the head for
// a two-stage flame over an ember halo. ──
const TB_PLATE = rect(-0.2, 0.5, 0.4, 0.22)
const TB_HAFT = rect(-0.08, -0.34, 0.16, 0.92)
const TB_COLLAR = ring(0.15, 0, 0.34)
const TB_HEAD = 'M0 -0.74C0.16 -0.62 0.16 -0.44 0 -0.36C-0.16 -0.44 -0.16 -0.62 0 -0.74Z'
const TB_FLAME_OUT = 'M0 -0.84C0.18 -0.6 0.16 -0.42 0 -0.34C-0.16 -0.42 -0.18 -0.6 0 -0.84Z'
const TB_FLAME_IN = 'M0 -0.72C0.1 -0.56 0.09 -0.44 0 -0.38C-0.09 -0.44 -0.1 -0.56 0 -0.72Z'

// ── lanternhook: a wall bracket-arm from the left carrying a hanging iron lantern
// (dark glass, unlit). Lit state lights the glass warm over a lampGlow halo. ──
const LH_PLATE = rect(-0.54, -0.72, 0.16, 0.26)
const LH_ARM = 'M-0.44 -0.6L-0.04 -0.5L0 -0.4'
const LH_CAP = rect(-0.16, -0.44, 0.32, 0.1)
const LH_BODY = 'M-0.22 -0.34L0.22 -0.34L0.28 0.22L0 0.36L-0.28 0.22Z'
const LH_GLASS = 'M-0.14 -0.26L0.14 -0.26L0.19 0.16L0 0.28L-0.19 0.16Z'
const LH_CORE = 'M-0.07 -0.16L0.07 -0.16L0.1 0.08L0 0.16L-0.1 0.08Z'

export const TAVERN: PropDef[] = [
  // hitching rail (city/village/farm yard fixture)
  {
    id: 'hitchingpost', size: 1, wonk: 0.03,
    paths: [
      { d: rect(-0.6, 0.24, 1.2, 0.16), fill: 'shadow', opacity: 0.18 },
      ...cutout(HP_RAIL, 'woodDeep', 'wood'),
      { d: 'M-0.6 0L0.6 0', stroke: 'ink', sw: 0.03, opacity: 0.4 },
      { d: HP_CAPS, fill: 'wood' },
      { d: HP_CAPS_LIT, fill: 'woodLight' },
      { d: HP_ROPE, stroke: 'canvas', sw: 0.05, opacity: 0.9 },
    ],
    kinds: ['tree', 'stump'], themes: ['city', 'village', 'farm'], role: 'field',
    rotate: 'upright', weight: 0.5, pass: 'solid', footprint: 0.3, layer: 'ground',
    tags: ['field', 'post'], anchor: ['path-edge'],
  },

  // wall torch bracket (unlit)
  {
    id: 'torchbracket', size: 0.85, wonk: 0.03,
    paths: [
      { d: TB_PLATE, fill: 'lampPost' },
      ...cutout(TB_HAFT, 'woodDeep', 'wood'),
      { d: TB_COLLAR, stroke: 'lampPost', sw: 0.08 },
      ...cutout(TB_HEAD, 'ink', 'bloodDry'),
    ],
    kinds: ['tree', 'flower'], themes: ['city', 'village', 'dungeon'], role: 'edge',
    rotate: 'upright', weight: 0.35, pass: 'walkable', footprint: 0.14, layer: 'wall',
    tags: ['light'],
    anchor: ['wall'], orient: 'face-open', series: { along: 'wall', spacing: [3, 6] },
    sim: { statePair: 'torchbracket_lit' },
  },
  // torchbracket_lit — state pair: same haft + collar, flame head over an ember halo.
  {
    id: 'torchbracket_lit', size: 0.85, wonk: 0.03,
    paths: [
      { d: glowHalo(0.34, 0, -0.56), fill: 'ember', opacity: 0.35 },
      { d: TB_PLATE, fill: 'lampPost' },
      ...cutout(TB_HAFT, 'woodDeep', 'wood'),
      { d: TB_COLLAR, stroke: 'lampPost', sw: 0.08 },
      { d: TB_FLAME_OUT, fill: 'emberDeep' },
      { d: TB_FLAME_IN, fill: 'ember' },
      { d: ring(0.05, 0, -0.52), fill: 'cream' },
    ],
    kinds: [], pass: 'walkable', footprint: 0.14,
    light: { color: 'ember', radius: 2 }, anim: true,
    tags: ['interactable', 'light', 'anim'],
  },

  // wall lantern hook (unlit)
  {
    id: 'lanternhook', size: 0.8, wonk: 0.03,
    paths: [
      { d: LH_PLATE, fill: 'lampPost' },
      { d: LH_ARM, stroke: 'lampPost', sw: 0.08 },
      ...cutout(LH_BODY, 'lampPost', 'rock'),
      { d: LH_GLASS, fill: 'ink' },
      { d: LH_CAP, fill: 'lampPost' },
    ],
    kinds: ['rock', 'flower'], themes: ['city', 'village'], role: 'edge',
    rotate: 'upright', weight: 0.35, pass: 'walkable', footprint: 0.14, layer: 'wall',
    tags: ['light'],
    anchor: ['wall'], orient: 'face-open', series: { along: 'wall', spacing: [3, 6] },
    sim: { statePair: 'lanternhook_lit' },
  },
  // lanternhook_lit — state pair: same frame, glass lit warm over a lampGlow halo.
  {
    id: 'lanternhook_lit', size: 0.8, wonk: 0.03,
    paths: [
      { d: glowHalo(0.36, 0, -0.02), fill: 'lampGlow', opacity: 0.35 },
      { d: LH_PLATE, fill: 'lampPost' },
      { d: LH_ARM, stroke: 'lampPost', sw: 0.08 },
      ...cutout(LH_BODY, 'lampPost', 'rock'),
      { d: LH_GLASS, fill: 'lampGlow' },
      { d: LH_CORE, fill: 'cream' },
      { d: LH_CAP, fill: 'lampPost' },
    ],
    kinds: [], pass: 'walkable', footprint: 0.14,
    light: { color: 'lampGlow', radius: 2 },
    tags: ['interactable', 'light', 'glow'],
  },
]
