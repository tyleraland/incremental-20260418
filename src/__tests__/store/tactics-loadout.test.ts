// Equip-tactics UI store layer: per-unit loadout edits, party tactics, the
// per-unit/party caps, scope validation, and that combat reads the loadout.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, MAX_UNIT_TACTICS, MAX_PARTY_TACTICS } from '@/stores/useGameStore'
import { unitToEngineInput } from '@/engine'
import { getDerivedStats } from '@/lib/stats'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const ids = (arr: { id: string }[] | undefined) => (arr ?? []).map((t) => t.id)

describe('store: per-unit tactics', () => {
  beforeEach(() => resetStore({ units: [makeUnit({ id: 'u1', tactics: [] })] }))

  it('equips a unit-scope tactic, ignoring duplicates and party-scope ids', () => {
    const { equipTactic } = useGameStore.getState()
    equipTactic('u1', 'charger')
    equipTactic('u1', 'charger')          // duplicate → no-op
    equipTactic('u1', 'finish-them')      // party scope → rejected on a unit
    equipTactic('u1', 'not-a-tactic')     // unknown → rejected
    expect(ids(useGameStore.getState().units[0].tactics)).toEqual(['charger'])
  })

  it('caps the loadout at MAX_UNIT_TACTICS', () => {
    const { equipTactic } = useGameStore.getState()
    for (const id of ['charger', 'armored', 'nimble', 'tank-buster', 'opportunist']) equipTactic('u1', id)
    expect(useGameStore.getState().units[0].tactics).toHaveLength(MAX_UNIT_TACTICS)
  })

  it('unequips by id', () => {
    const { equipTactic, unequipTactic } = useGameStore.getState()
    equipTactic('u1', 'charger'); equipTactic('u1', 'armored')
    unequipTactic('u1', 'charger')
    expect(ids(useGameStore.getState().units[0].tactics)).toEqual(['armored'])
  })

  it('reorders priority with moveTactic, clamping at the ends', () => {
    const { equipTactic, moveTactic } = useGameStore.getState()
    equipTactic('u1', 'charger'); equipTactic('u1', 'armored'); equipTactic('u1', 'nimble')
    moveTactic('u1', 'nimble', -1)              // nimble up one
    expect(ids(useGameStore.getState().units[0].tactics)).toEqual(['charger', 'nimble', 'armored'])
    moveTactic('u1', 'charger', -1)             // already first → no-op
    expect(ids(useGameStore.getState().units[0].tactics)).toEqual(['charger', 'nimble', 'armored'])
  })
})

describe('store: inherited tactics (skill coupling)', () => {
  const mageUnit = () => makeUnit({
    id: 'm', tactics: [],
    learnedSkills: { 'lightning-storm': 1 },
    actionSlots: [{ kind: 'skill', id: 'lightning-storm' }, null, null, null, null, null],
  })

  it('inherits Storm Caller from an equipped AoE skill (free, into combat)', () => {
    const u = mageUnit()
    const e = unitToEngineInput(u, getDerivedStats(u, []), 'player')
    expect(ids(e.tactics)).toContain('storm-caller')
  })

  it('toggleInheritedTactic decouples it (and re-couples on a second toggle)', () => {
    resetStore({ units: [mageUnit()] })
    const { toggleInheritedTactic } = useGameStore.getState()

    toggleInheritedTactic('m', 'storm-caller')
    const off = useGameStore.getState().units[0]
    expect(off.suppressedTactics).toEqual(['storm-caller'])
    expect(ids(unitToEngineInput(off, getDerivedStats(off, []), 'player').tactics)).not.toContain('storm-caller')

    toggleInheritedTactic('m', 'storm-caller')
    const on = useGameStore.getState().units[0]
    expect(on.suppressedTactics).toEqual([])
    expect(ids(unitToEngineInput(on, getDerivedStats(on, []), 'player').tactics)).toContain('storm-caller')
  })
})

describe('store: party tactics', () => {
  beforeEach(() => resetStore({ units: [], partyTactics: [] }))

  it('equips only party-scope tactics, capped at MAX_PARTY_TACTICS', () => {
    const { equipPartyTactic } = useGameStore.getState()
    equipPartyTactic('charger')        // unit scope → rejected
    equipPartyTactic('finish-them')
    equipPartyTactic('finish-them')    // duplicate → no-op
    expect(ids(useGameStore.getState().partyTactics)).toEqual(['finish-them'])
    expect(MAX_PARTY_TACTICS).toBeGreaterThan(0)
  })

  it('unequips a party tactic', () => {
    const { equipPartyTactic, unequipPartyTactic } = useGameStore.getState()
    equipPartyTactic('finish-them')
    unequipPartyTactic('finish-them')
    expect(useGameStore.getState().partyTactics).toEqual([])
  })
})

describe('adapter passthrough', () => {
  it('projects the unit loadout into the engine input', () => {
    const unit = makeUnit({ tactics: [{ id: 'tank-buster', rank: 2 }] })
    const e = unitToEngineInput(unit, getDerivedStats(unit, []), 'player')
    expect(e.tactics).toEqual([{ id: 'tank-buster', rank: 2 }])
  })
})

describe('combat reads the loadout', () => {
  // The Geffen Dungeon 2 override always spawns 3 tough-slimes (def 36) + 2 bats,
  // so the wave has a clear highest-DEF target regardless of party size.
  const WALL: Location = {
    id: 'geffen-dungeon-2', region: 'geffen', name: 'GD2',
    description: '', traits: [], monsterIds: ['tough-slime', 'bat'], familiarityMax: 100, connections: [],
  }
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  it('a Tank Buster locks the highest-DEF enemy in the spawned battle', () => {
    resetStore({
      locations: [WALL],
      units: [makeUnit({ id: 'u1', locationId: 'geffen-dungeon-2', health: 100, tactics: [{ id: 'tank-buster', rank: 1 }] })],
      partyTactics: [],
    })
    tick(); tick()   // spawn, then advance a round so targeting resolves
    const battle = useGameStore.getState().battles['geffen-dungeon-2']
    const self = battle.combatants.find((c) => c.id === 'u1')!
    const locked = battle.combatants.find((c) => c.id === self.lockedTargetId)!
    const enemies = battle.combatants.filter((c) => c.team === 'enemy')
    const maxDef = Math.max(...enemies.map((c) => c.def))
    expect(locked.team).toBe('enemy')
    expect(locked.def).toBe(maxDef)   // a tough-slime (def 36) over the bats
  })
})
