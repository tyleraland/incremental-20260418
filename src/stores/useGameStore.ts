import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  WeaponRecord, LogEntry, LogCategory,
  LocationCombatStats, UnitCombatStats, CombatTally, StatBucket, ActionSlotEntry, TacticSlot, CompanionInstance,
  QuestDropRule, PackItem, ConsumableRule,
} from '@/types'
import { ACTION_SLOT_COUNT } from '@/types'
import { emptyTally, addInto, scaleTally, foldRoundEvents, foldHistory } from '@/lib/combatTally'
import { RECOVERY_TICKS, REGEN_RATE, RESTING_REGEN_RATE, TICKS_PER_SECOND, TICKS_PER_YEAR, formatDuration } from '@/lib/time'
import { getDerivedStats } from '@/lib/stats'
import { getLocationCombatReport } from '@/lib/combatReport'
import { projectOfflineRewards, rollOfflineLoot, splitExpByLevel, offlineWindowCount, scaleKills, type OfflineLocationReward, type OfflineSummary, type CatchUpDebug, type CatchUpLocation } from '@/lib/offline'
import { SAMPLING } from '@/lib/sampling'
import { randomFullName } from '@/lib/names'
import { SKILL_REGISTRY } from '@/data/skills'
import { MONSTER_REGISTRY, DROP_ITEMS } from '@/data/monsters'
import { consumableDef } from '@/data/consumables'
import { createBattle, addCombatant, relinkCombatant, advanceRound, issueMoveOrder, unitToEngineInput, monsterToEngineInput, companionToEngineInput, pointBlocked, MULTI_ATTACK_MAX, TACTIC_REGISTRY, SKILL_TACTICS, inheritedTacticIds, type Barrier, type BattleState, type Combatant, type EngineUnitInput, type TacticDef, type TacticChannel } from '@/engine'
import { RECIPE_REGISTRY } from '@/data/recipes'
import { INITIAL_EQUIPMENT, INITIAL_MISC } from '@/data/equipment'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { npcsAt, npcToEngineInput } from '@/data/npcs'
import { INITIAL_UNITS } from '@/data/units'
import { SCENARIO_REGISTRY } from '@/data/scenarios'
import { SAVE_KEY, saveKeyFor } from '@/lib/save'
import { routeStepsFrom } from '@/lib/travelGraph'
import { bootstrapProgressionMode, curatedStartUnits, CURATED_START, isSkillUnlocked, type ProgressionMode } from '@/lib/unlocks'
import { bootBattleSkin, type BattleSkin } from '@/render/skins'

// ── Re-exports (keeps existing import paths working) ──────────────────────────

export * from '@/types'
export * from '@/lib/time'
export * from '@/lib/stats'
export * from '@/lib/names'
export * from '@/lib/combatReport'
export * from '@/lib/combatTally'
export * from '@/lib/offline'
export * from '@/lib/elements'
export * from '@/data/traits'
export * from '@/data/skills'
export * from '@/data/monsters'
export * from '@/data/recipes'
export * from '@/data/equipment'
export * from '@/data/locations'
export * from '@/lib/unlocks'

// ── Tactics catalog (UI reads this to list equippable tactics) ────────────────-

export { TACTIC_REGISTRY, SKILL_TACTICS, inheritedTacticIds }
export type { TacticDef, TacticChannel }

export const MAX_UNIT_TACTICS = 4
export const MAX_PARTY_TACTICS = 2

// §hero stats: the live "/s" readout averages damage over the last 5 seconds.
export const DPS_WINDOW_TICKS = TICKS_PER_SECOND * 5

// §minions: a fresh beast companion's default — a tankish front-line pet (body-
// block + bite the beefiest foe). The player retunes these on the Pet tab.
function DEFAULT_COMPANION(): CompanionInstance {
  return { speciesId: 'wolf', name: 'Wolf', tactics: [{ id: 'guardian', rank: 1 }, { id: 'tank-buster', rank: 1 }] }
}

// Catalog entries of a given scope, in registry (declaration) order. Monster
// dispositions (skittish, pack-tactics, …) are monsterOnly — never offered to the
// player.
export function listTactics(scope: 'unit' | 'party'): TacticDef[] {
  return Object.values(TACTIC_REGISTRY).filter((t) => t.scope === scope && !t.monsterOnly)
}

// ── Store interface ───────────────────────────────────────────────────────────

export interface GameState {
  // PERSISTENT — included in save string
  units: Unit[]
  equipment: EquipmentItem[]
  miscItems: MiscItem[]
  learnedRecipes: string[]
  locationFamiliarity:    Record<string, number>      // locationId → current (0..familiarityMax)
  locationMonstersSeen:   Record<string, string[]>    // locationId → monsterIds seen
  monsterSeen:            Record<string, number>      // monsterId → total global sighting count
  monsterDefeated:        Record<string, number>      // monsterId → total defeat count
  locationStats:          Record<string, LocationCombatStats>  // locationId → cumulative combat stats
  unitStats:              Record<string, UnitCombatStats>      // unitId → lifetime combat tally (Report panel)
  unitStatHistory:        Record<string, StatBucket[]>         // unitId → rolling minute-buckets (battle-report 5m/1h windows)
  // §hero stats: a short ring buffer of the last DPS_WINDOW_TICKS (5s) of damage
  // dealt/taken per unit, for the live "/s" readout. Runtime only (not persisted).
  dpsWindow:              Record<string, { dealt: number[]; taken: number[] }>
  partyTactics:           TacticSlot[]                 // team-wide tactics injected into every unit (§5.5)
  // Feature-unfolding stance (src/lib/unlocks.ts): 'sandbox' = everything open
  // (the dev default), 'curated' = content gated + unfolded through play. Persisted
  // via worldCodec.
  progressionMode:        ProgressionMode
  ticks: number

  // MIXED TIER (see CLAUDE.md): `locations`, `eventLog`, `lastTickAt`, OfflineSummary
  // regenerate on load; the rest below PERSIST — battles/battleCooldown/
  // monsterSpawnTimers via battlesCodec, itemSockets via socketsCodec.
  locations: Location[]
  battles: Record<string, BattleState>                // locationId → live engine battle (persisted as BSNAP)
  battleCooldown: Record<string, number>              // locationId → ticks until the next wave spawns (persisted)
  monsterSpawnTimers: Record<string, number>          // open-world: ticks until next monster trickles in (persisted)
  // §travel: per-hero portal landing + grace, set when a hero crosses a portal.
  // `at` = where to drop them in on the destination (the partner-edge portal), used
  // once then nulled; `backTo`/`until` suppress re-crossing the edge they just used
  // for a few ticks. Runtime only — not serialized.
  portalArrivals: Record<string, { at: [number, number] | null; backTo: string; until: number }>
  itemSockets: Record<string, string[]>               // §6: itemInstanceId → card itemIds (persisted)
  eventLog: LogEntry[]                                // §7: ring buffer, last 200 entries
  lastTickAt: number
  // "While you were away" summary produced by the last offline catch-up
  // (batchTick). Null until one is produced / after it's dismissed. Not saved.
  offlineSummary: OfflineSummary | null
  // Debug instrumentation for the most recent offline catch-up (batchTick): when it
  // ran, how big the jump was, the sim cost (wall-ms / rounds), and the per-location
  // breakdown. Surfaced on the report screen so you can see if/when catch-up happens
  // and weigh sampling cost vs output. Runtime-only, not saved.
  lastCatchUp: CatchUpDebug | null

  // Quest-item drops (runtime; the proto quest layer owns the quest defs). Active
  // collect objectives register a QuestDropRule; `rewardKills` rolls a drop on a
  // matching kill and accumulates the count here, keyed by itemId. Tracked here
  // (NOT in `miscItems`) so quest items never show up in the Inventory. Not saved.
  questDropRules: QuestDropRule[]
  questItems: Record<string, number>            // quest-item id → count held

  // EPHEMERAL_UI — stored in localStorage; not in save string
  activeTab: TabId
  selectedUnitIds: string[]
  selectedLocationId: string | null
  combatLocationId: string | null
  // Map tab view: 'world' = pannable overworld + location details; 'battle' =
  // drop-in battlefield viewer for `combatLocationId`.
  mapMode: 'world' | 'battle'
  mapPageId: string
  // §logistics (placeholder, NOT wired yet): how deploying a hero moves them —
  // 'instant' teleports (today's behaviour); 'open-world' will route them via
  // overworld travel once that lands. Toggle lives in Time → Debug.
  deployMode: 'instant' | 'open-world'
  // Bumped to ask the pannable overworld to recentre its camera on
  // `selectedLocationId` (e.g. roster double-tap / "Map" button). A nonce so
  // re-focusing the same location still fires.
  mapFocusNonce: number
  // Bumped to ask the battle view to centre on a roster-selected unit, with the
  // unit id so the camera knows which combatant to frame.
  battleFocus: { unitId: string; nonce: number } | null
  // The battlefield hero the open-world camera is locked onto ("Diablo cam");
  // null = auto-fit the whole party. Lifted to the store (from the old in-battle
  // FollowStrip) so the single top roster can drive + reflect the follow lock.
  battleFollowId: string | null
  expandedLocationIds: string[]
  expandedUnitIds: string[]
  expandedInventorySections: string[]
  expandedRegionIds: string[]
  equipContext: { unitId: string; slot: EquipSlot } | null
  // Per-unit level at which the player last opened that hero's detail page. A
  // unit whose current level exceeds this (or has unspent points) shows a
  // "needs attention" badge in the roster until viewed.
  viewedUnitLevels: Record<string, number>
  // The unit whose lifetime-stats Report sheet is open (null = closed).
  reportUnitId: string | null
  // Battlefield look (render-only; token bodies + arena ground live in
  // src/render/skins.tsx). Toggle in Time → Debug or ?skin=paper.
  battleSkin: BattleSkin

  paused: boolean

  // Actions
  tick: () => void
  batchTick: (n: number) => void
  dismissOfflineSummary: () => void
  // Quest-item drops + consumption (driven by the proto quest layer). Arm a drop
  // rule when a collect objective begins (resets its item ledger); disarm on
  // cancel/complete (drops the rule + clears any leftover items). Hand-in quests
  // consume held items: consumeQuestItem (ephemeral) / consumeMiscItem (inventory).
  armQuestDrop: (rule: QuestDropRule) => void
  disarmQuestDrop: (ruleId: string) => void
  consumeQuestItem: (itemId: string, qty: number) => void
  consumeMiscItem: (itemId: string, qty: number) => void
  grantMiscItem: (itemId: string, qty: number) => void   // add to the stash (quest rewards, gold)
  grantEquipment: (itemId: string) => void               // add an owned equipment instance (quest item rewards)
  togglePause: () => void
  setActiveTab: (tab: TabId) => void
  toggleRegion: (id: string) => void
  toggleLocation: (id: string) => void
  toggleUnit: (id: string) => void
  toggleInventorySection: (id: string) => void
  toggleSelectUnit: (id: string) => void
  clearSelection: () => void
  setSelectedLocation: (id: string | null) => void
  setCombatLocation: (id: string | null) => void
  // Drop into a location's battlefield viewer / return to the overworld.
  enterBattleView: (locationId: string) => void
  exitBattleView: () => void
  // Jump the overworld to a unit's deployed location (roster double-tap), or
  // (in battle mode) drop into that unit's battlefield centred on them.
  showUnitOnMap: (unitId: string) => void
  // Lock the battlefield camera onto a hero (null = auto-fit the whole party).
  setBattleFollow: (id: string | null) => void
  // Centre the overworld camera on the selected location (roster "Map" button).
  focusLocationOnMap: (locationId: string) => void
  setMapPage: (id: string) => void
  // Mark a hero's detail page as viewed at its current level (clears its badge).
  markUnitViewed: (unitId: string) => void
  // Open / close the per-unit lifetime-stats Report sheet.
  openReport: (unitId: string) => void
  closeReport: () => void
  assignUnits: (unitIds: string[], locationId: string | null) => void
  // §travel: route a deployed hero to a (possibly distant) destination map by
  // WALKING — sets their travelPath to the multi-hop portal route; the tick loop
  // then walks them map→map. No-op if they're not deployed or there's no route.
  routeUnitTo: (unitId: string, destinationId: string) => void
  // §expedition: send a deployed hero toward the bottom edge of their location's
  // battlefield (simulates heading back to town). No-op if not in a live battle.
  runToMapEdge: (unitId: string) => void
  equipItem: (unitId: string, slot: EquipSlot, itemId: string | null) => void
  openEquipFor: (unitId: string, slot: EquipSlot) => void
  closeEquipContext: () => void
  spendAbilityPoint: (unitId: string, ability: keyof Abilities) => void
  debugLevelUp: (unitId: string) => void       // §debug: grant exactly enough exp to gain one level
  debugResetLevel: (unitId: string) => void    // §debug: reset to a clean level-1 unit (level/exp/abilities)
  setTravelEngage: (unitId: string, mode: 'ignore' | 'retaliate' | 'avoid') => void  // §travel-defend: per-hero routing combat behaviour
  learnSkill: (unitId: string, skillId: string) => void
  // Tactics: equip/unequip and reorder priority (first = highest). Validated
  // against TACTIC_REGISTRY scope and the per-unit / party slot caps.
  equipTactic: (unitId: string, tacticId: string) => void
  unequipTactic: (unitId: string, tacticId: string) => void
  moveTactic: (unitId: string, tacticId: string, dir: -1 | 1) => void
  // §consumables: configure a hero's pack (carry intents) and use rules. The
  // player only sets intent — no manual item moving; in-town auto-fill does the
  // logistics. setCarryTarget adds/updates a carry intent (target 0 holds a slot);
  // a rule is the explicit allow-list entry for in-combat use.
  setCarryTarget: (unitId: string, itemId: string, target: number) => void
  clearCarryTarget: (unitId: string, itemId: string) => void
  addConsumableRule: (unitId: string, itemId: string, threshold: number) => void
  removeConsumableRule: (unitId: string, itemId: string) => void
  setRuleThreshold: (unitId: string, itemId: string, threshold: number) => void
  // Decouple/recouple a tactic a unit inherits from one of its skills (debug/tuning).
  toggleInheritedTactic: (unitId: string, tacticId: string) => void
  // §minions: edit a hero's beast companion's tactic loadout (same per-channel
  // priority rules as a unit's; capped at MAX_UNIT_TACTICS).
  equipCompanionTactic: (unitId: string, tacticId: string) => void
  unequipCompanionTactic: (unitId: string, tacticId: string) => void
  moveCompanionTactic: (unitId: string, tacticId: string, dir: -1 | 1) => void
  equipPartyTactic: (tacticId: string) => void
  unequipPartyTactic: (tacticId: string) => void
  recruitUnit: () => void
  craft: (recipeId: string) => void
  // Switch the feature-unfolding stance. Flips the flag (persisted); call
  // resetSave afterwards to re-seed a fresh game for the new mode.
  setProgressionMode: (mode: ProgressionMode) => void
  setDeployMode: (mode: 'instant' | 'open-world') => void
  setBattleSkin: (skin: BattleSkin) => void
  // Tap-/drag-to-fill an action slot. When entry.kind === 'item', the item is
  // also added to the unit's sideboard (evicting the oldest sideboard entry if
  // both sideboards are full). Setting to null clears the slot AND removes the
  // item from sideboard if no other action slot still references it.
  setActionSlot: (unitId: string, slotIdx: number, entry: ActionSlotEntry | null) => void
  resetSave: () => void
}

// ── Event log helper ──────────────────────────────────────────────────────────

function appendLog(log: LogEntry[], category: LogCategory, message: string, tick: number): LogEntry[] {
  return [{ tick, category, message }, ...log].slice(0, 200)
}

// ── Level-up helpers ──────────────────────────────────────────────────────────

const EXP_A = 10
const EXP_P = 3

// §debug: the base value every ability is reset to by debugResetLevel (a clean,
// predictable level-1 baseline — recruits normally roll 2–5).
const DEBUG_RESET_ABILITY = 1

export function expForLevel(level: number): number {
  return Math.floor(EXP_A * Math.pow(level, EXP_P))
}

