// Requirements: Health section of CLAUDE.md (regen / KO recovery / resting).
// The 1D combat sim that once drove damage here has been removed; these tests
// cover the recovery + regen behavior that survives independent of combat.
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore, RECOVERY_TICKS, REGEN_RATE, RESTING_REGEN_RATE, getDerivedStats } from '@/stores/useGameStore'
import { makeUnit, resetStore, tick } from '../helpers'

beforeEach(() => {
  resetStore({ units: [makeUnit({ id: 'u1', health: 100, locationId: null })] })
})

describe('Health — KO countdown', () => {
  it('counts down recoveryTicksLeft without regen during the KO phase', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' })] })
    const { units } = tick()
    expect(units[0].health).toBe(0)
    expect(units[0].recoveryTicksLeft).toBe(4)
    expect(units[0].isResting).toBe(false)
  })

  it('transitions to isResting=true when KO countdown reaches 0', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 1, locationId: null })] })
    const { units } = tick()
    expect(units[0].recoveryTicksLeft).toBe(0)
    expect(units[0].isResting).toBe(true)
    expect(units[0].health).toBe(0)  // resting regen starts next tick
  })
})

describe('Health — resting regen', () => {
  it('regens at RESTING_REGEN_RATE per tick while isResting', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 0, isResting: true, recoveryTicksLeft: 0, locationId: null })] })
    const { units } = tick()
    expect(units[0].health).toBe(RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)
  })

  it('clears isResting when health reaches maxHp', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({ units: [makeUnit({ id: 'u1', health: maxHp - RESTING_REGEN_RATE, isResting: true, recoveryTicksLeft: 0, locationId: null })] })
    const { units } = tick()
    expect(units[0].health).toBe(maxHp)
    expect(units[0].isResting).toBe(false)
  })
})

describe('Health — idle regen', () => {
  it('regens at REGEN_RATE per tick when unit has no locationId', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 50, locationId: null })] })
    const { units } = tick()
    expect(units[0].health).toBe(50 + REGEN_RATE)
  })

  it('caps health at maxHp after regen', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({ units: [makeUnit({ id: 'u1', health: maxHp - 1, locationId: null })] })
    const { units } = tick()
    expect(units[0].health).toBe(maxHp)
  })

  it('does not idle-regen units assigned to a location', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 50, locationId: 'loc1' })] })
    const { units } = tick()
    expect(units[0].health).toBe(50)
  })
})

describe('Health — batchTick KO recovery', () => {
  it('regens RESTING_REGEN_RATE × remaining ticks after KO phase ends mid-batch', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: RECOVERY_TICKS, locationId: null })] })
    useGameStore.getState().batchTick(RECOVERY_TICKS + 10)
    const { units } = useGameStore.getState()
    expect(units[0].recoveryTicksLeft).toBe(0)
    expect(units[0].health).toBe(10 * RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)
  })

  it('stays in KO phase if batch ends before countdown reaches 0', () => {
    resetStore({ units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: RECOVERY_TICKS, locationId: null })] })
    useGameStore.getState().batchTick(RECOVERY_TICKS - 3)
    const { units } = useGameStore.getState()
    expect(units[0].recoveryTicksLeft).toBe(3)
    expect(units[0].health).toBe(0)
    expect(units[0].isResting).toBe(false)
  })

  it('resting unit regens at RESTING_REGEN_RATE × n ticks in batchTick', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({ units: [makeUnit({ id: 'u1', health: 0, isResting: true, recoveryTicksLeft: 0, locationId: null })] })
    useGameStore.getState().batchTick(20)
    const { units } = useGameStore.getState()
    expect(units[0].health).toBe(Math.min(maxHp, 20 * RESTING_REGEN_RATE))
    expect(units[0].isResting).toBe(true)
  })

  it('clears isResting in batchTick when regen reaches maxHp', () => {
    const maxHp = getDerivedStats(makeUnit(), []).maxHp
    resetStore({ units: [makeUnit({ id: 'u1', health: maxHp - 5, isResting: true, recoveryTicksLeft: 0, locationId: null })] })
    useGameStore.getState().batchTick(10)
    const { units } = useGameStore.getState()
    expect(units[0].health).toBe(maxHp)
    expect(units[0].isResting).toBe(false)
  })
})

describe('Health — isResting save-migration guard', () => {
  it('tick(): unit with undefined isResting at health=0 enters resting, not stuck', () => {
    const unit = { ...makeUnit({ health: 0, recoveryTicksLeft: 0, locationId: null }), isResting: undefined as unknown as boolean }
    resetStore({ units: [unit] })
    const { units } = tick()
    expect(units[0].health).toBe(RESTING_REGEN_RATE)
    expect(units[0].isResting).toBe(true)
  })

  it('batchTick(): unit with explicit isResting=false at health=0 is healed (not stuck)', () => {
    resetStore({ units: [makeUnit({ health: 0, recoveryTicksLeft: 0, isResting: false, locationId: null })] })
    useGameStore.getState().batchTick(10)
    const { units } = useGameStore.getState()
    expect(units[0].health).toBeGreaterThan(0)
    expect(units[0].isResting).toBe(true)
  })
})
