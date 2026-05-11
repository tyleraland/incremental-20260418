// Elemental attack/armor system.
//
// 9 elements: damage from an attacking element vs a defending element resolves
// via ELEMENT_MULTIPLIER (2x effective, 1x normal/default, 0.33x ineffective,
// 0x immune). Missing entries default to 1x.
//
// Units attack and wear 'neutral' by default; monsters attack 'neutral' but
// their `element` field is their *defensive* armor element. A lightning sword
// vs a water slime is 2x; a neutral wolf bite vs a player in neutral armor is 1x.

export type Element =
  | 'neutral'
  | 'fire'
  | 'water'     // also covers ice
  | 'earth'
  | 'lightning'
  | 'poison'
  | 'radiant'
  | 'undead'
  | 'ghost'

export const ALL_ELEMENTS: Element[] = [
  'neutral', 'fire', 'water', 'earth', 'lightning',
  'poison', 'radiant', 'undead', 'ghost',
]

export const ELEMENT_LABELS: Record<Element, string> = {
  neutral: 'Neutral',
  fire: 'Fire',
  water: 'Water/Ice',
  earth: 'Earth',
  lightning: 'Lightning',
  poison: 'Poison',
  radiant: 'Radiant',
  undead: 'Undead',
  ghost: 'Ghost',
}

// Sparse attacker → defender table; missing entries = 1.
const TABLE: Record<Element, Partial<Record<Element, number>>> = {
  neutral:   { ghost: 0 },
  fire:      { fire: 0.33, water: 2, earth: 2, poison: 2, undead: 2 },
  water:     { fire: 2, water: 0.33, lightning: 2 },
  earth:     { water: 2, earth: 0.33, lightning: 2, ghost: 0.33 },
  lightning: { water: 2, earth: 0.33, lightning: 0.33 },
  poison:    { poison: 0.33, radiant: 0.33, undead: 0, ghost: 0 },
  radiant:      { poison: 2, radiant: 0.33, undead: 2, ghost: 2 },
  undead:    { poison: 2, radiant: 0, undead: 0.33 },
  ghost:     { radiant: 0.33, undead: 2, ghost: 0.33 },
}

export function elementMultiplier(attacker: Element, defender: Element): number {
  return TABLE[attacker]?.[defender] ?? 1
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
