// Map perf envelope — a tripwire between map AUTHORING and the perf BENCHMARK.
//
// History: we once perf-tested "the densest real map", which was brittle —
// gameplay tuning kept changing which map that was and silently moved the
// benchmark. The benchmark is now fully SYNTHETIC (e2e/cadence-profile.spec.ts
// drives the ?perf scene with explicit ?cap/?size params; perfSeed pins its
// base map by id), and this test closes the loop from the other side: every
// REAL open-world map's derived load parameters must stay inside the envelope
// those synthetic benchmarks have actually measured as acceptable.
//
// If a new/retuned map trips this, that's not "make the number pass" — it
// means nobody has measured that load shape. Benchmark it first:
//   npm run e2e -- cadence-profile.spec.ts --project=mobile-chrome
// (add a config with the new cap/size), read the fps, then raise the envelope
// constants HERE in the same change, citing the measurement.
import { describe, expect, it } from 'vitest'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { SCENARIO_REGISTRY } from '@/data/scenarios'
import { generateForLocationCached } from '@/mapgen'

// ── The measured envelope (Pixel-5 4×-CPU harness, 2026-07) ─────────────────
// cap 220 spread over 200×200: ~29 fps median at full granularity (the shipped
// full-rip experiment), ~39-41 at ts3 — acceptable. So cap alone is benched to:
const MAX_BENCHED_CAP = 220
// Packing is the render killer, independent of cap: 220 monsters on a 60×60
// field (density 0.061/cell²) collapsed to ~5 fps at any fine tier, while
// Harpy Roost's 50-on-60×60 (0.0139, ~44 tokens on screen — the ?perf scene)
// holds ~30. Benched density ceiling, with a little authoring headroom:
const MAX_BENCHED_DENSITY = 0.016
// …but density only matters when the map can actually field a big crowd: a
// small map whose WHOLE population is at or under the benched on-screen crowd
// (Harpy's cap) can pack as tightly as it likes (e.g. wolf-den, 20 on 30×30).
const MAX_BENCHED_CROWD = 50
// Pathing (steerAround) cost grows with BARRIER COUNT, not map area. Measured
// 2026-07 after the visibility-graph cache landed (cadence-profile "barriers"
// sweep, this container's 4×-throttled harness — read gaps, not absolutes):
// tick mean/max at barriers=16 ran 7.5/13ms; at 40, 13.2/43ms — i.e. the same
// territory the old per-call pather occupied at 16 (9.6/27ms), and ~4× better
// than the old code at 40 (33/164ms). 72 (the dungeon lab budget) is still
// ~25/76ms — affordable in a pinch but not adopted as the live bound yet.
const MAX_BENCHED_BARRIERS = 40

// Store defaults for unset fields (OPEN_WORLD_DEFAULT_CAP / _SIZE — private
// consts in useGameStore; mirrored here so the envelope sees what the store
// will actually run).
const DEFAULT_CAP = 8
const DEFAULT_SIZE = 200

describe('every open-world map stays inside the benchmarked perf envelope', () => {
  const openWorld = INITIAL_LOCATIONS.filter((l) => l.openWorld)

  it('has open-world maps to check (guard against the filter going stale)', () => {
    expect(openWorld.length).toBeGreaterThan(5)
  })

  it.each(openWorld.map((l) => [l.id, l] as const))('%s', (_id, loc) => {
    const cap = loc.openWorldCap ?? DEFAULT_CAP
    const size = loc.openWorldSize ?? DEFAULT_SIZE
    const density = cap / (size * size)
    expect(cap, `${loc.id}: openWorldCap ${cap} exceeds the benchmarked max — measure it first (see header)`)
      .toBeLessThanOrEqual(MAX_BENCHED_CAP)
    if (cap > MAX_BENCHED_CROWD) {
      expect(density, `${loc.id}: packing ${density.toFixed(4)}/cell² (cap ${cap} on ${size}×${size}) exceeds the benchmarked max — dense BIG crowds are the render killer`)
        .toBeLessThanOrEqual(MAX_BENCHED_DENSITY)
    }
  })

  it('authored scenario barrier sets stay under the pathing bound', () => {
    for (const [id, scen] of Object.entries(SCENARIO_REGISTRY)) {
      const n = scen.barriers?.().length ?? 0
      expect(n, `scenario ${id}: ${n} barriers — steerAround cost grows with barrier count`)
        .toBeLessThanOrEqual(MAX_BENCHED_BARRIERS)
    }
  })

  it('§mapgen locations bake VALID maps inside the pathing bound', () => {
    const gen = INITIAL_LOCATIONS.filter((l) => l.mapGen)
    expect(gen.length, 'phase 2 shipped a live generated location — keep at least one covered').toBeGreaterThan(0)
    for (const loc of gen) {
      const res = generateForLocationCached(loc)
      expect(res.report.ok, `${loc.id}: ${JSON.stringify(res.report.rules.filter((r) => !r.ok))}`).toBe(true)
      expect(res.spec.collision.length, `${loc.id}: ${res.spec.collision.length} generated barriers — steerAround cost grows with barrier count`)
        .toBeLessThanOrEqual(MAX_BENCHED_BARRIERS)
      expect(res.spec.cols).toBe(loc.openWorldSize ?? DEFAULT_SIZE)
    }
  })
})
