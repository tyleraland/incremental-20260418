import { create } from 'zustand'
import { useGameStore } from '@/stores/useGameStore'

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
// Rewards are structured so item rewards can be inspected (open an item codex)
// before you commit; `itemId` references a real equipment def (src/data/equipment).
export type QuestReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'item'; itemId: string }
export interface QuestDef {
  id: string
  title: string
  story: string        // narrative blurb (shown when expanded)
  objective: string    // what you commit to
  target: number       // count that satisfies the objective
  rewards: QuestReward[]
  requires: string[]   // quest ids that must be completed before this is eligible
}
export const LOCATION_QUESTS: QuestDef[] = [
  { id: 'q-cull',    title: 'Cull the {foe}s',  story: 'The {foe}s have grown bold around {place}. Thin their numbers before they overrun the approach.', objective: 'Defeat {n} {foe}s', target: 20, rewards: [{ kind: 'gold', amount: 120 }, { kind: 'item', itemId: 'eq-leather' }], requires: [] },
  { id: 'q-forage',  title: 'Forage {place}',   story: 'The quartermaster needs reagents that only grow wild around {place}.',                              objective: 'Gather {n} reagents', target: 15, rewards: [{ kind: 'item', itemId: 'eq-shield-wood' }, { kind: 'gold', amount: 60 }], requires: [] },
  { id: 'q-relic',   title: 'The Buried Relic', story: 'Scouts whisper of a relic lost beneath {place}, guarded by the {foe}s.',                            objective: 'Recover the relic',   target: 1,  rewards: [{ kind: 'item', itemId: 'eq-wand' }, { kind: 'gold', amount: 200 }], requires: ['q-cull'] },
  { id: 'q-warlord', title: 'Break the Warlord',story: 'A warlord has rallied the {foe}s of {place} into a host. End the threat at its head.',             objective: 'Defeat the warlord',  target: 1,  rewards: [{ kind: 'item', itemId: 'eq-greatsword' }, { kind: 'item', itemId: 'eq-chainmail' }, { kind: 'gold', amount: 500 }], requires: ['q-cull', 'q-forage'] },
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

// ── Class-change quests (hero-relative) ──────────────────────────────────────--
//
// Unlike the per-location monster quests above, these are tied to a single hero
// rather than a location's progress. They live in the peaceful cities and turn a
// *Novice* (a hero with no class — `class: null`) into a specialized class. The
// board status is computed against the currently *selected* hero:
//   • no Novice selected            → gray (…)  "select Novice"
//   • a level-1 Novice selected     → gray (!)  "requires level 2+"
//   • a level-2+ Novice selected    → yellow (!) — that hero can *begin* the path
//   • committed, objective unmet    → gray (?)  — in progress (e.g. 0/1)
//   • committed, objective met      → yellow (?) — ready to change class
// Only one hero may be committed to a given path at a time; while it's committed
// no one else can begin it. Committing/cancelling is mock proto state, but the
// final class change is written to the real game unit (it persists via the units
// codec).
//
// Objective (the WoW-style goal). For now every path is a single "kill" goal:
// the committed hero must land `count` killing blows (any monster when
// `monsterId` is unset). Progress is derived from the hero's *lifetime* kill
// tally (`unitStats[hero].monstersDefeated`) snapshotted at commit time, so it
// needs no new combat plumbing — see classQuestProgress. Other objective kinds
// (collect a dropped quest item, cull N of a type, hand in / craft reagents) are
// designed to slot in here later.
export interface ClassQuestObjective {
  kind: 'kill'
  count: number          // killing blows required
  monsterId?: string     // restrict to a monster id; unset = any monster
  label: string          // human copy, e.g. "Defeat any monster"
}
export interface ClassChangeQuestDef {
  id: string
  locationId: string   // the city this path is offered in
  targetClass: string  // class the Novice becomes on completion
  title: string        // e.g. "Path of the Fighter"
  story: string        // narrative blurb (shown when expanded)
  objective: ClassQuestObjective
}
// Every path shares the same starter goal for now: the committed hero lands one
// killing blow on any monster, anywhere.
const FIRST_BLOOD: ClassQuestObjective = { kind: 'kill', count: 1, label: 'Defeat any monster' }
export const CLASS_CHANGE_QUESTS: ClassChangeQuestDef[] = [
  { id: 'path-fighter', locationId: 'prontera-city', targetClass: 'Fighter', title: 'Path of the Fighter', story: 'The Prontera guard drills recruits in sword and shield. Prove your mettle and take up the blade as a Fighter.', objective: FIRST_BLOOD },
  { id: 'path-cleric',  locationId: 'prontera-city', targetClass: 'Cleric',  title: 'Path of the Cleric',  story: 'The cathedral of Prontera seeks the devout. Take your vows and walk the divine path as a Cleric.', objective: FIRST_BLOOD },
  { id: 'path-ranger',  locationId: 'payon-city',    targetClass: 'Ranger',  title: 'Path of the Ranger',  story: 'The hunters of Payon test every comer at the range. String a bow and master the hunt as a Ranger.', objective: FIRST_BLOOD },
  { id: 'path-rogue',   locationId: 'payon-city',    targetClass: 'Rogue',   title: 'Path of the Rogue',   story: "Payon's shadow guild watches from the rafters. Slip past their wards and earn your daggers as a Rogue.", objective: FIRST_BLOOD },
  { id: 'path-mage',    locationId: 'geffen-city',   targetClass: 'Mage',    title: 'Path of the Mage',    story: 'The arcane college of Geffen admits only the gifted. Study the weave and claim your robes as a Mage.', objective: FIRST_BLOOD },
]

// A live commitment: which hero is on the path + the kill tally they had when
// they began (the baseline we diff against to measure progress).
export interface ClassQuestCommit { heroId: string; killBaseline: number }

// A Novice is a hero with no specialized class yet (`class: null`, rendered as
// "Novice"). Pre-classed heroes can't take a class-change path.
export const MIN_CLASS_CHANGE_LEVEL = 2

// Progress toward a kill objective: lifetime kills earned since the baseline,
// clamped to the target. (Lifetime kills come from the committed hero's
// `unitStats[hero].monstersDefeated`, credited to the killing-blow unit.)
export function classQuestProgress(commit: ClassQuestCommit | null, currentKills: number, target: number): number {
  if (!commit) return 0
  return Math.min(target, Math.max(0, currentKills - commit.killBaseline))
}

export type ClassQuestStatus =
  | 'select-novice'  // gray (…) — no eligible Novice in the current selection
  | 'underleveled'   // gray (!) — a Novice is selected but below the level gate
  | 'eligible'       // yellow (!) — a level-gate Novice is selected; can begin
  | 'in-progress'    // gray (?) — a hero has begun but the objective isn't met yet
  | 'ready'          // yellow (?) — objective met; ready to change class

export function classQuestStatus(o: {
  committedHeroId: string | null
  selectedNovice: { level: number } | null
  progress: number
  target: number
}): ClassQuestStatus {
  if (o.committedHeroId) return o.progress >= o.target ? 'ready' : 'in-progress'
  if (!o.selectedNovice) return 'select-novice'
  if (o.selectedNovice.level < MIN_CLASS_CHANGE_LEVEL) return 'underleveled'
  return 'eligible'
}

interface ProtoState {
  zoomLevel: ZoomLevel
  // A cross-component request for the stage to fly to a zoom stop (ProtoApp /
  // roster → stage). nonce so the same level re-fires.
  zoomRequest: { level: ZoomLevel; nonce: number } | null
  // Bumped when the lens should drill into the Hero tab (double-tap a roster
  // hero / initial focus). A plain single-tap selects without bumping this.
  heroTabRequest: number
  // A request to open a combatant's battlefield detail card (Hero lens →
  // battlefield). Nonce so the same unit re-fires.
  battleInspectRequest: { unitId: string; nonce: number } | null
  // Bumped to dismiss an open battlefield detail card (e.g. a roster tap, which
  // also selects the hero) — the card isn't a modal that traps the roster.
  battleCardDismiss: number
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
  // Class-change quests: which hero (if any) has committed to each path, plus
  // the kill baseline we measure objective progress against.
  classQuestCommit: Record<string, ClassQuestCommit>  // questId → commitment

  setZoomLevel: (z: ZoomLevel) => void
  requestZoom: (level: ZoomLevel) => void
  requestHeroTab: () => void
  requestBattleInspect: (unitId: string) => void
  dismissBattleCard: () => void
  openStageOverlay: (o: StageOverlay) => void
  closeStageOverlay: () => void
  buyUpgrade: (locId: string, upId: string, cost: number, max: number) => void
  chooseStory: (locId: string, pathId: string) => void
  toggleLock: (heroId: string) => void
  acceptQuest: (locId: string, questId: string) => void
  advanceQuest: (locId: string, questId: string, by: number) => void  // mock progress
  turnInQuest: (locId: string, questId: string) => void
  // Class-change quests (hero-relative).
  beginClassQuest: (questId: string, heroId: string) => void
  completeClassQuest: (questId: string) => void   // applies the class change to the real unit
  cancelClassQuest: (questId: string) => void     // discards the commitment, no change
}

export const useProtoStore = create<ProtoState>((set) => ({
  zoomLevel: 0,
  zoomRequest: null,
  heroTabRequest: 0,
  battleInspectRequest: null,
  battleCardDismiss: 0,
  stageOverlay: null,
  attunementSpent: 0,
  upgrades: {},
  storyChoice: {},
  heroLocks: [],
  activeQuest: {},
  questProgress: {},
  completedQuests: {},
  classQuestCommit: {},

  setZoomLevel: (z) => set((s) => (s.zoomLevel === z ? s : { zoomLevel: z })),
  requestZoom: (level) => set((s) => ({ zoomRequest: { level, nonce: (s.zoomRequest?.nonce ?? 0) + 1 } })),
  requestHeroTab: () => set((s) => ({ heroTabRequest: s.heroTabRequest + 1 })),
  requestBattleInspect: (unitId) => set((s) => ({ battleInspectRequest: { unitId, nonce: (s.battleInspectRequest?.nonce ?? 0) + 1 } })),
  dismissBattleCard: () => set((s) => ({ battleCardDismiss: s.battleCardDismiss + 1 })),
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

  beginClassQuest: (questId, heroId) => set((s) => {
    if (s.classQuestCommit[questId]) return s   // someone's already on this path
    // Snapshot the hero's lifetime kills now — progress is measured against this.
    const killBaseline = useGameStore.getState().unitStats[heroId]?.monstersDefeated ?? 0
    return { classQuestCommit: { ...s.classQuestCommit, [questId]: { heroId, killBaseline } } }
  }),
  completeClassQuest: (questId) => set((s) => {
    const commit = s.classQuestCommit[questId]
    const def = CLASS_CHANGE_QUESTS.find((q) => q.id === questId)
    if (!commit || !def) return s
    // Gate on the objective: the committed hero must have met the kill goal.
    const kills = useGameStore.getState().unitStats[commit.heroId]?.monstersDefeated ?? 0
    if (classQuestProgress(commit, kills, def.objective.count) < def.objective.count) return s
    // Write the class change to the real game unit (persists via the units codec).
    useGameStore.setState((g) => ({
      units: g.units.map((u) => (u.id === commit.heroId ? { ...u, class: def.targetClass } : u)),
    }))
    const next = { ...s.classQuestCommit }; delete next[questId]
    return { classQuestCommit: next }
  }),
  cancelClassQuest: (questId) => set((s) => {
    if (!s.classQuestCommit[questId]) return s
    const next = { ...s.classQuestCommit }; delete next[questId]
    return { classQuestCommit: next }
  }),
}))

// A small starting pool so the upgrade economy is playable immediately in the
// mock (a real save would start at 0 and earn it all from play time).
export const ATTUNE_STARTING = 8

// Attunement available right now, given the game clock and what's been spent.
export function attunementAvailable(ticks: number, spent: number): number {
  return Math.max(0, ATTUNE_STARTING + Math.floor(ticks / ATTUNE_TICKS) - spent)
}
