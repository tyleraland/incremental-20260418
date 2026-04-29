import { useGameStore, calcAttackCooldown, type Unit, type MonsterBehavior, type EncounterSlot } from '@/stores/useGameStore'

export { calcAttackCooldown }

// How many times an attack fires in n ticks when:
//   - attackCooldown starts at 0 (fires on tick 1)
//   - resets to `cooldown` after each fire
// Effective period = cooldown + 1 (cooldown decrements to 0, then fires on the next).
export function firesInNTicks(n: number, cooldown: number): number {
  if (n <= 0) return 0
  return 1 + Math.floor((n - 1) / (cooldown + 1))
}

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
    isResting: false,
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
  return {
    monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal' as MonsterBehavior,
    phase: 'standing', distance: 0, dealtHistory: [], takenHistory: [],
    attackCooldown: 0, progressCooldown: 0,
    lastAttackMissed: false, lastProgressMissed: false,
    ...overrides,
  }
}

// Sets a known clean base state for combat/tick tests.
// Merges over the existing store so actions are preserved.
export function resetStore(overrides: object = {}) {
  useGameStore.setState({
    units: [],
    equipment: [],
    encounters: {},
    encounterCooldown: {},
    locationFleeing: {},
    monsterDefeated: {},
    monsterSeen: {},
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

export function batchTick(n: number) {
  useGameStore.getState().batchTick(n)
  return useGameStore.getState()
}
