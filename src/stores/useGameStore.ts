import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  WeaponRecord, LogEntry, LogCategory,
  LocationCombatStats, ActionSlotEntry, TacticSlot,
} from '@/types'
import { ACTION_SLOT_COUNT } from '@/types'
import { RECOVERY_TICKS, REGEN_RATE, RESTING_REGEN_RATE, TICKS_PER_SECOND, TICKS_PER_YEAR, formatDuration } from '@/lib/time'
import { getDerivedStats } from '@/lib/stats'
import { randomFullName } from '@/lib/names'
import { SKILL_REGISTRY } from '@/data/skills'
import { MONSTER_REGISTRY, DROP_ITEMS } from '@/data/monsters'
import { createBattle, advanceRound, unitToEngineInput, monsterToEngineInput, TACTIC_REGISTRY, SKILL_TACTICS, inheritedTacticIds, type Barrier, type BattleState, type TacticDef, type TacticChannel } from '@/engine'
import { RECIPE_REGISTRY } from '@/data/recipes'
import { INITIAL_EQUIPMENT, INITIAL_MISC } from '@/data/equipment'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { INITIAL_UNITS } from '@/data/units'
import { SCENARIO_REGISTRY } from '@/data/scenarios'

// ── Re-exports (keeps existing import paths working) ──────────────────────────

export * from '@/types'
export * from '@/lib/time'
export * from '@/lib/stats'
export * from '@/lib/names'
export * from '@/lib/combatReport'
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

