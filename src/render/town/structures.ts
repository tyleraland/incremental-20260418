// ── Town: Structures (signs · doors · shutters · chimneys · roof/overhang parts · courtyard) ──
//
// Bucket: PLAZA (city/village fixtures — where `signpost`/`statue` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with
// NO shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION (wave-3): the spec's `role` column mixes real
// PropRoles with VERBS. Verb values move into `gameplay`; only real placement
// roles stay `role`. `-` role → sensible default. Per-row resolution here:
//   innsign/shopsign  role '-'  → role:'edge'  (wall-line fixtures), gameplay:['read']
//   door_arched       role enter→ role:'edge',  gameplay:['enter']  (verb→gameplay)
//   shutters          role '-'  → role:'edge'
//   chimneypot        role '-'  → role:'accent' (small roof landmark)
//   jetty_upper/roofgable '-'   → role:'accent' (canopy structure parts)
//   courtyard         role '-'  → role:'field'  (flat ground decal)
//
// LAYER COLUMN: wall-edge → layer:'wall'; canopy → layer:'canopy'; ground →
// layer:'ground'. wall-edge/canopy parts → pass:'walkable' (they sit on/over a
// facade, don't block a cell) unless they're a full standing structure.
//
// UNIQUE STATE-ID RULE: companion state ids are `<baseid>_<suffix>`. This group
// owns `door_arched`→`door_open`, `shutters`→`shutters_open`, and
// `chimneypot`→`chimneypot_smoke` (NOT the bare `chimney_smoke` the spec reuses
// — hag-shack's `crookedchimney` owns `crookedchimney_smoke`). Companion reuses
// base geometry, kinds:[] + tags:['interactable'], still declares pass+footprint.
//
// COURTYARD/COBBLE arbitration: authored as a flat ground DECAL prop
// (rotate:'flat', pass:'walkable') for legacy/hand-authored maps + the gallery —
// distinct from the terrain SURFACE-material paving (which paints whole regions
// spec-side). They coexist; the decal is accent, not the road system.
//
// The 7 building 'set' rows (house_timber/house_thatch/cottage/shopfront/
// townhall/church/chapel_ruin) are SCATTER_SETS prefabs, NOT props — do not
// author them here. Their MEMBER part-props ARE authored here (signs, door,
// shutters, chimney, roof parts) PLUS three brand-new base props this group owns:
//   housewall  — plaster/timber-frame two-storey facade block (house/shop/hall/tavern base)
//   roofthatch — thatched roof cap (house_thatch, cottage)
//   steeple    — church tower + cross (church, chapel_ruin)
// The orchestrator wires the SCATTER_SETS entries post-build (member ids gated
// by AssetCatalog.test); member lists are documented in the digest (WAVE 3).

import type { PropDef } from '@/render/props'
// import { cutout, ring, rect, polyPath } from './kit'

export const STRUCTURES: PropDef[] = [
  // {
  //   id: 'door_arched', size: 0.9, wonk: 0.03,
  //   paths: [...cutout(FRAME_D, 'woodDeep', 'wood'), { d: PLANKS_D, stroke: 'woodDeep', sw: 0.05 }],
  //   kinds: ['stump', 'rock'], themes: ['city', 'village'], role: 'edge', rotate: 'upright',
  //   weight: 0.5, pass: 'walkable', footprint: 0.2, layer: 'wall',
  //   gameplay: ['enter', 'open'], tags: ['building'],
  // },
  // State pair — door swung open: { id: 'door_open', size: 0.9, paths: [/* frame + dark gap */],
  //   kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.2 },
]
