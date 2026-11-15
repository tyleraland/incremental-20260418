// Explicit spawn placement vs. timed-random respawn. spawnMonsterAt drops a
// chosen monster at a chosen spot (the primitive); the game's open-world respawn
// is the special case that picks randomly and scatters it. deployUnitAt is the
// hero equivalent for placing a unit on a live battlefield.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, spawnMonsterAt, deployUnitAt } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const OPEN = (monsterIds: string[], cap: number, size = 30): Location => ({
  id: 'field', region: 'world', name: 'Field', description: '', traits: [],
  monsterIds, familiarityMax: 100, connections: [], openWorld: true, openWorldCap: cap, openWorldSize: size,
})

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('explicit monster spawn', () => {
  it('spawnMonsterAt places a specific monster at a specific point', () => {
    resetStore({ locations: [OPEN(['slime'], 3)], units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })] })
    tick()
    const battle = useGameStore.getState().battles['field']
    const before = battle.combatants.length
    const c = spawnMonsterAt(battle, 'wolf', { x: 25, y: 4 })
    expect(c).not.toBeNull()
    expect(c!.id.startsWith('wolf')).toBe(true)
    expect(c!.pos.x).toBeCloseTo(25)
    expect(c!.pos.y).toBeCloseTo(4)
    expect(battle.combatants.length).toBe(before + 1)
  })

  it('returns null for an unknown monster id', () => {
    resetStore({ locations: [OPEN(['slime'], 3)], units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })] })
    tick()
    expect(spawnMonsterAt(useGameStore.getState().battles['field'], 'not-a-monster', { x: 5, y: 5 })).toBeNull()
  })
})

describe('timed respawn is a special case of spawn', () => {
  it('refills the field over time after kills (random scatter, from the pool)', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [0, 1, 2].map((i) => makeUnit({
        id: `u${i}`, locationId: 'field', health: 100,
        abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 },
      })),
    })
    for (let i = 0; i < 400; i++) tick()
    // Respawn kept feeding fresh slimes for the party to kill.
    expect(useGameStore.getState().monsterDefeated['slime'] ?? 0).toBeGreaterThan(3)
  })
})

describe('explicit hero deploy', () => {
  it('deployUnitAt places a hero at a chosen point on a live battlefield', () => {
    resetStore({ locations: [OPEN(['slime'], 3)], units: [makeUnit({ id: 'u1', locationId: 'field', health: 100 })] })
    tick()
    const s = useGameStore.getState()
    const battle = s.battles['field']
    const newcomer = makeUnit({ id: 'u2', name: 'Scout', health: 100 })
    const c = deployUnitAt(battle, newcomer, s.equipment, s.partyTactics, { x: 10, y: 20 })
    expect(c.team).toBe('player')
    expect(c.id).toBe('u2')
    expect(c.pos.x).toBeCloseTo(10)
    expect(c.pos.y).toBeCloseTo(20)
  })
})
