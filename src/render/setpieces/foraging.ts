// ── Setpieces: Foraging (herb patch · mushroom log · root bulb · forage berry · dig spot · nut pile …) ──
//
// Bucket: GRASS (nature — where `digspot`/`beehive`/`mushroom` live). Builder:
// fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `grass`, then variants(). Geometry
// from './kit' only.
//
// Gameplay verbs → GameplayTag: forage/gather/dig + harvestable. `forage`/
// `fungus`/`glow`/`hidden` are freeform `tags`. Gathered/dug companion (state
// pair) reuses geometry, cropped: kinds:[] + tags:['interactable']. Glowing
// fungus → flat `glowFungus` halo + light. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION (defer-to-existing — orchestrator owns it): `digspot` already exists
// (grass; desert/beach; gameplay lootable). Spec wants dig+lootable, +plains/
// forest themes, and a `digspot_dug` state pair. Do NOT redefine `digspot` here;
// the orchestrator aligns its meta + adds `digspot_dug`. Author only NEW forage ids.

import type { PropDef } from '@/render/props'
// import { cutout, ring, lobeBlob, scatterDots, glowHalo } from './kit'

export const FORAGING: PropDef[] = [
  // {
  //   id: 'herbpatch', size: 0.85,
  //   paths: [...cutout(LEAVES_D, 'foliageDeep', 'foliage'), { d: FLOWER_D, fill: 'bloom' }],
  //   kinds: ['flower', 'bush'], themes: ['forest', 'plains'], role: 'cluster', rotate: 'upright',
  //   weight: 0.5, pass: 'walkable', footprint: 0.2, tags: ['forage'],
  //   gameplay: ['forage', 'harvestable'], clusterWith: ['herbpatch'],
  // },
  // Foraged companion: { id: 'herbpatchspent', size: 0.85, paths: [/* stems only */], kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.15 },
]
