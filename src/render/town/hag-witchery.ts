// ── Hag: Witchery (big cauldron · herb drying · charms · potion shelf · raven · crow cage · fungi · scrying · effigy · salt circle · totem · spellbook · candles) ──
//
// Bucket: STONE (the witch's ritual kit — mirrors wave-2 ritual → stone).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `stone`, then variants(). Geometry
// from './kit' only. Full guide: scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   cauldron_big          role use,brew → gameplay:['use','brew'], role:'accent'
//   herbdrying            role '-' → role:'accent', layer:'canopy'
//   hangingcharms         role '-' → role:'edge', layer:'wall'
//   potionshelf           role search → gameplay:['search'], role:'accent', state potionshelf_ransacked
//   ravenperch/gnarledtotem/crowcage/scryingpool/witcheffigy  role '-'/verb → role:'accent'
//   mushroomgarden/toadstoolbed  role forage → gameplay:['forage'], role:'cluster'
//   saltcircle            role '-' → role:'field' (flat decal, rotate:'flat')
//   spellbook             role read,loot → gameplay:['read','lootable'], role:'field'
//   candlecluster         role '-' → role:'field'
//
// LAYER: herbdrying → layer:'canopy'; hangingcharms → layer:'wall'; saltcircle →
// rotate:'flat'/layer:'ground'; scryingpool → layer:'ground' (FOUNTAIN PRECEDENT:
// spec tags `water-surface` but themes carry NO water — a ground scrying basin,
// not a prop on a water plane; keep 'water-surface' as a descriptive tag only).
// Rest ground.
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   cauldron_big → FREE, KEEP (a large witch's cauldron over a fire — distinct
//                  hero prop from the small artisan `cauldron`). Its state is
//                  `cauldron_big_bubbling` (NOT the existing `cauldron_bubbling`).
//   effigy       → RENAME to `witcheffigy` (wave-2 ritual/lore already own bare
//                  `effigy`; ids are globally unique). State `witcheffigy_burned`.
//   bonepile     → DEFER to wave-2 lore `bonepile` (that group authors it; ids
//                  globally unique). Orchestrator adds swamp/haunted themes. Skip.
//   crowcage     → FREE (hanging crow cage; distinct from existing `cage`). State
//                  `crowcage_open` (NOT bare `cage_open`).
//   gnarledtotem → FREE (distinct name; NOT the bare `totem` wave-2 owns).
//   potionshelf  → FREE. State `potionshelf_ransacked` (NOT bare `shelf_ransacked`).
//   saltcircle   → FREE (distinct from `magiccircle`). State `saltcircle_broken`.
//   spellbook    → FREE. State `spellbook_taken` (NOT bare `book_taken`).
//   candlecluster→ FREE (distinct from wave-2 `candlerow`). State `candlecluster_lit`.
//   mushroomgarden→ FREE. State `mushroomgarden_picked` (NOT bare `garden_picked`).
//   herbdrying/hangingcharms/ravenperch/toadstoolbed/scryingpool → FREE.
//
// GLOW/LIGHT: mushroomgarden → `glowFungus` halo; scryingpool → `arcaneGlow`
// halo; cauldron_big/candlecluster → `ember`/`lampGlow` halo. Flat `glowHalo`
// UNDER the object + `light:{color,radius}` (+ anim). NO filters (Palette test).
// All `_bubbling`/`_lit`/`_picked`/`_burned`/`_broken`/`_ransacked`/`_taken`
// companions reuse base geometry, kinds:[] + tags:['interactable'], pass+footprint.

import type { PropDef } from '@/render/props'
// import { cutout, ring, lobeBlob, scatterDots, glowHalo } from './kit'

export const HAG_WITCHERY: PropDef[] = [
  // {
  //   id: 'cauldron_big', size: 1.05, wonk: 0.03,
  //   paths: [{ d: glowHalo(0.5, 0, 0.2), fill: 'ember', opacity: 0.25 },
  //           ...cutout(POT_D, 'rockDeep', 'rock'), { d: LEGS_D, stroke: 'ink', sw: 0.06 }],
  //   kinds: ['rock', 'stump'], themes: ['swamp', 'haunted', 'arcane'], role: 'accent',
  //   rotate: 'upright', weight: 0.2, pass: 'solid', footprint: 0.4,
  //   gameplay: ['use', 'brew'], light: { color: 'ember', radius: 2 }, anim: true,
  //   tags: ['workstation', 'light', 'anim'],
  // },
  // State pair — bubbling brew: { id: 'cauldron_big_bubbling', size: 1.05,
  //   paths: [/* pot + green surface + bubbles */], kinds: [], tags: ['interactable'],
  //   pass: 'solid', footprint: 0.4 },
]
