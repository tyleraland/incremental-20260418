import type { CSSProperties } from 'react'
import { createElement } from 'react'

// ── Sprite pipeline ──────────────────────────────────────────────────────────
//
// CC0 Kenney atlases (public/sprites/, see CREDITS.txt) drawn as compositor-cheap
// CSS background cells — no <canvas>, no per-frame JS, matching BattleView's
// "transitions + transform, never rAF" rule. A sprite is just (sheet, cell):
// `spriteCellStyle` scales the whole atlas so the chosen 16px cell fills the
// token box and pins it via background-position. `image-rendering: pixelated`
// keeps the pixel art crisp when scaled up on a hi-dpi phone.
//
// This is the "skin" data layer; the appearance resolver picks the sprite KEY per
// entity, BattleView's SpriteBody renders it, and anything unmapped falls back to
// the circle skin — so we can add sprites one entity/atlas at a time.

interface Sheet { url: string; cols: number; rows: number }   // 16px tiles, no spacing

const asset = (file: string) => `${import.meta.env.BASE_URL}sprites/${file}`

// Both Kenney "Tiny" packs are a 12×11 grid of 16px tiles (tilemap_packed.png).
export const SHEETS: Record<string, Sheet> = {
  town:    { url: asset('tiny-town.png'),    cols: 12, rows: 11 },
  dungeon: { url: asset('tiny-dungeon.png'), cols: 12, rows: 11 },
}

export interface SpriteRef { sheet: keyof typeof SHEETS; cell: number }

// Named sprites. Keys are what the appearance resolver asks for. Cell indices are
// row-major into the 12-wide atlas (see scratchpad grid dumps / CREDITS).
export const SPRITE_REGISTRY: Record<string, SpriteRef> = {
  // Heroes by class (Tiny Dungeon character row).
  'hero-Fighter': { sheet: 'dungeon', cell: 96 },   // armored knight
  'hero-Ranger':  { sheet: 'dungeon', cell: 98 },   // archer
  'hero-Mage':    { sheet: 'dungeon', cell: 84 },   // purple wizard
  'hero-Cleric':  { sheet: 'dungeon', cell: 99 },   // robed healer
  'hero-Rogue':   { sheet: 'dungeon', cell: 87 },   // hooded
  'hero-default': { sheet: 'dungeon', cell: 85 },   // generic adventurer

  // Town NPCs (merchants / questgivers). Keyed `npc-<npcId>`; `npc-default` is the
  // fallback townsperson for any NPC without a bespoke sprite.
  'npc-default':            { sheet: 'town',    cell: 104 },  // townsperson
  'npc-arnold-armorsmith':  { sheet: 'dungeon', cell: 96 },   // armored smith
  'npc-paul-weaponsmith':   { sheet: 'dungeon', cell: 97 },   // armored smith (variant)

  // A handful of monster mappings (Tiny Dungeon). Unmapped monsters fall back to
  // the circle skin, which is the whole point — add them as art is chosen.
  'mon-slime':    { sheet: 'dungeon', cell: 108 },
  'mon-crab':     { sheet: 'dungeon', cell: 110 },
  'mon-rat':      { sheet: 'dungeon', cell: 120 },
  'mon-ghost':    { sheet: 'dungeon', cell: 121 },
  'mon-spider':   { sheet: 'dungeon', cell: 122 },
}

export const hasSprite = (key: string): boolean => key in SPRITE_REGISTRY

// CSS to render one atlas cell filling the element's box, pixel-crisp. Scaling the
// background to cols×rows × 100% makes each cell exactly one box; percentage
// background-position then selects the cell (the standard atlas-as-bg trick).
export function spriteCellStyle(ref: SpriteRef): CSSProperties {
  const sheet = SHEETS[ref.sheet]
  const cx = ref.cell % sheet.cols
  const cy = Math.floor(ref.cell / sheet.cols)
  return {
    backgroundImage: `url(${sheet.url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${(cx / (sheet.cols - 1)) * 100}% ${(cy / (sheet.rows - 1)) * 100}%`,
    imageRendering: 'pixelated',
  }
}

// A bare sprite element (the body — no positioning; the caller sizes/places it).
// `idle` adds a gentle bob so a standing town sprite still reads as alive without
// a multi-frame walk cycle (frame animation comes when we source animated sheets).
export function Sprite({ sprite, idle = false, className = '', style }: {
  sprite: SpriteRef; idle?: boolean; className?: string; style?: CSSProperties
}) {
  return createElement('div', {
    className: `${idle ? 'animate-sprite-idle ' : ''}${className}`,
    style: { ...spriteCellStyle(sprite), ...style },
  })
}

// Tiled ground for a painted field (e.g. a city's grass). A standalone 16px tile
// repeated across the world layer; the layer sizes it to one world cell.
export const GROUND_GRASS = asset('ground-grass.png')
