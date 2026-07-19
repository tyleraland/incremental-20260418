// ── Town: Tavern (hitching post · lantern hook · torch bracket) + the tavern 'set' ──
//
// Bucket: PLAZA (city/village fixtures). Builder: fill COMPLETE PropDefs — flow
// into TERRAIN_PROPS + listAssets with NO shared-file edits; props.ts spreads
// into `plaza`, then variants(). Geometry from './kit' only. Full guide:
// scratchpad/flora-digest.md (WAVE 3).
//
// ROLE COLUMN CONVENTION: verb values → gameplay; real roles stay. Per row:
//   hitchingpost          role '-' → role:'field'
//   lanternhook/torchbracket role '-' → role:'edge', layer:'wall' (wall-mounted)
//
// LAYER: lanternhook/torchbracket → layer:'wall'; hitchingpost ground.
//
// COLLISIONS (arbitrated in digest WAVE 3):
//   alebarrel    → DEFER to existing `keg` (both are barrels; `cask` also exists). Skip.
//   tavernbench  → DEFER to existing `bench` (orchestrator adds sit gameplay + village). Skip.
//   tavertable   → typo for taverntable; DEFER to existing `table`/`table_var`. Skip.
//   notice_board → DEFER to existing `bulletinboard` (orchestrator adds quest gameplay). Skip.
//   hitchingpost → FREE (no existing analogue).
//   torchbracket → FREE (wall-mounted torch; no existing `torch` prop). LIGHT +
//                  state `torchbracket_lit` (NOT bare `torch_lit` — unique-state rule).
//   lanternhook  → FREE. LIGHT + state `lanternhook_lit` (NOT bare `lantern_lit`).
//
// GLOW/LIGHT: `<base>_lit` companions draw a flat `glowHalo` filled `lampGlow` at
// low opacity UNDER the fixture + declare `light:{color:'lampGlow',radius}`
// (+ anim for torchbracket flame). NO filters/gradients (Palette test).
//
// The `tavern` 'set' row is a SCATTER_SETS prefab (NOT a prop): reuses the
// structures group's `housewall`/`roofgable`/`door_arched`/`innsign` + existing
// `keg`/`bench` + this group's `hitchingpost`. Orchestrator wires it post-build;
// member list in the digest.

import type { PropDef } from '@/render/props'
// import { cutout, rect, ring, glowHalo } from './kit'

export const TAVERN: PropDef[] = [
  // {
  //   id: 'torchbracket', size: 0.85, wonk: 0.03,
  //   paths: [{ d: BRACKET_D, stroke: 'rock', sw: 0.06 }, { d: TORCH_D, fill: 'woodDeep' }],
  //   kinds: ['tree', 'flower'], themes: ['city', 'village', 'dungeon'], role: 'edge',
  //   rotate: 'upright', weight: 0.4, pass: 'walkable', footprint: 0.15, layer: 'wall',
  //   tags: ['light'],
  // },
  // State pair — lit torch: { id: 'torchbracket_lit', size: 0.85,
  //   paths: [{ d: glowHalo(0.4, 0, -0.4), fill: 'lampGlow', opacity: 0.3 }, /* bracket + flame */],
  //   kinds: [], tags: ['interactable', 'light'], pass: 'walkable', footprint: 0.15,
  //   light: { color: 'lampGlow', radius: 2 }, anim: true },
]
