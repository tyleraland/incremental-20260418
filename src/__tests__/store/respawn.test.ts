import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { RESPAWN_TICKS_MIN, RESPAWN_TICKS_MAX } from '@/lib/time'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

describe('inter-encounter delay', () => {
  beforeEach(() => resetStore())

  it('sets respawnTicksLeft after a monster is defeated', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
    })
    const s = tick()
    const slot = s.encounters['loc1'][0]
    expect(slot.progress).toBe(0)
    expect(slot.respawnTicksLeft).toBeGreaterThanOrEqual(RESPAWN_TICKS_MIN)
    expect(slot.respawnTicksLeft).toBeLessThanOrEqual(RESPAWN_TICKS_MAX)
  })

  it('decrements respawnTicksLeft each tick', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 5 })] },
    })
    const s = tick()
    expect(s.encounters['loc1'][0].respawnTicksLeft).toBe(4)
  })

  it('does not advance progress while respawning', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 3 })] },
    })
    const s = tick()
    expect(s.encounters['loc1'][0].progress).toBe(0)
  })

  it('does not deal damage to units while respawning', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1', health: 100 })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 3 })] },
    })
    const s = tick()
    expect(s.units[0].health).toBe(100)
  })

  it('resumes combat once respawnTicksLeft reaches 0', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1', health: 100 })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 1 })] },
    })
    tick()       // respawnTicksLeft: 1 → 0
    const s = tick() // monster now active; progress should advance
    expect(s.encounters['loc1'][0].progress).toBeGreaterThan(0)
  })

  it('unit has no target while all fightable slots are respawning', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 3 })] },
    })
    const s = tick()
    expect(s.encounters['loc1'][0].targetUnitId).toBeNull()
  })

  it('batchTick decrements respawnTicksLeft by n', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 10 })] },
    })
    useGameStore.getState().batchTick(6)
    const s = useGameStore.getState()
    expect(s.encounters['loc1'][0].respawnTicksLeft).toBe(4)
  })

  it('batchTick clamps respawnTicksLeft at 0', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 3 })] },
    })
    useGameStore.getState().batchTick(100)
    const s = useGameStore.getState()
    expect(s.encounters['loc1'][0].respawnTicksLeft).toBe(0)
  })

  it('flee reset clears respawnTicksLeft', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ respawnTicksLeft: 5, behavior: 'normal' })] },
      locationFleeing: { loc1: 1 },
    })
    const s = tick()
    expect(s.encounters['loc1'][0].respawnTicksLeft).toBe(0)
  })
})
