import { useGameStore, type Unit, type MonsterBehavior, type EncounterSlot } from '@/stores/useGameStore'

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
  return { monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal' as MonsterBehavior, respawnTicksLeft: 0, ...overrides }
}

// Sets a known clean base state for combat/tick tests.
// Merges over the existing store so actions are preserved.
export function resetStore(overrides: object = {}) {
  useGameStore.setState({
    units: [],
    equipment: [],
    encounters: {},
    locationFleeing: {},
    monsterDefeated: {},
    miscItems: [],
    eventLog: [],
    itemSockets: {},
    ticks: 0,
    lastTickAt: Date.now(),
    ...overrides,
  })
}

export function tick() {
  useGameStore.getState().tick()
  return useGameStore.getState()
}
