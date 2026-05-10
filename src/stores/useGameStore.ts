import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  MonsterBehavior, WeaponRecord, EncounterSlot, LogEntry, LogCategory,
  LocationCombatStats,
} from '@/types'
import { APPROACH_DISTANCE, APPROACH_SPEED, ATTACK_SPEED_BASE, FLEE_TICKS_CONST, RECOVERY_TICKS, REGEN_RATE, RESTING_REGEN_RATE, TICKS_PER_SECOND, WAVE_COOLDOWN_MAX, WAVE_COOLDOWN_MIN, TICKS_PER_YEAR, formatDuration } from '@/lib/time'
import { getDerivedStats, getFormationOffset } from '@/lib/stats'
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
export * from '@/lib/combatReport'
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
  locationStats:          Record<string, LocationCombatStats>  // locationId → cumulative combat stats
  ticks: number

  // RUNTIME — regenerated on load; not saved
  locations: Location[]
  encounters: Record<string, EncounterSlot[]>         // §9: locationId → active slots only
  encounterCooldown: Record<string, number>           // locationId → ticks until next wave spawns
  locationFleeing: Record<string, number>             // locationId → ticks remaining in flee
  unitDistance: Record<string, number>                // unitId → 1D position in current encounter (0 = home base)
  itemSockets: Record<string, string[]>               // §6: itemInstanceId → card itemIds
  eventLog: LogEntry[]                                // §7: ring buffer, last 200 entries
  lastTickAt: number

  // EPHEMERAL_UI — stored in localStorage; not in save string
  activeTab: TabId
  selectedUnitIds: string[]
  selectedLocationId: string | null
  combatLocationId: string | null
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
  setMapPage: (id: string) => void
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
export function calcAttackCooldown(speed: number): number {
  return Math.max(1, Math.round(TICKS_PER_SECOND * ATTACK_SPEED_BASE / speed))
}

// Probability that an attack lands: accuracy / (accuracy + dodge), clamped to [5%, 95%].
function calcHitChance(accuracy: number, dodge: number): number {
  return Math.min(0.95, Math.max(0.05, accuracy / (accuracy + dodge)))
}

const KANTO_BEACH_IDS = Array.from({ length: 9 }, (_, i) => `beach-${i + 1}`)

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

// All Prontera + Geffen locations currently use a slime placeholder. We'll
// override individual templates as locations are customized. Listed by id so
// spawnWave / wave-cooldown logic can find a template for each.
const PRONTERA_FIELD_IDS = Array.from({ length: 6 }, (_, i) => `prontera-field-${i + 1}`)
const GEFFEN_FIELD_IDS   = Array.from({ length: 7 }, (_, i) => `geffen-field-${i + 1}`)

const PLACEHOLDER_LOCATION_IDS = [
  ...PRONTERA_FIELD_IDS,
  'prontera-city', 'kings-forest', 'duskwood',
  ...GEFFEN_FIELD_IDS,
  'geffen-city', 'mount-mjolnir',
]

const GEFFEN_DUNGEON_IDS = Array.from({ length: 5 }, (_, i) => `geffen-dungeon-${i + 1}`)

// Per-location wave generator. Called both at module load (to seed
// INITIAL_ENCOUNTERS) and on every respawn. Returning a plain string[] keeps
// the door open for randomized wave compositions per spawn.
const WAVE_TEMPLATES: Record<string, () => string[]> = {
  ...Object.fromEntries(PLACEHOLDER_LOCATION_IDS.map((id) => [id, () => ['slime']])),
  // Geffen Dungeon: 1 or 2 bats per wave.
  ...Object.fromEntries(GEFFEN_DUNGEON_IDS.map((id) => [id, () => Math.random() < 0.5 ? ['bat'] : ['bat', 'bat']])),
  ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, () => ['rock-crab']])),
}

// Spawn a fresh wave for a location using its WAVE_TEMPLATES generator.
function spawnWave(locationId: string): EncounterSlot[] {
  const fn = WAVE_TEMPLATES[locationId]
  if (!fn) return []
  return makeSlots(fn())
}

