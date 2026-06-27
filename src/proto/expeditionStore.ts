import { create } from 'zustand'
import {
  DEFAULT_CHOICES, LOADOUT_BASE_FILL, LOADOUT_SUPPLY, POSTURE_BURN, POSTURE_GAIN,
  FOCUS_PRESSURE, FOCUS_VALUE,
  type LoadoutId, type PostureId, type LootFocusId, type ReturnRuleId,
  type LocationProfile, type LootCategory,
} from './expedition'

// §expedition — proto-only state machine for the logistics feel prototype. One
// expedition per location (the party = heroes stationed there). Abstracted: not
// wired to real combat/loot/save; it drives a meter and produces a return report.

export interface Expedition {
  loadout: LoadoutId
  posture: PostureId
  lootFocus: LootFocusId
  returnRule: ReturnRuleId
  capacity: number   // 0..1 — supplies/tools/quest gear (base) + accumulated loot
  supplies: number   // 0..1 remaining
  danger: number     // 0..1 current (rises over a run)
  elapsed: number    // seconds this run
}

export interface ReturnReport {
  locationId: string
  reason: string
  durationSec: number
  party: number
  capacityAt: number
  gains: { gold: number; notable: { label: string; category: LootCategory }[] }
  spend: { suppliesUsedPct: number; restockGold: number; consumables: number }
  processed: string[]
  tuning: string
}

type ChoiceKey = 'loadout' | 'posture' | 'lootFocus' | 'returnRule'

interface ExpState {
  expeditions: Record<string, Expedition>
  report: ReturnReport | null
  ensure: (locId: string) => void
  setChoice: (locId: string, key: ChoiceKey, value: string) => void
  // Advance the run by dt seconds; returns a trigger reason id if a Return Rule
  // fires this step (the caller then calls returnNow), else null.
  advance: (locId: string, dt: number, profile: LocationProfile) => ReturnRuleId | null
  returnNow: (locId: string, reason: ReturnRuleId, profile: LocationProfile, party: number, locName: string) => void
  dismissReport: () => void
}

const freshRun = (e: Partial<Expedition> = {}): Expedition => ({
  loadout: e.loadout ?? DEFAULT_CHOICES.loadout,
  posture: e.posture ?? DEFAULT_CHOICES.posture,
  lootFocus: e.lootFocus ?? DEFAULT_CHOICES.lootFocus,
  returnRule: e.returnRule ?? DEFAULT_CHOICES.returnRule,
  capacity: LOADOUT_BASE_FILL[e.loadout ?? DEFAULT_CHOICES.loadout],
  supplies: 1,
  danger: 0,
  elapsed: 0,
})

const REASON_TEXT: Record<ReturnRuleId, string> = {
  'pack-full': 'Pack full', 'supplies-out': 'Supplies ran dry',
  'danger-high': 'Area got too dangerous', 'goal-met': 'Run goal reached', 'manual': 'You called them home',
}

