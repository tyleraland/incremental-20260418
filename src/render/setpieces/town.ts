// ── Setpieces: Town fixtures (street lamp · notice board · well · fountain · signpost · wall banner · save point …) ──
//
// Bucket: PLAZA (city — where `bench`/`marketstall`/`signpost` live). Builder:
// fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only.
//
// Gameplay verbs → GameplayTag: read/quest/trade/sit/rest/save/warp/drink.
// `social`/`furniture`/`regal`/`cloth`/`light`/`wall-edge` are freeform `tags`.
// Lit lamps → flat `lampGlow` halo + light:{color:'lampGlow'} + tags:['light'].
// A wall banner → layer:'wall', rotate:'flat', tags:['cloth','wall-edge'].
// UNIQUE STATE-ID RULE: `streetlamp` lit-state is `streetlamp_lit` (NOT the
// bare `lamp_lit` the spec reuses — see furniture's `floorlamp_lit`).
// Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS (defer-to-existing): well, signpost, bench, marketstall, statue,
// shrine, fishnet already props. `lamppost`/`banner` are the DECOR_RING assets
// (empty kinds by design). NEW town ids: streetlamp, wallbanner, noticeboard,
// fountain(prop — only a terrain landmark markup exists today), savepoint, …

import type { PropDef } from '@/render/props'
// import { cutout, ring, rect, glowHalo } from './kit'

export const TOWN: PropDef[] = [
  // {
  //   id: 'streetlamp', size: 1.1,
  //   paths: [{ d: glowHalo(0.4, 0, -0.55), fill: 'lampGlow', opacity: 0.3 }, ...cutout(POST_D, 'woodDeep', 'wood'), { d: LANTERN_D, fill: 'lampGlow' }],
  //   kinds: ['tree'], themes: ['city'], role: 'edge', rotate: 'upright',
  //   weight: 0.3, pass: 'solid', footprint: 0.2, tall: true, tags: ['light', 'social'],
  //   gameplay: ['use'], light: { color: 'lampGlow', radius: 2 },
  // },
  // Lit companion (state pair): { id: 'streetlamp_lit', size: 1.1, paths: [/* brighter halo */], kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.2 },
]
