import { create } from 'zustand'
import type {
  Unit, Location, EquipmentItem, MiscItem, TabId, EquipSlot, Abilities,
  Priority, WeaponRecord, EncounterSlot, LogEntry, LogCategory,
  LocationCombatStats, ActionSlotEntry,
} from '@/types'
import { PRIORITY_NORMAL, PRIORITY_IGNORE, PRIORITY_AVOID, ACTION_SLOT_COUNT } from '@/types'
import { APPROACH_DISTANCE, APPROACH_SPEED, ATTACK_SPEED_BASE, FLEE_TICKS_CONST, RECOVERY_TICKS, REGEN_RATE, RESTING_REGEN_RATE, TICKS_PER_SECOND, WAVE_COOLDOWN_MAX, WAVE_COOLDOWN_MIN, TICKS_PER_YEAR, formatDuration } from '@/lib/time'
import { getDerivedStats } from '@/lib/stats'
import { randomFullName } from '@/lib/names'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { elementMultiplier } from '@/lib/elements'
import { SKILL_REGISTRY } from '@/data/skills'
import { RECIPE_REGISTRY } from '@/data/recipes'
import { INITIAL_EQUIPMENT, INITIAL_MISC } from '@/data/equipment'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { INITIAL_UNITS } from '@/data/units'

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
  locationUnitOrder: Record<string, string[]>         // locationId → ordered unitIds (front-of-march first); affects initial position
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
  setMonsterPriority: (locationId: string, monsterId: string, priority: Priority) => void
  setLocationUnitOrder: (locationId: string, unitIds: string[]) => void
  // Tap-/drag-to-fill an action slot. When entry.kind === 'item', the item is
  // also added to the unit's sideboard (evicting the oldest sideboard entry if
  // both sideboards are full). Setting to null clears the slot AND removes the
  // item from sideboard if no other action slot still references it.
  setActionSlot: (unitId: string, slotIdx: number, entry: ActionSlotEntry | null) => void
  selectedMonsterSlot: { locationId: string; slotIndex: number } | null
  setSelectedMonsterSlot: (slot: { locationId: string; slotIndex: number } | null) => void
  resetSave: () => void
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
      monsterId, progress: 0, targetUnitId: null, priority: PRIORITY_NORMAL, threat: {},
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
  // Floor 1 also includes a tough slime alongside the bats (test target).
  'geffen-dungeon-1': () => Math.random() < 0.5 ? ['bat', 'tough-slime'] : ['bat', 'bat', 'tough-slime'],
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
  locationUnitOrder: {},
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
              ...sl, progress: 0, targetUnitId: null, threat: {},
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
        slots.some((sl)  => sl.priority < 0) ||
        slots.every((sl) => sl.priority <= 0)
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

      // Monster → unit targeting: each slot picks its highest-threat unit
      // (sticky aggro). Falls back to round-robin when no threat has built up
      // yet so the opening seconds of combat still spread aggro evenly.
      const targets = slots.map((sl, i) => {
        const threatened = aliveUnits
          .map((u) => ({ id: u.id, t: sl.threat[u.id] ?? 0 }))
          .filter(({ t }) => t > 0)
        if (threatened.length > 0) {
          threatened.sort((a, b) => b.t - a.t)
          return threatened[0].id
        }
        return aliveUnits[i % aliveUnits.length].id
      })

      // Unit → monster: focus on the highest-priority focusable slots
      // (priority ≥ 1). Multiple slots can share the top rank.
      const focusable    = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.priority >= 1)
      const maxPriority  = focusable.reduce((m, x) => Math.max(m, x.sl.priority), 0)
      const focusIdxs    = focusable.filter(({ sl }) => sl.priority === maxPriority)
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
        if (sl.priority < 0) continue                      // avoid: monster doesn't close (party flees instead)
        const monster = MONSTER_REGISTRY[sl.monsterId]; if (!monster) continue
        const tId = targets[i]; if (!tId) continue
        const tPos = oldUnitPos[tId] ?? 0
        const monsterRange = monster.stats.attackRange ?? 5
        // Monster stops at *its own* attack range from the target. Even if the
        // target is a ranged unit firing from afar, the monster keeps closing
        // until it's in melee striking distance. (We used to clamp to the
        // target's attack range so a bow user could "pin" a wolf at bow range
        // — that turned out to feel wrong: a shot wolf appeared to stop in
        // its tracks instead of continuing the charge.)
        const speed = (monster.stats.moveSpeed ?? 5) / TICKS_PER_SECOND
        const desiredPos = tPos + monsterRange
        if (sl.distance > desiredPos) {
          newSlotPos[i] = Math.max(sl.distance - speed, desiredPos)
        }
      }

      // The whole party rallies on a single line (MARCHING_FORMATION):
      //  - Marching/idle → everyone sits on the line together.
      //  - In combat, a melee unit with a focus monster charges forward to
      //    engage (advance to `monsterPos - reach`, line as a floor).
      //  - Ranged units always hold the line and fire from distance — they do
      //    NOT charge, retreat, or kite. (Previously they fell back to a
      //    rear formation of 0 ft, which made them sprint backwards the moment
      //    a monster appeared — the gap visibly widened before closing.)
      const MARCHING_FORMATION = 20
      const unitToSlot: Record<string, number> = {}
      for (let ui = 0; ui < aliveUnits.length; ui++) {
        if (focusIdxs.length === 0) continue
        unitToSlot[aliveUnits[ui].id] = focusIdxs[ui % focusIdxs.length].i
      }
      for (const u of aliveUnits) {
        const ud = getDerivedStats(u, s.equipment)
        const slotIdx = unitToSlot[u.id]
        const cur = oldUnitPos[u.id]
        const isRanged = ud.attackRange > 5
        const desired = (!isRanged && slotIdx !== undefined)
          ? Math.max(MARCHING_FORMATION, newSlotPos[slotIdx] - ud.attackRange)
          : MARCHING_FORMATION
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

        const monsterRange   = monster.stats.attackRange ?? 5
        const monsterPos     = newSlotPos[i]
        const targetId       = targets[i]
        const targetPos      = targetId ? (unitDistance[targetId] ?? 0) : 0
        const monsterInRange = (monsterPos - targetPos) <= monsterRange

        // Units in this slot whose own attackRange covers the monster's current position.
        // Computed here (before the engagement gate) so ranged units can fire before the
        // monster closes to its own melee range.
        const attackersOfSlot = attackedSlots.has(i)
          ? aliveUnits
              .filter((_, ui) => focusIdxs.length > 0 && focusIdxs[ui % focusIdxs.length].i === i)
              .filter((au) => {
                const ud = getDerivedStats(au, s.equipment)
                return (monsterPos - (unitDistance[au.id] ?? 0)) <= ud.attackRange
              })
          : []

        // Engage when the monster OR at least one unit is within their own attack range.
        const combatEngaged = monsterInRange || attackersOfSlot.length > 0
        const phase: 'approaching' | 'standing' = combatEngaged ? 'standing' : 'approaching'

        if (!combatEngaged) {
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

        // Monster attack fires on cooldown expiry — only when the monster has closed
        // to its own attack range (it can't attack from across the field).
        if (slot.priority >= 0 && monsterInRange) {
          if (slot.attackCooldown <= 0) {
            const target = targetId ? s.units.find((u) => u.id === targetId) : null
            if (target) {
              const derived = getDerivedStats(target, s.equipment)
              const hit     = Math.random() < calcHitChance(monster.stats.accuracy, derived.dodge)
              // Monster attacks default to neutral; armor element shifts the multiplier.
              const mult    = elementMultiplier('neutral', derived.armorElement)
              const dmg     = (monster.stats.attack / Math.max(derived.defense, 1)) * mult
              if (hit) hpDamage[targetId!] = (hpDamage[targetId!] ?? 0) + dmg
              dealtHistory     = [...dealtHistory, hit ? Math.ceil(dmg) : 0].slice(-10)
              lastAttackMissed = !hit
            }
            newAtkCd = Math.max(0, calcAttackCooldown(monster.stats.attackSpeed) - 1)
          } else {
            newAtkCd = slot.attackCooldown - 1
          }
        }

        // Unit progress fires on cooldown expiry using the pre-computed attackersOfSlot.
        // Per-attacker threat: each hit adds its HP-equivalent damage to slot.threat[unitId]
        // so this monster preferentially targets the unit who has hurt it most.
        let newThreat = slot.threat
        if (attackersOfSlot.length > 0 && slot.progressCooldown <= 0) {
          let totalChunk = 0
          let allMissed  = true
          let resetCd    = TICKS_PER_SECOND
          newThreat = { ...slot.threat }
          for (const [aidx, au] of attackersOfSlot.entries()) {
            const ud  = getDerivedStats(au, s.equipment)
            const uc  = calcAttackCooldown(ud.attackSpeed)
            if (aidx === 0) resetCd = uc
            const hit      = Math.random() < calcHitChance(ud.accuracy, monster.stats.dodge)
            // Scale progress contribution by attacker element vs monster element.
            const mult     = elementMultiplier(ud.attackElement, monster.element)
            const rawChunk = (uc / (monster.level * 5 * TICKS_PER_SECOND)) * mult
            const chunk    = Math.round(rawChunk * monster.health) / monster.health
            if (hit) {
              totalChunk += chunk
              allMissed   = false
              newThreat[au.id] = (newThreat[au.id] ?? 0) + chunk * monster.health
            }
          }
          if (totalChunk > 0) newProgress = Math.min(slot.progress + totalChunk, 1)
          takenHistory       = [...takenHistory, totalChunk].slice(-10)
          lastProgressMissed = allMissed
          newProgCd          = Math.max(0, resetCd - 1)
        } else if (attackersOfSlot.length > 0) {
          newProgCd = slot.progressCooldown - 1
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
          threat: newThreat,
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
        slots.some((sl)  => sl.priority < 0) ||
        slots.every((sl) => sl.priority <= 0)
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

      const focusable    = slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.priority >= 1)
      const maxPriority  = focusable.reduce((m, x) => Math.max(m, x.sl.priority), 0)
      const focusIdxs    = focusable.filter(({ sl }) => sl.priority === maxPriority)
      const attackedSlots = new Set<number>()
      if (focusIdxs.length > 0) {
        aliveUnits.forEach((_, ui) => attackedSlots.add(focusIdxs[ui % focusIdxs.length].i))
      }

      for (let i = 0; i < slots.length; i++) {
        const { monsterId, priority } = slots[i]
        if (priority < 0) continue
        const monster = MONSTER_REGISTRY[monsterId]
        const target  = targets[i]
        if (!monster || !target) continue
        const derived = getDerivedStats(target, s.equipment)
        const mult    = elementMultiplier('neutral', derived.armorElement)
        // Divide by TICKS_PER_SECOND to convert from HP/sec to HP/tick at 5/sec
        damageRates[target.id] = (damageRates[target.id] ?? 0) + (monster.stats.attack * monster.stats.attackSpeed / ATTACK_SPEED_BASE) / Math.max(derived.defense, 1) / TICKS_PER_SECOND * mult
        inCombat.add(target.id)
      }

      encounters[locationId] = slots.map((slot, i) => {
        const monster = MONSTER_REGISTRY[slot.monsterId]
        // In batch mode, approaching slots immediately become standing at melee
        const baseSlot = slot.phase === 'approaching' || slot.distance > 0
          ? { ...slot, phase: 'standing' as const, distance: 0, dealtHistory: [], takenHistory: [] }
          : slot
        if (!monster) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }

        if (baseSlot.priority <= 0) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }
        if (!attackedSlots.has(i)) return { ...baseSlot, targetUnitId: targets[i]?.id ?? null }

        // Sum each attacker's element multiplier (vs this monster's armor element).
        const attackerMultSum = aliveUnits.reduce((sum, au, ui) => {
          if (focusIdxs.length === 0 || focusIdxs[ui % focusIdxs.length].i !== i) return sum
          const ud = getDerivedStats(au, s.equipment)
          return sum + elementMultiplier(ud.attackElement, monster.element)
        }, 0)
        const seconds       = monster.level * 5  // kill time per attacker in real seconds
        const effectiveProg = baseSlot.progress >= 1 ? 0 : baseSlot.progress
        const combined      = effectiveProg + attackerMultSum * (n / TICKS_PER_SECOND) / seconds
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
    const locationUnitOrder: Record<string, string[]> = { ...s.locationUnitOrder }

    // Remove the moved units from every existing location order.
    for (const loc of Object.keys(locationUnitOrder)) {
      locationUnitOrder[loc] = locationUnitOrder[loc].filter((id) => !unitIds.includes(id))
    }
    // Append to the destination's order (new arrivals march at the back).
    if (locationId) {
      const existing = locationUnitOrder[locationId] ?? []
      locationUnitOrder[locationId] = [...existing, ...unitIds]
    }

    // Initial position: rank-0 at the home line, each later rank one INITIAL_RANK_OFFSET
    // behind so the marching column staggers in.
    const INITIAL_RANK_OFFSET = 5
    if (locationId) {
      for (const [rank, id] of (locationUnitOrder[locationId] ?? []).entries()) {
        if (unitIds.includes(id)) unitDistance[id] = rank === 0 ? 0 : -rank * INITIAL_RANK_OFFSET
      }
    } else {
      for (const id of unitIds) unitDistance[id] = 0
    }

    // Source locations that lost all units → clear encounter so monsters return to pool
    const fromIds = new Set(
      unitIds.map((id) => s.units.find((u) => u.id === id)?.locationId).filter((id): id is string => !!id)
    )
    for (const fromId of fromIds) {
      if (newUnits.every((u) => u.locationId !== fromId)) {
        delete encounters[fromId]
        delete encounterCooldown[fromId]
        delete locationUnitOrder[fromId]
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

    return { units: newUnits, selectedUnitIds: [], encounters, encounterCooldown, monsterSeen, unitDistance, locationUnitOrder }
  }),

  setLocationUnitOrder: (locationId, unitIds) => set((s) => {
    const unitDistance: Record<string, number> = { ...s.unitDistance }
    // Re-stagger positions whenever the order changes mid-combat so the
    // visible marching line matches the new ranks immediately.
    const INITIAL_RANK_OFFSET = 5
    unitIds.forEach((id, rank) => {
      // Only nudge units that are still at or behind the home line; if they've
      // already advanced into combat, leave their live position alone.
      const cur = unitDistance[id] ?? 0
      if (cur <= 0) unitDistance[id] = rank === 0 ? 0 : -rank * INITIAL_RANK_OFFSET
    })
    return {
      locationUnitOrder: { ...s.locationUnitOrder, [locationId]: unitIds },
      unitDistance,
    }
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

  setMonsterPriority: (locationId, monsterId, priority) => set((s) => ({
    encounters: {
      ...s.encounters,
      [locationId]: (s.encounters[locationId] ?? []).map((sl) =>
        sl.monsterId === monsterId ? { ...sl, priority } : sl
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

  resetSave: () => {
    ;['expandedLocationIds', 'expandedUnitIds', 'expandedInventorySections', 'expandedRegionIds'].forEach((k) => localStorage.removeItem(k))
    set({
      units:    INITIAL_UNITS,
      equipment: INITIAL_EQUIPMENT,
      miscItems: INITIAL_MISC,
      learnedRecipes: ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
      locationFamiliarity:  { 'kings-forest': 100, 'duskwood': 75, ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, 100])) },
      locationMonstersSeen: { 'kings-forest': ['slime'], 'duskwood': ['slime'], ...Object.fromEntries(KANTO_BEACH_IDS.map((id) => [id, ['rock-crab']])) },
      monsterSeen:     { slime: 15, 'shadow-wolf': 5, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
      monsterDefeated: {},
      locationStats:   {},
      encounters:        Object.fromEntries(Object.entries(WAVE_TEMPLATES).map(([id, fn]) => [id, makeSlots(fn())])),
      encounterCooldown: {},
      locationFleeing:   {},
      unitDistance:      {},
      locationUnitOrder: {},
      ticks:         0,
      lastTickAt:    Date.now(),
      paused:        false,
      eventLog:      [],
      itemSockets:   {},
      activeTab:     'map',
      selectedUnitIds: [],
      selectedLocationId: null,
      combatLocationId: null,
      mapPageId: 'prontera',
      expandedLocationIds: [],
      expandedUnitIds: [],
      expandedInventorySections: ['equipment', 'misc', 'crafting'],
      expandedRegionIds: ['prontera', 'geffen', 'kanto'],
      equipContext: null,
      selectedMonsterSlot: null,
    })
  },
}))
