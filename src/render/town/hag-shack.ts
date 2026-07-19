// ── Hag: Shack structure (crooked chimney · sagging roof · bone fence · ward post · crooked sign · porch) ──
//
// Bucket: GRASS (swamp/forest structures — mirrors farm/lore hovel props).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   crookedchimney        role '-' → role:'accent', state crookedchimney_smoke, anim
//   saggingroof           role '-' → role:'accent', layer:'canopy'
//   bonefence             role edge → role:'edge', tags fence,grim
//   wardpost              role '-' → role:'field', tags ominous,ward
//   crookedsign           role read → gameplay:['read'], role:'edge', layer:'wall'
//   ricketyporch          role '-' → role:'accent' (structure part)
//
// LAYER: saggingroof → layer:'canopy'; crookedsign → layer:'wall'; rest ground.
//
// UNIQUE STATE-ID RULE: `crookedchimney`→`crookedchimney_smoke` (NOT the bare
// `chimney_smoke` — structures' `chimneypot` owns `chimneypot_smoke`; both
// derive from the same spec `chimney_smoke`). Companion (a puffing-smoke frame)
// reuses base geometry, kinds:[] + tags:['interactable'], declares pass+footprint.
//
// COLLISIONS: all FREE (bonefence distinct from `fencerun`; wardpost/crookedsign/
// ricketyporch/saggingroof no existing analogues).
//
// The `hagshack` 'set' row is a SCATTER_SETS prefab (NOT a prop): its members are
// this group's parts + one brand-new base this group owns:
//   shackwall — leaning warped-plank hovel wall (hagshack base)
// plus saggingroof/crookedchimney/ricketyporch/bonefence/wardpost/crookedsign +
// hag-witchery's `cauldron_big`. Orchestrator wires it post-build; member list
// in the digest.

import type { PropDef } from '@/render/props'
// import { cutout, rect, polyPath, glowHalo } from './kit'

export const HAG_SHACK: PropDef[] = [
  // {
  //   id: 'wardpost', size: 0.9, wonk: 0.05,
  //   paths: [...cutout(POST_D, 'woodDeep', 'wood'), { d: SKULL_D, fill: 'cream' },
  //           { d: RUNE_D, stroke: 'bloodDry', sw: 0.05 }],
  //   kinds: ['tree', 'stump'], themes: ['swamp', 'haunted', 'arcane'], role: 'field',
  //   rotate: 'upright', weight: 0.4, pass: 'solid', footprint: 0.2, tags: ['ominous', 'ward'],
  // },
]
