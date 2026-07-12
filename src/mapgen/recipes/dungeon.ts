// The DUNGEON recipe — graph-first (idea catalog §D, prototyping-order step 5),
// donjon-flavored (donjon.bin.sh: Scattered room layout, Small→Colossal size
// spread, "polymorph" irregular rooms, Errant corridors, kept dead-ends).
//
// The plan comes BEFORE the geometry: `layout` free-places rooms of wildly
// varied size and shape on the cell grid, then builds the graph CYCLE-FIRST
// (Unexplored-style, architecture plan track E): the primary cycle is the
// DESIGNED skeleton — entry → goal (the farthest room) along two node-disjoint
// arcs — every remaining room hangs off it as a tree leaf, and an optional
// chord adds a second loop. Rewrite steps then operate ON the cycle (the
// `shortcut` pass gates one mid-arc edge). ⭐4's loops-not-trees is thus a
// guarantee, not an accident: ≥3 rooms ⇒ edges ≥ nodes by construction.
// Corridors carve winding door-to-door between the chained rooms; only then
// does `carve` realize the negative space as wall rects (greedy
// maximal-rectangle cover of the solid mask), so floor shape is FREE-FORM —
// L/T composites, closets, long halls, cave-notched edges — while collision
// stays rects forever. Stamps (§I) drop authored set pieces into rooms under
// budget; depth is graph distance from the entry (§G), the lair sits at max
// depth, and the goal anchors the cycle's far end.
//
// NOT live on any location yet: a dungeon spends ~30–60 rects against the
// live pathing envelope of 40 (raised from 16 by the 2026-07 pather perf
// pass). A lean floor now fits; the full 72 budget is still lab/encounter
// territory (BACKLOG → Procedural map generation, cross-cutting debts).

import type { Pt, Rect } from '../types'
import type { PassCtx, RecipeDef } from '../pipeline'
import { addBarrier, addPoi, isPlaceable, paint } from '../draft'
import { hashString } from '../rng'
import { bfsDepth, nodeDegrees } from '../graph'
import { GATE_TAGS, placeProficiencyLock, placeShortcutLock } from '../gates'
import { tacticalProfile } from '../profile'
import { premisePass } from '../naming'
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
// The layout plan — an L6 derived plane (procedural-generation-architecture-plan.md): produced by
// `layout`, consumed by `carve`, `gates`, and `shortcut` via draft.scratch['plan'].
// `arc` records each edge's role in the cycle-first skeleton: 'A'/'B' = the
// primary cycle's two arcs (the rewrite substrate), 'chord' = the optional
// second loop, 'leaf' = tree-attached fringe (the dead-end candidates).
interface Plan {
  walk: Uint8Array
  rooms: Room[]
  edges: { a: string; b: string; doorAt?: Pt; arc: 'A' | 'B' | 'chord' | 'leaf' }[]
  corridorCells: number[]
  entryId: string
  goalId: string
}
const getPlan = (draft: PassCtx['draft']) => draft.scratch.get('plan') as Plan | undefined

const idx = (size: number, x: number, y: number) => y * size + x
const center = (r: Rect): Pt => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })

function carveRect(walk: Uint8Array, size: number, r: Rect) {
  const x0 = Math.max(MARGIN, Math.floor(r.x)), x1 = Math.min(size - MARGIN, Math.ceil(r.x + r.w))
  const y0 = Math.max(MARGIN, Math.floor(r.y)), y1 = Math.min(size - MARGIN, Math.ceil(r.y + r.h))
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) walk[idx(size, x, y)] = 1
}

