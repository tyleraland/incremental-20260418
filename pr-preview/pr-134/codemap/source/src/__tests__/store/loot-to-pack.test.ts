// §loot (Fork A): a kill's real drops are credited to the KILLER, batched with
// the kill — into `pendingPackLoot` (the expedition driver moves them into the
// hero's pack) — NOT trickled on a wall-clock timer. When no driver is mounted
// (these headless tests / classic UI / perf harness) the loot self-heals to the
// shared stash within a tick instead of stranding. Kills mint no gold — the
// stash currency only grows from selling loot at the Market.
// Guards the Kanto Beach report (pack weight climbing before/async from kills).
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

const FIELD = (monsterIds: string[]): Location => ({
  id: 'field', region: 'prontera', name: 'Field',
  description: '', traits: [], monsterIds, familiarityMax: 100, connections: [],
})

// Math.random → 0: every drop roll fires at its quantityMin (slime: 90%
// drop-slime-gel, qty 1). Deterministic loot for the assertions.
beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

const STRONG = { strength: 50, agility: 5, dexterity: 5, constitution: 5, intelligence: 5 }
const stashQty = (id: string) => useGameStore.getState().miscItems.find((m) => m.id === id)?.quantity ?? 0
const pendingTotal = () =>
  Object.values(useGameStore.getState().pendingPackLoot).reduce((a, u) => a + Object.values(u).reduce((x, y) => x + y, 0), 0)
const stashDropTotal = () =>
  useGameStore.getState().miscItems.filter((m) => m.id.startsWith('drop-')).reduce((a, m) => a + m.quantity, 0)

describe('kill loot is credited to the killer, batched, kill-gated', () => {
  it('no drops before any kill; drops appear only with kills; kills mint no gold', () => {
    resetStore({
      locations: [FIELD(['slime'])],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100, exp: 0, abilities: STRONG })],
    })
    let sawGatedZero = false
    for (let i = 0; i < 200; i++) {
      tick()
      const kills = useGameStore.getState().monsterDefeated['slime'] ?? 0
      // Kill-gate: any loot anywhere (pending pack channel OR flushed to stash)
      // implies at least one kill. This is the exact bug — loot before kills.
      if (pendingTotal() + stashDropTotal() > 0) expect(kills).toBeGreaterThan(0)
      if (kills === 0) sawGatedZero = true
      if (kills >= 3) break
    }
    expect(sawGatedZero).toBe(true)                         // there WAS a pre-kill window
    expect(useGameStore.getState().monsterDefeated['slime'] ?? 0).toBeGreaterThan(0)
    expect(pendingTotal() + stashDropTotal()).toBeGreaterThan(0)  // real drops landed
    expect(stashQty('m-gold')).toBe(0)                     // gold only comes from market sales
  })

  it('loot is neither lost nor double-counted (drops === credited itemsFound)', () => {
    resetStore({
      locations: [FIELD(['slime'])],
      units: [makeUnit({ id: 'u1', locationId: 'field', health: 100, abilities: STRONG })],
    })
    for (let i = 0; i < 60; i++) tick()
    const found = useGameStore.getState().unitStats['u1']?.itemsFound ?? 0
    expect(found).toBeGreaterThan(0)
    // Every credited drop is exactly once somewhere: still pending or flushed to
    // the stash — no drop written to both, none dropped on the floor.
    expect(pendingTotal() + stashDropTotal()).toBe(found)
  })

  it('takePendingPackLoot drains and clears atomically (idempotent)', () => {
    resetStore({ locations: [], units: [] })
    useGameStore.setState({ pendingPackLoot: { u1: { 'drop-slime-gel': 3 }, u2: { 'drop-wolf-pelt': 1 } } })
    const drained = useGameStore.getState().takePendingPackLoot()
    expect(drained.u1['drop-slime-gel']).toBe(3)
    expect(drained.u2['drop-wolf-pelt']).toBe(1)
    expect(useGameStore.getState().pendingPackLoot).toEqual({})       // cleared
    expect(useGameStore.getState().takePendingPackLoot()).toEqual({}) // idempotent
  })
})
