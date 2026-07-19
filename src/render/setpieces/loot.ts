// ── Setpieces: Loot & containers (lockbox · mimic chest · reliquary · barrel cache · loot pile …) ──
//
// Bucket: STONE (dungeon/ruins — where `chest`/`hoard`/`coin`/`gem` live).
// Builder: fill with COMPLETE PropDefs (full inline placement meta) — flow into
// TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts spreads this
// array into the `stone` bucket, then variants(). Geometry from './kit' only.
//
// Gameplay verbs → GameplayTag: lootable (existing) / lock. `treasure`/`locked`/
// `artifact`/`rare` are freeform `tags`. A locked container → gameplay:['lootable','lock'],
// tags:['treasure','locked']. Opened-state companion (state pair) reuses the
// base geometry, lid ajar: kinds:[] + tags:['interactable'] (like `chestopen`).
// Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS (defer-to-existing — do NOT redefine; orchestrator aligns meta):
//   chest, chestopen, hoard, coin, gem — all already props. Author only NEW loot ids.
//   `mimic` monster BodyShape exists but is a DIFFERENT namespace (assetKey =
//   category:id); prefer prop id `mimicchest` to keep gallery search unambiguous.

import type { PropDef } from '@/render/props'
// import { cutout, ring, rect, scatterDots } from './kit'

export const LOOT: PropDef[] = [
  // {
  //   id: 'lockbox', size: 0.8,
  //   paths: [...cutout(BOX_D, 'woodDeep', 'wood'), { d: LOCK_D, fill: 'bannerGold' }],
  //   kinds: ['stump', 'rock'], themes: ['dungeon', 'ruins', 'city'], role: 'accent', rotate: 'upright',
  //   weight: 0.15, pass: 'solid', footprint: 0.3, tags: ['treasure', 'locked'],
  //   gameplay: ['lootable', 'lock'], maxPerChunk: 1,
  // },
  // Opened companion (state pair): { id: 'lockboxopen', size: 0.8, paths: [/* lid ajar */], kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3 },
]
