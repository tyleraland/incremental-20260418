import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  MonsterBehavior, WeaponRecord, EncounterSlot, LogEntry, LogCategory,
} from '@/types'
import { APPROACH_DISTANCE, APPROACH_SPEED, ATTACK_SPEED_BASE, FLEE_TICKS_CONST, RECOVERY_TICKS, REGEN_RATE, TICKS_PER_SECOND, WAVE_COOLDOWN_MAX, WAVE_COOLDOWN_MIN, TICKS_PER_YEAR, formatDuration } from '@/lib/time'
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
  ticks: number

  // RUNTIME — regenerated on load; not saved
  locations: Location[]
  encounters: Record<string, EncounterSlot[]>         // §9: locationId → active slots only
  encounterCooldown: Record<string, number>           // locationId → ticks until next wave spawns
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
  selectedMonsterSlot: { locationId: string; slotIndex: number } | null
  setSelectedMonsterSlot: (slot: { locationId: string; slotIndex: number } | null) => void
}

// ── Initial encounter state ───────────────────────────────────────────────────

// attackSpeed=10 (baseline) fires every TICKS_PER_SECOND ticks (once per real second).
function calcAttackCooldown(speed: number): number {
  return Math.max(1, Math.round(TICKS_PER_SECOND * ATTACK_SPEED_BASE / speed))
}

// Probability that an attack lands: accuracy / (accuracy + dodge), clamped to [5%, 95%].
function calcHitChance(accuracy: number, dodge: number): number {
  return Math.min(0.95, Math.max(0.05, accuracy / (accuracy + dodge)))
}

const KANTO_BEACH_IDS = Array.from({ length: 10 }, (_, i) => `beach-${i + 1}`)

function makeSlots(monsterIds: string[]): EncounterSlot[] {
  return monsterIds.map((monsterId) => {
    const monster = MONSTER_REGISTRY[monsterId]
    const atkCd   = monster ? calcAttackCooldown(monster.stats.attackSpeed) : TICKS_PER_SECOND
    return {
      monsterId, progress: 0, targetUnitId: null, behavior: 'normal',
      phase: 'approaching' as const, distance: APPROACH_DISTANCE, dealtHistory: [], takenHistory: [],
      attackCooldown:   Math.floor(Math.random() * atkCd) + 1,
      progressCooldown: Math.floor(Math.random() * TICKS_PER_SECOND) + 1,
      lastAttackMissed: false, lastProgressMissed: false,
    }
  })
}

// Spawn a fresh wave for a location using the same monster composition as the initial encounter.
function spawnWave(locationId: string): EncounterSlot[] {
  const template = INITIAL_ENCOUNTERS[locationId]
  if (!template || template.length === 0) return []
  return template.map((sl) => {
    const monster = MONSTER_REGISTRY[sl.monsterId]
    const atkCd   = monster ? calcAttackCooldown(monster.stats.attackSpeed) : TICKS_PER_SECOND
    return {
      monsterId: sl.monsterId, progress: 0, targetUnitId: null, behavior: 'normal' as MonsterBehavior,
      phase: 'approaching' as const, distance: APPROACH_DISTANCE, dealtHistory: [], takenHistory: [],
      attackCooldown:   Math.floor(Math.random() * atkCd) + 1,
      progressCooldown: Math.floor(Math.random() * TICKS_PER_SECOND) + 1,
      lastAttackMissed: false, lastProgressMissed: false,
    }
  })
}

