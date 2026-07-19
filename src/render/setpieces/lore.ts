// ── Setpieces: Environmental storytelling (abandoned camp · corpse · bonepile · gibbet · effigy · lore stone …) ──
//
// Bucket: GRASS (wilderness lore — where `gravestone`/`tent`/`campcold`/`camp`
// SCATTER_SET members live). Builder: fill COMPLETE PropDefs — flow into
// TERRAIN_PROPS + listAssets with NO shared-file edits; props.ts spreads into
// `grass`, then variants(). Geometry from './kit' only.
//
// Gameplay verbs → GameplayTag: read/search/rest/warm/spread(decay) + lootable.
// `lore`/`grim`/`ominous`/`camp`/`corrupt` are freeform `tags`. Readable stones →
// gameplay:['read'], tags:['lore']. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// `abandonedcamp` (spec kinds:'set') is a SCATTER_SETS PREFAB, not a prop — do
// NOT author it here and do NOT edit props.ts's SCATTER_SETS (shared file).
// Instead author its member props (bedroll NEW; `tent`/`campcold`/`sack` already
// exist), and the ORCHESTRATOR adds the `abandonedcamp` SCATTER_SETS entry after
// this file merges (member-id existence is gated by AssetCatalog.test, so the set
// can only be wired once every member prop exists — keeping CI green with stubs).
//
// COLLISIONS (defer-to-existing): gravestone, sarcophagus, tent, campcold, cage,
// skull, bone, bloodstain already props. NEW lore ids: corpse, bonepile, gibbet,
// effigy, totem, bedroll, lorestone, hangingcage, …

import type { PropDef } from '@/render/props'
// import { cutout, ring, rect, polyPath, scatterDots } from './kit'

export const LORE: PropDef[] = [
  // {
  //   id: 'bedroll', size: 0.8,
  //   paths: [...cutout(ROLL_D, 'canvasDeep', 'canvas')],
  //   kinds: ['stump', 'rock'], themes: ['plains', 'forest', 'mountain'], role: 'field', rotate: 'free',
  //   weight: 0.3, pass: 'walkable', footprint: 0.25, tags: ['camp'], gameplay: ['rest'],
  // },
]
