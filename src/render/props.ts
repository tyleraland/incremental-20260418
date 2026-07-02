import type { Biome } from '@/render/appearance'
import type { PaperRole } from '@/render/palette'

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
}

// The standard two-tone cutout: base silhouette + lit top copy. THE way to give
// a shape the paper depth read — the offset itself lives in the renderer.
export function cutout(d: string, base: PaperRole, lit: PaperRole): PropPath[] {
  return [{ d, fill: base }, { d, fill: lit, lit: true }]
}

const BUSH_D = 'M0 -0.75C0.55 -0.7 0.9 -0.3 0.85 0.2C0.8 0.65 0.35 0.85 0 0.85C-0.4 0.85 -0.85 0.6 -0.87 0.15C-0.9 -0.35 -0.5 -0.72 0 -0.75Z'
const PEBBLE_D = 'M-0.45 0.1C-0.42 -0.25 -0.15 -0.38 0.05 -0.35C0.32 -0.31 0.45 -0.12 0.42 0.1C0.38 0.3 0.15 0.38 -0.05 0.36C-0.28 0.34 -0.47 0.28 -0.45 0.1Z'
const RUBBLE_D = 'M-0.7 0.3L-0.2 -0.42L0.32 0L0 0.45Z'
const SHARD_D = 'M-0.5 0.25L-0.1 -0.4L0.5 -0.15L0.2 0.35Z'
const CRATE_D = 'M-0.5 -0.42L0.48 -0.5L0.52 0.46L-0.44 0.5Z'
const BARREL_D = 'M-0.42 0A0.42 0.42 0 1 0 0.42 0A0.42 0.42 0 1 0 -0.42 0Z'
const SACK_D = 'M-0.35 -0.5C0.1 -0.62 0.42 -0.3 0.45 0.05C0.5 0.4 0.2 0.55 -0.05 0.55C-0.38 0.55 -0.55 0.32 -0.52 0C-0.5 -0.25 -0.5 -0.42 -0.35 -0.5Z'

export const TERRAIN_PROPS: Record<Biome, PropDef[]> = {
  grass: [
    { id: 'tuft', size: 0.9, paths: [
      { d: 'M-0.45 0.5Q-0.35 -0.2 -0.55 -0.85M0 0.55Q0.08 -0.1 0 -0.95M0.45 0.5Q0.4 -0.25 0.55 -0.8', stroke: 'foliage', sw: 0.16 },
    ] },
    { id: 'bush', size: 1.1, paths: cutout(BUSH_D, 'foliageDeep', 'foliage') },
    { id: 'pebble', size: 0.7, paths: cutout(PEBBLE_D, 'rockDeep', 'rock') },
    { id: 'bloom', size: 0.8, paths: [
      { d: 'M0 0.6Q0.06 0.1 0 -0.3', stroke: 'foliageDeep', sw: 0.12 },
      { d: 'M-0.26 -0.5A0.26 0.26 0 1 0 0.26 -0.5A0.26 0.26 0 1 0 -0.26 -0.5Z', fill: 'bloom' },
    ] },
  ],
  stone: [
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
  ],
  plaza: [
    { id: 'crate', size: 1, paths: [
      ...cutout(CRATE_D, 'woodDeep', 'wood'),
      { d: 'M-0.44 0.02L0.48 -0.04', stroke: 'ink', sw: 0.07, opacity: 0.6 },
    ] },
    { id: 'barrel', size: 0.9, paths: [
      ...cutout(BARREL_D, 'woodDeep', 'wood'),
      { d: 'M-0.2 0A0.2 0.2 0 1 0 0.2 0A0.2 0.2 0 1 0 -0.2 0Z', stroke: 'ink', sw: 0.06, opacity: 0.5 },
    ] },
    { id: 'sack', size: 0.9, paths: cutout(SACK_D, 'woodDeep', 'canvas') },
  ],
}
