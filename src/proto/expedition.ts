import type { Location } from '@/types'

// §expedition — a lightweight "logistics, not item-management" prototype. A party
// (the heroes at a location) hunts under a few composable postures; loot pressure
// fills a 0–100% capacity meter and supplies burn down, until a Return Rule sends
// them home. All abstracted + proto-only (no real combat/save wiring yet) — the
// point is the decision-making and the feel. Tunables live here.

// Lightweight item categories the logistics layer reasons about (instead of
// per-item allowlists). Loot Focus + auto-processing talk in these terms.
export type LootCategory =
  | 'Equipment' | 'Consumable' | 'Crafting Material' | 'Quest Item'
  | 'Card' | 'Currency' | 'Vendor Loot' | 'Unique'

export interface Choice<T extends string> { id: T; label: string; hint: string }

// ── The four composable choices ────────────────────────────────────────────────
export type LoadoutId = 'light' | 'standard' | 'heavy'
export const LOADOUTS: Choice<LoadoutId>[] = [
  { id: 'light',    label: 'Light',    hint: 'More loot room, fewer supplies — short, frequent runs.' },
  { id: 'standard', label: 'Standard', hint: 'Balanced supplies, tools, and carry space.' },
  { id: 'heavy',    label: 'Heavy',    hint: 'Lots of supplies + tools — long endurance, less loot room.' },
]

export type PostureId = 'conserve' | 'normal' | 'push' | 'burn'
export const POSTURES: Choice<PostureId>[] = [
  { id: 'conserve', label: 'Conserve',      hint: 'Sip supplies. Safer, slower, cheaper.' },
  { id: 'normal',   label: 'Normal',        hint: 'Use consumables sensibly.' },
  { id: 'push',     label: 'Push Hard',     hint: 'Spend freely for more loot — supplies drain fast.' },
  { id: 'burn',     label: 'Burn Supplies', hint: 'Everything, now. Max loot, shortest run.' },
]

export type LootFocusId = 'everything' | 'valuables' | 'materials' | 'rare'
export const LOOT_FOCUS: Choice<LootFocusId>[] = [
  { id: 'everything', label: 'Everything', hint: 'Grab it all — fills fast, lots of vendor trash.' },
  { id: 'valuables',  label: 'Valuables',  hint: 'Skip trash; keep gold-worthy finds. Fills slower, worth more.' },
  { id: 'materials',  label: 'Materials',  hint: 'Prioritize crafting mats for projects.' },
  { id: 'rare',       label: 'Cards & Unique', hint: 'Only cards, uniques, upgrades. Rarely fills; high excitement.' },
]

export type ReturnRuleId = 'pack-full' | 'supplies-out' | 'danger-high' | 'goal-met' | 'manual'
export const RETURN_RULES: Choice<ReturnRuleId>[] = [
  { id: 'pack-full',    label: 'Pack Full',    hint: 'Come home when capacity hits 100%.' },
  { id: 'supplies-out', label: 'Supplies Out', hint: 'Come home when supplies run dry.' },
  { id: 'danger-high',  label: 'Danger High',  hint: 'Bail when the area gets too hot.' },
  { id: 'goal-met',     label: 'Goal Met',     hint: 'Return once the run goal is reached.' },
  { id: 'manual',       label: 'Manual',       hint: 'Never auto-return — you call it.' },
]

export const DEFAULT_CHOICES = {
  loadout: 'standard' as LoadoutId,
  posture: 'normal' as PostureId,
  lootFocus: 'everything' as LootFocusId,
  returnRule: 'pack-full' as ReturnRuleId,
}

// Multipliers each choice applies to the simulation.
export const LOADOUT_BASE_FILL: Record<LoadoutId, number> = { light: 0.12, standard: 0.24, heavy: 0.40 }
export const LOADOUT_SUPPLY: Record<LoadoutId, number>    = { light: 0.7,  standard: 1.0,  heavy: 1.5  }
export const POSTURE_BURN: Record<PostureId, number>      = { conserve: 0.5, normal: 1.0, push: 1.7, burn: 2.6 }
export const POSTURE_GAIN: Record<PostureId, number>      = { conserve: 0.8, normal: 1.0, push: 1.3, burn: 1.6 }
export const FOCUS_PRESSURE: Record<LootFocusId, number>  = { everything: 1.4, valuables: 0.9, materials: 1.0, rare: 0.45 }
export const FOCUS_VALUE: Record<LootFocusId, number>     = { everything: 0.8, valuables: 1.5, materials: 1.1, rare: 2.4 }

// ── Per-location profile (loot pressure / supply burn / danger / signatures) ────
// Derived from the location's traits so each place feels different. Rates are
// fractions per real second (the panel advances by elapsed game-ticks).
export interface LocationProfile {
  lootPressure: number   // capacity gained / sec at Normal+Everything
  supplyBurn: number     // supplies spent / sec at Normal
  danger: number         // baseline 0..1 (rises over a run)
  travel: number         // seconds-equivalent flavor cost to return
  signatures: LootCategory[]
}

const TRAIT_SIGNATURE: Record<string, LootCategory> = {
  forest: 'Crafting Material', plains: 'Crafting Material', cave: 'Crafting Material',
  arcane: 'Card', dungeon: 'Unique', undead: 'Card', ruins: 'Unique',
}

export function locationProfile(loc: Location): LocationProfile {
  const t = new Set(loc.traits)
  let lootPressure = 0.020, supplyBurn = 0.014, danger = 0.18, travel = 8
  if (t.has('dungeon')) { lootPressure += 0.010; danger += 0.25; travel += 6 }
  if (t.has('dangerous')) { danger += 0.22 }
  if (t.has('cave')) { supplyBurn += 0.006; travel += 3 }
  if (t.has('forest')) { lootPressure += 0.006 }
  if (t.has('arcane') || t.has('undead')) { lootPressure += 0.004; danger += 0.08 }
  // Denser open-world fields generate more loot pressure.
  const cap = loc.openWorldCap ?? 8
  lootPressure += Math.min(0.012, cap * 0.0012)

  const signatures: LootCategory[] = []
  for (const tr of loc.traits) { const c = TRAIT_SIGNATURE[tr]; if (c && !signatures.includes(c)) signatures.push(c) }
  if (signatures.length === 0) signatures.push('Vendor Loot')
  if (!signatures.includes('Equipment')) signatures.push('Equipment')

  return { lootPressure, supplyBurn, danger: Math.min(0.6, danger), travel, signatures: signatures.slice(0, 3) }
}

// A peaceful city is a town, not a hunting ground — no expedition there.
export const isHuntable = (loc: Location): boolean => !loc.traits.includes('city')