function buildReport(locId: string, e: Expedition, reason: ReturnRuleId, profile: LocationProfile, party: number): ReturnReport {
  const value = FOCUS_VALUE[e.lootFocus] * POSTURE_GAIN[e.posture]
  const gold = Math.round(e.capacity * Math.max(1, party) * 70 * value)
  const sig = profile.signatures
  const notable: { label: string; category: LootCategory }[] = []
  if (e.lootFocus === 'rare') notable.push({ label: 'a rare card', category: 'Card' }, { label: 'an unidentified unique', category: 'Unique' })
  else {
    notable.push({ label: `${sig[0] ?? 'Vendor Loot'} haul`, category: sig[0] ?? 'Vendor Loot' })
    if (e.capacity > 0.7) notable.push({ label: 'a direct gear upgrade', category: 'Equipment' })
    if (sig.includes('Card')) notable.push({ label: 'a monster card', category: 'Card' })
  }
  const suppliesUsedPct = Math.round((1 - e.supplies) * 100)
  const consumables = Math.round((suppliesUsedPct / 100) * 12 * POSTURE_BURN[e.posture])
  const restockGold = Math.round(consumables * 9)

  const processed: string[] = []
  if (e.lootFocus === 'everything') processed.push(`Sold vendor trash for ${Math.round(gold * 0.25)}g`)
  processed.push(`Stored ${e.capacity > 0.6 ? 'valuables + ' : ''}finds in the guild stash`)
  if (consumables > 0) processed.push(`Restocked ${consumables} consumables (${restockGold}g)`)

  // One useful tuning suggestion — a small heuristic over how the run went.
  let tuning: string
  if (reason === 'supplies-out' && e.elapsed < 25) tuning = 'Supplies ran out quickly — try a Heavy loadout or the Conserve posture.'
  else if (reason === 'pack-full' && e.lootFocus === 'everything' && value < 1) tuning = 'The pack filled with trash — switch Loot Focus to Valuables to come home richer.'
  else if (reason === 'danger-high') tuning = 'This area runs hot — bring a healer, or set the Return Rule to bail sooner.'
  else if (e.lootFocus === 'rare' && e.capacity < 0.4) tuning = 'Rare focus rarely fills — switch to Materials if you need project mats.'
  else if (e.posture === 'conserve' && e.capacity >= 1) tuning = 'Easy run — try Push Hard here for more loot per trip.'
  else tuning = 'Solid run. Same plan should keep paying off.'

  return {
    locationId: locId,
    reason: REASON_TEXT[reason],
    durationSec: Math.round(e.elapsed),
    party,
    capacityAt: e.capacity,
    gains: { gold, notable: notable.slice(0, 3) },
    spend: { suppliesUsedPct, restockGold, consumables },
    processed,
    tuning,
  }
}

export const useExpeditionStore = create<ExpState>((set, get) => ({
  expeditions: {},
  report: null,

  ensure: (locId) => set((s) => (s.expeditions[locId] ? s : { expeditions: { ...s.expeditions, [locId]: freshRun() } })),

  setChoice: (locId, key, value) => set((s) => {
    const e = s.expeditions[locId] ?? freshRun()
    const next = { ...e, [key]: value } as Expedition
    // Changing the loadout re-bases starting fill only when at/near the start of a run.
    if (key === 'loadout' && e.capacity <= LOADOUT_BASE_FILL[e.loadout] + 0.001) next.capacity = LOADOUT_BASE_FILL[value as LoadoutId]
    return { expeditions: { ...s.expeditions, [locId]: next } }
  }),

  advance: (locId, dt, profile) => {
    const s = get()
    if (s.report) return null   // paused while a report is open
    const e = s.expeditions[locId]
    if (!e) return null
    const gain = profile.lootPressure * POSTURE_GAIN[e.posture] * FOCUS_PRESSURE[e.lootFocus] * dt
    const burn = profile.supplyBurn * POSTURE_BURN[e.posture] / LOADOUT_SUPPLY[e.loadout] * dt
    const capacity = Math.min(1, e.capacity + gain)
    const supplies = Math.max(0, e.supplies - burn)
    const danger = Math.min(1, Math.max(profile.danger, e.danger) + dt * 0.006)
    const next: Expedition = { ...e, capacity, supplies, danger, elapsed: e.elapsed + dt }
    set({ expeditions: { ...s.expeditions, [locId]: next } })

    // Evaluate the active Return Rule (capacity 100% always forces a return).
    if (capacity >= 1) return 'pack-full'
    switch (e.returnRule) {
      case 'supplies-out': if (supplies <= 0.03) return 'supplies-out'; break
      case 'danger-high':  if (danger >= 0.8) return 'danger-high'; break
      case 'goal-met':     if (capacity >= 0.8) return 'goal-met'; break
      case 'pack-full':    /* handled by the cap check above */ break
      case 'manual':       break
    }
    return null
  },

  returnNow: (locId, reason, profile, party, _locName) => set((s) => {
    const e = s.expeditions[locId] ?? freshRun()
    const report = buildReport(locId, e, reason, profile, party)
    // Reset for the next run (same choices, fresh meter).
    const reset = freshRun({ loadout: e.loadout, posture: e.posture, lootFocus: e.lootFocus, returnRule: e.returnRule })
    return { expeditions: { ...s.expeditions, [locId]: reset }, report }
  }),

  dismissReport: () => set({ report: null }),
}))
