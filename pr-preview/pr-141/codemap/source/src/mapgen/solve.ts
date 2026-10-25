// Spec-level pathing + lock-flow solvability (procedural-generation-architecture-plan.md L5/L9).
//
// Pure, deterministic, RNG-free. Two tiers:
//   1. the shared OCCUPANCY MODEL — occupancyGrid (PAD-inflated rasterizer) +
//      floodOpen: the one pathing reality the validator, the recipes' derived
//      walk masks, and the solver all agree on (never two models);
//   2. solveLockFlow — the fixpoint solver over a baked-or-draft spec: flood
//      from the spawn with every closed lock's plug in place, collect reached
//      'key' POIs, open their locks (plugs identified by CollisionRect.lockId
//      and removed), re-flood; iterate to fixpoint. Chains resolve naturally
//      (a key behind another key-lock is fine); a circular dependency — or a
//      key sealed behind its own lock — reports as blocked.
//
// This is the flow seam future layers consume: multi-link chain placement,
// discovery clues, the planning AI's fetch-route, and the cross-map manifest
// (track G) all read "which locks open, in what order" from here. It reasons
// over spec-level data only (collision + semantic planes) — no store, engine,
// or recipe knowledge.

import type { CollisionRect, Lock, NavEdge, NavNode, Poi, Pt } from './types'
import { routeOver } from './graph'

// Matches the engine's UNIT_PAD feel: a cell is blocked if its centre sits
// inside a pad-inflated rect. Coarse (cell-resolution) on purpose — this layer
// answers "is the map traversable", not "is this pixel free".
const PAD = 0.45

// The shared PAD-inflated rasterizer: producers of DERIVED planes (the field
// recipe's 'walk' scratch mask feeding deriveRegions) and the validator flood
// the exact same pathing reality — one occupancy model, never two.
export function occupancyGrid(
  collision: readonly { x: number; y: number; w: number; h: number }[],
  cols: number, rows: number,
): Uint8Array {
  const g = new Uint8Array(cols * rows)
  for (const r of collision) {
    const x0 = Math.max(0, Math.floor(r.x - PAD)), x1 = Math.min(cols - 1, Math.ceil(r.x + r.w + PAD))
    const y0 = Math.max(0, Math.floor(r.y - PAD)), y1 = Math.min(rows - 1, Math.ceil(r.y + r.h + PAD))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5, cy = y + 0.5
        if (cx > r.x - PAD && cx < r.x + r.w + PAD && cy > r.y - PAD && cy < r.y + r.h + PAD) {
          g[y * cols + x] = 1
        }
      }
    }
  }
  return g
}

