import type { Combatant, Element } from '@/engine'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { NPC_REGISTRY } from '@/data/npcs'
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
// Today every entity renders as the existing circle skin; `spriteId` is reserved
// for the sprite skin (Stage 2) and is absent until a sheet exists for an entity,
// at which point the renderer can fall back to the circle when it's missing.

export type Tone = 'player' | 'enemy' | 'neutral' | 'casting'

// Silhouette family for the token body. A skin picks its body path by this —
// NEVER by entity id (that translation happens here). 3–4 shared shapes cover
// the whole bestiary; per-monster art stays a non-goal.
export type BodyShape = 'humanoid' | 'blob' | 'beast' | 'flyer'

// A hero's handheld, keyed off class — the paper skin swaps its facing-blade
// layer by this. Absent (Novice / monsters) → the skin's generic pointer.
export type Weapon = 'sword' | 'bow' | 'staff' | 'dagger'

export interface Appearance {
  glyph: string          // circle-skin body text (class icon / NPC icon / initials)
  tone: Tone             // base token color family
  scale: number          // token size multiplier (1 = one grid cell's worth)
  bodyShape: BodyShape   // silhouette family (skins pick their body path by this)
  tint?: string          // element accent (rgba) for the rim; undefined = plain team color
  weapon?: Weapon        // class handheld (skins pick their blade layer by this)
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

// Class → handheld. Mage and Cleric share the staff (the tone/tint tells them
// apart); Novice / classless resolves to undefined (generic pointer).
const CLASS_WEAPON: Record<string, Weapon> = {
  Fighter: 'sword',
  Ranger:  'bow',
  Mage:    'staff',
  Cleric:  'staff',
  Rogue:   'dagger',
}
export function weaponForClass(cls: string | null | undefined): Weapon | undefined {
  return cls ? CLASS_WEAPON[cls] : undefined
}

// Monster id → silhouette family. Only non-beasts are listed: anything unlisted
// (including future monsters) reads as 'beast', so a new registry entry gets a
// sensible token without touching the render layer.
const MONSTER_SHAPE: Partial<Record<string, BodyShape>> = {
  // blobs — slimes, sacs, rooted things
  'slime': 'blob', 'tough-slime': 'blob', 'dark-slime': 'blob', 'fire-slime': 'blob',
  'egg-sac': 'blob', 'living-nightshade': 'blob', 'giant-frog': 'blob',
  // flyers — wings or floating
  'harpy': 'flyer', 'bat': 'flyer', 'hornet': 'flyer', 'rat-fly': 'flyer',
  'forest-sprite': 'flyer', 'wraith': 'flyer', 'ruins-specter': 'flyer',
  // humanoids — two legs, tools, armor
  'poacher': 'humanoid', 'skeleton-archer': 'humanoid', 'animated-armor': 'humanoid',
  'stone-golem': 'humanoid', 'stone-sentinel': 'humanoid',
  'elite-fighter': 'humanoid', 'elite-rogue': 'humanoid', 'elite-cleric': 'humanoid', 'elite-ranger': 'humanoid',
}
export function monsterBodyShape(monsterId: string): BodyShape {
  return MONSTER_SHAPE[monsterId] ?? 'beast'
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

// Recover a monster's MonsterDef from its combatant id (`${monsterId}#${n}`).
// Mirrors `monsterIdOf` in the store. NPCs/heroes return undefined (not monsters).
function monsterDefOf(c: Combatant) {
  return MONSTER_REGISTRY[c.id.split('#')[0]]
}

export function getAppearance(c: Combatant, classFor: (id: string) => string | null): Appearance {
  const casting = c.alive && !!c.channel
  if (c.team === 'player') {
    const cls = classFor(c.id)
    return {
      glyph: (cls && CLASS_ICON[cls]) || initials(c.name),
      tone: casting ? 'casting' : 'player',
      scale: 1,
      bodyShape: 'humanoid',
      weapon: weaponForClass(cls),
      // A hero's elemental identity is its weapon-imbued attack element (§3).
      tint: ELEMENT_TINT[c.attackElement],
    }
  }
  if (c.team === 'neutral') {
    // Town NPC: show its own icon; stationary, no element identity.
    return { glyph: NPC_REGISTRY[c.id]?.icon ?? initials(c.name), tone: 'neutral', scale: 1, bodyShape: 'humanoid' }
  }
  const def = monsterDefOf(c)
  return {
    glyph: initials(c.name),
    tone: casting ? 'casting' : 'enemy',
    scale: def ? SIZE_SCALE[def.size] : 1,
    bodyShape: monsterBodyShape(c.id.split('#')[0]),
    // Monsters attack neutral; their elemental identity is the defensive element.
    tint: ELEMENT_TINT[c.armorElement],
  }
}

export function visualState(c: Combatant): VisualState {
  if (!c.alive) return 'ko'
  if (c.channel) return 'cast'
  if (c.moving) return 'move'
  return 'idle'
}
