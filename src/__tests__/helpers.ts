import { useGameStore, type Unit, type MonsterBehavior } from '@/stores/useGameStore'

// Pre-shapes the per-slot encounter model from refactor-plan §9.
// When EncounterSlot is exported from the store, replace this local type with that import.
export interface EncounterSlot {
  monsterId: string
  progress: number
  targetUnitId: string | null
  behavior: MonsterBehavior
}

export function makeEncounterSlot(overrides: Partial<EncounterSlot> = {}): EncounterSlot {
  return { monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal', ...overrides }
}

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
