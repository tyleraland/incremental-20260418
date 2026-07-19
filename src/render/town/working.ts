// ── Town: Working life (well-sweep/bucket · woodpile · chopping block · handcart · laundry · pigpen · hay wain) ──
//
// Bucket: GRASS (farm/village working-life — where farm props live, wave-2 W2.5).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   wellsweep/wellbucket  role draw → gameplay:['draw'], role:'accent'
//   woodpile              role gather → gameplay:['gather'], role:'field'
//   choppingblock/handcart/hay_wain  role '-' → role:'field'
//   laundryline           role '-' → role:'accent', layer:'canopy'
//   pigpen                role '-' → role:'accent' (enclosure), tags fence,farm
//
// LAYER: laundryline → layer:'canopy'; rest ground.
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   smithyforge    → DEFER to existing `forge`. Avoids a 2nd forge; NO `forge_lit`
//                    state (would clash with forge/forge_cold polarity). Skip it.
//   blacksmithanvil→ DEFER to existing `anvil`. Skip.
//   troughwater    → DEFER to existing `wateringtrough`. Skip.
//   beehiveskep    → DEFER to existing `beehive`/`beehouse`. Skip.
//   wellsweep      → FREE (distinct shadoof / counterweighted sweep-arm well).
//   wellbucket     → FREE (windlass-and-bucket well; distinct read from `well`).
//   woodpile/choppingblock/handcart/laundryline/pigpen/hay_wain → FREE.
//
// The `mill_water`/`mill_wind`/`dovecote` 'set' rows are SCATTER_SETS prefabs
// (NOT props). This group owns their brand-new base members:
//   millbody         — mill house block (mill_water & mill_wind base)
//   waterwheel       — the water-mill wheel; state `waterwheel_turning` (spec `wheel_turning`)
//   windmillsails    — the windmill sail-cross; state `windmillsails_turning` (spec `sails_turning`)
//   dovecotebody     — dovecote tower with pigeon holes
// Anim state ids renamed to `<baseid>_turning` (unique-state rule). Orchestrator
// wires the sets post-build; member lists in the digest.

import type { PropDef } from '@/render/props'
import { cutout, ring, rect, lobeBlob, radialStar } from './kit'

const q = (v: number) => Math.round(v * 1000) / 1000

// n radial line segments r0→r1 at even angles (spokes / paddles / sail arms),
// centred on (cx,cy). Pure trig → deterministic, wonkPathD-safe (no Math.random).
function spokeLines(n: number, r0: number, r1: number, rot = 0, cx = 0, cy = 0): string {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2
    d += `M${q(cx + Math.cos(a) * r0)} ${q(cy + Math.sin(a) * r0)}L${q(cx + Math.cos(a) * r1)} ${q(cy + Math.sin(a) * r1)}`
  }
  return d
}

// A regular grid of small circles (pigeon holes) as ONE multi-subpath.
function holeGrid(cols: number, rows: number, x0: number, y0: number, dx: number, dy: number, r: number): string {
  let d = ''
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) d += ring(r, x0 + col * dx, y0 + row * dy)
  }
  return d
}

// ── well-sweep (shadoof: counterweighted swing-arm well) ──────────────────────
const WS_STONES = ring(0.2, 0.4, 0.52) + ring(0.15, -0.8, -0.5)   // curb + counterweight
const WS_HOLE = ring(0.11, 0.4, 0.52)
const WS_POST = 'M-0.04 0.52L-0.02 -0.08'
const WS_ARM = 'M-0.8 -0.5L0.5 0.22'
const WS_ROPE = 'M0.5 0.24L0.42 0.48'
const WS_BUCKET = rect(0.34, 0.46, 0.16, 0.15)

// ── wood-pile (stacked cordwood) ──────────────────────────────────────────────
const WP_BODY = 'M-0.72 0.34L0.72 0.34L0.66 -0.14Q0 -0.32 -0.66 -0.14Z'
const WP_ENDS = ring(0.14, -0.46, 0.08) + ring(0.14, -0.15, 0.08) + ring(0.14, 0.16, 0.08) +
  ring(0.14, 0.47, 0.08) + ring(0.13, -0.3, -0.16) + ring(0.13, 0.02, -0.16) + ring(0.13, 0.32, -0.16)
