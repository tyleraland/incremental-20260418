// ── Setpieces: Farm & ranch (silo · barn · coop · trough · feed sack · haystack · beehive box · scarecrow var …) ──
//
// Bucket: GRASS (farm/plains — where `scarecrow`/`haybale`/`fencerun`/`wheat`
// live). Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets
// with NO shared-file edits; props.ts spreads into `grass`, then variants().
// Geometry from './kit' only.
//
// Gameplay verbs → GameplayTag: harvest(→harvestable)/plantable/gather/use +
// restore (troughs). `farm`/`seasonal`/`workstation` are freeform `tags`. Water
// trough → layer:'water-surface' only if it reads as a water body; otherwise
// ground. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS: `scarecrow`/`haybale`/`fencerun` already props. `scarecrow_var` is
// a NEW second-style scarecrow (distinct id, not the auto `~` variant). NEW farm
// ids: silo, barn, coop, henhouse, trough, feedbag, haystack, beebox, windmill, …

import type { PropDef } from '@/render/props'
// import { cutout, rect, ring, lobeBlob } from './kit'

export const FARM: PropDef[] = [
  // {
  //   id: 'silo', size: 1.3,
  //   paths: [...cutout(BODY_D, 'canvasDeep', 'canvas'), { d: ROOF_D, fill: 'rock' }],
  //   kinds: ['tree', 'stump'], themes: ['farm', 'plains'], role: 'accent', rotate: 'upright',
  //   weight: 0.15, pass: 'solid', footprint: 0.5, tall: true, tags: ['farm'], maxPerChunk: 1,
  // },
]
