// Map generation — the coherence harness (idea catalog §A layer 10, §K).
//
// Machine-checkable rules run on every bake, so "is this map sane?" never waits
// on a human. Each rule is NAMED and reports a one-line detail: fuzz gates and
// the ?mapgen=1 lab surface exactly which promise broke on which seed, which is
// what keeps the future human-validation loop cheap — people review *looks*,
// the harness owns *correctness*.
//
// Reachability is written against the semantic plane (spawn → every POI) and is
// where conditional reachability lands when locks arrive: an edge with a lockId
// flips the check from "reachable" to "reachable-if-openable" (§D). Today all
// locks lists are empty, so plain flood-fill is the whole truth.

import type { MapSpec, RuleResult, ValidationReport } from './types'
import { BARRIER_MATERIALS, SURFACE_MATERIALS } from './types'
import type { NormParams } from './draft'

// Matches the engine's UNIT_PAD feel: a cell is blocked if its centre sits
// inside a pad-inflated rect. Coarse (cell-resolution) on purpose — the
// validator answers "is the map traversable", not "is this pixel free".
const PAD = 0.45

// kind each material must ride on — the §B "one collision, many paints" table.
const MATERIAL_KIND: Record<string, 'wall' | 'cliff'> = {
  'rock': 'wall', 'cut-stone': 'wall', 'wood': 'wall', 'rubble': 'wall',
  'hedge': 'cliff', 'deep-water': 'cliff', 'ravine': 'cliff',
}

function occupancy(spec: MapSpec): Uint8Array {
  const g = new Uint8Array(spec.cols * spec.rows)
  for (const r of spec.collision) {
    const x0 = Math.max(0, Math.floor(r.x - PAD)), x1 = Math.min(spec.cols - 1, Math.ceil(r.x + r.w + PAD))
    const y0 = Math.max(0, Math.floor(r.y - PAD)), y1 = Math.min(spec.rows - 1, Math.ceil(r.y + r.h + PAD))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5, cy = y + 0.5
        if (cx > r.x - PAD && cx < r.x + r.w + PAD && cy > r.y - PAD && cy < r.y + r.h + PAD) {
          g[y * spec.cols + x] = 1
        }
      }
    }
  }
  return g
}

