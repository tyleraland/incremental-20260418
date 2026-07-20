// §logistics — return triggers: head home at 90% carry weight (a flat rule), and
// for supplies, when ANY one (or ALL) configured supplies run dry. Earlier code
// used an exact >=1000 fullness check that a discretely-weighted pack could stall
// just below (e.g. 990/1000) and never trip — the 90% rule sidesteps that.
import { describe, it, expect } from 'vitest'
import { packFullEnough, isOverweight, heroFull, PACK_FULL_FRACTION, OVERWEIGHT_FRACTION, WEIGHT_LIMIT } from '@/proto/economy'
import { suppliesDry, type Loadout } from '@/proto/expedition'
import type { PackItem } from '@/types'

describe('pack-full return trigger (flat 90% rule)', () => {
  it('a pack stalled below the limit is full at >=90%, though heroFull() is false', () => {
    const loot = { 'drop-nightshade-berry': 49 }   // 49 × 20 = 980 ( = 98% of 1000)
    expect(heroFull(loot, undefined)).toBe(false)   // old exact >=1000 check never fires
    expect(packFullEnough(loot, undefined)).toBe(true)
  })

  it('below 90% is not full; the threshold is exactly PACK_FULL_FRACTION', () => {
    expect(packFullEnough({ 'drop-nightshade-berry': 40 }, undefined)).toBe(false)  // 800 = 80%
    expect(PACK_FULL_FRACTION).toBe(0.9)
    expect(WEIGHT_LIMIT).toBe(1000)
  })
})

describe('Minor Overweight debuff (70%)', () => {
  it('flags at/above 70% carry, not below', () => {
    expect(OVERWEIGHT_FRACTION).toBe(0.7)
    expect(isOverweight({ 'drop-nightshade-berry': 34 }, undefined)).toBe(false) // 680 = 68%
    expect(isOverweight({ 'drop-nightshade-berry': 35 }, undefined)).toBe(true)  // 700 = 70%
  })
})

describe('supplies-out return trigger (any vs all dry)', () => {
  const loadout: Loadout = {
    'potion-hp': { qty: 5, storage: true, merchant: false },
    'potion-hp-greater': { qty: 5, storage: true, merchant: false },
  }
  const pack = (counts: Record<string, number>): PackItem[] =>
    Object.entries(counts).map(([itemId, count]) => ({ itemId, count, target: count }))

  it("'any': one dry supply sends them home", () => {
    expect(suppliesDry(pack({ 'potion-hp': 0, 'potion-hp-greater': 3 }), loadout, 'any')).toBe(true)
    expect(suppliesDry(pack({ 'potion-hp': 2, 'potion-hp-greater': 3 }), loadout, 'any')).toBe(false)
  })

  it("'all': only when every supply is dry", () => {
    expect(suppliesDry(pack({ 'potion-hp': 0, 'potion-hp-greater': 3 }), loadout, 'all')).toBe(false)
    expect(suppliesDry(pack({ 'potion-hp': 0, 'potion-hp-greater': 0 }), loadout, 'all')).toBe(true)
  })

  it('no configured supplies never triggers', () => {
    expect(suppliesDry(pack({}), {}, 'any')).toBe(false)
    expect(suppliesDry(pack({}), {}, 'all')).toBe(false)
  })
})
