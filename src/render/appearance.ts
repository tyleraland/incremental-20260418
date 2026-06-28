import type { Combatant, Element } from '@/engine'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { NPC_REGISTRY } from '@/data/npcs'
import { hasSprite } from '@/render/sprites'
import type { MonsterSize } from '@/types'

// ── Appearance resolver ──────────────────────────────────────────────────────
//
// The SINGLE translation point from an engine `Combatant` (+ its source game
// data) to "how to draw it". Mirrors `engine/adapter.ts`: the engine stays
// visual-free and RNG-free; this is the only module that knows ids → glyph /
// size / element tint / (future) sprite sheet. Add new visual data HERE, never
// in the engine or inline in BattleView — so swapping circles for sprites, or
// trying a different palette/scale, is one file's worth of change.
//
// `spriteId` names a sprite in SPRITE_REGISTRY; it's only set when a sheet
// actually exists for the entity, so anything unmapped renders as the circle skin
// (the renderer falls back when spriteId is absent or sprites are toggled off).

export type Tone = 'player' | 'enemy' | 'neutral' | 'casting'

export interface Appearance {
  glyph: string          // circle-skin body text (class icon / NPC icon / initials)
  tone: Tone             // base token color family
  scale: number          // token size multiplier (1 = one grid cell's worth)
  tint?: string          // element accent (rgba) for the rim; undefined = plain team color
  spriteId?: string      // future sprite-sheet key; absent → circle skin
}

// A discrete visual state derived purely from engine fields, for a sprite skin to
// pick an animation row from. Kept honest to the data we actually have: 'idle' /
// 'move' / 'cast' / 'ko'. Discrete attack/hurt frames need per-event triggers
// (the engine emits attack/damage events) and are deferred to the effects pass.
export type VisualState = 'idle' | 'move' | 'cast' | 'ko'

export const CLASS_ICON: Record<string, string> = {
  Fighter: '⚔',
  Ranger:  '🏹',
  Mage:    '✦',
  Cleric:  '✚',
  Rogue:   '🗡',
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// MonsterDef.size → token scale. Heroes/NPCs are always 1 (a grid cell). Already
// authored on every monster (`size`), just unused by the renderer until now.
const SIZE_SCALE: Record<MonsterSize, number> = { small: 0.8, medium: 1, large: 1.35 }

// Element → a subtle rim accent. Reads as "this is fire / water / …" at a glance
// without fighting the blue/red team color. Neutral has no tint (plain team rim).
// Mirrors the element palette in `data/traits.ts` (colorClass) as raw rgba so it
// can drive a border/ring directly.
const ELEMENT_TINT: Partial<Record<Element, string>> = {
  fire:    'rgb(251 146 60 / 0.9)',
  water:   'rgb(56 189 248 / 0.9)',   // also covers ice
  earth:   'rgb(132 204 22 / 0.9)',
  wind:    'rgb(45 212 191 / 0.9)',
  poison:  'rgb(192 132 252 / 0.9)',
  radiant: 'rgb(253 224 71 / 0.9)',
  undead:  'rgb(148 163 184 / 0.9)',
  ghost:   'rgb(165 180 252 / 0.9)',
}

// Game monster id (the `${monsterId}#n` prefix) → sprite-registry key. Only a few
// are mapped so far; the rest fall through to the circle skin. Keep keys aligned
// with SPRITE_REGISTRY in `render/sprites.ts`.
const MONSTER_SPRITE: Record<string, string> = {
  slime: 'mon-slime', 'tough-slime': 'mon-slime', 'dark-slime': 'mon-slime',
  'rock-crab': 'mon-crab',
}

// Pick a sprite key only if a sprite is actually registered for it, else undefined
// (→ circle fallback). Lets us add coverage incrementally without dead keys.
const spriteOr = (key: string): string | undefined => (hasSprite(key) ? key : undefined)

const baseId = (c: Combatant) => c.id.split('#')[0]

// Recover a monster's MonsterDef from its combatant id (`${monsterId}#${n}`).
// Mirrors `monsterIdOf` in the store. NPCs/heroes return undefined (not monsters).
function monsterDefOf(c: Combatant) {
  return MONSTER_REGISTRY[baseId(c)]
}

export function getAppearance(c: Combatant, classFor: (id: string) => string | null): Appearance {
  const casting = c.alive && !!c.channel
  if (c.team === 'player') {
    const cls = classFor(c.id)
    return {
      glyph: (cls && CLASS_ICON[cls]) || initials(c.name),
      tone: casting ? 'casting' : 'player',
      scale: 1,
      // A hero's elemental identity is its weapon-imbued attack element (§3).
      tint: ELEMENT_TINT[c.attackElement],
      spriteId: spriteOr(`hero-${cls}`) ?? 'hero-default',
    }
  }
  if (c.team === 'neutral') {
    // Town NPC: show its own icon; stationary, no element identity.
    return {
      glyph: NPC_REGISTRY[c.id]?.icon ?? initials(c.name),
      tone: 'neutral',
      scale: 1,
      spriteId: spriteOr(`npc-${c.id}`) ?? 'npc-default',
    }
  }
  const def = monsterDefOf(c)
  return {
    glyph: initials(c.name),
    tone: casting ? 'casting' : 'enemy',
    scale: def ? SIZE_SCALE[def.size] : 1,
    // Monsters attack neutral; their elemental identity is the defensive element.
    tint: ELEMENT_TINT[c.armorElement],
    spriteId: MONSTER_SPRITE[baseId(c)],
  }
}

export function visualState(c: Combatant): VisualState {
  if (!c.alive) return 'ko'
  if (c.channel) return 'cast'
  if (c.moving) return 'move'
  return 'idle'
}
