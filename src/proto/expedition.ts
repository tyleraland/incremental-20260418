import type { Location, PackItem } from '@/types'
import { CONSUMABLE_REGISTRY, isConsumable } from '@/data/consumables'

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

// When 'supplies-out' is the trigger: come home as soon as ANY one supply runs
// dry, or only once EVERY configured supply is gone.
export type SupplyModeId = 'any' | 'all'
export const SUPPLY_MODES: Choice<SupplyModeId>[] = [
  { id: 'any', label: 'Any dry',  hint: 'Come home when any one carried supply hits 0.' },
  { id: 'all', label: 'All dry',  hint: 'Come home only once every carried supply hits 0.' },
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
// guild storage, buy from a town merchant, or either. Default is BOTH ("either"):
// the in-town restock fills from the stash first, then buys any shortfall from a
// town merchant that stocks it (gold permitting). Turn merchant off to conserve
// gold and live off the stash only. Storage-only would silently stall a hero whose
// stash is empty even with gold in the bank — the common "supplies won't load" trap.
export interface SupplyEntry { qty: number; storage: boolean; merchant: boolean }
export type Loadout = Record<string, SupplyEntry>
export const newSupplyEntry = (qty = 10): SupplyEntry => ({ qty, storage: true, merchant: true })

export const DEFAULT_LOADOUT: Loadout = { 'potion-hp': { qty: 5, storage: true, merchant: true } }
export const DEFAULT_LOOT_CATS: LootCategory[] = [...ALL_LOOT_CATEGORIES]
export const DEFAULT_RETURN_ON: ReturnConditionId[] = ['pack-full']

export const supplyPool = (loadout: Loadout): number =>
  Object.values(loadout).reduce((a, e) => a + e.qty, 0)

// §logistics — supplies = ACTUAL loadout usage, not a timer. `total` is the
// configured supply quantity; `remaining` is how much of it the hero still carries
// (Unit.pack counts, which the engine decrements as consumables are used in the
// field and an in-town restock refills); `fraction` is remaining/total (1 when
// nothing is configured). So supplies only drop when potions are genuinely spent,
// and a quiet field never drains them.
export function supplyState(pack: PackItem[] | undefined, loadout: Loadout): { total: number; remaining: number; fraction: number } {
  let total = 0
  for (const [id, e] of Object.entries(loadout)) if (id in CONSUMABLE_REGISTRY) total += e.qty
  if (total <= 0) return { total: 0, remaining: 0, fraction: 1 }
  let remaining = 0
  for (const p of pack ?? []) if (p.itemId in loadout && p.itemId in CONSUMABLE_REGISTRY) remaining += p.count
  return { total, remaining, fraction: Math.max(0, Math.min(1, remaining / total)) }
}
// Per-supply emptiness for the 'supplies-out' return trigger. A configured supply
// (qty > 0) is "dry" when the hero carries none of it. `mode` decides whether one
// dry supply is enough ('any') or every supply must be gone ('all').
export function suppliesDry(pack: PackItem[] | undefined, loadout: Loadout, mode: SupplyModeId): boolean {
  const configured = Object.entries(loadout)
    .filter(([id, e]) => id in CONSUMABLE_REGISTRY && e.qty > 0)
    .map(([id]) => id)
  if (configured.length === 0) return false
  const carried = (id: string) => (pack ?? []).reduce((a, p) => a + (p.itemId === id ? p.count : 0), 0)
  return mode === 'all'
    ? configured.every((id) => carried(id) <= 0)
    : configured.some((id) => carried(id) <= 0)
}

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

// ── Per-hero expedition state (source of truth: useGameStore.expeditions) ───────
//
// Each hero carries their own plan (supplies loadout + loot categories + return
// conditions + party-sharing) plus runtime (supplies left, status, run anchor).
// These are the PURE type + factory pieces the game store builds on; the live
// state + actions live in `useGameStore` and persist via `logisticsCodec`.

export type ShareFlag = 'shareLoot' | 'acceptLoot' | 'shareSupplies' | 'acceptSupplies'

export interface HeroExpedition {
  loadout: Loadout                  // supply itemId → { qty, storage, merchant }
  lootCats: LootCategory[]          // categories to keep
  returnOn: ReturnConditionId[]     // checked return conditions
  supplyMode: SupplyModeId          // for 'supplies-out': any one dry vs all dry
  // §party sharing: loot defaults to give+take (the party fills evenly); supplies
  // default to take-but-not-give. A hero that accepts but won't share becomes a mule.
  shareLoot: boolean
  acceptLoot: boolean
  shareSupplies: boolean
  acceptSupplies: boolean
  returnTown: string | null         // override town to return to; null = auto (nearest)
  suppliesLeft: number              // 0..1 runtime
  status: 'hunting' | 'returning'
  locationId: string | null         // run anchor — a change resets the run
  // §resupply trip: while 'returning', the absolute game tick at which the hero
  // redeploys back to the hunt anchor (`locationId`). Undefined until it starts.
  resupplyUntil?: number
}

export const freshHero = (e: Partial<HeroExpedition> = {}): HeroExpedition => ({
  loadout: e.loadout ?? { ...DEFAULT_LOADOUT },
  lootCats: e.lootCats ?? [...DEFAULT_LOOT_CATS],
  returnOn: e.returnOn ?? [...DEFAULT_RETURN_ON],
  supplyMode: e.supplyMode ?? 'any',
  shareLoot: e.shareLoot ?? true,
  acceptLoot: e.acceptLoot ?? true,
  shareSupplies: e.shareSupplies ?? false,
  acceptSupplies: e.acceptSupplies ?? true,
  returnTown: e.returnTown ?? null,
  suppliesLeft: 1,
  status: 'hunting',
  locationId: e.locationId ?? null,
})

// The DURABLE subset of a hero's expedition — the plan they configured. The per-tick
// runtime (suppliesLeft / status / locationId / resupplyUntil) is re-established by
// the driver, so it's excluded from the save (see logisticsCodec).
export type ExpPlan = Pick<HeroExpedition,
  | 'loadout' | 'lootCats' | 'returnOn' | 'supplyMode'
  | 'shareLoot' | 'acceptLoot' | 'shareSupplies' | 'acceptSupplies' | 'returnTown'>
export function planOf(h: HeroExpedition): ExpPlan {
  return {
    loadout: h.loadout, lootCats: h.lootCats, returnOn: h.returnOn, supplyMode: h.supplyMode,
    shareLoot: h.shareLoot, acceptLoot: h.acceptLoot, shareSupplies: h.shareSupplies,
    acceptSupplies: h.acceptSupplies, returnTown: h.returnTown,
  }
}

// Rebuild a loadout FROM a hero's persisted pack carry-targets. `Unit.pack` targets
// persist via unitsCodec; on first `ensureExpedition` for a hero with no saved plan
// we hydrate the loadout from surviving targets instead of clobbering them with the
// default. Returns null when the hero carries no configured consumables → default.
export function loadoutFromPack(pack: PackItem[] | undefined): Loadout | null {
  const entries = (pack ?? []).filter((p) => p.target != null && isConsumable(p.itemId) && supplyOption(p.itemId))
  if (entries.length === 0) return null
  const loadout: Loadout = {}
  for (const p of entries) loadout[p.itemId] = newSupplyEntry(p.target!)
  return loadout
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

// Hop distance (portal legs) from `fromId` to the nearest city, over the location
// connection graph. 0 if already a city; a fallback constant if none is reachable.
// Used to price the offline return-to-town trip (travel overhead per cycle).
export function cityHops(fromId: string | null, locations: Location[]): number {
  if (!fromId) return 1
  const byId = new Map(locations.map((l) => [l.id, l]))
  const start = byId.get(fromId)
  if (!start) return 1
  if (isCity(start)) return 0
  const seen = new Set([fromId])
  let frontier = [fromId]
  let hops = 0
  while (frontier.length) {
    hops++
    const next: string[] = []
    for (const id of frontier) {
      for (const c of byId.get(id)?.connections ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        const cl = byId.get(c)
        if (cl && isCity(cl)) return hops
        next.push(c)
      }
    }
    frontier = next
  }
  return 1
}
