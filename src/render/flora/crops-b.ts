// ── Flora catalog: Row crops II / climbers (grapevine · beanpole · carrottop · hops) ──
//
// Trellised + pole FARM crops. Builder: fill with COMPLETE PropDefs (full inline
// placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this into the `grass` bucket, then variants().
//
// Geometry from './kit' only (never runtime-import '@/render/props'; type-only OK).
// Column→field map + palette roles + state-pair rule: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, ring, leaf, rect, scatterDots } from './kit'

export const CROPS_B: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'beanpole', size: 1.1,
  //   paths: [{ d: POLE_D, fill: 'wood' }, { d: VINE_D, stroke: 'foliage', sw: 0.08 }],
  //   kinds: ['tree', 'bush'], themes: ['farm', 'plains'], role: 'cluster', rotate: 'upright',
  //   weight: 0.5, pass: 'solid', footprint: 0.28, tall: true, tags: ['row', 'trellis', 'climb'],
  // },
  // Grapevine ripe→picked etc. use the state-pair rule (kinds:[], tags:['interactable']).
]
