import type { Location } from '@/types'
import { CONSUMABLE_REGISTRY } from '@/data/consumables'

// §logistics — a lightweight "logistics, not item-management" prototype. You
// configure each hero's *supplies loadout*, which loot *categories* to keep, and
// *when* to return; they act it out — hunting fills their loot pack and burns
// supplies until a return condition sends them home (simulated by running to the
// bottom edge of the map). Abstracted + proto-only. Tunables live here.

// The levers the player gets:           What they get for FREE (automatic):
//   • Supplies loadout (what to carry)    • consumable usage in the field
//   • Loot categories to keep             • sell junk / store / restock in town
//   • Return conditions (+ group/solo)    • the actual hunting & pathing

export type LootCategory =
  | 'Equipment' | 'Consumable' | 'Crafting Material' | 'Quest Item'
  | 'Card' | 'Currency' | 'Vendor Loot' | 'Unique'

export const ALL_LOOT_CATEGORIES: LootCategory[] = [
  'Equipment', 'Consumable', 'Crafting Material', 'Card', 'Unique', 'Currency', 'Vendor Loot', 'Quest Item',
]

export interface Choice<T extends string> { id: T; label: string; hint: string }

// Return conditions are checkboxes (any checked → that condition can send them home).
export type ReturnConditionId = 'pack-full' | 'supplies-out'
export const RETURN_CONDITIONS: Choice<ReturnConditionId>[] = [
  { id: 'pack-full',    label: 'Pack full',    hint: 'Come home when the loot pack is full.' },
  { id: 'supplies-out', label: 'Supplies out', hint: 'Come home when carried supplies run dry.' },
]

// Return individually (each hero on their own trigger) or as a group (the whole
// party heads home when the first triggers).
export type ReturnModeId = 'individual' | 'group'
export const RETURN_MODES: Choice<ReturnModeId>[] = [
  { id: 'individual', label: 'Individually', hint: 'Each hero returns on their own trigger.' },
  { id: 'group',      label: 'As a group',   hint: 'The party heads home together when the first triggers.' },
]

// Supplies a hero can choose to carry (the loadout). For now these are the known
// consumables; carrying more = more weight + gold cost, but longer endurance.
export interface SupplyOption { id: string; name: string; icon: string; cost: number }
export const SUPPLY_OPTIONS: SupplyOption[] = Object.values(CONSUMABLE_REGISTRY).map((c) => ({
  id: c.id, name: c.name, icon: c.icon, cost: c.id === 'potion-hp-greater' ? 24 : 9,
}))
export const supplyOption = (id: string): SupplyOption | undefined => SUPPLY_OPTIONS.find((o) => o.id === id)

// A loadout entry: how many to carry, and where to source them — pull from the
// guild storage, buy from a town merchant, or either (both checked).
export interface SupplyEntry { qty: number; storage: boolean; merchant: boolean }
export type Loadout = Record<string, SupplyEntry>
export const newSupplyEntry = (qty = 10): SupplyEntry => ({ qty, storage: true, merchant: false })

export const DEFAULT_LOADOUT: Loadout = { 'potion-hp': { qty: 5, storage: true, merchant: false } }
export const DEFAULT_LOOT_CATS: LootCategory[] = [...ALL_LOOT_CATEGORIES]
export const DEFAULT_RETURN_ON: ReturnConditionId[] = ['pack-full']

// Supply burn: base fraction/sec at an 8-item loadout; bigger loadouts last longer.
export const BASE_SUPPLY_BURN = 0.02
export const supplyPool = (loadout: Loadout): number =>
  Object.values(loadout).reduce((a, e) => a + e.qty, 0)
export const supplyEndurance = (loadout: Loadout): number =>
  Math.max(1, supplyPool(loadout) / 8)
export const loadoutWeight = (loadout: Loadout): number => supplyPool(loadout)
export const loadoutCost = (loadout: Loadout): number => {
  // Only merchant-sourced supplies cost gold up front; storage pulls are free.
  let g = 0
  for (const [id, e] of Object.entries(loadout)) if (e.merchant) g += e.qty * (supplyOption(id)?.cost ?? 0)
  return g
}

// Sort a dropped item into a loot category (so Loot Focus checkboxes can filter
// what's kept). Coarse + heuristic — good enough for the feel.
const RARE_DROPS = new Set(['drop-dark-core', 'drop-golem-core', 'drop-champions-seal', 'drop-elite-mark'])
const CURRENCY_DROPS = new Set(['drop-coin-pouch', 'drop-ancient-coin'])
export function categorize(itemId: string): LootCategory {
  if (itemId === 'm-gold' || CURRENCY_DROPS.has(itemId)) return 'Currency'
  if (itemId in CONSUMABLE_REGISTRY) return 'Consumable'
  if (RARE_DROPS.has(itemId)) return 'Unique'
  if (itemId.startsWith('card')) return 'Card'
  if (itemId.startsWith('eq-')) return 'Equipment'
  if (itemId.startsWith('craft')) return 'Crafting Material'
  if (itemId.startsWith('drop-')) return 'Crafting Material'
  return 'Vendor Loot'
}

// ── Per-location profile (loot pressure / supply burn / signatures) ─────────────
export interface LocationProfile {
  lootItemsPerSec: number
  signatures: LootCategory[]
}

const TRAIT_SIGNATURE: Record<string, LootCategory> = {
  forest: 'Crafting Material', plains: 'Crafting Material', cave: 'Crafting Material',
  arcane: 'Card', dungeon: 'Unique', undead: 'Card', ruins: 'Unique',
}

export function locationProfile(loc: Location): LocationProfile {
  const t = new Set(loc.traits)
  let lootItemsPerSec = 0.35
  if (t.has('dungeon')) lootItemsPerSec += 0.2
  if (t.has('forest')) lootItemsPerSec += 0.1
  const cap = loc.openWorldCap ?? 8
  lootItemsPerSec += Math.min(0.25, cap * 0.02)

  const signatures: LootCategory[] = []
  for (const tr of loc.traits) { const c = TRAIT_SIGNATURE[tr]; if (c && !signatures.includes(c)) signatures.push(c) }
  if (signatures.length === 0) signatures.push('Vendor Loot')
  if (!signatures.includes('Equipment')) signatures.push('Equipment')
  return { lootItemsPerSec, signatures: signatures.slice(0, 3) }
}

export const isHuntable = (loc: Location): boolean => !loc.traits.includes('city')
export const isCity = (loc: Location): boolean => loc.traits.includes('city')

// The sane default return town: the nearest city to `fromId`, by hops over the
// location connection graph. Falls back to the first city if none is reachable.
export function nearestCity(fromId: string | null, locations: Location[]): Location | null {
  const cities = locations.filter(isCity)
  if (!fromId) return cities[0] ?? null
  const byId = new Map(locations.map((l) => [l.id, l]))
  const start = byId.get(fromId)
  if (!start) return cities[0] ?? null
  if (isCity(start)) return start
  const seen = new Set([fromId])
  let frontier = [fromId]
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      for (const c of byId.get(id)?.connections ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        const cl = byId.get(c)
        if (cl && isCity(cl)) return cl
        next.push(c)
      }
    }
    frontier = next
  }
  return cities[0] ?? null
}
