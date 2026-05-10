// Tests for the 1D movement system and ranged-attack engagement.
// All distances in feet; speeds in ft/s divided by TICKS_PER_SECOND in the tick loop.
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import {
  useGameStore, APPROACH_DISTANCE, TICKS_PER_SECOND,
  getDerivedStats, type EquipmentItem,
} from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

// Bow: 35-foot attack range (the key ranged weapon)
const BOW: EquipmentItem = {
  id: 'eq-bow-test', name: 'Test Bow', category: 'weapon-2h',
  traits: [], stats: { range: 35 }, slots: 0,
}

// ── Derived constants for the base makeUnit (agi=5, no weapon) ────────────────
// moveSpeed = 10 + 5 * 0.025 = 10.125 ft/s → ft/tick = 10.125 / 5 = 2.025
// attackRange = max(5, 5) = 5 ft (melee default)
const BASE_STEP       = (10 + 5 * 0.025) / TICKS_PER_SECOND   // ft/tick ≈ 2.025
const MELEE_RANGE     = getDerivedStats(makeUnit(), []).attackRange   // 5
const BOW_RANGE       = getDerivedStats(
  makeUnit({ weaponSets: [{ mainHand: 'eq-bow-test', offHand: null }, { mainHand: null, offHand: null }] }),
  [BOW],
).attackRange  // 35

function unitPos(id = 'u1') { return useGameStore.getState().unitDistance[id] ?? 0 }
function slotDist(loc = 'loc1', idx = 0) {
  return useGameStore.getState().encounters[loc][idx].distance
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0) // all attacks hit
  resetStore()
})
afterEach(() => { vi.restoreAllMocks() })

