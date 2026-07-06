// §logistics offline return-to-town loop: the pure cycle projector that turns a
// realized hunt rate into completed town trips (deposits), a residual carried pack,
// travel-reduced yield, supply drain, and stalls. Deterministic; no RNG.
import { describe, it, expect } from 'vitest'
import { projectOfflineCycles, type OfflineCycleParams } from '@/lib/offline'

const base: OfflineCycleParams = {
  offlineTicks: 1000,
  lootWeightPerTick: 1,     // → 1000 weight of loot over the span at full hunt
  packCapacityWeight: 100,
  fillFraction: 1,          // a full load = 100 weight (clean math)
  overheadTicks: 0,
  supplyBurnPerTick: 0,
  supplyBudget: 1e9,
  stallOnDry: false,
}

describe('projectOfflineCycles', () => {
  it('makes one full trip per pack-load when travel is free', () => {
    const r = projectOfflineCycles(base)
    // 1000 ticks / 100-tick fills = 10 completed trips, everything deposited.
    expect(r.cycles).toBe(10)
    expect(r.huntTicks).toBe(1000)
    expect(r.depositWeight).toBe(1000)
    expect(r.residualWeight).toBe(0)
  })

  it('travel overhead eats into effective hunt time (less yield)', () => {
    const r = projectOfflineCycles({ ...base, overheadTicks: 50 })
    // Each cycle now costs 100 hunt + 50 travel = 150 ticks → fewer trips, less hunting.
    expect(r.huntTicks).toBeLessThan(1000)
    expect(r.cycles).toBeLessThan(10)
    expect(r.depositWeight).toBe(r.cycles * 100)
  })

  it('leaves a residual (carried) pack from the last partial fill', () => {
    const r = projectOfflineCycles({ ...base, offlineTicks: 250 })
    // 2 full loads (200) + a 50-weight partial still carried.
    expect(r.cycles).toBe(2)
    expect(r.depositWeight).toBe(200)
    expect(r.residualWeight).toBe(50)
  })

  it('stalls when supplies run dry and the hero returns on supplies-out', () => {
    const r = projectOfflineCycles({ ...base, supplyBurnPerTick: 1, supplyBudget: 150, stallOnDry: true })
    // Burns 1/tick with only 150 in the budget → dry partway through the 2nd fill.
    expect(r.stalled).toBe(true)
    expect(r.huntTicks).toBe(150)
    expect(r.supplyUsed).toBe(150)
    expect(r.cycles).toBe(1)
  })

  it('does NOT stall when the hero does not return on supplies-out (fights on dry)', () => {
    const r = projectOfflineCycles({ ...base, supplyBurnPerTick: 1, supplyBudget: 150, stallOnDry: false })
    expect(r.stalled).toBe(false)
    expect(r.huntTicks).toBe(1000)          // keeps hunting after potions run out
    expect(r.supplyUsed).toBe(150)          // spent the whole budget, no more
  })

  it('never trips with no loot pressure (just hunts the whole span)', () => {
    const r = projectOfflineCycles({ ...base, lootWeightPerTick: 0 })
    expect(r.cycles).toBe(0)
    expect(r.huntTicks).toBe(1000)
    expect(r.depositWeight).toBe(0)
  })

  it('is a no-op for a zero-length absence', () => {
    const r = projectOfflineCycles({ ...base, offlineTicks: 0 })
    expect(r).toEqual({ huntTicks: 0, cycles: 0, depositWeight: 0, residualWeight: 0, supplyUsed: 0, stalled: false })
  })
})
