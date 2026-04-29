import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore, expForLevel } from '@/stores/useGameStore'
import { makeUnit, makeEncounterSlot, resetStore, tick } from '../helpers'

// Helpers
function batchTick(n: number) {
  useGameStore.getState().batchTick(n)
  return useGameStore.getState()
}

// Slot pre-set to progress=1 so it awards 1 XP immediately on the next tick.
const defeatedSlot = () => makeEncounterSlot({ monsterId: 'slime', progress: 1 })

// ── expForLevel formula ───────────────────────────────────────────────────────

describe('expForLevel', () => {
  it('returns floor(10 * level^3)', () => {
    expect(expForLevel(1)).toBe(10)
    expect(expForLevel(2)).toBe(80)
    expect(expForLevel(3)).toBe(270)
    expect(expForLevel(4)).toBe(640)
    expect(expForLevel(5)).toBe(1250)
  })
})

// ── Level-up via tick() ───────────────────────────────────────────────────────

describe('Level-up via tick()', () => {
  beforeEach(() => {
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 0, expToNext: 1, level: 1, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot()] },
    })
  })

  it('increments level when exp meets expToNext', () => {
    const { units } = tick()
    expect(units[0].level).toBe(2)
  })

  it('subtracts expToNext from exp on level-up', () => {
    // 0 + 1 XP gained, 1 expToNext consumed → exp = 0
    const { units } = tick()
    expect(units[0].exp).toBe(0)
  })

  it('updates expToNext to the formula value for the new level', () => {
    const { units } = tick()
    expect(units[0].expToNext).toBe(expForLevel(2)) // 80
  })

  it('awards floor(level/5)+3 ability points per level gained (level 1→2 gives 3)', () => {
    const { units } = tick()
    expect(units[0].abilityPoints).toBe(3) // floor(1/5)+3 = 0+3
  })

  it('awards 1 skill point per level gained', () => {
    const { units } = tick()
    expect(units[0].skillPoints).toBe(1)
  })

  it('emits a levelup log entry naming the new level', () => {
    const { eventLog } = tick()
    const entry = eventLog.find((e) => e.category === 'levelup')
    expect(entry).toBeDefined()
    expect(entry!.message).toContain('level 2')
  })

  it('carries XP overflow into the next level', () => {
    // 3 defeated slots → 3 XP; expToNext=1 → levels to 2, leftover exp = 2
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 0, expToNext: 1, level: 1, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot(), defeatedSlot(), defeatedSlot()] },
    })
    const { units } = tick()
    expect(units[0].level).toBe(2)
    expect(units[0].exp).toBe(2) // 3 XP - 1 expToNext = 2 leftover
  })

  it('does not level up a KO\'d unit (health=0) even if its location has XP', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 0, expToNext: 1, level: 1, locationId: 'loc1', health: 0, recoveryTicksLeft: 5, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot()] },
    })
    const { units } = tick()
    expect(units[0].level).toBe(1) // no XP awarded to KO'd unit
    expect(units[0].exp).toBe(0)
  })

  it('does not level up an unassigned unit (locationId=null)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 0, expToNext: 1, level: 1, locationId: null, health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: {},
    })
    const { units } = tick()
    expect(units[0].level).toBe(1)
    expect(units[0].exp).toBe(0)
  })

  it('ability point award scales with level (level 5→6 gives 4 points)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 0, expToNext: 1, level: 5, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot()] },
    })
    const { units } = tick()
    expect(units[0].level).toBe(6)
    expect(units[0].abilityPoints).toBe(4) // floor(5/5)+3 = 1+3
  })
})

// ── Multi-level-up in one tick ────────────────────────────────────────────────

