// Open-world locations wired into the tick loop: a single persistent battle per
// location that never ends — monsters respawn up to a fixed cap and heroes
// join / leave the fight as they deploy or recover.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

// Small map by default so the party and scattered monsters are within sight and
// actually fight (the real maps are 100×100; size is overridable per test).
const OPEN = (monsterIds: string[], cap: number, size = 12): Location => ({
  id: 'field', region: 'world', name: 'Field',
  description: '', traits: [], monsterIds, familiarityMax: 100, connections: [],
  openWorld: true, openWorldCap: cap, openWorldSize: size,
})

// Pin randomness (loot rolls + monster pick) so assertions are stable.
beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

const livingEnemies = () =>
  (useGameStore.getState().battles['field']?.combatants ?? []).filter((c) => c.team === 'enemy' && c.alive).length
const playerCombatantIds = () =>
  (useGameStore.getState().battles['field']?.combatants ?? []).filter((c) => c.team === 'player').map((c) => c.id)

describe('open-world locations', () => {
  it('stands up a persistent battle filled to the cap', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })],
    })
    tick()
    const b = useGameStore.getState().battles['field']
    expect(b).toBeDefined()
    expect(b.mode).toBe('open')
    expect(b.combatants.filter((c) => c.team === 'enemy').length).toBe(3)
  })

  it('uses a large per-location map (heroes hunt across it)', () => {
    resetStore({
      locations: [OPEN(['slime'], 3, 100)],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })],
    })
    tick()
    const b = useGameStore.getState().battles['field']
    expect(b.cols).toBe(100)
    expect(b.rows).toBe(100)
    // Heroes get a finite sight radius; encounters keep Infinity.
    expect(b.combatants.find((c) => c.team === 'player')!.visionRange).toBe(10)
    expect(b.combatants.find((c) => c.team === 'enemy')!.visionRange).toBe(8)
  })

  it('never self-terminates: a strong party keeps killing as monsters respawn', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100, abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 } })],
    })
    let maxEnemies = 0
    let maxCombatants = 0
    for (let i = 0; i < 600; i++) {
      tick()
      maxEnemies = Math.max(maxEnemies, livingEnemies())
      maxCombatants = Math.max(maxCombatants, useGameStore.getState().battles['field']?.combatants.length ?? 0)
    }
    const s = useGameStore.getState()
    expect(s.battles['field'].outcome).toBe('ongoing')   // still going
    expect(s.battles['field'].mode).toBe('open')
    expect(maxEnemies).toBeLessThanOrEqual(3)             // never exceeds the cap
    expect(maxCombatants).toBeLessThan(12)               // corpses pruned — no unbounded growth
    expect(s.monsterDefeated['slime'] ?? 0).toBeGreaterThan(3)  // respawns kept feeding kills
  })

  it('fields a hero who deploys mid-battle (reconcile add)', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [
        makeUnit({ id: 'u1', locationId: 'field', health: 100 }),
        makeUnit({ id: 'u2', locationId: null, health: 100 }),
      ],
    })
    tick()
    expect(playerCombatantIds()).toEqual(['u1'])

    useGameStore.getState().assignUnits(['u2'], 'field')
    tick()
    expect(playerCombatantIds().sort()).toEqual(['u1', 'u2'])
  })

  it('pulls a hero who is no longer eligible (KO / recovery) out of the battle', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [
        makeUnit({ id: 'u1', locationId: 'field', health: 100 }),
        makeUnit({ id: 'u2', locationId: 'field', health: 100 }),
      ],
    })
    tick()
    expect(playerCombatantIds().sort()).toEqual(['u1', 'u2'])

    // u2 goes into recovery → no longer eligible → next tick removes it.
    useGameStore.setState((s) => ({
      units: s.units.map((u) => u.id === 'u2' ? { ...u, recoveryTicksLeft: 10 } : u),
    }))
    tick()
    expect(playerCombatantIds()).toEqual(['u1'])
  })

  it('tears the battle down when the last hero leaves', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })],
    })
    tick()
    expect(useGameStore.getState().battles['field']).toBeDefined()

    useGameStore.getState().assignUnits(['u1'], null)
    tick()
    expect(useGameStore.getState().battles['field']).toBeUndefined()
  })
})
