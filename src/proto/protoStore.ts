import { create } from 'zustand'
import { useGameStore } from '@/stores/useGameStore'
import type { UnitCombatStats, QuestDropRule } from '@/types'

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
//
// Objective (the WoW-style goal). Two kinds so far, both `scope`d `'hero'` (only
// the committed hero) or `'global'` (any hero):
//   • kill    — land `count` killing blows on `monsterId` (any monster when
//     unset). Hero+type rides the per-hero `unitStats[hero].killsByMonster` map;
//     global+type rides the store-wide `monsterDefeated` map; "any monster" uses
//     the flat lifetime kill count — see classQuestKillCount.
//   • collect — kills of `monsterId` roll a temporary quest item (`dropRate`);
//     each drop increments the store's `questItems[itemId]` ledger. The item is
//     tracked here only and never enters the Inventory.
//   • handin  — turn in items you already hold; completion CONSUMES them. The
//     source is `'inventory'` (a real `miscItems` material, e.g. a Boar Hide) or
//     `'quest'` (an ephemeral quest item in `questItems`). Hero scope only drops
//     (collect) while the committed hero is deployed where the monster dies.
// Both collect and hand-in consume their items at completion, behind a confirm.
// Other kinds (craft reagents, reach a location) slot in here later — see
// BACKLOG "Quest system".
export interface KillObjective {
  kind: 'kill'
  count: number             // killing blows required
  monsterId?: string        // restrict to a monster id; unset = any monster
  scope?: 'hero' | 'global' // whose kills count; default 'hero'
  label: string             // human copy, e.g. "Defeat 3 Tough Slimes"
}
export interface CollectObjective {
  kind: 'collect'
  count: number             // quest items to collect
  monsterId: string         // monster whose death can drop the item
  itemId: string            // quest-item id (tracking/display only — never in Inventory)
  itemName: string          // display name, e.g. "Bone Splinter"
  scope?: 'hero' | 'global' // whose kills can drop it; default 'hero'
  dropRate?: number         // chance per matching kill; default 0.5
  label: string             // human copy, e.g. "Collect 3 Bone Splinters"
}
export interface HandInObjective {
  kind: 'handin'
  count: number                     // items to turn in (consumed on completion)
  itemId: string                    // miscItem id (inventory) or quest-item id (quest)
  itemName: string                  // display name, e.g. "Boar Hide"
  source: 'inventory' | 'quest'     // where the items are held / consumed from
  label: string                     // human copy, e.g. "Hand in 3 Boar Hides"
}
export type ClassQuestObjective = KillObjective | CollectObjective | HandInObjective
// Objectives that consume items at completion (gated behind a confirm).
export function objectiveConsumes(o: ClassQuestObjective): boolean {
  return o.kind === 'collect' || o.kind === 'handin'
}
export interface ClassChangeQuestDef {
  id: string
  locationId: string   // the city this path is offered in
  targetClass: string  // class the Novice becomes on completion
  title: string        // e.g. "Path of the Fighter"
  story: string        // narrative blurb (shown when expanded)
  objective: ClassQuestObjective
}
// Class-change trials (hero-scoped). CULL = personally defeat a handful of a
// nearby creature; COLLECT = gather quest items that drop from one then hand
// them in; HANDIN = turn in materials from the guild stash. Labels name the foe
// or item so the player knows what to do.
const CULL = (monsterId: string, count: number, label: string): KillObjective =>
  ({ kind: 'kill', monsterId, count, scope: 'hero', label })
const COLLECT = (monsterId: string, itemId: string, itemName: string, count: number, label: string, dropRate = 0.5): CollectObjective =>
  ({ kind: 'collect', monsterId, itemId, itemName, count, scope: 'hero', dropRate, label })
const HANDIN = (itemId: string, itemName: string, count: number, label: string, source: 'inventory' | 'quest' = 'inventory'): HandInObjective =>
  ({ kind: 'handin', itemId, itemName, count, source, label })
export const CLASS_CHANGE_QUESTS: ClassChangeQuestDef[] = [
  { id: 'path-fighter', locationId: 'prontera-city', targetClass: 'Fighter', title: 'Path of the Fighter', story: 'The Prontera guard drills recruits in sword and shield. Cull the slimes on the Western Approach to prove your mettle.', objective: CULL('tough-slime', 3, 'Defeat 3 Tough Slimes') },
  { id: 'path-cleric',  locationId: 'prontera-city', targetClass: 'Cleric',  title: 'Path of the Cleric',  story: 'The cathedral asks its postulants to cleanse the unnatural growth east of the city before taking their vows.', objective: CULL('living-nightshade', 3, 'Purge 3 Living Nightshades') },
  { id: 'path-ranger',  locationId: 'payon-city',    targetClass: 'Ranger',  title: 'Path of the Ranger',  story: 'The hunters of Payon judge an applicant by their trophies. Bring boar hides from the meadow to earn your bow.', objective: HANDIN('drop-boar-hide', 'Boar Hide', 3, 'Hand in 3 Boar Hides') },
  { id: 'path-rogue',   locationId: 'payon-city',    targetClass: 'Rogue',   title: 'Path of the Rogue',   story: "Payon's shadow guild sets a thief's test: shadow the skeleton archers on the Southern Road and lift the bone splinters they carry, then hand them over.", objective: COLLECT('skeleton-archer', 'qi-bone-splinter', 'Bone Splinter', 3, 'Collect & hand in 3 Bone Splinters') },
  { id: 'path-mage',    locationId: 'geffen-city',   targetClass: 'Mage',    title: 'Path of the Mage',    story: 'The arcane college admits only those who act. Destroy the egg sacs festering on the Geffen Outskirts.', objective: CULL('egg-sac', 3, 'Destroy 3 Egg Sacs') },
]

