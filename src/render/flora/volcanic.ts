// ── Flora catalog: Volcanic flora (ashfern · emberbloom · cinder moss · sulfur bloom · charthorn …) ──
//
// Heat-adapted + charred growth. Builder: fill with COMPLETE PropDefs (full inline
// placement meta) — entries flow into TERRAIN_PROPS + listAssets with NO
// shared-file edits. props.ts spreads this array into the `stone` bucket (where
// volcanic props live), then variants().
//
// GLOW WITHOUT FILTERS: a flat `glowHalo(r)` blob filled `ember`/`arcaneGlow` at
// low fill-opacity under the plant; set `light: { color: 'ember', radius }` +
// `anim: true` for ember/heat props. Charred silhouettes use ink/emberDeep/
// bloodDry. Geometry from './kit' only (type-only PropDef). Full guide:
// scratchpad/flora-digest.md.

import type { PropDef } from '@/render/props'
// import { cutout, glowHalo, ring, radialStar } from './kit'

export const VOLCANIC_FLORA: PropDef[] = [
  // Example (delete when authoring):
  // {
  //   id: 'emberbloom', size: 0.9,
  //   paths: [{ d: glowHalo(0.6), fill: 'ember', opacity: 0.3 }, ...cutout(BLOOM_D, 'emberDeep', 'ember')],
  //   kinds: ['flower', 'bush'], themes: ['volcanic'], role: 'accent', rotate: 'upright',
  //   weight: 0.4, pass: 'walkable', footprint: 0.2, tags: ['glow', 'heat'],
  //   light: { color: 'ember', radius: 1.5 }, anim: true, maxPerChunk: 3,
  // },
]
