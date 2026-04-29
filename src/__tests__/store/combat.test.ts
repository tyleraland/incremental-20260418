// Requirements: Encounters & Combat + Targeting + Monster Behavior sections of CLAUDE.md
import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { getDerivedStats, MONSTER_REGISTRY, useGameStore } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick, batchTick } from '../helpers'

// All attacks hit — tests assert exact damage and progress values, not miss rates.
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0) })
afterEach(() => { vi.restoreAllMocks() })

// Base unit constitution=5 → defense = Math.floor(5 * 1.5) = 7
const BASE_DEF = getDerivedStats(makeUnit(), []).defense

function monsterDmg(monsterId: string): number {
  const m = MONSTER_REGISTRY[monsterId]
  return m.stats.attack / BASE_DEF
}

beforeEach(() => resetStore())

describe('Targeting — monster → unit (round-robin)', () => {
  it('slot i targets aliveUnits[i % aliveUnits.length]', () => {
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'].map((sl) => sl.targetUnitId)).toEqual(['u1', 'u2'])
  })

  it('wraps around when there are more monsters than units', () => {
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'].map((sl) => sl.targetUnitId)).toEqual(['u1', 'u2', 'u1'])
  })

  it('excludes KO\'d units from round-robin', () => {
    resetStore({
      units: [
        makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5, locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'].map((sl) => sl.targetUnitId)).toEqual(['u2', 'u2'])
  })

  it('sets all targets to null when no alive units are at the location', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 3, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'].map((sl) => sl.targetUnitId)).toEqual([null])
  })
})

describe('Targeting — unit → monster (focusSlots)', () => {
  it('with all normal monsters, units attack slots round-robin', () => {
    // 1 unit, 2 normal slots → unit attacks slot 0 (0 % 2 = 0), slot 1 stays frozen
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBeGreaterThan(0)
    expect(encounters['loc1'][1].progress).toBe(0)
  })

  it('prioritize makes all units focus that slot first', () => {
    // slot 0=wolf (normal), slot 1=rock-crab (prioritize). 2 units → both attack slot 1
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab', behavior: 'prioritize' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBe(0)            // wolf untouched
    expect(encounters['loc1'][1].progress).toBeGreaterThan(0) // crab focused
  })

  it('ignore monsters are never attacked (progress stays frozen)', () => {
    // slot 0=wolf (normal), slot 1=rock-crab (ignore). Only wolf is in focusSlots.
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab', behavior: 'ignore' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBeGreaterThan(0) // wolf attacked
    expect(encounters['loc1'][1].progress).toBe(0)            // crab frozen
  })
})

describe('Monster damage to units', () => {
  it('applies attack / defense damage when monster attack cooldown fires', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(Math.floor(100 - monsterDmg('wolf')))
  })

  it('ignore monsters still deal damage to units', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab', behavior: 'ignore' })] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(Math.floor(100 - monsterDmg('wolf') - monsterDmg('rock-crab')))
  })
})

describe('Encounter progress', () => {
  it('advances at 1 / (monster.level * 5) per tick for attacked slots', () => {
    // wolf level=2 → delta = 1/(2*5) = 0.1 per tick
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBeCloseTo(1 / (2 * 5))
  })

  it('removes a slot from the encounter on the tick after it reaches full progress (monster defeated)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 1.0 })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1']).toHaveLength(0)
  })

  it('does not reset a slot that has not yet reached full progress', () => {
    // 0.5 + 0.1 = 0.6 < 1 → still in progress
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 0.5 })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBeCloseTo(0.6)
  })
})

describe('Miss system', () => {
  // mockReturnValue(1) makes Math.random() ≥ any hit chance (max 0.95) → always miss
  beforeEach(() => { vi.mocked(Math.random).mockReturnValue(1) })

  it('monster attack deals no damage when it misses', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(100)
  })

  it('sets lastAttackMissed=true on the slot when monster misses', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].lastAttackMissed).toBe(true)
  })

  it('sets lastAttackMissed=false when monster hits (random=0)', () => {
    vi.mocked(Math.random).mockReturnValue(0)
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].lastAttackMissed).toBe(false)
  })

  it('unit progress does not advance when unit attack misses', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBe(0)
  })

  it('sets lastProgressMissed=true when unit attack misses', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].lastProgressMissed).toBe(true)
  })

  it('sets lastProgressMissed=false when unit attack hits (random=0)', () => {
    vi.mocked(Math.random).mockReturnValue(0)
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].lastProgressMissed).toBe(false)
  })
})

