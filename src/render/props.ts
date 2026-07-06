import type { Biome } from '@/render/appearance'
import type { ScatterKind } from '@/mapgen'
import type { PaperRole } from '@/render/palette'
import { hashString, wonkPathD, blobPath, type Pt } from '@/render/authoring'

// ── Prop assets as data ──────────────────────────────────────────────────────
//
// The paper language's scatter-prop registry (asset-pipeline step 3 — see
// src/render/CLAUDE.md for the full authoring guide). A prop is DATA, not JSX:
// 1–3 flat paths in a ~[-1,1] unit box, y-down (svg orientation), colored by
// palette ROLE — so assets are lint-able (Palette.test.tsx), batch-generable,
// and importable (scripts/import-svg.mjs), while the runtime (terrain.tsx and
// the ?workshop=1 authoring page) stays a dumb renderer.
//
// `lit: true` marks the two-tone top copy: the RENDERER applies the standard
// cutout nudge (up-left — one light direction everywhere), so authors never
// hand-place the offset. Prefer `cutout()` below over writing the pair by hand.

export interface PropPath {
  d: string            // path data in the unit box (y down)
  fill?: PaperRole     // palette role; absent → 'none' (stroke-only art)
  stroke?: PaperRole
  sw?: number          // stroke width, unit-box units (≈0.06–0.16)
  opacity?: number
  lit?: boolean        // the auto-nudged two-tone top copy
}

export interface PropDef {
  id: string
  size: number         // scale multiplier vs the placement's base (≈0.7–1.2)
  paths: PropPath[]
  // variant-generation amplitude override (unit-box units). The default ±0.07
  // suits chunky silhouettes; props with fine registered detail (a skull's eye
  // sockets) want a gentler re-cut. Undefined → the default.
  wonk?: number
  // ── discoverable asset metadata (see assets.ts / render/CLAUDE.md) ──
  // Which mapgen ScatterKind(s) this prop can stand in for. Spec-driven maps
  // place scatter by kind; the placer spreads a kind across ALL props tagged
  // with it, so a prop with no matching kind never appears on a generated map.
  // Empty/absent = not placed by scatter (e.g. `banner`/`lamppost`, placed by
  // the plaza decor ring). Stamped from PROP_META below; carried onto variants.
  kinds?: ScatterKind[]
  // True once an asset is a PLAYER choice (a cosmetic they pick), not just
  // procedural decor. Default false; the catalog + a future picker read it.
  playerSelectable?: boolean
  // Freeform labels for gallery grouping / search / procgen filters.
  tags?: string[]
}

// The standard two-tone cutout: base silhouette + lit top copy. THE way to give
// a shape the paper depth read — the offset itself lives in the renderer.
export function cutout(d: string, base: PaperRole, lit: PaperRole): PropPath[] {
  return [{ d, fill: base }, { d, fill: lit, lit: true }]
}

// Seeded variant family (asset-pipeline step 7 — variant generation): one
// authored archetype → `n` re-cut siblings via `wonkPathD`, so per-biome
// density is a multiplier, not art time. Seeded by the archetype id (stable
// across builds, byte-identical screenshots); a cutout pair's two identical
// `d` strings share the seed and stay in sync. Variants keep the archetype's
// roles/strokes, so the palette contract holds by construction.
export function variants(def: PropDef, n: number, amp = def.wonk ?? 0.07): PropDef[] {
  const base = hashString(def.id)
  return Array.from({ length: n }, (_, i) => ({
    id: `${def.id}~${i + 1}`,
    size: def.size,
    paths: def.paths.map((p) => ({ ...p, d: wonkPathD(p.d, base + (i + 1) * 7919, amp) })),
    kinds: def.kinds,
    playerSelectable: def.playerSelectable,
    tags: def.tags,
  }))
}

