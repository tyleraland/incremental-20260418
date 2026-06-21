import { create } from 'zustand'
import { useGameStore } from '@/stores/useGameStore'
import type { UnitCombatStats, QuestDropRule, Unit } from '@/types'
import { type Pack, packRoom } from './economy'

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
  rewards?: QuestReward[]  // granted on completion (the class change is the headline)
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
  { id: 'path-fighter', locationId: 'prontera-city', targetClass: 'Fighter', title: 'Path of the Fighter', story: 'The Prontera guard drills recruits in sword and shield. Cull the slimes on the Western Approach to prove your mettle.', objective: CULL('tough-slime', 3, 'Defeat 3 Tough Slimes'), rewards: [{ kind: 'item', itemId: 'eq-sword' }] },
  { id: 'path-cleric',  locationId: 'prontera-city', targetClass: 'Cleric',  title: 'Path of the Cleric',  story: 'The cathedral asks its postulants to cleanse the unnatural growth east of the city before taking their vows.', objective: CULL('living-nightshade', 3, 'Purge 3 Living Nightshades'), rewards: [{ kind: 'item', itemId: 'eq-rod' }] },
  { id: 'path-ranger',  locationId: 'payon-city',    targetClass: 'Ranger',  title: 'Path of the Ranger',  story: 'The hunters of Payon judge an applicant by their trophies. Bring boar hides from the meadow to earn your bow.', objective: HANDIN('drop-boar-hide', 'Boar Hide', 3, 'Hand in 3 Boar Hides'), rewards: [{ kind: 'item', itemId: 'eq-bow' }] },
  { id: 'path-rogue',   locationId: 'payon-city',    targetClass: 'Rogue',   title: 'Path of the Rogue',   story: "Payon's shadow guild sets a thief's test: shadow the skeleton archers on the Southern Road and lift the bone splinters they carry, then hand them over.", objective: COLLECT('skeleton-archer', 'qi-bone-splinter', 'Bone Splinter', 3, 'Collect & hand in 3 Bone Splinters'), rewards: [{ kind: 'item', itemId: 'eq-knife' }] },
  { id: 'path-mage',    locationId: 'geffen-city',   targetClass: 'Mage',    title: 'Path of the Mage',    story: 'The arcane college admits only those who act. Destroy the egg sacs festering on the Geffen Outskirts.', objective: CULL('egg-sac', 3, 'Destroy 3 Egg Sacs'), rewards: [{ kind: 'item', itemId: 'eq-staff' }] },
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
// (Hero-less quests — bounties — pass commit = null; only kill objectives use it.)
export function objectiveProgress(o: ClassQuestObjective, commit: ClassQuestCommit | null, g: QuestStatView): number {
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

// ── Location bounties (hero-less location quests) ─────────────────────────────--
//
// Unlike the class-change paths these aren't bound to a hero — they're a
// location's board of objectives the whole guild works toward (progress reads
// global inventory/kills). They can chain: a bounty with `requires` stays HIDDEN
// until its prerequisites are completed, so finishing one reveals the next. A
// `repeatable` bounty never archives — kill bounties advance a per-cycle baseline
// (`bountyClaimed`) and pay out again every `count`. Reward is gold for now.
export interface BountyDef {
  id: string
  locationId: string
  title: string
  story: string
  objective: ClassQuestObjective   // hand-in (consumes from the stash) or kill (global, cyclic)
  rewards: QuestReward[]           // gold + inspectable item rewards, granted on completion
  requires?: string[]              // bounty ids that must be done first; hidden until then
  repeatable?: boolean             // never archives; can be claimed again and again
}
export const LOCATION_BOUNTIES: BountyDef[] = [
  {
    id: 'boar-hides-20', locationId: 'boar-meadow', title: 'Trapper\'s Order',
    story: 'The Boar Meadow trapper pays well for fresh hides. Bring him twenty to open an account.',
    objective: HANDIN('drop-boar-hide', 'Boar Hide', 20, 'Collect 20 Boar Hides'),
    rewards: [{ kind: 'gold', amount: 200 }, { kind: 'item', itemId: 'eq-leather' }], requires: [],
  },
  {
    id: 'boar-hides-100', locationId: 'boar-meadow', title: 'The Tannery\'s Bulk Order',
    story: 'Word of your haul reached the Prontera tannery — now they want a hundred more. Collect even more hides.',
    objective: HANDIN('drop-boar-hide', 'Boar Hide', 100, 'Collect 100 Boar Hides'),
    rewards: [{ kind: 'gold', amount: 1500 }, { kind: 'item', itemId: 'eq-chainmail' }], requires: ['boar-hides-20'],
  },
  {
    id: 'boar-cull-repeat', locationId: 'boar-meadow', title: 'Boar Culling Contract',
    story: 'The meadow warden keeps a standing contract: every hundred boars culled earns a token bounty. Renewed endlessly.',
    objective: { kind: 'kill', monsterId: 'wild-boar', count: 100, scope: 'global', label: 'Defeat 100 Wild Boars' },
    rewards: [{ kind: 'gold', amount: 1 }], requires: [], repeatable: true,
  },
]
// Total gold across a reward list (for the kill-bounty "Claim N gold" button etc.).
export function rewardGoldTotal(rewards: QuestReward[]): number {
  return rewards.reduce((n, r) => n + (r.kind === 'gold' ? r.amount : 0), 0)
}
// A short reward summary for list rows ("200 gold · +1 item").
export function rewardSummary(rewards: QuestReward[]): string {
  const gold = rewardGoldTotal(rewards)
  const items = rewards.filter((r) => r.kind === 'item').length
  return [gold ? `${gold} gold` : '', items ? `+${items} item${items > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')
}
// Pay out a quest's rewards into the real game state: gold to the stash, items as
// owned equipment instances.
function grantRewards(rewards: QuestReward[] | undefined): void {
  if (!rewards) return
  const g = useGameStore.getState()
  for (const r of rewards) {
    if (r.kind === 'gold') g.grantMiscItem('m-gold', r.amount)
    else g.grantEquipment(r.itemId)
  }
}
// A bounty is only on the board once every prerequisite is done.
export function bountyVisible(def: BountyDef, done: string[]): boolean {
  return (def.requires ?? []).every((r) => done.includes(r))
}

// Live progress for a bounty. Kill bounties are global + cyclic: progress = boars
// felled since the last claim (`claimed`), clamped. Collect/hand-in read live
// ledgers/inventory (no baseline).
export function bountyProgress(def: BountyDef, g: QuestStatView, claimed: number): number {
  const o = def.objective
  if (o.kind === 'kill') {
    const total = o.monsterId ? (g.monsterDefeated[o.monsterId] ?? 0) : Object.values(g.monsterDefeated).reduce((a, b) => a + b, 0)
    return Math.min(o.count, Math.max(0, total - claimed))
  }
  return objectiveProgress(o, null, g)
}

// ── Unified quest board (the journal) ────────────────────────────────────────--
//
// One flattened view of every quest (class-change paths + location bounties) for
// the top-bar Quest Journal: a board status for filtering, who it belongs to
// (hero-specific vs the whole guild), where it lives, and live progress. Pure so
// it's testable; the journal + the nav-button badge both build from it.
export type BoardStatus =
  | 'not-yet'      // visible but its prerequisites aren't met yet (upcoming)
  | 'available'    // ready to take on / no progress yet
  | 'in-progress'  // underway, objective not met
  | 'ready'        // objective met — go collect / complete
  | 'completed'    // terminal (a non-repeatable bounty that's been turned in)

export interface QuestBoardEntry {
  id: string
  kind: 'class' | 'bounty'
  title: string
  locationId: string
  locationName: string
  scope: 'hero' | 'global'   // hero-specific (a class path) vs guild-wide (a bounty)
  heroId?: string            // the committed hero, if any → hero chip
  heroName?: string
  status: BoardStatus
  progress: number
  target: number
  objectiveLabel: string
  rewardText?: string
  repeatable?: boolean
  completions: number        // times completed (lifetime) — repeatable history
}

export interface QuestBoardArgs {
  classCommit: Record<string, ClassQuestCommit>
  bountyDone: string[]
  bountyClaimed: Record<string, number>
  completions: Record<string, number>
  units: Pick<Unit, 'id' | 'name'>[]
  view: QuestStatView
  locationName: (id: string) => string
}

export function buildQuestBoard(a: QuestBoardArgs): QuestBoardEntry[] {
  const out: QuestBoardEntry[] = []
  // Class-change paths (hero-specific). Never terminally "completed" (a new
  // Novice can always walk the path); committed → in-progress / ready.
  for (const q of CLASS_CHANGE_QUESTS) {
    const commit = a.classCommit[q.id] ?? null
    const target = q.objective.count
    const progress = commit ? objectiveProgress(q.objective, commit, a.view) : 0
    const status: BoardStatus = commit ? (progress >= target ? 'ready' : 'in-progress') : 'available'
    const hero = commit ? a.units.find((u) => u.id === commit.heroId) : undefined
    out.push({
      id: q.id, kind: 'class', title: q.title, locationId: q.locationId, locationName: a.locationName(q.locationId),
      scope: 'hero', heroId: hero?.id, heroName: hero?.name,
      status, progress, target, objectiveLabel: q.objective.label,
      rewardText: [`become a ${q.targetClass}`, q.rewards ? rewardSummary(q.rewards) : ''].filter(Boolean).join(' · '),
      completions: a.completions[q.id] ?? 0,
    })
  }
  // Location bounties (guild-wide). Hidden-at-location prereqs surface here as
  // 'not-yet'; non-repeatable + done → 'completed'.
  for (const b of LOCATION_BOUNTIES) {
    const visible = bountyVisible(b, a.bountyDone)
    const done = !b.repeatable && a.bountyDone.includes(b.id)
    const target = b.objective.count
    const progress = done ? target : bountyProgress(b, a.view, a.bountyClaimed[b.id] ?? 0)
    const status: BoardStatus = !visible ? 'not-yet'
      : done ? 'completed'
      : progress >= target ? 'ready'
      : progress > 0 ? 'in-progress'
      : 'available'
    out.push({
      id: b.id, kind: 'bounty', title: b.title, locationId: b.locationId, locationName: a.locationName(b.locationId),
      scope: 'global', status, progress, target, objectiveLabel: b.objective.label,
      rewardText: rewardSummary(b.rewards) || undefined, repeatable: b.repeatable,
      completions: a.completions[b.id] ?? 0,
    })
  }
  return out
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
  // Bumped to drill the lens into the Hero tab's Battle sub-tab (a battlefield
  // chip tap routes here — the unified hero/battle card).
  heroBattleRequest: number
  // Bumped to drill the lens into the Location tab (Quest Journal "go to location").
  locationTabRequest: number
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
  requestHeroBattle: () => void
  // A monster combatant inspected on the battlefield → shown in the Unit tab.
  // Cleared whenever a hero is selected.
  selectedFoe: { locId: string; combatantId: string } | null
  inspectFoe: (locId: string, combatantId: string) => void
  clearFoe: () => void
  // The roomy Hero Detail overlay (stats/abilities) — opened from the Unit tab
  // or the Guild. Null = closed.
  heroDetailId: string | null
  openHeroDetail: (unitId: string) => void
  closeHeroDetail: () => void
  requestLocationTab: () => void
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
  // Location bounties (hero-less, chained). Completing one consumes its items,
  // grants the reward, and may reveal a dependent bounty. Repeatable kill bounties
  // advance a per-bounty claim baseline instead of archiving.
  bountyDone: string[]
  bountyClaimed: Record<string, number>   // bountyId → kills already rewarded (cyclic bounties)
  completeBounty: (bountyId: string) => void
  // Lifetime quest/bounty completion tally (questId → times completed), for a
  // future "quests completed" report. Repeatable bounty claims increment too.
  questCompletions: Record<string, number>

  // ── Per-hero carry (mock) ────────────────────────────────────────────────────
  // The "every hero carries their own loot until they reach town" exploration.
  // packs[unitId] is what that hero is carrying; capacity-gated (economy.ts).
  // Unpersisted + not wired into the combat loop — `simulateHunt` fakes drops so
  // we can feel packs fill, deposit emptying them into shared storage (miscItems).
  packs: Record<string, Pack>
  packsSeeded: boolean
  seedPacks: (seed: Record<string, Pack>) => void          // one-time mock fill
  addToPack: (unitId: string, itemId: string, qty: number) => void // capacity-gated
  simulateHunt: (unitId: string, drops: { itemId: string; qty: number }[]) => void
  clearPack: (unitId: string) => void
  depositPack: (unitId: string) => void                    // pack → shared storage
  depositAllPacks: () => void

  // ── Cards & sockets (mock, display-only) ──────────────────────────────────────
  // ownedCards: how many of each card the guild holds. sockets: per equipment
  // INSTANCE, a fixed-length slot array (cardId | null). Socketing moves a card
  // from the owned pool into a slot; removing returns it. Display-only for now —
  // getDerivedStats doesn't read these yet (the real itemSockets slice will host
  // them when the math is wired).
  ownedCards: Record<string, number>
  sockets: Record<string, (string | null)[]>
  cardsSeeded: boolean
  seedCards: (owned: Record<string, number>, sockets: Record<string, (string | null)[]>) => void
  insertCard: (instanceId: string, slotIdx: number, cardId: string, slotCount: number) => void
  removeCard: (instanceId: string, slotIdx: number) => void
}

export const useProtoStore = create<ProtoState>((set) => ({
  zoomLevel: 0,
  zoomRequest: null,
  heroTabRequest: 0,
  heroBattleRequest: 0,
  locationTabRequest: 0,
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
  bountyDone: [],
  bountyClaimed: {},
  questCompletions: {},
  packs: {},
  packsSeeded: false,
  ownedCards: {},
  sockets: {},
  cardsSeeded: false,

  setZoomLevel: (z) => set((s) => (s.zoomLevel === z ? s : { zoomLevel: z })),
  requestZoom: (level) => set((s) => ({ zoomRequest: { level, nonce: (s.zoomRequest?.nonce ?? 0) + 1 } })),
  requestHeroTab: () => set((s) => ({ heroTabRequest: s.heroTabRequest + 1 })),
  requestHeroBattle: () => set((s) => ({ heroBattleRequest: s.heroBattleRequest + 1 })),
  selectedFoe: null,
  inspectFoe: (locId, combatantId) => set((s) => ({ selectedFoe: { locId, combatantId }, heroBattleRequest: s.heroBattleRequest + 1 })),
  clearFoe: () => set((s) => (s.selectedFoe ? { selectedFoe: null } : s)),
  heroDetailId: null,
  openHeroDetail: (unitId) => set({ heroDetailId: unitId }),
  closeHeroDetail: () => set({ heroDetailId: null }),
  requestLocationTab: () => set((s) => ({ locationTabRequest: s.locationTabRequest + 1 })),
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
    const progress = objectiveProgress(o, commit, { unitStats: g.unitStats, monsterDefeated: g.monsterDefeated, questItems: g.questItems, miscItems: g.miscItems })
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
    grantRewards(def.rewards)
    const next = { ...s.classQuestCommit }; delete next[questId]
    return { classQuestCommit: next, questCompletions: { ...s.questCompletions, [questId]: (s.questCompletions[questId] ?? 0) + 1 } }
  }),
  cancelClassQuest: (questId) => set((s) => {
    if (!s.classQuestCommit[questId]) return s
    const def = CLASS_CHANGE_QUESTS.find((q) => q.id === questId)
    if (def?.objective.kind === 'collect') useGameStore.getState().disarmQuestDrop(questId)  // drop the rule + any collected items
    const next = { ...s.classQuestCommit }; delete next[questId]
    return { classQuestCommit: next }
  }),
  completeBounty: (bountyId) => set((s) => {
    const def = LOCATION_BOUNTIES.find((b) => b.id === bountyId)
    if (!def || !bountyVisible(def, s.bountyDone)) return s
    if (!def.repeatable && s.bountyDone.includes(bountyId)) return s
    const g = useGameStore.getState()
    const o = def.objective
    const claimed = s.bountyClaimed[bountyId] ?? 0
    const progress = bountyProgress(def, { unitStats: g.unitStats, monsterDefeated: g.monsterDefeated, questItems: g.questItems, miscItems: g.miscItems }, claimed)
    if (progress < o.count) return s
    // Consume the handed-in items (kill bounties consume nothing), then pay out.
    if (o.kind === 'handin') { if (o.source === 'quest') g.consumeQuestItem(o.itemId, o.count); else g.consumeMiscItem(o.itemId, o.count) }
    else if (o.kind === 'collect') g.consumeQuestItem(o.itemId, o.count)
    grantRewards(def.rewards)
    const completions = { ...s.questCompletions, [bountyId]: (s.questCompletions[bountyId] ?? 0) + 1 }
    // Kill bounties advance the claim baseline to the CURRENT total — overflow past
    // 100 doesn't bank, so a backlog only ever yields one claim and you must re-up.
    if (o.kind === 'kill') {
      const total = o.monsterId ? (g.monsterDefeated[o.monsterId] ?? 0) : Object.values(g.monsterDefeated).reduce((a, b) => a + b, 0)
      return { bountyClaimed: { ...s.bountyClaimed, [bountyId]: total }, questCompletions: completions }
    }
    if (def.repeatable) return { questCompletions: completions }
    return { bountyDone: [...s.bountyDone, bountyId], questCompletions: completions }
  }),

  seedPacks: (seed) => set((s) => (s.packsSeeded ? s : { packs: seed, packsSeeded: true })),
  // Add to a hero's pack, but never past capacity — excess is "left on the
  // ground" (the carry-full mechanic). Drops are added in id order, oldest-room
  // first, so a full pack silently refuses extras.
  addToPack: (unitId, itemId, qty) => set((s) => {
    const pack = s.packs[unitId] ?? {}
    const add = Math.min(qty, packRoom(pack))
    if (add <= 0) return s
    return { packs: { ...s.packs, [unitId]: { ...pack, [itemId]: (pack[itemId] ?? 0) + add } } }
  }),
  simulateHunt: (unitId, drops) => set((s) => {
    const pack = { ...(s.packs[unitId] ?? {}) }
    let room = packRoom(pack)
    for (const d of drops) {
      if (room <= 0) break
      const add = Math.min(d.qty, room)
      pack[d.itemId] = (pack[d.itemId] ?? 0) + add
      room -= add
    }
    return { packs: { ...s.packs, [unitId]: pack } }
  }),
  clearPack: (unitId) => set((s) => {
    if (!s.packs[unitId]) return s
    const next = { ...s.packs }; delete next[unitId]
    return { packs: next }
  }),
  depositPack: (unitId) => set((s) => {
    const pack = s.packs[unitId]
    if (!pack) return s
    const g = useGameStore.getState()
    for (const [id, qty] of Object.entries(pack)) if (qty > 0) g.grantMiscItem(id, qty)
    const next = { ...s.packs }; delete next[unitId]
    return { packs: next }
  }),
  depositAllPacks: () => set((s) => {
    const g = useGameStore.getState()
    for (const pack of Object.values(s.packs))
      for (const [id, qty] of Object.entries(pack)) if (qty > 0) g.grantMiscItem(id, qty)
    return { packs: {} }
  }),

  seedCards: (owned, sockets) => set((s) => (s.cardsSeeded ? s : { ownedCards: owned, sockets, cardsSeeded: true })),
  insertCard: (instanceId, slotIdx, cardId, slotCount) => set((s) => {
    if ((s.ownedCards[cardId] ?? 0) <= 0) return s
    const arr = (s.sockets[instanceId] ?? Array<string | null>(slotCount).fill(null)).slice()
    if (slotIdx < 0 || slotIdx >= arr.length) return s
    const owned = { ...s.ownedCards }
    const prev = arr[slotIdx]
    if (prev) owned[prev] = (owned[prev] ?? 0) + 1            // swap: return the old card
    owned[cardId] = (owned[cardId] ?? 0) - 1
    if (owned[cardId] <= 0) delete owned[cardId]
    arr[slotIdx] = cardId
    return { ownedCards: owned, sockets: { ...s.sockets, [instanceId]: arr } }
  }),
  removeCard: (instanceId, slotIdx) => set((s) => {
    const arr = s.sockets[instanceId]?.slice()
    if (!arr) return s
    const cardId = arr[slotIdx]
    if (!cardId) return s
    arr[slotIdx] = null
    return { ownedCards: { ...s.ownedCards, [cardId]: (s.ownedCards[cardId] ?? 0) + 1 }, sockets: { ...s.sockets, [instanceId]: arr } }
  }),
}))

// A small starting pool so the upgrade economy is playable immediately in the
// mock (a real save would start at 0 and earn it all from play time).
export const ATTUNE_STARTING = 8

// Attunement available right now, given the game clock and what's been spent.
export function attunementAvailable(ticks: number, spent: number): number {
  return Math.max(0, ATTUNE_STARTING + Math.floor(ticks / ATTUNE_TICKS) - spent)
}
