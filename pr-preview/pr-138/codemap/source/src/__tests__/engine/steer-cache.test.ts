// The visibility-graph cache in barriers.ts (VisGraph inside steerAround) must
// be EXACTLY the old per-call graph build — same nodes, same lazy-lineClear
// booleans, same Dijkstra selection order and tie-breaks — because engine
// changes must keep snapshot replays byte-identical. This differential fuzz
// pins that: a naive reference implementation (the pre-cache code, verbatim)
// against the shipped one over thousands of seeded random from/target pairs
// and barrier sets — including dungeon-scale sets (60+ rects, the load the
// cache exists for), sealed-pocket unreachables, and repeated calls against
// the SAME barrier array (the cache-hit path) interleaved with other arrays
// (the interleaved-battles path).
import { describe, it, expect } from 'vitest'
import { steerAround, canReach, lineClear, pointBlocked } from '@/engine/barriers'
import { setArenaBounds, arenaClamp, arenaCols } from '@/engine/arena'
import type { Vec2, Barrier } from '@/engine/types'

// ── Reference: the original per-call steerAround, verbatim ──────────────────
// (lineClear/pointBlocked are the shipped ones — they're already differential-
// pinned to the exhaustive scan by barriers-fastpath.test.ts.) The herd-bias
// pivot reads the active arena width (`arenaCols()`), not a hardcoded 15 —
// matching the shipped fix so this stays a pin on cache≡naive parity, not a
// pin on the old (buggy) fixed-width pivot.
const HERD_BIAS = 4.0
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const clamp = (p: Vec2): Vec2 => arenaClamp(p)

