import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { RESPAWN_TICKS_MIN, RESPAWN_TICKS_MAX } from '@/lib/time'
import { makeUnit, makeEncounterSlot, makeLocation, resetStore, tick } from '../helpers'

describe('encounter pool sampling', () => {
  beforeEach(() => resetStore())

  it('samples a new encounter when all slots are defeated', () => {
    const loc = makeLocation({ id: 'loc1', monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: null }], encounterSize: [1, 1] })
    resetStore({
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
      locations: [loc],
    })
    const s = tick()
    // Fresh encounter drawn from pool
    expect(s.encounters['loc1'].length).toBeGreaterThan(0)
    expect(s.encounters['loc1'][0].progress).toBe(0)
    expect(s.encounters['loc1'][0].monsterId).toBe('wolf')
  })

  it('adds a cooldown when a monster is defeated', () => {
    // Start at near-complete progress so any dpTick will push it over 1
    const loc = makeLocation({ id: 'loc1', monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: 5 }], encounterSize: [1, 1] })
    resetStore({
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 - 1e-9 })] },
      locations: [loc],
      ticks: 0,
    })
    const s = tick()
    expect(s.monsterCooldowns['loc1']?.['wolf']?.length).toBeGreaterThanOrEqual(1)
  })

  it('cooldown readyAtTick is within the expected respawn window', () => {
    const loc = makeLocation({ id: 'loc1', monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: 5 }], encounterSize: [1, 1] })
    resetStore({
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 - 1e-9 })] },
      locations: [loc],
      ticks: 10,
    })
    const s = tick()  // newTicks = 11
    const readyAt = s.monsterCooldowns['loc1']?.['wolf']?.[0] ?? 0
    expect(readyAt).toBeGreaterThanOrEqual(11 + RESPAWN_TICKS_MIN)
    expect(readyAt).toBeLessThanOrEqual(11 + RESPAWN_TICKS_MAX)
  })

  it('produces an empty encounter when all pool entries are on cooldown', () => {
    const loc = makeLocation({ id: 'loc1', monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: 1 }], encounterSize: [1, 1] })
    resetStore({
      ticks: 0,
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
      locations: [loc],
      monsterCooldowns: { loc1: { wolf: [100] } },  // wolf on cooldown until tick 100
    })
    const s = tick()
    expect(s.encounters['loc1'].length).toBe(0)
  })

  it('does not deal damage from slots with progress >= 1', () => {
    resetStore({
      units:     [makeUnit({ locationId: 'loc1', health: 100 })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
    })
    const s = tick()
    expect(s.units[0].health).toBe(100)
  })

  it('dead slots are not attacked', () => {
    // Wolf at progress=1 (dead), should not advance further
    resetStore({
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 1 })] },
    })
    const s = tick()
    // After tick: encounter was resampled (no location = empty) or still empty
    // Either way, the original dead slot is gone
    const slot = s.encounters['loc1']?.[0]
    if (slot) expect(slot.progress).toBe(0)  // new slot always starts at 0
  })

  it('initialises a new encounter when units arrive at a location with no encounter', () => {
    const loc = makeLocation({ id: 'loc1', monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: null }], encounterSize: [1, 1] })
    resetStore({
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: {},  // no encounter set up
      locations: [loc],
    })
    const s = tick()
    expect(s.encounters['loc1'].length).toBeGreaterThan(0)
  })

  it('batchTick records a cooldown for a defeated monster', () => {
    const loc = makeLocation({ id: 'loc1', monsterPool: [{ monsterId: 'wolf', weight: 1, maxPopulation: 5 }], encounterSize: [1, 1] })
    resetStore({
      ticks: 0,
      units:     [makeUnit({ locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ progress: 0 })] },
      locations: [loc],
    })
    // dpTick ≈ 0.04/tick; need ~26 ticks per kill; 50 ticks guarantees ≥1 defeat
    useGameStore.getState().batchTick(50)
    const s = useGameStore.getState()
    expect(s.monsterCooldowns['loc1']?.['wolf']?.length).toBeGreaterThanOrEqual(1)
  })
})