// Per-prop discoverable metadata, co-located so the PropDef path literals stay
// terse. `kinds` = the mapgen scatter kinds this prop can fill (see PropDef);
// props with no entry get an empty kinds set and are scatter-invisible on
// generated maps (fine for decor-ring-only assets). Stamped onto each base def
// (and its variants) by withVariants.
const PROP_META: Record<string, Pick<PropDef, 'kinds' | 'playerSelectable' | 'tags'>> = {
  // grass
  tuft:     { kinds: ['bush', 'flower'] },
  bush:     { kinds: ['tree', 'bush'] },
  pebble:   { kinds: ['rock'] },
  bloom:    { kinds: ['flower'] },
  stump:    { kinds: ['stump'] },
  mushroom: { kinds: ['flower', 'bush'] },
  reeds:    { kinds: ['reed', 'bush'] },
  log:      { kinds: ['stump'] },
  // forest (from the inked top-down forest sheet)
  canopy:   { kinds: ['tree'] },
  fern:     { kinds: ['bush', 'flower'] },
  boulder:  { kinds: ['rock'] },
  flowers:  { kinds: ['flower'] },
  // stone
  rubble:   { kinds: ['stump', 'rock'] },
  crack:    { kinds: ['reed', 'rock'] },
  shard:    { kinds: ['rock'] },
  bone:     { kinds: ['flower'] },
  pillar:   { kinds: ['tree', 'stump'] },
  skull:    { kinds: ['flower', 'rock'] },
  spikes:   { kinds: ['tree'] },
  moss:     { kinds: ['bush'] },
  // plaza (market clutter fills the generic ground kinds the city recipe emits)
  crate:    { kinds: ['stump'] },
  barrel:   { kinds: ['stump', 'rock'] },
  sack:     { kinds: ['rock', 'stump'] },
  wheel:    { kinds: ['stump'] },
  pot:      { kinds: ['bush', 'flower'] },
  signpost: { kinds: ['tree'] },
  coil:     { kinds: ['reed', 'rock'] },
  conifer:  { kinds: ['tree'] },
  // decor-ring assets: placed by the plaza landmark ring, not scatter
  lamppost: { kinds: [] },
  banner:   { kinds: [] },
}

const withVariants = (defs: PropDef[], n = 2): PropDef[] =>
  defs.flatMap((d) => {
    const based: PropDef = { ...d, ...PROP_META[d.id] }
    return [based, ...variants(based, n)]
  })

const BUSH_D = 'M0 -0.75C0.55 -0.7 0.9 -0.3 0.85 0.2C0.8 0.65 0.35 0.85 0 0.85C-0.4 0.85 -0.85 0.6 -0.87 0.15C-0.9 -0.35 -0.5 -0.72 0 -0.75Z'
const PEBBLE_D = 'M-0.45 0.1C-0.42 -0.25 -0.15 -0.38 0.05 -0.35C0.32 -0.31 0.45 -0.12 0.42 0.1C0.38 0.3 0.15 0.38 -0.05 0.36C-0.28 0.34 -0.47 0.28 -0.45 0.1Z'
const RUBBLE_D = 'M-0.7 0.3L-0.2 -0.42L0.32 0L0 0.45Z'
const SHARD_D = 'M-0.5 0.25L-0.1 -0.4L0.5 -0.15L0.2 0.35Z'
const CRATE_D = 'M-0.5 -0.42L0.48 -0.5L0.52 0.46L-0.44 0.5Z'
const BARREL_D = 'M-0.42 0A0.42 0.42 0 1 0 0.42 0A0.42 0.42 0 1 0 -0.42 0Z'
const SACK_D = 'M-0.35 -0.5C0.1 -0.62 0.42 -0.3 0.45 0.05C0.5 0.4 0.2 0.55 -0.05 0.55C-0.38 0.55 -0.55 0.32 -0.52 0C-0.5 -0.25 -0.5 -0.42 -0.35 -0.5Z'
const LOG_D = 'M-0.85 -0.15C-0.86 -0.3 -0.72 -0.36 -0.6 -0.34L0.62 -0.28C0.78 -0.27 0.87 -0.14 0.86 0.01C0.85 0.16 0.74 0.26 0.6 0.26L-0.6 0.32C-0.76 0.33 -0.84 0.02 -0.85 -0.15Z'
const MUSHCAP_D = 'M-0.55 -0.02C-0.56 -0.5 0.54 -0.52 0.55 -0.04C0.28 0.05 -0.28 0.06 -0.55 -0.02Z'
const PILLAR_D = 'M-0.34 0.6L-0.38 -0.32L-0.14 -0.55L0.08 -0.32L0.14 -0.52L0.37 -0.4L0.34 0.6Z'
const SPIKES_D = 'M-0.7 0.55L-0.45 -0.22L-0.25 0.08L-0.04 -0.65L0.2 0.02L0.42 -0.32L0.66 0.55Z'
const SKULL_D = 'M-0.4 0.08C-0.46 -0.35 -0.16 -0.56 0.05 -0.54C0.31 -0.5 0.49 -0.28 0.46 0.04C0.44 0.24 0.31 0.31 0.2 0.33L0.17 0.46L-0.24 0.43L-0.27 0.27C-0.35 0.23 -0.38 0.18 -0.4 0.08Z'
const POT_D = 'M-0.38 -0.12C-0.42 0.08 -0.3 0.48 -0.19 0.55L0.2 0.55C0.31 0.48 0.42 0.08 0.38 -0.12L0.46 -0.26L-0.46 -0.24Z'
const BOARD_D = 'M-0.55 -0.56L0.5 -0.62L0.53 -0.26L-0.52 -0.21Z'