function refSteerAround(from: Vec2, target: Vec2, barriers: Barrier[], pad: number): { point: Vec2; direct: boolean; reachable: boolean } {
  if (lineClear(from, target, barriers, pad)) return { point: target, direct: true, reachable: true }
  const off = pad + 0.3
  const nodes: Vec2[] = [from]
  for (const b of barriers) {
    nodes.push(clamp({ x: b.x - off, y: b.y - off }))
    nodes.push(clamp({ x: b.x + b.w + off, y: b.y - off }))
    nodes.push(clamp({ x: b.x - off, y: b.y + b.h + off }))
    nodes.push(clamp({ x: b.x + b.w + off, y: b.y + b.h + off }))
  }
  nodes.push(target)
  const n = nodes.length
  const T = n - 1
  const usable = new Array(n).fill(true)
  for (let i = 1; i < T; i++) if (pointBlocked(barriers, nodes[i], pad)) usable[i] = false
  const dArr = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const seen = new Array(n).fill(false)
  dArr[0] = 0
  for (let step = 0; step < n; step++) {
    let u = -1, bu = Infinity
    for (let v = 0; v < n; v++) if (!seen[v] && dArr[v] < bu) { bu = dArr[v]; u = v }
    if (u < 0 || u === T) break
    seen[u] = true
    const cx = arenaCols() / 2
    for (let v = 0; v < n; v++) {
      if (seen[v] || !usable[v]) continue
      if (!lineClear(nodes[u], nodes[v], barriers, pad)) continue
      const bias = v !== 0 && v !== T && nodes[v].x < cx ? HERD_BIAS : 0
      const nd = dArr[u] + dist(nodes[u], nodes[v]) + bias
      if (nd < dArr[v]) { dArr[v] = nd; prev[v] = u }
    }
  }
  if (dArr[T] === Infinity) return { point: target, direct: false, reachable: false }
  const path: number[] = []
  for (let cur = T; cur !== -1; cur = prev[cur]) path.push(cur)
  path.reverse()
  let hop = 1
  while (hop < path.length - 1 && dist(nodes[path[hop]], from) < 0.6) hop++
  return { point: nodes[path[hop]], direct: path[hop] === T, reachable: true }
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

function randomBarriers(r: () => number, size: number, count: number): Barrier[] {
  return Array.from({ length: count }, () => ({
    x: r() * (size - 14), y: r() * (size - 14), w: 0.5 + r() * 12, h: 0.5 + r() * 12,
    kind: r() < 0.3 ? ('cliff' as const) : ('wall' as const),
  }))
}

describe('steerAround visibility-graph cache ≡ per-call rebuild', () => {
  // The reference rebuild is O(corners²·barriers) per call — the very cost the
  // cache removes — so the sweep is sized to keep the REFERENCE side tractable.
  it('matches the reference over seeded fuzz, small and dungeon-scale barrier sets, cache hits included', { timeout: 60000 }, () => {
    const SIZE = 96
    setArenaBounds(SIZE, SIZE)
    try {
      const r = rng(0xcafe)
      for (let iter = 0; iter < 60; iter++) {
        // dungeon-scale sets (up to 72 rects) are the whole point of the cache
        const count = 1 + Math.floor(r() * 72)
        const barriers = randomBarriers(r, SIZE, count)
        // several queries against the SAME array — first call builds, the rest
        // hit the cache; every one must match the cache-less reference
        for (let q = 0; q < 6; q++) {
          const inb = (v: number) => Math.min(SIZE - 1, Math.max(1, v))
          const from = { x: inb(r() * SIZE), y: inb(r() * SIZE) }
          const target = { x: inb(r() * SIZE), y: inb(r() * SIZE) }
          const pad = r() < 0.8 ? 0.4 : r() * 1.0
          const got = steerAround(from, target, barriers, pad)
          const want = refSteerAround(from, target, barriers, pad)
          expect(got.reachable).toBe(want.reachable)
          expect(got.direct).toBe(want.direct)
          expect(got.point.x).toBe(want.point.x)   // byte-identical, not approximately-equal
          expect(got.point.y).toBe(want.point.y)
        }
      }
    } finally {
      setArenaBounds(15, 15)
    }
  })

  it('interleaved barrier sets each keep their own cache (two battles alternating)', () => {
    setArenaBounds(60, 60)
    try {
      const r = rng(0xd00d)
      const a = randomBarriers(r, 60, 24)
      const b = randomBarriers(r, 60, 40)
      for (let i = 0; i < 40; i++) {
        const set = i % 2 ? a : b
        const from = { x: 1 + r() * 58, y: 1 + r() * 58 }
        const target = { x: 1 + r() * 58, y: 1 + r() * 58 }
        const got = steerAround(from, target, set, 0.4)
        const want = refSteerAround(from, target, set, 0.4)
        expect(got.point.x).toBe(want.point.x)
        expect(got.point.y).toBe(want.point.y)
        expect(got.reachable).toBe(want.reachable)
      }
    } finally {
      setArenaBounds(15, 15)
    }
  })

  it('sealed pockets read unreachable through the cache (and reachable when the plug set is swapped)', () => {
    setArenaBounds(30, 30)
    try {
      // a box with a plugged door: outside → inside is unreachable
      const box: Barrier[] = [
        { x: 10, y: 10, w: 1, h: 10, kind: 'wall' },              // west wall
        { x: 19, y: 10, w: 1, h: 10, kind: 'wall' },              // east wall
        { x: 10, y: 19, w: 10, h: 1, kind: 'wall' },              // north wall
        { x: 10, y: 10, w: 4, h: 1, kind: 'wall' },               // south wall, west half
        { x: 16, y: 10, w: 4, h: 1, kind: 'wall' },               // south wall, east half
        { x: 13.5, y: 9.5, w: 3, h: 2, kind: 'wall' },            // the door plug
      ]
      const from = { x: 15, y: 3 }
      const inside = { x: 15, y: 15 }
      expect(canReach(from, inside, box)).toBe(false)
      expect(canReach(from, inside, box)).toBe(false)             // cache-hit path agrees
      // the open variant is a DIFFERENT array (phase-6 contract: swap, don't
      // mutate) — its own cache entry, and the door now routes
      const open = box.slice(0, 5)
      expect(canReach(from, inside, open)).toBe(true)
    } finally {
      setArenaBounds(15, 15)
    }
  })
})
