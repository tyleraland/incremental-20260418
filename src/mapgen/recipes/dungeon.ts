// The DUNGEON recipe — graph-first (idea catalog §D, prototyping-order step 5).
// The plan comes BEFORE the geometry: `layout` decides rooms and their
// connectivity graph — a spanning tree plus extra edges, so the layout is
// CYCLIC (⭐4: loops, not trees — back-routes and flanking, forces arrive from
// two sides) — and only then does `carve` realize it as wall rects with door
// gaps. Stamps (§I) drop authored set pieces into rooms under budget; depth is
// graph distance from the entry (§G gradient), and the lair sits at max depth.
//
// Geometry model (deliberately constructive, not mask-carved): rooms are the
// cells of a jittered g×g lattice; walls are the lattice's band segments, each
// ONE rect (two when a door splits it), so the rect count is known and small
// by construction. Room-shape variety comes from band thickness jitter,
// skipped (solid) cells, doors, and stamps — organic wall reads come free from
// the paper renderer's blob pass. Maximal-rect mask carving (free-form rooms)
// is a later refinement — see BACKLOG.
//
// NOT live on any location yet: a dungeon spends ~20–35 rects, above the
// benched open-world pathing envelope (16). Fine for the lab and for future
// discrete encounters; a live open-world dungeon needs the pather perf pass
// first (BACKLOG → Procedural map generation, cross-cutting debts).

import type { Rect } from '../types'
import type { PassCtx, RecipeDef } from '../pipeline'
import { addBarrier, addPoi, isPlaceable, paint } from '../draft'
import { hashString } from '../rng'
import { tacticalProfile } from '../profile'
import { STAMP_REGISTRY, placeStamp, stampBarrierCost, type StampDef } from '../stamps'

const DOOR_W = 3.2          // gap width; PAD-inflated flood fill still passes ≥2.3
const BAND_MIN = 1.1        // band half-thickness range (walls 2.2–3.2 thick)
const BAND_MAX = 1.6

interface Lattice {
  g: number
  vx: number[]; hv: number[]     // vertical line centres + half-thicknesses (index 1..g-1)
  hy: number[]; hh: number[]     // horizontal line centres + half-thicknesses
  present: boolean[]             // cell cx + cy*g → is a room (not solid)
  rooms: Map<string, Rect>       // room id → floor rect
  edges: { a: string; b: string }[]
}

const roomId = (cx: number, cy: number) => `room-${cx}-${cy}`

