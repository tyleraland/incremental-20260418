// Map generation — seeded randomness (idea catalog §K: determinism / save = seed).
//
// Every random choice in the generator flows through a NAMED STREAM: a pass asks
// for `rng('outcrops')` and gets a generator seeded by hash(mapSeed, passId, name).
// Streams are the load-bearing evolution hook — because no pass shares a sequence
// with any other, inserting, removing, or reordering a pass NEVER reshuffles the
// randomness of the passes around it. A map only changes where the edit actually
// touched it, so human review of a generator change diffs one layer, not the world.
//
// Pure leaf module: no Math.random, no Date, no imports. hashString/hash01 mirror
// the recipes in engine/render — duplicated on purpose (mapgen must stay a leaf;
// the three never need to agree).

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 4294967296
}

// Stateful sequence generator (mulberry32) — for passes that draw an unknown
// number of samples (rejection sampling). For positionally-stable jitter (the
// same anchor always wobbles the same way) prefer hash01(seed + index) directly.
export interface Rng {
  next(): number                       // [0,1)
  range(lo: number, hi: number): number
  int(n: number): number               // integer in [0,n)
  pick<T>(arr: readonly T[]): T
  chance(p: number): boolean
}

export function makeRng(seed: number): Rng {
  let h = seed >>> 0
  const next = () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  }
}

// The stream splitter: one map seed → an independent Rng per (owner, name).
export function streamRng(seed: number, stream: string): Rng {
  return makeRng((seed ^ hashString(stream)) >>> 0)
}
