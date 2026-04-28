// Requirements: Health section of CLAUDE.md
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore, RECOVERY_TICKS, REGEN_RATE } from '@/stores/useGameStore'
import { makeUnit, resetStore, tick } from '../helpers'

// makeUnit: armorDefense=0, abilityDefense=CON=5, dodge=AGI=5
// Wolf: attack=8, aps=1.4, accuracy=10
// computeDmg(8, 0, 5) = 8 - 5 = 3; hitRate(10, 5) = 0.85
// dmgPerTick = 1.4 * 3 * 0.85 = 3.57 → floor(100 - 3.57) = 96
const WOLF_DMG = 1.4 * 3 * 0.85  // 3.57

beforeEach(() => {
  resetStore({
    units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
    encounters: { loc1: [{ monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal' }] },
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
      encounters: { loc1: [{ monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal' }] },
    })
    // floor(1 - 1.143) = floor(-0.143) = -1 ≤ 0 → KO
    const { units } = tick()
    expect(units[0].health).toBe(0)
    expect(units[0].recoveryTicksLeft).toBe(RECOVERY_TICKS)
  })

  it('does not apply combat damage to KO\'d units (recovery takes priority)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' })],
      encounters: { loc1: [{ monsterId: 'wolf', progress: 0, targetUnitId: null, behavior: 'normal' }] },
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
      units: [makeUnit({ id: 'u1', health: 97, locationId: null })],
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
