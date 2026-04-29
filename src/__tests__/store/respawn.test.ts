// Requirements: wave cooldown between encounters (replaced per-slot respawn)
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WAVE_COOLDOWN_MIN, WAVE_COOLDOWN_MAX } from '@/lib/time'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'
import { useGameStore } from '@/stores/useGameStore'

describe('wave cooldown', () => {
  beforeEach(() => resetStore())

  it('starts a wave cooldown when the last slot is defeated', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 1.0 })] },
    })
    const s = tick()
    expect(s.encounters['loc1']).toHaveLength(0)
    expect(s.encounterCooldown['loc1']).toBeGreaterThanOrEqual(WAVE_COOLDOWN_MIN)
    expect(s.encounterCooldown['loc1']).toBeLessThanOrEqual(WAVE_COOLDOWN_MAX)
  })

  it('does not start cooldown when slots remain after a defeat', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 1.0 }), makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const s = tick()
    expect(s.encounterCooldown['loc1']).toBeUndefined()
  })

  it('decrements the cooldown each tick', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [] },
      encounterCooldown: { loc1: 5 },
    })
    const s = tick()
    expect(s.encounterCooldown['loc1']).toBe(4)
  })

  it('spawns a new wave when cooldown reaches 0', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [] },
      encounterCooldown: { loc1: 1 },
    })
    const s = tick()
    expect(s.encounterCooldown['loc1']).toBeUndefined()
    // kings-forest uses ['slime'] but loc1 has no template → empty wave
    expect(s.encounters['loc1']).toHaveLength(0)
  })

  it('batchTick expires cooldown and spawns wave', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [] },
      encounterCooldown: { loc1: 5 },
    })
    useGameStore.getState().batchTick(10)
    const s = useGameStore.getState()
    expect(s.encounterCooldown['loc1']).toBeUndefined()
  })

  it('spawns the correct wave composition for a known location', () => {
    resetStore({
      units: [makeUnit({ locationId: 'kings-forest' })],
      encounters: { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 1 },
    })
    const s = tick()
    const ids = s.encounters['kings-forest'].map((sl) => sl.monsterId)
    expect(ids).toEqual(['slime'])
  })
})

describe('monster sightings (monsterSeen)', () => {
  // Math.random used for wave cooldown stagger only; not needed for correctness here.
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0) })
  afterEach(() => { vi.restoreAllMocks() })

  it('increments monsterSeen when a wave spawns on cooldown expiry in tick()', () => {
    resetStore({
      units: [makeUnit({ locationId: 'kings-forest' })],
      encounters: { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 1 },
      monsterSeen: {},
    })
    const s = tick()
    expect(s.monsterSeen['slime']).toBe(1)
  })

  it('increments by the number of slots in the wave (multi-slot waves count each monster)', () => {
    // duskwood spawns 2 shadow-wolves
    resetStore({
      units: [makeUnit({ locationId: 'duskwood' })],
      encounters: { duskwood: [] },
      encounterCooldown: { duskwood: 1 },
      monsterSeen: { 'shadow-wolf': 3 },
    })
    const s = tick()
    expect(s.monsterSeen['shadow-wolf']).toBe(5)  // 3 + 2
  })

  it('increments monsterSeen when batchTick expires a cooldown', () => {
    resetStore({
      units: [makeUnit({ locationId: 'kings-forest' })],
      encounters: { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 5 },
      monsterSeen: {},
    })
    useGameStore.getState().batchTick(10)
    expect(useGameStore.getState().monsterSeen['slime']).toBe(1)
  })

  it('increments monsterSeen when a unit is assigned to a location with no active encounter', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: null })],
      encounters: {},
      monsterSeen: {},
    })
    useGameStore.getState().assignUnits(['u1'], 'kings-forest')
    // kings-forest spawns slime on first arrival
    expect(useGameStore.getState().monsterSeen['slime']).toBe(1)
  })

  it('does not increment when cooldown has not yet expired', () => {
    resetStore({
      units: [makeUnit({ locationId: 'kings-forest' })],
      encounters: { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 5 },
      monsterSeen: {},
    })
    tick()  // cooldown decrements to 4, no spawn
    expect(useGameStore.getState().monsterSeen['slime']).toBeUndefined()
  })
})
