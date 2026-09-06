// The shared nav-graph layer (procedural-generation-architecture-plan.md L4 — the convergence point).
//
// Two producers, one model: dungeon/city AUTHOR the graph (their plan
// publishes nodes/edges, geometry realizes them); the overworld DERIVES it
// from geography (track B). Everything downstream — gates (gates.ts), depth
// gradients, stamps' placement heuristics, conditional reachability — reads
// the graph through these recipe-agnostic ops and never cares which
// philosophy produced it.
//
import type { NavEdge, NavNode, Pt } from './types'

export interface GraphEdgeLike { a: string; b: string }

// Graph distance from `entry` per node id — the §G depth gradient every
// recipe hangs lair placement, debris density, and (track D) intensity on.
export function bfsDepth(edges: GraphEdgeLike[], entry: string): Map<string, number> {
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

// ── deriveRegions — the DERIVED producer (track B) ───────────────────────────
// Segment a walkable mask into regions and publish the natural pinches between
// them as 'crossing' edges — the overworld's half of the L4 convergence layer
// (dungeon/city AUTHOR their graph; a field derives it from geography).
// Pure, deterministic, no RNG, O(cells):
//   1. clearance — multi-source BFS from every blocked cell AND the map border
//      (the arena edge blocks movement, so it erodes like a wall) → per-cell
//      grid distance to the nearest obstruction (blocked = 0, first open ring = 1);
//   2. erode — keep cells with clearance ≥ ceil(pinchWidth / 2): a corridor of
//      width w has max clearance ceil(w / 2), so corridors strictly narrower
//      than pinchWidth erode away and become pinch sites (cell quantization:
//      width-3 and width-4 corridors share a clearance of 2);
//   3. label the eroded mask (4-neighbour, scanline order — component ids by
//      first-encountered cell); components under minRegionCells are dropped
//      (their cells are absorbed by the claim below, not published as nodes);
//   4. claim every walkable cell for its nearest surviving region via
//      multi-source BFS — seeds enqueued in (region id, scanline) order, so at
//      equal distance the lower region id wins, deterministically;
//   5. edges — 4-adjacent claimed cells of two different regions are boundary
//      cells; per region pair they are clustered by 8-adjacency and each
//      contiguous cluster becomes ONE edge (two separate fords between the
//      same two regions = two edges). doorAt = the cluster's minimum-clearance
//      cell (tie: scanline). Kind is always 'crossing' — the natural pinch.
// Nodes: id `region-<n>` in label order; at = the region's max-clearance
// eroded cell (tie: scanline); area = bbox of the region's ERODED cells (the
// heartland, not every claimed cell); depth left unset — the producing recipe
// roots it via bfsDepth from its spawn region.
// Edges are physically real BY CONSTRUCTION (they only arise between walkably
// adjacent cells); the `graph-truthful` validation rule re-proves it on the
// baked spec.

export interface DeriveRegionsOpts {
  // A pinch is a corridor strictly narrower than this many cells (default 3:
  // 1- and 2-wide gaps pinch; a 3-wide ford is comfortably passable).
  pinchWidth?: number
  // Eroded components smaller than this are dropped and absorbed (default 12).
  minRegionCells?: number
}

export interface DerivedRegions {
  nodes: NavNode[]
  edges: NavEdge[]
  // Region index per cell (row-major), -1 = blocked or unclaimed (a walkable
  // pocket disconnected from every surviving region). Callers use this to
  // locate the region containing a point (depth root, POI → node linking).
  claims: Int32Array
}

export function deriveRegions(
  walk: Uint8Array, cols: number, rows: number, opts: DeriveRegionsOpts = {},
): DerivedRegions {
  const pinchWidth = opts.pinchWidth ?? 3
  const minRegionCells = opts.minRegionCells ?? 12
  const n = cols * rows
  const claims = new Int32Array(n).fill(-1)

  // 1. clearance — FIFO BFS; level-0 seeds (blocked) enqueued before the
  // level-1 border seeds keeps the wavefront monotone.
  const clearance = new Int32Array(n).fill(-1)
  const bq: number[] = []
  for (let i = 0; i < n; i++) if (!walk[i]) { clearance[i] = 0; bq.push(i) }
  const seedBorder = (i: number) => { if (clearance[i] === -1) { clearance[i] = 1; bq.push(i) } }
  for (let x = 0; x < cols; x++) { seedBorder(x); seedBorder((rows - 1) * cols + x) }
  for (let y = 0; y < rows; y++) { seedBorder(y * cols); seedBorder(y * cols + cols - 1) }
  for (let head = 0; head < bq.length; head++) {
    const i = bq[head]
    const x = i % cols, y = (i / cols) | 0
    const d = clearance[i] + 1
    if (x + 1 < cols && clearance[i + 1] === -1) { clearance[i + 1] = d; bq.push(i + 1) }
    if (x > 0 && clearance[i - 1] === -1) { clearance[i - 1] = d; bq.push(i - 1) }
    if (y + 1 < rows && clearance[i + cols] === -1) { clearance[i + cols] = d; bq.push(i + cols) }
    if (y > 0 && clearance[i - cols] === -1) { clearance[i - cols] = d; bq.push(i - cols) }
  }

  // 2–3. eroded components (scanline discovery, 4-neighbour floods).
  const threshold = Math.max(1, Math.ceil(pinchWidth / 2))
  const label = new Int32Array(n).fill(-1)
  const compSize: number[] = []
  for (let i0 = 0; i0 < n; i0++) {
    if (clearance[i0] < threshold || label[i0] !== -1) continue
    const comp = compSize.length
    label[i0] = comp
    const q = [i0]
    for (let head = 0; head < q.length; head++) {
      const i = q[head]
      const x = i % cols, y = (i / cols) | 0
      for (const j of [
        x + 1 < cols ? i + 1 : -1, x > 0 ? i - 1 : -1,
        y + 1 < rows ? i + cols : -1, y > 0 ? i - cols : -1,
      ]) {
        if (j >= 0 && clearance[j] >= threshold && label[j] === -1) { label[j] = comp; q.push(j) }
      }
    }
    compSize.push(q.length)
  }
  let regionCount = 0
  const regionOf = compSize.map((s) => (s >= minRegionCells ? regionCount++ : -1))
  if (regionCount === 0) return { nodes: [], edges: [], claims }

  // 4. claim — seeds gathered per region in scanline order (label ids are
  // scanline-ordered too), enqueued region 0 first: the documented tie-break.
  const seeds: number[][] = Array.from({ length: regionCount }, () => [])
  for (let i = 0; i < n; i++) {
    const c = label[i]
    if (c >= 0 && regionOf[c] >= 0) seeds[regionOf[c]].push(i)
  }
  const cq: number[] = []
  for (let r = 0; r < regionCount; r++) for (const i of seeds[r]) { claims[i] = r; cq.push(i) }
  for (let head = 0; head < cq.length; head++) {
    const i = cq[head]
    const x = i % cols, y = (i / cols) | 0, r = claims[i]
    for (const j of [
      x + 1 < cols ? i + 1 : -1, x > 0 ? i - 1 : -1,
      y + 1 < rows ? i + cols : -1, y > 0 ? i - cols : -1,
    ]) {
      if (j >= 0 && walk[j] && claims[j] === -1) { claims[j] = r; cq.push(j) }
    }
  }

  // 5. nodes — anchor at the max-clearance eroded cell (strict >, so the
  // scanline-first cell wins ties); area = the eroded heartland's bbox.
  const nodes: NavNode[] = seeds.map((cells, r) => {
    let bestI = cells[0], bestC = -1
    let x0 = cols, y0 = rows, x1 = 0, y1 = 0
    for (const i of cells) {
      if (clearance[i] > bestC) { bestC = clearance[i]; bestI = i }
      const x = i % cols, y = (i / cols) | 0
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    return {
      id: `region-${r}`,
      at: { x: (bestI % cols) + 0.5, y: ((bestI / cols) | 0) + 0.5 },
      area: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    }
  })

  // 6. edges — boundary cells per region pair, clustered into pinch corridors.
  const pairCells = new Map<string, Set<number>>()
  for (let i = 0; i < n; i++) {
    const a = claims[i]
    if (a < 0) continue
    const x = i % cols
    for (const j of [x + 1 < cols ? i + 1 : -1, i + cols < n ? i + cols : -1]) {
      if (j < 0) continue
      const b = claims[j]
      if (b < 0 || b === a) continue
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      let set = pairCells.get(key)
      if (!set) { set = new Set(); pairCells.set(key, set) }
      set.add(i)
      set.add(j)
    }
  }
  const edges: NavEdge[] = []
  for (const [key, set] of pairCells) {
    const [ra, rb] = key.split(':').map(Number)
    const cells = [...set].sort((p, q) => p - q)
    const seen = new Set<number>()
    for (const start of cells) {
      if (seen.has(start)) continue
      // one 8-connected boundary cluster = one pinch corridor = one edge
      const cluster = [start]
      seen.add(start)
      for (let head = 0; head < cluster.length; head++) {
        const i = cluster[head]
        const x = i % cols, y = (i / cols) | 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const j = ny * cols + nx
            if (set.has(j) && !seen.has(j)) { seen.add(j); cluster.push(j) }
          }
        }
      }
      let door = cluster[0]
      for (const i of [...cluster].sort((p, q) => p - q)) {
        if (clearance[i] < clearance[door]) door = i
      }
      edges.push({
        a: `region-${ra}`, b: `region-${rb}`, kind: 'crossing',
        doorAt: { x: (door % cols) + 0.5, y: ((door / cols) | 0) + 0.5 },
      })
    }
  }

  return { nodes, edges, claims }
}

