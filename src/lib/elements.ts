// Elemental attack/armor system. The matrix + Element type now live in the
// engine (the source of truth for combat); this module re-exports them and adds
// the UI-only labels/colors so existing `@/lib/elements` and `@/types` imports
// keep working.
//
// 9 elements: damage from an attacking element vs a defending element resolves
// via the engine table (2x effective, 1x neutral, 0.33x ineffective, 0x immune).

import type { Element } from '@/engine/elements'
export type { Element } from '@/engine/elements'
export { ALL_ELEMENTS, elementMultiplier } from '@/engine/elements'

export const ELEMENT_LABELS: Record<Element, string> = {
  neutral: 'Neutral',
  fire: 'Fire',
  water: 'Water',
  earth: 'Earth',
  lightning: 'Lightning',
  poison: 'Poison',
  radiant: 'Radiant',
  undead: 'Undead',
  ghost: 'Ghost',
}

export const ELEMENT_COLORS: Record<Element, string> = {
  neutral:   'bg-gray-800 text-gray-300 border-gray-600/50',
  fire:      'bg-orange-950 text-orange-300 border-orange-700/50',
  water:     'bg-blue-950 text-blue-300 border-blue-700/50',
  earth:     'bg-lime-950 text-lime-300 border-lime-700/50',
  lightning: 'bg-yellow-950 text-yellow-300 border-yellow-700/50',
  poison:    'bg-purple-950 text-purple-300 border-purple-700/50',
  radiant:      'bg-amber-950 text-amber-300 border-amber-700/50',
  undead:    'bg-stone-950 text-stone-400 border-stone-700/50',
  ghost:     'bg-indigo-950 text-indigo-300 border-indigo-700/50',
}
