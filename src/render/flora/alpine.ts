// ── Flora catalog: Alpine / tundra flora (edelweiss · dwarf pine · lichen · snowbell · frostfern …) ──
//
// Cold-biome hardy growth. Builder: fill with COMPLETE PropDefs (full inline
// placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this array into the `stone` bucket (where
// snow/mountain props live), then variants(). Use themes ['tundra','mountain',
// 'snow']; iced growth carries the `iced` tag and snow/snowShade roles.
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, radialStar, ring, lobeBlob } from './kit'

export const ALPINE_FLORA: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'edelweiss', size: 0.75,
  //   paths: [...cutout(radialStar(7, 0.7, 0.26), 'snowShade', 'snow'), { d: CENTER_D, fill: 'petalGold' }],
  //   kinds: ['flower'], themes: ['tundra', 'mountain', 'snow'], role: 'cluster', rotate: 'upright',
  //   weight: 0.5, pass: 'walkable', footprint: 0.12, tags: ['bloom', 'iced'],
  // },
]
