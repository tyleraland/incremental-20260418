import { create } from 'zustand'

// ── Prototype-only mock state ───────────────────────────────────────────────--
//
// State the ?proto=1 exploration needs that the real game store doesn't model
// yet: the stage's current zoom altitude (so the lens can follow it), the
// kittens-style per-location "attunement" upgrade economy, story-path choices,
// and the Army Matrix's hero locks + Optimize proposals. All mock — none of it
// is persisted or wired into the save format.

export type ZoomLevel = 0 | 1 | 2

// What the stage's top-half "details" overlay is showing. Decisions happen in the
// bottom lens; this is the research/detail surface drawn over the battlefield.
export type StageOverlay =
  | { kind: 'skill-tree'; unitId: string }

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

// ── Quests (mock) ────────────────────────────────────────────────────────────--
//
// A WoW-style quest board per location, replacing the old familiarity / story /
// upgrade surfaces. One quest per location can be active ("committed") at a time;
// finishing it unlocks the next in the chain. All mock + unpersisted. Display
// strings template {foe} (the site's signature monster), {place} (location name)
// and {n} (the objective target) at render so one chain reads fine everywhere.
export interface QuestDef {
  id: string
  title: string
  story: string        // narrative blurb (shown when expanded)
  objective: string    // what you commit to
  target: number       // count that satisfies the objective
  rewards: string[]
  requires: string[]   // quest ids that must be completed before this is eligible
}
export const LOCATION_QUESTS: QuestDef[] = [
  { id: 'q-cull',    title: 'Cull the {foe}s',  story: 'The {foe}s have grown bold around {place}. Thin their numbers before they overrun the approach.', objective: 'Defeat {n} {foe}s', target: 20, rewards: ['120 gold', 'Familiar Charm'], requires: [] },
  { id: 'q-forage',  title: 'Forage {place}',   story: 'The quartermaster needs reagents that only grow wild around {place}.',                              objective: 'Gather {n} reagents', target: 15, rewards: ['Sturdy Belt', '60 gold'], requires: [] },
  { id: 'q-relic',   title: 'The Buried Relic', story: 'Scouts whisper of a relic lost beneath {place}, guarded by the {foe}s.',                            objective: 'Recover the relic',   target: 1,  rewards: ['Rare cache', '200 gold'], requires: ['q-cull'] },
  { id: 'q-warlord', title: 'Break the Warlord',story: 'A warlord has rallied the {foe}s of {place} into a host. End the threat at its head.',             objective: 'Defeat the warlord',  target: 1,  rewards: ['Epic trophy', '500 gold'], requires: ['q-cull', 'q-forage'] },
]

export type QuestStatus =
  | 'locked'     // prerequisites unmet — gray (…), can't expand
  | 'available'  // eligible & nothing else committed — yellow (!)
  | 'blocked'    // eligible but another quest is committed here — gray (!)
  | 'progress'   // committed, objective not yet met — gray (?)
  | 'ready'      // committed & satisfied — yellow (?), turn in to complete
  | 'done'       // completed (archived)

export function questStatus(
  q: QuestDef,
  o: { activeId: string | null; doneIds: string[]; progress: number },
): QuestStatus {
  if (o.doneIds.includes(q.id)) return 'done'
  if (o.activeId === q.id) return o.progress >= q.target ? 'ready' : 'progress'
  const eligible = q.requires.every((r) => o.doneIds.includes(r))
  if (!eligible) return 'locked'
  return o.activeId ? 'blocked' : 'available'
}

interface ProtoState {
  zoomLevel: ZoomLevel
  // A cross-component request for the stage to fly to a zoom stop (ProtoApp /
  // roster → stage). nonce so the same level re-fires.
  zoomRequest: { level: ZoomLevel; nonce: number } | null
  // Bumped when the lens should drill into the Hero tab (double-tap a roster
  // hero / initial focus). A plain single-tap selects without bumping this.
  heroTabRequest: number
  // Stage overlay (top half = details/research, shown in front of the
  // battlefield): the skill tree for now; item details / codex later.
  stageOverlay: StageOverlay | null
  attunementSpent: number
  upgrades: Record<string, Record<string, number>>   // locId → upgradeId → level
  storyChoice: Record<string, string>                // locId → chosen path id
  heroLocks: string[]                                // hero ids the matrix won't overwrite
  // Quests (mock): per-location commitment, progress, and completion archive.
  activeQuest: Record<string, string | null>         // locId → committed quest id
  questProgress: Record<string, Record<string, number>> // locId → questId → count
  completedQuests: Record<string, string[]>          // locId → done quest ids (in order)

  setZoomLevel: (z: ZoomLevel) => void
  requestZoom: (level: ZoomLevel) => void
  requestHeroTab: () => void
  openStageOverlay: (o: StageOverlay) => void
  closeStageOverlay: () => void
  buyUpgrade: (locId: string, upId: string, cost: number, max: number) => void
  chooseStory: (locId: string, pathId: string) => void
  toggleLock: (heroId: string) => void
  acceptQuest: (locId: string, questId: string) => void
  advanceQuest: (locId: string, questId: string, by: number) => void  // mock progress
  turnInQuest: (locId: string, questId: string) => void
}

export const useProtoStore = create<ProtoState>((set) => ({
  zoomLevel: 0,
  zoomRequest: null,
  heroTabRequest: 0,
  stageOverlay: null,
  attunementSpent: 0,
  upgrades: {},
  storyChoice: {},
  heroLocks: [],
  activeQuest: {},
  questProgress: {},
  completedQuests: {},

  setZoomLevel: (z) => set((s) => (s.zoomLevel === z ? s : { zoomLevel: z })),
  requestZoom: (level) => set((s) => ({ zoomRequest: { level, nonce: (s.zoomRequest?.nonce ?? 0) + 1 } })),
  requestHeroTab: () => set((s) => ({ heroTabRequest: s.heroTabRequest + 1 })),
  openStageOverlay: (o) => set({ stageOverlay: o }),
  closeStageOverlay: () => set({ stageOverlay: null }),
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
  acceptQuest: (locId, questId) => set((s) => {
    if (s.activeQuest[locId]) return s // one commitment at a time
    return {
      activeQuest: { ...s.activeQuest, [locId]: questId },
      questProgress: { ...s.questProgress, [locId]: { ...(s.questProgress[locId] ?? {}), [questId]: 0 } },
    }
  }),
  advanceQuest: (locId, questId, by) => set((s) => {
    const def = LOCATION_QUESTS.find((q) => q.id === questId)
    const cur = s.questProgress[locId]?.[questId] ?? 0
    const next = def ? Math.min(def.target, cur + by) : cur + by
    return { questProgress: { ...s.questProgress, [locId]: { ...(s.questProgress[locId] ?? {}), [questId]: next } } }
  }),
  turnInQuest: (locId, questId) => set((s) => ({
    activeQuest: s.activeQuest[locId] === questId ? { ...s.activeQuest, [locId]: null } : s.activeQuest,
    completedQuests: { ...s.completedQuests, [locId]: [...(s.completedQuests[locId] ?? []), questId] },
  })),
}))

// A small starting pool so the upgrade economy is playable immediately in the
// mock (a real save would start at 0 and earn it all from play time).
export const ATTUNE_STARTING = 8

// Attunement available right now, given the game clock and what's been spent.
export function attunementAvailable(ticks: number, spent: number): number {
  return Math.max(0, ATTUNE_STARTING + Math.floor(ticks / ATTUNE_TICKS) - spent)
}
