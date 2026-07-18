// ── Flora catalog: Climbing vines / creepers / ivy / overgrowth ──
//
// Trailing + wall-climbing growth (ivy sheet, morning-glory, kudzu drape, thorn
// creeper). Builder: fill with COMPLETE PropDefs (full inline placement meta) —
// entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts
// spreads this into the `grass` bucket, then variants(). Wall/drape growth uses
// layer:'wall' or 'canopy'; ground creepers stay layer:'ground'.
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, leaf, scatterDots } from './kit'

export const VINES: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'ivysheet', size: 1.0,
  //   paths: [{ d: VINE_STROKES, stroke: 'foliage', sw: 0.08 }, { d: LEAF_DOTS, fill: 'foliageDeep' }],
  //   kinds: ['flower', 'bush'], themes: ['forest', 'ruins', 'haunted', 'jungle'], role: 'edge',
  //   rotate: 'flat', weight: 0.4, pass: 'walkable', footprint: 0.2, layer: 'wall',
  //   tags: ['vine', 'climb', 'drape', 'overgrow'], near: ['wall'],
  // },
]