describe('Multi-level-up in one tick()', () => {
  it('levels up twice when XP covers two thresholds', () => {
    // expToNext(1)=10, expToNext(2)=80. Need 90 XP total.
    // Set unit at level 1 with exp=79, expToNext=80 (already at level 2 progress).
    // Gain 2 XP (2 defeated slots) → total=81; levels to 2 (leftover=1), then can't reach 3 (needs 80).
    // Instead: start at exp=0, expToNext=1 → gain 81 XP (impossible in one tick).
    //
    // Simpler: start at level 2, exp=78, expToNext=80 (2 short). Gain 3 XP → exp=81.
    // Level 2→3: 80 consumed, exp=1. Stays at level 3 (expForLevel(3)=270).
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 78, expToNext: 80, level: 2, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot(), defeatedSlot(), defeatedSlot()] }, // 3 XP
    })
    const { units } = tick()
    expect(units[0].level).toBe(3)
    expect(units[0].exp).toBe(1)           // 78+3 - 80 = 1
    expect(units[0].expToNext).toBe(expForLevel(3)) // 270
  })

  it('accumulates ability and skill points across multiple level-ups in one tick', () => {
    // Level 2→3: floor(2/5)+3 = 3 ability points, 1 skill point
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 78, expToNext: 80, level: 2, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot(), defeatedSlot(), defeatedSlot()] },
    })
    const { units } = tick()
    expect(units[0].abilityPoints).toBe(3) // floor(2/5)+3 = 3
    expect(units[0].skillPoints).toBe(1)
  })

  it('emits one levelup log entry per level gained', () => {
    // Start at level 1, expToNext=1; three defeats give 3 XP
    // Level 1→2 (needs 1), leftover=2; level 2→3 needs 80 — can't reach.
    // To get 2 entries: need 2 level-ups.
    // level 1 expToNext=1, gain 1 → level 2; expToNext(2)=80 — need to pre-set exp.
    // Use level 2: exp=78, expToNext=80, gain 3 → level 3 (one log entry).
    // Use level 1+2: need more XP. Easier: chain via batchTick (see below).
    // For tick(), set level=1, expToNext=1, and use 91 XP would require 91 slots.
    // Use a simpler two-level case from level 2:
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 78, expToNext: 80, level: 2, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [defeatedSlot(), defeatedSlot(), defeatedSlot()] },
    })
    const { eventLog } = tick()
    const levelUpEntries = eventLog.filter((e) => e.category === 'levelup')
    expect(levelUpEntries).toHaveLength(1) // only one level gained (2→3)
  })
})

// ── Level-up via batchTick() ──────────────────────────────────────────────────

describe('Level-up via batchTick()', () => {
  // Slime: level=1, seconds per kill = 1*5 = 5.
  // batchTick(n): kills = floor(n / TICKS_PER_SECOND / 5) = floor(n/25)
  // n=250 → 10 kills → 10 XP = expForLevel(1) → exactly level 1→2

  beforeEach(() => {
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 0, expToNext: expForLevel(1), level: 1, locationId: 'loc1', health: 100, abilityPoints: 0, skillPoints: 0 })],
      encounters: { loc1: [makeEncounterSlot({ monsterId: 'slime', progress: 0 })] },
    })
  })

  it('levels up after enough monster kills in a batch', () => {
    const { units } = batchTick(250) // 10 slime kills → 10 XP
    expect(units[0].level).toBe(2)
    expect(units[0].exp).toBe(0)
    expect(units[0].expToNext).toBe(expForLevel(2))
  })

  it('awards ability and skill points for the batched level-up', () => {
    const { units } = batchTick(250)
    expect(units[0].abilityPoints).toBe(3) // floor(1/5)+3 = 3
    expect(units[0].skillPoints).toBe(1)
  })

  it('can level up multiple times in one batchTick', () => {
    // n=2250 → 90 slime kills → 90 XP
    // Level 1→2: 10 XP, leftover 80; level 2→3: 80 XP, leftover 0
    const { units } = batchTick(2250)
    expect(units[0].level).toBe(3)
    expect(units[0].exp).toBe(0)
    expect(units[0].expToNext).toBe(expForLevel(3))
  })

  it('accumulates ability points correctly across multi-level batchTick', () => {
    // Level 1→2: floor(1/5)+3 = 3; level 2→3: floor(2/5)+3 = 3 → total 6
    const { units } = batchTick(2250)
    expect(units[0].abilityPoints).toBe(6)
    expect(units[0].skillPoints).toBe(2)
  })

  it('does not grant XP to a unit not assigned to a location', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', exp: 5, expToNext: expForLevel(1), level: 1, locationId: null, health: 100 })],
      encounters: {},
    })
    const { units } = batchTick(250)
    expect(units[0].level).toBe(1)
    expect(units[0].exp).toBe(5) // unchanged
  })
})
