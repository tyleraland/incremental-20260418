// The CITY recipe — road-first (idea catalog closing note: "city = road-first";
// prototyping-order step 4 "+ Buildings & roads"). The nav skeleton comes FIRST:
// a paved plaza at the centre (the party's form-up knot and market floor), gate
// roads running out to jittered map-edge exits, and 1–2 cross-streets tying
// adjacent roads into a loop (⭐4: cycles, not trees). Only then do buildings
// arrive — solid wall rects that FRONT the streets (every house sits 1–4 cells
// off the pavement), so the street grid stays walkable by construction and the
// blocks between roads read as quarters. Yards get trees; the plaza rim gets
// market clutter; a well/statue landmark anchors the §H silhouette.
//
// Cities in the game are peaceful open-world fields (openWorldCap 0, NPC
// merchants) — the recipe generates the STAGE for that, not the population
// (NPCs/spawns are store-owned, out of generator scope). Not live on any
// location yet: at the live pather envelope (adapter pins maxBarriers 16) a
// city keeps its plaza + roads but starves to ~16 houses — fine, just thin.
// The lab reviews the full default (24).

import type { Pt } from '../types'
import type { PassCtx, RecipeDef } from '../pipeline'
import { addBarrier, addPoi, isPlaceable, paint } from '../draft'
import { tacticalProfile } from '../profile'
import { premisePass } from '../naming'

const MARGIN = 2          // unpaved ring at the map edge (gates stop just short)
const DIST_CAP = 12       // road-distance transform horizon (cells)

interface CityPlan {
  road: Uint8Array         // 1 = paved (streets + plaza)
  dist: Int16Array         // BFS cell-steps to the nearest paved cell (≤ DIST_CAP)
  plazaR: number
}
const PLANS = new WeakMap<object, CityPlan>()

// ── roads: plaza + gate roads + cross-streets — the skeleton IS the plan ─────
const roadsPass = {
  id: 'roads',
  run({ draft, params, rng, note }: PassCtx) {
    const { size } = params
    const road = new Uint8Array(size * size)
    const c: Pt = { x: size / 2, y: size / 2 }
    const plazaR = Math.max(4.5, size * 0.1)
    const r = rng('layout')

    const pave = (x: number, y: number) => {
      if (x >= MARGIN && y >= MARGIN && x < size - MARGIN && y < size - MARGIN) road[y * size + x] = 1
    }
    // Axis-aligned two-leg strip between waypoints (same trick as the dungeon's
    // errant corridors) — `w` is the paved width.
    const carve = (a: Pt, b: Pt, w: number, elbow: boolean) => {
      const corner: Pt = elbow ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
      for (const [p, q] of [[a, corner], [corner, b]] as const) {
        const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x) + w
        const y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y) + w
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pave(x, y)
      }
    }

    // Plaza disc.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < plazaR) pave(x, y)
      }
    }

    // Gates: 3–4 of the compass edges, jittered along their edge. Each gate
    // road runs plaza → mid junction → gate with a jogged elbow per leg.
    const compass: { id: string; at: () => Pt }[] = [
      { id: 'n', at: () => ({ x: Math.round(r.range(size * 0.3, size * 0.7)), y: size - MARGIN - 1 }) },
      { id: 'e', at: () => ({ x: size - MARGIN - 1, y: Math.round(r.range(size * 0.3, size * 0.7)) }) },
      { id: 's', at: () => ({ x: Math.round(r.range(size * 0.3, size * 0.7)), y: MARGIN }) },
      { id: 'w', at: () => ({ x: MARGIN, y: Math.round(r.range(size * 0.3, size * 0.7)) }) },
    ]
    for (let i = compass.length - 1; i > 0; i--) { const j = r.int(i + 1); [compass[i], compass[j]] = [compass[j], compass[i]] }
    const gateCount = 3 + (r.chance(0.6) ? 1 : 0)
    const gates: { id: string; at: Pt; mid: Pt }[] = []
    for (const g of compass.slice(0, gateCount)) {
      const at = g.at()
      const mid: Pt = {
        x: Math.round(c.x + (at.x - c.x) * r.range(0.45, 0.65) + r.range(-size * 0.06, size * 0.06)),
        y: Math.round(c.y + (at.y - c.y) * r.range(0.45, 0.65) + r.range(-size * 0.06, size * 0.06)),
      }
      const wMain = r.chance(0.35) ? 3 : 2
      carve({ x: Math.round(c.x), y: Math.round(c.y) }, mid, wMain, r.chance(0.5))
      carve(mid, at, wMain, r.chance(0.5))
      gates.push({ id: g.id, at, mid })
    }

    // Cross-streets: junction → junction of angle-adjacent roads — the loop
    // edges that make back-routes (and let the profile see real blocks).
    const byAngle = [...gates].sort((a, b) =>
      Math.atan2(a.mid.y - c.y, a.mid.x - c.x) - Math.atan2(b.mid.y - c.y, b.mid.x - c.x))
    const crossEdges: [string, string][] = []
    const crossCount = Math.min(gates.length - 1, 1 + (r.chance(0.5) ? 1 : 0))
    for (let i = 0; i < crossCount; i++) {
      const a = byAngle[i], b = byAngle[(i + 1) % byAngle.length]
      carve(a.mid, b.mid, 2, r.chance(0.5))
      crossEdges.push([a.id, b.id])
    }

    // Spawn FIRST (isPlaceable's apron pivots to it), then publish the plan on
    // the nav skeleton: plaza → junction → gate per road, cross-street loops.
    addPoi(draft, { id: 'spawn', kind: 'spawn', at: c, tags: ['plaza'] })
    draft.semantic.nav.nodes = [
      { id: 'plaza', at: c, poiId: 'spawn', depth: 0 },
      ...gates.flatMap((g) => [
        { id: `junction-${g.id}`, at: g.mid, depth: 1 },
        { id: `gate-${g.id}`, at: g.at, depth: 2 },
      ]),
    ]
    draft.semantic.nav.edges = [
      ...gates.flatMap((g) => [
        { a: 'plaza', b: `junction-${g.id}`, kind: 'road' as const },
        { a: `junction-${g.id}`, b: `gate-${g.id}`, kind: 'road' as const },
      ]),
      ...crossEdges.map(([a, b]) => ({ a: `junction-${a}`, b: `junction-${b}`, kind: 'road' as const })),
    ]

    // Road-distance transform: how far every cell sits from pavement — the
    // blocks pass fronts houses with it, scatter backfills the yards.
    const dist = new Int16Array(size * size).fill(DIST_CAP + 1)
    const queue: number[] = []
    for (let i = 0; i < road.length; i++) if (road[i]) { dist[i] = 0; queue.push(i) }
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi]
      if (dist[i] >= DIST_CAP) continue
      const x = i % size, y = (i / size) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const j = ny * size + nx
        if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; queue.push(j) }
      }
    }
    PLANS.set(draft, { road, dist, plazaR })
    note(`${gates.length} gate road(s) [${gates.map((g) => g.id).join(',')}], ${crossEdges.length} cross-street(s), plaza r≈${plazaR.toFixed(1)}`)
  },
}

