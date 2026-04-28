import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { WAVE_COOLDOWN_MIN, WAVE_COOLDOWN_MAX } from '@/lib/time'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

describe('wave cooldown — slot removal on defeat', () => {
  beforeEach(() => resetStore())

  it('removes a defeated slot from the encounter on the tick after progress reaches 1', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
    })
    const s = tick()
    expect(s.encounters['loc1']).toHaveLength(0)
  })

  it('only removes the defeated slot; surviving slots remain', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: {
        loc1: [
          makeEncounterSlot({ monsterId: 'wolf',         progress: 1 }),
          makeEncounterSlot({ monsterId: 'forest-sprite', progress: 0 }),
        ],
      },
    })
    const s = tick()
    expect(s.encounters['loc1']).toHaveLength(1)
    expect(s.encounters['loc1'][0].monsterId).toBe('forest-sprite')
  })

  it('does not start a cooldown while surviving slots remain', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: {
        loc1: [
          makeEncounterSlot({ monsterId: 'wolf',         progress: 1 }),
          makeEncounterSlot({ monsterId: 'forest-sprite', progress: 0 }),
        ],
      },
    })
    const s = tick()
    expect(s.encounterCooldown['loc1']).toBeUndefined()
  })
})

describe('wave cooldown — between-wave timer', () => {
  beforeEach(() => resetStore())

  it('sets encounterCooldown when the last slot is defeated', () => {
    resetStore({
      units: [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
    })
    const s = tick()
    expect(s.encounterCooldown['loc1']).toBeGreaterThanOrEqual(WAVE_COOLDOWN_MIN)
    expect(s.encounterCooldown['loc1']).toBeLessThanOrEqual(WAVE_COOLDOWN_MAX)
  })

  it('encounter stays empty while cooldown is counting down', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'loc1' })],
      encounters:       { loc1: [] },
      encounterCooldown: { loc1: 3 },
    })
    const s = tick()
    expect(s.encounters['loc1']).toHaveLength(0)
    expect(s.encounterCooldown['loc1']).toBe(2)
  })

  it('units take no damage during the between-wave cooldown', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'loc1', health: 100 })],
      encounters:       { loc1: [] },
      encounterCooldown: { loc1: 3 },
    })
    const s = tick()
    expect(s.units[0].health).toBe(100)
  })

  it('cooldown decrements to zero before spawning, not below', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'loc1' })],
      encounters:       { loc1: [] },
      encounterCooldown: { loc1: 1 },
    })
    const s = tick()
    expect(s.encounterCooldown['loc1']).toBeUndefined()
  })
})

describe('wave cooldown — new wave spawn', () => {
  beforeEach(() => resetStore())

  it('spawns a new wave for a known location when cooldown expires', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'kings-forest' })],
      encounters:       { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 1 },
    })
    const s = tick()
    expect(s.encounters['kings-forest'].length).toBeGreaterThan(0)
  })

  it('new wave slots start at progress 0 with normal behavior', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'kings-forest' })],
      encounters:       { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 1 },
    })
    const s = tick()
    for (const slot of s.encounters['kings-forest']) {
      expect(slot.progress).toBe(0)
      expect(slot.behavior).toBe('normal')
    }
  })

  it('new wave uses the same monster composition as the initial encounter', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'kings-forest' })],
      encounters:       { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 1 },
    })
    const s = tick()
    const ids = s.encounters['kings-forest'].map((sl) => sl.monsterId).sort()
    expect(ids).toEqual(['forest-sprite', 'wolf'])
  })
})

describe('wave cooldown — batchTick', () => {
  beforeEach(() => resetStore())

  it('decrements cooldown by n ticks', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'loc1' })],
      encounters:       { loc1: [] },
      encounterCooldown: { loc1: 10 },
    })
    useGameStore.getState().batchTick(6)
    expect(useGameStore.getState().encounterCooldown['loc1']).toBe(4)
  })

  it('spawns a new wave when batch tick covers the full cooldown', () => {
    resetStore({
      units:            [makeUnit({ locationId: 'kings-forest' })],
      encounters:       { 'kings-forest': [] },
      encounterCooldown: { 'kings-forest': 3 },
    })
    useGameStore.getState().batchTick(10)
    expect(useGameStore.getState().encounters['kings-forest'].length).toBeGreaterThan(0)
  })
})
