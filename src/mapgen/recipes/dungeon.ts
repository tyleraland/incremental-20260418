// The DUNGEON recipe — graph-first (idea catalog §D, prototyping-order step 5),
// donjon-flavored (donjon.bin.sh: Scattered room layout, Small→Colossal size
// spread, "polymorph" irregular rooms, Errant corridors, kept dead-ends).
//
// The plan comes BEFORE the geometry: `layout` free-places rooms of wildly
// varied size and shape on the cell grid, connects them with a spanning tree
// plus extra edges — CYCLIC layouts (⭐4: loops, not trees — back-routes and
// flanking) — and carves winding corridors between them. Only then does
// `carve` realize the negative space as wall rects (greedy maximal-rectangle
// cover of the solid mask), so floor shape is FREE-FORM — L/T composites,
// closets, long halls, cave-notched edges — while collision stays rects
// forever. Stamps (§I) drop authored set pieces into rooms under budget;
// depth is graph distance from the entry (§G), and the lair sits at max depth.
//
// NOT live on any location yet: a dungeon spends ~30–60 rects, above the
// benched open-world pathing envelope (16). Fine for the lab and for future
// discrete encounters; a live open-world dungeon needs the pather perf pass
// first (BACKLOG → Procedural map generation, cross-cutting debts).

import type { Pt, Rect } from '../types'
import type { PassCtx, RecipeDef } from '../pipeline'
import { addBarrier, addPoi, isPlaceable, paint } from '../draft'
import { hashString, type Rng } from '../rng'
import { tacticalProfile } from '../profile'
import { STAMP_REGISTRY, placeStamp, stampBarrierCost, type StampDef } from '../stamps'

const MARGIN = 2          // solid ring at the map edge (cells)
const ROOM_GAP = 2        // min solid cells between room bounding boxes
const ENTRY_MIN = 9       // entry hall min side — must swallow the spawn apron

// The donjon-style room size table (Small…Colossal): weighted archetypes.
// `hall` is the long gallery — one axis stretched, the other narrow.
const ROOM_KINDS = [
  { kind: 'closet', weight: 0.22, w: [3, 5] as const, h: [3, 5] as const },
  { kind: 'small', weight: 0.30, w: [5, 7] as const, h: [5, 7] as const },
  { kind: 'medium', weight: 0.26, w: [7, 10] as const, h: [7, 10] as const },
  { kind: 'large', weight: 0.14, w: [10, 14] as const, h: [10, 14] as const },
  { kind: 'hall', weight: 0.08, w: [4, 6] as const, h: [11, 16] as const },
]

interface Room {
  id: string
  primary: Rect              // largest rect — stamp/POI anchor + node area
  rects: Rect[]              // full composite (primary + polymorph lobes)
}
interface Plan {
  walk: Uint8Array
  rooms: Room[]
  edges: { a: string; b: string; doorAt?: Pt }[]
  corridorCells: number[]
}
const PLANS = new WeakMap<object, Plan>()

const idx = (size: number, x: number, y: number) => y * size + x
const center = (r: Rect): Pt => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })

function carveRect(walk: Uint8Array, size: number, r: Rect) {
  const x0 = Math.max(MARGIN, Math.floor(r.x)), x1 = Math.min(size - MARGIN, Math.ceil(r.x + r.w))
  const y0 = Math.max(MARGIN, Math.floor(r.y)), y1 = Math.min(size - MARGIN, Math.ceil(r.y + r.h))
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) walk[idx(size, x, y)] = 1
}

