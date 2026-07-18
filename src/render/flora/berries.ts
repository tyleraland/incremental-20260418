// ── Flora catalog: Berry shrubs (raspberry · blueberry · elderberry · gooseberry …) ──
//
// Fruiting FOREST/ORCHARD shrubs, most with a picked-state pair (cf. the existing
// `berrybush`→`berrypicked`). Builder: fill with COMPLETE PropDefs (full inline
// placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this into the `grass` bucket, then variants().
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md — see the harvested-state convention section.

import type { PropDef } from '@/render/props'
// import { cutout, scatterDots, lobeBlob } from './kit'

export const BERRIES: PropDef[] = [
  // Example (delete when authoring). Bush + berries, harvestable, with a state pair:
  // {
  //   id: 'raspberrybush', size: 1.0,
  //   paths: [...cutout(BUSH_D, 'foliageDeep', 'foliage'), { d: BERRY_DOTS, fill: 'fruitRed' }],
  //   kinds: ['bush'], themes: ['forest', 'orchard', 'plains'], role: 'cluster', rotate: 'upright',
  //   weight: 0.5, pass: 'solid', footprint: 0.35, tags: ['fruit', 'bloom'],
  //   gameplay: ['harvestable'], clusterWith: ['raspberrybush'],
  // },
  // { id: 'raspberrypicked', size: 1.0, paths: [/* same bush, no berries */], kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35 },
]