const INITIAL_ENCOUNTERS: Record<string, EncounterSlot[]> = Object.fromEntries(
  Object.entries(WAVE_TEMPLATES).map(([id, fn]) => [id, makeSlots(fn())]),
)

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
  selectedLocationId: null,
  combatLocationId: null,
  mapPageId: 'prontera',
  expandedLocationIds:       (() => { try { return JSON.parse(localStorage.getItem('expandedLocationIds')       ?? '[]') } catch { return [] } })(),
  expandedUnitIds:           (() => { try { return JSON.parse(localStorage.getItem('expandedUnitIds')           ?? '[]') } catch { return [] } })(),
  expandedInventorySections: (() => { try { return JSON.parse(localStorage.getItem('expandedInventorySections') ?? '["equipment","misc","crafting"]') } catch { return ['equipment', 'misc', 'crafting'] } })(),
  expandedRegionIds:         (() => { try { return JSON.parse(localStorage.getItem('expandedRegionIds')         ?? '["prontera","geffen","kanto"]') } catch { return ['prontera', 'geffen', 'kanto'] } })(),
  equipContext: null,
  learnedRecipes: ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
  locationFamiliarity:  { 'kings-forest': 100, 'duskwood': 75, ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, 100])) },
  locationMonstersSeen: { 'kings-forest': ['slime'], 'duskwood': ['slime'], ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, ['rock-crab']])) },
  monsterSeen:          { slime: 15, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
  encounters:        INITIAL_ENCOUNTERS,
  encounterCooldown: {},
  locationFleeing:   {},
  unitDistance:      {},
  ticks: 0,
  monsterDefeated: {},
  locationStats: {},
  lastTickAt: Date.now(),
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
    const monsterSeen           = { ...s.monsterSeen }
    const locationMonstersSeen  = { ...s.locationMonstersSeen }
    const locationStats         = { ...s.locationStats }
    const expGained: Record<string, number> = {}
    let goldEarned = 0
    const hpDamage: Record<string, number> = {}
    const unitDistance: Record<string, number> = { ...s.unitDistance }
    let newLog = s.eventLog

    for (const [locationId, slots] of Object.entries(s.encounters)) {
      // Mark any active slot's monster as seen at this location
      const seen = locationMonstersSeen[locationId] ?? []
      let seenUpdated = false
      for (const slot of slots) {
        if (!seen.includes(slot.monsterId)) { seen.push(slot.monsterId); seenUpdated = true }
      }
      if (seenUpdated) locationMonstersSeen[locationId] = seen

      const aliveUnits = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting)

      // ── Flee state machine ───────────────────────────────────────────────────
      const fleeLeft = locationFleeing[locationId] ?? 0
      if (fleeLeft > 0) {
        locationFleeing[locationId] = fleeLeft - 1
        if (fleeLeft === 1) {
          // Flee complete — reset progress and return to approaching; reset unit positions
          for (const u of s.units) if (u.locationId === locationId) unitDistance[u.id] = 0
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
          // During flee: monsters drift back toward APPROACH_DISTANCE; units drift back toward 0
          for (const u of s.units) {
            if (u.locationId !== locationId) continue
            const ud = getDerivedStats(u, s.equipment)
            const cur = unitDistance[u.id] ?? 0
            unitDistance[u.id] = Math.max(0, cur - Math.max(0.1, ud.moveSpeed / TICKS_PER_SECOND))
          }
          encounters[locationId] = slots.map((sl) => {
            const m = MONSTER_REGISTRY[sl.monsterId]
            const speed = Math.max(0.1, (m?.stats.moveSpeed ?? 5) / TICKS_PER_SECOND)
            return {
              ...sl, targetUnitId: null, phase: 'retreating' as const,
              distance: Math.min(APPROACH_DISTANCE, sl.distance + speed),
            }
          })
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

      // ── Movement on the 1D combat axis ──────────────────────────────────────
      // Old monster positions, old unit positions
      const oldUnitPos: Record<string, number> = {}
      for (const u of aliveUnits) oldUnitPos[u.id] = unitDistance[u.id] ?? 0

      // Step monsters first using old unit positions
      const newSlotPos: number[] = slots.map((sl) => sl.distance)
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i]
        if (sl.behavior === 'avoid') continue              // avoid mode = monster doesn't close
        const monster = MONSTER_REGISTRY[sl.monsterId]; if (!monster) continue
        const tId = targets[i]; if (!tId) continue
        const tPos = oldUnitPos[tId] ?? 0
        const range = monster.stats.attackRange ?? 5
        const speed = (monster.stats.moveSpeed ?? 5) / TICKS_PER_SECOND
        const desiredPos = tPos + range
        if (sl.distance > desiredPos) {
          newSlotPos[i] = Math.max(sl.distance - speed, desiredPos)
        }
      }

      // Each unit either:
      //  - has a focus monster → advance toward `monsterPos - attackRange` so
      //    both sides close the gap and a fast actor engages sooner; the
      //    formation offset acts as a floor so back-rank units don't get
      //    pushed past their rank when a monster overruns the line.
      //  - has no focus (no slots, or no monsters in their assigned wave) →
      //    drift back toward formation offset.
      const unitToSlot: Record<string, number> = {}
      for (let ui = 0; ui < aliveUnits.length; ui++) {
        if (focusIdxs.length === 0) continue
        unitToSlot[aliveUnits[ui].id] = focusIdxs[ui % focusIdxs.length].i
      }
      for (const u of aliveUnits) {
        const ud = getDerivedStats(u, s.equipment)
        const formation = getFormationOffset(u, s.equipment)
        const slotIdx = unitToSlot[u.id]
        const cur = oldUnitPos[u.id]
        const desired = slotIdx !== undefined
          ? Math.max(formation, newSlotPos[slotIdx] - ud.attackRange)
          : formation
        const step = ud.moveSpeed / TICKS_PER_SECOND
        if (cur < desired)      unitDistance[u.id] = Math.min(cur + step, desired)
        else if (cur > desired) unitDistance[u.id] = Math.max(cur - step, desired)
        else                    unitDistance[u.id] = cur
      }

      // ── Process slots: engagement gated by gap vs attackRange ───────────────
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
          const prev = locationStats[locationId] ?? { startTick: newTicks, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
          locationStats[locationId] = {
            ...prev,
            monstersDefeated: { ...prev.monstersDefeated, [monster.id]: (prev.monstersDefeated[monster.id] ?? 0) + 1 },
            expDistributed: prev.expDistributed + 1,
            goldEarned:     prev.goldEarned + 1,
          }
          newLog = appendLog(newLog, 'defeat', `${monster.name} defeated`, newTicks)
          continue
        }

        const monsterRange  = monster.stats.attackRange ?? 5
        const monsterPos    = newSlotPos[i]
        const targetId      = targets[i]
        const targetPos     = targetId ? (unitDistance[targetId] ?? 0) : 0
        const monsterInRange = (monsterPos - targetPos) <= monsterRange
        const phase: 'approaching' | 'standing' = monsterInRange ? 'standing' : 'approaching'

        // If not in range, no cooldowns tick — preserves "approach" semantics
        if (!monsterInRange) {
          newSlots.push({ ...slot, distance: monsterPos, targetUnitId: targets[i], phase })
          continue
        }

        let newAtkCd    = slot.attackCooldown
        let newProgCd   = slot.progressCooldown
        let newProgress = slot.progress
        let dealtHistory        = slot.dealtHistory ?? []
        let takenHistory        = slot.takenHistory ?? []
        let lastAttackMissed    = slot.lastAttackMissed
        let lastProgressMissed  = slot.lastProgressMissed

        // Monster attack fires on cooldown expiry (non-avoid slots in monster range)
        if (slot.behavior !== 'avoid') {
          if (slot.attackCooldown <= 0) {
            const target = targetId ? s.units.find((u) => u.id === targetId) : null
            if (target) {
              const derived = getDerivedStats(target, s.equipment)
              const hit     = Math.random() < calcHitChance(monster.stats.accuracy, derived.dodge)
              const dmg     = monster.stats.attack / Math.max(derived.defense, 1)
              if (hit) hpDamage[targetId!] = (hpDamage[targetId!] ?? 0) + dmg
              dealtHistory     = [...dealtHistory, hit ? Math.ceil(dmg) : 0].slice(-10)
              lastAttackMissed = !hit
            }
            newAtkCd = Math.max(0, calcAttackCooldown(monster.stats.attackSpeed) - 1)
          } else {
            newAtkCd = slot.attackCooldown - 1
          }
        }

        // Unit progress fires on cooldown expiry (attacked slots; only attackers in unit range count)
        if (attackedSlots.has(i)) {
          // Filter attackers to those whose own unit attack range covers this slot
          const attackersOfSlot = aliveUnits.filter((_, ui) =>
            focusIdxs.length > 0 && focusIdxs[ui % focusIdxs.length].i === i
          ).filter((au) => {
            const ud = getDerivedStats(au, s.equipment)
            return (monsterPos - (unitDistance[au.id] ?? 0)) <= ud.attackRange
          })

          if (attackersOfSlot.length > 0 && slot.progressCooldown <= 0) {
            let totalChunk = 0
            let allMissed  = true
            let resetCd    = TICKS_PER_SECOND
            for (const [aidx, au] of attackersOfSlot.entries()) {
              const ud  = getDerivedStats(au, s.equipment)
              const uc  = calcAttackCooldown(ud.attackSpeed)
              if (aidx === 0) resetCd = uc
              const hit     = Math.random() < calcHitChance(ud.accuracy, monster.stats.dodge)
              const rawChunk = uc / (monster.level * 5 * TICKS_PER_SECOND)
              const chunk   = Math.round(rawChunk * monster.health) / monster.health
              if (hit) { totalChunk += chunk; allMissed = false }
            }
            if (totalChunk > 0) newProgress = Math.min(slot.progress + totalChunk, 1)
            takenHistory       = [...takenHistory, totalChunk].slice(-10)
            lastProgressMissed = allMissed
            newProgCd          = Math.max(0, resetCd - 1)
          } else if (attackersOfSlot.length > 0) {
            newProgCd = slot.progressCooldown - 1
          }
        }

        newSlots.push({
          ...slot,
          progress: newProgress,
          distance: monsterPos,
          phase,
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

      // When the last monster leaves, start the cooldown before the next wave.
      // Units stay where they are — formation drift will pull them back during hunting.
      if (slots.length > 0 && newSlots.length === 0) {
        encounterCooldown[locationId] = WAVE_COOLDOWN_MIN + Math.floor(Math.random() * (WAVE_COOLDOWN_MAX - WAVE_COOLDOWN_MIN + 1))
      }
    }

    // Process wave cooldowns from previous state
    for (const [locationId, cd] of Object.entries(s.encounterCooldown)) {
      const newCd = cd - 1
      if (newCd <= 0) {
        const wave = spawnWave(locationId)
        encounters[locationId] = wave
        for (const sl of wave) monsterSeen[sl.monsterId] = (monsterSeen[sl.monsterId] ?? 0) + 1
      } else {
        encounterCooldown[locationId] = newCd
      }
    }

    const units = s.units.map((u) => {
      let health = u.health
      let recoveryTicksLeft = Math.max(0, Math.round(u.recoveryTicksLeft ?? 0))
      let isResting = u.isResting || (health === 0 && recoveryTicksLeft === 0)
      const maxHp = getDerivedStats(u, s.equipment).maxHp
      if (recoveryTicksLeft > 0) {
        // KO phase: count down, no regen; transition to resting when done
        recoveryTicksLeft--
        if (recoveryTicksLeft === 0) isResting = true
      } else if (isResting) {
        // Resting: regen until full, excluded from combat
        health = Math.min(maxHp, health + RESTING_REGEN_RATE)
        if (health >= maxHp) isResting = false
      } else if (health > 0) {
        if (u.locationId) {
          const dmg = hpDamage[u.id] ?? 0
          health = Math.floor(health - dmg)
          if (health <= 0) { health = 0; recoveryTicksLeft = RECOVERY_TICKS; newLog = appendLog(newLog, 'ko', `${u.name} was KO'd`, newTicks) }
        } else {
          health = Math.min(maxHp, health + REGEN_RATE)
        }
      }
      const aged   = yearChanged ? { age: u.age + 1 } : {}
      const expAdd = (u.locationId && health > 0 && recoveryTicksLeft === 0 && !isResting) ? (expGained[u.locationId] ?? 0) : 0
      const withExp = { ...u, health, recoveryTicksLeft, isResting, ...aged, exp: u.exp + expAdd }
      const { unit: leveled, log: nextLog } = applyLevelUps(withExp, newTicks, newLog)
      newLog = nextLog
      return leveled
    })

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    return { ticks: newTicks, units, encounters, encounterCooldown, locationFleeing, unitDistance, monsterDefeated, monsterSeen, locationMonstersSeen, locationStats, miscItems, lastTickAt: Date.now(), eventLog: newLog }
  }),

  batchTick: (n) => set((s) => {
    if (n <= 0) return s

    const newTicks    = s.ticks + n
    const yearsPassed = Math.floor(newTicks / TICKS_PER_YEAR) - Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounters:      Record<string, EncounterSlot[]> = {}
    const locationFleeing: Record<string, number>          = { ...s.locationFleeing }
    const monsterDefeated  = { ...s.monsterDefeated }
    const monsterSeen      = { ...s.monsterSeen }
    const locationStats    = { ...s.locationStats }
    const expGained: Record<string, number> = {}
    const newDefeats: Record<string, number> = {}
    let goldEarned   = 0

    const damageRates: Record<string, number> = {}
    const inCombat = new Set<string>()

    for (const [locationId, slots] of Object.entries(s.encounters)) {
      const aliveUnits = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting)

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
        // In batch mode, approaching slots immediately become standing at melee
        const baseSlot = slot.phase === 'approaching' || slot.distance > 0
          ? { ...slot, phase: 'standing' as const, distance: 0, dealtHistory: [], takenHistory: [] }
          : slot
        if (!monster) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }

        if (baseSlot.behavior === 'ignore' || baseSlot.behavior === 'avoid') return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }
        if (!attackedSlots.has(i)) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }

        const numAttackers  = aliveUnits.filter((_, ui) =>
          focusIdxs.length > 0 && focusIdxs[ui % focusIdxs.length].i === i
        ).length
        const seconds       = monster.level * 5  // kill time per attacker in real seconds
        const effectiveProg = baseSlot.progress >= 1 ? 0 : baseSlot.progress
        const combined      = effectiveProg + numAttackers * (n / TICKS_PER_SECOND) / seconds
        const completions   = Math.floor(combined)
        if (completions > 0) {
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + completions
          newDefeats[monster.id]      = (newDefeats[monster.id]      ?? 0) + completions
          expGained[locationId]        = (expGained[locationId] ?? 0) + completions
          goldEarned   += completions
          const prev = locationStats[locationId] ?? { startTick: newTicks, monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0 }
          locationStats[locationId] = {
            ...prev,
            monstersDefeated: { ...prev.monstersDefeated, [monster.id]: (prev.monstersDefeated[monster.id] ?? 0) + completions },
            expDistributed: prev.expDistributed + completions,
            goldEarned:     prev.goldEarned + completions,
          }
        }
        const atkCd = calcAttackCooldown(monster.stats.attackSpeed)
        return { ...baseSlot, progress: combined - completions, targetUnitId: targets[i]?.id ?? null,
          attackCooldown:    Math.floor(Math.random() * atkCd) + 1,
          progressCooldown:  Math.floor(Math.random() * TICKS_PER_SECOND) + 1,
          lastAttackMissed:  false,
          lastProgressMissed: false,
        }
      })
    }

    // Expire any wave cooldowns that fit within the batch window; spawn fresh waves
    const encounterCooldown: Record<string, number> = {}
    for (const [locationId, cd] of Object.entries(s.encounterCooldown)) {
      const newCd = cd - n
      if (newCd <= 0) {
        const wave = spawnWave(locationId)
        encounters[locationId] = wave
        for (const sl of wave) monsterSeen[sl.monsterId] = (monsterSeen[sl.monsterId] ?? 0) + 1
      } else {
        encounterCooldown[locationId] = newCd
      }
    }

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
      } else if (inCombat.has(u.id)) {
        const rate         = damageRates[u.id] ?? 0
        const ticksToDeath = rate > 0 ? health / rate : Infinity
        if (ticksToDeath >= n) {
          health = Math.max(0, Math.floor(health - rate * n))
          // Floor can push health to 0 even when ticksToDeath >= n — trigger KO
          if (health === 0) { recoveryTicksLeft = RECOVERY_TICKS; isResting = false }
        } else {
          const ticksAfterDeath = n - Math.floor(ticksToDeath)
          if (ticksAfterDeath < RECOVERY_TICKS) {
            // Still inside KO countdown at end of batch
            recoveryTicksLeft = RECOVERY_TICKS - ticksAfterDeath
            health = 0
            isResting = false
          } else {
            // KO phase complete; ticksAfterDeath === RECOVERY_TICKS means 0 resting ticks
            recoveryTicksLeft = 0
            const ticksResting = ticksAfterDeath - RECOVERY_TICKS
            health    = Math.min(maxHp, ticksResting * RESTING_REGEN_RATE)
            isResting = health < maxHp
          }
        }
      } else if (!u.locationId) {
        health = Math.min(maxHp, health + n * REGEN_RATE)
      }

      health = Math.max(0, health)
      const aged   = yearsPassed > 0 ? { age: u.age + yearsPassed } : {}
      const expAdd = (u.locationId && health > 0 && recoveryTicksLeft === 0 && !isResting) ? (expGained[u.locationId] ?? 0) : 0
      return { ...u, health, recoveryTicksLeft, isResting, ...aged, exp: u.exp + expAdd }
    })

    let eventLog = s.eventLog
    const units = unitsPreLevel.map((u) => {
      const { unit: leveled, log: nextLog } = applyLevelUps(u, newTicks, eventLog)
      eventLog = nextLog
      return leveled
    })

    // Update encounter targets based on post-batch alive state
    for (const [locationId, slots] of Object.entries(encounters)) {
      const finalAlive = units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting)
      encounters[locationId] = slots.map((sl, i) => ({
        ...sl, targetUnitId: finalAlive.length > 0 ? finalAlive[i % finalAlive.length].id : null,
      }))
    }

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    if (n >= 50) {
      const offlineSecs = Math.round(n / TICKS_PER_SECOND)
      const defeatParts = Object.entries(newDefeats)
        .map(([id, count]) => `${MONSTER_REGISTRY[id]?.name ?? id} ×${count}`)
        .join(', ')
      const msg = `Away ${formatDuration(offlineSecs)}${defeatParts ? ` — ${defeatParts}` : ' — no combat'}`
      eventLog = appendLog(eventLog, 'offline', msg, newTicks)
    }

    // Batch mode collapses approach; no per-tick positions matter — clear them
    return { ticks: newTicks, units, encounters, encounterCooldown, locationFleeing, unitDistance: {}, monsterDefeated, monsterSeen, locationStats, miscItems, lastTickAt: Date.now(), eventLog }
  }),

  togglePause: () => set((s) => s.paused
    ? { paused: false, lastTickAt: Date.now() }  // reset clock so no catch-up on unpause
    : { paused: true }
  ),

  setActiveTab: (tab) => set((s) => {
    const update: Partial<GameState> = { activeTab: tab }
    if (tab === 'combat') {
      // Map → Combat: if only a location is selected (no units), surface it
      // as the combat focus so we land on its encounter view.
      if (s.selectedLocationId && s.selectedUnitIds.length === 0) {
        update.combatLocationId = s.selectedLocationId
      }
    } else if (tab === 'map') {
      // Combat → Map: bring the combat-focused location onto the map by
      // paging to its region and selecting it.
      if (s.combatLocationId) {
        const loc = s.locations.find((l) => l.id === s.combatLocationId)
        if (loc) {
          update.mapPageId = loc.region
          update.selectedLocationId = s.combatLocationId
        }
      }
    }
    return update
  }),
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
  setMapPage: (id) => set({ mapPageId: id }),
  assignUnits: (unitIds, locationId) => set((s) => {
    const newUnits = s.units.map((u) => unitIds.includes(u.id) ? { ...u, locationId, travelPath: null } : u)

    const encounters = { ...s.encounters }
    const encounterCooldown = { ...s.encounterCooldown }
    const unitDistance = { ...s.unitDistance }
    // Reassigned units always start at the home line (0) of their new location
    for (const id of unitIds) unitDistance[id] = 0

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
    const monsterSeen = { ...s.monsterSeen }
    if (locationId && !encounters[locationId]) {
      const fresh = spawnWave(locationId)
      if (fresh.length > 0) {
        encounters[locationId] = fresh
        for (const sl of fresh) monsterSeen[sl.monsterId] = (monsterSeen[sl.monsterId] ?? 0) + 1
      }
    }

    return { units: newUnits, selectedUnitIds: [], encounters, encounterCooldown, monsterSeen, unitDistance }
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
      age: r(16, 30), health: 100, recoveryTicksLeft: 0, isResting: false, class: null, proficiencies: [],
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