const WP_RINGS = ring(0.05, -0.46, 0.08) + ring(0.05, 0.16, 0.08) + ring(0.05, -0.3, -0.16) + ring(0.05, 0.32, -0.16)

// ── chopping block (round stump + embedded axe) ───────────────────────────────
const CB_BLOCK = ring(0.5)
const CB_RINGS = ring(0.34) + ring(0.18)
const CB_AXE_HEAD = 'M-0.02 -0.24L0.24 -0.34L0.3 -0.16L0.05 -0.05Z'
const CB_AXE_HANDLE = 'M0.14 -0.1L0.52 0.42'

// ── handcart (box bed on a wheel, twin handles) ───────────────────────────────
const HC_WHEEL = ring(0.24, -0.12, 0.42)
const HC_HUB = ring(0.07, -0.12, 0.42)
const HC_SPOKES = spokeLines(4, 0.05, 0.22, 0.3, -0.12, 0.42)
const HC_BED = 'M-0.56 -0.24L0.5 -0.24L0.58 0.18L-0.56 0.18Z'
const HC_PLANKS = 'M-0.4 -0.24L-0.34 0.18M-0.14 -0.24L-0.08 0.18M0.12 -0.24L0.18 0.18M0.36 -0.24L0.42 0.18'
const HC_HANDLES = 'M0.5 -0.16L0.9 -0.08M0.5 0.06L0.9 0.14'

// ── laundry line (rope + hanging cloths; overhead drape) ──────────────────────
const LL_POSTS = 'M-0.82 -0.5L-0.82 0.5M0.82 -0.5L0.82 0.5'
const LL_LINE = 'M-0.82 -0.34Q0 -0.18 0.82 -0.34'
const LL_CLOTH1 = rect(-0.58, -0.28, 0.24, 0.42)
const LL_CLOTH2 = rect(-0.13, -0.24, 0.26, 0.46)
const LL_CLOTH3 = rect(0.32, -0.28, 0.24, 0.4)

// ── pig-pen (square post-and-rail enclosure + a lounging pig) ─────────────────
const PP_MUD = 'M-0.62 -0.46Q-0.7 -0.54 -0.62 -0.5L0.62 -0.5Q0.7 -0.5 0.66 -0.42L0.66 0.46Q0.7 0.54 0.62 0.5L-0.62 0.5Q-0.7 0.5 -0.66 0.42Z'
const PP_RAIL_OUT = rect(-0.72, -0.56, 1.44, 1.12)
const PP_RAIL_IN = rect(-0.6, -0.44, 1.2, 0.88)
const PP_POSTS = ring(0.07, -0.72, -0.56) + ring(0.07, 0.72, -0.56) + ring(0.07, 0.72, 0.56) +
  ring(0.07, -0.72, 0.56) + ring(0.06, 0, -0.56) + ring(0.06, 0, 0.56)
const PP_PIG = lobeBlob(6, 0.26, 0.2, 0.12, 0.14)
const PP_SNOUT = ring(0.07, 0.34, 0.14)

// ── hay wain (hay wagon: golden mound on a two-wheel bed) ─────────────────────
const HW_WHEELS = ring(0.16, -0.46, 0.42) + ring(0.16, 0.4, 0.42)
const HW_HUBS = ring(0.06, -0.46, 0.42) + ring(0.06, 0.4, 0.42)
const HW_BED = 'M-0.6 0.36L0.6 0.36L0.52 0L-0.52 0Z'
const HW_HAY = lobeBlob(9, 0.62, 0.5, 0, -0.24)
const HW_STRAW = 'M-0.42 -0.36L-0.48 -0.56M-0.1 -0.5L-0.12 -0.72M0.24 -0.42L0.32 -0.62M0.44 -0.2L0.6 -0.32'

