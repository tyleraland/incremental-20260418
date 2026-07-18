// ── Flora catalog: Temperate forest flora (birch · oak · bluebell · bracken · toadstool clump …) ──
//
// Broadleaf + understory FOREST growth (complements `canopy`/`fern`/`mushroom`).
// Builder: fill with COMPLETE PropDefs (full inline placement meta) — entries flow
// into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts spreads this
// into the `grass` bucket, then variants().
//
// Geometry from './kit' only (lobeBlob for round crowns; type-only PropDef). Full
// guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, lobeBlob, ring, leaf, scatterDots } from './kit'

export const FOREST_FLORA: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'bluebells', size: 0.8,
  //   paths: [{ d: STEMS_D, stroke: 'foliage', sw: 0.06 }, { d: BELL_DOTS, fill: 'berryPurple' }],
  //   kinds: ['flower'], themes: ['forest'], role: 'cluster', rotate: 'upright',
  //   weight: 0.5, pass: 'walkable', footprint: 0.12, tags: ['bloom', 'cover'],
  //   clusterWith: ['bluebells'],
  // },
]