// ── layout: scattered polymorph rooms + cycle-first skeleton + corridors ─────
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

    // Graph: CYCLE-AS-PRIMITIVE (Unexplored-style; architecture plan track E).
    // The primary cycle is the designed skeleton: entry → GOAL (the farthest
    // room — max graph depth lands there naturally) along two node-disjoint
    // arcs, split by which side of the entry→goal axis each room's centre
    // falls on and chained in axis-projection order. Rooms that would make a
    // degenerate arc (behind the entry, past the goal, far off the axis) hang
    // off the cycle as tree leaves instead — the dead-end fringe the vault
    // gates pass needs. One optional chord (~0.4) adds a second loop.
    // ≥3 rooms ⇒ ≥1 cycle by construction: connected AND edges ≥ nodes.
    const g = rng('graph')
    const edges: Plan['edges'] = []
    const entryId = rooms.length ? rooms[0].id : ''
    let goalId = ''
    let arcSizes: [number, number] = [0, 0]
    let chorded = false
    let leafCount = 0
    if (rooms.length >= 2) {
      const eC = center(rooms[0].primary)
      // farthest room from the entry (Euclidean; strictly-greater keeps the
      // first max — deterministic tie-break by room index)
      let goalIdx = 1, goalD = -1
      for (let i = 1; i < rooms.length; i++) {
        const c = center(rooms[i].primary)
        const d = Math.hypot(c.x - eC.x, c.y - eC.y)
        if (d > goalD) { goalD = d; goalIdx = i }
      }
      goalId = rooms[goalIdx].id
      const gC = center(rooms[goalIdx].primary)
      const ax = gC.x - eC.x, ay = gC.y - eC.y
      const axisLen = Math.hypot(ax, ay) || 1
      type ArcRoom = { i: number; t: number }
      const arcA: ArcRoom[] = [], arcB: ArcRoom[] = []
      const leftover: number[] = []
      for (let i = 1; i < rooms.length; i++) {
        if (i === goalIdx) continue
        const c = center(rooms[i].primary)
        const t = ((c.x - eC.x) * ax + (c.y - eC.y) * ay) / (axisLen * axisLen)
        const cross = ax * (c.y - eC.y) - ay * (c.x - eC.x)
        const perp = Math.abs(cross) / axisLen
        // degenerate-arc filter: keep arcs reasonable — a room behind the
        // entry, past the goal, or far off the axis would be a huge detour
        if (t <= 0.02 || t >= 0.98 || perp > axisLen * 0.4) { leftover.push(i); continue }
        ;(cross >= 0 ? arcA : arcB).push({ i, t })
      }
      // A cycle needs ≥1 intermediate room (two parallel entry→goal edges
      // would be one corridor, not a loop): if both arcs came up empty but
      // other rooms exist, promote the one nearest the axis midpoint.
      if (!arcA.length && !arcB.length && leftover.length) {
        const mid = { x: eC.x + ax / 2, y: eC.y + ay / 2 }
        let best = 0, bestD = Infinity
        for (let k = 0; k < leftover.length; k++) {
          const c = center(rooms[leftover[k]].primary)
          const d = Math.hypot(c.x - mid.x, c.y - mid.y)
          if (d < bestD) { bestD = d; best = k }
        }
        arcA.push({ i: leftover[best], t: 0.5 })
        leftover.splice(best, 1)
      }
      const byT = (p: ArcRoom, q: ArcRoom) => p.t - q.t || p.i - q.i
      arcA.sort(byT); arcB.sort(byT)
      arcSizes = [arcA.length, arcB.length]
      // chain entry → side rooms (projection order) → goal; an empty side
      // still contributes its direct entry→goal edge so the cycle survives
      const chain = (arc: ArcRoom[], tag: 'A' | 'B') => {
        let prev = 0
        for (const { i } of arc) { edges.push({ a: rooms[prev].id, b: rooms[i].id, arc: tag }); prev = i }
        edges.push({ a: rooms[prev].id, b: rooms[goalIdx].id, arc: tag })
      }
      if (arcA.length || arcB.length) { chain(arcA, 'A'); chain(arcB, 'B') }
      else edges.push({ a: entryId, b: goalId, arc: 'A' })   // 2-room floor: a bare link, no cycle possible

      // one optional chord between two non-adjacent cycle nodes — a second
      // loop, picked among the closest pairs so it stays a lane, not a
      // map-crossing highway
      const cycleIdx = [0, ...arcA.map((q) => q.i), goalIdx, ...arcB.map((q) => q.i)]
      if ((arcA.length || arcB.length) && g.chance(0.4)) {
        const linked = new Set(edges.map((e) => `${e.a}|${e.b}`))
        const pairs: { a: number; b: number; d: number }[] = []
        for (let p = 0; p < cycleIdx.length; p++) {
          for (let q = p + 1; q < cycleIdx.length; q++) {
            const A = rooms[cycleIdx[p]], B = rooms[cycleIdx[q]]
            if (linked.has(`${A.id}|${B.id}`) || linked.has(`${B.id}|${A.id}`)) continue
            const cA = center(A.primary), cB = center(B.primary)
            pairs.push({ a: cycleIdx[p], b: cycleIdx[q], d: Math.hypot(cA.x - cB.x, cA.y - cB.y) })
          }
        }
        pairs.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b)
        if (pairs.length) {
          const c = g.pick(pairs.slice(0, Math.min(3, pairs.length)))
          edges.push({ a: rooms[c.a].id, b: rooms[c.b].id, arc: 'chord' })
          chorded = true
        }
      }

      // every remaining room hangs off the nearest already-connected room
      // (deterministic order: ascending room index; strictly-less keeps the
      // earliest-connected on ties) — the tree fringe that keeps dead-ends
      const connected = [...cycleIdx]
      for (const i of leftover) {
        const c = center(rooms[i].primary)
        let near = connected[0], nearD = Infinity
        for (const j of connected) {
          const cj = center(rooms[j].primary)
          const d = Math.hypot(cj.x - c.x, cj.y - c.y)
          if (d < nearD) { nearD = d; near = j }
        }
        edges.push({ a: rooms[near].id, b: rooms[i].id, arc: 'leaf' })
        connected.push(i)
        leafCount++
      }
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
    note(`${rooms.length} rooms (${rooms.filter((q) => q.rects.length > 1).length} polymorph), ${edges.length} corridors: cycle of ${2 + arcSizes[0] + arcSizes[1]} (arcs ${arcSizes[0]}+${arcSizes[1]}${chorded ? ', +1 chord' : ''}), ${leafCount} leaf room(s), ${stubs} stub(s)`)

    // Spawn in the entry hall FIRST (isPlaceable apron guards it from here on).
    const entry = rooms[0]
    addPoi(draft, { id: 'spawn', kind: 'spawn', at: center(entry.primary), tags: ['entry'] })

    // Publish the plan on the nav skeleton (function-first: geometry realizes THIS).
    const depth = bfsDepth(edges, entry.id)
    draft.semantic.nav.nodes = rooms.map((q) => ({
      id: q.id, at: center(q.primary), area: q.primary, depth: depth.get(q.id) ?? 0,
    }))
    draft.semantic.nav.edges = edges.map((e) => ({ a: e.a, b: e.b, kind: 'corridor' as const, doorAt: e.doorAt }))
    draft.scratch.set('plan', { walk, rooms, edges, corridorCells, entryId, goalId } satisfies Plan)
  },
}