// ── layout: scattered polymorph rooms + a cyclic graph + errant corridors ────
const layoutPass = {
  id: 'layout',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size } = params
    const walk = new Uint8Array(size * size)
    const r = rng('rooms')
    const rooms: Room[] = []
    const bboxes: Rect[] = []

    const tryRoom = (primary: Rect, polymorph: boolean): Room | null => {
      // whole composite must clear other rooms' grown boxes
      const rects = [primary]
      if (polymorph) {
        // 1–2 offset lobes make an L / T / fat-cross silhouette (donjon
        // "polymorph rooms") — each overlaps the primary so the floor is one mass.
        const lobes = 1 + (r.chance(0.35) ? 1 : 0)
        for (let i = 0; i < lobes; i++) {
          const lw = Math.max(3, Math.round(primary.w * r.range(0.4, 0.8)))
          const lh = Math.max(3, Math.round(primary.h * r.range(0.4, 0.8)))
          rects.push({
            x: Math.round(primary.x + r.range(-lw * 0.6, primary.w - lw * 0.4)),
            y: Math.round(primary.y + r.range(-lh * 0.6, primary.h - lh * 0.4)),
            w: lw, h: lh,
          })
        }
      }
      const bx0 = Math.min(...rects.map((q) => q.x)) - ROOM_GAP
      const by0 = Math.min(...rects.map((q) => q.y)) - ROOM_GAP
      const bx1 = Math.max(...rects.map((q) => q.x + q.w)) + ROOM_GAP
      const by1 = Math.max(...rects.map((q) => q.y + q.h)) + ROOM_GAP
      if (bx0 < MARGIN || by0 < MARGIN || bx1 > size - MARGIN || by1 > size - MARGIN) return null
      const box = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }
      if (bboxes.some((b) => b.x < box.x + box.w && box.x < b.x + b.w && b.y < box.y + box.h && box.y < b.y + b.h)) return null
      const room: Room = { id: `room-${rooms.length}`, primary, rects }
      rooms.push(room)
      bboxes.push(box)
      for (const q of rects) carveRect(walk, size, q)
      return room
    }

    // The entry hall first — big enough to swallow the spawn apron, in the
    // southern third so the delve reads bottom-up.
    for (let guard = 0; guard < 60 && rooms.length === 0; guard++) {
      const w = Math.round(r.range(ENTRY_MIN, ENTRY_MIN + 4))
      const h = Math.round(r.range(ENTRY_MIN, ENTRY_MIN + 4))
      tryRoom({ x: Math.round(r.range(MARGIN + 1, size - MARGIN - w - 1)), y: Math.round(r.range(MARGIN + 1, size * 0.33)), w, h }, r.chance(0.4))
    }

    // One guaranteed great hall (donjon's Large/Huge presence — also the
    // pillar-vault's natural home), anywhere clear of the entry.
    for (let guard = 0; guard < 60 && rooms.length === 1; guard++) {
      const w = Math.round(r.range(11, 14)), h = Math.round(r.range(11, 14))
      tryRoom({
        x: Math.round(r.range(MARGIN + 1, size - MARGIN - w - 1)),
        y: Math.round(r.range(MARGIN + 1, size - MARGIN - h - 1)),
        w, h,
      }, r.chance(0.5))
    }

    // Scattered fill: weighted size table, ~60% polymorph.
    const target = Math.max(6, Math.min(12, Math.round(size / 5)))
    for (let guard = 0; rooms.length < target && guard < target * 30; guard++) {
      const pick = r.next()
      let acc = 0
      const k = ROOM_KINDS.find((q) => (acc += q.weight) >= pick) ?? ROOM_KINDS[1]
      let [w, h] = [Math.round(r.range(k.w[0], k.w[1])), Math.round(r.range(k.h[0], k.h[1]))]
      if (k.kind === 'hall' && r.chance(0.5)) [w, h] = [h, w]   // galleries run either way
      tryRoom({
        x: Math.round(r.range(MARGIN + 1, size - MARGIN - w - 1)),
        y: Math.round(r.range(MARGIN + 1, size - MARGIN - h - 1)),
        w, h,
      }, r.chance(0.6))
    }

    // Graph: candidate edges to each room's 3 nearest neighbours, randomized
    // spanning tree, plus up to 2 spares — the cycles.
    const cands: { a: number; b: number; d: number }[] = []
    for (let i = 0; i < rooms.length; i++) {
      const near = rooms
        .map((q, j) => ({ j, d: Math.hypot(center(q.primary).x - center(rooms[i].primary).x, center(q.primary).y - center(rooms[i].primary).y) }))
        .filter((q) => q.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 3)
      for (const n of near) {
        const [a, b] = [Math.min(i, n.j), Math.max(i, n.j)]
        if (!cands.some((c) => c.a === a && c.b === b)) cands.push({ a, b, d: n.d })
      }
    }
    const shuf = rng('graph')
    for (let i = cands.length - 1; i > 0; i--) { const j = shuf.int(i + 1); [cands[i], cands[j]] = [cands[j], cands[i]] }
    const parent = rooms.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    const edges: Plan['edges'] = []
    const spare: typeof cands = []
    for (const c of cands) {
      if (find(c.a) === find(c.b)) { spare.push(c); continue }
      parent[find(c.a)] = find(c.b)
      edges.push({ a: rooms[c.a].id, b: rooms[c.b].id })
    }
    let loops = 0
    for (const c of spare) {
      if (loops >= 2) break
      edges.push({ a: rooms[c.a].id, b: rooms[c.b].id })
      loops++
    }

    // Errant corridors: DOOR to DOOR (each end exits its room's boundary
    // toward the partner — center-to-center routing carved through half of
    // every room and merged neighbours into plazas), through 0–2 jittered
    // waypoints, width 2 (sometimes 3) — narrow, winding, a tactical space of
    // its own. `doorAt` is the source room's exact exit pinch.
    const cr = rng('corridors')
    const corridorCells: number[] = []
    const roomOf = new Map(rooms.map((q) => [q.id, q]))
    // Where a ray from the room centre toward `target` exits the primary rect,
    // pulled one cell inside so the corridor always overlaps the room floor.
    const doorFor = (room: Room, target: Pt): Pt => {
      const c = center(room.primary)
      const dx = target.x - c.x, dy = target.y - c.y
      const sx = dx !== 0 ? (room.primary.w / 2 - 1) / Math.abs(dx) : Infinity
      const sy = dy !== 0 ? (room.primary.h / 2 - 1) / Math.abs(dy) : Infinity
      const s = Math.min(sx, sy, 1)
      return { x: Math.round(c.x + dx * s), y: Math.round(c.y + dy * s) }
    }
    for (const e of edges) {
      const A = roomOf.get(e.a)!, B = roomOf.get(e.b)!
      const a = doorFor(A, center(B.primary))
      const b = doorFor(B, center(A.primary))
      const pts: Pt[] = [a]
      const jogs = cr.int(3)   // 0–2 = Straight…Errant
      for (let j = 1; j <= jogs; j++) {
        const t = j / (jogs + 1)
        pts.push({
          x: Math.round(a.x + (b.x - a.x) * t + cr.range(-size * 0.06, size * 0.06)),
          y: Math.round(a.y + (b.y - a.y) * t + cr.range(-size * 0.06, size * 0.06)),
        })
      }
      pts.push(b)
      const wCorr = cr.chance(0.25) ? 3 : 2
      let cur = pts[0]
      for (let i = 1; i < pts.length; i++) {
        const nxt = pts[i]
        const corner: Pt = cr.chance(0.5) ? { x: nxt.x, y: cur.y } : { x: cur.x, y: nxt.y }
        for (const [from, to] of [[cur, corner], [corner, nxt]] as const) {
          carveRect(walk, size, {
            x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
            w: Math.abs(to.x - from.x) + wCorr, h: Math.abs(to.y - from.y) + wCorr,
          })
        }
        cur = nxt
      }
      e.doorAt = a
    }

    // Dead-end stubs (donjon "Remove Deadends: Some" — we keep a few): short
    // blind alleys off room edges. Optional vault bait later, ambush pocket now.
    const stubs = 1 + cr.int(2)
    for (let s = 0, guard = 0; s < stubs && guard < 20; guard++) {
      const room = rooms[cr.int(rooms.length)]
      const p = center(room.primary)
      const dir = cr.pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      const len = 3 + cr.int(4)
      // start one cell INSIDE the room floor so the stub always connects
      const start = {
        x: p.x + dir[0] * (Math.ceil(room.primary.w / 2) - 1),
        y: p.y + dir[1] * (Math.ceil(room.primary.h / 2) - 1),
      }
      const leg: Rect = { x: Math.min(start.x, start.x + dir[0] * len), y: Math.min(start.y, start.y + dir[1] * len), w: Math.abs(dir[0] * len) + 2, h: Math.abs(dir[1] * len) + 2 }
      if (leg.x < MARGIN || leg.y < MARGIN || leg.x + leg.w > size - MARGIN || leg.y + leg.h > size - MARGIN) continue
      carveRect(walk, size, leg)
      s++
    }

    // Cave-notch erosion: knob single cells of floor into the rock where the
    // roughness field runs hot — breaks the last straight edges. ADD-only, so
    // connectivity can't regress.
    for (let y = MARGIN; y < size - MARGIN; y++) {
      for (let x = MARGIN; x < size - MARGIN; x++) {
        if (walk[idx(size, x, y)]) continue
        const nearFloor = walk[idx(size, x + 1, y)] || walk[idx(size, x - 1, y)] || walk[idx(size, x, y + 1)] || walk[idx(size, x, y - 1)]
        if (nearFloor && fields.roughness(x, y) > 0.8) walk[idx(size, x, y)] = 1
      }
    }

    for (let i = 0; i < size * size; i++) if (walk[i]) corridorCells.push(i)
    note(`${rooms.length} rooms (${rooms.filter((q) => q.rects.length > 1).length} polymorph), ${edges.length} corridors (${loops} loop edge(s)), ${stubs} stub(s)`)

    // Spawn in the entry hall FIRST (isPlaceable apron guards it from here on).
    const entry = rooms[0]
    addPoi(draft, { id: 'spawn', kind: 'spawn', at: center(entry.primary), tags: ['entry'] })

    // Publish the plan on the nav skeleton (function-first: geometry realizes THIS).
    const depth = bfsDepth(rooms, edges, entry.id)
    draft.semantic.nav.nodes = rooms.map((q) => ({
      id: q.id, at: center(q.primary), area: q.primary, depth: depth.get(q.id) ?? 0,
    }))
    draft.semantic.nav.edges = edges.map((e) => ({ a: e.a, b: e.b, kind: 'corridor' as const, doorAt: e.doorAt }))
    PLANS.set(draft, { walk, rooms, edges, corridorCells })
  },
}

