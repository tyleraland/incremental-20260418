// ── Setpieces: Spawners (monster nest · egg cluster · cocoon · spawn pole · rift · web sac …) ──
//
// Bucket: STONE (dungeon/haunted enemy dens — where `cage`/`skull`/`cobweb` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `stone`, then variants(). Geometry
// from './kit' only.
//
// Gameplay verbs → GameplayTag: spawn/squish/ambush + destructible. `enemy`/
// `web`/`ominous`/`corrupt`/`anim`/`glow` are freeform `tags`. Portal spawners →
// flat `arcaneGlow` halo + light + tags:['portal','glow']. Squishable egg/sac →
// gameplay:['spawn','squish','destructible']. State pair (destroyed nest) reuses
// geometry, kinds:[] + ['interactable']. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION: `slime`/`mimic` are MONSTER ids (different namespace — safe to use
// as prop ids, but avoid the confusion; prefer descriptive prop ids). Author all
// NEW spawner ids (nest, cocoon, eggcluster, spawnpole, portalrift, …).

import type { PropDef } from '@/render/props'
// import { cutout, ring, lobeBlob, scatterDots, glowHalo } from './kit'

export const SPAWNERS: PropDef[] = [
  // {
  //   id: 'eggcluster', size: 0.85,
  //   paths: [...cutout(SAC_D, 'murkDeep', 'murk'), { d: scatterDots(hashString('eggcluster'), 5, 0.9, 0.09, 0.13), fill: 'cream' }],
  //   kinds: ['bush', 'flower'], themes: ['dungeon', 'haunted', 'swamp'], role: 'accent', rotate: 'upright',
  //   weight: 0.2, pass: 'solid', footprint: 0.3, tags: ['enemy', 'ominous'],
  //   gameplay: ['spawn', 'squish', 'destructible'], maxPerChunk: 2,
  // },
]