// ── pave: ground first (a city sits on a field), then streets + plaza ────────
const pavePass = {
  id: 'pave',
  run({ draft, params, fields, note }: PassCtx) {
    const plan = PLANS.get(draft)
    if (!plan) { note('no road plan — skipped'); return }
    const { size } = params
    const desert = params.themes.includes('desert')
    const c: Pt = { x: size / 2, y: size / 2 }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const m = fields.moisture(x + 0.5, y + 0.5)
        if (desert) paint(draft, x, y, 'sand')
        else paint(draft, x, y, m > 0.68 ? 'meadow' : m < 0.3 ? 'dirt' : 'grass')
        if (plan.road[y * size + x]) {
          paint(draft, x, y, Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < plan.plazaR ? 'stone-floor' : 'road')
        }
      }
    }
  },
}

// ── blocks: houses FRONT the streets — solid rects, alleys guaranteed ────────
const blocksPass = {
  id: 'blocks',
  run({ draft, params, rng, note }: PassCtx) {
    const plan = PLANS.get(draft)
    if (!plan) { note('no road plan — skipped'); return }
    const { size } = params
    const r = rng('sites')
    const budget = params.maxBarriers - draft.collision.length
    const target = Math.min(budget, Math.max(6, Math.round(size / 3)))
    if (target <= 0) { note('no barrier budget for buildings'); return }

    // Every covered cell ≥2 steps off the pavement (streets keep a 1-cell
    // verge), and the NEAREST cell ≤4 (houses front roads — no backlot hermits).
    const fits = (x: number, y: number, w: number, h: number): boolean => {
      let minD = Infinity
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const d = plan.dist[yy * size + xx]
          if (d < 2) return false
          minD = Math.min(minD, d)
        }
      }
      return minD <= 4
    }

    const baseline = draft.collision.length
    for (let guard = 0; draft.collision.length - baseline < target && guard < target * 30; guard++) {
      const w = Math.round(r.range(3, 6)), h = Math.round(r.range(3, 6))
      const x = Math.round(r.range(MARGIN + 1, size - MARGIN - w - 1))
      const y = Math.round(r.range(MARGIN + 1, size - MARGIN - h - 1))
      if (!fits(x, y, w, h)) continue
      // half-extent + 1.5 keeps a walkable alley to every neighbour (and the
      // apron/keep-clear boxes honoured, same predicate as everywhere else)
      if (!isPlaceable(draft, { x: x + w / 2, y: y + h / 2 }, Math.max(w, h) / 2 + 1.5)) continue
      const material = r.chance(0.55) ? ('cut-stone' as const) : ('wood' as const)
      addBarrier(draft, { x, y, w, h, kind: 'wall', material })
      // an L-wing ~a third of the time — compound houses break the box-grid read
      if (r.chance(0.35) && draft.collision.length - baseline < target) {
        const w2 = Math.round(r.range(2, 4)), h2 = Math.round(r.range(2, 4))
        const x2 = Math.round(x + r.range(0.3, 0.7) * w), y2 = r.chance(0.5) ? y - h2 : y + h
        if (x2 + w2 < size - MARGIN && x2 > MARGIN && y2 > MARGIN && y2 + h2 < size - MARGIN &&
          fits(x2, y2, w2, h2)) {
          addBarrier(draft, { x: x2, y: y2, w: w2, h: h2, kind: 'wall', material })
        }
      }
    }
    const placed = draft.collision.length - baseline
    note(`${placed} building rect(s) (target ${target}, budget ${budget})${placed < target ? ' — starved, blocks are full' : ''}`)
  },
}