// Cell floor span between the surrounding bands (map edge when on the rim).
function cellRect(L: Lattice, size: number, cx: number, cy: number): Rect {
  const x0 = cx === 0 ? 0 : L.vx[cx] + L.hv[cx]
  const x1 = cx === L.g - 1 ? size : L.vx[cx + 1] - L.hv[cx + 1]
  const y0 = cy === 0 ? 0 : L.hy[cy] + L.hh[cy]
  const y1 = cy === L.g - 1 ? size : L.hy[cy + 1] - L.hh[cy + 1]
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Stash the lattice on the draft via a WeakMap so passes share it without
// widening the MapDraft type (it's plan-time scaffolding, not spec output —
// what consumers need lands in semantic.nav).
const PLANS = new WeakMap<object, Lattice>()

// ── layout: rooms + a CYCLIC connectivity graph, spawn at the entry (§A L5-6) ─
const layoutPass = {
  id: 'layout',
  run({ draft, params, rng, note }: PassCtx) {
    const { size } = params
    const g = Math.max(2, Math.min(3, Math.round(size / 16)))
    const r = rng('lattice')
    const L: Lattice = {
      g,
      vx: Array.from({ length: g }, (_, i) => (i * size) / g),
      hv: Array.from({ length: g }, () => r.range(BAND_MIN, BAND_MAX)),
      hy: Array.from({ length: g }, (_, i) => (i * size) / g),
      hh: Array.from({ length: g }, () => r.range(BAND_MIN, BAND_MAX)),
      present: Array.from({ length: g * g }, () => true),
      rooms: new Map(),
      edges: [],
    }
    // Skip a few cells into solid rock — floor-plan variety. Keep ≥ 4 rooms.
    const skipper = rng('skips')
    for (let i = 0; i < g * g; i++) {
      if (L.present.filter(Boolean).length <= 4) break
      if (skipper.chance(0.16)) L.present[i] = false
    }
    // Largest connected component wins; stragglers turn solid (no orphan rooms).
    const comp = largestComponent(L)
    for (let i = 0; i < g * g; i++) if (!comp.has(i)) L.present[i] = false
    const cells: [number, number][] = []
    for (let cy = 0; cy < g; cy++) for (let cx = 0; cx < g; cx++) if (L.present[cy * g + cx]) cells.push([cx, cy])
    for (const [cx, cy] of cells) L.rooms.set(roomId(cx, cy), cellRect(L, size, cx, cy))

    // Graph: randomized spanning tree over lattice-adjacent rooms, then extra
    // edges from the leftovers — the CYCLES. Note how many loops we got.
    const cands: { a: string; b: string; ai: number; bi: number }[] = []
    for (const [cx, cy] of cells) {
      if (cx + 1 < g && L.present[cy * g + cx + 1]) cands.push({ a: roomId(cx, cy), b: roomId(cx + 1, cy), ai: cy * g + cx, bi: cy * g + cx + 1 })
      if (cy + 1 < g && L.present[(cy + 1) * g + cx]) cands.push({ a: roomId(cx, cy), b: roomId(cx, cy + 1), ai: cy * g + cx, bi: (cy + 1) * g + cx })
    }
    const shuf = rng('graph')
    for (let i = cands.length - 1; i > 0; i--) { const j = shuf.int(i + 1); [cands[i], cands[j]] = [cands[j], cands[i]] }
    const parent = new Map<number, number>()
    const find = (i: number): number => { const p = parent.get(i) ?? i; if (p === i) return i; const root = find(p); parent.set(i, root); return root }
    const spare: typeof cands = []
    for (const c of cands) {
      if (find(c.ai) === find(c.bi)) { spare.push(c); continue }
      parent.set(find(c.ai), find(c.bi))
      L.edges.push({ a: c.a, b: c.b })
    }
    let loops = 0
    for (const c of spare) {
      if (loops >= 2) break
      L.edges.push({ a: c.a, b: c.b })
      loops++
    }
    note(`${cells.length} rooms, ${L.edges.length} corridors (${loops} loop edge(s), g=${g})`)

    // Entry: the southernmost room nearest the map's south-centre; spawn there
    // FIRST so isPlaceable's apron protects it for every later pass.
    const entry = cells.slice().sort((p, q) => p[1] - q[1] || Math.abs(p[0] - (g - 1) / 2) - Math.abs(q[0] - (g - 1) / 2))[0]
    const er = L.rooms.get(roomId(entry[0], entry[1]))!
    addPoi(draft, { id: 'spawn', kind: 'spawn', at: { x: er.x + er.w / 2, y: er.y + er.h / 2 }, tags: ['entry'] })

    // Publish the plan: nodes carry room areas + depth (BFS from entry); edges
    // are the corridors. Function-first — geometry realizes THIS, next pass.
    const depth = bfsDepth(L, roomId(entry[0], entry[1]))
    draft.semantic.nav.nodes = [...L.rooms.entries()].map(([id, rect]) => ({
      id, at: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, area: rect, depth: depth.get(id) ?? 0,
    }))
    draft.semantic.nav.edges = L.edges.map((e) => ({ ...e, kind: 'corridor' as const }))
    PLANS.set(draft, L)
  },
}

function largestComponent(L: Lattice): Set<number> {
  const { g } = L
  const seen = new Set<number>()
  let best = new Set<number>()
  for (let s = 0; s < g * g; s++) {
    if (!L.present[s] || seen.has(s)) continue
    const comp = new Set<number>([s])
    const stack = [s]
    seen.add(s)
    while (stack.length) {
      const i = stack.pop()!
      const cx = i % g, cy = (i / g) | 0
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= g || ny >= g) continue
        const j = ny * g + nx
        if (L.present[j] && !seen.has(j)) { seen.add(j); comp.add(j); stack.push(j) }
      }
    }
    if (comp.size > best.size) best = comp
  }
  return best
}

function bfsDepth(L: Lattice, entry: string): Map<string, number> {
  const adj = new Map<string, string[]>()
  for (const e of L.edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b])
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a])
  }
  const depth = new Map<string, number>([[entry, 0]])
  const queue = [entry]
  while (queue.length) {
    const id = queue.shift()!
    for (const n of adj.get(id) ?? []) {
      if (!depth.has(n)) { depth.set(n, depth.get(id)! + 1); queue.push(n) }
    }
  }
  return depth
}