// ─────────────────────────────────────────────────────────────────────────────
describe('Ranged unit holds formation — monster advances and is shot during approach', () => {
  it('bow unit stays at 0 while wolf closes from 60 ft; bow fires once wolf enters 35 ft', () => {
    // Bow unit holds formation (0). Wolf closes at 1.5 ft/tick.
    // Gap 60→35 takes (60-35)/1.5 ≈ 17 ticks. No fire before that, fire after.
    const bowUnit = makeUnit({
      id: 'u1', locationId: 'loc1',
      weaponSets: [{ mainHand: 'eq-bow-test', offHand: null }, { mainHand: null, offHand: null }],
    })
    resetStore({
      units: [bowUnit],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    // After 20 ticks wolf is at 60-20*1.5=30 ft; bow has been firing for ~3 ticks
    for (let i = 0; i < 20; i++) tick()
    expect(unitPos()).toBeCloseTo(0, 2)                                    // bow unit never moved
    expect(slotDist()).toBeCloseTo(30, 1)                                  // wolf at 30 ft
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBeGreaterThan(0) // damage dealt
  })
})

describe('Monster approach — distance closes each tick', () => {
  it('monster distance decreases by moveSpeed/TICKS_PER_SECOND per tick', () => {
    // wolf: moveSpeed=7.5 ft/s → 1.5 ft/tick
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    tick()
    const expected = APPROACH_DISTANCE - 7.5 / TICKS_PER_SECOND // 58.5
    expect(slotDist()).toBeCloseTo(expected, 3)
  })

  it('monster stops exactly at its own attack range from the unit', () => {
    // wolf (attackRange=5, speed=1.5/tick) placed 6 ft from unit at 0
    // → desired stop = 0+5=5; max(6-1.5, 5) = max(4.5,5) = 5
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 6, phase: 'approaching' })] },
    })
    tick()
    expect(slotDist()).toBeCloseTo(5, 3)
  })

  it('phase changes to "standing" once monster reaches attack range', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 6, phase: 'approaching' })] },
    })
    tick()
    expect(useGameStore.getState().encounters['loc1'][0].phase).toBe('standing')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Unit approach — unitDistance increases toward monster', () => {
  it('melee unit advances by moveSpeed/TICKS_PER_SECOND per tick', () => {
    // golem is very slow (2 ft/s) so monster position barely changes, keeping math clean
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'stone-golem', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    tick()
    expect(unitPos()).toBeCloseTo(BASE_STEP, 2)
  })

  it('unit advances the same step on each successive tick (constant speed)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'stone-golem', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    tick(); const after1 = unitPos()
    tick(); const after2 = unitPos()
    expect(after2 - after1).toBeCloseTo(BASE_STEP, 2)
  })

  it('unit does not advance past the monster (stops when gap ≤ attackRange)', () => {
    // unit at 50, slime at 55 → gap=5=melee range; desired = max(formation,55-5)=max(20,50)=50
    // slime desired stop = 50+5=55; slime at 55, not strictly > 55 → slime stays
    // → unit stays at 50
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 50 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime', distance: 55, phase: 'approaching' })] },
    })
    tick()
    expect(unitPos()).toBeCloseTo(50, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Engagement gating — attacks only fire when within range', () => {
  it('no damage or progress while monster is still approaching (gap > attackRange)', () => {
    // wolf spawns at APPROACH_DISTANCE (60 ft); first tick closes gap but doesn't reach 5 ft
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    tick()
    expect(useGameStore.getState().units[0].health).toBe(100)
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBe(0)
  })

  it('damage and progress fire once gap ≤ monster attack range (melee engagement)', () => {
    // wolf at 5 ft from unit at 0 → gap=5 ≤ wolf.attackRange=5 → in range
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 5, phase: 'approaching' })] },
    })
    tick()
    // Wolf attacks (attackCooldown=0 → fires) AND unit attacks
    expect(useGameStore.getState().units[0].health).toBeLessThan(100)
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBeGreaterThan(0)
  })

  it('monster cooldown does not tick while monster is out of its attack range', () => {
    // wolf at 60 ft (out of range). attackCooldown starts at 3.
    // Should remain at 3 after one tick since monster hasn't closed yet.
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: APPROACH_DISTANCE, phase: 'approaching', attackCooldown: 3 })] },
    })
    tick()
    expect(useGameStore.getState().encounters['loc1'][0].attackCooldown).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Ranged attacks — bow unit (attackRange = 35 ft)', () => {
  function bowUnit(id = 'u1') {
    return makeUnit({
      id,
      locationId: 'loc1',
      weaponSets: [{ mainHand: 'eq-bow-test', offHand: null }, { mainHand: null, offHand: null }],
    })
  }

  it('MELEE_RANGE is 5 ft and BOW_RANGE is 35 ft', () => {
    expect(MELEE_RANGE).toBe(5)
    expect(BOW_RANGE).toBe(35)
  })

  it('bow fires at a monster within 35 ft before the monster reaches melee range', () => {
    // Wolf at 30 ft (gap=30 ≤ 35=bow range, but gap=30 > 5=wolf melee range)
    // → bow fires, wolf cannot yet attack
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 30, phase: 'approaching' })] },
    })
    tick()
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBeGreaterThan(0)
  })

  it('wolf cannot deal damage to the bow unit while still outside its own 5 ft attack range', () => {
    // wolf at 30 ft → wolf.attackRange=5 not satisfied → wolf cannot damage unit
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 30, phase: 'approaching' })] },
    })
    tick()
    expect(useGameStore.getState().units[0].health).toBe(100)
  })

  it('bow unit stays at position 0 (formation floor) while monster is within 35 ft', () => {
    // Wolf at 35 ft → gap=35 ≤ 35; bow desired = max(0, newWolfPos-35) ≤ 0 → stays at 0
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 35, phase: 'approaching' })] },
    })
    tick()
    expect(unitPos()).toBeCloseTo(0, 3)
  })

  it('bow unit holds formation at 0 even when monster is beyond 35 ft', () => {
    // Monster at APPROACH_DISTANCE (60 ft); bow unit stays at 0 (monster comes to it).
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'stone-golem', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    tick()
    expect(unitPos()).toBeCloseTo(0, 3)
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBe(0) // not yet in range
  })

  it('bow fires once wolf enters 35 ft and unit remains at formation (0)', () => {
    // Bow at 0, wolf at 35 → gap=35=bow range → bow fires on this tick.
    // Wolf moves to max(35-1.5, 5)=33.5. Bow stays at 0 (formation floor).
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 35, phase: 'approaching' })] },
    })
    tick()
    expect(unitPos()).toBeCloseTo(0, 3)
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBeGreaterThan(0)
  })
})
