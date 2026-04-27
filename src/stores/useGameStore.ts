import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  MonsterBehavior, WeaponRecord, EncounterSlot, LogEntry, LogCategory,
} from '@/types'
import { FLEE_TICKS_CONST, RECOVERY_TICKS, REGEN_RATE, TICKS_PER_YEAR, formatDuration } from '@/lib/time'
import { sampleEncounter, isEncounterComplete, randomRespawnTick } from '@/lib/encounter'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { SKILL_REGISTRY } from '@/data/skills'
import { RECIPE_REGISTRY } from '@/data/recipes'
import { INITIAL_EQUIPMENT, INITIAL_MISC } from '@/data/equipment'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { INITIAL_UNITS } from '@/data/units'

// ── Re-exports (keeps existing import paths working) ──────────────────────────

export * from '@/types'
export * from '@/lib/time'
export * from '@/lib/stats'
export * from '@/data/traits'
export * from '@/data/skills'
export * from '@/data/monsters'
export * from '@/data/recipes'
export * from '@/data/equipment'
export * from '@/data/locations'

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
  monsterCooldowns:       Record<string, Record<string, number[]>>  // locationId → monsterId → readyAtTick[]
  ticks: number

  // RUNTIME — regenerated on load; not saved
  locations: Location[]
  encounters: Record<string, EncounterSlot[]>         // §9: locationId → per-slot state
  locationFleeing: Record<string, number>             // locationId → ticks remaining in flee
  itemSockets: Record<string, string[]>               // §6: itemInstanceId → card itemIds
  eventLog: LogEntry[]                                // §7: ring buffer, last 200 entries
  lastTickAt: number

  // EPHEMERAL_UI — stored in localStorage; not in save string
  activeTab: TabId
  selectedUnitIds: string[]
  expandedLocationIds: string[]
  expandedUnitIds: string[]
  expandedInventorySections: string[]
  expandedRegionIds: string[]
  equipContext: { unitId: string; slot: EquipSlot } | null

  offlineSummary: {
    seconds: number; goldEarned: number; monstersDefeated: number; expEarned: number
  } | null
  paused: boolean

  // Actions
  tick: () => void
  batchTick: (n: number) => void
  dismissOfflineSummary: () => void
  togglePause: () => void
  setActiveTab: (tab: TabId) => void
  toggleRegion: (id: string) => void
  toggleLocation: (id: string) => void
  toggleUnit: (id: string) => void
  toggleInventorySection: (id: string) => void
  toggleSelectUnit: (id: string) => void
  clearSelection: () => void
  assignUnits: (unitIds: string[], locationId: string | null) => void
  equipItem: (unitId: string, slot: EquipSlot, itemId: string | null) => void
  openEquipFor: (unitId: string, slot: EquipSlot) => void
  closeEquipContext: () => void
  spendAbilityPoint: (unitId: string, ability: keyof Abilities) => void
  learnSkill: (unitId: string, skillId: string) => void
  recruitUnit: () => void
  craft: (recipeId: string) => void
  setMonsterBehavior: (locationId: string, monsterId: string, behavior: MonsterBehavior) => void
}

// ── Initial encounter state ───────────────────────────────────────────────────

const KANTO_BEACH_IDS = Array.from({ length: 10 }, (_, i) => `beach-${i + 1}`)

function makeSlots(monsterIds: string[]): EncounterSlot[] {
  return monsterIds.map((monsterId) => ({ monsterId, progress: 0, targetUnitId: null, behavior: 'normal' }))
}

const INITIAL_ENCOUNTERS: Record<string, EncounterSlot[]> = {
  'kings-forest': makeSlots(['wolf', 'forest-sprite']),
  'duskwood':     makeSlots(['shadow-wolf', 'shadow-wolf']),
  'lake-arawok':  makeSlots(['giant-frog', 'giant-frog']),
  'gray-hills':   makeSlots(['rock-crab', 'stone-golem']),
  ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, makeSlots(['rock-crab'])])),
}

// ── Event log helper ──────────────────────────────────────────────────────────

