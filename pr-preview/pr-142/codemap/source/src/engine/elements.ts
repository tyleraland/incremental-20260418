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
  | 'wind'
  | 'poison'
  | 'radiant'
  | 'undead'
  | 'ghost'

export const ALL_ELEMENTS: Element[] = [
  'neutral', 'fire', 'water', 'earth', 'wind',
  'poison', 'radiant', 'undead', 'ghost',
]

// Core 4-element wheel: each is 1.5× the one it beats, 0.75× the one that beats
// it, 0.25× itself, and 1× its opposite (omitted ⇒ 1×). The beats-chain is
// fire → earth → wind → water → fire. Exotic elements keep their own
// (radiant/undead/poison/ghost) matchups; any missing pair defaults to 1×.
const TABLE: Record<Element, Partial<Record<Element, number>>> = {
  neutral:   { ghost: 0 },
  fire:      { earth: 1.5, water: 0.75, fire: 0.25 },
  earth:     { wind: 1.5, fire: 0.75, earth: 0.25 },
  wind:      { water: 1.5, earth: 0.75, wind: 0.25 },
  water:     { fire: 1.5, wind: 0.75, water: 0.25 },
  poison:    { poison: 0.33, radiant: 0.33, undead: 0, ghost: 0 },
  radiant:   { poison: 2, radiant: 0.33, undead: 2, ghost: 2 },
  undead:    { poison: 2, radiant: 0, undead: 0.33 },
  ghost:     { radiant: 0.33, undead: 2, ghost: 0.33 },
}

export function elementMultiplier(attacker: Element, defender: Element): number {
  return TABLE[attacker]?.[defender] ?? 1
}
