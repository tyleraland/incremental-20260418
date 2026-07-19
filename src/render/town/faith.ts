// ── Town: Faith / churchyard (grave cross · gravestone var · lychgate · wayside shrine · tomb slab) ──
//
// Bucket: GRASS (graveyard — where the existing `gravestone` lives). Builder:
// fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   gravecross/gravestone_var  role '-' → role:'cluster' (graves clump in yards)
//   lychgate              role '-' → role:'accent' (gate landmark), tags structure,holy
//   shrine_wayside        role pray → gameplay:['pray'], role:'accent'
//   tombslab              role search → gameplay:['search'], role:'accent', state tombslab_ajar
//
// LAYER: all ground.
//
// COLLISIONS (digest WAVE 3):
//   gravestone_var → FREE. A distinct authored second-style prop (like wave-2
//                    `table_var`); the existing `gravestone` stays untouched.
//   shrine_wayside → FREE (distinct wayside cross-shrine; near-miss with existing
//                    `shrine` but a different silhouette — keep, note the near-miss).
//   gravecross/lychgate/tombslab → FREE.
//
// UNIQUE STATE-ID RULE: `tombslab`→`tombslab_ajar` (NOT the bare `slab_ajar` the
// spec names). Companion reuses base geometry, kinds:[] + tags:['interactable'],
// still declares pass+footprint.

import type { PropDef } from '@/render/props'
// import { cutout, polyPath, ring } from './kit'

export const FAITH: PropDef[] = [
  // {
  //   id: 'gravecross', size: 0.8, wonk: 0.04,
  //   paths: [...cutout(CROSS_D, 'rockDeep', 'rock'), { d: MOSS_D, fill: 'mossBase' }],
  //   kinds: ['rock', 'stump'], themes: ['village', 'haunted'], role: 'cluster', rotate: 'upright',
  //   weight: 0.5, pass: 'solid', footprint: 0.2, clusterWith: ['gravecross', 'gravestone_var'],
  //   tags: ['grim'],
  // },
]
