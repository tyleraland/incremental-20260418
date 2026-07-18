// ── Flora catalog: Jungle flora (fern tree · banana · orchid · liana · buttress root …) ──
//
// Lush JUNGLE broadleaf + epiphytes (complements existing `giantleaf`/`bamboo`/
// `hangvines`). Builder: fill with COMPLETE PropDefs (full inline placement meta)
// — entries flow into TERRAIN_PROPS + listAssets with NO shared-file edits.
// props.ts spreads this into the `grass` bucket, then variants(). Overhanging
// growth uses layer:'canopy'; stilt/buttress roots carry the `stilt`/`root` tags.
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, radialStar, leaf, ring } from './kit'

export const JUNGLE_FLORA: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'ferntree', size: 1.15,
  //   paths: cutout(radialStar(8, 0.9, 0.34), 'foliageDeep', 'foliage'),
  //   kinds: ['tree', 'bush'], themes: ['jungle'], role: 'cluster', rotate: 'upright',
  //   weight: 0.6, pass: 'overhang', footprint: 0.45, tall: true, tags: ['broadleaf', 'radial'],
  // },
]
