// Movement/combat pace must stay CONSTANT across density tiers. A denser open-world
// field runs fewer, coarser rounds (cheaper) instead of moving slower: the engine
// timeScale (move 1/N per round) is PAIRED with everyTicks (ticks between rounds) so
// their product stays = ROUND_TIME_SCALE. Before this, big fields (cap ≥ 200) backed
// off everyTicks alone and crawled at ~1/5 speed.
import { describe, expect, it } from 'vitest'
import { openWorldTimeScale, everyTicksFor, OPEN_WORLD_ROUND_TIME_SCALE as RTS } from '@/stores/useGameStore'

describe('open-world pace tiers are pace-preserving', () => {
  it('timeScale × everyTicks === ROUND_TIME_SCALE for every cap (constant real-time pace)', () => {
    for (const cap of [0, 8, 12, 50, 89, 90, 139, 140, 199, 200, 220, 400]) {
      const ts = openWorldTimeScale(cap)
      expect(ts * everyTicksFor(ts)).toBe(RTS)   // product invariant ⇒ same cells/sec
    }
  })

  it('denser fields never run FINER than comfortable ones (tiers may be flat — see the 2026-07 full-granularity experiment)', () => {
    expect(openWorldTimeScale(50)).toBe(RTS)   // comfortable: full granularity, every tick
    expect(openWorldTimeScale(90)).toBeLessThanOrEqual(openWorldTimeScale(50))
    expect(openWorldTimeScale(200)).toBeLessThanOrEqual(openWorldTimeScale(140))
    expect(everyTicksFor(openWorldTimeScale(200))).toBeGreaterThanOrEqual(everyTicksFor(openWorldTimeScale(50)))
  })
})