// Deterministic radial STAR (a top-down conifer crown / cog): `n` points, outer
// radius `ro`, valley radius `ri`. Pure trig, no Math.random — a static path
// string, so it wonks + variants like any hand-authored prop.
function starPath(n: number, ro: number, ri: number, rot = 0): string {
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3)
  }
  return d + 'Z'
}
const CONIFER_OUT = starPath(9, 0.92, 0.44, 0.2)
const CONIFER_IN = starPath(9, 0.66, 0.3, 0.2)
const BANNER_D = 'M0.02 -0.52L0.44 -0.46L0.5 0.5L0.12 0.56Z'

// Deterministic rounded-LOBE ring (a top-down deciduous crown / cauliflower
// bush): `n` lobes alternating outer radius `ro` / valley `ri`, smoothed by
// blobPath. Trig only, no Math.random — a static path that wonks + variants
// like any hand-authored prop, the leafy round-tree counterpart to starPath's
// spiky conifer crown.
function lobeRing(n: number, ro: number, ri: number, cx = 0, cy = 0): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return pts
}
const CANOPY_D = blobPath(lobeRing(7, 0.82, 0.6, 0, -0.06))
const BOULDER_D = 'M-0.6 0.12C-0.64 -0.22 -0.34 -0.5 0.02 -0.52C0.4 -0.54 0.66 -0.28 0.64 0.04C0.62 0.34 0.36 0.5 0.02 0.5C-0.32 0.5 -0.56 0.42 -0.6 0.12Z'

