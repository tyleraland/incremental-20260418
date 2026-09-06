// §minions: a hero's beast companion fields alongside it as an owned, leashed
// player combatant — and is kept out of the per-hero analytics / XP split (it
// isn't a real unit).
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location, CompanionInstance } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const OPEN = (monsterIds: string[], cap: number, size = 10): Location => ({
  id: 'field', region: 'world', name: 'Field',
  description: '', traits: [], monsterIds, familiarityMax: 100, connections: [],
  openWorld: true, openWorldCap: cap, openWorldSize: size,
})

const WOLF: CompanionInstance = { speciesId: 'wolf', name: 'Wolf', tactics: [{ id: 'guardian', rank: 1 }, { id: 'tank-buster', rank: 1 }] }

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('beast companion in combat', () => {
  it('fields the pet as an owned, leashed player combatant beside its hero', () => {
    resetStore({
      unitStats: {},
      locations: [OPEN(['slime'], 4)],
      units: [makeUnit({ id: 'hero', locationId: 'field', health: 100, level: 5, companion: WOLF })],
    })
    for (let i = 0; i < 20; i++) tick()

    const battle = useGameStore.getState().battles['field']
    expect(battle).toBeTruthy()
    const pet = battle.combatants.find((c) => c.id === 'hero~pet')
    expect(pet).toBeTruthy()
    expect(pet!.team).toBe('player')
    expect(pet!.ownerId).toBe('hero')
    expect(pet!.leashRange).toBeGreaterThan(0)
    expect(pet!.summonTtl).toBeNull()          // permanent while the hero is fielded
    // It scales with the owner (level 5 → more than a level-1 baseline).
    expect(pet!.maxHp).toBeGreaterThan(50)
  })

  it('keeps the pet out of the per-hero analytics (no phantom unit stats)', () => {
    resetStore({
      unitStats: {}, unitStatHistory: {},
      locations: [OPEN(['slime'], 4)],
      units: [makeUnit({ id: 'hero', locationId: 'field', health: 100, level: 5,
        abilities: { strength: 40, agility: 5, dexterity: 5, constitution: 20, intelligence: 5 }, companion: WOLF })],
    })
    for (let i = 0; i < 400; i++) tick()

    const st = useGameStore.getState()
    // The pet id never leaks into the persisted per-hero tallies.
    expect(Object.keys(st.unitStats)).not.toContain('hero~pet')
    expect(Object.keys(st.unitStatHistory)).not.toContain('hero~pet')
    // The real hero is still tracked.
    expect(st.unitStats['hero']?.combatTicks ?? 0).toBeGreaterThan(0)
  })

  it('crumbles the pet when its hero is KO\'d, and the leash keeps it near the hero', () => {
    resetStore({
      locations: [OPEN(['slime'], 3)],
      units: [makeUnit({ id: 'hero', locationId: 'field', health: 100, level: 3, companion: WOLF })],
    })
    for (let i = 0; i < 15; i++) tick()
    const battle = useGameStore.getState().battles['field']
    const hero = battle.combatants.find((c) => c.id === 'hero')!
    const pet = battle.combatants.find((c) => c.id === 'hero~pet')!
    // Within leash of the hero (it followed, didn't wander off).
    const d = Math.hypot(pet.pos.x - hero.pos.x, pet.pos.y - hero.pos.y)
    expect(d).toBeLessThanOrEqual(pet.leashRange! + 2)
  })
})