function applyLevelUps(unit: Unit, tick: number, log: LogEntry[]): { unit: Unit; log: LogEntry[] } {
  let { level, exp, expToNext, abilityPoints, skillPoints } = unit
  while (exp >= expToNext) {
    exp -= expToNext
    abilityPoints += Math.floor(level / 5) + 3
    skillPoints   += 1
    level         += 1
    expToNext      = expForLevel(level)
    log = appendLog(log, 'levelup', `${unit.name} reached level ${level}!`, tick)
  }
  return { unit: { ...unit, level, exp, expToNext, abilityPoints, skillPoints }, log }
}

// ── Combat lifecycle (drives the engine from the tick loop) ────────────────────

// Finer rounds: run the engine every tick at timeScale = ROUND_TIME_SCALE, so the
// real-time pace is unchanged by timeScale alone (it only sub-steps motion) while
// the tick cadence (ROUND_EVERY_TICKS) sets how often a round actually lands.
// Logical rounds/sec = TICKS_PER_SECOND(5) / (ROUND_EVERY_TICKS × ROUND_TIME_SCALE).
const ROUND_TIME_SCALE    = 6    // engine rounds per logical round (finer = smoother motion)
const ROUND_EVERY_TICKS   = 1    // advance one engine round every tick (5/sec). Locked to the 200ms tick clock — no batching jitter — which the on-device probe (jerk harness) measured as ~2× smoother than stepping every 3 ticks at a coarser timeScale. With ROUND_TIME_SCALE=6 that's ~0.83 logical rounds/sec. Also drives the offline rounds↔ticks conversion, so live + offline pace stay in sync.

// DEV-only cadence overrides for the "slower rounds" exploration. `?hts=N` sets the
// heavy-field timeScale (granularity: higher = smaller steps), `?hevery=M` the ticks
// between its rounds (tempo/CPU), `?ts=N` the base (non-heavy) timeScale. Read once at
// module load; absent in prod builds. Lets a Playwright sweep A/B the lever without a
// recompile. See e2e/jerk.spec.ts.
function devNum(key: string): number | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get(key)
  return v != null && +v >= 1 ? Math.floor(+v) : null
}
const DEV_HEAVY_TS    = devNum('hts')
const DEV_HEAVY_EVERY = devNum('hevery')
const DEV_BASE_TS     = devNum('ts')
const DEV_DECIDE      = devNum('decide')   // re-decide targeting/planner every N engine rounds (prototype)
// Per-field engine cadence: `timeScale` (granularity — higher = finer/smaller steps =
// smoother motion; it sub-steps a round and does NOT change per-round CPU) and
// `everyTicks` (how many 200ms ticks between rounds — the real CPU/throughput lever,
// since each landed round runs one advanceRound + one React commit + repaint of every
// token). Granularity is the smoothness lever (the on-device jerk sweep, e2e/jerk.spec
// .ts), so we run the finest practical timeScale every tick (ROUND_EVERY_TICKS=1). The
// only place that backs off is a genuinely huge open-world crowd, where per-round
// advanceRound + repaint of hundreds of tokens overruns the frame budget (measured on
// a real phone: ~75 tokens = 59fps, ~130 = 46fps, ~250 = 13fps) — there we step LESS
// often (openWorldEveryTicks) so each expensive round gets more budget; motion stays
// fine-stepped, the field just resolves slower under a mob (graceful degradation —
// off-screen/offline rewards are rate-extrapolated regardless). timeScale is static
// per battle (from creation) so it never thrashes mid-battle and snapshot replays stay
// byte-identical; everyTicks is a store-side scheduling choice, outside the engine, so
// adapting it per-tick is replay-safe. DEV `?hts=`/`?hevery=`/`?ts=` override for sweeps.
const HEAVY_FIELD_CAP     = 16   // openWorldCap at/above which decisions throttle (DECISION_INTERVAL_HEAVY)
// Heavy fields run at FULL pace (one round every tick) but re-decide targeting +
// the team planner only every DECISION_INTERVAL_HEAVY engine rounds — units execute
// their committed lock/movement in between. This kills the fast-slow jerk without
// slowing combat (the big finding from the decision-throttle exploration). ~1/sec
// at 5 rounds/sec. Normal fields re-decide every round (responsive at small scale).
const DECISION_INTERVAL_HEAVY = 5
// Pace-preserving perf tier for an open-world field, keyed off its CAP (its steady
// crowd). A huge crowd makes each round (advanceRound + the React commit/repaint of
// every token) overrun the frame budget, so a denser field must run fewer rounds/sec.
// The trap the old code fell into: backing off everyTicks ALONE (more ticks between
// rounds) while leaving timeScale fixed makes units move slower — a 200-cap field
// crawled at ~1/5 speed. Instead PAIR the two so their product stays = ROUND_TIME_SCALE:
// a coarser timeScale (bigger move per round) exactly offsets the rarer rounds, so the
// real-time movement/combat pace is CONSTANT across tiers — the field just resolves in
// fewer, chunkier (glide-smoothed) steps. timeScale ∈ {6,3,2,1} ⇒ everyTicks ∈ {1,2,3,6};
// rounds/sec = TICKS_PER_SECOND / everyTicks. (Tuned from on-device measurements:
// ≤~80 tokens every-tick ~59fps; ~250 every-tick collapsed to ~13fps.)
export function openWorldTimeScale(cap: number): number {
  if (cap >= 200) return 1
  if (cap >= 140) return 2
  if (cap >= 90)  return 3
  return ROUND_TIME_SCALE   // 6 — full granularity at comfortable counts
}
// everyTicks paired to a battle's timeScale (product = ROUND_TIME_SCALE) → constant pace.
export const everyTicksFor = (timeScale: number): number => Math.max(1, Math.round(ROUND_TIME_SCALE / timeScale))
export const OPEN_WORLD_ROUND_TIME_SCALE = ROUND_TIME_SCALE   // exported for the pace-invariant test
function cadenceFor(loc: Location): { timeScale: number; everyTicks: number } {
  const heavy = loc.openWorld && openWorldCap(loc) >= HEAVY_FIELD_CAP
  const base = loc.openWorld ? openWorldTimeScale(openWorldCap(loc)) : ROUND_TIME_SCALE
  const timeScale = (heavy ? DEV_HEAVY_TS : DEV_BASE_TS) ?? base
  return { timeScale, everyTicks: DEV_HEAVY_EVERY ?? everyTicksFor(timeScale) }
}
function decisionIntervalFor(loc: Location): number {
  const heavy = loc.openWorld && openWorldCap(loc) >= HEAVY_FIELD_CAP
  return heavy ? DECISION_INTERVAL_HEAVY : 1
}
// Off-screen / offline simulation budgets are centralized in `@/lib/sampling`
// (SAMPLING) — the one place to tune cost-vs-fidelity. SAMPLING.offscreenCreditTicks
// is how often an unwatched location credits rate-extrapolated rewards.
const BATTLE_RESPAWN_TICKS = 15  // ticks between a finished wave and the next

// Open-world pacing (§open-world). A persistent battle keeps a FIXED number of
// monsters on the field (per-location `openWorldCap`, default below). When the
// count drops below the cap a fresh monster trickles in every
// OPEN_WORLD_SPAWN_TICKS ticks, drawn at random from the location's `monsterIds`
// pool so the party has to adapt to whatever wanders in. Deliberately simple —
// per-location monster distributions and smarter spawn timing come later.
const OPEN_WORLD_SPAWN_TICKS = 30  // ~6s between trickle spawns while below cap
const OPEN_WORLD_DEFAULT_CAP = 8   // fallback field size when a location sets none
// Open-world maps are large — the camera can't show the whole field at once, so
// the party hunts across it with limited vision. Every map should really set its
// own `openWorldCap` (density) override; size defaults here unless overridden.
// A big field is actually CHEAPER to render than a small one at the same cap: the
// camera windows ~15 cells, so on a large map the monsters spread out and fewer
// are on-screen/in a melee scrum at once (perf is bound by visible tokens, not
// map area — verified on the throttled-mobile harness up to 200×200 / cap 90).
const OPEN_WORLD_DEFAULT_SIZE = 200
const HERO_VISION = 10             // heroes acquire targets within this many cells
const MONSTER_VISION = 8           // monsters see a little less far
// Open-world pathfinding (steerAround/canReach) builds a visibility graph with
// ~4 nodes per barrier and runs Dijkstra over it every time a unit reroutes, so
// its cost grows superlinearly with the *barrier count* — NOT with the map area.
// A big (200-wide) map must therefore keep roughly the same handful of barriers
// a small one has, just spread thinner, or a heavy field grinds. Cap the count
// here so map size and barrier count are decoupled. See openWorldBarriers.
const BARRIER_CAP = 16
// §travel: how close a routing hero must get to a portal cell to cross it.
const PORTAL_RADIUS = 1.5
// §travel: after crossing, ignore the reverse portal (the one back where we came
// from) for this many ticks so a hero who lands ON it isn't sucked straight back —
// it walks clear (or hunts) first. Long enough to step off at any move speed.
const PORTAL_GRACE_TICKS = 5
function openWorldCap(loc: Location): number {
  return loc.openWorldCap ?? OPEN_WORLD_DEFAULT_CAP
}
function openWorldSize(loc: Location): number {
  return loc.openWorldSize ?? OPEN_WORLD_DEFAULT_SIZE
}

// Enemy combatant ids are `${monsterId}#${index}`; players use the unit id.
function monsterIdOf(combatantId: string): string {
  return combatantId.split('#')[0]
}

// Combat setup at a location flows through its `testScenarioId`: if set, the
// matching SCENARIO_REGISTRY entry overrides terrain and (optionally) the wave.
// Otherwise the location is open-field and the wave cycles its monsterIds to
// match party size.
function scenarioOf(loc: Location | null | undefined) {
  return loc?.testScenarioId ? SCENARIO_REGISTRY[loc.testScenarioId] ?? null : null
}

export function locationBarriers(loc?: Location | null): Barrier[] {
  return scenarioOf(loc)?.barriers?.() ?? []
}