describe('takenHistory — hit/miss symmetry with dpsDealt/monsterDrainRate', () => {
  // takenHistory drives both UnitDetailPanel.dpsDealt and MonsterDetailPanel.monsterDrainRate
  // via hitFraction; they must use the same data so both displays move together.

  it('records 0 in takenHistory on unit miss', () => {
    vi.mocked(Math.random).mockReturnValue(1) // always miss
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].takenHistory).toEqual([0])
    expect(encounters['loc1'][0].lastProgressMissed).toBe(true)
  })

  it('records positive chunk in takenHistory on unit hit', () => {
    vi.mocked(Math.random).mockReturnValue(0) // always hit
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].takenHistory[0]).toBeGreaterThan(0)
    expect(encounters['loc1'][0].lastProgressMissed).toBe(false)
  })

  it('hitFraction from takenHistory matches across miss → hit sequence', () => {
    // Pre-seed a miss in history, then land one hit → [0, chunk], hitFraction = 0.5
    vi.mocked(Math.random).mockReturnValue(0) // hit
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', takenHistory: [0], progressCooldown: 0 })] },
    })
    const { encounters } = tick()
    const history = encounters['loc1'][0].takenHistory
    expect(history).toHaveLength(2)
    expect(history[0]).toBe(0)
    expect(history[1]).toBeGreaterThan(0)
    const hitFraction = history.filter(c => c > 0).length / history.length
    expect(hitFraction).toBe(0.5)
  })

  it('2-on-1: takenHistory chunk doubles vs 1-on-1 when both hit', () => {
    vi.mocked(Math.random).mockReturnValue(0) // always hit
    // 1 unit baseline
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters: enc1 } = tick()
    const singleChunk = enc1['loc1'][0].takenHistory[0]

    // 2 units same slot
    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters: enc2 } = tick()
    const doubleChunk = enc2['loc1'][0].takenHistory[0]

    expect(doubleChunk).toBeCloseTo(singleChunk * 2)
  })

  it('2-on-1: progress advances twice as fast as 1-on-1 when both hit', () => {
    vi.mocked(Math.random).mockReturnValue(0)
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters: enc1 } = tick()
    const singleProgress = enc1['loc1'][0].progress

    resetStore({
      units: [
        makeUnit({ id: 'u1', locationId: 'loc1' }),
        makeUnit({ id: 'u2', locationId: 'loc1' }),
      ],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters: enc2 } = tick()
    expect(enc2['loc1'][0].progress).toBeCloseTo(singleProgress * 2)
  })
})

describe('batchTick → tick handoff (no double-damage)', () => {
  // Regression: batchTick was setting attackCooldown=0 on every slot, so the
  // very next tick() fired an extra attack on top of what batchTick already
  // included in its smooth DPS calculation.

  it('first tick() after batchTick does not deal extra monster damage', () => {
    // slime: attack=1, attackSpeed=10 → cooldown=5, DPS = 1/7/5 ≈ 0.029/tick
    // batchTick(5) smooth damage: Math.floor(100 - 5*(1/7/5)) = 99
    // If attackCooldown reset to 0, next tick() fires again: Math.floor(99 - 1/7) = 98
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime' })] },
    })
    batchTick(5)
    const { units } = tick()
    expect(units[0].health).toBe(99)
  })

  it('first tick() after batchTick does not advance progress extra', () => {
    // Same regression path for progressCooldown: after batchTick, the unit
    // should not get a free extra hit on top of the batch progress.
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime' })] },
    })
    batchTick(5)
    // With Math.random()=0, progressCooldown resets to 1 after batchTick → tick() decrements
    // to 0 but does not fire. Progress should stay exactly at the batchTick value.
    const afterBatch = useGameStore.getState().encounters['loc1'][0].progress
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBe(afterBatch)
  })
})
