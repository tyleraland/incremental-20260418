// ── Town: Market (fishmonger · produce cart · butcher hook · bakery cart · potter rack · awning · crate · scales) ──
//
// Bucket: PLAZA (city/village fixtures — where `marketstall`/`bench` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with
// NO shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   fishmonger/producecart/bakerycart  role trade → gameplay:['trade'], role:'accent'
//                                      (signature market pieces, low weight)
//   butcherhook           role '-' → role:'edge' (wall-mounted), layer:'wall'
//   cloth_awning          role '-' → role:'accent', layer:'canopy'
//   crateburlap           role search → gameplay:['search'], role:'field'
//   potterrack/scalesweigh role '-' → role:'field'
//
// LAYER: wall-edge (butcherhook) → layer:'wall'; canopy (cloth_awning) →
// layer:'canopy'; rest ground.
//
// COLLISIONS (digest WAVE 3):
//   marketstall → RE-DEFER. Existed before wave 2 and was deferred then; still a
//                 shared prop. Do NOT author it here.
//   crateburlap → FREE (burlap-covered crate; distinct from wave-1 `crate`).
//   fishmonger/producecart/butcherhook/bakerycart/potterrack/cloth_awning/
//   scalesweigh → FREE (no existing analogues).

import type { PropDef } from '@/render/props'
// import { cutout, rect, ring } from './kit'

export const MARKET: PropDef[] = [
  // {
  //   id: 'producecart', size: 1.05, wonk: 0.03,
  //   paths: [...cutout(BODY_D, 'woodDeep', 'wood'), { d: WHEEL_D, fill: 'woodDeep' },
  //           { d: PRODUCE_D, fill: 'gourdOrange' }],
  //   kinds: ['stump', 'rock'], themes: ['village', 'farm'], role: 'accent', rotate: 'upright',
  //   weight: 0.25, pass: 'solid', footprint: 0.35, gameplay: ['trade'], tags: ['social'],
  // },
]
