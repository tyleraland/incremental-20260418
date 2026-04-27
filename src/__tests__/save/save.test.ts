import { describe, expect, it } from 'vitest'
import { saveGame, loadGame, makeCodec } from '@/lib/save'
import { unitsCodec }     from '@/save/unitsCodec'
import { inventoryCodec } from '@/save/inventoryCodec'
import { locationsCodec } from '@/save/locationsCodec'
import { codexCodec }     from '@/save/codexCodec'
import { worldCodec }     from '@/save/worldCodec'
import { ALL_CODECS }     from '@/save'
import { makeUnit }       from '../helpers'
import type { GameState } from '@/stores/useGameStore'

// ── Minimal state fixtures ────────────────────────────────────────────────────

const ITEM = { id: 'eq-sword', name: 'Sword', category: 'weapon-1h' as const, traits: [], stats: { attack: 5 } }
const MISC = { id: 'wolf-pelt', name: 'Wolf Pelt', quantity: 3 }

function baseState(): Partial<GameState> {
  return {
    units:                [makeUnit({ id: 'u1', locationId: 'kings-forest', health: 80 })],
    equipment:            [ITEM],
    miscItems:            [MISC],
    learnedRecipes:       ['recipe-iron-sword'],
    locationFamiliarity:  { 'kings-forest': 12 },
    locationMonstersSeen: { 'kings-forest': ['wolf'] },
    monsterSeen:          { wolf: 5 },
    monsterDefeated:      { wolf: 3 },
    ticks:                42,
  }
}

// ── Core machinery ────────────────────────────────────────────────────────────

describe('saveGame / loadGame', () => {
  it('produces a v1: prefixed string', () => {
    expect(saveGame(baseState() as GameState, ALL_CODECS)).toMatch(/^v1:/)
  })

  it('round-trips all persistent fields', () => {
    const state = baseState() as GameState
    const restored = loadGame(saveGame(state, ALL_CODECS), ALL_CODECS)
    expect(restored.units![0].locationId).toBe('kings-forest')
    expect(restored.units![0].health).toBe(80)
    expect(restored.equipment![0].stats.attack).toBe(5)
    expect(restored.miscItems![0].quantity).toBe(3)
    expect(restored.learnedRecipes).toEqual(['recipe-iron-sword'])
    expect(restored.locationFamiliarity!['kings-forest']).toBe(12)
    expect(restored.locationMonstersSeen!['kings-forest']).toEqual(['wolf'])
    expect(restored.monsterSeen!['wolf']).toBe(5)
    expect(restored.monsterDefeated!['wolf']).toBe(3)
    expect(restored.ticks).toBe(42)
  })

  it('returns {} for a corrupt string', () => {
    expect(loadGame('not-a-save', ALL_CODECS)).toEqual({})
    expect(loadGame('v1:!!!invalid base64!!!', ALL_CODECS)).toEqual({})
  })

  it('returns {} for an empty string', () => {
    expect(loadGame('', ALL_CODECS)).toEqual({})
  })

  it('ignores unknown slice keys from a future save version', () => {
    const state = baseState() as GameState
    const str = saveGame(state, ALL_CODECS)
    // Load with a subset of codecs — unknown slices in the file are simply skipped
    const restored = loadGame(str, [unitsCodec])
    expect(restored.units).toBeDefined()
    expect(restored.equipment).toBeUndefined()
  })

  it('uses empty() for a codec whose slice is missing from the file', () => {
    const state = baseState() as GameState
    // Save without codexCodec
    const str = saveGame(state, [unitsCodec, inventoryCodec, locationsCodec, worldCodec])
    // Load with codexCodec present — it should fall back to empty()
    const restored = loadGame(str, ALL_CODECS)
    expect(restored.monsterSeen).toEqual({})
    expect(restored.monsterDefeated).toEqual({})
  })
})

// ── Migration ────────────────────────────────────────────────────────────────