// ── carve: realize the plan as wall rects with door gaps (§A layer 6) ────────
const carvePass = {
  id: 'carve',
  run({ draft, params, rng, note }: PassCtx) {
    const L = PLANS.get(draft)
    if (!L) { note('no layout plan — skipped'); return }
    const { size } = params
    const { g } = L
    const doorRng = rng('doors')
    const hasEdge = (a: string, b: string) => L.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))
    const isSolid = (cx: number, cy: number) => !L.present[cy * g + cx]

    // Solid cells fill themselves + their surrounding band halves — one rect.
    for (let cy = 0; cy < g; cy++) {
      for (let cx = 0; cx < g; cx++) {
        if (!isSolid(cx, cy)) continue
        const x0 = cx === 0 ? 0 : L.vx[cx] - L.hv[cx]
        const x1 = cx === g - 1 ? size : L.vx[cx + 1] + L.hv[cx + 1]
        const y0 = cy === 0 ? 0 : L.hy[cy] - L.hh[cy]
        const y1 = cy === g - 1 ? size : L.hy[cy + 1] + L.hh[cy + 1]
        addBarrier(draft, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'wall', material: 'cut-stone' })
      }
    }

    // Internal band segments: one wall rect per (line, cell-row/col), split in
    // two by a door where the plan has an edge. Segments flanking a solid cell
    // are already covered by its fill.
    const emit = (x: number, y: number, w: number, h: number) => {
      addBarrier(draft, { x, y, w, h, kind: 'wall', material: 'cut-stone' })
    }
    for (let i = 1; i < g; i++) {
      for (let row = 0; row < g; row++) {
        if (isSolid(i - 1, row) || isSolid(i, row)) continue
        const x = L.vx[i] - L.hv[i], w = L.hv[i] * 2
        const y0 = row === 0 ? 0 : L.hy[row] - L.hh[row]
        const y1 = row === g - 1 ? size : L.hy[row + 1] + L.hh[row + 1]
        if (hasEdge(roomId(i - 1, row), roomId(i, row))) {
          const room = cellRect(L, size, i, row)
          const c = room.y + (0.3 + doorRng.next() * 0.4) * room.h
          if (c - DOOR_W / 2 - y0 > 0.6) emit(x, y0, w, c - DOOR_W / 2 - y0)
          if (y1 - (c + DOOR_W / 2) > 0.6) emit(x, c + DOOR_W / 2, w, y1 - (c + DOOR_W / 2))
          markDoor(draft, roomId(i - 1, row), roomId(i, row), { x: L.vx[i], y: c })
        } else emit(x, y0, w, y1 - y0)
      }
    }
    for (let i = 1; i < g; i++) {
      for (let col = 0; col < g; col++) {
        if (isSolid(col, i - 1) || isSolid(col, i)) continue
        const y = L.hy[i] - L.hh[i], h = L.hh[i] * 2
        const x0 = col === 0 ? 0 : L.vx[col] - L.hv[col]
        const x1 = col === g - 1 ? size : L.vx[col + 1] + L.hv[col + 1]
        if (hasEdge(roomId(col, i - 1), roomId(col, i))) {
          const room = cellRect(L, size, col, i)
          const c = room.x + (0.3 + doorRng.next() * 0.4) * room.w
          if (c - DOOR_W / 2 - x0 > 0.6) emit(x0, y, c - DOOR_W / 2 - x0, h)
          if (x1 - (c + DOOR_W / 2) > 0.6) emit(c + DOOR_W / 2, y, x1 - (c + DOOR_W / 2), h)
          markDoor(draft, roomId(col, i - 1), roomId(col, i), { x: c, y: L.hy[i] })
        } else emit(x0, y, x1 - x0, h)
      }
    }
    note(`${draft.collision.length}/${params.maxBarriers} rects after carve`)
  },
}

function markDoor(draft: PassCtx['draft'], a: string, b: string, at: { x: number; y: number }) {
  const e = draft.semantic.nav.edges.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
  if (e) e.doorAt = { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 }
}

// ── floor: everything is dressed stone; the deepest room goes to dirt (§G) ───
const floorPass = {
  id: 'floor',
  run({ draft }: PassCtx) {
    for (let y = 0; y < draft.rows; y++) for (let x = 0; x < draft.cols; x++) paint(draft, x, y, 'stone-floor')
    const deepest = [...draft.semantic.nav.nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0]
    if (deepest?.area && (deepest.depth ?? 0) > 0) {
      const r = deepest.area
      for (let y = Math.ceil(r.y); y < r.y + r.h; y++) {
        for (let x = Math.ceil(r.x); x < r.x + r.w; x++) paint(draft, x, y, 'dirt')
      }
    }
  },
}