// A live commitment: which hero is on the path + the kill tally they had when
// they began (the baseline a kill objective's current count is diffed against;
// 0/unused for collect & hand-in, which read live ledgers/inventory).
export interface ClassQuestCommit { heroId: string; killBaseline: number }

// A Novice is a hero with no specialized class yet (`class: null`, rendered as
// "Novice"). Pre-classed heroes can't take a class-change path.
export const MIN_CLASS_CHANGE_LEVEL = 2

// The kill count a kill objective measures *right now*, given the game's stat
// maps. hero-scope reads the committed hero's tally (per-type or flat);
// global-scope reads the store-wide per-monster defeat totals (per-type/summed).
export function classQuestKillCount(
  o: KillObjective,
  heroId: string,
  unitStats: Record<string, UnitCombatStats>,
  monsterDefeated: Record<string, number>,
): number {
  if (o.scope === 'global') {
    if (o.monsterId) return monsterDefeated[o.monsterId] ?? 0
    return Object.values(monsterDefeated).reduce((a, b) => a + b, 0)
  }
  const st = unitStats[heroId]
  if (!st) return 0
  if (o.monsterId) return st.killsByMonster?.[o.monsterId] ?? 0
  return st.monstersDefeated
}

// Progress toward a kill objective: kills earned since the baseline, clamped.
export function classQuestProgress(commit: ClassQuestCommit | null, currentKills: number, target: number): number {
  if (!commit) return 0
  return Math.min(target, Math.max(0, currentKills - commit.killBaseline))
}

// Snapshot of the game stats objective progress reads from.
export interface QuestStatView {
  unitStats: Record<string, UnitCombatStats>
  monsterDefeated: Record<string, number>
  questItems: Record<string, number>           // ephemeral quest-item ledger (by itemId)
  miscItems: { id: string; quantity: number }[] // the guild inventory
}

const miscQty = (miscItems: { id: string; quantity: number }[], id: string) =>
  miscItems.find((m) => m.id === id)?.quantity ?? 0

// Unified live progress for any objective kind. kill → kills since baseline;
// collect → the quest item ledger; hand-in → how many you currently hold.
export function objectiveProgress(q: ClassChangeQuestDef, commit: ClassQuestCommit | null, g: QuestStatView): number {
  const o = q.objective
  if (o.kind === 'collect') return Math.min(o.count, g.questItems[o.itemId] ?? 0)
  if (o.kind === 'handin') {
    const held = o.source === 'quest' ? (g.questItems[o.itemId] ?? 0) : miscQty(g.miscItems, o.itemId)
    return Math.min(o.count, held)
  }
  if (!commit) return 0
  return classQuestProgress(commit, classQuestKillCount(o, commit.heroId, g.unitStats, g.monsterDefeated), o.count)
}

// Build the store drop-rule a collect objective installs while it's committed.
function dropRuleFor(q: ClassChangeQuestDef, heroId: string): QuestDropRule | null {
  const o = q.objective
  if (o.kind !== 'collect') return null
  return { id: q.id, itemId: o.itemId, monsterId: o.monsterId, scope: o.scope ?? 'hero', heroId, dropRate: o.dropRate ?? 0.5, target: o.count }
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
    const def = CLASS_CHANGE_QUESTS.find((q) => q.id === questId)
    if (!def) return s
    const g = useGameStore.getState()
    let killBaseline = 0
    if (def.objective.kind === 'kill') {
      // Snapshot the objective's kill count now — progress is measured against it.
      killBaseline = classQuestKillCount(def.objective, heroId, g.unitStats, g.monsterDefeated)
    } else if (def.objective.kind === 'collect') {
      // Start a fresh drop ledger and arm the store drop rule.
      const rule = dropRuleFor(def, heroId)
      if (rule) g.armQuestDrop(rule)
    }
    // hand-in: nothing to arm — progress reads live inventory / quest items.
    return { classQuestCommit: { ...s.classQuestCommit, [questId]: { heroId, killBaseline } } }
  }),
  completeClassQuest: (questId) => set((s) => {
    const commit = s.classQuestCommit[questId]
    const def = CLASS_CHANGE_QUESTS.find((q) => q.id === questId)
    if (!commit || !def) return s
    // Gate on the objective: progress must have reached the goal.
    const g = useGameStore.getState()
    const o = def.objective
    const progress = objectiveProgress(def, commit, { unitStats: g.unitStats, monsterDefeated: g.monsterDefeated, questItems: g.questItems, miscItems: g.miscItems })
    if (progress < o.count) return s
    // Consume the handed-in items (collect & hand-in), then change class.
    if (o.kind === 'collect') { g.consumeQuestItem(o.itemId, o.count); g.disarmQuestDrop(questId) }
    else if (o.kind === 'handin') {
      if (o.source === 'quest') g.consumeQuestItem(o.itemId, o.count)
      else g.consumeMiscItem(o.itemId, o.count)
    }
    useGameStore.setState((gs) => ({
      units: gs.units.map((u) => (u.id === commit.heroId ? { ...u, class: def.targetClass } : u)),
    }))
    const next = { ...s.classQuestCommit }; delete next[questId]
    return { classQuestCommit: next }
  }),
  cancelClassQuest: (questId) => set((s) => {
    if (!s.classQuestCommit[questId]) return s
    const def = CLASS_CHANGE_QUESTS.find((q) => q.id === questId)
    if (def?.objective.kind === 'collect') useGameStore.getState().disarmQuestDrop(questId)  // drop the rule + any collected items
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
