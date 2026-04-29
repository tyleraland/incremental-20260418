// Requirements: Encounters & Combat + Targeting + Monster Behavior sections of CLAUDE.md
import { beforeEach, describe, expect, it } from 'vitest'
import { getDerivedStats, MONSTER_REGISTRY } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

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