// ── stamps: authored set pieces placed by constraint + budget (§I) ───────────
const stampsPass = {
  id: 'stamps',
  run({ draft, params, rng, note }: PassCtx) {
    const nodes = draft.semantic.nav.nodes
    const degree = new Map<string, number>()
    for (const e of draft.semantic.nav.edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
    }
    const entry = nodes.find((n) => (n.depth ?? 0) === 0)
    const lair = [...nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0]
    const r = rng('place')
    const placed: string[] = []
    const used = new Set<string>()

    const tryPlace = (stamp: StampDef, node: (typeof nodes)[number]) => {
      const a = node.area
      if (!a || used.has(node.id)) return false
      if (a.w < stamp.w + 2.4 || a.h < stamp.h + 2.4) return false
      if (draft.collision.length + stampBarrierCost(stamp) > params.maxBarriers) return false
      const at = {
        x: a.x + 1.2 + r.next() * (a.w - stamp.w - 2.4),
        y: a.y + 1.2 + r.next() * (a.h - stamp.h - 2.4),
      }
      placeStamp(draft, stamp, at, (params.seed ^ hashString(node.id)) >>> 0)
      used.add(node.id)
      placed.push(`${stamp.id}@${node.id}`)
      return true
    }

    // §D "dead-ends worth risking": the barred cell goes in a leaf room off the
    // critical path (never entry/lair). Pillars favour the deep middle; the
    // shrine takes any leftover room.
    const deadEnds = nodes.filter((n) => degree.get(n.id) === 1 && n.id !== entry?.id && n.id !== lair?.id)
    for (const n of deadEnds) if (tryPlace(STAMP_REGISTRY['barred-cell'], n)) break
    const mids = nodes
      .filter((n) => (n.depth ?? 0) >= 1 && n.id !== lair?.id)
      .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
    for (const n of mids) if (tryPlace(STAMP_REGISTRY['pillar-vault'], n)) break
    for (const n of nodes.filter((x) => x.id !== entry?.id)) if (tryPlace(STAMP_REGISTRY['shrine'], n)) break
    note(placed.length ? `placed ${placed.join(', ')}` : 'no stamp fit (rooms too small or budget spent)')
  },
}

// ── scatter: debris thickens with depth (§G gradient made visible) ───────────
const scatterPass = {
  id: 'scatter',
  run({ draft, rng }: PassCtx) {
    const r = rng('place')
    for (const n of draft.semantic.nav.nodes) {
      if (!n.area) continue
      const count = 2 + (n.depth ?? 0) + r.int(3)
      for (let k = 0, guard = 0; k < count && guard < count * 6; guard++) {
        const x = n.area.x + 1 + r.next() * (n.area.w - 2)
        const y = n.area.y + 1 + r.next() * (n.area.h - 2)
        if (!isPlaceable(draft, { x, y }, 0.5)) continue
        const kind = r.chance(0.5) ? 'rock' : r.chance(0.5) ? 'stump' : 'flower'
        draft.scatter.push({
          kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
          size: Math.round((0.6 + r.next() * 0.5) * 100) / 100, seed: r.int(1 << 30), solid: false,
        })
        k++
      }
    }
  },
}

// ── semantic: the lair, and the map describes itself (§L) ────────────────────
const semanticPass = {
  id: 'semantic',
  run({ draft, note }: PassCtx) {
    const lair = [...draft.semantic.nav.nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0]
    if (lair && (lair.depth ?? 0) > 0) {
      addPoi(draft, { id: 'lair', kind: 'lair', at: lair.at, tags: ['boss', `depth-${lair.depth}`] })
    } else note('no room deeper than the entry — lair skipped')
    draft.semantic.tactical = tacticalProfile(draft)
  },
}

export const DUNGEON_RECIPE: RecipeDef = {
  id: 'dungeon',
  name: 'Dungeon Floor',
  description: 'Graph-first dungeon: jittered room lattice → cyclic corridor graph → carved walls + doors → stamps → depth-graded debris → lair.',
  passes: [layoutPass, carvePass, floorPass, stampsPass, scatterPass, semanticPass],
  // A dungeon is wall-dense by nature: ~20–35 rects. Above the live open-world
  // pathing envelope (16) on purpose — lab/encounter use only until the pather
  // perf pass (BACKLOG). Spawn sits in a room, so the apron is small.
  defaults: { size: 48, maxBarriers: 36, spawnApron: 3.5, themes: ['dungeon'] },
}
