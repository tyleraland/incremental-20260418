// ── Flora catalog: Orchard fruit trees (apple · pear · cherry · orange · plum · fig …) ──
//
// Top-down ORCHARD canopies with ripe fruit; most have a harvested-state pair.
// Builder: fill with COMPLETE PropDefs (full inline placement meta) — entries
// flow into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts
// spreads this into the `grass` bucket, then variants(). Fruit trees are `tall`
// canopies — prefer pass:'overhang' + a low `wonk` so registered fruit stay put.
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, ring, lobeBlob, scatterDots } from './kit'

export const FRUIT_TREES: PropDef[] = [
  // Example (delete when authoring). Fruiting canopy + harvested companion:
  // {
  //   id: 'appletree', size: 1.2, wonk: 0.05,
  //   paths: [...cutout(CROWN_D, 'foliageDeep', 'foliage'), { d: FRUIT_DOTS, fill: 'fruitRed' }],
  //   kinds: ['tree'], themes: ['orchard', 'plains', 'forest'], role: 'cluster', rotate: 'upright',
  //   weight: 0.35, pass: 'overhang', footprint: 0.5, tall: true,
  //   tags: ['fruit', 'bloom', 'broadleaf'], gameplay: ['harvestable'], clusterWith: ['appletree'],
  // },
  // { id: 'appletreebare', size: 1.2, wonk: 0.05, paths: [/* same crown, no fruit */], kinds: [], tags: ['interactable'], pass: 'overhang', footprint: 0.5 },
]
