// Requirements: wave cooldown between encounters (replaced per-slot respawn)
import { describe, it, expect, beforeEach } from 'vitest'
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
