import { create } from 'zustand'
import {
  DEFAULT_LOADOUT, DEFAULT_LOOT_CATS, DEFAULT_RETURN_ON, newSupplyEntry,
  type Loadout, type LootCategory, type ReturnConditionId, type ReturnModeId,
} from './expedition'

// §logistics — proto-only per-hero state. Each hero carries their own plan
// (supplies loadout + loot categories + return conditions) plus runtime (supplies
// left, status). The party is just the heroes sharing a location. Capacity is the
// real proto loot pack (protoStore.packs); this holds the rest. The driver
// (useExpeditionDriver) advances it each game tick.

export type ShareFlag = 'shareLoot' | 'acceptLoot' | 'shareSupplies' | 'acceptSupplies'

export interface HeroExpedition {
  loadout: Loadout                  // supply itemId → { qty, storage, merchant }
  lootCats: LootCategory[]          // categories to keep
  returnOn: ReturnConditionId[]     // checked return conditions
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
}

interface ExpState {
  heroes: Record<string, HeroExpedition>
  returnMode: ReturnModeId
  ensure: (unitId: string) => void
  addSupply: (unitId: string, itemId: string) => void
  setSupplyQty: (unitId: string, itemId: string, qty: number) => void
  toggleSupplySource: (unitId: string, itemId: string, source: 'storage' | 'merchant') => void
  removeSupply: (unitId: string, itemId: string) => void
  toggleLootCat: (unitId: string, cat: LootCategory) => void
  toggleReturnOn: (unitId: string, cond: ReturnConditionId) => void
  toggleShareFlag: (unitId: string, flag: ShareFlag) => void
  setReturnTown: (unitId: string, townId: string | null) => void
  setReturnMode: (mode: ReturnModeId) => void
  applyToParty: (srcId: string, targetIds: string[]) => void
  commitStep: (unitId: string, patch: Partial<HeroExpedition>) => void
}

export const freshHero = (e: Partial<HeroExpedition> = {}): HeroExpedition => ({
  loadout: e.loadout ?? { ...DEFAULT_LOADOUT },
  lootCats: e.lootCats ?? [...DEFAULT_LOOT_CATS],
  returnOn: e.returnOn ?? [...DEFAULT_RETURN_ON],
  shareLoot: e.shareLoot ?? true,
  acceptLoot: e.acceptLoot ?? true,
  shareSupplies: e.shareSupplies ?? false,
  acceptSupplies: e.acceptSupplies ?? true,
  returnTown: e.returnTown ?? null,
  suppliesLeft: 1,
  status: 'hunting',
  locationId: e.locationId ?? null,
})

export const useExpeditionStore = create<ExpState>((set) => ({
  heroes: {},
  returnMode: 'individual',

  ensure: (unitId) => set((s) => (s.heroes[unitId] ? s : { heroes: { ...s.heroes, [unitId]: freshHero() } })),

  addSupply: (unitId, itemId) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    if (cur.loadout[itemId]) return s
    return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout: { ...cur.loadout, [itemId]: newSupplyEntry() } } } }
  }),

  setSupplyQty: (unitId, itemId, qty) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const loadout = { ...cur.loadout }
    const n = Math.max(0, Math.floor(qty))
    if (n <= 0) delete loadout[itemId]
    else loadout[itemId] = { ...(loadout[itemId] ?? newSupplyEntry(n)), qty: n }
    return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout } } }
  }),

  toggleSupplySource: (unitId, itemId, source) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const entry = cur.loadout[itemId] ?? newSupplyEntry()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout: { ...cur.loadout, [itemId]: { ...entry, [source]: !entry[source] } } } } }
  }),

  removeSupply: (unitId, itemId) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const loadout = { ...cur.loadout }
    delete loadout[itemId]
    return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout } } }
  }),

  toggleLootCat: (unitId, cat) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const lootCats = cur.lootCats.includes(cat) ? cur.lootCats.filter((c) => c !== cat) : [...cur.lootCats, cat]
    return { heroes: { ...s.heroes, [unitId]: { ...cur, lootCats } } }
  }),

  toggleReturnOn: (unitId, cond) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const returnOn = cur.returnOn.includes(cond) ? cur.returnOn.filter((c) => c !== cond) : [...cur.returnOn, cond]
    return { heroes: { ...s.heroes, [unitId]: { ...cur, returnOn } } }
  }),

  toggleShareFlag: (unitId, flag) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, [flag]: !cur[flag] } } }
  }),

  setReturnTown: (unitId, townId) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, returnTown: townId } } }
  }),

  setReturnMode: (mode) => set({ returnMode: mode }),

  applyToParty: (srcId, targetIds) => set((s) => {
    const src = s.heroes[srcId]
    if (!src) return s
    const heroes = { ...s.heroes }
    const cloneLoadout = (l: Loadout): Loadout => Object.fromEntries(Object.entries(l).map(([k, e]) => [k, { ...e }]))
    for (const id of targetIds) {
      const cur = heroes[id] ?? freshHero()
      heroes[id] = {
        ...cur, loadout: cloneLoadout(src.loadout), lootCats: [...src.lootCats], returnOn: [...src.returnOn],
        shareLoot: src.shareLoot, acceptLoot: src.acceptLoot, shareSupplies: src.shareSupplies, acceptSupplies: src.acceptSupplies,
      }
    }
    return { heroes }
  }),

  commitStep: (unitId, patch) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, ...patch } } }
  }),
}))
