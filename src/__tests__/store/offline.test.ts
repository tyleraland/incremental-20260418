// Sampled Offline Progression ("Warm Catch-up"). batchTick extrapolates each
// deployed location's realized reward rate over the offline span (warm) or
// primes a cold location with a budgeted sim first (Phase 2). exp/gold/kills are
// deterministic; loot is rolled per projected kill.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, getLocationCombatReport } from '@/stores/useGameStore'
import { projectOfflineRewards, rollOfflineLoot, splitExpByLevel } from '@/lib/offline'
import type { Location, LocationCombatStats } from '@/types'
import { makeUnit, resetStore, batchTick } from '../helpers'

const FIELD = (overrides: Partial<Location> = {}): Location => ({
  id: 'field', region: 'world', name: 'Field',
  description: '', traits: [], monsterIds: ['slime'], familiarityMax: 100, connections: [],
  ...overrides,
})

const OPEN = (monsterIds: string[], cap: number, size = 12): Location => FIELD({
  monsterIds, openWorld: true, openWorldCap: cap, openWorldSize: size,
})

const STATS = (overrides: Partial<LocationCombatStats> = {}): LocationCombatStats => ({
  startTick: 0, monstersDefeated: { slime: 100 }, itemsDropped: {},
  expDistributed: 100, goldEarned: 100, ...overrides,
})

describe('projectOfflineRewards (pure)', () => {
  it('scales the realized rate by offline / window ticks', () => {
    const report = getLocationCombatReport(STATS(), 1000) // window = 1000 ticks
    const proj = projectOfflineRewards(report, 500)        // half the window
    expect(proj.exp).toBe(50)
    expect(proj.gold).toBe(50)
    expect(proj.killsByMonster.slime).toBe(50)
  })

  it('returns zeros with no sample or a zero-length window', () => {
    expect(projectOfflineRewards(getLocationCombatReport(undefined, 100), 500))
      .toEqual({ exp: 0, gold: 0, killsByMonster: {} })
    expect(projectOfflineRewards(getLocationCombatReport(STATS(), 0), 500).exp).toBe(0)
  })
})

describe('splitExpByLevel (pure) — anti-power-leveling', () => {
  it('splits a pool proportional to level (1% / 99%)', () => {
    const shares = splitExpByLevel(100, [{ id: 'low', level: 1 }, { id: 'high', level: 99 }])
    expect(shares.low).toBeCloseTo(1)
    expect(shares.high).toBeCloseTo(99)
  })

  it('an equal-level party splits the pool evenly', () => {
    const shares = splitExpByLevel(10, [{ id: 'a', level: 5 }, { id: 'b', level: 5 }])
    expect(shares.a).toBe(5)
    expect(shares.b).toBe(5)
  })

  it('falls back to an even split when every level is 0', () => {
    const shares = splitExpByLevel(8, [{ id: 'a', level: 0 }, { id: 'b', level: 0 }])
    expect(shares).toEqual({ a: 4, b: 4 })
  })

  it('empty pool or empty group yields nothing', () => {
    expect(splitExpByLevel(0, [{ id: 'a', level: 5 }])).toEqual({})
    expect(splitExpByLevel(10, [])).toEqual({})
  })
})

describe('rollOfflineLoot (pure)', () => {
  it('rolls drops per projected kill (rng pinned)', () => {
    // slime: drop-slime-gel @ 0.90, qty 1..2. rng=0 → always drops, qty=min=1.
    expect(rollOfflineLoot({ slime: 10 }, () => 0)).toEqual({ 'drop-slime-gel': 10 })
    // rng above the drop rate → nothing lands.
    expect(rollOfflineLoot({ slime: 10 }, () => 0.95)).toEqual({})
  })

  it('lands a drop on a single kill when the roll succeeds (rolling, not flooring)', () => {
    // A floored-EV model would give floor(1 × 0.90) = 0; rolling lands it.
    expect(rollOfflineLoot({ slime: 1 }, () => 0)['drop-slime-gel']).toBe(1)
  })
})

describe('batchTick — warm extrapolation (Phase 1)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  it('extrapolates exp/gold/loot/kills for a deployed location with a sample', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },           // 100 kills over a 1000-tick window
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [],
    })
    batchTick(1000)                                  // away exactly one window → rate ×1

    const st = useGameStore.getState()
    expect(st.monsterDefeated.slime).toBe(100)       // codex credited
    expect(st.locationStats.field.expDistributed).toBe(200) // 100 prior + 100 offline
    expect(st.miscItems.find((m) => m.id === 'm-gold')?.quantity).toBe(100)
    expect(st.miscItems.find((m) => m.id === 'drop-slime-gel')?.quantity).toBe(100) // 100 kills × qty 1
  })

  it('surfaces a "while you were away" summary after a real absence', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [],
    })
    batchTick(1000)                                  // 1000 ticks = 200s ≥ 60s gate
    const sum = useGameStore.getState().offlineSummary
    expect(sum?.totalKills).toBe(100)
    expect(sum?.totalGold).toBe(100)
    expect(sum?.locations[0]).toMatchObject({ locationId: 'field', primed: false })
  })

  it('applies rewards but suppresses the modal for a brief blip (< 60s)', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [],
      offlineSummary: null,
    })
    batchTick(100)                                   // 20s away → under the gate
    const st = useGameStore.getState()
    expect(st.offlineSummary).toBeNull()             // no modal
    expect(st.monsterDefeated.slime).toBe(10)        // rewards still applied (rate ×0.1)
  })

  it('splits the offline XP pool across the party by level (anti-power-leveling)', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },             // pool = 100 over a 1000-tick window, ×1
      units: [
        makeUnit({ id: 'young', locationId: 'field', health: 100, level: 1,  exp: 0, expToNext: 999_999 }),
        makeUnit({ id: 'vet',   locationId: 'field', health: 100, level: 99, exp: 0, expToNext: 999_999 }),
      ],
      miscItems: [],
    })
    batchTick(1000)

    const st = useGameStore.getState()
    const young = st.units.find((u) => u.id === 'young')!
    const vet   = st.units.find((u) => u.id === 'vet')!
    expect(young.exp).toBeCloseTo(1)    // 1 / (1+99) of the pool
    expect(vet.exp).toBeCloseTo(99)     // 99 / 100 of the pool
    // Pool total is conserved — same-total XP, just redistributed by level.
    expect(young.exp + vet.exp).toBeCloseTo(100)
  })

  it('ignores locations with no deployed units', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'idler', locationId: null, health: 100 })],
      miscItems: [],
    })
    batchTick(1000)
    const st = useGameStore.getState()
    expect(st.monsterDefeated.slime ?? 0).toBe(0)
    expect(st.offlineSummary).toBeNull()
  })
})

describe('batchTick — cold priming (Phase 2)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  it('primes a deployed-but-unsampled location and credits its rewards', () => {
    resetStore({
      ticks: 0,
      locations: [OPEN(['slime'], 3)],
      locationStats: {},                             // cold: no sample
      units: [0, 1, 2].map((i) => makeUnit({
        id: `u${i}`, locationId: 'field', health: 100,
        abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 },
      })),
      miscItems: [],
    })
    batchTick(6000)                                  // ~20min away

    const st = useGameStore.getState()
    expect(st.monsterDefeated.slime ?? 0).toBeGreaterThan(0) // priming produced kills
    expect(st.battles.field).toBeDefined()                   // primed battle settled & kept
    expect(st.locationStats.field).toBeDefined()             // a sample now exists
    expect(st.offlineSummary?.locations[0]).toMatchObject({ primed: true })
  })
})
