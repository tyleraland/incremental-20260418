// ── Setpieces: Furniture (table · chair · bed · desk · wardrobe · rug · fireplace · floor lamp …) ──
//
// Bucket: PLAZA (city interiors — where `bench`/`bookshelf`-adjacent decor live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only (rect() is the workhorse for tabletops/frames).
//
// Gameplay verbs → GameplayTag: sit/rest/use/warm. `furniture`/`regal`/`cloth`/
// `light` are freeform `tags`. Fireplace → flat `ember` halo + light + warm.
// Floor lamp lit-state → UNIQUE id `floorlamp_lit` (the spec reuses `lamp_lit`
// for both this and streetlamp — disambiguate per base id; see town.ts).
// `table_var`/`chair_var` = a second style variant (a distinct authored id, not
// the auto `~` variant). Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS: `bench`/`bookshelf` already props (defer). NEW furniture ids:
// table, table_var, chair, bed, bedroll, desk, wardrobe, stool, rug, fireplace,
// floorlamp, … (none currently exist — `table` does NOT exist despite `table_var`).

import type { PropDef } from '@/render/props'
// import { cutout, rect, ring, glowHalo } from './kit'

export const FURNITURE: PropDef[] = [
  // {
  //   id: 'table', size: 1,
  //   paths: [...cutout(rect(-0.6, -0.2, 1.2, 0.5), 'woodDeep', 'wood')],
  //   kinds: ['stump'], themes: ['city'], role: 'field', rotate: 'upright',
  //   weight: 0.4, pass: 'solid', footprint: 0.4, near: ['wall'], tags: ['furniture'],
  //   gameplay: ['use'],
  // },
]
