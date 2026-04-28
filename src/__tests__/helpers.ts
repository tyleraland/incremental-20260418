import { useGameStore, type Unit, type MonsterBehavior, type EncounterSlot } from '@/stores/useGameStore'
import type { Location, MonsterPoolEntry } from '@/types'

export type { EncounterSlot }

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1',
    name: 'Test',
    level: 1,
    exp: 0,
    expToNext: 100,
    age: 20,
    health: 100,
    recoveryTicksLeft: 0,
    class: null,
    proficiencies: [],
    locationId: null,
    travelPath: null,
    abilities: { strength: 5, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 },
    abilityPoints: 0,
    skillPoints: 0,
    learnedSkills: {},
    weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, tool: null, accessory: null },
    ...overrides,
  }
}

export function makeEncounterSlot(overrides: Partial<EncounterSlot> = {}): EncounterSlot {
  return { monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal' as MonsterBehavior, ...overrides }
}

export function makeLocation(overrides: Partial<Location> & { monsterPool?: MonsterPoolEntry[] } = {}): Location {
  return {
    id: 'loc1', name: 'Test Location', region: 'test', description: '',
    traits: [], monsterIds: ['wolf'], familiarityMax: 100, connections: [],
    monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: null }],
    encounterSize: [1, 1],
    ...overrides,
  }
}

// Sets a known clean base state for combat/tick tests.
// Merges over the existing store so actions are preserved.
// encounterDistance defaults to 0 for every location that has a pre-seeded encounter,
// so tests get immediate melee combat without needing an explicit approach phase.
export function resetStore(overrides: Record<string, unknown> = {}) {
  const encounters = (overrides.encounters ?? {}) as Record<string, unknown>
  const autoDistance: Record<string, number> = {}
  for (const locId of Object.keys(encounters)) autoDistance[locId] = 0

  useGameStore.setState({
    units: [],
    equipment: [],
    encounters: {},
    locationFleeing: {},
    monsterDefeated: {},
    monsterCooldowns: {},
    miscItems: [],
    eventLog: [],
    itemSockets: {},
    ticks: 0,
    lastTickAt: Date.now(),
    encounterDistance: autoDistance,
    ...overrides,
  })
}

export function tick() {
  useGameStore.getState().tick()
  return useGameStore.getState()
}
