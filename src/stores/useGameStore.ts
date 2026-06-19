import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  WeaponRecord, LogEntry, LogCategory,
  LocationCombatStats, UnitCombatStats, CombatTally, StatBucket, ActionSlotEntry, TacticSlot, CompanionInstance,
  QuestDropRule,
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
import { createBattle, addCombatant, relinkCombatant, advanceRound, unitToEngineInput, monsterToEngineInput, companionToEngineInput, pointBlocked, TACTIC_REGISTRY, SKILL_TACTICS, inheritedTacticIds, type Barrier, type BattleState, type Combatant, type EngineUnitInput, type TacticDef, type TacticChannel } from '@/engine'
import { RECIPE_REGISTRY } from '@/data/recipes'
import { INITIAL_EQUIPMENT, INITIAL_MISC } from '@/data/equipment'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { INITIAL_UNITS } from '@/data/units'
import { SCENARIO_REGISTRY } from '@/data/scenarios'
import { SAVE_KEY } from '@/lib/save'

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

// ── Tactics catalog (UI reads this to list equippable tactics) ────────────────-

export { TACTIC_REGISTRY, SKILL_TACTICS, inheritedTacticIds }
export type { TacticDef, TacticChannel }

export const MAX_UNIT_TACTICS = 4
export const MAX_PARTY_TACTICS = 2

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
  partyTactics:           TacticSlot[]                 // team-wide tactics injected into every unit (§5.5)
  ticks: number

  // MIXED TIER (see CLAUDE.md): `locations`, `eventLog`, `lastTickAt`, OfflineSummary
  // regenerate on load; the rest below PERSIST — battles/battleCooldown/
  // monsterSpawnTimers via battlesCodec, itemSockets via socketsCodec.
  locations: Location[]
  battles: Record<string, BattleState>                // locationId → live engine battle (persisted as BSNAP)
  battleCooldown: Record<string, number>              // locationId → ticks until the next wave spawns (persisted)
  monsterSpawnTimers: Record<string, number>          // open-world: ticks until next monster trickles in (persisted)
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
  equipItem: (unitId: string, slot: EquipSlot, itemId: string | null) => void
  openEquipFor: (unitId: string, slot: EquipSlot) => void
  closeEquipContext: () => void
  spendAbilityPoint: (unitId: string, ability: keyof Abilities) => void
  learnSkill: (unitId: string, skillId: string) => void
  // Tactics: equip/unequip and reorder priority (first = highest). Validated
  // against TACTIC_REGISTRY scope and the per-unit / party slot caps.
  equipTactic: (unitId: string, tacticId: string) => void
  unequipTactic: (unitId: string, tacticId: string) => void
  moveTactic: (unitId: string, tacticId: string, dir: -1 | 1) => void
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

