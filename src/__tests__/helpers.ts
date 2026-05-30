import { useGameStore, ACTION_SLOT_COUNT, type Unit } from '@/stores/useGameStore'

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
    equipment: { armor: null, sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: Array(ACTION_SLOT_COUNT).fill(null),
    tactics: [],
    ...overrides,
  }
}

// Sets a known clean base state for tick/regen tests.
// Merges over the existing store so actions are preserved.
export function resetStore(overrides: object = {}) {
  useGameStore.setState({
    units: [],
    equipment: [],
    locations: [],
    battles: {},
    battleCooldown: {},
    monsterSpawnTimers: {},
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