// Flood-fill of open cells from `start`; returns the visited mask (0/1).
function flood(spec: MapSpec, blocked: Uint8Array, start: { x: number; y: number }): Uint8Array {
  const { cols, rows } = spec
  const seen = new Uint8Array(cols * rows)
  const sx = Math.min(cols - 1, Math.max(0, Math.floor(start.x)))
  const sy = Math.min(rows - 1, Math.max(0, Math.floor(start.y)))
  const s0 = sy * cols + sx
  if (blocked[s0]) return seen
  const stack = [s0]
  seen[s0] = 1
  while (stack.length) {
    const i = stack.pop()!
    const x = i % cols, y = (i / cols) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (!blocked[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
    }
  }
  return seen
}

export function validate(spec: MapSpec, params: NormParams): ValidationReport {
  const rules: RuleResult[] = []
  const rule = (id: string, ok: boolean, detail: string) => rules.push({ rule: id, ok, detail })

  // bounds — every rect inside the arena, positive area.
  const oob = spec.collision.filter(
    (r) => r.x < 0 || r.y < 0 || r.w <= 0 || r.h <= 0 || r.x + r.w > spec.cols || r.y + r.h > spec.rows,
  )
  rule('bounds', oob.length === 0, oob.length ? `${oob.length} rect(s) out of bounds` : 'all rects in bounds')

  // vocab — kinds/materials/surface indices come from the fixed vocabularies,
  // and each material rides its contracted collision kind.
  const badKind = spec.collision.filter((r) => MATERIAL_KIND[r.material] !== r.kind)
  const badMat = spec.collision.filter((r) => !(BARRIER_MATERIALS as readonly string[]).includes(r.material))
  let badSurf = 0
  for (let i = 0; i < spec.surface.grid.length; i++) if (spec.surface.grid[i] >= SURFACE_MATERIALS.length) badSurf++
  rule('vocab', badKind.length + badMat.length + badSurf === 0,
    badKind.length + badMat.length + badSurf === 0
      ? 'kinds, materials, surface indices all in vocabulary'
      : `${badMat.length} unknown material(s), ${badKind.length} kind/material mismatch(es), ${badSurf} bad surface cell(s)`)

  // barrier-budget — open-world pathing cost grows with rect count (store
  // BARRIER_CAP); a recipe overspending must be caught before a location ships it.
  rule('barrier-budget', spec.collision.length <= params.maxBarriers,
    `${spec.collision.length}/${params.maxBarriers} barrier rects`)

  // spawn-present + apron-clear — the party must have a clean form-up knot.
  const spawn = spec.semantic.pois.find((p) => p.kind === 'spawn')
  rule('spawn-present', !!spawn, spawn ? `spawn at ${spawn.at.x},${spawn.at.y}` : 'no spawn POI')
  if (spawn) {
    const apron = params.spawnApron
    const intrudes = spec.collision.filter((r) => {
      const nx = Math.max(r.x, Math.min(spawn.at.x, r.x + r.w))
      const ny = Math.max(r.y, Math.min(spawn.at.y, r.y + r.h))
      return Math.hypot(nx - spawn.at.x, ny - spawn.at.y) < apron
    })
    rule('apron-clear', intrudes.length === 0,
      intrudes.length ? `${intrudes.length} rect(s) inside the ${apron.toFixed(1)}-cell spawn apron` : 'spawn apron clear')

    // reachable — spawn reaches every POI, and no significant open pocket is
    // walled off (a big unreachable region is wasted map and a wander trap).
    const blocked = occupancy(spec)
    const seen = flood(spec, blocked, spawn.at)
    const unreachablePois = spec.semantic.pois.filter((p) => {
      const xi = Math.min(spec.cols - 1, Math.max(0, Math.floor(p.at.x)))
      const yi = Math.min(spec.rows - 1, Math.max(0, Math.floor(p.at.y)))
      return !seen[yi * spec.cols + xi]
    })
    let open = 0, reached = 0
    for (let i = 0; i < blocked.length; i++) { if (!blocked[i]) open++; if (seen[i]) reached++ }
    const frac = open ? reached / open : 0
    const okReach = unreachablePois.length === 0 && frac >= 0.85
    rule('reachable', okReach,
      okReach
        ? `all ${spec.semantic.pois.length} POIs reachable; ${(frac * 100).toFixed(0)}% of open cells connected`
        : `${unreachablePois.map((p) => p.id).join(',') || 'no POI stranded'}; ${(frac * 100).toFixed(0)}% of open cells connected (need ≥85%)`)
  }

  // water-coherence — the surface plane and collision plane tell one story:
  // every deep-water CELL is covered by a deep-water RECT (visual water you
  // could walk on = a lie), and deep-water rects sit on water (≥60% of their
  // area), so collision never claims dry land for the lake.
  const deepIdx = SURFACE_MATERIALS.indexOf('deep-water')
  const shallowIdx = SURFACE_MATERIALS.indexOf('shallow-water')
  const waterRects = spec.collision.filter((r) => r.material === 'deep-water')
  let uncovered = 0, deepCells = 0
  for (let y = 0; y < spec.rows; y++) {
    for (let x = 0; x < spec.cols; x++) {
      if (spec.surface.grid[y * spec.cols + x] !== deepIdx) continue
      deepCells++
      const cx = x + 0.5, cy = y + 0.5
      if (!waterRects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) uncovered++
    }
  }
  let dryRects = 0
  for (const r of waterRects) {
    let wet = 0, tot = 0
    for (let y = Math.floor(r.y); y < Math.ceil(r.y + r.h); y++) {
      for (let x = Math.floor(r.x); x < Math.ceil(r.x + r.w); x++) {
        if (x < 0 || y < 0 || x >= spec.cols || y >= spec.rows) continue
        tot++
        const m = spec.surface.grid[y * spec.cols + x]
        if (m === deepIdx || m === shallowIdx) wet++
      }
    }
    if (tot && wet / tot < 0.6) dryRects++
  }
  rule('water-coherence', uncovered === 0 && dryRects === 0,
    uncovered !== 0 || dryRects !== 0
      ? `${uncovered} deep cell(s) uncovered; ${dryRects} water rect(s) mostly on dry land`
      : deepCells === 0
        ? 'no deep water on this map'
        : `${deepCells} deep cells covered by ${waterRects.length} rect(s)`)

  return { ok: rules.every((r) => r.ok), rules }
}
