// §consumables: in-town pack reconcile. While a hero is posted in a city, the
// pack is brought to *exactly* each carry target — withdrawing the shortfall from
// the shared stash, or depositing the surplus back when over target.
import { describe, expect, it } from 'vitest'
import { reconcilePackInTown, type PackItem } from '@/stores/useGameStore'

describe('reconcilePackInTown', () => {
  it('deposits the surplus back to the stash when over target', () => {
    const pack: PackItem[] = [{ itemId: 'potion-hp', count: 100, target: 50 }]
    const stashAvail: Record<string, number> = { 'potion-hp': 0 }
    const stashDraw: Record<string, number> = {}
    const next = reconcilePackInTown(pack, stashAvail, stashDraw)
    expect(next[0].count).toBe(50)            // synced down to target
    expect(stashDraw['potion-hp']).toBe(50)   // 50 returned to the stash
    expect(stashAvail['potion-hp']).toBe(50)
  })

  it('withdraws the shortfall from the stash when under target', () => {
    const pack: PackItem[] = [{ itemId: 'potion-hp', count: 10, target: 50 }]
    const stashAvail: Record<string, number> = { 'potion-hp': 200 }
    const stashDraw: Record<string, number> = {}
    const next = reconcilePackInTown(pack, stashAvail, stashDraw)
    expect(next[0].count).toBe(50)
    expect(stashDraw['potion-hp']).toBe(-40)  // 40 drawn out of the stash
    expect(stashAvail['potion-hp']).toBe(160)
  })

  it('withdraws only what the stash can supply', () => {
    const pack: PackItem[] = [{ itemId: 'potion-hp', count: 0, target: 50 }]
    const stashAvail: Record<string, number> = { 'potion-hp': 12 }
    const stashDraw: Record<string, number> = {}
    const next = reconcilePackInTown(pack, stashAvail, stashDraw)
    expect(next[0].count).toBe(12)            // capped by stock
    expect(stashDraw['potion-hp']).toBe(-12)
  })

  it('leaves entries at target or without a target untouched', () => {
    const pack: PackItem[] = [
      { itemId: 'potion-hp', count: 50, target: 50 },
      { itemId: 'loot-gel', count: 30 },   // no carry target → not reconciled
    ]
    const stashAvail: Record<string, number> = {}
    const stashDraw: Record<string, number> = {}
    const next = reconcilePackInTown(pack, stashAvail, stashDraw)
    expect(next[0].count).toBe(50)
    expect(next[1].count).toBe(30)
    expect(stashDraw).toEqual({})
  })
})
