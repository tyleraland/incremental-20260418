import { useGameStore, type Unit } from '@/stores/useGameStore'

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
    abilities: { strength: 5, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 },
    abilityPoints: 0,
    skillPoints: 0,
    learnedSkills: {},
    equipment: { mainHand: null, offHand: null, tool: null, armor: null, accessory: null },
    ...overrides,
  }
}

// Sets a known clean base state for combat/tick tests.
// Merges over the existing store so actions are preserved.
export function resetStore(overrides: object = {}) {
  useGameStore.setState({
    units: [],
    equipment: [],
    activeEncounters: {},
    encounterProgress: {},
    encounterTargets: {},
    locationFleeing: {},
    locationStrategy: {},
    monsterDefeated: {},
    miscItems: [],
    ticks: 0,
    lastTickAt: Date.now(),
    ...overrides,
  })
}

export function tick() {
  useGameStore.getState().tick()
  return useGameStore.getState()
}
