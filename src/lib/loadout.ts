import type { Unit, EquipmentItem, EquipSlot, ItemCategory } from '@/types'
import { getDerivedStats, getEquippedId } from '@/lib/stats'

// ─────────────────────────────────────────────────────────────────────────────
// LOADOUT BRAIN (prototype) — the shared logic behind the Armory experiments.
//
// The fantasy: outfit a whole army without it being a chore. The machine proposes
// good gear (so it's never busywork), the player skims green ↑ arrows and either
// trusts it or intervenes on the few heroes they care about. So everything here is
// about (a) scoring an item for a hero's *role*, (b) allocating SCARCE unique gear
// across the army, and (c) producing reviewable *diffs* rather than silently
// mutating — the player always gets the final say.
//
// Items are treated as UNIQUE instances (Fire-Emblem convoy): one Sword exists, so
// handing it to Aldric means it's off the table for Davan. That scarcity is what
// makes the allocation interesting.
// ─────────────────────────────────────────────────────────────────────────────

export type StatKey = 'attack' | 'defense' | 'specialAttack' | 'specialDefense'
export const STAT_KEYS: StatKey[] = ['attack', 'defense', 'specialAttack', 'specialDefense']

// The four stat-bearing slots (sideboards are stat-inactive; the inactive weapon
// set is a stash). These are the ones the optimizer actually fills.
export const STAT_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'accessory']

// ── Doctrines (the player's one big lever) ────────────────────────────────────
// A doctrine is a role's stat priorities. The army optimizer can run one doctrine
// for everyone, or "Auto" — each hero's class-default — which is the smart, no-
// effort path the player can then override per hero.

export type DoctrineId = 'auto' | 'balanced' | 'vanguard' | 'skirmisher' | 'arcanist' | 'guardian'

export interface Doctrine {
  id: Exclude<DoctrineId, 'auto'>
  name: string
  icon: string
  blurb: string
  weights: Partial<Record<StatKey, number>> & { range?: number }
}

export const DOCTRINES: Record<Exclude<DoctrineId, 'auto'>, Doctrine> = {
  vanguard:   { id: 'vanguard',   name: 'Vanguard',   icon: '⚔', blurb: 'Front-line melee damage.', weights: { attack: 2.0, defense: 0.5, specialDefense: 0.3 } },
  skirmisher: { id: 'skirmisher', name: 'Skirmisher', icon: '🏹', blurb: 'Ranged damage & reach.',   weights: { attack: 1.7, range: 0.5, defense: 0.2 } },
  arcanist:   { id: 'arcanist',   name: 'Arcanist',   icon: '✦', blurb: 'Spell power from range.',   weights: { specialAttack: 2.0, range: 0.3, specialDefense: 0.4 } },
  guardian:   { id: 'guardian',   name: 'Guardian',   icon: '🛡', blurb: 'Soak hits, hold the line.', weights: { defense: 2.0, specialDefense: 1.0, attack: 0.3 } },
  balanced:   { id: 'balanced',   name: 'Balanced',   icon: '◈', blurb: 'A bit of everything.',       weights: { attack: 1, defense: 1, specialAttack: 1, specialDefense: 0.8 } },
}

const CLASS_DOCTRINE: Record<string, Doctrine['id']> = {
  Fighter: 'vanguard', Rogue: 'vanguard', Ranger: 'skirmisher', Mage: 'arcanist', Cleric: 'arcanist',
}
export function defaultDoctrine(unit: Unit): Doctrine['id'] {
  return (unit.class && CLASS_DOCTRINE[unit.class]) || 'balanced'
}
export function resolveDoctrine(id: DoctrineId, unit: Unit): Doctrine {
  return DOCTRINES[id === 'auto' ? defaultDoctrine(unit) : id]
}

// ── Item scoring & quality ────────────────────────────────────────────────────

const MELEE_RANGE = 5
function rangeOver(item: EquipmentItem): number { return Math.max(0, (item.stats.range ?? MELEE_RANGE) - MELEE_RANGE) }