// ── flowField + digestIntensity — the L6 flow plane and its digest (track D) ─
// Cell-resolution BFS distance from a root cell over a walk mask (4-neighbour
// FIFO — exact grid distance; pure, RNG-free, O(cells)). Recipes root it at
// the SPAWN, so distance = remoteness, park the raw plane in draft.scratch
// ('flow' — never baked, decision 4), and digest it onto the published nav
// nodes as `intensity`. KIT-INVARIANCE contract: callers hand this the
// AS-IF-OPEN walk mask (rasterized before any gate plug exists — the field's
// scratch 'walk', the dungeon's plan.walk), so the same seed publishes
// byte-identical intensities under every proficiency kit; sealed-off regions
// still get well-defined values.
// dist: -1 = blocked or unreachable; max: largest distance seen, or -1 when
// the root cell itself is blocked (callers should note + skip the digest).
export interface FlowField { dist: Int32Array; max: number }

export function flowField(walk: Uint8Array, cols: number, rows: number, root: Pt): FlowField {
  const dist = new Int32Array(cols * rows).fill(-1)
  const rx = Math.min(cols - 1, Math.max(0, Math.floor(root.x)))
  const ry = Math.min(rows - 1, Math.max(0, Math.floor(root.y)))
  const start = ry * cols + rx
  if (!walk[start]) return { dist, max: -1 }
  dist[start] = 0
  let max = 0
  const q = [start]
  for (let head = 0; head < q.length; head++) {
    const i = q[head]
    const x = i % cols, y = (i / cols) | 0
    const d = dist[i] + 1
    for (const j of [
      x + 1 < cols ? i + 1 : -1, x > 0 ? i - 1 : -1,
      y + 1 < rows ? i + cols : -1, y > 0 ? i - cols : -1,
    ]) {
      if (j >= 0 && walk[j] && dist[j] === -1) {
        dist[j] = d
        if (d > max) max = d
        q.push(j)
      }
    }
  }
  return { dist, max }
}