// Flood-fill of open cells from `start` (floor/clamp); returns the visited
// mask (0/1). All zeros when the start cell itself is blocked.
export function floodOpen(blocked: Uint8Array, cols: number, rows: number, start: Pt): Uint8Array {
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

// Structural input — MapSpec and MapDraft both satisfy it, so the solver runs
// on a baked spec or mid-pipeline.
export interface LockFlowInput {
  cols: number
  rows: number
  collision: readonly CollisionRect[]
  // nav is optional so mid-pipeline drafts and stub graphs still solve; when
  // present, planLockFlow can route the fetch chain over it
  semantic: {
    pois: readonly Poi[]
    locks: readonly Lock[]
    nav?: { nodes: readonly NavNode[]; edges: readonly NavEdge[] }
  }
}

export interface LockFlow {
  // closed key-locks in the order their keys come into reach (chain order)
  order: string[]
  // every lock that is open or provably openable (locks-array order)
  openable: string[]
  // closed 'key' locks whose key can never be reached — deadlocked
  blocked: string[]
}

export function solveLockFlow(input: LockFlowInput): LockFlow {
  const { cols, rows } = input
  const locks = input.semantic.locks
  // already-open locks left no plug geometry; seed the fixpoint with them
  const opened = new Set(locks.filter((l) => l.open).map((l) => l.id))
  const order: string[] = []
  const keyPois = input.semantic.pois.filter((p) => p.kind === 'key')
  const lockOf = (p: Poi) => p.tags.find((t) => t.startsWith('opens:'))?.slice(6)
  const lockIds = new Set(locks.map((l) => l.id))
  const spawn = input.semantic.pois.find((p) => p.kind === 'spawn')
  if (spawn && keyPois.length) {
    for (let progress = true; progress; ) {
      progress = false
      const blocked = occupancyGrid(input.collision.filter((r) => !r.lockId || !opened.has(r.lockId)), cols, rows)
      const seen = floodOpen(blocked, cols, rows, spawn.at)
      for (const p of keyPois) {
        const id = lockOf(p)
        // a dangling opens:<id> naming no lock is inert — it must not enter
        // `order` or burn a re-flood round
        if (!id || !lockIds.has(id) || opened.has(id)) continue
        const xi = Math.min(cols - 1, Math.max(0, Math.floor(p.at.x)))
        const yi = Math.min(rows - 1, Math.max(0, Math.floor(p.at.y)))
        if (!seen[yi * cols + xi]) continue
        opened.add(id)
        order.push(id)
        progress = true
      }
    }
  }
  return {
    order,
    openable: locks.filter((l) => opened.has(l.id)).map((l) => l.id),
    blocked: locks.filter((l) => l.kind === 'key' && !opened.has(l.id)).map((l) => l.id),
  }
}

// ── plan emission — the planning/routing seam ────────────────────────────────
// One objective step per openable key lock, in acquisition order: "fetch the
// key at keyAt, open the gate at gateAt, loot prizeAt". Positions come from
// the POIs; keyNode/gateNode anchor them onto the nav graph; route is the
// entry→key→gate node path via routeOver, walked with the keys the PREVIOUS
// steps already acquired (so a chained step legally crosses the lock the step
// before it opened). Blocked locks emit no step. This is what the phase-6
// planners consume — the store's fetch loop, the objective-channel AI, the
// engine's waypoint team plans — instead of re-deriving the fixpoint.

export interface LockFlowStep {
  lockId: string
  keyAt: Pt
  gateAt?: Pt
  prizeAt?: Pt
  keyNode?: string
  gateNode?: string
  route?: string[]   // undefined when the graph can't anchor or route it (stub navs)
}

// Nearest nav anchor to a point: a node whose `area` contains it wins, else
// nearest anchor; ties break to array order (deterministic — spec order).
function nearestNode(nodes: readonly NavNode[], p: Pt): NavNode | undefined {
  let best: NavNode | undefined
  let bestD = Infinity
  let bestContained = false
  for (const n of nodes) {
    const a = n.area
    const contains = !!a && p.x >= a.x && p.x < a.x + a.w && p.y >= a.y && p.y < a.y + a.h
    if (bestContained && !contains) continue
    const d = (n.at.x - p.x) ** 2 + (n.at.y - p.y) ** 2
    if ((contains && !bestContained) || d < bestD) { best = n; bestD = d; bestContained = bestContained || contains }
  }
  return best
}

export function planLockFlow(input: LockFlowInput): LockFlow & { steps: LockFlowStep[] } {
  const flow = solveLockFlow(input)
  const { pois, locks } = input.semantic
  const nodes = input.semantic.nav?.nodes ?? []
  const edges = [...(input.semantic.nav?.edges ?? [])]
  const spawn = pois.find((p) => p.kind === 'spawn')
  const entry = spawn && nearestNode(nodes, spawn.at)
  const held = new Set(locks.filter((l) => l.open).map((l) => l.id))
  const steps: LockFlowStep[] = []
  for (const id of flow.order) {
    const lock = locks.find((l) => l.id === id)!
    const keyPoi = pois.find((p) => p.kind === 'key' && p.tags.includes(`opens:${id}`))!
    const prize = pois.find((p) => p.kind === 'vault' && p.tags.includes(`locked:${id}`))
    const keyNode = nearestNode(nodes, keyPoi.at)
    const gateNode = lock.at && nearestNode(nodes, lock.at)
    let route: string[] | undefined
    if (entry && keyNode && gateNode) {
      const fetchLeg = routeOver(edges, entry.id, keyNode.id, held)
      const openLeg = routeOver(edges, keyNode.id, gateNode.id, new Set([...held, id]))
      if (fetchLeg && openLeg) route = [...fetchLeg, ...openLeg.slice(1)]
    }
    held.add(id)
    steps.push({
      lockId: id, keyAt: keyPoi.at, gateAt: lock.at, prizeAt: prize?.at,
      keyNode: keyNode?.id, gateNode: gateNode?.id, route,
    })
  }
  return { ...flow, steps }
}
