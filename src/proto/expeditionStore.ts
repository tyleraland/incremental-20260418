import { create } from 'zustand'
import {
  DEFAULT_LOADOUT, DEFAULT_LOOT_CATS, DEFAULT_RETURN_ON,
  type LootCategory, type ReturnConditionId, type ReturnModeId,
} from './expedition'

// §logistics — proto-only per-hero state. Each hero carries their own plan
// (supplies loadout + loot categories + return conditions) plus runtime (supplies
// left, status). The party is just the heroes sharing a location. Capacity is the
// real proto loot pack (protoStore.packs); this holds the rest. The driver
// (useExpeditionDriver) advances it each game tick.

export interface HeroExpedition {
  loadout: Record<string, number>   // supply itemId → qty carried
  lootCats: LootCategory[]          // categories to keep
  returnOn: ReturnConditionId[]     // checked return conditions
  suppliesLeft: number              // 0..1 runtime
  status: 'hunting' | 'returning'
  locationId: string | null         // run anchor — a change resets the run
}

interface ExpState {
  heroes: Record<string, HeroExpedition>
  returnMode: ReturnModeId
  ensure: (unitId: string) => void
  setSupplyQty: (unitId: string, itemId: string, qty: number) => void
  toggleLootCat: (unitId: string, cat: LootCategory) => void
  toggleReturnOn: (unitId: string, cond: ReturnConditionId) => void
  setReturnMode: (mode: ReturnModeId) => void
  applyToParty: (srcId: string, targetIds: string[]) => void
  commitStep: (unitId: string, patch: Partial<HeroExpedition>) => void
}

export const freshHero = (e: Partial<HeroExpedition> = {}): HeroExpedition => ({
  loadout: e.loadout ?? { ...DEFAULT_LOADOUT },
  lootCats: e.lootCats ?? [...DEFAULT_LOOT_CATS],
  returnOn: e.returnOn ?? [...DEFAULT_RETURN_ON],
  suppliesLeft: 1,
  status: 'hunting',
  locationId: e.locationId ?? null,
})

export const useExpeditionStore = create<ExpState>((set) => ({
  heroes: {},
  returnMode: 'individual',

  ensure: (unitId) => set((s) => (s.heroes[unitId] ? s : { heroes: { ...s.heroes, [unitId]: freshHero() } })),

  setSupplyQty: (unitId, itemId, qty) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const loadout = { ...cur.loadout }
    if (qty <= 0) delete loadout[itemId]; else loadout[itemId] = Math.floor(qty)
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

  setReturnMode: (mode) => set({ returnMode: mode }),

  applyToParty: (srcId, targetIds) => set((s) => {
    const src = s.heroes[srcId]
    if (!src) return s
    const heroes = { ...s.heroes }
    for (const id of targetIds) {
      const cur = heroes[id] ?? freshHero()
      heroes[id] = { ...cur, loadout: { ...src.loadout }, lootCats: [...src.lootCats], returnOn: [...src.returnOn] }
    }
    return { heroes }
  }),

  commitStep: (unitId, patch) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, ...patch } } }
  }),
}))
