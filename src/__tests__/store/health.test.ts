// Requirements: Health section of CLAUDE.md
import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { useGameStore, RECOVERY_TICKS, REGEN_RATE, RESTING_REGEN_RATE, getDerivedStats } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

// All attacks hit — tests assert exact health values, not miss rates.
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0) })
afterEach(() => { vi.restoreAllMocks() })

// Base unit has constitution=5 → defense = Math.floor(5 * 1.5) = 7
// Wolf has attack=8. Damage per tick = 8 / 7 ≈ 1.143
const BASE_UNIT   = makeUnit()
const BASE_DEF    = getDerivedStats(BASE_UNIT, []).defense  // 7
const WOLF_ATK    = 8
const WOLF_DMG    = WOLF_ATK / BASE_DEF                    // ≈ 1.143

beforeEach(() => {
  resetStore({
    units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
    encounters: { loc1: [makeEncounterSlot()] },
  })
})

describe('Health — floor arithmetic', () => {
  it('applies Math.floor when storing damage — no fractional HP', () => {
    // 100 - 1.143... → stored as 98 (floor), never 98.857
    const { units } = tick()
    expect(units[0].health).toBe(Math.floor(100 - WOLF_DMG))
    expect(Number.isInteger(units[0].health)).toBe(true)
  })
})

describe('Health — KO', () => {
  it('KOs a unit and starts recovery when health reaches 0 from damage', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 1, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot()] },
    })
    // floor(1 - 1.143) = floor(-0.143) = -1 ≤ 0 → KO
    const { units } = tick()
    expect(units[0].health).toBe(0)
    expect(units[0].recoveryTicksLeft).toBe(RECOVERY_TICKS)
  })

  it('does not apply combat damage to KO\'d units — they are excluded from aliveUnits', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot()] },
    })
    // KO'd unit is not in aliveUnits; KO countdown ticks but no regen during KO phase
    const { units } = tick()
    expect(units[0].health).toBe(0)
    expect(units[0].recoveryTicksLeft).toBe(4)
  })
})

describe('Health — KO phase (no regen)', () => {
  it('does NOT regen health during the KO countdown', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].health).toBe(0)            // no regen during KO
    expect(units[0].recoveryTicksLeft).toBe(4)
    expect(units[0].isResting).toBe(false)
  })

  it('transitions to isResting=true when KO countdown reaches 0', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 1, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].recoveryTicksLeft).toBe(0)
    expect(units[0].isResting).toBe(true)
    expect(units[0].health).toBe(0)  // still 0; resting regen starts next tick
  })
})

describe('Health — resting regen', () => {
  it('regens at RESTING_REGEN_RATE per tick while isResting', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, isResting: true, recoveryTicksLeft: 0, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].health).toBe(RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)  // still resting (not full)
  })

  it('clears isResting when health reaches maxHp', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({
      units: [makeUnit({ id: 'u1', health: maxHp - RESTING_REGEN_RATE, isResting: true, recoveryTicksLeft: 0, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].health).toBe(maxHp)
    expect(units[0].isResting).toBe(false)
  })

  it('resting units at a location are excluded from combat targeting', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 10, isResting: true, recoveryTicksLeft: 0, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].targetUnitId).toBeNull()  // resting unit not targeted
  })

  it('resting units do not take combat damage', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 10, isResting: true, recoveryTicksLeft: 0, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(10 + RESTING_REGEN_RATE)  // regens, not damaged
  })
})

describe('Health — idle regen', () => {
  it('regens at REGEN_RATE per tick when unit has no locationId', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 50, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].health).toBe(50 + REGEN_RATE)
  })

  it('caps health at 100 after regen', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 99, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].health).toBe(100)
  })

  it('does not idle-regen units assigned to a location', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 50, locationId: 'loc1' })],
      encounters: { loc1: [] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(50)
  })
})

describe('Health — batchTick KO recovery', () => {
  it('regens at RESTING_REGEN_RATE × remaining ticks after KO phase ends mid-batch', () => {
    // KO phase is RECOVERY_TICKS; batch covers KO phase + 10 extra ticks of resting
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: RECOVERY_TICKS, locationId: null })],
    })
    useGameStore.getState().batchTick(RECOVERY_TICKS + 10)
    const { units } = useGameStore.getState()
    expect(units[0].recoveryTicksLeft).toBe(0)
    expect(units[0].health).toBe(10 * RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)
  })

  it('stays in KO phase if batch ends before countdown reaches 0', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: RECOVERY_TICKS, locationId: null })],
    })
    useGameStore.getState().batchTick(RECOVERY_TICKS - 3)
    const { units } = useGameStore.getState()
    expect(units[0].recoveryTicksLeft).toBe(3)
    expect(units[0].health).toBe(0)
    expect(units[0].isResting).toBe(false)
  })

  it('resting unit regens health at RESTING_REGEN_RATE × n ticks in batchTick', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, isResting: true, recoveryTicksLeft: 0, locationId: null })],
    })
    useGameStore.getState().batchTick(20)
    const { units } = useGameStore.getState()
    expect(units[0].health).toBe(Math.min(maxHp, 20 * RESTING_REGEN_RATE))
    expect(units[0].isResting).toBe(true)
  })

  it('clears isResting in batchTick when regen reaches maxHp', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({
      units: [makeUnit({ id: 'u1', health: maxHp - 5, isResting: true, recoveryTicksLeft: 0, locationId: null })],
    })
    useGameStore.getState().batchTick(10)
    const { units } = useGameStore.getState()
    expect(units[0].health).toBe(maxHp)
    expect(units[0].isResting).toBe(false)
  })
})

describe('Health — isResting save-migration guard (tick + batchTick)', () => {
  it('tick(): unit with undefined isResting at health=0 enters resting, not stuck', () => {
    const unit = { ...makeUnit({ health: 0, recoveryTicksLeft: 0, locationId: null }), isResting: undefined as unknown as boolean }
    resetStore({ units: [unit] })
    const { units } = tick()
    // Must take the resting path: health increments and isResting=true
    expect(units[0].health).toBe(RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)
  })

  it('batchTick(): unit with undefined isResting at health=0 gets resting regen, not idle regen', () => {
    const unit = { ...makeUnit({ health: 0, recoveryTicksLeft: 0, locationId: null }), isResting: undefined as unknown as boolean }
    resetStore({ units: [unit] })
    useGameStore.getState().batchTick(10)
    const { units } = useGameStore.getState()
    // RESTING_REGEN_RATE=1, REGEN_RATE=1 so health is same; key assertion is isResting stays true
    expect(units[0].health).toBe(10 * RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)
  })
})