// ── carve: cover the SOLID mask with few fat rects (maximal-rect greedy) ─────
// Free-form floor, rects-forever collision: repeatedly take the largest
// uncovered-solid rectangle (max-area-under-histogram), then grow it over any
// solid cells (covered or not) so neighbours merge instead of tiling. Exact:
// loops until every solid cell is covered — a stray gap would be walkable rock.
const carvePass = {
  id: 'carve',
  run({ draft, params, note }: PassCtx) {
    const plan = getPlan(draft)
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
    const degree = nodeDegrees(draft.semantic.nav.edges)
    const entry = nodes.find((n) => (n.depth ?? 0) === 0)
    const lair = [...nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0]
    const r = rng('place')
    const placed: string[] = []
    const used = new Set<string>()

    const tryPlace = (stamp: StampDef, node: (typeof nodes)[number]) => {
      const a = node.area
      if (!a || used.has(node.id)) return false
      // a room that already carries POIs is claimed (a gate's prize, another
      // stamp) — stamping it would strand non-exempt prizes behind a seal
      if (draft.semantic.pois.some((p) => p.at.x > a.x && p.at.x < a.x + a.w && p.at.y > a.y && p.at.y < a.y + a.h)) return false
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

// ── gates: proficiency locks — the §F composition gate, resolved at bake ─────
// The RECIPE's share of lock-and-key (candidate choice + seal proof): find a
// seal-tight dead-end room off the critical path, pick a tag, then hand the
// emit to the shared L5 machinery (gates.ts placeProficiencyLock — the same
// call an overworld ford gate will make). Function-first, theme-late: the
// tag→concrete look table lives in gates.ts.
//
// FEEL WARNING (see CLAUDE.md → phase 4): frequency, placement, and reward
// weight here are first guesses — mechanics are gated by the validator, but
// whether a gate is FUN needs human play. Iterate via the lab's party toggles.
const gatesPass = {
  id: 'gates',
  run({ draft, params, rng, note }: PassCtx) {
    const nodes = draft.semantic.nav.nodes
    const edges = draft.semantic.nav.edges
    const degree = nodeDegrees(edges)
    const entry = nodes.find((n) => (n.depth ?? 0) === 0)
    const lair = [...nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0]
    // Candidates: dead-end rooms off the critical path with a known door pinch
    // and NO existing POIs inside (gating a stamped room would strand its
    // non-exempt prizes — the validator would catch it, but why waste rerolls).
    const hasPoiInside = (a: NonNullable<(typeof nodes)[number]['area']>) =>
      draft.semantic.pois.some((p) => p.at.x > a.x && p.at.x < a.x + a.w && p.at.y > a.y && p.at.y < a.y + a.h)
    // (polymorph lobes and through-corridors can route around a door plug —
    // the sealTight mask check below vets each candidate exactly, so no shape
    // pre-filter is needed)
    const plan = getPlan(draft)
    const cands = nodes
      .filter((n) =>
        degree.get(n.id) === 1 && n.id !== entry?.id && n.id !== lair?.id &&
        n.area && !hasPoiInside(n.area) &&
        // closets get swallowed whole by the 4.5-cell seal plug (prize AND
        // approach vanish into it) — gate rooms with some depth behind the door
        Math.min(n.area.w, n.area.h) >= 5)
      .map((n) => ({ n, edge: edges.find((e) => (e.a === n.id || e.b === n.id) && e.doorAt) }))
      .filter((c): c is { n: (typeof nodes)[number]; edge: (typeof edges)[number] } => !!c.edge)
    if (!cands.length) { note('no gateable dead-end — no locks this floor'); return }
    if (draft.collision.length >= params.maxBarriers) { note('no barrier budget left — no locks this floor'); return }

    // Seal-tightness, proven on the walk mask BEFORE committing: flood from
    // the spawn with the plug cells removed — if the prize cell is still
    // reached, something else leaks into this room (a through-corridor that
    // clipped it, a merged stub) and it is not gateable. Candidates that fail
    // are skipped, not rerolled — cheap and exact at plan level.
    const sealTight = (c: (typeof cands)[number]): boolean => {
      if (!plan) return false
      const { size } = params
      const at = c.edge.doorAt!
      const spawnPoi = draft.semantic.pois.find((p) => p.kind === 'spawn')!
      const start = Math.floor(spawnPoi.at.y) * size + Math.floor(spawnPoi.at.x)
      const seen = new Uint8Array(size * size)
      const passable = (x: number, y: number) =>
        plan.walk[y * size + x] === 1 && !(Math.abs(x + 0.5 - at.x) < 2.25 && Math.abs(y + 0.5 - at.y) < 2.25)
      if (!passable(start % size, Math.floor(start / size))) return false
      const stack = [start]
      seen[start] = 1
      while (stack.length) {
        const i = stack.pop()!
        const x = i % size, y = (i / size) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const j = ny * size + nx
          if (!seen[j] && passable(nx, ny)) { seen[j] = 1; stack.push(j) }
        }
      }
      return !seen[Math.floor(c.n.at.y) * size + Math.floor(c.n.at.x)]
    }

    const r = rng('place')
    const start = r.int(cands.length)
    let c: (typeof cands)[number] | null = null
    for (let i = 0; i < cands.length; i++) {
      const probe = cands[(start + i) % cands.length]
      if (sealTight(probe)) { c = probe; break }
    }
    if (!c) { note(`${cands.length} dead-end candidate(s), none seal-tight (through-corridors leak) — no locks this floor`); return }
    const tag = r.pick(GATE_TAGS)
    const at = c.edge.doorAt!
    const { id, open } = placeProficiencyLock(draft, { tag, at, prizeAt: c.n.at })
    c.edge.lockId = id
    note(`${tag} gate ${open ? 'OPEN (party kit)' : 'sealed'} on ${c.n.id} at ${at.x},${at.y}`)
  },
}

// ── shortcut: the first cycle REWRITE step (architecture plan track E) ───────
// With the cycle guaranteed by layout, rewrite steps operate ON it: with ~0.5
// chance this pass plugs the doorAt of ONE mid-arc cycle edge (never an edge
// touching entry or goal) with a proficiency seal. Closed = the party takes
// the long way around the cycle; open = the shortcut works. It gates a ROUTE,
// not a prize (Lock.gates = []) — nothing is ever stranded: the long way is
// proven on the walk mask before committing (with every already-closed lock's
// plug also blocked), and the validator's `reachable` rule proves the bake.
const shortcutPass = {
  id: 'shortcut',
  run({ draft, params, rng, note }: PassCtx) {
    const plan = getPlan(draft)
    if (!plan) { note('no layout plan — skipped'); return }
    const r = rng('place')
    if (!r.chance(0.5)) { note('rewrite skipped (coin)'); return }
    if (draft.collision.length >= params.maxBarriers) { note('no barrier budget left — shortcut skipped'); return }
    const navEdges = draft.semantic.nav.edges
    // mid-arc cycle edges only — the cycle's first/last legs are the entry and
    // goal rooms' critical fan-out, never gated
    const cands = plan.edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => (e.arc === 'A' || e.arc === 'B') && e.doorAt &&
        e.a !== plan.entryId && e.b !== plan.entryId && e.a !== plan.goalId && e.b !== plan.goalId)
    if (!cands.length) { note('no mid-arc cycle edge — shortcut skipped'); return }

    // The long way must hold for EVERYTHING: flood the walk mask from the
    // spawn with this plug AND every already-closed lock's plug blocked, and
    // require every room centre outside sealed dead-ends to stay reached.
    const { size } = params
    const half = 2.25
    const closedPlugs = draft.semantic.locks.filter((l) => !l.open && l.at).map((l) => l.at!)
    const degree = nodeDegrees(navEdges)
    const sealedRooms = new Set<string>()
    for (const e of navEdges) {
      if (!e.lockId) continue
      const lock = draft.semantic.locks.find((l) => l.id === e.lockId)
      if (lock && !lock.open) sealedRooms.add(degree.get(e.a) === 1 ? e.a : e.b)
    }
    const spawnPoi = draft.semantic.pois.find((p) => p.kind === 'spawn')!
    const longWayHolds = (at: Pt): boolean => {
      const plugs = [...closedPlugs, at]
      const passable = (x: number, y: number) =>
        plan.walk[y * size + x] === 1 && !plugs.some((p) => Math.abs(x + 0.5 - p.x) < half && Math.abs(y + 0.5 - p.y) < half)
      const start = Math.floor(spawnPoi.at.y) * size + Math.floor(spawnPoi.at.x)
      if (!passable(start % size, Math.floor(start / size))) return false
      const seen = new Uint8Array(size * size)
      const stack = [start]
      seen[start] = 1
      while (stack.length) {
        const i = stack.pop()!
        const x = i % size, y = (i / size) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const j = ny * size + nx
          if (!seen[j] && passable(nx, ny)) { seen[j] = 1; stack.push(j) }
        }
      }
      return draft.semantic.nav.nodes.every((n) =>
        sealedRooms.has(n.id) || seen[Math.floor(n.at.y) * size + Math.floor(n.at.x)])
    }

    const start = r.int(cands.length)
    let choice: (typeof cands)[number] | null = null
    for (let k = 0; k < cands.length; k++) {
      const probe = cands[(start + k) % cands.length]
      if (longWayHolds(probe.e.doorAt!)) { choice = probe; break }
    }
    if (!choice) { note(`${cands.length} cycle edge candidate(s), none keeps the long way open — shortcut skipped`); return }
    const tag = r.pick(GATE_TAGS)
    const at = choice.e.doorAt!
    const { id, open } = placeShortcutLock(draft, { tag, at })
    navEdges[choice.i].lockId = id
    note(`${tag} shortcut ${open ? 'OPEN (party kit)' : 'sealed'} on ${choice.e.a}→${choice.e.b} at ${at.x},${at.y}`)
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
  description: 'Graph-first, donjon-flavored dungeon: scattered polymorph rooms → cycle-first skeleton (entry→goal twin arcs + leaf fringe) → errant corridors + dead-end stubs → maximal-rect wall cover → shortcut-lock rewrite → stamps → depth-graded debris → lair.',
  // gates + shortcut BEFORE stamps: locks are structure (they claim a
  // dead-end / a cycle edge and its door), stamps are dressing (they skip
  // rooms that already have POIs). gates before shortcut: the dead-end vault
  // keeps budget priority; the rewrite step only fires if budget remains.
  passes: [layoutPass, carvePass, floorPass, gatesPass, shortcutPass, stampsPass, scatterPass, semanticPass, premisePass],
  // Free-form floors cost more rects (~30–60) than the old lattice — still
  // lab/encounter only until the pather perf pass (BACKLOG). Spawn sits in the
  // entry hall, so the apron is room-sized.
  defaults: { size: 48, maxBarriers: 72, spawnApron: 3.5, themes: ['dungeon'] },
}