// How much this item is worth to a hero running `doctrine`. Pure stat heuristic —
// the one extensible hook (element matchups, set synergy, socket cards would slot
// in here, see BACKLOG).
export function itemScore(item: EquipmentItem, doctrine: Doctrine): number {
  let s = 0
  for (const k of STAT_KEYS) s += (item.stats[k] ?? 0) * (doctrine.weights[k] ?? 0)
  s += rangeOver(item) * (doctrine.weights.range ?? 0)
  return s
}

export interface Quality { id: string; label: string; ring: string; text: string; chip: string }
const QUALITIES: Quality[] = [
  { id: 'common',    label: 'Common',    ring: 'border-slate-600',   text: 'text-slate-300',   chip: 'bg-slate-700/40' },
  { id: 'uncommon',  label: 'Uncommon',  ring: 'border-emerald-500', text: 'text-emerald-300', chip: 'bg-emerald-900/40' },
  { id: 'rare',      label: 'Rare',      ring: 'border-sky-500',     text: 'text-sky-300',     chip: 'bg-sky-900/40' },
  { id: 'epic',      label: 'Epic',      ring: 'border-violet-500',  text: 'text-violet-300',  chip: 'bg-violet-900/40' },
  { id: 'legendary', label: 'Legendary', ring: 'border-amber-400',   text: 'text-amber-300',   chip: 'bg-amber-900/40' },
]
// Quality from raw stat weight + socket count — gives the LoL/Ragnarok rarity
// colour spread across the catalog.
export function quality(item: EquipmentItem): Quality {
  const raw = STAT_KEYS.reduce((a, k) => a + (item.stats[k] ?? 0), 0) + (item.slots ?? 0) * 3 + (rangeOver(item) > 0 ? 2 : 0)
  const i = raw >= 30 ? 4 : raw >= 20 ? 3 : raw >= 12 ? 2 : raw >= 6 ? 1 : 0
  return QUALITIES[i]
}

// One headline "power" number per hero (army roster + matrix cells). A blend of
// the derived stats so a single figure tracks overall combat strength.
export function heroMight(unit: Unit, equipment: EquipmentItem[]): number {
  const d = getDerivedStats(unit, equipment)
  return Math.round(d.attack + d.magicAttack + d.defense + d.magicDefense + d.attackSpeed * 0.5 + d.accuracy * 0.5 + d.maxHp * 0.1)
}

export function isEligible(item: EquipmentItem, unit: Unit): boolean {
  const cls = unit.class ?? 'Novice'
  if (item.requiredLevel && unit.level < item.requiredLevel) return false
  if (item.requiredClasses && !item.requiredClasses.includes(cls)) return false
  return true
}

const ITEM_GLYPH: { match: (i: EquipmentItem) => boolean; glyph: string }[] = [
  { match: (i) => i.traits.includes('bow'), glyph: '🏹' },
  { match: (i) => i.traits.includes('staff') || i.traits.includes('wand') || i.category === 'weapon-1h' && (i.stats.specialAttack ?? 0) > 0, glyph: '✦' },
  { match: (i) => i.category === 'weapon-2h', glyph: '⚔' },
  { match: (i) => i.category === 'weapon-1h', glyph: '🗡' },
  { match: (i) => i.category === 'shield', glyph: '🛡' },
  { match: (i) => i.category === 'armor', glyph: '🥋' },
  { match: (i) => i.category === 'accessory', glyph: '💍' },
  { match: (i) => i.category === 'tool', glyph: '🔧' },
]
export function itemGlyph(item: EquipmentItem): string {
  for (const g of ITEM_GLYPH) if (g.match(item)) return g.glyph
  return '▫'
}

const SLOT_CATEGORIES: Record<EquipSlot, ItemCategory[]> = {
  mainHand: ['weapon-1h', 'weapon-2h'], offHand: ['weapon-1h', 'shield'],
  armor: ['armor'], accessory: ['accessory'], sideboard1: [], sideboard2: [],
}

// ── Ownership (uniqueness) ────────────────────────────────────────────────────

// Item ids a unit has stashed (sideboards + the inactive weapon set) — owned, but
// the optimizer leaves them alone.
function stashedIds(unit: Unit): string[] {
  const inactive = unit.weaponSets[unit.activeWeaponSet === 0 ? 1 : 0]
  return [unit.equipment.sideboard1, unit.equipment.sideboard2, inactive.mainHand, inactive.offHand].filter((x): x is string => !!x)
}

