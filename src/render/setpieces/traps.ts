// ── Setpieces: Traps & hazards (pit · dart trap · snare · pressure plate · fire jet · caltrops …) ──
//
// Bucket: STONE (dungeon/mountain — where `spiketrap`/`cage` already live).
// Builder: fill with COMPLETE PropDefs (full inline placement meta) — entries
// flow into TERRAIN_PROPS + listAssets with NO shared-file edits. props.ts
// spreads this array into the `stone` bucket, then variants().
//
// Geometry from './kit' only (type-only PropDef import). Gameplay verbs for this
// group → GameplayTag: trigger/fall/damage/barrier/hazard/snare/ambush (all now
// in the union). `hazard`/`trap`/`hidden`/`anim` are also freeform `tags`.
// Hidden traps → tags:['trap','hidden']; a flat decal → rotate:'flat',
// pass:'walkable', layer:'ground'; `on-lava` fire hazards → tags:['on-lava'].
// Full guide (defaults, state-pair rule, collision verdicts): scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION: `spiketrap` already exists (stone; dungeon) — do NOT redefine it;
// the orchestrator aligns its meta to the spec row. Author only NEW trap ids.

import type { PropDef } from '@/render/props'
// import { cutout, ring, rect, polyPath, scatterDots } from './kit'

export const TRAPS: PropDef[] = [
  // {
  //   id: 'firejet', size: 0.9,
  //   paths: [{ d: glowHalo(0.5), fill: 'ember', opacity: 0.3 }, ...cutout(NOZZLE_D, 'rockDeep', 'rock')],
  //   kinds: ['rock', 'stump'], themes: ['dungeon', 'volcanic'], role: 'field', rotate: 'upright',
  //   weight: 0.3, pass: 'solid', footprint: 0.2, tags: ['trap', 'hazard', 'glow', 'on-lava'],
  //   gameplay: ['trigger', 'damage'], light: { color: 'ember', radius: 1.5 }, anim: true,
  // },
]
