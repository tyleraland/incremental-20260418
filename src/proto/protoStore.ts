import { create } from 'zustand'

// ── Prototype-only mock state ───────────────────────────────────────────────--
//
// State the ?proto=1 exploration needs that the real game store doesn't model
// yet: the stage's current zoom altitude (so the lens can follow it), the
// kittens-style per-location "attunement" upgrade economy, story-path choices,
// and the Army Matrix's hero locks + Optimize proposals. All mock — none of it
// is persisted or wired into the save format.

export type ZoomLevel = 0 | 1 | 2

// Attunement: a currency that trickles in with real game time. We derive the
// *available* balance from the game clock (floor(ticks / ATTUNE_TICKS) minus what
// you've spent), so it ticks up on its own without a separate timer.
export const ATTUNE_TICKS = 50 // 5 ticks/s → ~10s per point

export interface LocationUpgrade {
  id: string; name: string; desc: string; base: number; max: number; icon: string
}
// Generic upgrade catalog (same options at every location for the mock).
export const LOCATION_UPGRADES: LocationUpgrade[] = [
  { id: 'vendor', name: 'Trade Post',  desc: 'Station an NPC vendor here to buy & sell on site.', base: 3, max: 1, icon: '🏪' },
  { id: 'drops',  name: 'Rich Veins',  desc: '+15% drop rate from foes here, per level.',         base: 2, max: 5, icon: '💎' },
  { id: 'cull',   name: 'Ward Stones', desc: '−1 monster kept on the field, per level.',           base: 4, max: 3, icon: '🛑' },
  { id: 'camp',   name: 'Field Camp',  desc: '+20% resting regen for heroes here, per level.',      base: 2, max: 3, icon: '⛺' },
  { id: 'ley',    name: 'Ley Anchor',  desc: 'Attune to this site faster.',                         base: 5, max: 3, icon: '✷' },
]
export function upgradeCost(u: LocationUpgrade, level: number): number {
  return u.base * (level + 1)
}

export interface StoryPath { id: string; name: string; blurb: string }
export const STORY_PATHS: StoryPath[] = [
  { id: 'chart',  name: 'Chart the surroundings', blurb: 'Scouts map the hidden approaches — a shortcut opens to the next region.' },
  { id: 'locals', name: 'Treat with the locals',  blurb: 'The settlement opens its gates; whispers point to a deeper vault below.' },
  { id: 'purge',  name: 'Purge the nest',         blurb: 'Burn it out. Fewer foes prowl here — but the land remembers the fire.' },
]

interface ProtoState {
  zoomLevel: ZoomLevel
  attunementSpent: number
  upgrades: Record<string, Record<string, number>>   // locId → upgradeId → level
  storyChoice: Record<string, string>                // locId → chosen path id
  heroLocks: string[]                                // hero ids the matrix won't overwrite
  proposals: Record<string, string[]>                // heroId → proposed (not-yet-applied) tactic ids

  setZoomLevel: (z: ZoomLevel) => void
  buyUpgrade: (locId: string, upId: string, cost: number, max: number) => void
  chooseStory: (locId: string, pathId: string) => void
  toggleLock: (heroId: string) => void
  setProposals: (p: Record<string, string[]>) => void
  clearProposals: () => void
}

export const useProtoStore = create<ProtoState>((set) => ({
  zoomLevel: 0,
  attunementSpent: 0,
  upgrades: {},
  storyChoice: {},
  heroLocks: [],
  proposals: {},

  setZoomLevel: (z) => set((s) => (s.zoomLevel === z ? s : { zoomLevel: z })),
  buyUpgrade: (locId, upId, cost, max) => set((s) => {
    const cur = s.upgrades[locId]?.[upId] ?? 0
    if (cur >= max) return s
    return {
      attunementSpent: s.attunementSpent + cost,
      upgrades: { ...s.upgrades, [locId]: { ...(s.upgrades[locId] ?? {}), [upId]: cur + 1 } },
    }
  }),
  chooseStory: (locId, pathId) => set((s) => ({ storyChoice: { ...s.storyChoice, [locId]: pathId } })),
  toggleLock: (heroId) => set((s) => ({
    heroLocks: s.heroLocks.includes(heroId) ? s.heroLocks.filter((x) => x !== heroId) : [...s.heroLocks, heroId],
  })),
  setProposals: (p) => set({ proposals: p }),
  clearProposals: () => set({ proposals: {} }),
}))

// A small starting pool so the upgrade economy is playable immediately in the
// mock (a real save would start at 0 and earn it all from play time).
export const ATTUNE_STARTING = 8

// Attunement available right now, given the game clock and what's been spent.
export function attunementAvailable(ticks: number, spent: number): number {
  return Math.max(0, ATTUNE_STARTING + Math.floor(ticks / ATTUNE_TICKS) - spent)
}