// Every item id bound to any unit OTHER than `exceptId`, in any slot. Used to keep
// a single-hero optimize from stealing another hero's gear.
export function inUseByOthers(units: Unit[], exceptId: string): Set<string> {
  const set = new Set<string>()
  for (const u of units) {
    if (u.id === exceptId) continue
    for (const ws of u.weaponSets) { if (ws.mainHand) set.add(ws.mainHand); if (ws.offHand) set.add(ws.offHand) }
    for (const v of Object.values(u.equipment)) if (v) set.add(v)
  }
  return set
}

// ── The allocator ─────────────────────────────────────────────────────────────

export type Loadout = Record<EquipSlot, string | null>
export interface SlotChange { slot: EquipSlot; from: string | null; to: string | null }
export interface HeroPlan { loadout: Loadout; changes: SlotChange[] }

function byId(equipment: EquipmentItem[]): Map<string, EquipmentItem> {
  return new Map(equipment.map((e) => [e.id, e]))
}

// Choose the best loadout for one hero from `available` (a pool that already
// excludes anything off-limits). Mutates nothing; tracks local picks so the two
// hands never grab the same instance.
function chooseLoadout(unit: Unit, doctrine: Doctrine, available: EquipmentItem[]): HeroPlan {
  const taken = new Set<string>()
  const eligible = available.filter((i) => isEligible(i, unit))
  const best = (cats: ItemCategory[]): EquipmentItem | null => {
    let pick: EquipmentItem | null = null, ps = -Infinity
    for (const i of eligible) {
      if (taken.has(i.id) || !cats.includes(i.category)) continue
      const s = itemScore(i, doctrine)
      if (s > ps) { ps = s; pick = i }
    }
    if (pick) taken.add(pick.id)
    return pick
  }

  // Weapons: best 2H vs (best 1H + best off-hand). Pick the higher-scoring combo.
  const oneH = eligible.filter((i) => i.category === 'weapon-1h').sort((a, b) => itemScore(b, doctrine) - itemScore(a, doctrine))
  const twoH = eligible.filter((i) => i.category === 'weapon-2h').sort((a, b) => itemScore(b, doctrine) - itemScore(a, doctrine))
  const offC = eligible.filter((i) => i.category === 'shield' || i.category === 'weapon-1h').sort((a, b) => itemScore(b, doctrine) - itemScore(a, doctrine))
  const best2H = twoH[0] ?? null
  const best1H = oneH[0] ?? null
  const bestOff = offC.find((i) => i.id !== best1H?.id) ?? null
  const dual = (best1H ? itemScore(best1H, doctrine) : 0) + (bestOff ? itemScore(bestOff, doctrine) : 0)
  const solo = best2H ? itemScore(best2H, doctrine) : -1
  let mainHand: string | null, offHand: string | null
  if (best2H && solo >= dual) { mainHand = best2H.id; offHand = null; taken.add(best2H.id) }
  else { mainHand = best1H?.id ?? null; offHand = bestOff?.id ?? null; if (mainHand) taken.add(mainHand); if (offHand) taken.add(offHand) }

  const armor = best(SLOT_CATEGORIES.armor)?.id ?? null
  const accessory = best(SLOT_CATEGORIES.accessory)?.id ?? null

  const loadout: Loadout = {
    mainHand, offHand, armor, accessory,
    sideboard1: unit.equipment.sideboard1, sideboard2: unit.equipment.sideboard2,
  }
  const changes: SlotChange[] = STAT_SLOTS
    .map((slot) => ({ slot, from: getEquippedId(unit, slot), to: loadout[slot] }))
    .filter((c) => c.from !== c.to)
  return { loadout, changes }
}

// Optimize ONE hero, drawing only from gear no other hero is using (+ their own).
export function optimizeHero(unit: Unit, units: Unit[], equipment: EquipmentItem[], doctrine: Doctrine): HeroPlan {
  const off = inUseByOthers(units, unit.id)
  const pool = equipment.filter((e) => !off.has(e.id))
  return chooseLoadout(unit, doctrine, pool)
}

