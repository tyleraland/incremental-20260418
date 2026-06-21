// Combat Tactic Engine — optional ambient micro-profiler (THROWAWAY / dev probe).
//
// Same ambient pattern as timescale.ts / arena.ts: the engine runs one battle at
// a time, synchronously, so each per-round phase can hand its elapsed time to a
// process-global sink here instead of threading a profiler through every call.
//
// DETERMINISM: this never reads or writes battle state — only `performance.now()`
// deltas accumulated into counters. Timing can't change positions, so snapshot
// replays and the whole engine suite stay byte-identical. It is also DEFAULT OFF:
// when disabled, `profStart` returns a cheap 0 sentinel and `profEnd` early-returns
// on it, so the hot path pays one boolean check + one (inlined) call per phase.
//
// Toggled at runtime by the in-app perf probe (src/dev/perfProbe.ts). Lives in the
// engine dir only so the phases that matter (targeting/movement/action) can be
// timed where they actually run; nothing in game code depends on it.

const now: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

let enabled = false
let rounds = 0
const totalsMs: Record<string, number> = {}
const counts: Record<string, number> = {}

export function setEngineProfiling(on: boolean): void { enabled = on }
export function engineProfilingOn(): boolean { return enabled }

// Start a phase timer. Returns 0 (sentinel) when profiling is off so the matching
// `profEnd` is a no-op — keeps the disabled hot path to a single branch.
export function profStart(): number { return enabled ? now() : 0 }

// Close a phase started by `profStart`, crediting its elapsed ms to `phase`.
export function profEnd(phase: string, started: number): void {
  if (!enabled || started === 0) return
  totalsMs[phase] = (totalsMs[phase] ?? 0) + (now() - started)
  counts[phase] = (counts[phase] ?? 0) + 1
}

// One full engine round elapsed (denominator for per-round averages).
export function profCountRound(): void { if (enabled) rounds += 1 }

export interface EngineProfile {
  rounds: number
  totalsMs: Record<string, number>
  counts: Record<string, number>
}

export function readEngineProfile(): EngineProfile {
  return { rounds, totalsMs: { ...totalsMs }, counts: { ...counts } }
}

export function resetEngineProfile(): void {
  rounds = 0
  for (const k of Object.keys(totalsMs)) delete totalsMs[k]
  for (const k of Object.keys(counts)) delete counts[k]
}
