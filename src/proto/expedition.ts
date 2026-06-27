import type { Location } from '@/types'

// §expedition — a lightweight "logistics, not item-management" prototype. You
// configure each hero (and the party); they act it out — hunting fills their pack
// and burns supplies until a simple return rule sends them home (simulated by
// running to the bottom edge of the map). Abstracted + proto-only. Tunables here.

// Lightweight loot categories the logistics layer reasons about (vs per-item
// allowlists). Loot Focus + the area's "yields" talk in these terms.
export type LootCategory =
  | 'Equipment' | 'Consumable' | 'Crafting Material' | 'Quest Item'
  | 'Card' | 'Currency' | 'Vendor Loot' | 'Unique'

export interface Choice<T extends string> { id: T; label: string; hint: string }

// ── The composable choices (per hero) ──────────────────────────────────────────
export type LoadoutId = 'light' | 'standard' | 'heavy'
export const LOADOUTS: Choice<LoadoutId>[] = [
  { id: 'light',    label: 'Light',    hint: 'Few supplies — short, frequent runs.' },
  { id: 'standard', label: 'Standard', hint: 'Balanced supplies and tools.' },
  { id: 'heavy',    label: 'Heavy',    hint: 'Lots of supplies — long endurance.' },
]

export type PostureId = 'conserve' | 'normal' | 'push' | 'burn'
export const POSTURES: Choice<PostureId>[] = [
  { id: 'conserve', label: 'Conserve',      hint: 'Sip supplies. Safer, slower.' },
  { id: 'normal',   label: 'Normal',        hint: 'Use consumables sensibly.' },
  { id: 'push',     label: 'Push Hard',     hint: 'Spend freely for more loot.' },
  { id: 'burn',     label: 'Burn Supplies', hint: 'Everything now — max loot, shortest run.' },
]

export type LootFocusId = 'everything' | 'valuables' | 'materials' | 'rare'
export const LOOT_FOCUS: Choice<LootFocusId>[] = [
  { id: 'everything', label: 'Everything', hint: 'Grab it all — fills fast.' },
  { id: 'valuables',  label: 'Valuables',  hint: 'Skip trash; keep gold-worthy finds.' },
  { id: 'materials',  label: 'Materials',  hint: 'Prioritize crafting mats.' },
  { id: 'rare',       label: 'Cards & Unique', hint: 'Only the exciting stuff. Rarely fills.' },
]

// Return when the pack is full, when supplies run out, or either-first.
export type ReturnRuleId = 'pack-full' | 'supplies-out' | 'either'
export const RETURN_RULES: Choice<ReturnRuleId>[] = [
  { id: 'either',       label: 'Either',       hint: 'Come home on pack full OR supplies out — whichever first.' },
  { id: 'pack-full',    label: 'Pack Full',    hint: 'Stay until the pack is full.' },
  { id: 'supplies-out', label: 'Supplies Out', hint: 'Stay until supplies run dry.' },
]

// Return individually (each hero leaves on their own trigger) or as a group (the
// whole party heads home when the first hero's rule fires).
export type ReturnModeId = 'individual' | 'group'
export const RETURN_MODES: Choice<ReturnModeId>[] = [
  { id: 'individual', label: 'Individually', hint: 'Each hero returns on their own trigger.' },
  { id: 'group',      label: 'As a group',   hint: 'The party heads home together when the first triggers.' },
]

export const DEFAULT_CHOICES = {
  loadout: 'standard' as LoadoutId,
  posture: 'normal' as PostureId,
  lootFocus: 'everything' as LootFocusId,
  returnRule: 'either' as ReturnRuleId,
}

// Choice multipliers.
export const LOADOUT_SUPPLY: Record<LoadoutId, number>   = { light: 0.7, standard: 1.0, heavy: 1.6 }
export const POSTURE_BURN: Record<PostureId, number>     = { conserve: 0.5, normal: 1.0, push: 1.7, burn: 2.6 }
export const POSTURE_GAIN: Record<PostureId, number>     = { conserve: 0.8, normal: 1.0, push: 1.3, burn: 1.6 }
export const FOCUS_PRESSURE: Record<LootFocusId, number> = { everything: 1.4, valuables: 0.9, materials: 1.0, rare: 0.45 }

// ── Per-location profile (loot pressure / supply burn / signatures) ─────────────
export interface LocationProfile {
  lootItemsPerSec: number   // pack items gained / sec at Normal + Everything
  supplyBurn: number        // supplies (0..1) spent / sec at Normal
  signatures: LootCategory[]
}

const TRAIT_SIGNATURE: Record<string, LootCategory> = {
  forest: 'Crafting Material', plains: 'Crafting Material', cave: 'Crafting Material',
  arcane: 'Card', dungeon: 'Unique', undead: 'Card', ruins: 'Unique',
}

export function locationProfile(loc: Location): LocationProfile {
  const t = new Set(loc.traits)
  let lootItemsPerSec = 0.35, supplyBurn = 0.014
  if (t.has('dungeon')) lootItemsPerSec += 0.2
  if (t.has('cave')) supplyBurn += 0.006
  if (t.has('forest')) lootItemsPerSec += 0.1
  const cap = loc.openWorldCap ?? 8
  lootItemsPerSec += Math.min(0.25, cap * 0.02)

  const signatures: LootCategory[] = []
  for (const tr of loc.traits) { const c = TRAIT_SIGNATURE[tr]; if (c && !signatures.includes(c)) signatures.push(c) }
  if (signatures.length === 0) signatures.push('Vendor Loot')
  if (!signatures.includes('Equipment')) signatures.push('Equipment')
  return { lootItemsPerSec, supplyBurn, signatures: signatures.slice(0, 3) }
}

// A peaceful city is a town, not a hunting ground — no expedition there.
export const isHuntable = (loc: Location): boolean => !loc.traits.includes('city')