function bfsDepth(rooms: Room[], edges: Plan['edges'], entry: string): Map<string, number> {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
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

// ── carve: cover the SOLID mask with few fat rects (maximal-rect greedy) ─────
// Free-form floor, rects-forever collision: repeatedly take the largest
// uncovered-solid rectangle (max-area-under-histogram), then grow it over any
// solid cells (covered or not) so neighbours merge instead of tiling. Exact:
// loops until every solid cell is covered — a stray gap would be walkable rock.
const carvePass = {
  id: 'carve',
  run({ draft, params, note }: PassCtx) {
    const plan = PLANS.get(draft)
    if (!plan) { note('no layout plan — skipped'); return }
    const { size } = params
    const solid = plan.walk.map((v) => (v ? 0 : 1))
    const covered = new Uint8Array(size * size)
    let emitted = 0
    const heights = new Int32Array(size)
    for (let guard = 0; guard < 400; guard++) {
      // largest rectangle of solid && !covered
      let best = { area: 0, x: 0, y: 0, w: 0, h: 0 }
      heights.fill(0)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = idx(size, x, y)
          heights[x] = solid[i] && !covered[i] ? heights[x] + 1 : 0
        }
        // max rect under histogram (classic index-stack scan)
        const stack: number[] = []
        for (let x = 0; x <= size; x++) {
          const h = x === size ? 0 : heights[x]
          while (stack.length && heights[stack[stack.length - 1]] > h) {
            const top = stack.pop()!
            const hh = heights[top]
            const left = stack.length ? stack[stack.length - 1] + 1 : 0
            const ww = x - left
            if (hh * ww > best.area) best = { area: hh * ww, x: left, y: y - hh + 1, w: ww, h: hh }
          }
          stack.push(x)
        }
      }
      if (best.area === 0) break
      void guard
      // grow over ANY solid (merges into the surrounding rock mass)
      let { x, y, w, h } = best
      const allSolid = (x0: number, y0: number, x1: number, y1: number) => {
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (!solid[idx(size, xx, yy)]) return false
        return true
      }
      while (x > 0 && allSolid(x - 1, y, x, y + h)) { x--; w++ }
      while (x + w < size && allSolid(x + w, y, x + w + 1, y + h)) w++
      while (y > 0 && allSolid(x, y - 1, x + w, y)) { y--; h++ }
      while (y + h < size && allSolid(x, y + h, x + w, y + h + 1)) h++
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) covered[idx(size, xx, yy)] = 1
      addBarrier(draft, { x, y, w, h, kind: 'wall', material: 'cut-stone' })
      emitted++
      if (draft.collision.length >= params.maxBarriers) break
    }
    let uncovered = 0
    for (let i = 0; i < solid.length; i++) if (solid[i] && !covered[i]) uncovered++
    note(`${emitted} wall rects cover the rock (${uncovered} solid cell(s) uncovered)${uncovered ? ' — OVER BUDGET, reroll will judge' : ''}`)
  },
}