// ── well-bucket (windlass well: drum + crank + bucket) ────────────────────────
const WB_CURB = ring(0.4, 0, 0.3)
const WB_HOLE = ring(0.26, 0, 0.3)
const WB_POSTS = 'M-0.34 0.3L-0.32 -0.34M0.34 0.3L0.32 -0.34'
const WB_DRUM = rect(-0.3, -0.32, 0.6, 0.15)
const WB_CRANK = 'M0.3 -0.24L0.46 -0.24L0.46 -0.1'
const WB_ROPE = 'M0 -0.17L0 0.02'
const WB_BUCKET = rect(-0.1, 0.02, 0.2, 0.17)

// ── mill body (plaster + timber facade block; mill_water/mill_wind base) ──────
const MB_ROOF = 'M-0.68 -0.3L0 -0.66L0.68 -0.3Z'
const MB_WALL = rect(-0.58, -0.3, 1.16, 0.82)
const MB_TIMBERS = 'M-0.58 0.1L0.58 0.1M-0.2 -0.3L-0.2 0.52M0.2 -0.3L0.2 0.52M-0.58 -0.3L-0.2 0.1M0.58 -0.3L0.2 0.1'
const MB_DOOR = rect(-0.14, 0.1, 0.28, 0.42)
const MB_WINDOW = rect(0.3, -0.16, 0.2, 0.2)

// ── water wheel (spoked mill wheel + splash) ──────────────────────────────────
const WW_SPLASH = lobeBlob(6, 0.34, 0.24, 0.02, 0.66)
const WW_TIRE = ring(0.6)
const WW_TIRE_IN = ring(0.44)
const WW_SPOKES = spokeLines(4, 0.1, 0.58)
const WW_PADDLES = spokeLines(8, 0.44, 0.68)
const WW_HUB = ring(0.12)
// turning: spokes/paddles rotated a half-step + motion arcs
const WWT_SPOKES = spokeLines(4, 0.1, 0.58, Math.PI / 4)
const WWT_PADDLES = spokeLines(8, 0.44, 0.68, Math.PI / 8)
const WWT_MOTION = 'M0.5 -0.32A0.6 0.6 0 0 1 0.6 0.02M-0.5 0.32A0.6 0.6 0 0 1 -0.6 -0.02'

// ── windmill sails (4-blade cross) ────────────────────────────────────────────
const WSA_SAILS = radialStar(4, 0.84, 0.15, Math.PI / 4)
const WSA_ARMS = spokeLines(4, 0.05, 0.8, Math.PI / 4)
const WSA_LATTICE = ring(0.5)
const WSA_HUB = ring(0.13)
// turning: sails swung a half-step + motion arcs
const WSAT_SAILS = radialStar(4, 0.84, 0.15, Math.PI / 4 + 0.5)
const WSAT_ARMS = spokeLines(4, 0.05, 0.8, Math.PI / 4 + 0.5)
const WSAT_MOTION = 'M0.62 0.36A0.72 0.72 0 0 1 0.36 0.62M-0.62 -0.36A0.72 0.72 0 0 1 -0.36 -0.62'

// ── dovecote body (pigeon tower + hole grid + roost roof) ─────────────────────
const DC_ROOF = 'M-0.5 -0.36L0 -0.72L0.5 -0.36Z'
const DC_TOWER = 'M-0.38 0.56L-0.34 -0.36L0.34 -0.36L0.38 0.56Z'
const DC_LEDGES = 'M-0.36 -0.04L0.36 -0.04M-0.37 0.24L0.37 0.24'
const DC_HOLES = holeGrid(3, 2, -0.22, -0.24, 0.22, 0.28, 0.075)
const DC_DOVE = ring(0.06, 0.0, -0.04)

