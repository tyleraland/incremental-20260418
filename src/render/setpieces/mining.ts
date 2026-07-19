// ── Setpieces: Mining (ore node · gem vein · coal seam · pan/sluice · mine shaft · rubble dig …) ──
//
// Bucket: STONE (mountain/cave — where `orevein`/`minecart`/`mineentrance` live).
// Builder: fill with COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets
// with NO shared-file edits; props.ts spreads into `stone`, then variants().
// Geometry from './kit' only. Ore glints = a small flat `ring` accent in a metal
// role over the two-tone rock; `glow`/`ore` crystal nodes may add a flat halo.
//
// Gameplay verbs → GameplayTag: dig/pan/mine/descend + harvestable (existing).
// `ore`/`glow`/`fungus` are freeform `tags`. Mined-out companion (state pair)
// reuses the rock silhouette with the vein struck out: kinds:[] + ['interactable'].
// Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS (defer-to-existing — orchestrator aligns meta, add `mine` gameplay):
//   orevein, minecart, mineentrance already props. Author only NEW mining ids
//   (gemvein, coalseam, sluice, panspot, …).

import type { PropDef } from '@/render/props'
// import { cutout, ring, polyPath, scatterDots, glowHalo } from './kit'

export const MINING: PropDef[] = [
  // {
  //   id: 'gemvein', size: 0.9,
  //   paths: [...cutout(ROCK_D, 'rockDeep', 'rock'), { d: scatterDots(hashString('gemvein'), 4, 0.9, 0.07, 0.11), fill: 'crystal' }],
  //   kinds: ['rock'], themes: ['mountain', 'cave', 'dungeon'], role: 'accent', rotate: 'free',
  //   weight: 0.25, pass: 'solid', footprint: 0.35, near: ['wall', 'rock'], tags: ['ore', 'glow'],
  //   gameplay: ['mine', 'harvestable'], maxPerChunk: 2,
  // },
  // Mined-out companion: { id: 'gemveinspent', size: 0.9, paths: [/* struck rock */], kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.35 },
]
