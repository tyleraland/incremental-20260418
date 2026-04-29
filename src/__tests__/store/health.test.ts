// Requirements: Health section of CLAUDE.md
import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { useGameStore, RECOVERY_TICKS, REGEN_RATE, getDerivedStats } from '@/stores/useGameStore'
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

  it('does not apply combat damage to KO\'d units (recovery takes priority)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot()] },
    })
    // KO'd unit is not in aliveUnits so not targeted; regen fires instead
    const { units } = tick()
    expect(units[0].health).toBe(REGEN_RATE)
    expect(units[0].recoveryTicksLeft).toBe(4)
  })
})

describe('Health — KO recovery regen', () => {
  it('regens health at REGEN_RATE per tick during the recovery countdown', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].health).toBe(REGEN_RATE)
    expect(units[0].recoveryTicksLeft).toBe(4)
  })

  it('returns from KO with at least REGEN_RATE HP — never 0', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 1, locationId: null })],
    })
    const { units } = tick()
    expect(units[0].recoveryTicksLeft).toBe(0)
    expect(units[0].health).toBe(REGEN_RATE)
    expect(units[0].health).toBeGreaterThan(0)
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
