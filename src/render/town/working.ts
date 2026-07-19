// ── Town: Working life (well-sweep/bucket · woodpile · chopping block · handcart · laundry · pigpen · hay wain) ──
//
// Bucket: GRASS (farm/village working-life — where farm props live, wave-2 W2.5).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   wellsweep/wellbucket  role draw → gameplay:['draw'], role:'accent'
//   woodpile              role gather → gameplay:['gather'], role:'field'
//   choppingblock/handcart/hay_wain  role '-' → role:'field'
//   laundryline           role '-' → role:'accent', layer:'canopy'
//   pigpen                role '-' → role:'accent' (enclosure), tags fence,farm
//
// LAYER: laundryline → layer:'canopy'; rest ground.
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   smithyforge    → DEFER to existing `forge`. Avoids a 2nd forge; NO `forge_lit`
//                    state (would clash with forge/forge_cold polarity). Skip it.
//   blacksmithanvil→ DEFER to existing `anvil`. Skip.
//   troughwater    → DEFER to existing `wateringtrough`. Skip.
//   beehiveskep    → DEFER to existing `beehive`/`beehouse`. Skip.
//   wellsweep      → FREE (distinct shadoof / counterweighted sweep-arm well).
//   wellbucket     → FREE (windlass-and-bucket well; distinct read from `well`).
//   woodpile/choppingblock/handcart/laundryline/pigpen/hay_wain → FREE.
//
// The `mill_water`/`mill_wind`/`dovecote` 'set' rows are SCATTER_SETS prefabs
// (NOT props). This group owns their brand-new base members:
//   millbody         — mill house block (mill_water & mill_wind base)
//   waterwheel       — the water-mill wheel; state `waterwheel_turning` (spec `wheel_turning`)
//   windmillsails    — the windmill sail-cross; state `windmillsails_turning` (spec `sails_turning`)
//   dovecotebody     — dovecote tower with pigeon holes
// Anim state ids renamed to `<baseid>_turning` (unique-state rule). Orchestrator
// wires the sets post-build; member lists in the digest.

import type { PropDef } from '@/render/props'
// import { cutout, rect, ring, scatterDots } from './kit'

export const WORKING: PropDef[] = [
  // {
  //   id: 'woodpile', size: 0.9, wonk: 0.04,
  //   paths: [...cutout(STACK_D, 'woodDeep', 'wood'), { d: LOGENDS_D, fill: 'woodLight' }],
  //   kinds: ['stump'], themes: ['village', 'farm', 'city'], role: 'field', rotate: 'upright',
  //   weight: 0.6, pass: 'solid', footprint: 0.3, gameplay: ['gather'], tags: ['field'],
  // },
]
