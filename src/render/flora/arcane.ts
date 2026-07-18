// ── Flora catalog: Arcane flora (manabloom · glowcap · crystal fern · wispflower · runethorn …) ──
//
// Magical growth that GLOWS/PULSES. Builder: fill with COMPLETE PropDefs (full
// inline placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this array into the `stone` bucket (where
// arcane props live), then variants().
//
// GLOW WITHOUT FILTERS: draw a flat `glowHalo(r)` blob filled `arcaneGlow`/
// `glowFungus` at low fill-opacity (≈0.3) UNDER the plant — never a filter/blur/
// gradient. Also set `light: { color: 'arcaneGlow', radius }` + `anim: true` for
// glow/pulse props. Geometry from './kit' only (type-only PropDef). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, glowHalo, ring, radialStar } from './kit'

export const ARCANE_FLORA: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'manabloom', size: 0.9,
  //   paths: [{ d: glowHalo(0.7), fill: 'arcaneGlow', opacity: 0.3 }, ...cutout(BLOOM_D, 'berryPurpleDeep', 'berryPurple')],
  //   kinds: ['flower', 'bush'], themes: ['arcane', 'dungeon'], role: 'accent', rotate: 'upright',
  //   weight: 0.4, pass: 'walkable', footprint: 0.2, tags: ['glow', 'pulse', 'fae'],
  //   light: { color: 'arcaneGlow', radius: 2 }, anim: true, maxPerChunk: 3,
  // },
]
