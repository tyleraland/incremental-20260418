# Performance investigation history

Historical record of past performance investigations — findings and dead
ends worth remembering so they aren't re-tried. Not a plan or a backlog;
current open performance work lives in `BACKLOG.md` → *Performance*, and
shipped mitigations are documented in `CLAUDE.md` → *Combat view*.

## ROOT CAUSE of the "fast-slow" jitter, found & fixed (2026-06)

**It was a tick-scheduler phase bug, not render or engine cost.** `tick()` set
`lastTickAt = Date.now()` *after* the reducer ran, landing it tens of ms past the
200ms boundary; the next `catchUp` then floored `(now − lastTickAt)/TICK_MS` to
**n=0 and skipped** — dropping ~40% of ticks, so rounds applied at ~2× the interval,
*irregularly*. The CSS glide faithfully rendered that as fast-slow. Fix: advance
`lastTickAt` by a **fixed `TICK_MS`** (preserve the remainder, stay phase-aligned;
`batchTick` still resyncs to `Date.now()`). Measured (perf scene, 4× CPU): per-round
321→201ms, dropped ticks 40%→8%, 3.4→5.0 rounds/sec. Glide is now smooth with **no
lag, no interpolation**. Guard: `tick-cadence.test.ts`. (This also corrected an
earlier hypothesis that the cadence jitter was mainly `advanceBattles` long-tasks —
the engine is ~8ms/tick; the adaptive `--seg-ms` cadence smoothing was papering over
this scheduler bug, not fixing the root cause.)

Pace is a single knob: **`ROUND_EVERY_TICKS`** (ticks per engine round; 5 = ~1
round/sec). It also drives the offline rounds↔ticks conversion, so live+offline stay
in sync — change it alone. For smoothness at a *given* pace, the lever is
`ROUND_TIME_SCALE` (finer sub-steps), NOT the pace.

## Dead ends — measured no-ops/regressions, do NOT retry for the fast-slow jitter

- **Entity interpolation** (render N ms in the past): works, but needs ≥1 round of
  delay, and the heavy-scene cadence is ≥ that, so lag (~300ms) can't be tuned out
  without stutter. Felt worse than the jitter. Also needs camera interpolation or
  tokens clip backward on each camera step.
- **Per-frame spring toward the latest pos**: worse (CoV 0.6→1.8). Easing toward a
  *held step* target decays velocity to zero each round = a sawtooth.
- **Extrapolation**: lag-free but overshoots → backward correction on every stop/turn.
- **Constant-velocity CSS glide** (scale duration by step distance): no-op. CSS
  transitions restart every round → interrupted-segment ceiling ~0.65 CoV regardless.
- **Per-round target EMA** feeding the glide: noise, no reliable win.
- **Softening `enforceSeparation`** (DEV `?sep=`): movingStepCoV ~0.49 unchanged →
  separation is NOT the dominant per-round step jitter.
- **Stop-go**: units hold only ~5% of rounds → not the cause.
- **Skipping render content** (DEV `?nomini/?nofx/?nochips`): cadence unchanged → the
  per-round React *content* was never the bottleneck (the scheduler was).
