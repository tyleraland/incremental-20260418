// ── Setpieces: Arcane ritual (menhir · dolmen · sacrifice stone · offering bowl · candle ring · effigy …) ──
//
// Bucket: STONE (arcane/dungeon/haunted — where `altar`/`runestone`/`magiccircle`
// /`brazier` live). Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS +
// listAssets with NO shared-file edits; props.ts spreads into `stone`, variants().
//
// GLOW WITHOUT FILTERS: flat `glowHalo(r)` filled `arcaneGlow` at low opacity
// under the stone; set light:{ color:'arcaneGlow', radius } + anim:true for
// pulsing wards. Gameplay verbs → GameplayTag: ritual/offer/curse/warp/warm +
// use. `menhir`/`ominous`/`corrupt`/`glow`/`portal`/`regal` are freeform `tags`.
// Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISIONS (defer-to-existing): altar, runestone, magiccircle, portalframe,
// brazier, shrine already props — author only NEW ritual ids (menhir, dolmen,
// sacrificestone, offeringbowl, candlerow, effigy, totem, …).

import type { PropDef } from '@/render/props'
// import { cutout, ring, polyPath, radialStar, glowHalo } from './kit'

export const RITUAL: PropDef[] = [
  // {
  //   id: 'menhir', size: 1.1,
  //   paths: [{ d: glowHalo(0.55), fill: 'arcaneGlow', opacity: 0.28 }, ...cutout(STONE_D, 'rockDeep', 'rock'), { d: RUNE_D, fill: 'arcaneGlow' }],
  //   kinds: ['rock', 'tree'], themes: ['arcane', 'ruins', 'mountain'], role: 'accent', rotate: 'upright',
  //   weight: 0.2, pass: 'solid', footprint: 0.4, tall: true, tags: ['menhir', 'glow', 'ominous'],
  //   gameplay: ['ritual', 'offer'], light: { color: 'arcaneGlow', radius: 2 }, anim: true, maxPerChunk: 2,
  // },
]