describe('migration', () => {
  it('calls migrate when the stored version is older than the codec version', () => {
    interface V1 { count: number }
    interface V2 { count: number; label: string }

    const v1Codec = makeCodec<V1>({
      key: 'migration-test',
      version: 1,
      serialize:   () => ({ count: 7 }),
      deserialize: (d) => ({ ticks: d.count }),
      empty:       () => ({ count: 0 }),
    })
    const oldSave = saveGame({} as GameState, [v1Codec])

    const v2Codec = makeCodec<V2>({
      key: 'migration-test',
      version: 2,
      serialize:   () => ({ count: 0, label: '' }),
      deserialize: (d) => ({ ticks: d.count * 10 }),
      migrate:     (raw, _from) => ({ ...(raw as V1), label: 'migrated' }),
      empty:       () => ({ count: 0, label: '' }),
    })
    const restored = loadGame(oldSave, [v2Codec])
    // count=7 * 10 = 70 after migration path through deserialize
    expect(restored.ticks).toBe(70)
  })

  it('skips migrate when stored version matches codec version', () => {
    let migrateCalled = false
    const codec = makeCodec<{ val: number }>({
      key: 'no-migrate-test',
      version: 3,
      serialize:   () => ({ val: 1 }),
      deserialize: (d) => ({ ticks: d.val }),
      migrate:     (d) => { migrateCalled = true; return d as { val: number } },
      empty:       () => ({ val: 0 }),
    })
    const str = saveGame({} as GameState, [codec])
    loadGame(str, [codec])
    expect(migrateCalled).toBe(false)
  })
})

// ── makeCodec roundTrip helper ────────────────────────────────────────────────

describe('makeCodec roundTrip helper', () => {
  it('returns the same partial state after serialize → deserialize', () => {
    const result = worldCodec.roundTrip({ ticks: 99 })
    expect(result.ticks).toBe(99)
  })
})

// ── Individual codec round-trips ──────────────────────────────────────────────

describe('unitsCodec', () => {
  it('round-trips locationId', () => {
    const u = makeUnit({ locationId: 'kings-forest' })
    expect(unitsCodec.roundTrip({ units: [u] }).units![0].locationId).toBe('kings-forest')
  })

  it('round-trips weapon sets', () => {
    const u = makeUnit({ weaponSets: [{ mainHand: 'eq-sword', offHand: null }, { mainHand: null, offHand: null }] })
    const restored = unitsCodec.roundTrip({ units: [u] })
    expect(restored.units![0].weaponSets[0].mainHand).toBe('eq-sword')
  })

  it('round-trips learnedSkills', () => {
    const u = makeUnit({ learnedSkills: { 'sword-mastery-1h': 3 } })
    expect(unitsCodec.roundTrip({ units: [u] }).units![0].learnedSkills['sword-mastery-1h']).toBe(3)
  })

  it('empty() returns the initial unit list', () => {
    expect(unitsCodec.empty().length).toBeGreaterThan(0)
  })
})

describe('inventoryCodec', () => {
  it('round-trips equipment items', () => {
    const restored = inventoryCodec.roundTrip({ equipment: [ITEM], miscItems: [], learnedRecipes: [] })
    expect(restored.equipment![0].stats.attack).toBe(5)
  })

  it('round-trips miscItem quantities', () => {
    const restored = inventoryCodec.roundTrip({ equipment: [], miscItems: [MISC], learnedRecipes: [] })
    expect(restored.miscItems![0].quantity).toBe(3)
  })

  it('round-trips learnedRecipes', () => {
    const restored = inventoryCodec.roundTrip({ equipment: [], miscItems: [], learnedRecipes: ['recipe-iron-sword'] })
    expect(restored.learnedRecipes).toEqual(['recipe-iron-sword'])
  })
})

describe('locationsCodec', () => {
  it('round-trips familiarity', () => {
    const restored = locationsCodec.roundTrip({ locationFamiliarity: { 'kings-forest': 7 }, locationMonstersSeen: {} })
    expect(restored.locationFamiliarity!['kings-forest']).toBe(7)
  })

  it('round-trips monstersSeen', () => {
    const restored = locationsCodec.roundTrip({
      locationFamiliarity: {}, locationMonstersSeen: { 'kings-forest': ['wolf', 'forest-sprite'] }
    })
    expect(restored.locationMonstersSeen!['kings-forest']).toEqual(['wolf', 'forest-sprite'])
  })
})

describe('codexCodec', () => {
  it('round-trips monsterSeen and monsterDefeated counts', () => {
    const restored = codexCodec.roundTrip({ monsterSeen: { wolf: 10 }, monsterDefeated: { wolf: 4 } })
    expect(restored.monsterSeen!['wolf']).toBe(10)
    expect(restored.monsterDefeated!['wolf']).toBe(4)
  })
})

describe('worldCodec', () => {
  it('round-trips ticks', () => {
    expect(worldCodec.roundTrip({ ticks: 1234 }).ticks).toBe(1234)
  })

  it('empty() returns ticks: 0', () => {
    expect(worldCodec.empty()).toEqual({ ticks: 0 })
  })
})