const INITIAL_ENCOUNTERS: Record<string, EncounterSlot[]> = {
  'kings-forest': makeSlots(['slime']),
  'duskwood':     makeSlots(['shadow-wolf', 'shadow-wolf']),
  'lake-arawok':  makeSlots(['giant-frog', 'giant-frog']),
  'gray-hills':   makeSlots(['rock-crab', 'stone-golem']),
  ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, makeSlots(['rock-crab'])])),
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
  locationMonstersSeen: { 'kings-forest': ['slime'], 'duskwood': ['shadow-wolf'], 'lake-arawok': ['giant-frog'], 'gray-hills': ['rock-crab', 'stone-golem'], ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, ['rock-crab']])) },
  monsterSeen:          { slime: 15, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
  encounters:        INITIAL_ENCOUNTERS,
  encounterCooldown: {},
  locationFleeing:   {},
  ticks: 0,
  monsterDefeated: {},
  lastTickAt: Date.now(),
  offlineSummary: null,
  paused: false,
  eventLog: [],
  itemSockets: {},
  selectedMonsterSlot: null,

  tick: () => set((s) => {
    const newTicks    = s.ticks + 1
    const yearChanged = Math.floor(newTicks / TICKS_PER_YEAR) > Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounters:           Record<string, EncounterSlot[]> = {}
    const encounterCooldown:    Record<string, number>          = {}
    const locationFleeing:      Record<string, number>          = { ...s.locationFleeing }
    const monsterDefeated       = { ...s.monsterDefeated }
    const locationMonstersSeen  = { ...s.locationMonstersSeen }
    const expGained: Record<string, number> = {}
    let goldEarned = 0
    const hpDamage: Record<string, number> = {}
    let newLog = s.eventLog

    for (const [locationId, slots] of Object.entries(s.encounters)) {
      // Mark any active slot's monster as seen at this location
      const seen = locationMonstersSeen[locationId] ?? []
      let seenUpdated = false
      for (const slot of slots) {
        if (!seen.includes(slot.monsterId)) { seen.push(slot.monsterId); seenUpdated = true }
      }
      if (seenUpdated) locationMonstersSeen[locationId] = seen

      const aliveUnits = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)

      // ── Flee state machine ───────────────────────────────────────────────────
      const fleeLeft = locationFleeing[locationId] ?? 0
      if (fleeLeft > 0) {
        locationFleeing[locationId] = fleeLeft - 1
        if (fleeLeft === 1) {
          // Flee complete — reset progress and return to approaching
          encounters[locationId] = slots.map((sl) => {
            const m    = MONSTER_REGISTRY[sl.monsterId]
            const atkCd = m ? calcAttackCooldown(m.stats.attackSpeed) : TICKS_PER_SECOND
            return {
              ...sl, progress: 0, targetUnitId: null,
              phase: 'approaching' as const, distance: APPROACH_DISTANCE,
              dealtHistory: [], takenHistory: [],
              attackCooldown:   Math.floor(Math.random() * atkCd) + 1,
              progressCooldown: Math.floor(Math.random() * TICKS_PER_SECOND) + 1,
            }
          })
        } else {
          encounters[locationId] = slots.map((sl) => ({
            ...sl, targetUnitId: null, phase: 'retreating' as const,
          }))
        }
        continue
      }
      const shouldFlee = aliveUnits.length > 0 && slots.length > 0 && (
        slots.some((sl)  => sl.behavior === 'avoid') ||
        slots.every((sl) => sl.behavior === 'ignore' || sl.behavior === 'avoid')
      )
      if (shouldFlee) {
        locationFleeing[locationId] = FLEE_TICKS_CONST
        encounters[locationId] = slots.map((sl) => ({ ...sl, targetUnitId: null, phase: 'retreating' as const }))
        newLog = appendLog(newLog, 'flee', `Fled from ${locationId}`, newTicks)
        continue
      }
      // ────────────────────────────────────────────────────────────────────────

      if (aliveUnits.length === 0) {
        encounters[locationId] = slots.map((sl) => ({ ...sl, targetUnitId: null }))
        continue
      }

      // Monster → unit targeting (round-robin, for damage)
      const targets = slots.map((_, i) => aliveUnits[i % aliveUnits.length].id)

      // Unit → monster targeting (prioritize slots first)
      const priorityIdxs  = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'prioritize')
      const normalIdxs    = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'normal')
      const focusIdxs     = priorityIdxs.length > 0 ? priorityIdxs : normalIdxs
      const attackedSlots = new Set<number>()
      if (focusIdxs.length > 0) {
        aliveUnits.forEach((_, ui) => attackedSlots.add(focusIdxs[ui % focusIdxs.length].i))
      }

      // Process slots: manage attack/progress cooldowns; handle phase transitions
      const newSlots: EncounterSlot[] = []
      for (let i = 0; i < slots.length; i++) {
        const slot    = slots[i]
        const monster = MONSTER_REGISTRY[slot.monsterId]
        if (!monster) { newSlots.push({ ...slot, targetUnitId: targets[i] }); continue }

        if (slot.progress >= 1) {
          // Defeated — award loot and remove from encounter
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + 1
          expGained[locationId]       = (expGained[locationId] ?? 0) + 1
          goldEarned++
          newLog = appendLog(newLog, 'defeat', `${monster.name} defeated`, newTicks)
          continue
        }

        // Phase transition: approaching → standing (cooldowns don't tick during approach)
        if (slot.phase === 'approaching') {
          const newDist = slot.distance - APPROACH_SPEED
          if (newDist <= 0) {
            newSlots.push({ ...slot, phase: 'standing', distance: 0, targetUnitId: targets[i] })
          } else {
            newSlots.push({ ...slot, distance: newDist, targetUnitId: targets[i] })
          }
          continue
        }

        // Standing: manage cooldowns
        let newAtkCd    = slot.attackCooldown
        let newProgCd   = slot.progressCooldown
        let newProgress = slot.progress
        let dealtHistory        = slot.dealtHistory ?? []
        let takenHistory        = slot.takenHistory ?? []
        let lastAttackMissed    = slot.lastAttackMissed
        let lastProgressMissed  = slot.lastProgressMissed

        // Monster attack fires on cooldown expiry (non-avoid slots only)
        if (slot.behavior !== 'avoid') {
          if (slot.attackCooldown <= 0) {
            const targetId = targets[i]
            const target   = targetId ? s.units.find((u) => u.id === targetId) : null
            if (target) {
              const derived = getDerivedStats(target, s.equipment)
              const hit     = Math.random() < calcHitChance(monster.stats.accuracy, derived.dodge)
              if (hit) {
                const dmg = monster.stats.attack / Math.max(derived.defense, 1)
                hpDamage[targetId!] = (hpDamage[targetId!] ?? 0) + dmg
                dealtHistory = [...dealtHistory, dmg].slice(-60)
              }
              lastAttackMissed = !hit
            }
            newAtkCd = calcAttackCooldown(monster.stats.attackSpeed)
          } else {
            newAtkCd = slot.attackCooldown - 1
          }
        }

        // Unit progress fires on cooldown expiry (attacked slots only)
        if (attackedSlots.has(i)) {
          if (slot.progressCooldown <= 0) {
            const attackingUnit = aliveUnits.length > 0 ? aliveUnits[0] : null
            if (attackingUnit) {
              const unitDerived  = getDerivedStats(attackingUnit, s.equipment)
              const unitCooldown = calcAttackCooldown(unitDerived.attackSpeed)
              const hit          = Math.random() < calcHitChance(unitDerived.accuracy, monster.stats.dodge)
              if (hit) {
                const chunk  = unitCooldown / (monster.level * 5 * TICKS_PER_SECOND)
                newProgress  = Math.min(slot.progress + chunk, 1)
                takenHistory = [...takenHistory, chunk].slice(-60)
              }
              lastProgressMissed = !hit
              newProgCd = unitCooldown
            }
          } else {
            newProgCd = slot.progressCooldown - 1
          }
        }

        newSlots.push({
          ...slot,
          progress: newProgress,
          targetUnitId: targets[i],
          attackCooldown: newAtkCd,
          progressCooldown: newProgCd,
          dealtHistory,
          takenHistory,
          lastAttackMissed,
          lastProgressMissed,
        })
      }
      encounters[locationId] = newSlots

      // When the last monster leaves, start the cooldown before the next wave
      if (slots.length > 0 && newSlots.length === 0) {
        encounterCooldown[locationId] = WAVE_COOLDOWN_MIN + Math.floor(Math.random() * (WAVE_COOLDOWN_MAX - WAVE_COOLDOWN_MIN + 1))
      }
    }

    // Process wave cooldowns from previous state
    for (const [locationId, cd] of Object.entries(s.encounterCooldown)) {
      const newCd = cd - 1
      if (newCd <= 0) {
        encounters[locationId] = spawnWave(locationId)
      } else {
        encounterCooldown[locationId] = newCd
      }
    }

    const units = s.units.map((u) => {
      let { health, recoveryTicksLeft } = u
      const maxHp = getDerivedStats(u, s.equipment).maxHp
      if (recoveryTicksLeft > 0) {
        recoveryTicksLeft--
        health = Math.min(maxHp, health + REGEN_RATE)
      } else if (health > 0) {
        if (u.locationId) {
          const dmg = hpDamage[u.id] ?? 0
          health = Math.floor(health - dmg)
          if (health <= 0) { health = 0; recoveryTicksLeft = RECOVERY_TICKS; newLog = appendLog(newLog, 'ko', `${u.name} was KO'd`, newTicks) }
        } else {
          health = Math.min(maxHp, health + REGEN_RATE)
        }
      } else {
        health = Math.min(maxHp, health + REGEN_RATE)
      }
      const aged   = yearChanged ? { age: u.age + 1 } : {}
      const expAdd = (u.locationId && health > 0 && recoveryTicksLeft === 0) ? (expGained[u.locationId] ?? 0) : 0
      const withExp = { ...u, health, recoveryTicksLeft, ...aged, exp: u.exp + expAdd }
      const { unit: leveled, log: nextLog } = applyLevelUps(withExp, newTicks, newLog)
      newLog = nextLog
      return leveled
    })

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    return { ticks: newTicks, units, encounters, encounterCooldown, locationFleeing, monsterDefeated, locationMonstersSeen, miscItems, lastTickAt: Date.now(), eventLog: newLog }
  }),

  batchTick: (n) => set((s) => {
    if (n <= 0) return s

    const newTicks    = s.ticks + n
    const yearsPassed = Math.floor(newTicks / TICKS_PER_YEAR) - Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounters:      Record<string, EncounterSlot[]> = {}
    const locationFleeing: Record<string, number>          = { ...s.locationFleeing }
    const monsterDefeated  = { ...s.monsterDefeated }
    const expGained: Record<string, number> = {}
    const newDefeats: Record<string, number> = {}
    let goldEarned   = 0
    let totalDefeats = 0

    const damageRates: Record<string, number> = {}
    const inCombat = new Set<string>()

    for (const [locationId, slots] of Object.entries(s.encounters)) {
      const aliveUnits = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)

      const wasFleeing = (locationFleeing[locationId] ?? 0) > 0
      const shouldFlee = aliveUnits.length > 0 && slots.length > 0 && (
        slots.some((sl)  => sl.behavior === 'avoid') ||
        slots.every((sl) => sl.behavior === 'ignore' || sl.behavior === 'avoid')
      )
      if (wasFleeing || shouldFlee) {
        locationFleeing[locationId] = 0
        encounters[locationId] = slots.map((sl) => ({
          ...sl, progress: 0, targetUnitId: null,
          phase: 'approaching' as const, distance: APPROACH_DISTANCE,
          dealtHistory: [], takenHistory: [], attackCooldown: 0, progressCooldown: 0,
        }))
        continue
      }

      if (aliveUnits.length === 0) {
        encounters[locationId] = slots.map((sl) => ({ ...sl, targetUnitId: null }))
        continue
      }

      const targets = slots.map((_, i) => aliveUnits[i % aliveUnits.length])

      const priorityIdxs  = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'prioritize')
      const normalIdxs    = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.behavior === 'normal')
      const focusIdxs     = priorityIdxs.length > 0 ? priorityIdxs : normalIdxs
      const attackedSlots = new Set<number>()
      if (focusIdxs.length > 0) {
        aliveUnits.forEach((_, ui) => attackedSlots.add(focusIdxs[ui % focusIdxs.length].i))
      }

      for (let i = 0; i < slots.length; i++) {
        const { monsterId, behavior } = slots[i]
        if (behavior === 'avoid') continue
        const monster = MONSTER_REGISTRY[monsterId]
        const target  = targets[i]
        if (!monster || !target) continue
        const def = getDerivedStats(target, s.equipment).defense
        // Divide by TICKS_PER_SECOND to convert from HP/sec to HP/tick at 5/sec
        damageRates[target.id] = (damageRates[target.id] ?? 0) + (monster.stats.attack * monster.stats.attackSpeed / ATTACK_SPEED_BASE) / Math.max(def, 1) / TICKS_PER_SECOND
        inCombat.add(target.id)
      }

      encounters[locationId] = slots.map((slot, i) => {
        const monster = MONSTER_REGISTRY[slot.monsterId]
        // In batch mode, approaching slots immediately become standing
        const baseSlot = slot.phase === 'approaching'
          ? { ...slot, phase: 'standing' as const, distance: 0, dealtHistory: [], takenHistory: [] }
          : slot
        if (!monster) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }

        if (baseSlot.behavior === 'ignore' || baseSlot.behavior === 'avoid') return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }
        if (!attackedSlots.has(i)) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }

        const seconds       = monster.level * 5  // kill time in real seconds
        const effectiveProg = baseSlot.progress >= 1 ? 0 : baseSlot.progress
        const combined      = effectiveProg + (n / TICKS_PER_SECOND) / seconds
        const completions   = Math.floor(combined)
        if (completions > 0) {
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + completions
          newDefeats[monster.id]      = (newDefeats[monster.id]      ?? 0) + completions
          expGained[locationId]        = (expGained[locationId] ?? 0) + completions
          goldEarned   += completions
          totalDefeats += completions
        }
        return { ...baseSlot, progress: combined - completions, targetUnitId: targets[i]?.id ?? null, attackCooldown: 0, progressCooldown: 0 }
      })
    }

    // Expire any wave cooldowns that fit within the batch window; spawn fresh waves
    const encounterCooldown: Record<string, number> = {}
    for (const [locationId, cd] of Object.entries(s.encounterCooldown)) {
      const newCd = cd - n
      if (newCd <= 0) {
        encounters[locationId] = spawnWave(locationId)
      } else {
        encounterCooldown[locationId] = newCd
      }
    }

    const totalExpEarned = Object.values(expGained).reduce((a, b) => a + b, 0)

    const unitsPreLevel = s.units.map((u) => {
      let { health, recoveryTicksLeft } = u
      const maxHp = getDerivedStats(u, s.equipment).maxHp

      if (recoveryTicksLeft > 0) {
        recoveryTicksLeft = Math.max(0, recoveryTicksLeft - n)
        health            = Math.min(maxHp, health + n * REGEN_RATE)
      } else if (inCombat.has(u.id)) {
        const rate         = damageRates[u.id] ?? 0
        const ticksToDeath = rate > 0 ? health / rate : Infinity
        if (ticksToDeath >= n) {
          health = Math.floor(health - rate * n)
        } else {
          const ticksAfterDeath = n - Math.floor(ticksToDeath)
          recoveryTicksLeft     = Math.max(0, RECOVERY_TICKS - ticksAfterDeath)
          const regenTicks      = Math.max(0, ticksAfterDeath - RECOVERY_TICKS)
          health                = Math.min(maxHp, regenTicks * REGEN_RATE)
        }
      } else if (!u.locationId) {
        health = Math.min(maxHp, health + n * REGEN_RATE)
      }

      health = Math.max(0, health)
      const aged   = yearsPassed > 0 ? { age: u.age + yearsPassed } : {}
      const expAdd = (u.locationId && health > 0 && recoveryTicksLeft === 0) ? (expGained[u.locationId] ?? 0) : 0
      return { ...u, health, recoveryTicksLeft, ...aged, exp: u.exp + expAdd }
    })

    let eventLog = s.eventLog
    const units = unitsPreLevel.map((u) => {
      const { unit: leveled, log: nextLog } = applyLevelUps(u, newTicks, eventLog)
      eventLog = nextLog
      return leveled
    })

    // Update encounter targets based on post-batch alive state
    for (const [locationId, slots] of Object.entries(encounters)) {
      const finalAlive = units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
      encounters[locationId] = slots.map((sl, i) => ({
        ...sl, targetUnitId: finalAlive.length > 0 ? finalAlive[i % finalAlive.length].id : null,
      }))
    }

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    const offlineSecs    = Math.round(n / TICKS_PER_SECOND)
    const offlineSummary = n >= 50
      ? { seconds: offlineSecs, goldEarned, monstersDefeated: totalDefeats, expEarned: totalExpEarned }
      : s.offlineSummary

    if (n >= 50) {
      const defeatParts = Object.entries(newDefeats)
        .map(([id, count]) => `${MONSTER_REGISTRY[id]?.name ?? id} ×${count}`)
        .join(', ')
      const msg = `Away ${formatDuration(offlineSecs)}${defeatParts ? ` — ${defeatParts}` : ' — no combat'}`
      eventLog = appendLog(eventLog, 'offline', msg, newTicks)
    }

    return { ticks: newTicks, units, encounters, encounterCooldown, locationFleeing, monsterDefeated, miscItems, lastTickAt: Date.now(), offlineSummary, eventLog }
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
  assignUnits: (unitIds, locationId) => set((s) => {
    const newUnits = s.units.map((u) => unitIds.includes(u.id) ? { ...u, locationId, travelPath: null } : u)

    const encounters = { ...s.encounters }
    const encounterCooldown = { ...s.encounterCooldown }

    // Source locations that lost all units → clear encounter so monsters return to pool
    const fromIds = new Set(
      unitIds.map((id) => s.units.find((u) => u.id === id)?.locationId).filter((id): id is string => !!id)
    )
    for (const fromId of fromIds) {
      if (newUnits.every((u) => u.locationId !== fromId)) {
        delete encounters[fromId]
        delete encounterCooldown[fromId]
      }
    }

    // Destination: spawn a fresh encounter if none exists yet
    if (locationId && !encounters[locationId]) {
      const fresh = spawnWave(locationId)
      if (fresh.length > 0) encounters[locationId] = fresh
    }

    return { units: newUnits, selectedUnitIds: [], encounters, encounterCooldown }
  }),

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
      id: `u${Date.now()}`, name, level: 1, exp: 0, expToNext: expForLevel(1),
      age: r(16, 30), health: 100, recoveryTicksLeft: 0, class: null, proficiencies: [],
      abilities: { strength: r(2,5), agility: r(2,5), dexterity: r(2,5), constitution: r(2,5), intelligence: r(2,5) },
      abilityPoints: 3, skillPoints: 1, learnedSkills: {}, locationId: null, travelPath: null,
      weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
      activeWeaponSet: 0,
      equipment: { armor: null, tool: null, accessory: null },
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

  setSelectedMonsterSlot: (slot) => set({ selectedMonsterSlot: slot }),

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