// Catalog entries of a given scope, in registry (declaration) order.
export function listTactics(scope: 'unit' | 'party'): TacticDef[] {
  return Object.values(TACTIC_REGISTRY).filter((t) => t.scope === scope)
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
  partyTactics:           TacticSlot[]                 // team-wide tactics injected into every unit (§5.5)
  ticks: number

  // RUNTIME — regenerated on load; not saved
  locations: Location[]
  battles: Record<string, BattleState>                // locationId → live engine battle (one wave)
  battleCooldown: Record<string, number>              // locationId → ticks until the next wave spawns
  itemSockets: Record<string, string[]>               // §6: itemInstanceId → card itemIds
  eventLog: LogEntry[]                                // §7: ring buffer, last 200 entries
  lastTickAt: number

  // EPHEMERAL_UI — stored in localStorage; not in save string
  activeTab: TabId
  selectedUnitIds: string[]
  selectedLocationId: string | null
  combatLocationId: string | null
  // Map tab view: 'world' = pannable overworld + location details; 'battle' =
  // drop-in battlefield viewer for `combatLocationId`.
  mapMode: 'world' | 'battle'
  mapPageId: string
  expandedLocationIds: string[]
  expandedUnitIds: string[]
  expandedInventorySections: string[]
  expandedRegionIds: string[]
  equipContext: { unitId: string; slot: EquipSlot } | null

  paused: boolean

  // Actions
  tick: () => void
  batchTick: (n: number) => void
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
  // Jump the overworld to a unit's deployed location (roster double-tap).
  showUnitOnMap: (unitId: string) => void
  setMapPage: (id: string) => void
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

const ROUND_EVERY_TICKS   = 2    // advance one engine round every N ticks (~400ms/round)
const BATTLE_RESPAWN_TICKS = 15  // ticks between a finished wave and the next

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

// A location runs one fixed encounter — independent of party size — until we
// have multiple encounter variants per location to randomise across. Scenarios
// can still pin a multi-monster wave (the F2 cross-wall gang); otherwise all
// of the location's monsterIds are used as the wave.
export function waveComposition(loc: Location, _partySize: number): string[] {
  const scen = scenarioOf(loc)
  if (scen?.wave) return scen.wave
  return loc.monsterIds
}

function createBattleFor(loc: Location, party: Unit[], equipment: EquipmentItem[], partyTactics: TacticSlot[]): BattleState {
  const roster = party
  const playerUnits = roster.map((u) => unitToEngineInput(u, getDerivedStats(u, equipment), 'player'))
  const enemyUnits = []
  const wave = waveComposition(loc, roster.length)
  for (let i = 0; i < wave.length; i++) {
    const def = MONSTER_REGISTRY[wave[i]]
    if (def) enemyUnits.push(monsterToEngineInput(def, `${wave[i]}#${i}`, 'enemy'))
  }
  return createBattle({ playerUnits, enemyUnits, playerPartyTactics: partyTactics, barriers: locationBarriers(loc), collectEvents: true })
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

interface CombatStep {
  battles: Record<string, BattleState>
  battleCooldown: Record<string, number>
  hpByUnit: Record<string, number>    // unitId → live HP for units in an active battle
  koUnitIds: Set<string>              // player units that died this tick
  expByUnit: Record<string, number>
  goldEarned: number
  lootDelta: Record<string, number>   // miscItemId → qty gained
  monsterDefeated: Record<string, number>
  monsterSeen: Record<string, number>
  locationMonstersSeen: Record<string, string[]>
  locationStats: Record<string, LocationCombatStats>
  logs: { category: LogCategory; message: string }[]
}

// Runs/advances one engine battle per eligible location. Pure-ish: it mutates
// fresh copies of the runtime combat state and returns the deltas the tick
// reducer folds into units/inventory. `advance` gates the once-per-N-ticks round.
function advanceBattles(s: GameState, newTicks: number, advance: boolean): CombatStep {
  const battles        = { ...s.battles }
  const battleCooldown = { ...s.battleCooldown }
  const monsterDefeated      = { ...s.monsterDefeated }
  const monsterSeen          = { ...s.monsterSeen }
  const locationMonstersSeen = { ...s.locationMonstersSeen }
  const locationStats        = { ...s.locationStats }
  const hpByUnit: Record<string, number> = {}
  const koUnitIds = new Set<string>()
  const expByUnit: Record<string, number> = {}
  const lootDelta: Record<string, number> = {}
  let goldEarned = 0
  const logs: { category: LogCategory; message: string }[] = []

  for (const loc of s.locations) {
    const locationId = loc.id
    const eligible = s.units.filter(
      (u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting,
    )

    // No party or no monsters → tear down any stale battle/cooldown for this loc.
    if (eligible.length === 0 || loc.monsterIds.length === 0) {
      if (battles[locationId]) delete battles[locationId]
      if (battleCooldown[locationId]) delete battleCooldown[locationId]
      continue
    }

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
      // Mark the wave's monsters as seen.
      const seen = [...(locationMonstersSeen[locationId] ?? [])]
      let seenChanged = false
      for (const c of battle.combatants) {
        if (c.team !== 'enemy') continue
        const mid = monsterIdOf(c.id)
        monsterSeen[mid] = (monsterSeen[mid] ?? 0) + 1
        if (!seen.includes(mid)) { seen.push(mid); seenChanged = true }
      }
      if (seenChanged) locationMonstersSeen[locationId] = seen
    }

    // Advance one round on the cadence and reward kills.
    if (advance && battle.outcome === 'ongoing') {
      const enemiesBefore = new Set(
        battle.combatants.filter((c) => c.team === 'enemy' && c.alive).map((c) => c.id),
      )
      advanceRound(battle)
      battles[locationId] = { ...battle }   // new identity so React re-renders

      let killsThisRound = 0
      for (const c of battle.combatants) {
        if (c.team !== 'enemy' || c.alive || !enemiesBefore.has(c.id)) continue
        killsThisRound++
        const mid = monsterIdOf(c.id)
        monsterDefeated[mid] = (monsterDefeated[mid] ?? 0) + 1
        goldEarned++
        const def = MONSTER_REGISTRY[mid]
        const prev = locationStats[locationId] ?? { startTick: newTicks, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
        const itemsDropped = { ...prev.itemsDropped }
        if (def) {
          for (const d of def.drops) {
            if (Math.random() < d.dropRate) {
              const qty = d.quantityMin + Math.floor(Math.random() * (d.quantityMax - d.quantityMin + 1))
              lootDelta[d.itemId]    = (lootDelta[d.itemId] ?? 0) + qty
              itemsDropped[d.itemId] = (itemsDropped[d.itemId] ?? 0) + qty
            }
          }
        }
        locationStats[locationId] = {
          ...prev,
          monstersDefeated: { ...prev.monstersDefeated, [mid]: (prev.monstersDefeated[mid] ?? 0) + 1 },
          itemsDropped,
          expDistributed: prev.expDistributed + 1,
          goldEarned:     prev.goldEarned + 1,
        }
      }
      if (killsThisRound > 0) {
        for (const c of battle.combatants) {
          if (c.team === 'player' && c.alive) expByUnit[c.id] = (expByUnit[c.id] ?? 0) + killsThisRound
        }
      }
      // Flag fresh player deaths from this round's events.
      for (const e of battle.events) {
        if (e.round !== battle.round || e.type !== 'unit_death' || !e.targetId) continue
        const dead = battle.combatants.find((c) => c.id === e.targetId)
        if (dead && dead.team === 'player') koUnitIds.add(dead.id)
      }
      if (battle.outcome !== 'ongoing') {
        battleCooldown[locationId] = BATTLE_RESPAWN_TICKS
        logs.push({ category: battle.outcome === 'victory' ? 'defeat' : 'flee', message: `${loc.name}: ${battle.outcome}` })
      }
    }

    // Sync living player HP back to the game units every tick.
    for (const c of battle.combatants) {
      if (c.team === 'player' && c.alive) hpByUnit[c.id] = c.hp
    }
  }

  return {
    battles, battleCooldown, hpByUnit, koUnitIds, expByUnit, goldEarned, lootDelta,
    monsterDefeated, monsterSeen, locationMonstersSeen, locationStats, logs,
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
  partyTactics: [{ id: 'finish-them', rank: 1 }],
  lastTickAt: Date.now(),
  paused: false,
  eventLog: [],
  itemSockets: {},
  battles: {},
  battleCooldown: {},

  tick: () => set((s) => {
    const newTicks    = s.ticks + 1
    const yearChanged = Math.floor(newTicks / TICKS_PER_YEAR) > Math.floor(s.ticks / TICKS_PER_YEAR)
    let newLog = s.eventLog

    // Drive the engine: one round per ROUND_EVERY_TICKS ticks, live per location.
    const combat = advanceBattles(s, newTicks, newTicks % ROUND_EVERY_TICKS === 0)
    for (const l of combat.logs) newLog = appendLog(newLog, l.category, l.message, newTicks)

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
      return leveled
    })

    const miscItems = (combat.goldEarned > 0 || Object.keys(combat.lootDelta).length > 0)
      ? applyMiscDeltas(s.miscItems, { 'm-gold': combat.goldEarned, ...combat.lootDelta })
      : s.miscItems

    return {
      ticks: newTicks,
      units,
      battles: combat.battles,
      battleCooldown: combat.battleCooldown,
      monsterDefeated: combat.monsterDefeated,
      monsterSeen: combat.monsterSeen,
      locationMonstersSeen: combat.locationMonstersSeen,
      locationStats: combat.locationStats,
      miscItems,
      lastTickAt: Date.now(),
      eventLog: newLog,
    }
  }),

  batchTick: (n) => set((s) => {
    if (n <= 0) return s

    const newTicks    = s.ticks + n
    const yearsPassed = Math.floor(newTicks / TICKS_PER_YEAR) - Math.floor(s.ticks / TICKS_PER_YEAR)

    // No combat driver yet (see tick()): collapse n ticks of recovery/regen.
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
      return { ...u, health, recoveryTicksLeft, isResting, ...aged }
    })

    let eventLog = s.eventLog
    const units = unitsPreLevel.map((u) => {
      const { unit: leveled, log: nextLog } = applyLevelUps(u, newTicks, eventLog)
      eventLog = nextLog
      return leveled
    })

    if (n >= 50) {
      const offlineSecs = Math.round(n / TICKS_PER_SECOND)
      eventLog = appendLog(eventLog, 'offline', `Away ${formatDuration(offlineSecs)}`, newTicks)
    }

    return { ticks: newTicks, units, lastTickAt: Date.now(), eventLog }
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
  enterBattleView: (locationId) => set({ combatLocationId: locationId, mapMode: 'battle', selectedUnitIds: [] }),
  // Zoom back out to the overworld, re-selecting the location we were watching
  // (paged to its region) so the player lands back where they dropped in.
  exitBattleView: () => set((s) => {
    const loc = s.combatLocationId ? s.locations.find((l) => l.id === s.combatLocationId) : null
    return {
      mapMode: 'world',
      ...(loc ? { mapPageId: loc.region, selectedLocationId: loc.id } : {}),
    }
  }),
  // Roster double-tap: pop back to the overworld and frame the unit's location
  // (or just the overworld with nothing selected if it's unassigned).
  showUnitOnMap: (unitId) => set((s) => {
    const u = s.units.find((x) => x.id === unitId)
    const loc = u?.locationId ? s.locations.find((l) => l.id === u.locationId) : null
    return {
      mapMode: 'world',
      ...(loc ? { mapPageId: loc.region, selectedLocationId: loc.id } : { selectedLocationId: null }),
    }
  }),
  setMapPage: (id) => set({ mapPageId: id }),
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
      abilityPoints: 3, skillPoints: 1, learnedSkills: {}, locationId: null, travelPath: null,
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
      items = [...items, { id: recipe.outputItemId, name: recipe.outputName, quantity: recipe.outputQuantity, description: recipe.description }]
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
    return { units: s.units.map((u) => u.id === unitId ? { ...u, skillPoints: u.skillPoints - 1, learnedSkills: { ...u.learnedSkills, [skillId]: current + 1 } } : u) }
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
  moveTactic: (unitId, tacticId, dir) => set((s) => ({
    units: s.units.map((u) => {
      if (u.id !== unitId) return u
      const cur = [...(u.tactics ?? [])]
      const i = cur.findIndex((t) => t.id === tacticId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= cur.length) return u
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
    ;['expandedLocationIds', 'expandedUnitIds', 'expandedInventorySections', 'expandedRegionIds'].forEach((k) => localStorage.removeItem(k))
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
      partyTactics:    [{ id: 'finish-them', rank: 1 }],
      battles:           {},
      battleCooldown:    {},
      ticks:         0,
      lastTickAt:    Date.now(),
      paused:        false,
      eventLog:      [],
      itemSockets:   {},
      activeTab:     'map',
      selectedUnitIds: [],
      selectedLocationId: null,
      combatLocationId: null,
      mapMode: 'world',
      mapPageId: 'world',
      expandedLocationIds: [],
      expandedUnitIds: [],
      expandedInventorySections: ['equipment', 'misc', 'crafting'],
      expandedRegionIds: ['world', 'geffen-dungeon'],
      equipContext: null,
    })
  },
}))