// ── floor: dressed stone; the deepest room goes to dirt (§G) ─────────────────
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
      // stamps carry their own interior margins; +1 keeps them off the room wall
      if (a.w < stamp.w + 1 || a.h < stamp.h + 1) return false
      if (draft.collision.length + stampBarrierCost(stamp) > params.maxBarriers) return false
      const at = {
        x: a.x + 0.5 + r.next() * (a.w - stamp.w - 1),
        y: a.y + 0.5 + r.next() * (a.h - stamp.h - 1),
      }
      placeStamp(draft, stamp, at, (params.seed ^ hashString(node.id)) >>> 0)
      used.add(node.id)
      placed.push(`${stamp.id}@${node.id}`)
      return true
    }

    // §D "dead-ends worth risking": the barred cell prefers a leaf room off
    // the critical path, falling back to any quiet non-entry/non-lair room
    // (a barred nook in a big chamber is just as donjon). Pillars favour the
    // deep middle; the shrine takes any leftover room.
    const offPath = nodes
      .filter((n) => n.id !== entry?.id && n.id !== lair?.id)
      .sort((a, b) => (degree.get(a.id) ?? 0) - (degree.get(b.id) ?? 0))
    for (const n of offPath) if (tryPlace(STAMP_REGISTRY['barred-cell'], n)) break
    // deep-middle rooms first; the lair itself is the fallback (a pillared
    // boss chamber is classic — cover for the fight, prize behind the boss)
    const mids = nodes
      .filter((n) => (n.depth ?? 0) >= 1)
      .sort((a, b) => (a.id === lair?.id ? 1 : 0) - (b.id === lair?.id ? 1 : 0) || (b.depth ?? 0) - (a.depth ?? 0))
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
  description: 'Graph-first, donjon-flavored dungeon: scattered polymorph rooms → cyclic corridor graph → errant corridors + dead-end stubs → maximal-rect wall cover → stamps → depth-graded debris → lair.',
  passes: [layoutPass, carvePass, floorPass, stampsPass, scatterPass, semanticPass],
  // Free-form floors cost more rects (~30–60) than the old lattice — still
  // lab/encounter only until the pather perf pass (BACKLOG). Spawn sits in the
  // entry hall, so the apron is room-sized.
  defaults: { size: 48, maxBarriers: 72, spawnApron: 3.5, themes: ['dungeon'] },
}
