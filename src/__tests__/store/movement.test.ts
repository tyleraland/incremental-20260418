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
describe('Monster approach — melee monster pins at unit attackRange when unit is ranged', () => {
  it('wolf stops at bow range (35 ft) from bow unit, never reaches melee range', () => {
    // Wolf approaches bow unit at 0. stopRange = max(wolf.5, bow.35) = 35.
    // Wolf starts at 60, closes until it reaches unit(0)+35=35, then stops.
    // After many ticks, wolf is at 35 and cannot attack (gap 35 > wolfRange 5).
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
    // Run enough ticks for the system to stabilize (both unit and wolf approach
    // each other at combined rate 2.025+1.5=3.525 ft/tick; gap 60→35 ≈ 7 ticks)
    for (let i = 0; i < 25; i++) tick()
    const wolfPos = slotDist()
    const unitP   = unitPos()
    expect(wolfPos - unitP).toBeCloseTo(35, 1)   // gap pinned at bow range
    expect(useGameStore.getState().units[0].health).toBe(100)  // wolf can't attack at 35 ft gap
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

  it('bow unit advances toward monster when gap > 35 ft', () => {
    // Monster at APPROACH_DISTANCE (60 ft) → gap=60 > 35 → bow must close
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'stone-golem', distance: APPROACH_DISTANCE, phase: 'approaching' })] },
    })
    tick()
    expect(unitPos()).toBeGreaterThan(0)
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBe(0) // not yet in range
  })

  it('bow unit stops advancing and begins firing once gap ≤ 35 ft', () => {
    // Pre-position: bow at 20, wolf at 55 → gap=35 exactly
    // After tick: wolf moves slightly closer; bow desired = max(0, newWolfPos-35) < 20 → bow retreats slightly
    // Either way, progress fires (gap ≤ 35) and unit does NOT advance past position 20
    resetStore({
      units: [bowUnit()],
      equipment: [BOW],
      unitDistance: { u1: 20 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 55, phase: 'approaching' })] },
    })
    const before = unitPos()
    tick()
    expect(unitPos()).toBeLessThanOrEqual(before + 0.001) // does not advance
    expect(useGameStore.getState().encounters['loc1'][0].progress).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Marching — ranged units rejoin the column when no monsters are present', () => {
  it('bow unit drifts forward to the marching line (20 ft) when no encounter slots exist', () => {
    // No monsters at the location: location is in "hunting" state. The bow
    // unit shouldn't hang back at its per-unit formation (0 ft) — it should
    // walk up with the rest of the column.
    resetStore({
      units: [makeUnit({
        id: 'u1', locationId: 'loc1',
        weaponSets: [{ mainHand: 'eq-bow-test', offHand: null }, { mainHand: null, offHand: null }],
      })],
      equipment: [BOW],
      unitDistance: { u1: 0 },
      encounters: { loc1: [] }, // no monsters
    })
    // Bow steps moveSpeed/tick (~2.025 ft/tick); ~10 ticks gets it past 20.
    for (let i = 0; i < 15; i++) tick()
    expect(unitPos()).toBeCloseTo(20, 1)
  })

  it('bow unit returns to per-unit formation (0 ft) when a monster spawns', () => {
    resetStore({
      units: [makeUnit({
        id: 'u1', locationId: 'loc1',
        weaponSets: [{ mainHand: 'eq-bow-test', offHand: null }, { mainHand: null, offHand: null }],
      })],
      equipment: [BOW],
      unitDistance: { u1: 20 }, // started at marching line
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', distance: 35, phase: 'approaching' })] },
    })
    // Gap 35 = bow range → no need to advance; bow should retreat to 0.
    for (let i = 0; i < 15; i++) tick()
    expect(unitPos()).toBeCloseTo(0, 1)
  })
})
