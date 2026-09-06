// Intel mask — the STORE side (tactical-coordination.md §3.7, §8 "Independent").
// The engine emits; the store learns. This suite pins:
//   • intelRevealsFrom — the pure event reader that decides which species fields
//     a round revealed (armor from an elemental multiplier, dodge from a seen
//     dodge, kit from a seen cast), scoped to enemy SPECIES only.
//   • intelCodec — round-trip + the legacy-save default (missing slice ⇒ empty).
//   • end-to-end: a curated fight against a ghost-armored species LEARNS its
//     armor (a neutral hit reads 0×) and MASKS the live enemy combatant with it;
//     the same fight in sandbox learns identically but leaves enemies omniscient.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, intelRevealsFrom } from '@/stores/useGameStore'
import { intelCodec } from '@/save/intelCodec'
import type { BattleState } from '@/engine'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

// intelRevealsFrom only reads combatant id+team and the event list, so a thin
// stub is enough — and keeps the reveal semantics isolated from a full sim.
const battleStub = (combatants: { id: string; team: string }[], round: number, events: object[]): BattleState =>
  ({ combatants, round, events } as unknown as BattleState)

describe('intelRevealsFrom — what a round taught us', () => {
  const enemies = [{ id: 'wraith#0', team: 'enemy' }, { id: 'u1', team: 'player' }]

  it('marks armor from an elemental damage event (eff ≠ 1)', () => {
    const b = battleStub(enemies, 3, [{ round: 3, type: 'melee_attack', sourceId: 'u1', targetId: 'wraith#0', eff: 0, element: 'neutral' }])
    expect(intelRevealsFrom(b)).toEqual({ wraith: { armor: true } })
  })

  it('marks armor from a non-neutral attacking element even at eff 1', () => {
    const b = battleStub(enemies, 1, [{ round: 1, type: 'melee_attack', sourceId: 'u1', targetId: 'wraith#0', eff: 1, element: 'fire' }])
    expect(intelRevealsFrom(b)).toEqual({ wraith: { armor: true } })
  })

  it('a plain neutral 1× hit reveals nothing (you learned nothing about its armor)', () => {
    const b = battleStub(enemies, 1, [{ round: 1, type: 'melee_attack', sourceId: 'u1', targetId: 'wraith#0', eff: 1, element: 'neutral' }])
    expect(intelRevealsFrom(b)).toEqual({})
  })

  it('marks dodge from a seen dodge and kit from a seen cast (skill_use / cast_start)', () => {
    const b = battleStub(enemies, 5, [
      { round: 5, type: 'dodge', sourceId: 'u1', targetId: 'wraith#0' },
      { round: 5, type: 'cast_start', sourceId: 'wraith#0', targetId: 'u1' },
    ])
    expect(intelRevealsFrom(b)).toEqual({ wraith: { dodge: true, kit: true } })
  })

  it('only reads the current round, only enemy targets, only real species', () => {
    const b = battleStub([{ id: 'wraith#0', team: 'enemy' }, { id: 'hero#0', team: 'enemy' }, { id: 'u1', team: 'player' }], 2, [
      { round: 1, type: 'melee_attack', sourceId: 'u1', targetId: 'wraith#0', eff: 0, element: 'neutral' }, // stale round
      { round: 2, type: 'dodge', sourceId: 'wraith#0', targetId: 'u1' },     // dodge is on a PLAYER target → ignored
      { round: 2, type: 'cast_start', sourceId: 'hero#0', targetId: 'u1' },  // enemy-team hero, not a species → ignored
      { round: 2, type: 'melee_attack', sourceId: 'u1', targetId: 'wraith#0', eff: 2, element: 'radiant' },
    ])
    expect(intelRevealsFrom(b)).toEqual({ wraith: { armor: true } })
  })
})

describe('intelCodec', () => {
  it('round-trips the per-species codex', () => {
    const state = { speciesIntel: { wraith: { armor: true }, slime: { kit: true, dodge: true } } }
    expect(intelCodec.roundTrip(state).speciesIntel).toEqual(state.speciesIntel)
  })

  it('a legacy save (missing slice) loads empty', () => {
    expect(intelCodec.empty().speciesIntel).toEqual({})
    // A save envelope with no intel slice → the store rebuilds an empty codex.
    expect(intelCodec.deserialize({ speciesIntel: {} }).speciesIntel).toEqual({})
  })
})

// A ghost-armored species: a NEUTRAL hero attack reads 0× against ghost armor
// (elements matrix), so the very first landed hit teaches the party its armor.
const GHOST_FIELD = (): Location => ({
  id: 'crypt', region: 'world', name: 'Crypt',
  description: '', traits: [], monsterIds: ['wraith'], familiarityMax: 100, connections: [],
  openWorld: true, openWorldCap: 1, openWorldSize: 8,
})

const bruisers = () => [0, 1, 2].map((i) => makeUnit({
  id: `u${i}`, locationId: 'crypt', health: 100,
  abilities: { strength: 120, agility: 5, dexterity: 5, constitution: 40, intelligence: 5 },
}))

describe('end-to-end: learn a species, mask it in curated', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  const runFight = () => { for (let i = 0; i < 30; i++) tick() }
  const wraith = () => useGameStore.getState().battles['crypt']?.combatants.find((c) => c.id.startsWith('wraith'))

  it('curated: the party learns wraith armor and the live enemy carries the mask', () => {
    resetStore({ progressionMode: 'curated', speciesIntel: {}, locations: [GHOST_FIELD()], units: bruisers() })
    runFight()
    expect(useGameStore.getState().speciesIntel['wraith']?.armor).toBe(true)
    // The sweep mirrors the codex onto the live combatant (only armor known so far).
    const w = wraith()
    expect(w?.intel).toBeTruthy()
    expect(w?.intel?.armor).toBe(true)
    expect(w?.intel?.kit).toBeFalsy()   // never seen it cast → still masked
  })

  it('sandbox: learns the same species, but leaves the enemy omniscient (no mask)', () => {
    resetStore({ progressionMode: 'sandbox', speciesIntel: {}, locations: [GHOST_FIELD()], units: bruisers() })
    runFight()
    expect(useGameStore.getState().speciesIntel['wraith']?.armor).toBe(true)  // knowledge accrues in both modes
    expect(wraith()?.intel).toBeUndefined()                                   // but sandbox never masks
  })
})
