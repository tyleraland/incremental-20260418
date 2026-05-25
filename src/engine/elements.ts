// Combat Tactic Engine — elemental attack/armor system (spec §3).
//
// Source of truth for elements. The host game re-exports these from
// `@/lib/elements` (which adds UI labels/colors). Damage from an attacking
// element vs a defending (armor) element resolves via the table: 2x effective,
// 1x neutral/default, 0.33x ineffective, 0x immune. Missing entries default 1x.
//
// Units/monsters attack 'neutral' by default; a monster's armor element is its
// defensive element. Statuses can override the effective armor element
// (Frozen → water) so the same table powers combos like Lightning vs Frozen.

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

// Sparse attacker → defender table; missing entries = 1.
const TABLE: Record<Element, Partial<Record<Element, number>>> = {
  neutral:   { ghost: 0 },
  fire:      { fire: 0.33, water: 2, earth: 2, poison: 2, undead: 2 },
  water:     { fire: 2, water: 0.33, lightning: 2 },
  earth:     { water: 2, earth: 0.33, lightning: 2, ghost: 0.33 },
  lightning: { water: 2, earth: 0.33, lightning: 0.33 },
  poison:    { poison: 0.33, radiant: 0.33, undead: 0, ghost: 0 },
  radiant:   { poison: 2, radiant: 0.33, undead: 2, ghost: 2 },
  undead:    { poison: 2, radiant: 0, undead: 0.33 },
  ghost:     { radiant: 0.33, undead: 2, ghost: 0.33 },
}

export function elementMultiplier(attacker: Element, defender: Element): number {
  return TABLE[attacker]?.[defender] ?? 1
}
