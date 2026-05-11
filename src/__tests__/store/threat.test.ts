// Threat / aggro tests:
//   - Monster picks the unit it has taken damage from (sticky aggro).
//   - When a different unit deals more damage, the monster switches targets.
//   - Threat is per-slot — damaging slot A doesn't pull aggro from slot B.
import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0) }) // all attacks hit
afterEach(() => { vi.restoreAllMocks() })

function slotsAt(loc = 'loc1') { return useGameStore.getState().encounters[loc] }

describe('Threat — monsters aggro the unit that has hurt them most', () => {
  it('threat accumulates per-unit as that unit lands hits', () => {
    // Single slime placed at melee range, two units stacked at the same spot.
    // With 1 slot and 2 attackers both focusing it, both land hits and both
    // accumulate threat — equal amounts since attackers are identical.
    resetStore({
      units: [
        makeUnit({ id: 'A', locationId: 'loc1' }),
        makeUnit({ id: 'B', locationId: 'loc1' }),
      ],
      unitDistance: { A: 0, B: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime', distance: 5, phase: 'standing' })] },
    })
    tick()
    const slot = slotsAt()[0]
    expect((slot.threat.A ?? 0)).toBeGreaterThan(0)
    expect((slot.threat.B ?? 0)).toBeGreaterThan(0)
    expect(slot.threat.A).toBeCloseTo(slot.threat.B, 5)
  })

  it('monster switches targets when a second unit accumulates more threat', () => {
    // Pre-load threat so A is the current aggro target.
    resetStore({
      units: [
        makeUnit({ id: 'A', locationId: 'loc1' }),
        makeUnit({ id: 'B', locationId: 'loc1' }),
      ],
      unitDistance: { A: 0, B: 0 },
      encounters: { loc1: [makeEncounterSlot({
        monsterId: 'slime', distance: 5, phase: 'standing',
        threat: { A: 50, B: 0 },
      })] },
    })
    tick()
    expect(slotsAt()[0].targetUnitId).toBe('A')

    // Now give B a much larger threat value and tick — wolf should switch.
    useGameStore.setState((s) => ({
      encounters: {
        ...s.encounters,
        loc1: s.encounters.loc1.map((sl, i) => i === 0 ? { ...sl, threat: { A: 50, B: 999 } } : sl),
      },
    }))
    tick()
    expect(slotsAt()[0].targetUnitId).toBe('B')
  })

  it('threat is per-slot — damaging slot 0 does not pull aggro on slot 1', () => {
    // Two slimes; unit A is in melee of both. Pre-load threat only on slot 0.
    resetStore({
      units: [
        makeUnit({ id: 'A', locationId: 'loc1' }),
        makeUnit({ id: 'B', locationId: 'loc1' }),
      ],
      unitDistance: { A: 0, B: 0 },
      encounters: { loc1: [
        makeEncounterSlot({ monsterId: 'slime', distance: 5, phase: 'standing', threat: { A: 999, B: 0 } }),
        makeEncounterSlot({ monsterId: 'slime', distance: 5, phase: 'standing', threat: { A: 0, B: 0 } }),
      ] },
    })
    tick()
    // Slot 0 has threat on A → targets A.
    expect(slotsAt()[0].targetUnitId).toBe('A')
    // Slot 1 has no threat → falls back to round-robin (slot index 1 → aliveUnits[1] = B).
    expect(slotsAt()[1].targetUnitId).toBe('B')
  })

  it('threat resets when an encounter fully respawns after a flee', () => {
    resetStore({
      units: [makeUnit({ id: 'A', locationId: 'loc1' })],
      unitDistance: { A: 0 },
      // Pre-load threat and mark slot as 'avoid' to trigger a flee.
      encounters: { loc1: [makeEncounterSlot({
        monsterId: 'slime', distance: 5, phase: 'standing',
        threat: { A: 999 }, priority: -1,
      })] },
    })
    // First tick sets the flee countdown to FLEE_TICKS_CONST; subsequent ticks
    // decrement; the final decrement resets the slot.
    for (let i = 0; i < 12; i++) tick()
    expect(Object.keys(slotsAt()[0].threat).length).toBe(0)
  })
})

// Regression: the rolling-DPS UI rate must agree with the actual progress
// applied by the tick loop. If a future modifier changes one without the other,
// the combat text would lie. We check that the per-tick progress increment
// equals (chunk = uc / (level*5*TICKS_PER_SECOND)) — i.e. the tick uses the
// post-modifier value, not the pre-modifier one.
describe('Combat numbers regression — display values follow actual damage', () => {
  it('progress increment per tick matches the post-element-multiplier chunk', () => {
    // Slime is water-element; an electric-imbued unit gets 2x. We assert that
    // a single tick's progress ≈ 2 × the neutral baseline, proving the multiplier
    // is consumed in the same place that drives the UI's takenHistory.
    const ELEC = { id: 'eq-test-elec', name: 'X', category: 'weapon-1h' as const, traits: [], stats: { attack: 0 }, slots: 0, element: 'lightning' as const }
    resetStore({
      units: [makeUnit({ id: 'u1', locationId: 'loc1' })],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime', distance: 5, phase: 'standing' })] },
    })
    tick()
    const baselineProg = slotsAt()[0].progress

    resetStore({
      units: [makeUnit({
        id: 'u1', locationId: 'loc1',
        weaponSets: [{ mainHand: 'eq-test-elec', offHand: null }, { mainHand: null, offHand: null }],
      })],
      equipment: [ELEC],
      unitDistance: { u1: 0 },
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime', distance: 5, phase: 'standing' })] },
    })
    tick()
    const elecProg = slotsAt()[0].progress
    // 2× ± a small floor-rounding tolerance baked into chunk = round(rawChunk * H)/H.
    expect(elecProg / baselineProg).toBeCloseTo(2, 1)
  })
})
