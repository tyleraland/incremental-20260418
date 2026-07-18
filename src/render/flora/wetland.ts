// ── Flora catalog: Wetland flora (cattail · papyrus · mangrove · lotus · pitcher plant …) ──
//
// SWAMP/WATER edge + floating growth. Builder: fill with COMPLETE PropDefs (full
// inline placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this into the `grass` bucket, then variants().
// Floating props (lily, lotus pad) MUST be layer:'water-surface' + kinds:['reed']
// and near:['water'] (they're skipped on legacy no-spec maps, by design).
//
// Geometry from './kit' only (type-only import of PropDef is fine). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, ring, leaf, lobeBlob } from './kit'

export const WETLAND_FLORA: PropDef[] = [
  // Example (delete when authoring). A floating lotus:
  // {
  //   id: 'lotus', size: 0.9,
  //   paths: [{ d: PAD_D, fill: 'foliageDeep' }, { d: BLOOM_D, fill: 'blossom' }],
  //   kinds: ['reed'], themes: ['swamp', 'water'], role: 'field', rotate: 'free',
  //   weight: 0.5, pass: 'walkable', footprint: 0.2, layer: 'water-surface',
  //   near: ['water'], tags: ['wetland', 'bloom', 'float'],
  // },
]