export const WORKING: PropDef[] = [
  // WELL-SWEEP: a shadoof — a long counterweighted sweep-arm pivoting over a low
  // stone curb, rope-and-bucket dipping toward the mouth. Draw water.
  {
    id: 'wellsweep', size: 1.1, wonk: 0.035,
    paths: [
      ...cutout(WS_STONES, 'rockDeep', 'rock'),
      { d: WS_HOLE, fill: 'ink' },
      { d: WS_POST, stroke: 'woodDeep', sw: 0.08 },
      { d: WS_ARM, stroke: 'wood', sw: 0.07 },
      { d: WS_ROPE, stroke: 'woodDeep', sw: 0.03 },
      ...cutout(WS_BUCKET, 'woodDeep', 'wood'),
    ],
    kinds: ['tree', 'stump'], themes: ['village', 'farm'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.4, tall: true, maxPerChunk: 1,
    gameplay: ['draw'], tags: ['water', 'workstation'],
  },
  // WOODPILE: a low stack of split cordwood, round log-ends facing out, a couple
  // scored growth rings. Gatherable fuel.
  {
    id: 'woodpile', size: 0.95, wonk: 0.04,
    paths: [
      ...cutout(WP_BODY, 'woodDeep', 'wood'),
      { d: WP_ENDS, fill: 'woodLight' },
      { d: WP_RINGS, stroke: 'woodDeep', sw: 0.03, opacity: 0.6 },
    ],
    kinds: ['stump'], themes: ['village', 'farm', 'city'], role: 'field', rotate: 'free',
    weight: 0.6, pass: 'solid', footprint: 0.32, gameplay: ['gather'], tags: ['field'],
  },
  // CHOPPING BLOCK: a round stump block with concentric growth rings and a
  // splitting-axe buried in the top, handle cocked up.
  {
    id: 'choppingblock', size: 0.75, wonk: 0.03,
    paths: [
      ...cutout(CB_BLOCK, 'woodDeep', 'wood'),
      { d: CB_RINGS, stroke: 'woodDeep', sw: 0.035, opacity: 0.55 },
      { d: CB_AXE_HANDLE, stroke: 'woodLight', sw: 0.055 },
      ...cutout(CB_AXE_HEAD, 'rockDeep', 'steel'),
    ],
    kinds: ['stump', 'rock'], themes: ['village', 'farm'], role: 'field', rotate: 'free',
    weight: 0.45, pass: 'solid', footprint: 0.28, tags: ['field'],
  },
  // HANDCART: a plank-bed handcart on one big spoked wheel, twin push-handles out
  // the back.
  {
    id: 'handcart', size: 1, wonk: 0.03,
    paths: [
      ...cutout(HC_WHEEL, 'woodDeep', 'wood'),
      { d: HC_SPOKES, stroke: 'woodDeep', sw: 0.04 },
      { d: HC_HUB, fill: 'woodLight' },
      ...cutout(HC_BED, 'woodDeep', 'wood'),
      { d: HC_PLANKS, stroke: 'ink', sw: 0.03, opacity: 0.5 },
      { d: HC_HANDLES, stroke: 'wood', sw: 0.055 },
    ],
    kinds: ['stump', 'rock'], themes: ['village', 'city', 'farm'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'solid', footprint: 0.35, tags: ['field'],
  },
  // LAUNDRY LINE: a sagging rope strung between two posts, three cloths pegged out
  // to dry — an overhead drape that flutters.
  {
    id: 'laundryline', size: 1.1, wonk: 0.03, layer: 'canopy',
    paths: [
      { d: LL_POSTS, stroke: 'woodDeep', sw: 0.07 },
      { d: LL_LINE, stroke: 'ink', sw: 0.03 },
      ...cutout(LL_CLOTH1, 'canvas', 'cream'),
      ...cutout(LL_CLOTH2, 'bannerBlueDk', 'bannerBlue'),
      ...cutout(LL_CLOTH3, 'canvas', 'cream'),
    ],
    kinds: ['reed', 'flower'], themes: ['village', 'city'], role: 'accent', rotate: 'upright',
    weight: 0.3, pass: 'walkable', footprint: 0.3, anim: true, tags: ['cloth', 'anim'],
  },
  // PIGPEN: a square post-and-rail enclosure over churned mud, corner and mid
  // posts, a pink pig lounging inside. An enclosure edge.
  {
    id: 'pigpen', size: 1.15, wonk: 0.03, rotate: 'free',
    paths: [
      { d: PP_MUD, fill: 'dirtPath', opacity: 0.85 },
      { d: PP_RAIL_OUT, stroke: 'woodDeep', sw: 0.06 },
      { d: PP_RAIL_IN, stroke: 'wood', sw: 0.045, opacity: 0.8 },
      { d: PP_POSTS, fill: 'woodDeep' },
      ...cutout(PP_PIG, 'bloom', 'blossom'),
      { d: PP_SNOUT, fill: 'bloom' },
    ],
    kinds: ['tree', 'stump'], themes: ['village', 'farm'], role: 'accent',
    weight: 0.25, pass: 'solid', footprint: 0.5, maxPerChunk: 1, tags: ['fence', 'farm'],
  },
  // HAY WAIN: a hay wagon — a heaped golden mound bound on a two-wheel plank bed,
  // loose straw whiskers escaping the top.
  {
    id: 'hay_wain', size: 1.15, wonk: 0.035,
    paths: [
      ...cutout(HW_WHEELS, 'woodDeep', 'wood'),
      { d: HW_HUBS, fill: 'woodLight' },
      ...cutout(HW_BED, 'woodDeep', 'wood'),
      ...cutout(HW_HAY, 'th4', 'th0'),
      { d: HW_STRAW, stroke: 'thatchInk', sw: 0.03, opacity: 0.6 },
    ],
    kinds: ['stump'], themes: ['village', 'farm'], role: 'field', rotate: 'upright',
    weight: 0.4, pass: 'solid', footprint: 0.4, tags: ['field'],
  },
  // WELL-BUCKET: a windlass well — a stone curb with a hand-cranked rope drum on
  // two uprights, bucket hanging into the mouth. Draw water.
  {
    id: 'wellbucket', size: 1.05, wonk: 0.03,
    paths: [
      ...cutout(WB_CURB, 'rockDeep', 'rock'),
      { d: WB_HOLE, fill: 'ink' },
      { d: WB_POSTS, stroke: 'woodDeep', sw: 0.06 },
      ...cutout(WB_DRUM, 'woodDeep', 'wood'),
      { d: WB_CRANK, stroke: 'wood', sw: 0.05 },
      { d: WB_ROPE, stroke: 'ink', sw: 0.03 },
      ...cutout(WB_BUCKET, 'woodDeep', 'wood'),
    ],
    kinds: ['stump', 'rock'], themes: ['village', 'farm'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.35, maxPerChunk: 1,
    gameplay: ['draw'], tags: ['water', 'workstation'],
  },

  // ── set-member base props (mill_water / mill_wind / dovecote) ──
  // MILL BODY: a squat mill house — plaster facade cross-braced with dark timber
  // under a gable, door and window punched in. Base of both mills.
  {
    id: 'millbody', size: 1.15, wonk: 0.03,
    paths: [
      ...cutout(MB_ROOF, 'roofTileDark', 'roofTile'),
      ...cutout(MB_WALL, 'plasterDark', 'plaster'),
      { d: MB_TIMBERS, stroke: 'timberFrame', sw: 0.05, opacity: 0.85 },
      ...cutout(MB_DOOR, 'woodDeep', 'wood'),
      { d: MB_WINDOW, fill: 'ink' },
    ],
    kinds: ['tree', 'rock'], themes: ['village', 'river', 'plains'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.55, tall: true, maxPerChunk: 1, tags: ['structure'],
  },
  // WATER WHEEL: a spoked mill wheel with paddle boards on the rim, throwing a
  // splash at the base. Water-mill member; flips to the turning state.
  {
    id: 'waterwheel', size: 1.15, wonk: 0.03,
    paths: [
      { d: WW_SPLASH, fill: 'waterShallow', opacity: 0.85 },
      { d: WW_TIRE, stroke: 'wood', sw: 0.1 },
      { d: WW_TIRE_IN, stroke: 'woodDeep', sw: 0.06 },
      { d: WW_PADDLES, stroke: 'woodDeep', sw: 0.09 },
      { d: WW_SPOKES, stroke: 'wood', sw: 0.05 },
      ...cutout(WW_HUB, 'woodDeep', 'wood'),
    ],
    kinds: ['rock', 'stump'], themes: ['village', 'river'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.5, tall: true, maxPerChunk: 1,
    anim: true, tags: ['structure', 'anim'],
  },
  // WATER WHEEL (turning): the same wheel mid-spin — spokes swung a half-step,
  // motion arcs streaking the rim, splash kicked higher. State pair.
  {
    id: 'waterwheel_turning', size: 1.15, wonk: 0.03,
    paths: [
      { d: WW_SPLASH, fill: 'waterShallow', opacity: 0.9 },
      { d: 'M-0.14 0.5A0.3 0.3 0 0 0 0.18 0.5', stroke: 'waterHi', sw: 0.04, opacity: 0.6 },
      { d: WW_TIRE, stroke: 'wood', sw: 0.1 },
      { d: WW_TIRE_IN, stroke: 'woodDeep', sw: 0.06 },
      { d: WWT_PADDLES, stroke: 'woodDeep', sw: 0.09 },
      { d: WWT_SPOKES, stroke: 'wood', sw: 0.05 },
      { d: WWT_MOTION, stroke: 'woodLight', sw: 0.03, opacity: 0.5 },
      ...cutout(WW_HUB, 'woodDeep', 'wood'),
    ],
    kinds: [], pass: 'solid', footprint: 0.5, anim: true, tags: ['interactable', 'anim'],
  },
  // WINDMILL SAILS: a four-blade sail-cross — cream cloth blades on timber arms
  // over a hub, lattice ring binding them. Windmill member; flips to turning.
  {
    id: 'windmillsails', size: 1.2, wonk: 0.03,
    paths: [
      ...cutout(WSA_SAILS, 'canvas', 'cream'),
      { d: WSA_LATTICE, stroke: 'woodDeep', sw: 0.03, opacity: 0.55 },
      { d: WSA_ARMS, stroke: 'woodDeep', sw: 0.05 },
      ...cutout(WSA_HUB, 'woodDeep', 'wood'),
    ],
    kinds: ['tree', 'stump'], themes: ['village', 'plains'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.5, tall: true, maxPerChunk: 1,
    anim: true, tags: ['structure', 'anim'],
  },
  // WINDMILL SAILS (turning): the cross swung a half-step with motion arcs
  // trailing the blade tips. State pair.
  {
    id: 'windmillsails_turning', size: 1.2, wonk: 0.03,
    paths: [
      ...cutout(WSAT_SAILS, 'canvas', 'cream'),
      { d: WSA_LATTICE, stroke: 'woodDeep', sw: 0.03, opacity: 0.55 },
      { d: WSAT_ARMS, stroke: 'woodDeep', sw: 0.05 },
      { d: WSAT_MOTION, stroke: 'woodLight', sw: 0.03, opacity: 0.5 },
      ...cutout(WSA_HUB, 'woodDeep', 'wood'),
    ],
    kinds: [], pass: 'solid', footprint: 0.5, anim: true, tags: ['interactable', 'anim'],
  },
  // DOVECOTE BODY: a tapered pigeon tower — plaster shaft pocked with a grid of
  // roost holes, landing ledges, a perched dove, capped by a peaked roof.
  {
    id: 'dovecotebody', size: 1.1, wonk: 0.03,
    paths: [
      ...cutout(DC_ROOF, 'roofTileDark', 'roofTile'),
      ...cutout(DC_TOWER, 'plasterDark', 'plaster'),
      { d: DC_LEDGES, stroke: 'woodDeep', sw: 0.04, opacity: 0.7 },
      { d: DC_HOLES, fill: 'ink' },
      { d: DC_DOVE, fill: 'cream' },
    ],
    kinds: ['tree', 'stump'], themes: ['village', 'farm'], role: 'accent', rotate: 'upright',
    weight: 0.2, pass: 'solid', footprint: 0.4, tall: true, maxPerChunk: 1, tags: ['structure'],
  },
]
