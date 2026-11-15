import { describe, expect, it } from 'vitest'
import { expForLevel } from '@/stores/useGameStore'

// Level-up was previously driven by combat XP inside tick()/batchTick(). That
// driver was removed with the 1D combat sim; the new tactic engine will re-feed
// XP later. The progression formula itself is unchanged and still tested here.

describe('expForLevel', () => {
  it('returns floor(10 * level^3)', () => {
    expect(expForLevel(1)).toBe(10)
    expect(expForLevel(2)).toBe(80)
    expect(expForLevel(3)).toBe(270)
    expect(expForLevel(4)).toBe(640)
    expect(expForLevel(5)).toBe(1250)
  })
})