// Finer rounds: run the engine every tick at timeScale = ROUND_EVERY_TICKS, so the
// real-time pace is unchanged (timeScale × rounds/sec is constant) but motion is
// stepped finer and combat events spread out. Bumping ROUND_TIME_SCALE makes the
// sim finer/smoother at the same pace (it's the lever to tune feel).
const ROUND_TIME_SCALE    = 2    // engine rounds per logical round (finer = smoother)
const ROUND_EVERY_TICKS   = 1    // advance one engine round every tick (~200ms/round at scale 2)

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
// Per-field engine cadence: `timeScale` (granularity — higher = finer/smaller steps =
// smoother) and `everyTicks` (how many 200ms ticks between rounds — tempo and CPU).
// A large open-world field is the costly one to full-sim and the one that reads jerky
// on mobile. We keep the *fine* granularity (timeScale 2, same as normal fields — the
// jerk-metric sweep in e2e/jerk.spec.ts showed granularity, NOT tempo, is the lever)
// but step it every 2 ticks: that halves the advanceRound work (the long-tasks behind
// the choppiness) AND halves the field's logical pace — a deliberate trade (crowded
// watched fights resolve slower but glide smoothly; off-screen/offline rewards are
// rate-extrapolated regardless). An earlier version threw the granularity away instead
// (timeScale 1, full pace) to keep pace identical, but timeScale 1 is the *coarsest*,
// jerkiest step — measurably worse. The `--seg-ms` glide (BattleView) stretches to the
// ~400ms cadence so the every-2-ticks step still reads continuous. Static per battle
// (from the cap at creation) so timeScale never thrashes mid-battle and snapshot
// replays stay byte-identical. DEV `?hts=`/`?hevery=`/`?ts=` override for tuning sweeps.
const HEAVY_FIELD_CAP     = 16   // openWorldCap at/above which a field runs the trade
// Heavy-field granularity, stepped every HEAVY_FIELD_EVERY ticks. timeScale 2 = the
// fine "half pace" trade; bump to 4 for "quarter pace" (smoother still, slower). This
// is the A/B knob (pace-compare PRs); base = the coarse timeScale-1 throttle.
const HEAVY_FIELD_TIMESCALE = 2   // HALF PACE: fine steps, ~CoV 0.65–0.72
const HEAVY_FIELD_EVERY      = 2
function cadenceFor(loc: Location): { timeScale: number; everyTicks: number } {
  const heavy = loc.openWorld && openWorldCap(loc) >= HEAVY_FIELD_CAP
  if (heavy) return { timeScale: DEV_HEAVY_TS ?? HEAVY_FIELD_TIMESCALE, everyTicks: DEV_HEAVY_EVERY ?? HEAVY_FIELD_EVERY }
  return { timeScale: DEV_BASE_TS ?? ROUND_TIME_SCALE, everyTicks: ROUND_EVERY_TICKS }
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
const OPEN_WORLD_DEFAULT_SIZE = 50
const HERO_VISION = 10             // heroes acquire targets within this many cells
const MONSTER_VISION = 8           // monsters see a little less far
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
  const count = Math.round(size / 6)               // ~8 clusters on a 50-wide map
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
  return createBattle({ playerUnits, enemyUnits, playerPartyTactics: partyTactics, barriers: locationBarriers(loc), collectEvents: true, timeScale: ROUND_TIME_SCALE })
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
function createOpenBattleFor(loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[], cap: number): BattleState {
  const size = openWorldSize(loc)
  const scenBarriers = locationBarriers(loc)
  const barriers = scenBarriers.length ? scenBarriers : openWorldBarriers(loc, size)
  const battle = createBattle({ playerUnits: [], enemyUnits: [], playerPartyTactics: partyTactics, barriers, collectEvents: true, mode: 'open', cols: size, rows: size, timeScale: timeScaleFor(loc) })
  party.forEach((u, i) => {
    addCombatant(battle, withVision(unitToEngineInput(u, getDerivedStats(u, equipment), 'player'), HERO_VISION), 'player', partyTactics, heroSpawnPos(size, i))
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
function reconcileOpenPlayers(battle: BattleState, eligible: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[]): boolean {
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
    const at = partyAnchor(battle, battle.cols)
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
const OFFLINE_SUMMARY_MIN_SECS = 60

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

// Top up an open-world field back to its monster cap with fresh (random) draws —
// the corpse-clear + restock both the live tick and the offline sim use.
function restockField(battle: BattleState, loc: Location): void {
  battle.combatants = battle.combatants.filter((c) => !(c.team === 'enemy' && !c.alive))
  const size = openWorldSize(loc)
  let living = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length
  while (living < openWorldCap(loc)) { if (!spawnMonsterInto(battle, loc, size)) break; living++ }
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
  const started = Date.now()

  while (rounds < roundCap && Date.now() - started < msBudget) {
    if (!wantOpen && battle.outcome !== 'ongoing') break  // wave finished → slice complete
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
    // Open world never resets: clear corpses and keep the field stocked so the
    // measured rate reflects sustained pressure, not a one-time clear.
    if (wantOpen) restockField(battle, loc)
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
    // Fresh field for the next window → an independent composition sample.
    if (w < K - 1 && wantOpen) restockField(battle, loc)
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
    else out.push({ id, name: id === 'm-gold' ? 'Gold' : (DROP_ITEMS[id] ?? id), quantity: qty })
  }
  return out
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
  const koUnitIds = new Set<string>()
  const expByUnit: Record<string, number> = {}
  const lootDelta: Record<string, number> = {}
  const questDropDelta: Record<string, number> = {}
  let goldEarned = 0
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

  for (const loc of s.locations) {
    const locationId = loc.id
    const eligible = s.units.filter(
      (u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting,
    )

    // No party or no monsters → tear down any stale battle/cooldown for this loc.
    if (eligible.length === 0 || loc.monsterIds.length === 0) {
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
      continue
    }

    // ── Open-world: one persistent battle; monsters trickle in over time and
    // heroes join / leave it as they deploy or recover. Never self-terminates.
    if (loc.openWorld) {
      const cap = openWorldCap(loc)
      let battle = battles[locationId]
      if (!battle || battle.mode !== 'open') {
        battle = createOpenBattleFor(loc, eligible, s.equipment, s.partyTactics ?? [], cap)
        battles[locationId] = battle
        monsterSpawnTimers[locationId] = OPEN_WORLD_SPAWN_TICKS
        markSeen(loc, enemyMonsterIds(battle))
      }
      // Field the right heroes (fresh deploys, KO removals, recovery returnees).
      if (reconcileOpenPlayers(battle, eligible, s.equipment, s.partyTactics ?? [])) {
        battles[locationId] = { ...battle }
      }
      // Live-edit: push any loadout changes onto the heroes already fighting.
      syncPlayerLoadouts(battle, eligible, s.equipment, s.partyTactics ?? [])

      // Heavy fields advance every 2 ticks (half the advanceRound work, half the
      // logical pace); normal fields every tick (see cadenceFor / HEAVY_FIELD_CAP).
      // Spawn trickle and hero reconcile still run every tick above — only the costly
      // round is paced.
      const everyTicks = cadenceFor(loc).everyTicks
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
    battles, battleCooldown, monsterSpawnTimers, hpByUnit, koUnitIds, expByUnit, goldEarned, lootDelta,
    questDropDelta, monsterDefeated, monsterSeen, locationMonstersSeen, locationStats, unitStatsDelta, logs,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>((set) => ({
  units:    INITIAL_UNITS,
  locations: INITIAL_LOCATIONS,
  equipment: INITIAL_EQUIPMENT,
  miscItems: INITIAL_MISC,
  activeTab: 'map',
  selectedUnitIds: [],
  selectedLocationId: null,
  combatLocationId: null,
  mapMode: 'world',
  mapPageId: 'world',
  mapFocusNonce: 0,
  battleFocus: null,
  battleFollowId: null,
  expandedLocationIds:       (() => { try { return JSON.parse(localStorage.getItem('expandedLocationIds')       ?? '[]') } catch { return [] } })(),
  expandedUnitIds:           (() => { try { return JSON.parse(localStorage.getItem('expandedUnitIds')           ?? '[]') } catch { return [] } })(),
  expandedInventorySections: (() => { try { return JSON.parse(localStorage.getItem('expandedInventorySections') ?? '["equipment","misc","crafting"]') } catch { return ['equipment', 'misc', 'crafting'] } })(),
  expandedRegionIds:         (() => { try { return JSON.parse(localStorage.getItem('expandedRegionIds')         ?? '["world","geffen-dungeon"]') } catch { return ['world', 'geffen-dungeon'] } })(),
  equipContext: null,
  learnedRecipes: ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
  locationFamiliarity:  { 'geffen-city': 100, 'prontera-city': 80, 'beach-1': 60 },
  locationMonstersSeen: { 'geffen-city': ['slime'], 'prontera-city': ['slime'], 'beach-1': ['rock-crab'] },
  monsterSeen:          { slime: 15, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
  ticks: 0,
  monsterDefeated: {},
  locationStats: {},
  unitStats: {},
  unitStatHistory: {},
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

      const aged   = yearChanged ? { age: u.age + 1 } : {}
      const expAdd = combat.expByUnit[u.id] ?? 0
      const withExp = { ...u, health, recoveryTicksLeft, isResting, ...aged, exp: u.exp + expAdd }
      const { unit: leveled, log: nextLog } = applyLevelUps(withExp, newTicks, newLog)
      newLog = nextLog
      // Record any level-ups into the unit's tally delta for this tick.
      const gained = leveled.level - u.level
      if (gained > 0) (combat.unitStatsDelta[u.id] ?? (combat.unitStatsDelta[u.id] = emptyTally())).levelsGained += gained
      return leveled
    })

    const miscItems = (combat.goldEarned > 0 || Object.keys(combat.lootDelta).length > 0)
      ? applyMiscDeltas(s.miscItems, { 'm-gold': combat.goldEarned, ...combat.lootDelta })
      : s.miscItems

    // Fold quest-item drops into the ledger (kept out of miscItems on purpose).
    const questItems = Object.keys(combat.questDropDelta).length > 0
      ? { ...s.questItems }
      : s.questItems
    for (const [id, n] of Object.entries(combat.questDropDelta)) questItems[id] = (questItems[id] ?? 0) + n

    return {
      ticks: newTicks,
      units,
      battles: combat.battles,
      battleCooldown: combat.battleCooldown,
      monsterSpawnTimers: combat.monsterSpawnTimers,
      monsterDefeated: combat.monsterDefeated,
      questItems,
      monsterSeen: combat.monsterSeen,
      locationMonstersSeen: combat.locationMonstersSeen,
      locationStats: foldLocationByUnit(combat.locationStats, combat.unitStatsDelta, locationOf, newTicks),
      unitStats: foldUnitStats(s.unitStats, combat.unitStatsDelta),
      unitStatHistory: foldHistory(s.unitStatHistory, combat.unitStatsDelta, newTicks),
      miscItems,
      lastTickAt: Date.now(),
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
      unitStatHistory: foldHistory(s.unitStatHistory, detailByUnit, newTicks),
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
  assignUnits: (unitIds, locationId) => set((s) => ({
    units: s.units.map((u) => unitIds.includes(u.id) ? { ...u, locationId, travelPath: null } : u),
    selectedUnitIds: [],
  })),

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
    return { units: s.units.map((u) => u.id === unitId ? { ...u, abilityPoints: u.abilityPoints - cost, abilities: { ...u.abilities, [ability]: current + 1 } } : u) }
  }),

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
      tactics: [{ id: 'charger', rank: 1 }],
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
    return { units: s.units.map((u) => {
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

  resetSave: () => {
    // Wipe the persisted whole-game save too — not just the UI keys. Without this
    // the reset only updated in-memory state; the stale (leveled) save survived in
    // localStorage and the next page load (routine on mobile) restored it, so the
    // reset silently didn't stick.
    ;[SAVE_KEY, 'expandedLocationIds', 'expandedUnitIds', 'expandedInventorySections', 'expandedRegionIds', 'viewedUnitLevels'].forEach((k) => localStorage.removeItem(k))
    set({
      units:    INITIAL_UNITS,
      equipment: INITIAL_EQUIPMENT,
      miscItems: INITIAL_MISC,
      learnedRecipes: ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
      locationFamiliarity:  { 'geffen-city': 100, 'prontera-city': 80, 'beach-1': 60 },
      locationMonstersSeen: { 'geffen-city': ['slime'], 'prontera-city': ['slime'], 'beach-1': ['rock-crab'] },
      monsterSeen:     { slime: 15, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
      monsterDefeated: {},
      locationStats:   {},
      unitStats:       {},
      viewedUnitLevels: {},
      reportUnitId:    null,
      partyTactics:    [{ id: 'finish-them', rank: 1 }],
      battles:           {},
      battleCooldown:    {},
      monsterSpawnTimers: {},
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
  },
}))
