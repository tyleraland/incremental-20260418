// ── Setpieces: Fishing (dock · fishing spot · crab pot · fish trap · tackle box · rod rack · fish barrel …) ──
//
// Bucket: GRASS (water/beach — where `buoy`/`pier`/`rowboat`/`fishnet`/`seashells`
// live). Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets
// with NO shared-file edits; props.ts spreads into `grass`, then variants().
// Geometry from './kit' only.
//
// Gameplay verbs → GameplayTag: fish/gather/use + lootable (traps). `fish`/
// `on-water`/`water-surface`/`float` are freeform `tags`. Floating props (buoy/
// pot markers) → layer:'water-surface', pass:'walkable' (SKIPPED on legacy
// no-water maps — themes MUST include water/beach). Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS (defer-to-existing): buoy, pier, fishnet, rowboat, seashells, coral,
// tidepool, sandcastle already props. NOTE spec `seashell` (singular) ≠ existing
// `seashells` — a distinct id (fine, but note the near-collision). NEW fishing
// ids: dock, crabpot, fishtrap, tacklebox, fishbarrel, fishingrod, seashell, …

import type { PropDef } from '@/render/props'
// import { cutout, rect, ring, polyPath } from './kit'

export const FISHING: PropDef[] = [
  // {
  //   id: 'crabpot', size: 0.7,
  //   paths: [...cutout(POT_D, 'woodDeep', 'wood')],
  //   kinds: ['reed'], themes: ['water', 'beach'], role: 'field', rotate: 'free',
  //   weight: 0.3, pass: 'walkable', footprint: 0.2, near: ['water'], layer: 'water-surface',
  //   tags: ['fish', 'on-water', 'water-surface'], gameplay: ['fish', 'lootable'],
  // },
]