// Optimize the WHOLE army. Reallocates everyone's active gear from a shared pool
// (so a great sword can migrate to whoever uses it best), strongest heroes pick
// first (seniority — explainable), stashed gear is never touched.
export function optimizeArmy(units: Unit[], equipment: EquipmentItem[], doctrineFor: (u: Unit) => Doctrine, isLocked?: (u: Unit) => boolean): Record<string, HeroPlan> {
  const taken = new Set<string>()
  for (const u of units) for (const id of stashedIds(u)) taken.add(id)
  // A locked hero keeps exactly what they wear; reserve it so nobody steals it.
  for (const u of units) if (isLocked?.(u)) for (const slot of STAT_SLOTS) { const id = getEquippedId(u, slot); if (id) taken.add(id) }
  const order = [...units].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))
  const out: Record<string, HeroPlan> = {}
  for (const u of order) {
    if (isLocked?.(u)) continue
    const pool = equipment.filter((e) => !taken.has(e.id))
    const plan = chooseLoadout(u, doctrineFor(u), pool)
    for (const slot of STAT_SLOTS) { const id = plan.loadout[slot]; if (id) taken.add(id) }
    if (plan.changes.length) out[u.id] = plan
  }
  return out
}

// A clone of `unit` with `loadout` applied — for derived-stat previews without
// mutating the store (hover "what if", diff before/after Might).
export function withLoadout(unit: Unit, loadout: Partial<Loadout>): Unit {
  const active = unit.activeWeaponSet
  const weaponSets = unit.weaponSets.map((ws, i) =>
    i === active
      ? { mainHand: loadout.mainHand !== undefined ? loadout.mainHand : ws.mainHand, offHand: loadout.offHand !== undefined ? loadout.offHand : ws.offHand }
      : ws,
  ) as [Unit['weaponSets'][0], Unit['weaponSets'][1]]
  return {
    ...unit,
    weaponSets,
    equipment: {
      ...unit.equipment,
      armor: loadout.armor !== undefined ? loadout.armor : unit.equipment.armor,
      accessory: loadout.accessory !== undefined ? loadout.accessory : unit.equipment.accessory,
    },
  }
}

// Items a hero could put in `slot` right now: compatible category, eligible, and
// not bound to another hero (their own current item included). Sorted best-first
// for the given doctrine.
export function slotOptions(unit: Unit, slot: EquipSlot, units: Unit[], equipment: EquipmentItem[], doctrine: Doctrine): EquipmentItem[] {
  const off = inUseByOthers(units, unit.id)
  const cats = SLOT_CATEGORIES[slot]
  return equipment
    .filter((e) => cats.includes(e.category) && isEligible(e, unit) && !off.has(e.id))
    .sort((a, b) => itemScore(b, doctrine) - itemScore(a, doctrine))
}

// Allocate the best gear for ONE slot across the whole army (the Matrix's
// per-column auto-fill). Strongest heroes pick first; each instance goes to one
// hero. Returns { unitId → itemId } only for heroes whose pick differs from now.
export function optimizeColumn(slot: EquipSlot, units: Unit[], equipment: EquipmentItem[], doctrineFor: (u: Unit) => Doctrine): Record<string, string> {
  const cats = SLOT_CATEGORIES[slot]
  // Reserve every item bound elsewhere (any slot of any hero) EXCEPT this column's
  // current occupants — those are up for reallocation.
  const occupants = new Set(units.map((u) => getEquippedId(u, slot)).filter((x): x is string => !!x))
  const reserved = new Set<string>()
  for (const u of units) {
    for (const ws of u.weaponSets) for (const id of [ws.mainHand, ws.offHand]) if (id && !occupants.has(id)) reserved.add(id)
    for (const id of Object.values(u.equipment)) if (id && !occupants.has(id)) reserved.add(id)
  }
  const taken = new Set<string>()
  const out: Record<string, string> = {}
  for (const u of [...units].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))) {
    const d = doctrineFor(u)
    let pick: EquipmentItem | null = null, ps = -Infinity
    for (const i of equipment) {
      if (!cats.includes(i.category) || taken.has(i.id) || reserved.has(i.id) || !isEligible(i, u)) continue
      const s = itemScore(i, d)
      if (s > ps) { ps = s; pick = i }
    }
    if (pick) { taken.add(pick.id); if (pick.id !== getEquippedId(u, slot)) out[u.id] = pick.id }
  }
  return out
}
