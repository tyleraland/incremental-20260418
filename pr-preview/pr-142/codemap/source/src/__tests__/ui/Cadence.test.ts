// Engine↔render coherence contract (render/cadence.ts). The battlefield can
// drift apart in two independent ways, and both were SHIPPED bugs before this
// test existed (the Kanto Beach reports — BACKLOG → cadence tiers):
//   • parking — glide shorter than the round gap → step, step, step walking;
//   • lag — glide longer than the gap is exactly how far (in ms) tokens render
//     BEHIND the engine, while attack arcs / hit flashes / loot / the camera
//     anchor at true engine positions. Past ~half a second the world visibly
//     disagrees with itself (melee "from afar", arcs not point-to-point, loot
//     while walking, drop-in dead time).
// Budgets are named here, asserted against EVERY cadence the store can put a
// battle on — including each real open-world map's tier — so a future tier or
// glide change that breaches them fails CI instead of reaching players.
import { describe, expect, it } from 'vitest'
import { CADENCE_RUNWAY, expectedRoundGapMs, glideMs } from '@/render/cadence'
import { openWorldTimeScale, OPEN_WORLD_ROUND_TIME_SCALE as RTS } from '@/stores/useGameStore'
import { INITIAL_LOCATIONS as LOCATIONS } from '@/data/locations'

// One round of movement is one glide step, so the round gap IS the amplitude of
// every anchored-at-engine-position artifact. 600ms ≈ where the artifacts start
// to read as "wrong" rather than "snappy" (the shipped 1.2s tier was glaring).
const MAX_ROUND_GAP_MS = 600
// Steady-state render lag = glide − gap (the runway). The Kanto reports came
// from ~840ms; ≤500ms keeps kills/loot/FX within an eyeblink of the sprites.
const MAX_RENDER_LAG_MS = 500

// Every timeScale a real battle can run at: encounters (RTS) + each open-world
// location's tier, derived from its authored cap exactly as the store does.
function shippedTimeScales(): number[] {
  const caps = LOCATIONS.filter((l) => l.openWorld).map((l) => l.openWorldCap ?? 8)
  return [...new Set([RTS, ...caps.map(openWorldTimeScale)])]
}

describe('engine↔render coherence budgets', () => {
  it('every shipped cadence glides continuously (no parking) within the lag budget', () => {
    for (const ts of shippedTimeScales()) {
      const gap = expectedRoundGapMs(ts)
      const glide = glideMs(gap, gap)          // steady state at the expected cadence
      expect(glide, `timeScale ${ts}: glide must outlast the ${gap}ms gap`).toBeGreaterThan(gap)
      expect(glide - gap, `timeScale ${ts}: render lag`).toBeLessThanOrEqual(MAX_RENDER_LAG_MS)
      expect(gap, `timeScale ${ts}: round gap (step coarseness)`).toBeLessThanOrEqual(MAX_ROUND_GAP_MS)
    }
  })

  it('a real stall is capped: the glide ceiling scales with cadence but never runs away', () => {
    for (const ts of shippedTimeScales()) {
      const gap = expectedRoundGapMs(ts)
      // hidden tab / GC pause inflates the EMA — tokens may not crawl for seconds
      expect(glideMs(gap * 20, gap)).toBeLessThanOrEqual(Math.max(900, gap * CADENCE_RUNWAY))
    }
  })
})