export const TERRAIN_PROPS: Record<Biome, PropDef[]> = {
  grass: withVariants([
    { id: 'tuft', size: 0.9, paths: [
      { d: 'M-0.45 0.5Q-0.35 -0.2 -0.55 -0.85M0 0.55Q0.08 -0.1 0 -0.95M0.45 0.5Q0.4 -0.25 0.55 -0.8', stroke: 'foliage', sw: 0.16 },
    ] },
    { id: 'bush', size: 1.1, paths: cutout(BUSH_D, 'foliageDeep', 'foliage') },
    { id: 'pebble', size: 0.7, paths: cutout(PEBBLE_D, 'rockDeep', 'rock') },
    { id: 'bloom', size: 0.8, paths: [
      { d: 'M0 0.6Q0.06 0.1 0 -0.3', stroke: 'foliageDeep', sw: 0.12 },
      { d: 'M-0.26 -0.5A0.26 0.26 0 1 0 0.26 -0.5A0.26 0.26 0 1 0 -0.26 -0.5Z', fill: 'bloom' },
    ] },
    { id: 'stump', size: 0.9, paths: [
      { d: 'M-0.4 -0.1L-0.4 0.42C-0.4 0.58 0.4 0.58 0.4 0.42L0.4 -0.1Z', fill: 'woodDeep' },
      { d: 'M-0.42 -0.1A0.42 0.24 0 1 0 0.42 -0.1A0.42 0.24 0 1 0 -0.42 -0.1Z', fill: 'wood' },
      { d: 'M-0.22 -0.1A0.22 0.12 0 1 0 0.22 -0.1A0.22 0.12 0 1 0 -0.22 -0.1Z', stroke: 'woodDeep', sw: 0.06 },
    ] },
    { id: 'mushroom', size: 0.7, paths: [
      { d: 'M-0.14 0.55C-0.17 0.2 -0.13 0.05 -0.09 -0.08L0.12 -0.08C0.15 0.1 0.17 0.3 0.14 0.55Z', fill: 'cream' },
      ...cutout(MUSHCAP_D, 'woodDeep', 'woodLight'),
    ] },
    { id: 'reeds', size: 1, paths: [
      { d: 'M-0.3 0.6Q-0.25 -0.2 -0.36 -0.72M0.05 0.6Q0.1 -0.3 0.02 -0.88M0.38 0.6Q0.35 -0.1 0.44 -0.6', stroke: 'foliageDeep', sw: 0.12 },
      { d: 'M-0.43 -0.78A0.07 0.15 10 1 0 -0.29 -0.78A0.07 0.15 10 1 0 -0.43 -0.78ZM-0.05 -0.94A0.07 0.14 -4 1 0 0.09 -0.94A0.07 0.14 -4 1 0 -0.05 -0.94Z', fill: 'canvas' },
    ] },
    { id: 'log', size: 1.1, paths: [
      ...cutout(LOG_D, 'woodDeep', 'wood'),
      { d: 'M-0.85 0.07A0.12 0.23 0 1 0 -0.61 0.07A0.12 0.23 0 1 0 -0.85 0.07Z', fill: 'woodLight' },
    ] },
    // top-down deciduous CANOPY (the big round leafy trees on the sheet): a
    // two-tone lobed crown over a soft ground shadow, a few dark lobe clefts for
    // the broccoli read, and one lit sun-clump up-left. The forest's marquee prop.
    { id: 'canopy', size: 1.3, wonk: 0.05, paths: [
      { d: 'M0.12 0.66A0.6 0.3 0 1 0 0.14 0.7Z', fill: 'shadow', opacity: 0.22 },
      ...cutout(CANOPY_D, 'foliage', 'mossBase'),
      { d: 'M0 -0.06L-0.34 -0.42M0 -0.06L0.34 -0.34M0 -0.06L0.42 0.12M0 -0.06L-0.06 0.44M0 -0.06L-0.44 0.06', stroke: 'foliageDeep', sw: 0.05, opacity: 0.6 },
      { d: 'M-0.44 -0.3A0.2 0.2 0 1 0 -0.04 -0.3A0.2 0.2 0 1 0 -0.44 -0.3Z', fill: 'tileMoss', opacity: 0.85 },
    ] },
    // FERN: a fan of pinnate fronds (stroke art, like tuft/reeds) with a lit
    // up-left highlight set of the inner fronds.
    { id: 'fern', size: 0.95, paths: [
      { d: 'M0 0.72Q-0.3 0.05 -0.6 -0.62M0 0.72Q-0.12 0 -0.24 -0.82M0 0.72Q0.02 -0.02 0.02 -0.9M0 0.72Q0.16 0 0.3 -0.82M0 0.72Q0.34 0.05 0.62 -0.58', stroke: 'foliageDeep', sw: 0.1 },
      { d: 'M0 0.72Q-0.12 0 -0.24 -0.82M0 0.72Q0.02 -0.02 0.02 -0.9M0 0.72Q0.16 0 0.3 -0.82', stroke: 'foliage', sw: 0.06, lit: true },
    ] },
    // mossy BOULDER: a two-tone rock (bigger + lumpier than pebble) with a moss
    // cap patch + speckle on the lit upper face.
    { id: 'boulder', size: 1.05, wonk: 0.04, paths: [
      ...cutout(BOULDER_D, 'rockDeep', 'rock'),
      { d: 'M-0.5 -0.14C-0.4 -0.4 0 -0.5 0.32 -0.4C0.5 -0.34 0.44 -0.12 0.2 -0.06C-0.08 0 -0.44 0.04 -0.5 -0.14Z', fill: 'mossBase', opacity: 0.85 },
      { d: 'M-0.2 -0.32A0.08 0.08 0 1 0 -0.04 -0.32A0.08 0.08 0 1 0 -0.2 -0.32ZM0.06 -0.24A0.07 0.07 0 1 0 0.2 -0.24A0.07 0.07 0 1 0 0.06 -0.24Z', fill: 'mossInk', opacity: 0.7 },
    ] },
    // wildflower CLUSTER (the white/pink dotted patches): three petal blooms with
    // bloom-pink centers over a pair of leaves.
    { id: 'flowers', size: 0.85, wonk: 0.03, paths: [
      { d: 'M-0.4 0.5C-0.5 0.2 -0.3 0.05 -0.1 0.12C-0.28 0.3 -0.24 0.5 -0.4 0.5ZM0.34 0.52C0.5 0.28 0.34 0.05 0.12 0.14C0.3 0.28 0.22 0.52 0.34 0.52Z', fill: 'foliage' },
      { d: 'M-0.34 -0.28A0.15 0.15 0 1 0 -0.04 -0.28A0.15 0.15 0 1 0 -0.34 -0.28ZM0.12 -0.4A0.14 0.14 0 1 0 0.4 -0.4A0.14 0.14 0 1 0 0.12 -0.4ZM-0.02 0A0.13 0.13 0 1 0 0.24 0A0.13 0.13 0 1 0 -0.02 0Z', fill: 'cream' },
      { d: 'M-0.24 -0.28A0.05 0.05 0 1 0 -0.14 -0.28A0.05 0.05 0 1 0 -0.24 -0.28ZM0.22 -0.4A0.05 0.05 0 1 0 0.32 -0.4A0.05 0.05 0 1 0 0.22 -0.4ZM0.06 0A0.05 0.05 0 1 0 0.16 0A0.05 0.05 0 1 0 0.06 0Z', fill: 'bloom' },
    ] },
  ]),
  stone: withVariants([
    { id: 'rubble', size: 1, paths: [
      ...cutout(RUBBLE_D, 'rockDeep', 'rock'),
      { d: 'M0.4 0.5L0.72 0.02L0.9 0.45Z', fill: 'rockDeep' },
    ] },
    { id: 'crack', size: 1.2, paths: [
      { d: 'M-0.85 -0.3L-0.25 -0.12L0.05 0.26L0.7 0.45', stroke: 'stoneDark', sw: 0.1 },
    ] },
    { id: 'shard', size: 0.8, paths: cutout(SHARD_D, 'rockDeep', 'rock') },
    { id: 'bone', size: 0.8, paths: [
      { d: 'M-0.5 0.15L0.35 -0.3M0.28 -0.42L0.45 -0.18', stroke: 'cream', sw: 0.12, opacity: 0.6 },
    ] },
    { id: 'pillar', size: 1, paths: [
      { d: 'M-0.5 0.6L0.5 0.6L0.43 0.36L-0.44 0.38Z', fill: 'rockDeep' },
      ...cutout(PILLAR_D, 'rockDeep', 'rock'),
    ] },
    { id: 'skull', size: 0.7, wonk: 0.025, paths: [
      ...cutout(SKULL_D, 'rockDeep', 'cream'),
      { d: 'M-0.24 -0.06A0.09 0.11 0 1 0 -0.06 -0.06A0.09 0.11 0 1 0 -0.24 -0.06ZM0.08 -0.04A0.09 0.11 0 1 0 0.26 -0.04A0.09 0.11 0 1 0 0.08 -0.04Z', fill: 'ink' },
    ] },
    { id: 'spikes', size: 1, paths: cutout(SPIKES_D, 'rockDeep', 'rock') },
    { id: 'moss', size: 1.1, paths: [
      { d: 'M-0.6 0.1C-0.5 -0.3 0 -0.45 0.4 -0.25C0.7 -0.1 0.6 0.3 0.2 0.38C-0.15 0.46 -0.55 0.4 -0.6 0.1Z', fill: 'foliageDeep', opacity: 0.55 },
    ] },
  ]),
  plaza: withVariants([
    { id: 'crate', size: 1, paths: [
      ...cutout(CRATE_D, 'woodDeep', 'wood'),
      { d: 'M-0.44 0.02L0.48 -0.04', stroke: 'ink', sw: 0.07, opacity: 0.6 },
    ] },
    { id: 'barrel', size: 0.9, paths: [
      ...cutout(BARREL_D, 'woodDeep', 'wood'),
      { d: 'M-0.2 0A0.2 0.2 0 1 0 0.2 0A0.2 0.2 0 1 0 -0.2 0Z', stroke: 'ink', sw: 0.06, opacity: 0.5 },
    ] },
    { id: 'sack', size: 0.9, paths: cutout(SACK_D, 'woodDeep', 'canvas') },
    { id: 'wheel', size: 0.9, wonk: 0.04, paths: [
      { d: 'M-0.55 0A0.55 0.55 0 1 0 0.55 0A0.55 0.55 0 1 0 -0.55 0Z', stroke: 'wood', sw: 0.14 },
      { d: 'M-0.45 0L0.45 0M0 -0.45L0 0.45M-0.32 -0.32L0.32 0.32M-0.32 0.32L0.32 -0.32', stroke: 'woodDeep', sw: 0.08 },
      { d: 'M-0.12 0A0.12 0.12 0 1 0 0.12 0A0.12 0.12 0 1 0 -0.12 0Z', fill: 'woodDeep' },
    ] },
    { id: 'pot', size: 0.9, paths: [
      ...cutout(POT_D, 'woodDeep', 'woodLight'),
      { d: 'M-0.3 -0.26C-0.38 -0.55 -0.1 -0.72 0.1 -0.66C0.36 -0.6 0.4 -0.36 0.3 -0.26Z', fill: 'foliage' },
    ] },
    { id: 'signpost', size: 1, paths: [
      { d: 'M-0.06 0.6L-0.04 -0.7L0.08 -0.7L0.07 0.6Z', fill: 'woodDeep' },
      ...cutout(BOARD_D, 'woodDeep', 'wood'),
    ] },
    { id: 'coil', size: 0.8, paths: [
      { d: 'M-0.5 0A0.5 0.5 0 1 0 0.5 0A0.5 0.5 0 1 0 -0.5 0ZM-0.27 0A0.27 0.27 0 1 0 0.27 0A0.27 0.27 0 1 0 -0.27 0Z', stroke: 'canvas', sw: 0.13 },
      { d: 'M-0.1 0A0.1 0.1 0 1 0 0.1 0A0.1 0.1 0 1 0 -0.1 0Z', fill: 'shadow', opacity: 0.3 },
    ] },
    // top-down conifer (the pines lining Prontera's avenues): a two-tone spiky
    // crown with a lit inner star + a small trunk core
    { id: 'conifer', size: 1.15, wonk: 0.05, paths: [
      { d: 'M0.14 0.62A0.5 0.28 0 1 0 0.16 0.66Z', fill: 'shadow', opacity: 0.28 },
      { d: CONIFER_OUT, fill: 'foliageDeep' },
      { d: CONIFER_IN, fill: 'foliage', lit: true },
      { d: 'M-0.14 -0.05A0.14 0.14 0 1 0 0.14 -0.05A0.14 0.14 0 1 0 -0.14 -0.05Z', fill: 'pineLit' },
    ] },
    // top-down street lamp: an iron collar with a lit head (the ornate lamps
    // that ring the plaza)
    { id: 'lamppost', size: 0.6, wonk: 0.03, paths: [
      { d: 'M-0.3 0A0.3 0.3 0 1 0 0.3 0A0.3 0.3 0 1 0 -0.3 0Z', fill: 'lampPost' },
      { d: 'M-0.18 0A0.18 0.18 0 1 0 0.18 0A0.18 0.18 0 1 0 -0.18 0Z', fill: 'lampGlow' },
      { d: 'M-0.34 0L-0.14 0M0.14 0L0.34 0M0 -0.34L0 -0.14M0 0.14L0 0.34', stroke: 'lampGlow', sw: 0.07, opacity: 0.7 },
    ] },
    // top-down heraldic banner: a short pole with a hanging blue flag + gold
    // trim and a pale crest
    { id: 'banner', size: 0.85, wonk: 0.03, paths: [
      { d: 'M0.06 -0.5L0.5 -0.44L0.56 0.5L0.14 0.56Z', fill: 'shadow', opacity: 0.24 },
      ...cutout(BANNER_D, 'bannerBlueDk', 'bannerBlue'),
      { d: 'M0.04 -0.34L0.47 -0.29M0.08 0.34L0.5 0.4', stroke: 'bannerGold', sw: 0.06, opacity: 0.85 },
      { d: 'M0.2 0A0.11 0.13 0 1 0 0.42 0A0.11 0.13 0 1 0 0.2 0Z', fill: 'bannerGold', opacity: 0.9 },
      { d: 'M-0.16 -0.52A0.12 0.12 0 1 0 0.08 -0.52A0.12 0.12 0 1 0 -0.16 -0.52Z', fill: 'lampPost' },
    ] },
  ]),
}
