// ── Flora catalog: Desert flora (agave · aloe · barrel cactus · ocotillo · yucca …) ──
//
// Arid succulents + spiny rosettes (complements the existing `cactus`/`cactuspad`).
// Builder: fill with COMPLETE PropDefs (full inline placement meta) — entries flow
// into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts spreads this
// into the `grass` bucket, then variants(). Radial rosettes read well with
// rotate:'free'; spiny silhouettes carry the `spiny` tag.
//
// Geometry from './kit' only (radialStar for spiny rosettes; type-only PropDef).
// Full guide: scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, radialStar, ring, leaf } from './kit'

export const DESERT_FLORA: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'agave', size: 1.0,
  //   paths: cutout(radialStar(9, 0.85, 0.28), 'foliageDeep', 'foliage'),
  //   kinds: ['bush', 'tree'], themes: ['desert'], role: 'cluster', rotate: 'free',
  //   weight: 0.5, pass: 'solid', footprint: 0.35, tags: ['spiny', 'radial'],
  // },
]
