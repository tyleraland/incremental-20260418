// ── Sampling / simulation-budget config ──────────────────────────────────────
//
// Every knob that trades *simulation cost* against *fidelity/verisimilitude* in the
// offline / off-screen progression lives here, in ONE place, so they're easy to
// find, tune, and (later) sweep for the cost-vs-accuracy experiment. The store
// reads `SAMPLING` rather than scattered constants.
//
// It's a plain object, so a debug action can mutate its fields at runtime (the
// seam for in-app A/B without a rebuild) — the values aren't captured at import.

export interface SamplingConfig {
  // Offline catch-up — sampled windows (variance/clumps over a long absence):
  windowTicks: number       // ~real time per sample window → window count (1 below this)
  maxWindows: number        // cap on windows (bounds an 8h+ absence)
  windowRoundCap: number    // rounds simulated per window slice
  windowMsBudget: number    // wall-ms per window slice (total ≤ maxWindows × this)

  // Cold priming — a deployed-but-never-sampled location (offline or off-screen):
  primeRoundCap: number     // rounds for the one-time budgeted prime
  primeMsBudget: number     // wall-ms for the prime

  // Off-screen live sim — unwatched locations while you watch one battle:
  offscreenCreditTicks: number  // credit rate-extrapolated rewards every this-many ticks
}

export const SAMPLING: SamplingConfig = {
  windowTicks: 9000,        // ~30 min (TICKS_PER_SECOND=5)
  maxWindows: 12,
  windowRoundCap: 80,
  windowMsBudget: 25,
  primeRoundCap: 300,
  primeMsBudget: 50,
  offscreenCreditTicks: 25, // ~5 s
}

// Pristine copy of the shipped values, for a debug "reset" after live tuning.
export const SAMPLING_DEFAULTS: Readonly<SamplingConfig> = Object.freeze({ ...SAMPLING })
