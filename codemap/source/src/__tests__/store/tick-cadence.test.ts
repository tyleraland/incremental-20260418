import { describe, it, expect } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'

// Regression guard for the cadence root cause: tick() must advance the clock by a
// FIXED step (one TICK_MS), preserving the sub-tick remainder — NOT snap to
// Date.now(). Snapping left lastTickAt tens of ms past the tick boundary, so the
// next catchUp floored (now - lastTickAt) / TICK_MS to n=0 and dropped every other
// tick → rounds applied at ~2x the interval, irregularly (the fast-slow).
describe('tick cadence scheduling', () => {
  it('advances lastTickAt by exactly one TICK_MS per tick', () => {
    const TICK_MS = 1000 / TICKS_PER_SECOND
    const base = 1_700_000_000_000
    useGameStore.setState({ lastTickAt: base, paused: false })
    useGameStore.getState().tick()
    expect(useGameStore.getState().lastTickAt - base).toBe(TICK_MS)
    useGameStore.getState().tick()
    expect(useGameStore.getState().lastTickAt - base).toBe(2 * TICK_MS)
  })
})
