// ── Setpieces: Artisan machines (anvil · forge · loom · kiln · furnace · millstone · cauldron …) ──
//
// Bucket: PLAZA (city workshops — where `marketstall`/`bench`/`weaponrack` live).
// Builder: fill COMPLETE PropDefs — flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits; props.ts spreads into `plaza`, then variants(). Geometry
// from './kit' only.
//
// Each machine carries tags:['workstation'] PLUS its distinct process verb as a
// GameplayTag: use/smelt/craft/process/brew/cook (all in the union now). Hot
// machines (forge/kiln/furnace) → flat `ember` glowHalo + light:{color:'ember'} +
// tags:['workstation','glow','anim'] + gameplay:['smelt']/['craft']. `wall-edge`
// mounted racks → layer:'wall'. Full guide: scratchpad/flora-digest.md (WAVE 2).
//
// COLLISION: none of the machine ids exist yet (anvil/forge/loom/kiln/… all NEW).
// `weaponrack` already exists (defer). Author all NEW artisan ids.

import type { PropDef } from '@/render/props'
// import { cutout, ring, rect, polyPath, glowHalo } from './kit'

export const ARTISAN: PropDef[] = [
  // {
  //   id: 'forge', size: 1,
  //   paths: [{ d: glowHalo(0.5), fill: 'ember', opacity: 0.35 }, ...cutout(BODY_D, 'rockDeep', 'rock'), { d: COALS_D, fill: 'ember' }],
  //   kinds: ['stump', 'tree'], themes: ['city'], role: 'accent', rotate: 'upright',
  //   weight: 0.3, pass: 'solid', footprint: 0.4, tags: ['workstation', 'glow', 'anim'],
  //   gameplay: ['smelt', 'use'], light: { color: 'ember', radius: 1.8 }, anim: true, maxPerChunk: 2,
  // },
]
