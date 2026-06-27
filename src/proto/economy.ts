import type { EquipmentItem, PackItem } from '@/types'
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

// Per-item weight (of one). The pack's capacity is a total weight (see
// WEIGHT_LIMIT); bulky drops eat the limit faster. Prototype values — a real
// table comes later.
const ITEM_WEIGHT: Record<string, number> = {
  'drop-slime-gel': 8, 'drop-wolf-pelt': 25, 'drop-boar-hide': 30,
  'drop-plate-scrap': 40, 'drop-crab-shell': 45, 'drop-dark-core': 60, 'drop-golem-core': 80,
  // consumables a hero carries (Unit.pack) — light, so they barely dent loot room
  'potion-hp': 3, 'potion-hp-greater': 5,
}
const DEFAULT_ITEM_WEIGHT = 20
export function itemWeight(id: string): number {
  return ITEM_WEIGHT[id] ?? DEFAULT_ITEM_WEIGHT
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
// deposit into shared storage. Capacity is a total WEIGHT for the prototype —
// flat 1000 for everyone now; a real formula (off strength) comes later.
export const WEIGHT_LIMIT = 1000

export type Pack = Record<string, number> // itemId → qty carried

export function packCount(p: Pack | undefined): number {
  if (!p) return 0
  let n = 0
  for (const q of Object.values(p)) n += q
  return n
}

// Total carried weight = Σ qty × itemWeight.
export function packWeight(p: Pack | undefined): number {
  if (!p) return 0
  let w = 0
  for (const [id, q] of Object.entries(p)) w += itemWeight(id) * q
  return w
}

export function packFull(p: Pack | undefined): boolean {
  return packWeight(p) >= WEIGHT_LIMIT
}

// Remaining weight room (never negative).
export function packRoom(p: Pack | undefined): number {
  return Math.max(0, WEIGHT_LIMIT - packWeight(p))
}

// Total gold a pack's contents are worth (materials only — packs hold drops).
export function packValue(p: Pack | undefined): number {
  if (!p) return 0
  let v = 0
  for (const [id, q] of Object.entries(p)) v += materialValue(id) * q
  return v
}

// ── Combined carry (loot pack + carried consumables) ───────────────────────────
//
// A hero's real carry is their field-loot pack (protoStore.packs) PLUS the
// consumables they're carrying (Unit.pack). Both eat the same WEIGHT_LIMIT, so
// loaded-up supplies leave less room for loot. These helpers fold the two.
export function consumablesWeight(pack: PackItem[] | undefined): number {
  if (!pack) return 0
  let w = 0
  for (const p of pack) w += itemWeight(p.itemId) * p.count
  return w
}
export function heroCarried(loot: Pack | undefined, pack?: PackItem[]): number {
  return packWeight(loot) + consumablesWeight(pack)
}
export function heroRoom(loot: Pack | undefined, pack?: PackItem[]): number {
  return Math.max(0, WEIGHT_LIMIT - heroCarried(loot, pack))
}
export function heroFull(loot: Pack | undefined, pack?: PackItem[]): boolean {
  return heroCarried(loot, pack) >= WEIGHT_LIMIT
}
