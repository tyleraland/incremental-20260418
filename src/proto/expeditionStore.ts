import { create } from 'zustand'
import {
  DEFAULT_CHOICES,
  type LoadoutId, type PostureId, type LootFocusId, type ReturnRuleId, type ReturnModeId,
} from './expedition'

// §expedition — proto-only per-hero logistics state. Each hero carries their own
// run (config + supplies + status); the party is just the heroes sharing a
// location. Abstracted: pack/capacity is the existing proto loot pack
// (protoStore.packs); supplies + status live here. The driver (useExpeditionDriver)
// advances these each game tick.

export interface HeroExpedition {
  loadout: LoadoutId
  posture: PostureId
  lootFocus: LootFocusId
  returnRule: ReturnRuleId
  supplies: number              // 0..1 remaining
  status: 'hunting' | 'returning'
  locationId: string | null     // run anchor — a change resets the run
}

type ChoiceKey = 'loadout' | 'posture' | 'lootFocus' | 'returnRule'

interface ExpState {
  heroes: Record<string, HeroExpedition>
  returnMode: ReturnModeId
  ensure: (unitId: string) => void
  setChoice: (unitId: string, key: ChoiceKey, value: string) => void
  setReturnMode: (mode: ReturnModeId) => void
  applyToParty: (srcId: string, targetIds: string[]) => void
  // driver-facing: one update per hero per tick.
  commitStep: (unitId: string, patch: Partial<HeroExpedition>) => void
}

export const freshHero = (e: Partial<HeroExpedition> = {}): HeroExpedition => ({
  loadout: e.loadout ?? DEFAULT_CHOICES.loadout,
  posture: e.posture ?? DEFAULT_CHOICES.posture,
  lootFocus: e.lootFocus ?? DEFAULT_CHOICES.lootFocus,
  returnRule: e.returnRule ?? DEFAULT_CHOICES.returnRule,
  supplies: 1,
  status: 'hunting',
  locationId: e.locationId ?? null,
})

export const useExpeditionStore = create<ExpState>((set) => ({
  heroes: {},
  returnMode: 'individual',

  ensure: (unitId) => set((s) => (s.heroes[unitId] ? s : { heroes: { ...s.heroes, [unitId]: freshHero() } })),

  setChoice: (unitId, key, value) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, [key]: value } } }
  }),

  setReturnMode: (mode) => set({ returnMode: mode }),

  applyToParty: (srcId, targetIds) => set((s) => {
    const src = s.heroes[srcId]
    if (!src) return s
    const heroes = { ...s.heroes }
    for (const id of targetIds) {
      const cur = heroes[id] ?? freshHero()
      heroes[id] = { ...cur, loadout: src.loadout, posture: src.posture, lootFocus: src.lootFocus, returnRule: src.returnRule }
    }
    return { heroes }
  }),

  commitStep: (unitId, patch) => set((s) => {
    const cur = s.heroes[unitId] ?? freshHero()
    return { heroes: { ...s.heroes, [unitId]: { ...cur, ...patch } } }
  }),
}))