// ── scatter: market clutter on the plaza rim, trees in the yards ─────────────
const scatterPass = {
  id: 'scatter',
  run({ draft, params, rng, note }: PassCtx) {
    const plan = PLANS.get(draft)
    if (!plan) { note('no road plan — skipped'); return }
    const { size } = params
    const r = rng('place')
    const c: Pt = { x: size / 2, y: size / 2 }
    const push = (kind: 'tree' | 'bush' | 'flower' | 'rock' | 'stump', x: number, y: number, s: number) =>
      draft.scatter.push({
        kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
        size: Math.round(s * 100) / 100, seed: r.int(1 << 30), solid: false,
      })

    // Plaza rim ring: stalls-and-planters read (flowers/bushes), just outside
    // the spawn apron so the form-up knot stays clean.
    const ring = 6 + r.int(5)
    for (let i = 0, guard = 0; i < ring && guard < ring * 5; guard++) {
      const ang = r.range(0, Math.PI * 2)
      const rad = r.range(params.spawnApron + 0.8, params.spawnApron + 2.5)
      const x = c.x + Math.cos(ang) * rad, y = c.y + Math.sin(ang) * rad
      if (!isPlaceable(draft, { x, y }, 0.5)) continue
      push(r.chance(0.6) ? 'flower' : 'bush', x, y, r.range(0.5, 0.9))
      i++
    }

    // Yards + backlots: greenery grows where the pavement doesn't reach.
    const yardTarget = Math.round((size * size) / 140)
    let yards = 0
    for (let guard = 0; yards < yardTarget && guard < yardTarget * 6; guard++) {
      const x = r.range(MARGIN + 1, size - MARGIN - 1), y = r.range(MARGIN + 1, size - MARGIN - 1)
      const d = plan.dist[Math.floor(y) * size + Math.floor(x)]
      if (d < 3) continue
      if (!isPlaceable(draft, { x, y }, 0.5)) continue
      push(d > 5 ? 'tree' : r.chance(0.5) ? 'bush' : 'stump', x, y, r.range(0.7, 1.3))
      yards++
    }
    if (yards < yardTarget) note(`yard scatter starved: ${yards}/${yardTarget}`)
  },
}

// ── semantic: the plaza landmark, and the map describes itself (§L) ──────────
const semanticPass = {
  id: 'semantic',
  run({ draft, params, rng }: PassCtx) {
    const plan = PLANS.get(draft)
    const { size } = params
    const r = rng('landmark')
    // Caller-owned anchors (portals) — pre-placed, validator must reach them.
    params.pois.forEach((p, i) => addPoi(draft, { id: p.id ?? `${p.kind}-${i}`, kind: p.kind, at: p.at, tags: p.tags }))
    // The well/statue: on the plaza floor, offset from the form-up knot (§H —
    // render decides WHAT stands there; we only say where).
    const ang = r.range(0, Math.PI * 2)
    const rad = (plan?.plazaR ?? size * 0.1) * 0.55
    addPoi(draft, {
      id: 'landmark', kind: 'landmark',
      at: { x: size / 2 + Math.cos(ang) * rad, y: size / 2 + Math.sin(ang) * rad },
      tags: ['plaza', 'well'],
    })
    draft.semantic.tactical = tacticalProfile(draft)
  },
}

export const CITY_RECIPE: RecipeDef = {
  id: 'city',
  name: 'City Quarter',
  description: 'Road-first town: plaza + gate roads + cross-street loops → paving → street-fronting buildings → yard/market scatter → plaza landmark + premise.',
  passes: [roadsPass, pavePass, blocksPass, scatterPass, semanticPass, premisePass],
  // The spawn apron is the plaza's clear heart (plaza r ≈ size*0.1, so houses
  // hug the rim); budget matches the lab default — the adapter still pins live
  // maps to the benched 16.
  defaults: { size: 64, maxBarriers: 24, spawnApron: 7, themes: ['city'] },
}