// Procedural "natural" terrain for an open-world field that has no scenario
// barriers: a deterministic scatter of rock clusters (walls) and a few cliffs the
// party threads around. Seeded by the location id so a map looks the same each
// visit (and matches its persisted snapshot). A clear apron is kept around the
// centre spawn knot so heroes never form up inside rock. These landmarks also give
// the eye a fixed reference, so the party's movement across the field reads.
function openWorldBarriers(loc: Location, size: number): Barrier[] {
  let h = 2166136261
  for (let i = 0; i < loc.id.length; i++) { h = Math.imul(h ^ loc.id.charCodeAt(i), 16777619) }
  const rng = () => {
    h += 0x6d2b79f5; let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const c = size / 2
  const clear = Math.max(6, size * 0.14)           // uncluttered apron around spawn
  const out: Barrier[] = []
  // ~size/6 clusters (8 on a 50-wide map), but CAPPED at BARRIER_CAP so a big
  // (200-wide) map doesn't scale up to ~33 walls and grind the pather. Small and
  // mid maps (size ≤ 96) are below the cap, so their terrain is unchanged; only
  // large new fields hit it, reading as sparser open ground rather than denser rock.
  const count = Math.min(BARRIER_CAP, Math.round(size / 6))
  for (let guard = 0; out.length < count && guard < count * 12; guard++) {
    const w = 2 + Math.floor(rng() * 4)
    const hh = 2 + Math.floor(rng() * 4)
    const x = 2 + rng() * (size - 4 - w)
    const y = 2 + rng() * (size - 4 - hh)
    if (Math.hypot(x + w / 2 - c, y + hh / 2 - c) < clear) continue
    out.push({ x, y, w, h: hh, kind: rng() < 0.25 ? 'cliff' : 'wall' })
  }
  return out
}

// A location runs one fixed encounter — independent of party size — until we
// have multiple encounter variants per location to randomise across. Scenarios
// can still pin a multi-monster wave (the F2 cross-wall gang); otherwise all
// of the location's monsterIds are used as the wave.
export function waveComposition(loc: Location, _partySize: number): string[] {
  const scen = scenarioOf(loc)
  if (scen?.wave) return scen.wave
  return loc.monsterIds
}

// §minions: the beast-companion inputs for every hero in `party` that has one
// (optionally stamped with a sight radius for open-world fog). They join the
// player team owned by + leashed to their hero.
function companionInputsFor(party: Unit[], vision?: number): EngineUnitInput[] {
  const out: EngineUnitInput[] = []
  for (const u of party) {
    const inp = companionToEngineInput(u)
    if (inp) out.push(vision != null ? withVision(inp, vision) : inp)
  }
  return out
}

function createBattleFor(loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[]): BattleState {
  const roster = party
  const playerUnits = [...roster.map((u) => unitToEngineInput(u, getDerivedStats(u, equipment), 'player')), ...companionInputsFor(roster)]
  const enemyUnits = []
  const wave = waveComposition(loc, roster.length)
  for (let i = 0; i < wave.length; i++) {
    const def = MONSTER_REGISTRY[wave[i]]
    if (def) enemyUnits.push(monsterToEngineInput(def, `${wave[i]}#${i}`, 'enemy'))
  }
  return createBattle({ playerUnits, enemyUnits, playerPartyTactics: partyTactics, barriers: locationBarriers(loc), collectEvents: true, timeScale: ROUND_TIME_SCALE, multiAttackMax: MULTI_ATTACK_MAX })
}

// ── Open-world battle helpers (§open-world) ─────────────────────────────────--

// Pick a random monster id from the location's pool (equal weight for now).
function pickMonsterId(loc: Location): string | null {
  return loc.monsterIds.length ? loc.monsterIds[Math.floor(Math.random() * loc.monsterIds.length)] : null
}

// A combatant id `${monsterId}#${n}` not already used in this battle. The engine
// only needs uniqueness within the live combatant set; `monsterIdOf` still
// recovers the monster id from the prefix.
function uniqueEnemyId(battle: BattleState, monsterId: string): string {
  let i = 0
  while (battle.combatants.some((c) => c.id === `${monsterId}#${i}`)) i++
  return `${monsterId}#${i}`
}

// Stamp a finite sight radius onto an adapted input (open-world only).
function withVision(input: EngineUnitInput, range: number): EngineUnitInput {
  return { ...input, visionRange: range }
}

// A random point on the map (kept a few cells off the edges so monsters don't
// spawn jammed in a corner) — monsters scatter across the whole field. On a map
// with terrain, retry a few times so a monster never spawns *inside* a wall.
function scatterPos(size: number, barriers: Barrier[] = []): { x: number; y: number } {
  const m = Math.min(4, size / 2 - 0.5)
  let p = { x: m + Math.random() * (size - 2 * m), y: m + Math.random() * (size - 2 * m) }
  for (let i = 0; i < 12 && barriers.length && pointBlocked(barriers, p); i++) {
    p = { x: m + Math.random() * (size - 2 * m), y: m + Math.random() * (size - 2 * m) }
  }
  return p
}

// Heroes form up as a loose knot near the map centre; the engine's separation
// rule fans them out, and they roam from there.
function heroSpawnPos(size: number, i: number): { x: number; y: number } {
  const c = size / 2
  return { x: c + (i % 3) - 1, y: c + Math.floor(i / 3) - 1 }
}

// Where a returning/late hero drops in: the current party's centre of mass (so
// they rejoin the group), or the map centre if nobody's fielded yet.
function partyAnchor(battle: BattleState, size: number): { x: number; y: number } {
  const heroes = battle.combatants.filter((c) => c.team === 'player' && c.alive)
  if (heroes.length === 0) return { x: size / 2, y: size / 2 }
  return {
    x: heroes.reduce((s, c) => s + c.pos.x, 0) / heroes.length,
    y: heroes.reduce((s, c) => s + c.pos.y, 0) / heroes.length,
  }
}

// Spawn one monster of `monsterId` into a live battle at an explicit position.
// The primitive behind all monster spawns. Returns the spawned Combatant, or
// null if the id is unknown. (Tests can spawn a specific monster at a specific
// spot; the game's timed respawn is the `spawnMonsterInto` special case below.)
export function spawnMonsterAt(battle: BattleState, monsterId: string, at: { x: number; y: number }): Combatant | null {
  const def = MONSTER_REGISTRY[monsterId]
  if (!def) return null
  return addCombatant(battle, withVision(monsterToEngineInput(def, uniqueEnemyId(battle, monsterId), 'enemy'), MONSTER_VISION), 'enemy', undefined, at)
}

// Deploy a hero into a live battle at an explicit position (symmetry with
// spawnMonsterAt). The reconcile loop fields heroes at the party anchor; this is
// for placing one somewhere specific (manual deploy on a battlefield, tests).
export function deployUnitAt(battle: BattleState, unit: Unit, equipment: EquipmentItem[], partyTactics: TacticSlot[], at: { x: number; y: number }): Combatant {
  return addCombatant(battle, withVision(unitToEngineInput(unit, getDerivedStats(unit, equipment), 'player'), HERO_VISION), 'player', partyTactics, at)
}

// Timed/random respawn: a special case of spawnMonsterAt — pick a random monster
// from the location pool and scatter it across the field (off the edges, never
// inside a wall). Returns the monster id (for sighting bookkeeping) or null.
function spawnMonsterInto(battle: BattleState, loc: Location, size: number): string | null {
  const mid = pickMonsterId(loc)
  if (!mid) return null
  return spawnMonsterAt(battle, mid, scatterPos(size, battle.barriers)) ? mid : null
}

// Engine timeScale for a battle on this location: the finer (smoother) default, but
// a high-cap open-world field runs coarser so it can be stepped half as often at the
// same pace (the sim-rate throttle — see HEAVY_FIELD_CAP). `advanceBattles` derives
// the matching step cadence (`everyTicks`) back out of the battle's timeScale.
// Engine timeScale for a battle on this location (see cadenceFor): finer (smoother)
// the default; a high-cap field keeps it but is stepped less often (the smoothness/
// pace trade). `advanceBattles` reads the matching step cadence from cadenceFor too.
function timeScaleFor(loc: Location): number {
  return cadenceFor(loc).timeScale
}

// Stand up a fresh persistent battle on the location's (large) open-world map:
// the party knotted at the centre, `cap` monsters scattered across the field,
// everyone with a limited sight radius. Marked `mode: 'open'` so it never ends.
function createOpenBattleFor(loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[], cap: number, arrivals: GameState['portalArrivals'] = {}): BattleState {
  const size = openWorldSize(loc)
  const scenBarriers = locationBarriers(loc)
  const barriers = scenBarriers.length ? scenBarriers : openWorldBarriers(loc, size)
  // A city is a peaceful field: heroes mill about individually (§town wander) and
  // its NPCs stand around for them to cross paths with.
  const peaceful = loc.traits.includes('city')
  const battle = createBattle({ playerUnits: [], enemyUnits: [], playerPartyTactics: partyTactics, barriers, collectEvents: true, mode: 'open', peaceful, cols: size, rows: size, timeScale: timeScaleFor(loc), decisionInterval: DEV_DECIDE ?? decisionIntervalFor(loc), multiAttackMax: MULTI_ATTACK_MAX })
  // Town NPCs (merchants/questgivers): stationary, non-combatant, on the neutral
  // team — nobody fights them and they never fight. They stand where they spawn.
  for (const npc of npcsAt(loc.id)) {
    addCombatant(battle, npcToEngineInput(npc), 'neutral', undefined, npc.pos)
  }
  party.forEach((u, i) => {
    // §travel: a hero arriving via a portal emerges at the partner-edge spot (this
    // applies on a FRESH field too — e.g. crossing into a map whose battle didn't
    // exist yet); others form up near the centre.
    const land = arrivals[u.id]?.at
    const at = land ? { x: land[0], y: land[1] } : heroSpawnPos(size, i)
    addCombatant(battle, withVision(unitToEngineInput(u, getDerivedStats(u, equipment), 'player'), HERO_VISION), 'player', partyTactics, at)
    const cinp = companionToEngineInput(u)
    if (cinp) {
      const owner = battle.combatants.find((c) => c.id === u.id)
      addCombatant(battle, withVision(cinp, HERO_VISION), 'player', partyTactics, owner ? { x: owner.pos.x + 1, y: owner.pos.y } : heroSpawnPos(size, i))
    }
  })
  for (let i = 0; i < cap; i++) spawnMonsterInto(battle, loc, size)
  return battle
}

// Reconcile a persistent battle's player combatants against who's eligible right
// now: drop heroes that died or left (clearing stale enemy locks), and field any
// eligible hero not already present (fresh deploys, returnees from recovery) at
// the party anchor. Returns true if the combatant set changed. Mutates in place.
function reconcileOpenPlayers(
  battle: BattleState, eligible: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[],
  arrivals: GameState['portalArrivals'] = {},
): boolean {
  const eligibleIds = new Set(eligible.map((u) => u.id))
  let changed = false

  // §minions: a player combatant with an ownerId is a pet/summon, not a hero.
  const isMinion = (c: Combatant) => c.team === 'player' && c.ownerId != null
  // Heroes that should stand right now (alive + eligible) — a minion is kept only
  // while its owner is one of these (so a hero's pet leaves with its hero).
  const liveHeroIds = new Set(
    battle.combatants.filter((c) => c.team === 'player' && c.ownerId == null && c.alive && eligibleIds.has(c.id)).map((c) => c.id),
  )
  const remove = new Set<string>()
  for (const c of battle.combatants) {
    if (c.team !== 'player') continue
    if (isMinion(c)) {
      // Drop a dead minion, or one whose owner is no longer standing (the engine's
      // owner-gone sweep already kills it; this reclaims the corpse). A live pet
      // with a live owner stays — and is NOT re-added if it dies, so a fallen pet
      // returns only when its hero next re-deploys.
      if (!c.alive || c.ownerId == null || !liveHeroIds.has(c.ownerId)) remove.add(c.id)
    } else if (!c.alive || !eligibleIds.has(c.id)) {
      remove.add(c.id)
    }
  }
  if (remove.size) {
    battle.combatants = battle.combatants.filter((c) => !remove.has(c.id))
    for (const c of battle.combatants) if (c.lockedTargetId && remove.has(c.lockedTargetId)) c.lockedTargetId = null
    changed = true
  }

  // Field any eligible hero not present — and its companion alongside it.
  const present = new Set(battle.combatants.filter((c) => c.team === 'player' && c.ownerId == null).map((c) => c.id))
  for (const u of eligible) {
    if (present.has(u.id)) continue
    // §travel: a hero who just crossed a portal drops in AT the partner-edge portal
    // (east→west etc., per the `toAt` wiring), not the map centre — so they emerge
    // where the maps connect. Everyone else forms up on the party anchor.
    const land = arrivals[u.id]?.at
    const at = land ? { x: land[0], y: land[1] } : partyAnchor(battle, battle.cols)
    addCombatant(battle, withVision(unitToEngineInput(u, getDerivedStats(u, equipment), 'player'), HERO_VISION), 'player', partyTactics, at)
    const cinp = companionToEngineInput(u)
    if (cinp) addCombatant(battle, withVision(cinp, HERO_VISION), 'player', partyTactics, { x: at.x + 1, y: at.y })
    changed = true
  }
  return changed
}

// Re-apply each deployed hero's CURRENT loadout (gear, skills, tactics) to its live
// combatant in place, so equipment/skill/tactic edits take effect in an ongoing
// fight within a tick — no need to re-deploy or wait for a respawn. Runtime state
// (position, hp, cooldowns, statuses) is preserved; it's a no-op when nothing
// changed. Cheap (party-sized), and players only — monsters have no editable kit.
function syncPlayerLoadouts(battle: BattleState, units: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[]): void {
  const byId = new Map(units.map((u) => [u.id, u]))
  for (const c of battle.combatants) {
    if (c.team !== 'player') continue
    const u = byId.get(c.id)
    if (!u) continue
    // Vision is left as-is by relink (it's a per-battle property), so no withVision.
    relinkCombatant(c, unitToEngineInput(u, getDerivedStats(u, equipment), 'player'), partyTactics)
  }
}

// ── Offline progression: cold-location priming (Phase 2) ─────────────────────
//
// A location deployed but never sampled (no `locationStats`) has no rate to
// extrapolate. We prime it by running a *budgeted* slice of real combat —
// settle the in-flight fight, collect the rewards it actually produces, and seed
// a rate sample the warm path then extrapolates over the rest of the offline
// span. Capped at SAMPLING.primeRoundCap rounds AND SAMPLING.primeMsBudget wall-ms
// so a heavy fight can't block the main thread (a Web Worker offload stays deferred
// — the BSNAP tokens already make a battle worker-portable). The engine is RNG-free;
// loot rolls use Math.random (same as the live `rewardKills`).

// Don't pop the "while you were away" modal for a brief background blip — only
// after a real absence (≥ this many real seconds away).
export const OFFLINE_SUMMARY_MIN_SECS = 60

interface PrimeResult {
  battle: BattleState
  primedTicks: number
  exp: number          // total XP pool generated while priming (split by level at credit time)
  gold: number
  killsByMonster: Record<string, number>
  loot: Record<string, number>
  // Rich per-hero combat breakdown harvested from the simulated rounds (damage,
  // hits, element/effectiveness, etc.) — already scaled to the projection span by
  // the sampled path; the cold path returns its raw slice for the caller to scale.
  tally: Record<string, CombatTally>
}

// Stand up (or reuse) the right battle for a location's offline simulation.
function offlineBattleFor(
  loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[], existing: BattleState | undefined,
): BattleState {
  const wantOpen = !!loc.openWorld
  if (existing && (wantOpen ? existing.mode === 'open' : existing.mode !== 'open')) return existing
  return wantOpen
    ? createOpenBattleFor(loc, party, equipment, partyTactics, openWorldCap(loc))
    : createBattleFor(loc, party, equipment, partyTactics)
}

// One round of the live open-world spawn cadence, for the offline priming slice:
// clear last round's (already-counted) corpses, then trickle AT MOST one fresh
// monster in every OPEN_WORLD_SPAWN_TICKS rounds while below cap — exactly what the
// live tick does (`monsterSpawnTimers`). Returns the next timer value. This makes
// the primed kill rate SPAWN-LIMITED (what realized play yields) instead of the
// saturated "refill to cap every round" rate (`restockField`), which over-credited
// offline rewards by ~13× for a party that out-clears the trickle.
function trickleField(battle: BattleState, loc: Location, spawnTimer: number): number {
  battle.combatants = battle.combatants.filter((c) => !(c.team === 'enemy' && !c.alive))
  const living = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length
  if (living >= openWorldCap(loc)) return OPEN_WORLD_SPAWN_TICKS
  const next = Math.max(0, spawnTimer - 1)
  if (next === 0) {
    spawnMonsterInto(battle, loc, openWorldSize(loc))
    return OPEN_WORLD_SPAWN_TICKS
  }
  return next
}

// Run a budgeted slice of REAL combat on `battle`, in place, returning the kills it
// produced (per monster), the loot rolled per kill, and how many rounds it ran.
// exp/gold mirror the live model (+1 each per kill), so the caller derives them
// from the kill count. `rng` is injectable (tests pin it). Used by both the cold
// prime (one slice) and the sampled projection (one per window).
function runCombatSlice(
  battle: BattleState, loc: Location, roundCap: number, msBudget: number, rng: () => number = Math.random,
): { killsByMonster: Record<string, number>; loot: Record<string, number>; rounds: number; tally: Record<string, CombatTally> } {
  const wantOpen = !!loc.openWorld
  const killsByMonster: Record<string, number> = {}
  const loot: Record<string, number> = {}
  const tally: Record<string, CombatTally> = {}
  const playerIds = new Set(battle.combatants.filter((c) => c.team === 'player').map((c) => c.id))
  let rounds = 0
  let spawnTimer = OPEN_WORLD_SPAWN_TICKS   // local mirror of the live trickle cadence
  const started = Date.now()

  while (rounds < roundCap && Date.now() - started < msBudget) {
    if (!wantOpen && battle.outcome !== 'ongoing') break  // wave finished → slice complete
    // Open world never resets: clear last round's corpses and trickle one monster in
    // on the live spawn cadence (spawn-LIMITED, so the measured rate is the sustained
    // realized rate — not a saturated "always at cap" rate that over-credits rewards).
    if (wantOpen) spawnTimer = trickleField(battle, loc, spawnTimer)
    const before = new Set(battle.combatants.filter((c) => c.team === 'enemy' && c.alive).map((c) => c.id))
    advanceRound(battle)
    rounds++
    // Harvest this round's rich per-hero breakdown (open-world heroes can join
    // mid-slice via respawn reconciliation, so re-derive ids defensively).
    for (const c of battle.combatants) if (c.team === 'player') playerIds.add(c.id)
    foldRoundEvents(tally, battle.events, battle.round, playerIds)
    // Who landed each killing blow this round (the live path credits kills via
    // rewardKills; the offline slice has to read them off the death events).
    const killerByEnemy: Record<string, string> = {}
    for (const e of battle.events) {
      if (e.round === battle.round && e.type === 'unit_death' && e.targetId) killerByEnemy[e.targetId] = e.sourceId
    }

    for (const c of battle.combatants) {
      if (c.team !== 'enemy' || c.alive || !before.has(c.id)) continue
      const mid = monsterIdOf(c.id)
      killsByMonster[mid] = (killsByMonster[mid] ?? 0) + 1
      const killer = killerByEnemy[c.id]
      const credited = killer && playerIds.has(killer) ? killer : null
      if (credited) {
        const t = tally[credited] ?? (tally[credited] = emptyTally())
        t.monstersDefeated += 1
        t.killsByMonster[mid] = (t.killsByMonster[mid] ?? 0) + 1   // per-type, for cull quests
      }
      const def = MONSTER_REGISTRY[mid]
      if (def) for (const d of def.drops) {
        if (rng() < d.dropRate) {
          const qty = d.quantityMin + Math.floor(rng() * (d.quantityMax - d.quantityMin + 1))
          loot[d.itemId] = (loot[d.itemId] ?? 0) + qty
          if (credited) (tally[credited] ?? (tally[credited] = emptyTally())).itemsFound += qty
        }
      }
    }
  }

  return { killsByMonster, loot, rounds, tally }
}

function primeColdLocation(
  loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[],
  existing: BattleState | undefined,
): PrimeResult {
  const battle = offlineBattleFor(loc, party, equipment, partyTactics, existing)
  const { killsByMonster, loot, rounds, tally } = runCombatSlice(battle, loc, SAMPLING.primeRoundCap, SAMPLING.primeMsBudget)
  const kills = Object.values(killsByMonster).reduce((a, b) => a + b, 0)
  return { battle, primedTicks: rounds * ROUND_EVERY_TICKS, exp: kills, gold: kills, killsByMonster, loot, tally }
}

// Sum per-hero tally deltas across many slices (each pre-scaled to its window).
function mergeTally(dst: Record<string, CombatTally>, src: Record<string, CombatTally>): void {
  for (const [id, t] of Object.entries(src)) addInto(dst[id] ?? (dst[id] = emptyTally()), t)
}

// Scale every hero's tally by the same factor (a measured slice → its full span).
function scaleTallyMap(src: Record<string, CombatTally>, factor: number): Record<string, CombatTally> {
  const out: Record<string, CombatTally> = {}
  for (const [id, t] of Object.entries(src)) out[id] = scaleTally(t, factor)
  return out
}

// ── Sampled-window offline projection ────────────────────────────────────────--
// Split a long absence into `samples` independent windows. For each: simulate a
// short budgeted slice, extrapolate its rate over the window's duration, and add
// it in — re-stocking the field between windows so each is a fresh composition
// sample. The result carries variance (clumps, lucky/unlucky stretches, a varied
// monster pool) that the single linear extrapolation flattens away.
//
// `prepareWindow` is the extension seam: it's called before each window's slice
// with the live battle, the window index, and the absolute tick the window begins
// at — so a future scheduled-event system can inject a periodic boss (via
// `spawnMonsterAt`) into the windows it should appear in, and have it actually
// fought + rewarded. Today nothing passes it; the sampling is composition variance.
// Budgets (window count, per-window round/ms caps) live in SAMPLING (@/lib/sampling).
export interface SampledOptions {
  samples: number
  startTick: number
  roundCap?: number
  msBudget?: number
  prepareWindow?: (battle: BattleState, windowIndex: number, windowStartTick: number) => void
}

export function projectOfflineSampled(
  loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[],
  existing: BattleState | undefined, offlineTicks: number, opts: SampledOptions, rng: () => number = Math.random,
): PrimeResult {
  const wantOpen = !!loc.openWorld
  const battle = offlineBattleFor(loc, party, equipment, partyTactics, existing)
  const K = Math.max(1, opts.samples)
  const windowTicks = offlineTicks / K
  const roundCap = opts.roundCap ?? SAMPLING.windowRoundCap
  const msBudget = opts.msBudget ?? SAMPLING.windowMsBudget

  const killsByMonster: Record<string, number> = {}
  const tally: Record<string, CombatTally> = {}
  let simTicks = 0
  for (let w = 0; w < K; w++) {
    opts.prepareWindow?.(battle, w, Math.round(opts.startTick + w * windowTicks))
    const slice = runCombatSlice(battle, loc, roundCap, msBudget, rng)
    const sliceTicks = Math.max(1, slice.rounds * ROUND_EVERY_TICKS)
    simTicks += sliceTicks
    const factor = windowTicks / sliceTicks
    const windowKills = scaleKills(slice.killsByMonster, factor)
    for (const [mid, k] of Object.entries(windowKills)) killsByMonster[mid] = (killsByMonster[mid] ?? 0) + k
    // Extrapolate this window's breakdown over its full duration, same factor.
    mergeTally(tally, scaleTallyMap(slice.tally, factor))
    // NOTE: we deliberately DON'T re-stock the field to cap between windows. Each
    // slice already trickles fresh (random) monsters in on the live spawn cadence,
    // so composition still varies window-to-window — but the field state carries
    // continuously, so the initial cap is fought down only ONCE (as in realized
    // play). Re-stocking to cap each window re-paid that initial clear every window
    // and ~doubled the projected kill rate over a short (80-round) slice.
  }

  const totalKills = Object.values(killsByMonster).reduce((a, b) => a + b, 0)
  return { battle, primedTicks: simTicks, exp: totalKills, gold: totalKills, killsByMonster, loot: rollOfflineLoot(killsByMonster, rng), tally }
}

function applyMiscDeltas(misc: MiscItem[], deltas: Record<string, number>): MiscItem[] {
  const out = misc.map((m) => ({ ...m }))
  for (const [id, qty] of Object.entries(deltas)) {
    if (!qty) continue
    const existing = out.find((m) => m.id === id)
    if (existing) existing.quantity += qty
    else {
      // A consumable (e.g. a potion bought from a merchant) must enter the stash
      // tagged `kind: 'consumable'` + with its real name, so the logistics loadout
      // and in-town resupply recognise it; everything else is a plain material.
      const c = consumableDef(id)
      out.push(c
        ? { id, name: c.name, quantity: qty, kind: 'consumable' }
        : { id, name: id === 'm-gold' ? 'Gold' : (DROP_ITEMS[id] ?? id), quantity: qty })
    }
  }
  return out
}

// §consumables: max distinct stacks a hero's pack can hold.
export const PACK_SLOTS = 20

// §consumables: a use rule's HP threshold, kept in (0, 1).
const clampThreshold = (t: number): number => Math.min(0.95, Math.max(0.05, t))

// §consumables: fold the engine's live carried counts (mirrored each tick) back
// into the hero's authoritative PackItem[], preserving carry `target`s and any
// entry the engine didn't report (e.g. an item drained to 0, which the adapter
// stops seeding). Items the engine never carried keep their stored count.
function syncPackCounts(pack: PackItem[] | undefined, counts: Record<string, number>): PackItem[] {
  return (pack ?? []).map((p) => (p.itemId in counts ? { ...p, count: counts[p.itemId] } : { ...p }))
}

// §consumables: in-town reconcile. For each carry intent with a `target`, bring the
// carried count to *exactly* the target — withdraw the shortfall from the shared
// stash (limited by stock), OR deposit the excess back (always succeeds). Mutates
// `stashAvail` so heroes don't double-spend the same stock, and records the net
// movement into `stashDraw` (negative = drawn out, positive = deposited) to fold
// into miscItems. Entries with no explicit target are left untouched. Stash-only
// for now; merchant buying is deferred (see BACKLOG).
export function reconcilePackInTown(
  pack: PackItem[] | undefined,
  stashAvail: Record<string, number>,
  stashDraw: Record<string, number>,
): PackItem[] {
  return (pack ?? []).map((p) => {
    if (p.target == null || p.count === p.target) return { ...p }
    if (p.count < p.target) {
      const take = Math.min(p.target - p.count, stashAvail[p.itemId] ?? 0)
      if (take <= 0) return { ...p }
      stashAvail[p.itemId] -= take
      stashDraw[p.itemId] = (stashDraw[p.itemId] ?? 0) - take
      return { ...p, count: p.count + take }
    }
    // Over target — deposit the surplus back to the stash.
    const give = p.count - p.target
    stashAvail[p.itemId] = (stashAvail[p.itemId] ?? 0) + give
    stashDraw[p.itemId] = (stashDraw[p.itemId] ?? 0) + give
    return { ...p, count: p.target }
  })
}

// Fold this tick's per-unit stat deltas into the persistent lifetime tally.
function foldUnitStats(
  prev: Record<string, UnitCombatStats>,
  delta: Record<string, CombatTally>,
): Record<string, UnitCombatStats> {
  const ids = Object.keys(delta)
  if (ids.length === 0) return prev
  const out = { ...prev }
  for (const id of ids) {
    const c = addInto2(out[id], delta[id])
    out[id] = c
  }
  return out
}

// prev (possibly undefined / old shape) + delta → a fresh full tally.
function addInto2(prev: UnitCombatStats | undefined, delta: CombatTally): CombatTally {
  const out = emptyTally()
  if (prev) addInto(out, prev)
  addInto(out, delta)
  return out
}

// Route each unit's tick delta into its current location's per-hero breakdown
// (`locationStats[loc].byUnit`). A unit fights at exactly one location, so its
// whole delta belongs there. Returns a new locationStats with byUnit merged in.
// Creates the location's stats entry if combat started here before any kill, so
// the breakdown captures the whole fight (not just post-first-kill damage).
function foldLocationByUnit(
  locationStats: Record<string, LocationCombatStats>,
  delta: Record<string, CombatTally>,
  locationOf: Map<string, string | null>,
  tick: number,
): Record<string, LocationCombatStats> {
  let out = locationStats
  for (const [unitId, d] of Object.entries(delta)) {
    const locId = locationOf.get(unitId)
    if (!locId) continue
    if (out === locationStats) out = { ...locationStats }
    const loc = out[locId] ?? { startTick: tick, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
    const byUnit = { ...(loc.byUnit ?? {}) }
    byUnit[unitId] = addInto2(byUnit[unitId], d)
    out[locId] = { ...loc, byUnit }
  }
  return out
}

interface CombatStep {
  battles: Record<string, BattleState>
  battleCooldown: Record<string, number>
  monsterSpawnTimers: Record<string, number>   // open-world: locationId → ticks until next monster trickles in
  hpByUnit: Record<string, number>    // unitId → live HP for units in an active battle
  packByUnit: Record<string, Record<string, number>>  // §consumables: unitId → live carried counts (mirrored back from the engine)
  koUnitIds: Set<string>              // player units that died this tick
  expByUnit: Record<string, number>
  goldEarned: number
  lootDelta: Record<string, number>   // miscItemId → qty gained
  questDropDelta: Record<string, number>  // quest-item id → quest items collected this tick
  monsterDefeated: Record<string, number>
  monsterSeen: Record<string, number>
  locationMonstersSeen: Record<string, string[]>
  locationStats: Record<string, LocationCombatStats>
  unitStatsDelta: Record<string, CombatTally>   // unitId → lifetime-stat deltas this tick
  travelMoves: Record<string, { locationId: string; travelPath: string[] | null }>  // §travel: heroes who crossed a portal this tick
  arrivals: Record<string, { at: [number, number] | null; backTo: string; until: number }>  // §travel: portal landing + grace, set on cross
  logs: { category: LogCategory; message: string }[]
}

// Runs/advances one engine battle per eligible location. Pure-ish: it mutates
// fresh copies of the runtime combat state and returns the deltas the tick
// reducer folds into units/inventory. `advance` gates the once-per-N-ticks round.
function advanceBattles(s: GameState, newTicks: number, advance: boolean): CombatStep {
  const battles        = { ...s.battles }
  const battleCooldown = { ...s.battleCooldown }
  const monsterSpawnTimers   = { ...s.monsterSpawnTimers }
  const monsterDefeated      = { ...s.monsterDefeated }
  const monsterSeen          = { ...s.monsterSeen }
  const locationMonstersSeen = { ...s.locationMonstersSeen }
  const locationStats        = { ...s.locationStats }
  const unitLevel = new Map(s.units.map((u) => [u.id, u.level]))  // for level-weighted XP split
  const hpByUnit: Record<string, number> = {}
  const packByUnit: Record<string, Record<string, number>> = {}
  const koUnitIds = new Set<string>()
  const expByUnit: Record<string, number> = {}
  const lootDelta: Record<string, number> = {}
  const questDropDelta: Record<string, number> = {}
  let goldEarned = 0
  const travelMoves: Record<string, { locationId: string; travelPath: string[] | null }> = {}
  const arrivals: CombatStep['arrivals'] = {}
  const logs: { category: LogCategory; message: string }[] = []

  // Per-unit lifetime-stat deltas accumulated this tick (Report panel + analytics).
  const unitStatsDelta: Record<string, CombatTally> = {}
  const bumpUnit = (id: string, field: 'monstersDefeated' | 'itemsFound' | 'combatTicks', n: number) => {
    const cur = unitStatsDelta[id] ?? (unitStatsDelta[id] = emptyTally())
    cur[field] += n
  }
  // Fold the round's hit/heal/dodge events into the rich per-unit tally (damage
  // dealt/taken, hits/misses/dodges, healing, and the element + effectiveness
  // breakdowns). Kills/items/ticks are credited separately via bumpUnit.
  const recordDamage = (battle: BattleState) => {
    // Real heroes only — summons/companions (ownerId set) aren't tracked in the
    // per-hero analytics, and their ids aren't game units.
    const playerIds = new Set(battle.combatants.filter((c) => c.team === 'player' && c.ownerId == null).map((c) => c.id))
    foldRoundEvents(unitStatsDelta, battle.events, battle.round, playerIds)
  }

  // ── Shared per-battle bookkeeping (used by both the encounter and open paths) ─

  // Count each given monster id as sighted, both globally and at this location.
  const markSeen = (loc: Location, monsterIds: string[]) => {
    const seen = [...(locationMonstersSeen[loc.id] ?? [])]
    let changed = false
    for (const mid of monsterIds) {
      monsterSeen[mid] = (monsterSeen[mid] ?? 0) + 1
      if (!seen.includes(mid)) { seen.push(mid); changed = true }
    }
    if (changed) locationMonstersSeen[loc.id] = seen
  }
  const enemyMonsterIds = (battle: BattleState) =>
    battle.combatants.filter((c) => c.team === 'enemy').map((c) => monsterIdOf(c.id))

  // Award exp/gold/loot for every enemy that died this round (was alive before).
  const rewardKills = (loc: Location, battle: BattleState, enemiesBefore: Set<string>) => {
    // Who landed the killing blow on each enemy this round (for per-unit credit).
    // Only real heroes earn credit/XP — a minion's kill counts for the location
    // tally but isn't credited to a (non-existent) unit or fed the XP split.
    const playerIds = new Set(battle.combatants.filter((c) => c.team === 'player' && c.ownerId == null).map((c) => c.id))
    const killerByEnemy: Record<string, string> = {}
    for (const e of battle.events) {
      if (e.round === battle.round && e.type === 'unit_death' && e.targetId) killerByEnemy[e.targetId] = e.sourceId
    }
    let killsThisRound = 0
    for (const c of battle.combatants) {
      if (c.team !== 'enemy' || c.alive || !enemiesBefore.has(c.id)) continue
      killsThisRound++
      const mid = monsterIdOf(c.id)
      monsterDefeated[mid] = (monsterDefeated[mid] ?? 0) + 1
      goldEarned++
      const killer = killerByEnemy[c.id]
      const credited = killer && playerIds.has(killer) ? killer : null
      if (credited) {
        bumpUnit(credited, 'monstersDefeated', 1)
        const cur = unitStatsDelta[credited]!   // bumpUnit just created/fetched it
        cur.killsByMonster[mid] = (cur.killsByMonster[mid] ?? 0) + 1   // per-type, for cull quests
      }
      // Quest-item drops: any active collect rule for this monster rolls a drop
      // into its quest item. Hero-scoped rules only fire while their hero is
      // deployed at this location.
      for (const rule of s.questDropRules) {
        if (rule.monsterId !== mid) continue
        const already = (s.questItems[rule.itemId] ?? 0) + (questDropDelta[rule.itemId] ?? 0)
        if (already >= rule.target) continue
        if (rule.scope === 'hero' && s.units.find((u) => u.id === rule.heroId)?.locationId !== loc.id) continue
        if (Math.random() < rule.dropRate) questDropDelta[rule.itemId] = (questDropDelta[rule.itemId] ?? 0) + 1
      }
      const def = MONSTER_REGISTRY[mid]
      const prev = locationStats[loc.id] ?? { startTick: newTicks, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
      const itemsDropped = { ...prev.itemsDropped }
      if (def) {
        for (const d of def.drops) {
          if (Math.random() < d.dropRate) {
            const qty = d.quantityMin + Math.floor(Math.random() * (d.quantityMax - d.quantityMin + 1))
            lootDelta[d.itemId]    = (lootDelta[d.itemId] ?? 0) + qty
            itemsDropped[d.itemId] = (itemsDropped[d.itemId] ?? 0) + qty
            if (credited) bumpUnit(credited, 'itemsFound', qty)
          }
        }
      }
      locationStats[loc.id] = {
        ...prev,
        monstersDefeated: { ...prev.monstersDefeated, [mid]: (prev.monstersDefeated[mid] ?? 0) + 1 },
        itemsDropped,
        expDistributed: prev.expDistributed + 1,
        goldEarned:     prev.goldEarned + 1,
      }
    }
    if (killsThisRound > 0) {
      // Each kill yields 1 XP into a pool shared by the surviving party and split
      // proportional to level (a low-level hero in a high-level party earns only
      // its tiny level-share — anti-power-leveling). Pool = killsThisRound.
      const members = battle.combatants
        .filter((c) => c.team === 'player' && c.alive && c.ownerId == null)
        .map((c) => ({ id: c.id, level: unitLevel.get(c.id) ?? 1 }))
      const shares = splitExpByLevel(killsThisRound, members)
      for (const [id, amt] of Object.entries(shares)) expByUnit[id] = (expByUnit[id] ?? 0) + amt
    }
  }

  // Flag player units that died in this round's events (→ store sets recovery).
  const detectDeaths = (battle: BattleState) => {
    for (const e of battle.events) {
      if (e.round !== battle.round || e.type !== 'unit_death' || !e.targetId) continue
      const dead = battle.combatants.find((c) => c.id === e.targetId)
      if (dead && dead.team === 'player' && dead.ownerId == null) koUnitIds.add(dead.id)
    }
  }

  // Drop dead enemy combatants from a persistent (open) battle so the list
  // doesn't grow without bound. Locks pointing at them were already cleared on
  // death; this just reclaims the corpses.
  const pruneDeadEnemies = (battle: BattleState) => {
    const before = battle.combatants.length
    battle.combatants = battle.combatants.filter((c) => !(c.team === 'enemy' && !c.alive))
    return battle.combatants.length !== before
  }

  // Sync living player HP back to the game units every tick (engine is authoritative).
  const syncHp = (battle: BattleState) => {
    for (const c of battle.combatants) {
      if (c.team === 'player' && c.alive && c.ownerId == null) {   // real heroes only (not minions)
        hpByUnit[c.id] = c.hp
        packByUnit[c.id] = c.pack   // §consumables: mirror live carried counts back to Unit.pack
        bumpUnit(c.id, 'combatTicks', 1)   // fighting time = the rate denominator
      }
    }
  }

  // Which location (if any) the player is actively watching — its battle drop-in is
  // on screen. Only that one runs the full per-tick spatial sim; the rest advance
  // off-screen via cheap rate-extrapolation. In world mode (and tests) there's no
  // watched battle, so this is null and every location full-sims as before.
  const watchedId = s.mapMode === 'battle' && s.combatLocationId && s.locations.some((l) => l.id === s.combatLocationId)
    ? s.combatLocationId : null

  // Credit one off-screen interval's rewards by extrapolating the location's realized
  // rate — no spatial sim. A never-sampled (cold) location runs one budgeted prime
  // to seed a rate (and keeps the primed battle for when the player drops back in),
  // then extrapolates. Mirrors the offline warm/cold crediting. (Off-screen parties
  // earn but don't take casualties — a known simplification; deaths resume on drop-in.)
  const creditOffscreen = (loc: Location, eligible: Unit[]) => {
    const ticks = SAMPLING.offscreenCreditTicks
    const stats = locationStats[loc.id]
    let killsByMonster: Record<string, number>
    let exp: number, gold: number
    if (stats) {
      const p = projectOfflineRewards(getLocationCombatReport(stats, newTicks), ticks)
      killsByMonster = p.killsByMonster; exp = p.exp; gold = p.gold
    } else {
      const r = primeColdLocation(loc, eligible, s.equipment, s.partyTactics ?? [], battles[loc.id])
      battles[loc.id] = r.battle
      const scale = ticks / Math.max(1, r.primedTicks)
      killsByMonster = scaleKills(r.killsByMonster, scale)
      exp = Math.floor(r.exp * scale); gold = Math.floor(r.gold * scale)
    }
    const kills = Object.values(killsByMonster).reduce((a, b) => a + b, 0)
    if (kills === 0 && exp === 0 && gold === 0) return
    const loot = rollOfflineLoot(killsByMonster)
    const members = eligible.map((u) => ({ id: u.id, level: unitLevel.get(u.id) ?? 1 }))
    for (const [id, amt] of Object.entries(splitExpByLevel(exp, members))) expByUnit[id] = (expByUnit[id] ?? 0) + amt
    goldEarned += gold
    for (const [id, q] of Object.entries(loot)) lootDelta[id] = (lootDelta[id] ?? 0) + q
    for (const [mid, k] of Object.entries(killsByMonster)) monsterDefeated[mid] = (monsterDefeated[mid] ?? 0) + k
    // Advance the persisted stats so the rate stays coherent for the next interval.
    const prev = locationStats[loc.id] ?? { startTick: newTicks, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
    const nextDefeated = { ...prev.monstersDefeated }
    for (const [mid, k] of Object.entries(killsByMonster)) nextDefeated[mid] = (nextDefeated[mid] ?? 0) + k
    const nextDropped = { ...prev.itemsDropped }
    for (const [id, q] of Object.entries(loot)) nextDropped[id] = (nextDropped[id] ?? 0) + q
    locationStats[loc.id] = {
      startTick: prev.startTick, monstersDefeated: nextDefeated, itemsDropped: nextDropped,
      expDistributed: prev.expDistributed + exp, goldEarned: prev.goldEarned + gold,
    }
  }

  // §travel: walk a routing hero (non-empty travelPath) to the portal leading to
  // their next node and hop them across. Records the crossing in travelMoves (the
  // tick reducer flips locationId + shifts travelPath). On a watched/simulated map
  // the hero physically walks to the portal (issueMoveOrder) and crosses on
  // arrival; off-screen they cross at once (nothing's rendered, so there's nothing
  // to walk). Portals are store-only — the engine never sees them, so snapshots /
  // replays are unaffected.
  const handleTravel = (loc: Location, battle: BattleState | null, eligible: Unit[], simulated: boolean) => {
    for (const u of eligible) {
      const path = u.travelPath
      if (!path || path.length === 0) continue
      const dest = path[0]
      // §portal grace: don't let the portal we JUST used pull us straight back. If
      // the next hop is back where we came from and we're still in the grace window,
      // hold here for now (a future cyclic route then completes after the grace).
      const grace = s.portalArrivals[u.id]
      if (grace && dest === grace.backTo && newTicks < grace.until) continue
      const portal = (loc.portals ?? []).find((p) => p.to === dest)
      if (!portal) {
        // No portal from here to the next node — can't route off this map. Drop the
        // path so the hero hunts where they are rather than freezing forever.
        travelMoves[u.id] = { locationId: loc.id, travelPath: null }
        continue
      }
      // Land at the partner-edge portal on the destination (east→west etc.), falling
      // back to the party anchor when a portal has no wired exit; and start the grace
      // so the reverse edge can't bounce us back this instant.
      const cross = () => {
        travelMoves[u.id] = { locationId: dest, travelPath: path.length > 1 ? path.slice(1) : null }
        arrivals[u.id] = { at: portal.toAt ?? null, backTo: loc.id, until: newTicks + PORTAL_GRACE_TICKS }
      }
      const c = battle?.combatants.find((x) => x.id === u.id) ?? null
      if (!simulated || !c) { cross(); continue }
      if (Math.hypot(c.pos.x - portal.at[0], c.pos.y - portal.at[1]) <= PORTAL_RADIUS) cross()
      else {
        // §travel-defend: react to hostiles en route per the hero's Logistics
        // preference (default 'retaliate'). 'ignore' → march straight through.
        const te = u.travelEngage ?? 'retaliate'
        issueMoveOrder(battle!, u.id, { x: portal.at[0], y: portal.at[1] }, te === 'ignore' ? 'off' : te)
      }
    }
  }

  for (const loc of s.locations) {
    const locationId = loc.id
    const eligible = s.units.filter(
      (u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting,
    )

    // No party → tear down any stale battle/cooldown for this loc. A monster-less
    // location also tears down UNLESS it's an open-world city: there heroes wander
    // a peaceful field (and cross paths with its NPCs) even with nothing to fight.
    if (eligible.length === 0 || (loc.monsterIds.length === 0 && !loc.openWorld)) {
      if (battles[locationId]) delete battles[locationId]
      if (battleCooldown[locationId]) delete battleCooldown[locationId]
      if (monsterSpawnTimers[locationId]) delete monsterSpawnTimers[locationId]
      continue
    }

    // Off-screen (player is watching a different battle): skip the full spatial sim,
    // credit rate-extrapolated rewards on a throttle, keep the (frozen) battle for
    // drop-in. Falls through to the full sim when nothing is watched.
    if (watchedId !== null && locationId !== watchedId) {
      if (newTicks % SAMPLING.offscreenCreditTicks === 0) creditOffscreen(loc, eligible)
      for (const u of eligible) bumpUnit(u.id, 'combatTicks', 1)
      handleTravel(loc, battles[locationId] ?? null, eligible, false)   // §travel: cross off-screen at once
      continue
    }

    // ── Open-world: one persistent battle; monsters trickle in over time and
    // heroes join / leave it as they deploy or recover. Never self-terminates.
    if (loc.openWorld) {
      const cap = openWorldCap(loc)
      let battle = battles[locationId]
      // Recreate when there's no open battle OR its timeScale no longer matches the
      // field's pace tier (a save from before the tier change, or an edited cap) — so
      // the live pace + per-round cost are right. timeScale can't be swapped on a live
      // battle (it would desync in-flight cooldowns), hence a fresh field.
      if (!battle || battle.mode !== 'open' || battle.timeScale !== timeScaleFor(loc)) {
        battle = createOpenBattleFor(loc, eligible, s.equipment, s.partyTactics ?? [], cap, s.portalArrivals)
        battles[locationId] = battle
        monsterSpawnTimers[locationId] = OPEN_WORLD_SPAWN_TICKS
        markSeen(loc, enemyMonsterIds(battle))
      }
      // §town wander: peaceful is a property of the location (a city), not the
      // snapshot — re-apply it here so a reloaded city battle (deserialized with
      // peaceful=false) still has its heroes mill about individually.
      battle.peaceful = loc.traits.includes('city')
      // Field the right heroes (fresh deploys, KO removals, recovery returnees).
      if (reconcileOpenPlayers(battle, eligible, s.equipment, s.partyTactics ?? [], s.portalArrivals)) {
        battles[locationId] = { ...battle }
      }
      // Live-edit: push any loadout changes onto the heroes already fighting.
      syncPlayerLoadouts(battle, eligible, s.equipment, s.partyTactics ?? [])
      // §travel: routing heroes walk to their portal and cross on arrival.
      handleTravel(loc, battle, eligible, true)

      // Step cadence: paired to the battle's timeScale (product = ROUND_TIME_SCALE) so a
      // denser field runs fewer, coarser rounds at the SAME real-time pace. Spawn trickle
      // and hero reconcile still run every tick above — only the costly round is paced.
      const everyTicks = everyTicksFor(battle.timeScale)
      if (advance && newTicks % everyTicks === 0) {
        // Clear out enemy corpses from prior rounds before this one resolves —
        // a persistent battle never resets, so without this the combatant list
        // (and the viewer's ✕ chips) would grow without bound. They've already
        // been rewarded; killed-this-round enemies stay until the next advance
        // so their death still animates.
        pruneDeadEnemies(battle)
        const enemiesBefore = new Set(
          battle.combatants.filter((c) => c.team === 'enemy' && c.alive).map((c) => c.id),
        )
        advanceRound(battle)
        battles[locationId] = { ...battle }
        rewardKills(loc, battle, enemiesBefore)
        recordDamage(battle)
        detectDeaths(battle)
      }

      // Respawn trickle (every tick, independent of the round cadence): while the
      // field is below the cap, count down a fixed timer and add one monster when
      // it hits zero. At cap the timer is held full so the next vacancy waits a
      // whole interval — monsters dribble back in rather than refilling at once.
      const living = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length
      if (living < cap) {
        let timer = Math.max(0, (monsterSpawnTimers[locationId] ?? OPEN_WORLD_SPAWN_TICKS) - 1)
        if (timer === 0) {
          const mid = spawnMonsterInto(battle, loc, openWorldSize(loc))
          if (mid) {
            battles[locationId] = { ...battle }
            markSeen(loc, [mid])
          }
          timer = OPEN_WORLD_SPAWN_TICKS
        }
        monsterSpawnTimers[locationId] = timer
      } else {
        monsterSpawnTimers[locationId] = OPEN_WORLD_SPAWN_TICKS
      }

      syncHp(battle)
      continue
    }

    // ── Discrete encounter (the original wave model; kept for testing) ─────────
    let battle = battles[locationId]

    // Between waves: count down the respawn timer, then start a fresh battle.
    if (!battle || battle.outcome !== 'ongoing') {
      const cd = battleCooldown[locationId] ?? 0
      if (battle && battle.outcome !== 'ongoing') {
        // Keep the finished battle visible during cooldown, then replace it.
        if (cd > 0) { battleCooldown[locationId] = cd - 1; continue }
      } else if (cd > 0) {
        battleCooldown[locationId] = cd - 1
        continue
      }
      battle = createBattleFor(loc, eligible, s.equipment, s.partyTactics ?? [])
      battles[locationId] = battle
      delete battleCooldown[locationId]
      markSeen(loc, enemyMonsterIds(battle))
    }

    // Live-edit: push any loadout changes onto the heroes already in the wave.
    syncPlayerLoadouts(battle, eligible, s.equipment, s.partyTactics ?? [])

    // Advance one round on the cadence and reward kills.
    if (advance && battle.outcome === 'ongoing') {
      const enemiesBefore = new Set(
        battle.combatants.filter((c) => c.team === 'enemy' && c.alive).map((c) => c.id),
      )
      advanceRound(battle)
      battles[locationId] = { ...battle }   // new identity so React re-renders
      rewardKills(loc, battle, enemiesBefore)
      recordDamage(battle)
      detectDeaths(battle)
      if (battle.outcome !== 'ongoing') {
        battleCooldown[locationId] = BATTLE_RESPAWN_TICKS
        logs.push({ category: battle.outcome === 'victory' ? 'victory' : 'defeat', message: `${loc.name}: ${battle.outcome}` })
      }
    }

    syncHp(battle)
  }

  // Credit this tick's XP into the per-unit tally (a hero fights at one location,
  // so its whole share belongs to that location's breakdown too). levelsGained is
  // folded in the reducer, where the level-up pass runs.
  for (const [id, amt] of Object.entries(expByUnit)) {
    (unitStatsDelta[id] ?? (unitStatsDelta[id] = emptyTally())).expGained += amt
  }

  return {
    battles, battleCooldown, monsterSpawnTimers, hpByUnit, packByUnit, koUnitIds, expByUnit, goldEarned, lootDelta,
    questDropDelta, monsterDefeated, monsterSeen, locationMonstersSeen, locationStats, unitStatsDelta, travelMoves, arrivals, logs,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

// The fresh-start state slice for a mode. Sandbox = the full toy box (every hero,
// the starter recipes, generous familiarity). Curated = a single Novice with a
// slim seed; everything else unfolds through play. Used by both the initial store
// state and resetSave so the two can't drift.
function freshGameSeed(mode: ProgressionMode) {
  if (mode === 'curated') return {
    units:                curatedStartUnits(),
    learnedRecipes:       [...CURATED_START.recipes],
    locationFamiliarity:  { ...CURATED_START.locationFamiliarity },
    locationMonstersSeen: Object.fromEntries(Object.entries(CURATED_START.locationMonstersSeen).map(([k, v]) => [k, [...v]])),
    monsterSeen:          { ...CURATED_START.monsterSeen },
  }
  return {
    units:                INITIAL_UNITS,
    learnedRecipes:       ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
    locationFamiliarity:  { 'geffen-city': 100, 'prontera-city': 80, 'beach-1': 60 },
    locationMonstersSeen: { 'geffen-city': ['slime'], 'prontera-city': ['slime'], 'beach-1': ['rock-crab'] },
    monsterSeen:          { slime: 15, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
  }
}

// Brand-new-game mode (a persisted save's worldCodec overrides this on load) and
// its matching seed.
const BOOT_MODE = bootstrapProgressionMode()
const BOOT_SEED = freshGameSeed(BOOT_MODE)

export const useGameStore = create<GameState>((set) => ({
  units:    BOOT_SEED.units,
  progressionMode: BOOT_MODE,
  locations: INITIAL_LOCATIONS,
  equipment: INITIAL_EQUIPMENT,
  miscItems: INITIAL_MISC,
  activeTab: 'map',
  selectedUnitIds: [],
  selectedLocationId: null,
  combatLocationId: null,
  mapMode: 'world',
  mapPageId: 'world',
  deployMode: 'instant',
  battleSkin: bootBattleSkin(),
  mapFocusNonce: 0,
  battleFocus: null,
  battleFollowId: null,
  expandedLocationIds:       (() => { try { return JSON.parse(localStorage.getItem('expandedLocationIds')       ?? '[]') } catch { return [] } })(),
  expandedUnitIds:           (() => { try { return JSON.parse(localStorage.getItem('expandedUnitIds')           ?? '[]') } catch { return [] } })(),
  expandedInventorySections: (() => { try { return JSON.parse(localStorage.getItem('expandedInventorySections') ?? '["equipment","misc","crafting"]') } catch { return ['equipment', 'misc', 'crafting'] } })(),
  expandedRegionIds:         (() => { try { return JSON.parse(localStorage.getItem('expandedRegionIds')         ?? '["world","geffen-dungeon"]') } catch { return ['world', 'geffen-dungeon'] } })(),
  equipContext: null,
  learnedRecipes: BOOT_SEED.learnedRecipes,
  locationFamiliarity:  BOOT_SEED.locationFamiliarity,
  locationMonstersSeen: BOOT_SEED.locationMonstersSeen,
  monsterSeen:          BOOT_SEED.monsterSeen,
  ticks: 0,
  monsterDefeated: {},
  locationStats: {},
  unitStats: {},
  unitStatHistory: {},
  dpsWindow: {},
  viewedUnitLevels: (() => { try { return JSON.parse(localStorage.getItem('viewedUnitLevels') ?? '{}') } catch { return {} } })(),
  reportUnitId: null,
  partyTactics: [{ id: 'finish-them', rank: 1 }],
  lastTickAt: Date.now(),
  offlineSummary: null,
  lastCatchUp: null,
  questDropRules: [],
  questItems: {},
  paused: false,
  eventLog: [],
  itemSockets: {},
  battles: {},
  battleCooldown: {},
  monsterSpawnTimers: {},
  portalArrivals: {},

  tick: () => set((s) => {
    const newTicks    = s.ticks + 1
    const yearChanged = Math.floor(newTicks / TICKS_PER_YEAR) > Math.floor(s.ticks / TICKS_PER_YEAR)
    let newLog = s.eventLog

    // Drive the engine: one round per ROUND_EVERY_TICKS ticks, live per location.
    const combat = advanceBattles(s, newTicks, newTicks % ROUND_EVERY_TICKS === 0)
    for (const l of combat.logs) newLog = appendLog(newLog, l.category, l.message, newTicks)

    // Where each unit fought this tick (1:1) — routes its tally delta into the
    // location's per-hero breakdown.
    const locationOf = new Map(s.units.map((u) => [u.id, u.locationId]))

    // §consumables: in-town pack auto-fill. Track stash stock once, drawn down as
    // heroes refill (so two heroes in town don't both claim the same potions); the
    // net withdrawal is folded into miscItems below.
    const cityLocs = new Set(s.locations.filter((l) => l.traits.includes('city')).map((l) => l.id))
    const stashAvail: Record<string, number> = {}
    for (const m of s.miscItems) stashAvail[m.id] = m.quantity
    const stashDraw: Record<string, number> = {}

    const units = s.units.map((u) => {
      let health = u.health
      let recoveryTicksLeft = Math.max(0, Math.round(u.recoveryTicksLeft ?? 0))
      let isResting = u.isResting || (health === 0 && recoveryTicksLeft === 0)
      const maxHp = getDerivedStats(u, s.equipment).maxHp

      if (recoveryTicksLeft > 0) {
        // KO phase: count down, no regen; transition to resting when done
        recoveryTicksLeft--
        if (recoveryTicksLeft === 0) isResting = true
      } else if (combat.koUnitIds.has(u.id)) {
        // Died in battle this tick
        health = 0
        recoveryTicksLeft = RECOVERY_TICKS
        isResting = false
        newLog = appendLog(newLog, 'ko', `${u.name} was KO'd`, newTicks)
      } else if (u.id in combat.hpByUnit) {
        // Live in an active battle: engine HP is authoritative
        health = Math.max(0, Math.floor(combat.hpByUnit[u.id]))
      } else if (isResting) {
        health = Math.min(maxHp, health + RESTING_REGEN_RATE)
        if (health >= maxHp) isResting = false
      } else if (health > 0 && !u.locationId) {
        // Idle regen for unassigned units only
        health = Math.min(maxHp, health + REGEN_RATE)
      }

      // §consumables: in a city the STORE owns the pack. A town hero isn't fighting,
      // so the engine combatant's carried counts are stale (the in-town reconcile
      // updates Unit.pack, not the engine) — mirroring them back wiped the reconcile
      // EVERY tick, so the reconcile re-withdrew, the mirror wiped it again (losing the
      // potions without returning them to the stash), and the driver re-bought to
      // refill: a buy→wipe loop that burned all the gold. So skip the mirror in town
      // and let the reconcile be authoritative; the engine re-seeds from Unit.pack on
      // the next deploy. Elsewhere (a live fight) the engine stays authoritative.
      const inCity = !!u.locationId && cityLocs.has(u.locationId)
      let pack = (!inCity && u.id in combat.packByUnit) ? syncPackCounts(u.pack, combat.packByUnit[u.id]) : u.pack
      if (inCity && (pack?.length ?? 0) > 0) {
        pack = reconcilePackInTown(pack, stashAvail, stashDraw)
      }

      const aged   = yearChanged ? { age: u.age + 1 } : {}
      const expAdd = combat.expByUnit[u.id] ?? 0
      const withExp = { ...u, health, recoveryTicksLeft, isResting, ...aged, exp: u.exp + expAdd, ...(pack !== u.pack ? { pack } : {}) }
      const { unit: leveled, log: nextLog } = applyLevelUps(withExp, newTicks, newLog)
      newLog = nextLog
      // Record any level-ups into the unit's tally delta for this tick.
      const gained = leveled.level - u.level
      if (gained > 0) (combat.unitStatsDelta[u.id] ?? (combat.unitStatsDelta[u.id] = emptyTally())).levelsGained += gained
      // §travel: a hero who crossed a portal this tick moves to the destination map.
      const tm = combat.travelMoves[u.id]
      return tm ? { ...leveled, locationId: tm.locationId, travelPath: tm.travelPath } : leveled
    })

    // §consumables: stashDraw is negative (potions withdrawn into packs in town).
    const miscDeltas = { 'm-gold': combat.goldEarned, ...combat.lootDelta, ...stashDraw }
    const miscItems = (combat.goldEarned > 0 || Object.keys(combat.lootDelta).length > 0 || Object.keys(stashDraw).length > 0)
      ? applyMiscDeltas(s.miscItems, miscDeltas).filter((m) => m.quantity > 0 || !(m.id in stashDraw))
      : s.miscItems

    // Fold quest-item drops into the ledger (kept out of miscItems on purpose).
    const questItems = Object.keys(combat.questDropDelta).length > 0
      ? { ...s.questItems }
      : s.questItems
    for (const [id, n] of Object.entries(combat.questDropDelta)) questItems[id] = (questItems[id] ?? 0) + n

    // §travel: roll the per-hero portal landing/grace forward. New crossings this
    // tick are merged in; an entry's `at` (drop-in spot) is consumed once the hero is
    // fielded in its battle (live combatant, not crossing again), keeping only the
    // grace window; the whole entry drops once the grace expires.
    const portalArrivals: GameState['portalArrivals'] = { ...s.portalArrivals, ...combat.arrivals }
    for (const id of Object.keys(portalArrivals)) {
      const e = portalArrivals[id]
      if (newTicks >= e.until) { delete portalArrivals[id]; continue }
      if (e.at && (id in combat.hpByUnit) && !combat.travelMoves[id]) portalArrivals[id] = { ...e, at: null }
    }

    // §hero stats: slide the 5s damage ring for every unit (drop idle all-zero ones).
    const dpsWindow: Record<string, { dealt: number[]; taken: number[] }> = {}
    for (const u of s.units) {
      const d = combat.unitStatsDelta[u.id]
      const prev = s.dpsWindow?.[u.id]
      const dealt = [...(prev?.dealt ?? []), d?.damageDealt ?? 0].slice(-DPS_WINDOW_TICKS)
      const taken = [...(prev?.taken ?? []), d?.damageTaken ?? 0].slice(-DPS_WINDOW_TICKS)
      if (dealt.some((x) => x > 0) || taken.some((x) => x > 0)) dpsWindow[u.id] = { dealt, taken }
    }

    // §travel: keep a followed hero on-camera as they cross maps. Move the watched
    // battle AND the proto camera (selectedLocationId — what the stage renders) WITH
    // them the instant they hop a portal (same state update), so the camera can't lag
    // a map behind, and the destination sims live for them next tick instead of
    // instant-crossing them off-screen ahead of the camera.
    const followCross = s.battleFollowId ? combat.travelMoves[s.battleFollowId] : undefined

    return {
      ticks: newTicks,
      units,
      ...(followCross ? { combatLocationId: followCross.locationId, selectedLocationId: followCross.locationId } : {}),
      dpsWindow,
      battles: combat.battles,
      battleCooldown: combat.battleCooldown,
      monsterSpawnTimers: combat.monsterSpawnTimers,
      portalArrivals,
      monsterDefeated: combat.monsterDefeated,
      questItems,
      monsterSeen: combat.monsterSeen,
      locationMonstersSeen: combat.locationMonstersSeen,
      locationStats: foldLocationByUnit(combat.locationStats, combat.unitStatsDelta, locationOf, newTicks),
      unitStats: foldUnitStats(s.unitStats, combat.unitStatsDelta),
      unitStatHistory: foldHistory(s.unitStatHistory, combat.unitStatsDelta, newTicks),
      miscItems,
      // Advance the tick clock by a FIXED step (one TICK_MS), NOT Date.now().
      // Snapping to wall time after the reducer ran left lastTickAt tens of ms past
      // the tick boundary, so the next catchUp floored (now - lastTickAt) / TICK_MS
      // to n=0 and dropped every other tick → rounds applied at ~2× the interval,
      // irregularly (the fast-slow). A fixed step preserves the sub-tick remainder
      // and keeps the cadence phase-aligned; catchUp's floor keeps lastTickAt within
      // a tick of now, so a genuinely slow frame still catches up (n=2) without
      // runaway drift. Bulk offline catch-up (batchTick) still resyncs to Date.now().
      lastTickAt: s.lastTickAt + 1000 / TICKS_PER_SECOND,
      eventLog: newLog,
    }
  }),

  batchTick: (n) => set((s) => {
    if (n <= 0) return s

    const newTicks    = s.ticks + n
    const yearsPassed = Math.floor(newTicks / TICKS_PER_YEAR) - Math.floor(s.ticks / TICKS_PER_YEAR)

    // ── Sampled offline progression ("Warm Catch-up") ─────────────────────────
    // batchTick doesn't re-simulate combat (a naive fast-forward janks). Instead
    // it extrapolates each deployed location's realized reward rate over the
    // offline span: WARM locations (with a `locationStats` sample) scale their
    // rate directly; COLD ones (deployed but never sampled) get a budgeted
    // priming sim first to seed a rate. exp/gold/kills are deterministic; loot is
    // rolled per projected kill so rare drops aren't lost to the floor. exp is a
    // POOL split among the deployed group by level (anti-power-leveling), matching
    // the live path.
    const expByUnit:       Record<string, number> = {}
    const lootDelta:       Record<string, number> = {}
    const monsterDefeated = { ...s.monsterDefeated }
    const locationStats   = { ...s.locationStats }
    const battles         = { ...s.battles }
    const rewards: OfflineLocationReward[] = []
    const catchUpDebug: CatchUpLocation[] = []   // per-location sim cost/output (debug)
    const catchUpStart = Date.now()
    let totalGold = 0
    // Per-hero rich breakdown accumulated across the away span → folded into the
    // lifetime stats + rolling history at the end. Only harvested for real
    // absences (≥ the summary gate) so sub-minute background blips stay cheap.
    const detailByUnit: Record<string, CombatTally> = {}
    const wantBreakdown = Math.round(n / TICKS_PER_SECOND) >= OFFLINE_SUMMARY_MIN_SECS

    for (const loc of s.locations) {
      if (loc.monsterIds.length === 0) continue
      const assigned = s.units.filter((u) => u.locationId === loc.id)
      if (assigned.length === 0) continue
      const roster = assigned.filter((u) => u.health > 0)   // bodies able to fight (priming)

      let expPool = 0, gold = 0, primed = false, simRounds = 0
      const killsByMonster: Record<string, number> = {}
      let loot: Record<string, number> = {}
      // Rich per-hero breakdown for this location's away span (estimated, scaled).
      let locTally: Record<string, CombatTally> = {}

      const stats = s.locationStats[loc.id]
      const windows = offlineWindowCount(n, SAMPLING.windowTicks, SAMPLING.maxWindows)
      if (windows >= 2 && roster.length > 0) {
        // Long absence: sample several independent windows across the span so the
        // projection carries variance/clumps (and is where a scheduled boss would
        // be injected). Covers both warm and cold — it simulates either way.
        primed = true
        const r = projectOfflineSampled(loc, roster, s.equipment, s.partyTactics ?? [], s.battles[loc.id], n, { samples: windows, startTick: s.ticks })
        battles[loc.id] = r.battle
        simRounds = Math.round(r.primedTicks / ROUND_EVERY_TICKS)
        Object.assign(killsByMonster, r.killsByMonster)
        loot = { ...r.loot }
        locTally = r.tally   // already scaled across windows
      } else if (stats) {
        // Warm, short absence: cheap single linear extrapolation of the realized rate.
        const proj = projectOfflineRewards(getLocationCombatReport(stats, s.ticks), n)
        Object.assign(killsByMonster, proj.killsByMonster)
        loot = rollOfflineLoot(killsByMonster)
        // The cheap path runs no sim, so harvest a breakdown sample only when the
        // absence is worth it (≥ the summary gate); scale it over the full span.
        if (wantBreakdown && roster.length > 0) {
          const h = primeColdLocation(loc, roster, s.equipment, s.partyTactics ?? [], undefined)
          locTally = scaleTallyMap(h.tally, n / Math.max(1, h.primedTicks))
        }
      } else if (roster.length > 0) {
        // Cold: prime a budgeted slice of real combat, then extrapolate the
        // remaining time on the freshly-measured rate.
        primed = true
        const r = primeColdLocation(loc, roster, s.equipment, s.partyTactics ?? [], s.battles[loc.id])
        battles[loc.id] = r.battle
        simRounds = Math.round(r.primedTicks / ROUND_EVERY_TICKS)
        Object.assign(killsByMonster, r.killsByMonster)
        loot = { ...r.loot }
        locTally = scaleTallyMap(r.tally, n / Math.max(1, r.primedTicks))   // prime slice → full span
        const remaining = n - r.primedTicks
        if (r.primedTicks > 0 && remaining > 0) {
          const scale = remaining / r.primedTicks
          const extraKills: Record<string, number> = {}
          for (const [mid, k] of Object.entries(r.killsByMonster)) {
            const ek = Math.floor(k * scale)
            if (ek > 0) extraKills[mid] = ek
          }
          for (const [mid, k] of Object.entries(extraKills)) killsByMonster[mid] = (killsByMonster[mid] ?? 0) + k
          const extraLoot = rollOfflineLoot(extraKills)
          for (const [id, q] of Object.entries(extraLoot)) loot[id] = (loot[id] ?? 0) + q
        }
      } else {
        continue   // no sample and nobody able to fight → nothing to prime
      }

      // Every kill yields exactly 1 gold + 1 exp, so the headline numbers are the
      // kill total — derived here so independent per-path flooring (per-monster
      // kills vs aggregate gold/exp) can't drift them apart in the report.
      const kills = Object.values(killsByMonster).reduce((a, b) => a + b, 0)
      expPool = kills
      gold    = kills
      // Record cost/output for the debug readout (even a zero-output prime — its
      // sim rounds still cost something worth seeing).
      catchUpDebug.push({ locationId: loc.id, locationName: loc.name, windows, rounds: simRounds, kills, exp: expPool, gold })
      if (kills === 0) continue

      // Credit the XP pool to deployed heroes, split proportional to level (a
      // low-level hero parked in a high-level party earns only its level-share).
      const shares = splitExpByLevel(expPool, assigned.map((u) => ({ id: u.id, level: u.level })))
      for (const [id, amt] of Object.entries(shares)) expByUnit[id] = (expByUnit[id] ?? 0) + amt
      totalGold += gold
      for (const [id, q] of Object.entries(loot)) lootDelta[id] = (lootDelta[id] ?? 0) + q
      for (const [mid, k] of Object.entries(killsByMonster)) monsterDefeated[mid] = (monsterDefeated[mid] ?? 0) + k

      // Reconcile the estimated breakdown with the actually-credited numbers:
      // exp is exactly known (the level-share), and each deployed body was on the
      // field for the whole absence (combatTicks = n keeps lifetime DPS sane).
      for (const [id, amt] of Object.entries(shares)) (locTally[id] ?? (locTally[id] = emptyTally())).expGained = amt
      for (const u of roster) (locTally[u.id] ?? (locTally[u.id] = emptyTally())).combatTicks += n

      // Advance the location's persisted stats so the rate stays coherent for the
      // next catch-up (window grows by n, rewards grow proportionally), and fold
      // the per-hero breakdown into the location's byUnit table.
      const prev = locationStats[loc.id] ?? { startTick: s.ticks, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
      const nextDefeated = { ...prev.monstersDefeated }
      for (const [mid, k] of Object.entries(killsByMonster)) nextDefeated[mid] = (nextDefeated[mid] ?? 0) + k
      const nextDropped = { ...prev.itemsDropped }
      for (const [id, q] of Object.entries(loot)) nextDropped[id] = (nextDropped[id] ?? 0) + q
      const nextByUnit = { ...(prev.byUnit ?? {}) }
      for (const [id, t] of Object.entries(locTally)) nextByUnit[id] = addInto2(nextByUnit[id], t)
      locationStats[loc.id] = {
        startTick: prev.startTick,
        monstersDefeated: nextDefeated,
        itemsDropped:     nextDropped,
        expDistributed:   prev.expDistributed + expPool,
        goldEarned:       prev.goldEarned + gold,
        byUnit:           nextByUnit,
      }
      mergeTally(detailByUnit, locTally)

      rewards.push({ locationId: loc.id, locationName: loc.name, kills, exp: expPool, gold, loot, primed, tally: locTally })
    }

    if (totalGold > 0) lootDelta['m-gold'] = (lootDelta['m-gold'] ?? 0) + totalGold

    // Collapse n ticks of recovery/regen, folding in the offline exp above.
    const unitsPreLevel = s.units.map((u) => {
      let health = u.health
      let recoveryTicksLeft = Math.max(0, Math.round(u.recoveryTicksLeft ?? 0))
      let isResting = u.isResting || (health === 0 && recoveryTicksLeft === 0)
      const maxHp = getDerivedStats(u, s.equipment).maxHp

      if (isResting) {
        // Already resting at start of batch
        health    = Math.min(maxHp, health + n * RESTING_REGEN_RATE)
        isResting = health < maxHp
      } else if (recoveryTicksLeft > 0) {
        const remaining = recoveryTicksLeft - n
        if (remaining > 0) {
          // Still in KO phase at end of batch
          recoveryTicksLeft = remaining
          health = 0
        } else {
          // KO phase ends mid-batch; spend rest of time resting
          recoveryTicksLeft = 0
          const ticksResting = -remaining  // ticks after KO phase ended
          health    = Math.min(maxHp, ticksResting * RESTING_REGEN_RATE)
          isResting = health < maxHp
        }
      } else if (!u.locationId) {
        health = Math.min(maxHp, health + n * REGEN_RATE)
      }

      health = Math.max(0, health)
      const aged   = yearsPassed > 0 ? { age: u.age + yearsPassed } : {}
      const expAdd = expByUnit[u.id] ?? 0
      return { ...u, health, recoveryTicksLeft, isResting, ...aged, exp: u.exp + expAdd }
    })

    let eventLog = s.eventLog
    const locOf = new Map(s.units.map((u) => [u.id, u.locationId]))
    const units = unitsPreLevel.map((u) => {
      const { unit: leveled, log: nextLog } = applyLevelUps(u, newTicks, eventLog)
      eventLog = nextLog
      // Credit any offline level-ups into the breakdown (global + AFK per-hero).
      const gained = leveled.level - u.level
      if (gained > 0) {
        (detailByUnit[u.id] ?? (detailByUnit[u.id] = emptyTally())).levelsGained += gained
        const rew = rewards.find((r) => r.locationId === locOf.get(u.id))
        if (rew?.tally) (rew.tally[u.id] ?? (rew.tally[u.id] = emptyTally())).levelsGained += gained
      }
      return leveled
    })

    const offlineSecs = Math.round(n / TICKS_PER_SECOND)
    if (n >= 50) {
      eventLog = appendLog(eventLog, 'offline', `Away ${formatDuration(offlineSecs)}`, newTicks)
    }

    const miscItems = Object.keys(lootDelta).length > 0
      ? applyMiscDeltas(s.miscItems, lootDelta)
      : s.miscItems

    // "While you were away" modal — only worth showing for a real absence with
    // something to report. Otherwise keep whatever summary was already pending.
    const mergedLoot: Record<string, number> = {}
    for (const r of rewards) for (const [id, q] of Object.entries(r.loot)) mergedLoot[id] = (mergedLoot[id] ?? 0) + q
    const offlineSummary: OfflineSummary | null = (rewards.length > 0 && offlineSecs >= OFFLINE_SUMMARY_MIN_SECS)
      ? {
          offlineSecs, startTick: s.ticks, endTick: newTicks, locations: rewards,
          totalKills: rewards.reduce((a, r) => a + r.kills, 0),
          totalGold, loot: mergedLoot,
        }
      : s.offlineSummary

    // Debug instrumentation: when this catch-up ran, its size, sim cost, and the
    // per-location cost/output. Surfaced on the report screen.
    const lastCatchUp: CatchUpDebug = {
      at: Date.now(), ticks: n, secs: offlineSecs,
      wallMs: Date.now() - catchUpStart, locations: catchUpDebug,
    }

    return {
      ticks: newTicks, units, lastTickAt: Date.now(), eventLog,
      miscItems, monsterDefeated, locationStats, battles, offlineSummary, lastCatchUp,
      unitStats: foldUnitStats(s.unitStats, detailByUnit),
      // Offline damage is a SYNTHETIC estimate (a saturated priming sim, scaled over
      // the absence) — fine for lifetime totals + the "while you were away" summary,
      // but it must NOT feed the rolling rate-history. That history drives the Hero
      // tab's per-minute/-second readouts, and a saturated estimate reads several×
      // the realized open-world rate. Recent stats come only from real ticks: the
      // catch-up (App.tsx) live-sims the final minute after this bulk extrapolation,
      // so the rolling rate reflects realized play. Leave the history untouched here.
      unitStatHistory: s.unitStatHistory,
    }
  }),

  dismissOfflineSummary: () => set({ offlineSummary: null }),
  armQuestDrop: (rule) => set((s) => ({
    questDropRules: [...s.questDropRules.filter((r) => r.id !== rule.id), rule],
    questItems: { ...s.questItems, [rule.itemId]: 0 },   // fresh ledger for this objective
  })),
  disarmQuestDrop: (ruleId) => set((s) => {
    const rule = s.questDropRules.find((r) => r.id === ruleId)
    const items = { ...s.questItems }
    if (rule) delete items[rule.itemId]                  // clear any leftover quest items
    return { questDropRules: s.questDropRules.filter((r) => r.id !== ruleId), questItems: items }
  }),
  consumeQuestItem: (itemId, qty) => set((s) => {
    const left = (s.questItems[itemId] ?? 0) - qty
    const items = { ...s.questItems }
    if (left > 0) items[itemId] = left; else delete items[itemId]
    return { questItems: items }
  }),
  consumeMiscItem: (itemId, qty) => set((s) => ({
    miscItems: s.miscItems
      .map((m) => (m.id === itemId ? { ...m, quantity: m.quantity - qty } : m))
      .filter((m) => m.quantity > 0),
  })),
  grantMiscItem: (itemId, qty) => set((s) => ({ miscItems: applyMiscDeltas(s.miscItems, { [itemId]: qty }) })),
  grantEquipment: (itemId) => set((s) => {
    const def = INITIAL_EQUIPMENT.find((e) => e.id === itemId)
    if (!def) return s
    // A fresh owned instance (unique id) so duplicates of the same gear coexist.
    const inst = { ...def, id: `${itemId}#${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}` }
    return { equipment: [...s.equipment, inst] }
  }),

  togglePause: () => set((s) => s.paused
    ? { paused: false, lastTickAt: Date.now() }  // reset clock so no catch-up on unpause
    : { paused: true }
  ),

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleRegion: (id) => set((s) => {
    const next = s.expandedRegionIds.includes(id) ? s.expandedRegionIds.filter((x) => x !== id) : [...s.expandedRegionIds, id]
    localStorage.setItem('expandedRegionIds', JSON.stringify(next))
    return { expandedRegionIds: next }
  }),
  toggleLocation: (id) => set((s) => {
    const next = s.expandedLocationIds.includes(id) ? s.expandedLocationIds.filter((x) => x !== id) : [...s.expandedLocationIds, id]
    localStorage.setItem('expandedLocationIds', JSON.stringify(next))
    return { expandedLocationIds: next }
  }),
  toggleUnit: (id) => set((s) => {
    const next = s.expandedUnitIds.includes(id) ? s.expandedUnitIds.filter((x) => x !== id) : [...s.expandedUnitIds, id]
    localStorage.setItem('expandedUnitIds', JSON.stringify(next))
    return { expandedUnitIds: next }
  }),
  toggleInventorySection: (id) => set((s) => {
    const next = s.expandedInventorySections.includes(id) ? s.expandedInventorySections.filter((x) => x !== id) : [...s.expandedInventorySections, id]
    localStorage.setItem('expandedInventorySections', JSON.stringify(next))
    return { expandedInventorySections: next }
  }),
  toggleSelectUnit:  (id) => set((s) => ({ selectedUnitIds: s.selectedUnitIds.includes(id) ? s.selectedUnitIds.filter((x) => x !== id) : [...s.selectedUnitIds, id] })),
  clearSelection:    () => set({ selectedUnitIds: [] }),
  setSelectedLocation: (id) => set({ selectedLocationId: id }),
  setCombatLocation: (id) => set({ combatLocationId: id }),
  // Drop into a location's battlefield: focus it and switch the Map to battle
  // mode. Combat itself keeps running in the engine regardless — this is just
  // which view the Map tab renders.
  // Also mark the battlefield's location as selected so the UnitActionBar's
  // Deploy targets it — in a battlefield the map cell is implicitly "selected".
  enterBattleView: (locationId) => set({ combatLocationId: locationId, selectedLocationId: locationId, mapMode: 'battle', selectedUnitIds: [], battleFollowId: null }),
  // Zoom back out to the overworld, re-selecting the location we were watching
  // (paged to its region) so the player lands back where they dropped in.
  exitBattleView: () => set((s) => {
    const loc = s.combatLocationId ? s.locations.find((l) => l.id === s.combatLocationId) : null
    return {
      mapMode: 'world',
      battleFollowId: null,
      ...(loc ? { mapPageId: loc.region, selectedLocationId: loc.id } : {}),
    }
  }),
  // Roster double-tap. In battle mode: drop into this unit's battlefield centred
  // on them (mirror of the location double-tap). In overworld mode: frame +
  // centre the camera on the unit's location (or clear if unassigned).
  showUnitOnMap: (unitId) => set((s) => {
    const u = s.units.find((x) => x.id === unitId)
    const loc = u?.locationId ? s.locations.find((l) => l.id === u.locationId) : null
    if (s.mapMode === 'battle') {
      // Keep the current battlefield if the unit is unassigned; else jump to
      // theirs. Either way, ask the battle view to centre on this unit.
      return {
        ...(loc ? { combatLocationId: loc.id, selectedLocationId: loc.id } : {}),
        battleFocus: { unitId, nonce: (s.battleFocus?.nonce ?? 0) + 1 },
        battleFollowId: unitId,   // lock the camera onto this hero
      }
    }
    return {
      mapMode: 'world',
      mapFocusNonce: s.mapFocusNonce + 1,
      ...(loc ? { mapPageId: loc.region, selectedLocationId: loc.id } : { selectedLocationId: null }),
    }
  }),
  setBattleFollow: (id) => set({ battleFollowId: id }),
  // Centre the overworld camera on a location (roster "Map" button / find).
  focusLocationOnMap: (locationId) => set((s) => {
    const loc = s.locations.find((l) => l.id === locationId)
    return {
      mapMode: 'world',
      mapFocusNonce: s.mapFocusNonce + 1,
      selectedLocationId: locationId,
      ...(loc ? { mapPageId: loc.region } : {}),
    }
  }),
  setMapPage: (id) => set({ mapPageId: id }),
  markUnitViewed: (unitId) => set((s) => {
    const u = s.units.find((x) => x.id === unitId)
    if (!u) return s
    const next = { ...s.viewedUnitLevels, [unitId]: u.level }
    localStorage.setItem('viewedUnitLevels', JSON.stringify(next))
    return { viewedUnitLevels: next }
  }),
  openReport: (unitId) => set({ reportUnitId: unitId }),
  closeReport: () => set({ reportUnitId: null }),
  // Deploy keeps the current selection — you've just acted ON these heroes, so
  // they stay selected (follow them, open a dossier, redeploy) rather than the
  // selection clearing out from under you.
  assignUnits: (unitIds, locationId) => set((s) => {
    const ids = new Set(unitIds)
    const byId = new Map(s.locations.map((l) => [l.id, l]))
    const units = s.units.map((u) => {
      if (!ids.has(u.id)) return u
      // §travel: in 'open-world' deploy mode a hero WALKS to a directly
      // portal-linked neighbour of their current open-world map (marches to the
      // portal, then the tick loop hops them across) instead of teleporting.
      // Any other deploy — instant mode, an un-linked/distant map, or a first
      // placement from nowhere — stays an instant (re)deploy as before.
      const from = u.locationId ? byId.get(u.locationId) : null
      const canWalk = s.deployMode === 'open-world' && !!locationId && !!from && !!from.openWorld
        && u.locationId !== locationId && (from.portals ?? []).some((p) => p.to === locationId)
      return canWalk ? { ...u, travelPath: [locationId!] } : { ...u, locationId, travelPath: null }
    })
    // §travel: if this (re)deploy INSTANTLY moved the camera-followed hero to a new
    // map (e.g. the resupply teleport into/out of town), bring the camera with them —
    // a walk follows later via the portal-cross path instead. Without this the camera
    // is stranded where the hero left from (follow silently drops).
    const moved = s.battleFollowId && ids.has(s.battleFollowId) && !!locationId
    const fu = moved ? units.find((u) => u.id === s.battleFollowId) : undefined
    const followInstant = !!fu && fu.locationId === locationId && fu.travelPath == null && s.selectedLocationId !== locationId
    const loc = followInstant ? byId.get(locationId!) : null
    return {
      units,
      ...(followInstant ? { selectedLocationId: locationId, combatLocationId: locationId, ...(loc ? { mapPageId: loc.region } : {}) } : {}),
    }
  }),

  routeUnitTo: (unitId, destinationId) => set((s) => {
    const u = s.units.find((x) => x.id === unitId)
    if (!u || !u.locationId) return s
    const steps = routeStepsFrom(u.locationId, destinationId, s.locations)
    const travelPath = steps && steps.length ? steps : null
    return { units: s.units.map((x) => (x.id === unitId ? { ...x, travelPath } : x)) }
  }),

  runToMapEdge: (unitId) => set((s) => {
    const u = s.units.find((x) => x.id === unitId)
    const battle = u?.locationId ? s.battles[u.locationId] : null
    if (!battle) return s
    // Head to the bottom-centre (the "town" edge). issueMoveOrder mutates the
    // battle in place; hand back a fresh battles ref so subscribers re-render.
    issueMoveOrder(battle, unitId, { x: battle.cols / 2, y: battle.rows - 1 })
    return { battles: { ...s.battles } }
  }),

  setActionSlot: (unitId, slotIdx, entry) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      // Defensive: if a unit pre-dates the actionSlots field (e.g. older
      // recruitUnit, hot-reload), treat it as an empty bar of the right size.
      const cur = u.actionSlots ?? Array<ActionSlotEntry | null>(ACTION_SLOT_COUNT).fill(null)
      const prev = cur[slotIdx] ?? null

      // Build the new action-slot array. Drag-to-move semantics: if the same
      // skill/item is already in another slot, clear it from there so the
      // entry doesn't end up duplicated across the bar.
      const newActionSlots: (ActionSlotEntry | null)[] = cur.map((c, i) => {
        if (i === slotIdx) return entry
        if (entry && c && c.kind === entry.kind && c.id === entry.id) return null
        return c
      })

      // Sync sideboard for items only. Skills don't touch sideboard.
      let { sideboard1, sideboard2 } = u.equipment

      // 1) If we're replacing/removing a previous *item* entry and no other
      //    action slot still references it, evict from sideboard.
      if (prev && prev.kind === 'item') {
        const stillReferenced = newActionSlots.some(
          (e) => e && e.kind === 'item' && e.id === prev.id
        )
        if (!stillReferenced) {
          if (sideboard1 === prev.id) sideboard1 = null
          if (sideboard2 === prev.id) sideboard2 = null
        }
      }

      // 2) If we're placing a new *item* entry, ensure it's in sideboard.
      if (entry && entry.kind === 'item') {
        const already = sideboard1 === entry.id || sideboard2 === entry.id
        if (!already) {
          if (sideboard1 === null) {
            sideboard1 = entry.id
          } else if (sideboard2 === null) {
            sideboard2 = entry.id
          } else {
            // Both full → evict sideboard1 (and clear any action slots that
            // referenced the evicted item). Shift sideboard2 up.
            const evicted = sideboard1
            sideboard1 = sideboard2
            sideboard2 = entry.id
            for (let i = 0; i < newActionSlots.length; i++) {
              const e = newActionSlots[i]
              if (e && e.kind === 'item' && e.id === evicted) newActionSlots[i] = null
            }
          }
        }
      }

      return {
        ...u,
        actionSlots: newActionSlots,
        equipment: { ...u.equipment, sideboard1, sideboard2 },
      }
    }),
  })),

  equipItem: (unitId, slot, itemId) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      if (slot === 'mainHand' || slot === 'offHand') {
        const weaponSets = u.weaponSets.map((ws, i) =>
          i === u.activeWeaponSet ? { ...ws, [slot]: itemId } : ws
        ) as [WeaponRecord, WeaponRecord]
        return { ...u, weaponSets }
      }
      return { ...u, equipment: { ...u.equipment, [slot]: itemId } }
    }),
  })),

  openEquipFor:    (unitId, slot) => set({ equipContext: { unitId, slot }, activeTab: 'inventory' }),
  closeEquipContext: () => set({ equipContext: null }),

  spendAbilityPoint: (unitId, ability) => set((s) => {
    const unit = s.units.find((u) => u.id === unitId)
    if (!unit) return s
    const current = unit.abilities[ability]
    if (current >= 99) return s
    const cost = Math.floor((current - 1) / 10) + 1
    if (unit.abilityPoints < cost) return s
    // Spending is the "I've engaged with this level's growth" signal — record the
    // current level so the attention cue clears (until the next level-up).
    const viewedUnitLevels = { ...s.viewedUnitLevels, [unitId]: unit.level }
    localStorage.setItem('viewedUnitLevels', JSON.stringify(viewedUnitLevels))
    return {
      units: s.units.map((u) => u.id === unitId ? { ...u, abilityPoints: u.abilityPoints - cost, abilities: { ...u.abilities, [ability]: current + 1 } } : u),
      viewedUnitLevels,
    }
  }),

  // §debug: grant exactly enough exp for ONE level-up, then run the normal
  // level-up path (so ability/skill points accrue by the real rules). One click =
  // one level. Handy for testing level-scaled behaviour (e.g. attack speed).
  debugLevelUp: (unitId) => set((s) => {
    const unit = s.units.find((u) => u.id === unitId)
    if (!unit) return s
    const boosted = { ...unit, exp: unit.expToNext }   // top exp up to the threshold
    const { unit: leveled, log } = applyLevelUps(boosted, s.ticks, s.eventLog)
    return { units: s.units.map((u) => u.id === unitId ? leveled : u), eventLog: log }
  }),

  // §debug: reset a hero to a clean level-1 slate — level 1, exp 0, all base
  // ability scores back to DEBUG_RESET_ABILITY, and the level-1 point baseline.
  // Skills/equipment/class are left alone. Refills health to the new max.
  debugResetLevel: (unitId) => set((s) => {
    const unit = s.units.find((u) => u.id === unitId)
    if (!unit) return s
    const abilities: Abilities = { strength: DEBUG_RESET_ABILITY, agility: DEBUG_RESET_ABILITY, dexterity: DEBUG_RESET_ABILITY, constitution: DEBUG_RESET_ABILITY, intelligence: DEBUG_RESET_ABILITY }
    const reset: Unit = { ...unit, level: 1, exp: 0, expToNext: expForLevel(1), abilities, abilityPoints: 3, skillPoints: 1 }
    const healed = { ...reset, health: getDerivedStats(reset, s.equipment).maxHp }
    return { units: s.units.map((u) => u.id === unitId ? healed : u) }
  }),

  // §travel-defend: set a hero's routing combat behaviour (Logistics toggle).
  setTravelEngage: (unitId, mode) => set((s) => ({
    units: s.units.map((u) => u.id === unitId ? { ...u, travelEngage: mode } : u),
  })),

  recruitUnit: () => set((s) => {
    const name = randomFullName(new Set(s.units.map((u) => u.name)))
    const r = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo
    const unit: Unit = {
      id: `u${Date.now()}`, name, level: 1, exp: 0, expToNext: expForLevel(1),
      age: r(16, 30), health: 100, recoveryTicksLeft: 0, isResting: false, class: null, proficiencies: [],
      abilities: { strength: r(2,5), agility: r(2,5), dexterity: r(2,5), constitution: r(2,5), intelligence: r(2,5) },
      // New recruits spawn stationed in Prontera (the safe starter hub).
      abilityPoints: 3, skillPoints: 1, learnedSkills: {}, locationId: 'prontera-city', travelPath: null,
      weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
      activeWeaponSet: 0,
      equipment: { armor: null, sideboard1: null, sideboard2: null, accessory: null },
      actionSlots: Array(ACTION_SLOT_COUNT).fill(null),
      tactics: [],   // recruits start with no tactics — the player assigns them
    }
    return { units: [...s.units, { ...unit, health: getDerivedStats(unit, s.equipment).maxHp }] }
  }),

  craft: (recipeId) => set((s) => {
    const recipe = RECIPE_REGISTRY[recipeId]; if (!recipe) return s
    for (const ing of recipe.ingredients) {
      const item = s.miscItems.find((i) => i.id === ing.itemId)
      if (!item || item.quantity < ing.quantity) return s
    }
    let items = s.miscItems.map((item) => {
      const ing = recipe.ingredients.find((i) => i.itemId === item.id)
      return ing ? { ...item, quantity: item.quantity - ing.quantity } : item
    })
    const existing = items.find((i) => i.id === recipe.outputItemId)
    if (existing) {
      items = items.map((i) => i.id === recipe.outputItemId ? { ...i, quantity: i.quantity + recipe.outputQuantity } : i)
    } else {
      items = [...items, { id: recipe.outputItemId, name: recipe.outputName, quantity: recipe.outputQuantity, description: recipe.description, kind: recipe.category === 'consumable' ? 'consumable' : 'material' }]
    }
    return { miscItems: items }
  }),

  learnSkill: (unitId, skillId) => set((s) => {
    const unit = s.units.find((u) => u.id === unitId)
    if (!unit || unit.skillPoints < 1) return s
    const skill = SKILL_REGISTRY[skillId]; if (!skill) return s
    const current = unit.learnedSkills[skillId] ?? 0
    if (current >= skill.maxLevel) return s
    const prereqsMet = skill.requires.every((r) => (unit.learnedSkills[r.skillId] ?? 0) >= r.minLevel)
    if (!prereqsMet) return s
    // Curated mode gates learnable skills to the unit's class kit (a hard chokepoint
    // so the gate holds regardless of which UI surfaced the skill). Sandbox: open.
    if (!isSkillUnlocked(s.progressionMode, skillId, unit)) return s
    // Spending a skill point counts as engaging with this level's growth — clear
    // the attention cue (see spendAbilityPoint).
    const viewedUnitLevels = { ...s.viewedUnitLevels, [unitId]: unit.level }
    localStorage.setItem('viewedUnitLevels', JSON.stringify(viewedUnitLevels))
    return { viewedUnitLevels, units: s.units.map((u) => {
      if (u.id !== unitId) return u
      // §minions: learning Beast Companion grants the pet (a tankish default
      // loadout the player can retune on the Pet tab).
      const companion = skillId === 'beast-companion' && !u.companion ? DEFAULT_COMPANION() : u.companion
      return { ...u, skillPoints: u.skillPoints - 1, learnedSkills: { ...u.learnedSkills, [skillId]: current + 1 }, companion }
    }) }
  }),

  equipTactic: (unitId, tacticId) => set((s) => {
    const def = TACTIC_REGISTRY[tacticId]
    if (!def || def.scope !== 'unit') return s
    return {
      units: s.units.map((u) => {
        if (u.id !== unitId) return u
        const cur = u.tactics ?? []
        if (cur.some((t) => t.id === tacticId) || cur.length >= MAX_UNIT_TACTICS) return u
        return { ...u, tactics: [...cur, { id: tacticId, rank: 1 }] }
      }),
    }
  }),
  unequipTactic: (unitId, tacticId) => set((s) => ({
    units: s.units.map((u) => u.id === unitId ? { ...u, tactics: (u.tactics ?? []).filter((t) => t.id !== tacticId) } : u),
  })),
  // Reorder within the tactic's own channel: priority only competes per channel
  // (the engine evaluates each channel independently), so the arrows swap with the
  // nearest equipped neighbour sharing the channel — not the raw-array neighbour.
  moveTactic: (unitId, tacticId, dir) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      const cur = [...(u.tactics ?? [])]
      const i = cur.findIndex((t) => t.id === tacticId)
      if (i < 0) return u
      const ch = TACTIC_REGISTRY[cur[i].id]?.channel
      let j = i + dir
      while (j >= 0 && j < cur.length && TACTIC_REGISTRY[cur[j].id]?.channel !== ch) j += dir
      if (j < 0 || j >= cur.length) return u
      ;[cur[i], cur[j]] = [cur[j], cur[i]]
      return { ...u, tactics: cur }
    }),
  })),
  // §consumables: pack carry intents + use rules. Pure config — the tick loop's
  // in-town auto-fill reconciles counts toward `target`, and the engine reads the
  // rules (via the adapter) to fire use-item tactics in combat.
  setCarryTarget: (unitId, itemId, target) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      const cur = u.pack ?? []
      const t = Math.max(0, Math.floor(target))
      const existing = cur.find((p) => p.itemId === itemId)
      if (existing) return { ...u, pack: cur.map((p) => p.itemId === itemId ? { ...p, target: t } : p) }
      if (cur.length >= PACK_SLOTS) return u   // pack full — can't add another stack
      return { ...u, pack: [...cur, { itemId, count: 0, target: t }] }
    }),
  })),
  clearCarryTarget: (unitId, itemId) => set((s) => ({
    // Drop the carry intent. Any carried stock is returned to the stash so it
    // isn't lost; the slot frees up.
    units: s.units.map((u) => u.id === unitId ? { ...u, pack: (u.pack ?? []).filter((p) => p.itemId !== itemId) } : u),
    miscItems: (() => {
      const u = s.units.find((x) => x.id === unitId)
      const held = u?.pack?.find((p) => p.itemId === itemId)?.count ?? 0
      return held > 0 ? applyMiscDeltas(s.miscItems, { [itemId]: held }) : s.miscItems
    })(),
  })),
  addConsumableRule: (unitId, itemId, threshold) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      const cur = u.consumableRules ?? []
      if (cur.some((r) => r.itemId === itemId)) return u
      return { ...u, consumableRules: [...cur, { itemId, threshold: clampThreshold(threshold) }] }
    }),
  })),
  removeConsumableRule: (unitId, itemId) => set((s) => ({
    units: s.units.map((u) => u.id === unitId ? { ...u, consumableRules: (u.consumableRules ?? []).filter((r) => r.itemId !== itemId) } : u),
  })),
  setRuleThreshold: (unitId, itemId, threshold) => set((s) => ({
    units: s.units.map((u) => u.id === unitId
      ? { ...u, consumableRules: (u.consumableRules ?? []).map((r) => r.itemId === itemId ? { ...r, threshold: clampThreshold(threshold) } : r) }
      : u),
  })),
  toggleInheritedTactic: (unitId, tacticId) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      const cur = u.suppressedTactics ?? []
      const next = cur.includes(tacticId) ? cur.filter((id) => id !== tacticId) : [...cur, tacticId]
      return { ...u, suppressedTactics: next }
    }),
  })),

  // §minions: companion tactic editing — mirrors the unit tactic actions but
  // operates on `unit.companion.tactics` (same cap + per-channel reorder rules).
  equipCompanionTactic: (unitId, tacticId) => set((s) => {
    const def = TACTIC_REGISTRY[tacticId]
    if (!def || def.scope !== 'unit') return s
    return { units: s.units.map((u) => {
      if (u.id !== unitId || !u.companion) return u
      const cur = u.companion.tactics
      if (cur.some((t) => t.id === tacticId) || cur.length >= MAX_UNIT_TACTICS) return u
      return { ...u, companion: { ...u.companion, tactics: [...cur, { id: tacticId, rank: 1 }] } }
    }) }
  }),
  unequipCompanionTactic: (unitId, tacticId) => set((s) => ({
    units: s.units.map((u) => u.id === unitId && u.companion
      ? { ...u, companion: { ...u.companion, tactics: u.companion.tactics.filter((t) => t.id !== tacticId) } } : u),
  })),
  moveCompanionTactic: (unitId, tacticId, dir) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId || !u.companion) return u
      const cur = [...u.companion.tactics]
      const i = cur.findIndex((t) => t.id === tacticId)
      if (i < 0) return u
      const ch = TACTIC_REGISTRY[cur[i].id]?.channel
      let j = i + dir
      while (j >= 0 && j < cur.length && TACTIC_REGISTRY[cur[j].id]?.channel !== ch) j += dir
      if (j < 0 || j >= cur.length) return u
      ;[cur[i], cur[j]] = [cur[j], cur[i]]
      return { ...u, companion: { ...u.companion, tactics: cur } }
    }),
  })),

  equipPartyTactic: (tacticId) => set((s) => {
    const def = TACTIC_REGISTRY[tacticId]
    if (!def || def.scope !== 'party') return s
    const cur = s.partyTactics ?? []
    if (cur.some((t) => t.id === tacticId) || cur.length >= MAX_PARTY_TACTICS) return s
    return { partyTactics: [...cur, { id: tacticId, rank: 1 }] }
  }),
  unequipPartyTactic: (tacticId) => set((s) => ({
    partyTactics: (s.partyTactics ?? []).filter((t) => t.id !== tacticId),
  })),

  setProgressionMode: (mode) => set((s) => (s.progressionMode === mode ? s : { progressionMode: mode })),
  setDeployMode: (mode) => set((s) => (s.deployMode === mode ? s : { deployMode: mode })),
  setBattleSkin: (skin) => {
    try { localStorage.setItem('battle-skin', skin) } catch { /* private mode */ }
    set((s) => (s.battleSkin === skin ? s : { battleSkin: skin }))
  },

  resetSave: () => {
    // Wipe the persisted save too — not just the UI keys. Without this the reset
    // only updated in-memory state; the stale (leveled) save survived in
    // localStorage and the next page load (routine on mobile) restored it, so the
    // reset silently didn't stick. Only THIS mode's slot is wiped — the other
    // mode's game is left untouched (SAVE_KEY = the legacy pre-split key).
    ;['expandedLocationIds', 'expandedUnitIds', 'expandedInventorySections', 'expandedRegionIds', 'viewedUnitLevels', SAVE_KEY].forEach((k) => localStorage.removeItem(k))
    // Re-seed for the *current* mode — a curated reset keeps you in curated.
    set((s) => {
      localStorage.removeItem(saveKeyFor(s.progressionMode))
      return ({
      ...freshGameSeed(s.progressionMode),
      equipment: INITIAL_EQUIPMENT,
      miscItems: INITIAL_MISC,
      monsterDefeated: {},
      locationStats:   {},
      unitStats:       {},
      // The rolling rate-history + 5s ring + catch-up debug are per-unit combat
      // state too — clear them, or a reset keeps the old hero's damage/min, xp/min,
      // etc. stuck on the brand-new (never-fought) roster.
      unitStatHistory: {},
      dpsWindow:       {},
      lastCatchUp:     null,
      viewedUnitLevels: {},
      reportUnitId:    null,
      partyTactics:    [{ id: 'finish-them', rank: 1 }],
      battles:           {},
      battleCooldown:    {},
      monsterSpawnTimers: {},
  portalArrivals: {},
      ticks:         0,
      lastTickAt:    Date.now(),
      offlineSummary: null,
      questDropRules: [],
      questItems:    {},
      paused:        false,
      eventLog:      [],
      itemSockets:   {},
      activeTab:     'map',
      selectedUnitIds: [],
      selectedLocationId: null,
      combatLocationId: null,
      mapMode: 'world',
      mapPageId: 'world',
      mapFocusNonce: 0,
      battleFocus: null,
      battleFollowId: null,
      expandedLocationIds: [],
      expandedUnitIds: [],
      expandedInventorySections: ['equipment', 'misc', 'crafting'],
      expandedRegionIds: ['world', 'geffen-dungeon'],
      equipContext: null,
    })
    })
  },
}))
