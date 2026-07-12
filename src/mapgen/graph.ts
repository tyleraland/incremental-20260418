// The shared nav-graph layer (ARCHITECTURE.md L4 — the convergence point).
//
// Two producers, one model: dungeon/city AUTHOR the graph (their plan
// publishes nodes/edges, geometry realizes them); the overworld DERIVES it
// from geography (track B). Everything downstream — gates (gates.ts), depth
// gradients, stamps' placement heuristics, conditional reachability — reads
// the graph through these recipe-agnostic ops and never cares which
// philosophy produced it.
//
// TRACK B (the derived producer, not yet built) lands here as
//   deriveRegions(walkMask, size, minPinchWidth) → { nodes, edges }
// distance-transform the walkable mask → erode by the pinch threshold →
// connected components = regions (nodes) → boundary corridors between two
// regions = edges, narrowest cell = the pinch (doorAt). Pure, deterministic,
// O(cells). Ships together with a `graph-truthful` validation rule
// (flood-fill agrees with every published edge).

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
