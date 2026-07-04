// ── Paper palette ────────────────────────────────────────────────────────────
//
// The single color vocabulary of the 'paper' visual language (asset-pipeline
// step 2 — see BACKLOG → Graphics): every fill/stroke in paper-skin assets
// (token bodies, terrain blobs, scatter props) resolves to a named ROLE here,
// never a rogue hex at the point of use. One light direction + one palette is
// where the "50 elements read as one style" polish comes from, so keep new
// colors HERE and reference them by role. Roles are opaque hexes; translucency
// is applied at the use site (fill-opacity) so a role stays reusable.

import type { Tone } from '@/render/appearance'

// Two-tone flat palette per token tone: `top` is the cutout's lit face, `base`
// shows as a darker rim along the bottom-right (the same path drawn twice, the
// top copy nudged up-left) — the pseudo-3D read without a single gradient/filter.
export const PAPER_TONE: Record<Tone, { top: string; base: string; outline: string; text: string }> = {
  player:  { top: '#5577dd', base: '#2e4187', outline: '#141d42', text: '#eef3ff' },
  casting: { top: '#5577dd', base: '#2e4187', outline: '#fbbf24', text: '#fef3c7' },
  enemy:   { top: '#cc5244', base: '#79281f', outline: '#3c110b', text: '#ffedea' },
  neutral: { top: '#c99a4c', base: '#77571f', outline: '#3c2b0d', text: '#fdf4dd' },
}

// Terrain + prop material roles. Mottle shades sit deliberately CLOSE to their
// biome's ground tile (skins.tsx) — they're large soft patches, not features.
export const PAPER_PALETTE = {
  ink:    '#2b3138',   // hard outlines on light material (weapon edges, crate straps)
  cream:  '#e8e3d2',   // light material accents (blades, staff orbs, bone)
  steel:  '#cdd5de',   // weapon metal (sword/dagger blades)
  shadow: '#000000',   // ground-contact shadows (always with fill-opacity ≈0.35)

  // walls / cliffs / the map rim (one rock material for all of them)
  wallTop:     '#474033',
  wallBase:    '#282218',
  wallOutline: '#120f0a',
  cliffFill:   '#4a3623',
  cliffEdge:   '#a37c48',

  // floor-mottle shades, one light/dark pair per biome
  grassLight: '#202818', grassDark: '#11150b',
  stoneLight: '#282d34', stoneDark: '#0e1013',
  plazaLight: '#2c2719', plazaDark: '#0f0d09',

  // §mapgen surface plane (terrain.tsx spec consumption): material washes laid
  // over the biome ground. Values sit near the mottle shades — large soft
  // regions, not features — except the two waters, which must READ as water.
  meadowWash:   '#2c3d1c',
  sandWash:     '#4f472e',
  waterShallow: '#2b5666',
  waterDeep:    '#183848',

  // prop materials
  foliage:     '#33441f',
  foliageDeep: '#1f2c12',
  bloom:       '#a8798c',
  rock:        '#565d66',
  rockDeep:    '#383e45',
  wood:        '#7a5a33',
  woodDeep:    '#4a3620',
  woodLight:   '#a8703d',   // warm finished wood (bow limbs, handles)
  canvas:      '#8a7a55',

  // ── City building materials (render/buildings.ts) ──────────────────────────
  // The town-tile catalog: a BUILDING_LOOKS entry keys off a BarrierMaterial, so
  // any wall rect the city recipe (or a future procgen city) tags gets a themed
  // structure — pitched two-tone roof, a sliver of lit wall at the eaves, a cast
  // shadow. Two tones per surface (lit face + shade) so the pitch reads without a
  // single gradient, exactly like the token cutout.
  roofRidge:   '#1b140c',   // ridge/eave ink shared by every roof

  // timber house — daub walls, warm terracotta-tile roof
  plaster:     '#b6a480',
  plasterDark: '#7d6d4e',
  roofTile:    '#b5613a',
  roofTileDark:'#743a22',

  // cut-stone hall — dressed grey stone, cool slate roof
  stoneWall:     '#9a9280',
  stoneWallDark: '#605a4a',
  roofSlate:     '#5d6879',
  roofSlateDark: '#38404e',

  // half-timbered (Tudor) house — cream daub panels + dark timber framing +
  // a warm brown shingled roof (the iconic Ragnarok-Prontera townhouse)
  plasterWhite: '#d6cbb2',
  timberFrame:  '#34261a',
  roofShingle:  '#6f4b30',
  roofShingleDark: '#3f2717',

  // city landmarks / street furniture (render/terrain.tsx + props.ts)
  fountainWater: '#2f6f86',   // fountain basin water (reads bluer than pond water)
  lampGlow:      '#ecc665',   // lit street-lamp head
  lampPost:      '#2b2a26',
  bannerBlue:    '#3c5ba6',   // hanging heraldic banner
  bannerBlueDk:  '#243a71',
  bannerGold:    '#c7a54a',   // banner trim / crest
  pineLit:       '#41562a',   // conifer highlight (over foliageDeep)

  // ── City ground surfaces (render/terrain.tsx spec consumption) ─────────────
  // Paved regions of a city's surface plane read as distinct materials over the
  // biome ground: warm cobbled roads, a pale flagstone plaza, packed-dirt yards.
  // Two tones each drive a seeded stone-mosaic texture (flat marks, no gradient).
  roadPave:    '#a99f85',   // pale cobbled street (Prontera's light flagstone read)
  roadPaveLit: '#c1b79a',   // lit cobble face
  roadSeam:    '#6a6150',   // mortar seams between rounded cobbles
  flagstone:   '#b6ac90',   // plaza paving — the palest, most dressed stone
  flagstoneLit:'#cabfa2',
  flagSeam:    '#726954',
  dirtPath:    '#5a4a30',   // packed-dirt lot (browner + dimmer than the paving)
  yardWash:    '#26331a',   // grass yards/commons between the streets
} as const

export type PaperRole = keyof typeof PAPER_PALETTE
