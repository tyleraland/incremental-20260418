// Map generation — macro fields, the shared substrate (idea catalog §A layer 2,
// ⭐1: "build fields before features; the source of ALL coherence").
//
// Value-noise fBm sampled lazily as pure fns of (x, y): no grid is materialized,
// so passes at different resolutions (collision vs fine surface) read the SAME
// substrate and agree by construction — the river sits in the valley because
// both consult `elevation`. Deterministic per (seed, field name); no Math.random.

import { hashString } from './rng'

export type Field = (x: number, y: number) => number   // → [0, 1)

// Lattice hash: integer cell (ix, iy) → [0,1). Seed folded in so each field
// draws from its own lattice.
function latticeHash(seed: number, ix: number, iy: number): number {
  let x = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

// Single-octave value noise: bilinear smoothstep interpolation of lattice hashes.
export function valueNoise(seed: number, freq: number): Field {
  return (x, y) => {
    const fx = x * freq, fy = y * freq
    const ix = Math.floor(fx), iy = Math.floor(fy)
    const tx = smooth(fx - ix), ty = smooth(fy - iy)
    const a = latticeHash(seed, ix, iy)
    const b = latticeHash(seed, ix + 1, iy)
    const c = latticeHash(seed, ix, iy + 1)
    const d = latticeHash(seed, ix + 1, iy + 1)
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
  }
}

// Fractal sum of octaves — the workhorse. `freq` is cycles per world unit of
// the base octave; on a 200-cell map, freq 1/60 gives ~3 broad features.
export function fbm(seed: number, freq: number, octaves = 4, gain = 0.5): Field {
  const layers: { f: Field; amp: number }[] = []
  let amp = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    layers.push({ f: valueNoise((seed + o * 0x9e37) >>> 0, freq * 2 ** o), amp })
    total += amp
    amp *= gain
  }
  return (x, y) => {
    let v = 0
    for (const l of layers) v += l.f(x, y) * l.amp
    return v / total
  }
}

// The bundle every recipe receives. A fixed set of NAMES (not values) is part
// of the contract — a new macro field (settlement-suitability, danger) is a new
// member here, and every pass can immediately read it.
export interface FieldBundle {
  elevation: Field
  moisture: Field
  roughness: Field    // high = broken ground: outcrop / cliff candidates
}

export function makeFields(seed: number, size: number): FieldBundle {
  // Feature scale follows map size so a 60-cell arena and a 200-cell field both
  // read as "a handful of broad regions", not one blur or a speckle.
  const base = 3 / Math.max(24, size)
  return {
    elevation: fbm((seed ^ hashString('elevation')) >>> 0, base, 4),
    moisture:  fbm((seed ^ hashString('moisture')) >>> 0, base * 1.4, 3),
    roughness: fbm((seed ^ hashString('roughness')) >>> 0, base * 2.2, 3),
  }
}
