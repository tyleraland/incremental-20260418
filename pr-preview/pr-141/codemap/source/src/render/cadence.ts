import { TICKS_PER_SECOND } from '@/lib/time'
import { everyTicksFor } from '@/stores/useGameStore'

// ── Motion cadence math (pure) ───────────────────────────────────────────────
//
// The glide-duration formula BattleView publishes as `--seg-ms`, extracted so
// the engine↔render coherence contract is unit-testable (Cadence.test.ts)
// instead of a tuning constant that can silently drift. The contract, in plain
// terms (learned the hard way on Kanto Beach — see BACKLOG → cadence tiers):
//
//   • CONTINUITY — the glide must outlast the round gap, so a token is still
//     moving when the next round retargets it (never park-then-hop).
//   • COHERENCE — the glide is also a render LAG: tokens draw ~(glide − gap)
//     ms behind the engine, while attack arcs, hit flashes, loot, and the
//     camera anchor at TRUE engine positions. Past ~half a second the world
//     visibly disagrees with itself (melee "from afar", arcs not
//     point-to-point, loot while walking).
//   • STEP SIZE — one round of movement is one glide step; a coarse tier's
//     big step IS the incoherence amplitude, so the expected gap itself is
//     budgeted too.

// How much longer than the measured round interval each glide runs: a hair of
// runway so a momentarily-late round retargets a token while it's still moving.
export const CADENCE_RUNWAY = 1.7

// Wall-clock gap between engine rounds for a battle's timeScale, from the
// pace-invariant pairing (everyTicksFor) and the store's tick rate.
export function expectedRoundGapMs(timeScale: number): number {
  return everyTicksFor(timeScale) * (1000 / TICKS_PER_SECOND)
}

// Glide duration for the measured cadence EMA on a battle whose expected gap
// is `expectedMs`. Floor keeps fast/desktop motion from going twitchy; the
// ceiling stops a real stall (hidden tab, GC pause) from leaving tokens
// crawling for seconds — but scales with the battle's OWN cadence, so a slow
// tier isn't mistaken for a stall (the fixed-900ms version parked every token
// on 1.2s-gap fields: the "step, step, step" walk).
export function glideMs(emaMs: number, expectedMs: number): number {
  return Math.min(Math.max(900, expectedMs * CADENCE_RUNWAY), Math.max(160, emaMs * CADENCE_RUNWAY))
}