// THE DIGEST (the only part that reaches the baked spec):
//   intensity = round₃( anchor-cell BFS distance ÷ map max cell distance )
// — normalized per-map to [0,1], rounded to 3 decimals (byte-stable specs).
// An anchor unreachable from the root on the as-if-open mask (a fully
// disconnected pocket) pins to 0 — NEUTRAL, not maximal. intensity is a
// spawn/reward PACING dial (decision 4), and its store consumer weights spawn
// density UP with the value; a walled-off pocket is off-map, not deep, so
// treating it as maximally remote would concentrate spawns onto ground the
// party can never reach (review finding — latent, 0 observed today because
// the reachable/graph-truthful rules incidentally reject such pockets, but
// pin defensively so nothing structurally depends on that). A degenerate
// field (max 0) publishes all-0. Iterates the nodes array in order (no
// Map/Set order dependence). Returns the unreachable-anchor count for the
// caller's note().
export function digestIntensity(
  nodes: NavNode[], flow: FlowField, cols: number, rows: number,
): { unreachable: number } {
  let unreachable = 0
  for (const nd of nodes) {
    const xi = Math.min(cols - 1, Math.max(0, Math.floor(nd.at.x)))
    const yi = Math.min(rows - 1, Math.max(0, Math.floor(nd.at.y)))
    const d = flow.dist[yi * cols + xi]
    if (d < 0) { nd.intensity = 0; unreachable++ }
    else nd.intensity = flow.max > 0 ? Math.round((d / flow.max) * 1000) / 1000 : 0
  }
  return { unreachable }
}

// Edge count per node id. Degree 1 = a dead end (gate/vault candidate);
// high degree = a hub (landmark/stamp candidate).
export function nodeDegrees(edges: GraphEdgeLike[]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }
  return degree
}
