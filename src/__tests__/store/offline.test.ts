// Sampled Offline Progression ("Warm Catch-up"). batchTick extrapolates each
// deployed location's realized reward rate over the offline span (warm) or
// primes a cold location with a budgeted sim first (Phase 2). exp/gold/kills are
// deterministic; loot is rolled per projected kill.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, getLocationCombatReport, projectOfflineSampled } from '@/stores/useGameStore'
import { projectOfflineRewards, rollOfflineLoot, splitExpByLevel, offlineWindowCount, scaleKills } from '@/lib/offline'
import type { Location, LocationCombatStats } from '@/types'
import { freshHero } from '@/proto/expedition'
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

describe('sampled-window helpers (pure)', () => {
  it('offlineWindowCount: ~one window per windowTicks, clamped to [1, max]', () => {
    expect(offlineWindowCount(1000, 9000, 12)).toBe(1)    // short absence → single slice
    expect(offlineWindowCount(40000, 9000, 12)).toBe(4)   // ~one per 9000 ticks
    expect(offlineWindowCount(1_000_000, 9000, 12)).toBe(12) // capped
    expect(offlineWindowCount(0, 9000, 12)).toBe(1)        // degenerate → 1
  })

  it('scaleKills: floored-EV scaling of a kill tally', () => {
    expect(scaleKills({ slime: 4, bat: 1 }, 2.5)).toEqual({ slime: 10, bat: 2 })
    expect(scaleKills({ slime: 1 }, 0.4)).toEqual({})       // floors a fractional kill away
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

  it('extrapolates exp/loot/kills for a deployed location with a sample (no gold from kills)', () => {
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
    expect(st.miscItems.find((m) => m.id === 'm-gold')).toBeUndefined()  // gold only from market sales
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

  it('keeps the report consistent: per-location gold == kills, and per-hero kills are credited', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [], unitStats: {},
    })
    batchTick(1000)                                  // 200s away ≥ gate → breakdown harvested
    const st = useGameStore.getState()
    const loc = st.offlineSummary!.locations[0]
    // 1 gold + 1 exp per kill, so the headline numbers all agree (no flooring drift).
    expect(loc.gold).toBe(loc.kills)
    expect(Math.floor(loc.exp)).toBe(loc.kills)
    // The per-hero AFK breakdown credits kills (not just damage) to the killer.
    expect((loc.tally?.['u0']?.monstersDefeated ?? 0)).toBeGreaterThan(0)
    expect(st.unitStats['u0']?.monstersDefeated ?? 0).toBeGreaterThan(0)
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

  it('records catch-up debug instrumentation (cost/output per location)', () => {
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [],
    })
    batchTick(1000)
    const cu = useGameStore.getState().lastCatchUp
    expect(cu?.ticks).toBe(1000)
    expect(cu?.secs).toBe(200)                                   // 1000 / TICKS_PER_SECOND
    const field = cu?.locations.find((l) => l.locationId === 'field')
    expect(field).toMatchObject({ windows: 1, rounds: 0 })      // warm path: no simulation
    expect(field!.kills).toBeGreaterThan(0)
  })

  it('keeps the synthetic offline breakdown out of the rolling rate-history', () => {
    // Offline damage is a saturated priming estimate — fine for lifetime totals, but
    // it must not feed the per-minute rate-history (it reads several× the realized
    // open-world rate). Recent stats come from real ticks (the catch-up live-sims the
    // final minute); batchTick leaves the rolling history untouched.
    const n = 30_000                                              // 100 minutes away
    resetStore({
      ticks: 1000,
      locations: [FIELD()],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [], unitStats: {}, unitStatHistory: {},
    })
    batchTick(n)

    const st = useGameStore.getState()
    expect(st.unitStats['u0']?.damageDealt ?? 0).toBeGreaterThan(0)   // lifetime keeps it
    expect(st.unitStatHistory['u0'] ?? []).toEqual([])               // rolling history untouched
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

describe('batchTick — sampled windows (long absence)', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  const strong = (id: string) => makeUnit({
    id, locationId: 'field', health: 100,
    abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 },
  })

  it('samples several windows across a long absence and credits the summed rewards', () => {
    resetStore({
      ticks: 0,
      locations: [OPEN(['slime'], 3)],
      locationStats: {},                          // even cold → it simulates
      units: [0, 1, 2].map((i) => strong(`u${i}`)),
      miscItems: [],
    })
    batchTick(40000)                              // ~2.2h away → offlineWindowCount = 4 windows

    const st = useGameStore.getState()
    expect(st.monsterDefeated.slime ?? 0).toBeGreaterThan(0)   // windows produced kills
    expect(st.battles.field).toBeDefined()                     // settled battle kept
    expect(st.offlineSummary?.locations[0]).toMatchObject({ locationId: 'field', primed: true })
  })

  it('prepareWindow fires once per window (the scheduled-event extension seam)', () => {
    const party = [0, 1, 2].map((i) => strong(`u${i}`))
    const seen: { w: number; tick: number }[] = []
    projectOfflineSampled(
      OPEN(['slime'], 3), party, [], [], undefined, 40000,
      {
        samples: 4, startTick: 1000, roundCap: 8, msBudget: 50,
        // A real extension would spawnMonsterAt(battle, 'boss', …) for the windows
        // a periodic boss should appear in; here we just record the callback.
        prepareWindow: (_battle, w, windowStartTick) => seen.push({ w, tick: windowStartTick }),
      },
      () => 0,
    )
    expect(seen.map((s) => s.w)).toEqual([0, 1, 2, 3])
    expect(seen.map((s) => s.tick)).toEqual([1000, 11000, 21000, 31000])  // startTick + w·windowTicks
  })
})

describe('off-screen location simulation', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  const strong = (id: string, locationId: string) => makeUnit({
    id, locationId, health: 100,
    abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 },
  })

  it('extrapolates an unwatched location (no full sim) while another is watched', () => {
    resetStore({
      ticks: 0,
      mapMode: 'battle', combatLocationId: 'watched',     // player is watching `watched`
      locations: [FIELD({ id: 'watched' }), FIELD({ id: 'far', monsterIds: ['bat'] })],
      locationStats: { far: STATS({ monstersDefeated: { bat: 100 } }) },  // far has a realized rate
      units: [strong('w0', 'watched'), makeUnit({ id: 'f0', locationId: 'far', health: 100 })],
      miscItems: [],
    })
    for (let i = 0; i < 30; i++) useGameStore.getState().tick()   // > OFFSCREEN_CREDIT_TICKS (25)

    const st = useGameStore.getState()
    expect(st.battles.far).toBeUndefined()                  // off-screen → never full-simmed
    expect(st.battles.watched).toBeDefined()                // watched → real spatial sim
    expect(st.monsterDefeated.bat ?? 0).toBeGreaterThan(0)  // far credited via its rate (≈ 25/1000 × 100)
  })

  it('world mode (no watched battle) full-sims every location', () => {
    resetStore({
      ticks: 0,
      mapMode: 'world', combatLocationId: null,
      locations: [FIELD({ id: 'far' })],
      locationStats: { far: STATS() },
      units: [strong('f0', 'far')],
      miscItems: [],
    })
    for (let i = 0; i < 5; i++) useGameStore.getState().tick()
    expect(useGameStore.getState().battles.far).toBeDefined()  // full-simmed, not extrapolated
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

// §logistics: with an expedition plan, offline catch-up runs the return-to-town
// loop — completed pack-loads deposit to the stash, the last partial fill stays in
// the carried pack, and yield is capped by travel time. Without a plan, the legacy
// path (all loot → stash, no trips) is preserved.
describe('batchTick — return-to-town loop', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  it('carries all the loot when the pack never fills (no trips, nothing deposited)', () => {
    resetStore({
      ticks: 1000,
      locations: [OPEN(['slime'], 4)],
      locationStats: { field: STATS() },                       // warm rate: 100 kills / 1000-tick window
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [],
      // Empty pack (full 1000-wt room) → 100 gel (800 wt) never hits the 90% mark → no return.
      expeditions: { u0: freshHero() },                        // returnOn: ['pack-full']
    })
    batchTick(1000)

    const st = useGameStore.getState()
    expect(st.lastCatchUp!.locations.find((l) => l.locationId === 'field')!.cycles ?? 0).toBe(0)
    expect(st.packs.u0['drop-slime-gel']).toBe(100)            // all loot carried, none deposited
    expect(st.miscItems.find((m) => m.id === 'drop-slime-gel')).toBeUndefined()
  })

  it('deposits pack-loads (incl. the pre-existing carry) to the stash and records trips', () => {
    resetStore({
      ticks: 1000,
      locations: [OPEN(['slime'], 4)],
      locationStats: { field: STATS() },
      // 180 greater potions carried = 900 wt → only ~100 wt of LOOT room, so packs fill.
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100, pack: [{ itemId: 'potion-hp-greater', count: 180, target: 180 }] })],
      miscItems: [{ id: 'm-gold', name: 'Gold', quantity: 500 }],
      packs: { u0: { 'drop-boar-hide': 5 } },                  // pre-existing carried loot
      expeditions: { u0: freshHero({ loadout: { 'potion-hp-greater': { qty: 180, storage: true, merchant: true } } }) },
    })
    batchTick(1000)

    const st = useGameStore.getState()
    const cu = st.lastCatchUp!.locations.find((l) => l.locationId === 'field')!
    expect(cu.cycles ?? 0).toBeGreaterThan(0)                                          // made town trips
    const deposited = st.miscItems.find((m) => m.id === 'drop-slime-gel')?.quantity ?? 0
    const residual = st.packs.u0?.['drop-slime-gel'] ?? 0
    expect(deposited).toBeGreaterThan(0)                                               // hunted loot reached the stash
    expect(deposited + residual).toBeLessThan(100)                                     // travel overhead reduced yield
    // A1: on the first town trip the hero also deposits the loot they were already
    // carrying — it moves from the pack to the stash (not stranded, not duplicated).
    expect(st.miscItems.find((m) => m.id === 'drop-boar-hide')?.quantity).toBe(5)
    expect(st.packs.u0?.['drop-boar-hide']).toBeUndefined()
  })

  it('restock draws the loadout consumable, never an unrelated stash consumable (A4)', () => {
    resetStore({
      ticks: 0,
      locations: [OPEN(['slime'], 8)],
      locationStats: {},                                   // cold → real sim measures potion burn
      // A fragile hero (low str/con) still clears slimes but takes real damage → burns
      // potions heavily; the extrapolated burn exceeds the carried + stash potions.
      units: [makeUnit({
        id: 'u0', locationId: 'field', health: 100,
        abilities: { strength: 8, agility: 5, dexterity: 20, constitution: 3, intelligence: 5 },
        pack: [{ itemId: 'potion-hp', count: 10, target: 10 }],
        consumableRules: [{ itemId: 'potion-hp', threshold: 0.95 }],
      })],
      // Stash has the loadout item (potion-hp) AND an unrelated consumable (antidote).
      // Restock must draw potion-hp (then gold) and NEVER touch the antidote — pre-fix
      // it drew stash consumables in array order and vaporised the antidote first.
      miscItems: [
        { id: 'craft-antidote', name: 'Antidote', quantity: 50, kind: 'consumable' as const },
        { id: 'potion-hp', name: 'Potion', quantity: 20, kind: 'consumable' as const },
        { id: 'm-gold', name: 'Gold', quantity: 500 },
      ],
      expeditions: { u0: freshHero({ loadout: { 'potion-hp': { qty: 10, storage: true, merchant: true } } }) },
    })
    batchTick(40000)                                       // long absence → sampled sim → real burn

    const st = useGameStore.getState()
    expect(st.miscItems.find((m) => m.id === 'craft-antidote')?.quantity).toBe(50)   // untouched
    expect(st.miscItems.find((m) => m.id === 'potion-hp')?.quantity).toBe(0)          // the RIGHT item drawn
    expect(st.miscItems.find((m) => m.id === 'm-gold')!.quantity).toBeLessThan(500)   // then paid the rest in gold
  })

  it('a party with no expedition plan keeps the legacy path (all loot → stash, no trips)', () => {
    resetStore({
      ticks: 1000,
      locations: [OPEN(['slime'], 4)],
      locationStats: { field: STATS() },
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100 })],
      miscItems: [],
      // no expeditions → ineligible for the cycle model
    })
    batchTick(1000)

    const st = useGameStore.getState()
    expect(st.miscItems.find((m) => m.id === 'drop-slime-gel')?.quantity).toBe(100)  // all 100 deposited
    expect(st.packs.u0).toBeUndefined()                                              // nothing carried
    expect(st.lastCatchUp!.locations.find((l) => l.locationId === 'field')!.cycles ?? 0).toBe(0)
  })
})
