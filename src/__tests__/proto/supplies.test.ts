// §logistics: supplies % = real loadout usage (carried consumables ÷ configured
// total), derived from Unit.pack — NOT a time-based burn.
import { describe, expect, it } from 'vitest'
import { supplyState } from '@/proto/expedition'
import type { PackItem } from '@/types'

const loadout = (qty: number) => ({ 'potion-hp': { qty, storage: true, merchant: false } })
const pack = (count: number, target = 5): PackItem[] => [{ itemId: 'potion-hp', count, target }]

describe('supplyState', () => {
  it('is full (fraction 1) when carrying the configured quantity', () => {
    expect(supplyState(pack(5), loadout(5))).toEqual({ total: 5, remaining: 5, fraction: 1 })
  })
  it('drops as carried consumables are spent', () => {
    expect(supplyState(pack(2), loadout(5)).fraction).toBeCloseTo(0.4)
  })
  it('is dry (remaining 0) when the pack is empty', () => {
    const st = supplyState(pack(0), loadout(5))
    expect(st.remaining).toBe(0)
    expect(st.fraction).toBe(0)
  })
  it('reports total 0 / fraction 1 when no supplies are configured', () => {
    expect(supplyState(pack(3), {})).toEqual({ total: 0, remaining: 0, fraction: 1 })
  })
  it('ignores pack items that are not in the loadout', () => {
    const p: PackItem[] = [{ itemId: 'potion-hp', count: 3, target: 5 }, { itemId: 'potion-hp-greater', count: 9 }]
    expect(supplyState(p, loadout(5))).toEqual({ total: 5, remaining: 3, fraction: 0.6 })
  })
})
