// Elemental attack/armor system.
//
// Damage from an attacking element vs a defending element resolves via
// ELEMENT_MULTIPLIER: 2x effective, 1x normal (default), 0.33x ineffective,
// 0x immune. Missing entries default to 1x.
//
// By default units attack and wear "neutral"; monsters attack "neutral" but
// their `element` field is their *defensive* armor element. A lightning sword
// vs a water slime deals 2x; a neutral wolf bite vs a player in neutral armor
// is 1x.

export type Element =
  | 'neutral'
  | 'water'  | 'ice'      | 'electric'
  | 'plant'  | 'earth'    | 'fire'
  | 'poison' | 'radiant'  | 'shadow'
  | 'ghost'  | 'undead'

export const ALL_ELEMENTS: Element[] = [
  'neutral', 'water', 'ice', 'electric', 'plant', 'earth',
  'fire', 'poison', 'radiant', 'shadow', 'ghost', 'undead',
]

// attacker → defender → multiplier (sparse; default 1)
const TABLE: Record<Element, Partial<Record<Element, number>>> = {
  neutral:  { ghost: 0, earth: 0.33 },
  fire:     { fire: 0, water: 0.33, plant: 2, ice: 2 },
  water:    { fire: 2, water: 0.33, plant: 0.33, earth: 2 },
  ice:      { water: 2, plant: 2, earth: 2, fire: 0.33, ice: 0.33 },
  electric: { water: 2, earth: 0, electric: 0.33, plant: 0.33 },
  plant:    { water: 2, earth: 2, fire: 0.33, ice: 0.33, plant: 0.33, poison: 0.33 },
  earth:    { fire: 2, electric: 2, poison: 2, water: 0.33, plant: 0.33, earth: 0.33 },
  poison:   { plant: 2, earth: 0.33, poison: 0.33, undead: 0, ghost: 0 },
  radiant:  { shadow: 2, ghost: 2, undead: 2, radiant: 0.33 },
  shadow:   { radiant: 2, shadow: 0.33, ghost: 0.33, undead: 0.33 },
  ghost:    { neutral: 2, ghost: 0.33, shadow: 0.33, undead: 0.33, radiant: 0.33 },
  undead:   { radiant: 0.33, shadow: 0.33, ghost: 0.33, undead: 0.33, plant: 0.33 },
}

export function elementMultiplier(attacker: Element, defender: Element): number {
  return TABLE[attacker]?.[defender] ?? 1
}

export const ELEMENT_COLORS: Record<Element, string> = {
  neutral:  'bg-gray-800 text-gray-300 border-gray-600/50',
  water:    'bg-blue-950 text-blue-300 border-blue-700/50',
  ice:      'bg-sky-950 text-sky-300 border-sky-700/50',
  electric: 'bg-yellow-950 text-yellow-300 border-yellow-700/50',
  plant:    'bg-emerald-950 text-emerald-300 border-emerald-700/50',
  earth:    'bg-lime-950 text-lime-300 border-lime-700/50',
  fire:     'bg-orange-950 text-orange-300 border-orange-700/50',
  poison:   'bg-purple-950 text-purple-300 border-purple-700/50',
  radiant:  'bg-amber-950 text-amber-300 border-amber-700/50',
  shadow:   'bg-violet-950 text-violet-300 border-violet-700/50',
  ghost:    'bg-indigo-950 text-indigo-300 border-indigo-700/50',
  undead:   'bg-stone-950 text-stone-400 border-stone-700/50',
}
