// The Combat Tactic Engine wired into the tick loop: battles spawn per
// location, advance a round on the cadence, and feed rewards / KO back to units.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const FIELD = (monsterIds: string[]): Location => ({
  id: 'field', region: 'prontera', name: 'Field',
  description: '', traits: [], monsterIds, familiarityMax: 100, connections: [],
})

// Make loot rolls + any randomness deterministic for these assertions.
beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('combat engine — battle lifecycle', () => {
  it('spawns a battle for an eligible party at a location with monsters', () => {
    resetStore({
      locations: [FIELD(['slime'])],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })],
    })
    tick()
    const battle = useGameStore.getState().battles['field']
    expect(battle).toBeDefined()
    expect(battle.combatants.some((c) => c.team === 'player')).toBe(true)
    expect(battle.combatants.some((c) => c.team === 'enemy')).toBe(true)
  })

  it('does not spawn a battle when no units are assigned', () => {
    resetStore({ locations: [FIELD(['slime'])], units: [] })
    tick()
    expect(useGameStore.getState().battles['field']).toBeUndefined()
  })

  it('a strong party clears waves: kills, XP, and gold accrue', () => {
    resetStore({
      locations: [FIELD(['slime'])],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100, exp: 0, abilities: { strength: 50, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 } })],
    })
    for (let i = 0; i < 400; i++) tick()
    const s = useGameStore.getState()
    expect(s.monsterDefeated['slime'] ?? 0).toBeGreaterThan(0)
    expect(s.units[0].exp).toBeGreaterThan(0)
    expect((s.miscItems.find((m) => m.id === 'm-gold')?.quantity ?? 0)).toBeGreaterThan(0)
  })

  it('KOs a fragile unit that loses a fight, starting recovery', () => {
    resetStore({
      locations: [FIELD(['stone-golem'])],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 3 })],
    })
    let wasKOd = false
    for (let i = 0; i < 80 && !wasKOd; i++) {
      tick()
      if (useGameStore.getState().units[0].recoveryTicksLeft > 0) wasKOd = true
    }
    expect(wasKOd).toBe(true)
  })
})
