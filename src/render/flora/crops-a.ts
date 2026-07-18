// ── Flora catalog: Row crops I (cornstalk · pumpkin · sunflower · cabbage · tomato) ──
//
// Cultivated FARM row-crops. Builder: fill the array with COMPLETE PropDefs —
// full inline placement meta (kinds/themes/role/pass/footprint …) so entries
// flow into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts
// spreads this array into the `grass` bucket and runs it through variants().
//
// Import geometry from './kit' (cutout, ring, leaf, radialStar, lobeBlob,
// scatterDots, glowHalo, blobPath, roughCircle, hash01/hashString) — NEVER
// runtime-import '@/render/props' (type-only import is fine). Full column→field
// map, palette roles, and the harvested-state convention: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, ring, leaf, radialStar, lobeBlob, scatterDots } from './kit'

export const CROPS_A: PropDef[] = [
  // Example (delete when authoring). Scatterable base carries EVERY gated field:
  // {
  //   id: 'cornstalk', size: 1.15,
  //   paths: [...cutout(STALK_D, 'foliageDeep', 'foliage'), { d: EAR_D, fill: 'petalGold' }],
  //   kinds: ['tree', 'bush'], themes: ['farm', 'plains'], role: 'cluster', rotate: 'upright',
  //   weight: 0.6, pass: 'solid', footprint: 0.3, tall: true,
  //   tags: ['row', 'pole'], gameplay: ['harvestable'], clusterWith: ['cornstalk'],
  // },
  // Harvested-state companion (state pair): reuse the base geometry so the flip
  // reads as the same plant; kinds:[] + tags:['interactable'] exempts it from the
  // scatter-reachability gate (like `berrypicked`/`braziercold`):
  // { id: 'cornstalkcut', size: 1.15, paths: [/* stubble */], kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25 },
]