function appendLog(log: LogEntry[], category: LogCategory, message: string, tick: number): LogEntry[] {
  return [{ tick, category, message }, ...log].slice(0, 200)
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>((set) => ({
  units:    INITIAL_UNITS,
  locations: INITIAL_LOCATIONS,
  equipment: INITIAL_EQUIPMENT,
  miscItems: INITIAL_MISC,
  activeTab: 'map',
  selectedUnitIds: [],
  expandedLocationIds:       (() => { try { return JSON.parse(localStorage.getItem('expandedLocationIds')       ?? '[]') } catch { return [] } })(),
  expandedUnitIds:           (() => { try { return JSON.parse(localStorage.getItem('expandedUnitIds')           ?? '[]') } catch { return [] } })(),
  expandedInventorySections: (() => { try { return JSON.parse(localStorage.getItem('expandedInventorySections') ?? '["equipment","misc","crafting"]') } catch { return ['equipment', 'misc', 'crafting'] } })(),
  expandedRegionIds:         (() => { try { return JSON.parse(localStorage.getItem('expandedRegionIds')         ?? '["prontera","geffen","kanto"]') } catch { return ['prontera', 'geffen', 'kanto'] } })(),
  equipContext: null,
  learnedRecipes: ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
  locationFamiliarity:  { 'kings-forest': 100, 'duskwood': 75, 'lake-arawok': 50, 'gray-hills': 75, ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, 100])) },
  locationMonstersSeen: { 'kings-forest': ['wolf', 'forest-sprite', 'poacher'], 'duskwood': ['shadow-wolf'], 'lake-arawok': ['giant-frog'], 'gray-hills': ['rock-crab', 'stone-golem'], ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, ['rock-crab']])) },
  monsterSeen:          { wolf: 15, 'forest-sprite': 3, poacher: 1, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
  encounters:     INITIAL_ENCOUNTERS,
  locationFleeing: {},
  ticks: 0,
  monsterDefeated: {},
  monsterCooldowns: {},
  lastTickAt: Date.now(),
  offlineSummary: null,
  paused: false,
  eventLog: [],
  itemSockets: {},

  tick: () => set((s) => {
    const newTicks    = s.ticks + 1
    const yearChanged = Math.floor(newTicks / TICKS_PER_YEAR) > Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounters:      Record<string, EncounterSlot[]> = {}
    const locationFleeing: Record<string, number>          = { ...s.locationFleeing }
    const monsterDefeated  = { ...s.monsterDefeated }
    let monsterCooldowns   = { ...s.monsterCooldowns }
    const expGained: Record<string, number> = {}
    let goldEarned = 0
    const hpDamage: Record<string, number> = {}
    let newLog = s.eventLog

    // Include locations where units are present but have no encounter yet
    const aliveUnitLocs = new Set(s.units.filter((u) => u.locationId && u.health > 0 && u.recoveryTicksLeft === 0).map((u) => u.locationId!))
    const encountersSrc: Record<string, EncounterSlot[]> = { ...s.encounters }
    for (const locId of aliveUnitLocs) { if (!encountersSrc[locId]) encountersSrc[locId] = [] }

    for (const [locationId, slots] of Object.entries(encountersSrc)) {
      const aliveUnits  = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
      const activeSlots = slots.filter((sl) => sl.progress < 1)

      // ── Flee state machine ───────────────────────────────────────────────────
      const fleeLeft = locationFleeing[locationId] ?? 0
      if (fleeLeft > 0) {
        locationFleeing[locationId] = fleeLeft - 1
        encounters[locationId] = fleeLeft === 1
          ? slots.map((sl) => ({ ...sl, progress: 0, targetUnitId: null }))
          : slots.map((sl) => ({ ...sl, targetUnitId: null }))
        continue
      }
      const shouldFlee = aliveUnits.length > 0 && activeSlots.length > 0 && (
        activeSlots.some((sl)  => sl.behavior === 'avoid') ||
        activeSlots.every((sl) => sl.behavior === 'ignore' || sl.behavior === 'avoid')
      )
      if (shouldFlee) {
        locationFleeing[locationId] = FLEE_TICKS_CONST
        encounters[locationId] = slots.map((sl) => ({ ...sl, targetUnitId: null }))
        newLog = appendLog(newLog, 'flee', `Fled from ${locationId}`, newTicks)
        continue
      }
      // ────────────────────────────────────────────────────────────────────────

      if (aliveUnits.length === 0) {
        encounters[locationId] = slots.map((sl) => ({ ...sl, targetUnitId: null }))
        continue
      }

      // Encounter complete → draw next from pool
      if (isEncounterComplete(slots)) {
        const loc = s.locations.find((l) => l.id === locationId)
        encounters[locationId] = loc
          ? sampleEncounter(loc.monsterPool, monsterCooldowns[locationId] ?? {}, newTicks, loc.encounterSize)
          : []
        continue
      }

      // Monster → unit targeting (round-robin over active slots only)
      const targets = slots.map((_, i) => aliveUnits[i % aliveUnits.length].id)

      // Unit → monster targeting (prioritize active slots first)
      const priorityIdxs = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'prioritize' && sl.progress < 1)
      const normalIdxs   = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'normal'     && sl.progress < 1)
      const focusIdxs    = priorityIdxs.length > 0 ? priorityIdxs : normalIdxs
      const attackedSlots = new Set<number>()
      if (focusIdxs.length > 0) {
        aliveUnits.forEach((_, ui) => attackedSlots.add(focusIdxs[ui % focusIdxs.length].i))
      }

      // Damage to units (dead and avoid slots don't deal damage)
      for (let i = 0; i < slots.length; i++) {
        const { monsterId, behavior, progress } = slots[i]
        if (behavior === 'avoid' || progress >= 1) continue
        const monster  = MONSTER_REGISTRY[monsterId]
        const targetId = targets[i]
        if (!monster || !targetId) continue
        const target = s.units.find((u) => u.id === targetId)
        if (!target) continue
        const def = getDerivedStats(target, s.equipment).defense
        hpDamage[targetId] = (hpDamage[targetId] ?? 0) + monster.stats.attack / Math.max(def, 1)
      }

      const defeatedThisTick: string[] = []
      const newSlots = slots.map((slot, i) => {
        const monster = MONSTER_REGISTRY[slot.monsterId]
        if (!monster) return { ...slot, targetUnitId: targets[i] }
        if (slot.progress >= 1) return { ...slot, targetUnitId: null }
        if (slot.behavior === 'ignore' || slot.behavior === 'avoid') return { ...slot, targetUnitId: targets[i] }
        if (!attackedSlots.has(i)) return { ...slot, targetUnitId: targets[i] }
        const newProg = Math.min(slot.progress + 1 / (monster.level * 5), 1)
        if (newProg >= 1) {
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + 1
          expGained[locationId]        = (expGained[locationId] ?? 0) + 1
          goldEarned++
          newLog = appendLog(newLog, 'defeat', `${monster.name} defeated`, newTicks)
          defeatedThisTick.push(slot.monsterId)
          return { ...slot, progress: 1, targetUnitId: null }
        }
        return { ...slot, progress: newProg, targetUnitId: targets[i] }
      })

      // Add pool cooldowns for monsters defeated this tick
      for (const monsterId of defeatedThisTick) {
        const lc = monsterCooldowns[locationId] ?? {}
        monsterCooldowns[locationId] = { ...lc, [monsterId]: [...(lc[monsterId] ?? []), randomRespawnTick(newTicks)] }
      }

      // EXTENSION POINT: trigger for encounter sampling (see backlog.md for future extensions)
      if (isEncounterComplete(newSlots)) {
        const loc = s.locations.find((l) => l.id === locationId)
        encounters[locationId] = loc
          ? sampleEncounter(loc.monsterPool, monsterCooldowns[locationId] ?? {}, newTicks, loc.encounterSize)
          : []
      } else {
        encounters[locationId] = newSlots
      }
    }

    const units = s.units.map((u) => {
      let { health, recoveryTicksLeft } = u
      if (recoveryTicksLeft > 0) {
        recoveryTicksLeft--
        health = Math.min(100, health + REGEN_RATE)
      } else if (health > 0) {
        if (u.locationId) {
          const dmg = hpDamage[u.id] ?? 0
          health = Math.floor(health - dmg)
          if (health <= 0) { health = 0; recoveryTicksLeft = RECOVERY_TICKS; newLog = appendLog(newLog, 'ko', `${u.name} was KO'd`, newTicks) }
        } else {
          health = Math.min(100, health + REGEN_RATE)
        }
      } else {
        health = Math.min(100, health + REGEN_RATE)
      }
      const aged = yearChanged ? { age: u.age + 1 } : {}
      const exp  = (u.locationId && health > 0 && recoveryTicksLeft === 0) ? (expGained[u.locationId] ?? 0) : 0
      return { ...u, health, recoveryTicksLeft, ...aged, exp: u.exp + exp }
    })

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    return { ticks: newTicks, units, encounters, locationFleeing, monsterDefeated, monsterCooldowns, miscItems, lastTickAt: Date.now(), eventLog: newLog }
  }),

  batchTick: (n) => set((s) => {
    if (n <= 0) return s

    const newTicks    = s.ticks + n
    const yearsPassed = Math.floor(newTicks / TICKS_PER_YEAR) - Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounters:      Record<string, EncounterSlot[]> = {}
    const locationFleeing: Record<string, number>          = { ...s.locationFleeing }
    const monsterDefeated  = { ...s.monsterDefeated }
    let monsterCooldowns   = { ...s.monsterCooldowns }
    const expGained: Record<string, number> = {}
    const newDefeats: Record<string, number> = {}
    const locationHadDefeats = new Set<string>()
    let goldEarned   = 0
    let totalDefeats = 0

    const damageRates: Record<string, number> = {}
    const inCombat = new Set<string>()

    // Include locations where units are present but have no encounter yet
    const aliveUnitLocs = new Set(s.units.filter((u) => u.locationId && u.health > 0 && u.recoveryTicksLeft === 0).map((u) => u.locationId!))
    const encountersSrc: Record<string, EncounterSlot[]> = { ...s.encounters }
    for (const locId of aliveUnitLocs) { if (!encountersSrc[locId]) encountersSrc[locId] = [] }

    for (const [locationId, slots] of Object.entries(encountersSrc)) {
      const aliveUnits  = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
      const activeSlots = slots.filter((sl) => sl.progress < 1)

      const wasFleeing = (locationFleeing[locationId] ?? 0) > 0
      const shouldFlee = aliveUnits.length > 0 && activeSlots.length > 0 && (
        activeSlots.some((sl)  => sl.behavior === 'avoid') ||
        activeSlots.every((sl) => sl.behavior === 'ignore' || sl.behavior === 'avoid')
      )
      if (wasFleeing || shouldFlee) {
        locationFleeing[locationId] = 0
        encounters[locationId] = slots.map((sl) => ({ ...sl, progress: 0, targetUnitId: null }))
        continue
      }

      if (aliveUnits.length === 0) {
        encounters[locationId] = slots.map((sl) => ({ ...sl, targetUnitId: null }))
        continue
      }

      // Mark locations with complete encounters for resampling after unit updates
      if (isEncounterComplete(slots)) {
        locationHadDefeats.add(locationId)
        encounters[locationId] = []
        continue
      }

      const targets = slots.map((_, i) => aliveUnits[i % aliveUnits.length])

      const priorityIdxs = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'prioritize' && sl.progress < 1)
      const normalIdxs   = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'normal'     && sl.progress < 1)
      const focusIdxs    = priorityIdxs.length > 0 ? priorityIdxs : normalIdxs
      const attackedSlots = new Set<number>()
      if (focusIdxs.length > 0) {
        aliveUnits.forEach((_, ui) => attackedSlots.add(focusIdxs[ui % focusIdxs.length].i))
      }

      for (let i = 0; i < slots.length; i++) {
        const { monsterId, behavior, progress } = slots[i]
        if (behavior === 'avoid' || progress >= 1) continue
        const monster = MONSTER_REGISTRY[monsterId]
        const target  = targets[i]
        if (!monster || !target) continue
        const def = getDerivedStats(target, s.equipment).defense
        damageRates[target.id] = (damageRates[target.id] ?? 0) + monster.stats.attack / Math.max(def, 1)
        inCombat.add(target.id)
      }

      encounters[locationId] = slots.map((slot, i) => {
        const monster = MONSTER_REGISTRY[slot.monsterId]
        if (!monster) return { ...slot, targetUnitId: targets[i]?.id ?? null }
        if (slot.progress >= 1) return { ...slot, targetUnitId: null }
        if (slot.behavior === 'ignore' || slot.behavior === 'avoid') return { ...slot, targetUnitId: targets[i]?.id ?? null }
        if (!attackedSlots.has(i)) return { ...slot, targetUnitId: targets[i]?.id ?? null }

        const combined    = slot.progress + n / (monster.level * 5)
        const completions = Math.floor(combined)
        if (completions > 0) {
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + completions
          newDefeats[monster.id]      = (newDefeats[monster.id]      ?? 0) + completions
          expGained[locationId]        = (expGained[locationId] ?? 0) + completions
          goldEarned   += completions
          totalDefeats += completions
          locationHadDefeats.add(locationId)
          // Record last defeat as a cooldown; earlier defeats in the batch have already expired
          const lc = monsterCooldowns[locationId] ?? {}
          monsterCooldowns[locationId] = { ...lc, [slot.monsterId]: [...(lc[slot.monsterId] ?? []), randomRespawnTick(newTicks)] }
        }
        return { ...slot, progress: combined - completions, targetUnitId: targets[i]?.id ?? null }
      })
    }

    const totalExpEarned = Object.values(expGained).reduce((a, b) => a + b, 0)

    const units = s.units.map((u) => {
      let { health, recoveryTicksLeft } = u

      if (recoveryTicksLeft > 0) {
        recoveryTicksLeft = Math.max(0, recoveryTicksLeft - n)
        health            = Math.min(100, health + n * REGEN_RATE)
      } else if (inCombat.has(u.id)) {
        const rate         = damageRates[u.id] ?? 0
        const ticksToDeath = rate > 0 ? health / rate : Infinity
        if (ticksToDeath >= n) {
          health = Math.floor(health - rate * n)
        } else {
          const ticksAfterDeath = n - Math.floor(ticksToDeath)
          recoveryTicksLeft     = Math.max(0, RECOVERY_TICKS - ticksAfterDeath)
          const regenTicks      = Math.max(0, ticksAfterDeath - RECOVERY_TICKS)
          health                = Math.min(100, regenTicks * REGEN_RATE)
        }
      } else if (!u.locationId) {
        health = Math.min(100, health + n * REGEN_RATE)
      }

      health = Math.max(0, health)
      const aged = yearsPassed > 0 ? { age: u.age + yearsPassed } : {}
      const exp  = (u.locationId && health > 0 && recoveryTicksLeft === 0) ? (expGained[u.locationId] ?? 0) : 0
      return { ...u, health, recoveryTicksLeft, ...aged, exp: u.exp + exp }
    })

    // Resample encounters where combat happened; otherwise update targets to post-batch alive state
    for (const [locationId, slots] of Object.entries(encounters)) {
      const finalAlive = units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
      if (locationHadDefeats.has(locationId) && finalAlive.length > 0) {
        const loc = s.locations.find((l) => l.id === locationId)
        encounters[locationId] = loc
          ? sampleEncounter(loc.monsterPool, monsterCooldowns[locationId] ?? {}, newTicks, loc.encounterSize)
          : []
      } else {
        encounters[locationId] = slots.map((sl, i) => ({
          ...sl, targetUnitId: finalAlive.length > 0 ? finalAlive[i % finalAlive.length].id : null,
        }))
      }
    }

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    const offlineSummary = n >= 10
      ? { seconds: n, goldEarned, monstersDefeated: totalDefeats, expEarned: totalExpEarned }
      : s.offlineSummary

    let eventLog = s.eventLog
    if (n >= 10) {
      const defeatParts = Object.entries(newDefeats)
        .map(([id, count]) => `${MONSTER_REGISTRY[id]?.name ?? id} ×${count}`)
        .join(', ')
      const msg = `Away ${formatDuration(n)}${defeatParts ? ` — ${defeatParts}` : ' — no combat'}`
      eventLog = appendLog(eventLog, 'offline', msg, newTicks)
    }

    return { ticks: newTicks, units, encounters, locationFleeing, monsterDefeated, monsterCooldowns, miscItems, lastTickAt: Date.now(), offlineSummary, eventLog }
  }),

  dismissOfflineSummary: () => set({ offlineSummary: null }),
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
  assignUnits: (unitIds, locationId) => set((s) => ({
    units: s.units.map((u) => unitIds.includes(u.id) ? { ...u, locationId, travelPath: null } : u),
    selectedUnitIds: [],
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
    const NAMES = ['Brom','Cass','Dara','Fen','Gale','Holt','Issa','Jorn','Kara','Lexa','Mack','Nira','Orin','Pell','Quinn','Roan','Sela','Tarn','Vex','Wren','Zora']
    const used = new Set(s.units.map((u) => u.name))
    const pool = NAMES.filter((n) => !used.has(n))
    const name = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : `Recruit ${s.units.length + 1}`
    const r = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo
    const unit: Unit = {
      id: `u${Date.now()}`, name, level: 1, exp: 0, expToNext: 100,
      age: r(16, 30), health: 100, recoveryTicksLeft: 0, class: null, proficiencies: [],
      abilities: { strength: r(2,5), agility: r(2,5), dexterity: r(2,5), constitution: r(2,5), intelligence: r(2,5) },
      abilityPoints: 3, skillPoints: 1, learnedSkills: {}, locationId: null, travelPath: null,
      weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
      activeWeaponSet: 0,
      equipment: { armor: null, tool: null, accessory: null },
    }
    return { units: [...s.units, unit] }
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

  setMonsterBehavior: (locationId, monsterId, behavior) => set((s) => ({
    encounters: {
      ...s.encounters,
      [locationId]: (s.encounters[locationId] ?? []).map((sl) =>
        sl.monsterId === monsterId ? { ...sl, behavior } : sl
      ),
    },
  })),

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
}))
