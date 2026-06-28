import { create } from 'zustand'
import { useGameStore } from '@/stores/useGameStore'
import { isConsumable } from '@/data/consumables'
import { supplyOption } from './expedition'
import type { PackItem } from '@/types'
import {
  DEFAULT_LOADOUT, DEFAULT_LOOT_CATS, DEFAULT_RETURN_ON, newSupplyEntry,
  type Loadout, type LootCategory, type ReturnConditionId, type ReturnModeId,
} from './expedition'

// §logistics ⇄ §consumables bridge — the loadout is the *target* (what a hero
// should carry); Unit.pack is the *real* carried inventory. Push the loadout's
// quantities into each hero's pack carry-targets so the game's in-town reconcile
// (reconcilePackInTown) withdraws/deposits from the guild stash toward them, and
// the carried weight counts against capacity. Removed supplies clear their intent
// (returning any carried stock to the stash).
function syncTargets(unitId: string, loadout: Loadout): void {
  const g = useGameStore.getState()
  const wanted = new Map<string, number>()
  for (const [id, e] of Object.entries(loadout)) if (e.qty > 0) wanted.set(id, e.qty)
  for (const [id, qty] of wanted) g.setCarryTarget(unitId, id, qty)
  const unit = g.units.find((u) => u.id === unitId)
  for (const p of unit?.pack ?? []) {
    if (p.target != null && isConsumable(p.itemId) && !wanted.has(p.itemId)) g.clearCarryTarget(unitId, p.itemId)
  }
}

// Reverse of the bridge: rebuild a loadout FROM the hero's persisted pack targets.
// `Unit.pack` is persisted but the loadout isn't, so on first `ensure` after a
// reload we hydrate the loadout from the surviving targets instead of letting the
// default loadout clobber them (which would dump carried stock + reset quantities).
// Returns null when the hero carries no configured consumables → use the default.
function loadoutFromPack(pack: PackItem[] | undefined): Loadout | null {
  const entries = (pack ?? []).filter((p) => p.target != null && isConsumable(p.itemId) && supplyOption(p.itemId))
  if (entries.length === 0) return null
  const loadout: Loadout = {}
  for (const p of entries) loadout[p.itemId] = newSupplyEntry(p.target!)
  return loadout
}

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
  // §resupply trip: while 'returning', the absolute game tick at which the hero
  // (instant-deployed to a town to deposit loot + restock) redeploys back to the
  // hunt anchor (`locationId`). Undefined until the trip starts. Open-world routing
  // replaces the instant teleport later (gated on store deployMode).
  resupplyUntil?: number
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

export const useExpeditionStore = create<ExpState>((set, get) => ({
  heroes: {},
  returnMode: 'individual',

  ensure: (unitId) => {
    if (get().heroes[unitId]) return
    // Hydrate from any surviving pack targets (reload-safe); else the default.
    const unit = useGameStore.getState().units.find((u) => u.id === unitId)
    const hydrated = loadoutFromPack(unit?.pack)
    const hero = hydrated ? freshHero({ loadout: hydrated }) : freshHero()
    set((s) => (s.heroes[unitId] ? s : { heroes: { ...s.heroes, [unitId]: hero } }))
    const he = get().heroes[unitId]
    if (he) syncTargets(unitId, he.loadout)
  },

  addSupply: (unitId, itemId) => {
    set((s) => {
      const cur = s.heroes[unitId] ?? freshHero()
      // Always persist the hero, even if the item is already present (a fresh hero
      // whose default loadout already lists it), so the bridge can read it back.
      const loadout = cur.loadout[itemId] ? cur.loadout : { ...cur.loadout, [itemId]: newSupplyEntry() }
      return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout } } }
    })
    const he = get().heroes[unitId]
    if (he) syncTargets(unitId, he.loadout)
  },

  setSupplyQty: (unitId, itemId, qty) => {
    set((s) => {
      const cur = s.heroes[unitId] ?? freshHero()
      const loadout = { ...cur.loadout }
      const n = Math.max(0, Math.floor(qty))
      if (n <= 0) delete loadout[itemId]
      else loadout[itemId] = { ...(loadout[itemId] ?? newSupplyEntry(n)), qty: n }
      return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout } } }
    })
    const he = get().heroes[unitId]
    if (he) syncTargets(unitId, he.loadout)
  },

  toggleSupplySource: (unitId, itemId, source) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    const entry = cur.loadout[itemId] ?? newSupplyEntry()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout: { ...cur.loadout, [itemId]: { ...entry, [source]: !entry[source] } } } } }
  }),

  removeSupply: (unitId, itemId) => {
    set((s) => {
      const cur = s.heroes[unitId] ?? freshHero()
      const loadout = { ...cur.loadout }
      delete loadout[itemId]
      return { heroes: { ...s.heroes, [unitId]: { ...cur, loadout } } }
    })
    const he = get().heroes[unitId]
    if (he) syncTargets(unitId, he.loadout)
  },

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

  applyToParty: (srcId, targetIds) => {
    set((s) => {
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
    })
    for (const id of targetIds) { const he = get().heroes[id]; if (he) syncTargets(id, he.loadout) }
  },

  commitStep: (unitId, patch) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, ...patch } } }
  }),
}))

// Dev-only: expose on window for Playwright/devtools (mirrors App.tsx's __game),
// dead-code-stripped from production by the DEV gate.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __exp?: typeof useExpeditionStore }).__exp = useExpeditionStore
}
