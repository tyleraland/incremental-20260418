// The slab-window fast path in barriers.ts (sampleWindow inside traceMove /
// lineClear) must be EXACTLY the old exhaustive sample scan — same predicate at
// the same sample positions, only provably-outside samples skipped — because
// engine changes must keep snapshot replays byte-identical. This differential
// fuzz pins that: a naive reference implementation (the pre-optimization code,
// verbatim) against the shipped one over thousands of seeded random segments,
// barrier sets, and pads, plus the degenerate cases (axis-aligned segments,
// zero-length, sample-boundary grazes).
import { describe, it, expect } from 'vitest'
import { traceMove, lineClear, pointBlocked } from '@/engine/barriers'
import { setArenaBounds } from '@/engine/arena'
import type { Vec2, Barrier } from '@/engine/types'

// ── Reference implementations: the original exhaustive scans, verbatim ──────
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const EPS = 1e-6

function refTraceMove(from: Vec2, to: Vec2, barriers: Barrier[], pad: number): Vec2 {
  // `to` arrives pre-clamped by the caller in this test (we pass in-bounds points)
  if (barriers.length === 0) return to
  const d = dist(from, to)
  if (d < EPS) return from
  const steps = Math.max(1, Math.ceil(d / 0.2))
  let last = from
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    if (pointBlocked(barriers, p, pad)) return last
    last = p
  }
  return to
}

function refLineClear(from: Vec2, to: Vec2, barriers: Barrier[], pad: number): boolean {
  if (barriers.length === 0) return true
  const d = dist(from, to)
  if (d < EPS) return true
  const steps = Math.max(1, Math.ceil(d / 0.2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (pointBlocked(barriers, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, pad)) return false
  }
  return true
}

// Seeded PRNG (mulberry32) — deterministic fuzz, no Math.random.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('barriers fast path ≡ exhaustive scan', () => {
  it('traceMove and lineClear match the reference over seeded fuzz (big open-world geometry)', () => {
    const SIZE = 200
    setArenaBounds(SIZE, SIZE)
    try {
      const r = rng(0xbeef)
      for (let iter = 0; iter < 4000; iter++) {
        const barriers: Barrier[] = Array.from({ length: 1 + Math.floor(r() * 16) }, () => ({
          x: r() * SIZE, y: r() * SIZE, w: 0.5 + r() * 12, h: 0.5 + r() * 12,
          kind: r() < 0.3 ? ('cliff' as const) : ('wall' as const),
        }))
        // mix of long wander lines, short combat steps, and axis-aligned
        // segments — kept in-bounds so the shipped traceMove's arena clamp is
        // a no-op (the reference deliberately has no clamp)
        const inb = (v: number) => Math.min(SIZE - 1, Math.max(1, v))
        const from = { x: inb(r() * SIZE), y: inb(r() * SIZE) }
        const kind = r()
        const to =
          kind < 0.5 ? { x: inb(r() * SIZE), y: inb(r() * SIZE) }              // long random
          : kind < 0.7 ? { x: inb(from.x + (r() - 0.5) * 3), y: inb(from.y + (r() - 0.5) * 3) } // short
          : kind < 0.85 ? { x: inb(r() * SIZE), y: from.y }                     // horizontal
          : { x: from.x, y: inb(r() * SIZE) }                                   // vertical
        const pad = r() < 0.8 ? 0.4 : r() * 1.2
        expect(lineClear(from, to, barriers, pad)).toBe(refLineClear(from, to, barriers, pad))
        const got = traceMove(from, to, barriers, pad)
        const want = refTraceMove(from, to, barriers, pad)
        expect(got.x).toBe(want.x)   // byte-identical, not approximately-equal
        expect(got.y).toBe(want.y)
      }
    } finally {
      setArenaBounds(15, 15)
    }
  })

  it('degenerate cases match: zero-length, graze along a wall edge, start against wall', () => {
    setArenaBounds(50, 50)
    try {
      const walls: Barrier[] = [{ x: 10, y: 10, w: 5, h: 5, kind: 'wall' }]
      const cases: [Vec2, Vec2][] = [
        [{ x: 5, y: 5 }, { x: 5, y: 5 }],                 // zero-length
        [{ x: 9.6, y: 5 }, { x: 9.6, y: 20 }],            // graze exactly at pad edge (10 - 0.4)
        [{ x: 9.59, y: 5 }, { x: 9.59, y: 20 }],          // just outside the inflated edge
        [{ x: 5, y: 12 }, { x: 20, y: 12 }],              // straight through
        [{ x: 9.7, y: 12 }, { x: 20, y: 12 }],            // start already against the wall
      ]
      for (const [from, to] of cases) {
        expect(lineClear(from, to, walls, 0.4)).toBe(refLineClear(from, to, walls, 0.4))
        const got = traceMove(from, to, walls, 0.4)
        const want = refTraceMove(from, to, walls, 0.4)
        expect(got.x).toBe(want.x)
        expect(got.y).toBe(want.y)
      }
    } finally {
      setArenaBounds(15, 15)
    }
  })
})
