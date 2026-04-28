// Requirements: Encounters & Combat + Targeting + Monster Behavior sections of CLAUDE.md
import { beforeEach, describe, expect, it } from 'vitest'
import { getDerivedStats } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

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
  // makeUnit defaults: all abilities=5, level=1
  // unit armorDefense=0, abilityDefense=CON=5, dodge=AGI=5
  // wolf: attack=8, aps=1.4, accuracy=10, armorDefense=4 (unused for unit defense), range=0
  // computeDmg(8, 0, 5) = max(1, 8*1 - 5) = 3
  // hitRate(10, 5) = (10-5+80)/100 = 0.85
  // dmgPerTick = 1.4 * 3 * 0.85 = 3.57 → floor(100 - 3.57) = 96
  it('applies stat-driven damage from wolf to its target', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(96)
  })

  it('ignore monsters still deal damage to units', () => {
    // wolf + rock-crab (ignore): crab's ignore only freezes its progress — it still attacks
    // 2 monsters, 1 unit → both target u1
    // wolf: 1.4 * computeDmg(8,0,5) * hitRate(10,5) = 1.4*3*0.85 = 3.57
    // rock-crab: attack=10, aps=0.6, accuracy=10; computeDmg(10,0,5)=5; hitRate(10,5)=0.85
    //   crab dmg = 0.6 * 5 * 0.85 = 2.55; total = 6.12 → floor(100 - 6.12) = 93
    resetStore({
      units: [makeUnit({ id: 'u1', health: 100, locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' }), makeEncounterSlot({ monsterId: 'rock-crab', behavior: 'ignore' })] },
    })
    const { units } = tick()
    expect(units[0].health).toBe(93)
  })
})

describe('Encounter progress', () => {
  // makeUnit defaults: all abilities=5, level=1
  // aps = 0.8 * (1+5/100) * (1+5/500) = 0.8484
  // attack = 5 (STR + floor(STR/10)² = 5+0)
  // accuracy = DEX+level = 6; dodge = AGI = 5
  // wolf: armorDefense=4, abilityDefense=0, dodge=8, maxHp=80
  // computeDmg(5, 4, 0) = 5*100/104 ≈ 4.808
  // hitRate(6, 8) = 0.78
  // dpTick = 0.8484 * 4.808 * 0.78 / 80 ≈ 0.0398
  it('advances by stat-driven dpTick/maxHp per tick for attacked slots', () => {
    const u = makeUnit({ id: 'u1', locationId: 'loc1' })
    const { aps, attack, accuracy } = getDerivedStats(u, [])
    // wolf stats
    const wolfArmorDef = 4, wolfAbilityDef = 0, wolfDodge = 8, wolfMaxHp = 80
    const dmg = Math.max(1, attack * (100 / (100 + wolfArmorDef)) - wolfAbilityDef)
    const hit = Math.max(0.05, Math.min(0.95, (accuracy - wolfDodge + 80) / 100))
    const expectedProgress = aps * dmg * hit / wolfMaxHp

    resetStore({
      units: [u],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf' })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBeCloseTo(expectedProgress, 5)
  })

  it('resamples the encounter when all slots reach full progress (monster defeated)', () => {
    // No location configured → encounter becomes empty after resample
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 1.0 })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1']).toHaveLength(0)
  })

  it('does not reset a slot that has not yet reached full progress', () => {
    const u = makeUnit({ id: 'u1', locationId: 'loc1' })
    const { aps, attack, accuracy } = getDerivedStats(u, [])
    const wolfArmorDef = 4, wolfAbilityDef = 0, wolfDodge = 8, wolfMaxHp = 80
    const dmg = Math.max(1, attack * (100 / (100 + wolfArmorDef)) - wolfAbilityDef)
    const hit = Math.max(0.05, Math.min(0.95, (accuracy - wolfDodge + 80) / 100))
    const dpTick = aps * dmg * hit / wolfMaxHp

    resetStore({
      units: [u],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'wolf', progress: 0.5 })] },
    })
    const { encounters } = tick()
    expect(encounters['loc1'][0].progress).toBeCloseTo(0.5 + dpTick, 5)
  })
})
