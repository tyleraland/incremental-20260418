// ── Town: Streets (paving decals · gates · walls · fences · archway · bridge · stocks · gallows · cross) ──
//
// Bucket: PLAZA (city/village fixtures). Builder: fill COMPLETE PropDefs — flow
// into TERRAIN_PROPS + listAssets with NO shared-file edits; props.ts spreads
// into `plaza`, then variants(). Geometry from './kit' only. Full guide:
// scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   cobbleroad/dirtlane   role edge → role:'edge' (real role), flat decals
//   towngate              role BARRIER → pass:'solid' + gameplay:['barrier','open'],
//                         role:'accent' (landmark), state gate_open
//   townwall              role BARRIER → pass:'solid' + gameplay:['barrier'], role:'edge'
//   woodenfence/wattlefence/stonewall_low  role edge → role:'edge'
//   footbridge            role edge → role:'edge'
//   archway/stocks/gallows/marketcross  role '-' → role:'accent' (landmarks)
//   wellstone             role gather → DEFERRED (see collisions)
//
// LAYER: all ground here. Flat paving decals (cobbleroad/dirtlane/courtyard-kin)
// → rotate:'flat', pass:'walkable', layer:'ground' — a DECAL, distinct from the
// terrain surface-material road system (they coexist; decal is accent/legacy).
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   woodenfence  → DEFER to existing `fencerun` (same wooden-fence-run). Orchestrator
//                  adds village/farm themes to fencerun. Do NOT author woodenfence.
//   wellstone    → DEFER to existing `well` (redundant canonical stone well).
//                  Orchestrator adds gather/draw gameplay + village theme to `well`.
//   towngate     → FREE (big city gate; distinct from small farm `woodgate`).
//   footbridge   → FREE (arched footbridge; distinct from `bridgeplank` set member).
//   wattlefence/stonewall_low/archway/stocks/gallows/marketcross → FREE.
//
// The `watchtower` 'set' row is a SCATTER_SETS prefab (NOT a prop). This group
// owns one brand-new base member for it:
//   towerbody — round stone watchtower shaft (watchtower set; reuse roofgable as cap)
// Orchestrator wires the set post-build; member list in the digest.

import type { PropDef } from '@/render/props'
// import { cutout, rect, polyPath } from './kit'

export const STREETS: PropDef[] = [
  // {
  //   id: 'towngate', size: 1.15, wonk: 0.03,
  //   paths: [...cutout(POSTS_D, 'woodDeep', 'wood'), ...cutout(LINTEL_D, 'woodDeep', 'wood')],
  //   kinds: ['stump', 'tree'], themes: ['city'], role: 'accent', rotate: 'upright',
  //   weight: 0.2, pass: 'solid', footprint: 0.5, tall: true,
  //   gameplay: ['barrier', 'open'], tags: ['structure'],
  // },
  // State pair — gate open: { id: 'gate_open', size: 1.15, paths: [/* posts, doors swung */],
  //   kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.5 },
]
