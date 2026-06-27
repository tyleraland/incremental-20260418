import type { EquipmentItem } from '@/types'
import { INITIAL_EQUIPMENT } from '@/data/equipment'

// ── Prototype economy (sell prices + carry weight) ───────────────────────────--
//
// The real game has no price/value field on items yet (gold only drops 1/kill),
// so the Market/Sell + Storage prototype DERIVES everything here, in one pure
// place. Swap these for real authored values once the loop is wired — the UI
// reads only through these helpers.

export const GOLD_ID = 'm-gold'

// Base sell value for materials & consumables, by id. Anything unlisted falls
// back to DEFAULT_MATERIAL_VALUE — so freshly-added monster drops still price.
const MATERIAL_VALUE: Record<string, number> = {
  // starter materials (src/data/equipment INITIAL_MISC)
  m1: 2, m2: 5, m3: 3, m4: 4,
  // refined / crafted intermediates & consumables (src/data/recipes outputs)
  'craft-plank': 6, 'craft-iron-ingot': 18,
  'craft-fish-stew': 12, 'craft-herb-salve': 10, 'craft-preserved-fish': 20,
  'craft-antidote': 14, 'craft-trail-ration': 8,
  // notable monster drops (rarer cores/relics fetch more)
  'drop-boar-hide': 8, 'drop-tusk': 12, 'drop-wolf-pelt': 7, 'drop-wolf-fang': 11,
  'drop-slime-gel': 3, 'drop-dark-core': 30, 'drop-golem-core': 45, 'drop-spirit-dust': 9,
  'drop-emerald-leaf': 14, 'drop-coin-pouch': 20, 'drop-ancient-coin': 25, 'drop-ectoplasm': 16,
  'drop-serpent-scale': 10, 'drop-venom-sac': 13, 'drop-crab-shell': 6, 'drop-stone-shard': 4,
  'drop-elite-mark': 60, 'drop-champions-seal': 120, 'drop-iron-dagger': 22, 'drop-plate-scrap': 9,
}
export const DEFAULT_MATERIAL_VALUE = 5

export function materialValue(id: string): number {
  return MATERIAL_VALUE[id] ?? DEFAULT_MATERIAL_VALUE
}

// Per-item weight (of one). Capacity is a flat item count for now, so this is 1
// for everything bar a few bulky drops — surfaced in the item detail popup; a
// weight-based capacity can read it later.
const ITEM_WEIGHT: Record<string, number> = { 'drop-golem-core': 3, 'drop-crab-shell': 2, 'drop-plate-scrap': 2 }
export function itemWeight(id: string): number {
  return ITEM_WEIGHT[id] ?? 1
}

// Equipment has no authored price, so we price it off its stat budget: a flat
// base, a weighted stat sum, plus premiums for reach, card sockets, and the
// level it's gated behind. Always ≥ 1.
const STAT_WEIGHT = 4
export function equipmentValue(it: EquipmentItem): number {
  const stats =
    (it.stats.attack ?? 0) + (it.stats.defense ?? 0) +
    (it.stats.specialAttack ?? 0) + (it.stats.specialDefense ?? 0)
  const reach = it.stats.range && it.stats.range > 5 ? Math.round((it.stats.range - 5) / 3) : 0
  const sockets = (it.slots ?? 0) * 6
  const gate = ((it.requiredLevel ?? 1) - 1) * 4
  return Math.max(1, 10 + stats * STAT_WEIGHT + reach + sockets + gate)
}

// Equipment defs keyed by base id — lets the crafting preview render real stat
// chips for an equipment-output recipe (recipe outputs reference these ids).
export const EQUIPMENT_DEF: Record<string, EquipmentItem> =
  Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]))

// ── Carry model (mock) ────────────────────────────────────────────────────────
//
// Each hero carries kills in a personal pack until they return to town and
// deposit into shared storage. Capacity is a flat item count for the prototype
// (a slot/weight system can replace packCount later).
export const CARRY_CAPACITY = 20

export type Pack = Record<string, number> // itemId → qty carried

export function packCount(p: Pack | undefined): number {
  if (!p) return 0
  let n = 0
  for (const q of Object.values(p)) n += q
  return n
}

export function packFull(p: Pack | undefined): boolean {
  return packCount(p) >= CARRY_CAPACITY
}

// Room left in a pack (never negative).
export function packRoom(p: Pack | undefined): number {
  return Math.max(0, CARRY_CAPACITY - packCount(p))
}

// Total gold a pack's contents are worth (materials only — packs hold drops).
export function packValue(p: Pack | undefined): number {
  if (!p) return 0
  let v = 0
  for (const [id, q] of Object.entries(p)) v += materialValue(id) * q
  return v
}
