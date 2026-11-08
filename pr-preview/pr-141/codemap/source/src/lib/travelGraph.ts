// §travel: routing over the location graph. `Location.connections` are the edges
// (each realized on the field as a portal, see locations.ts); this finds a path
// across them so a hero can walk map→map→…→destination through intermediate
// nodes. Pure and game-state-free: pass the locations in.
//
// Phase 3 uses an unweighted BFS (shortest hop count). A weighted Dijkstra —
// for "discouraged" maps that should raise a node's cost — is a later slice
// (the `weight` hook is here so the call sites don't have to change).
import type { Location } from '@/types'

// Shortest route from `from` to `to` as an inclusive list of location ids
// [from, …, to], or null if they're not connected. `from === to` returns [from].
// `weight(id)` (optional) lets a caller bias the search away from a node by
// raising its cost (switches BFS → uniform-cost search); default cost 1 each.
// `abilities` (§blink, movement-action-coupling.md M4) unlocks a location's
// `gatedConnections` whose `requires` is among them — routes that exist only
// for owners of the capability (the un-bridged river crossing). Omitted ⇒
// plain-road routing, exactly as before.
export function routeBetween(
  from: string,
  to: string,
  locations: Location[],
  weight?: (id: string) => number,
  abilities?: readonly string[],
): string[] | null {
  if (from === to) return [from]
  const byId = new Map(locations.map((l) => [l.id, l]))
  if (!byId.has(from) || !byId.has(to)) return null

  // Uniform-cost (Dijkstra) search — collapses to BFS when every weight is 1.
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string | null>([[from, null]])
  const seen = new Set<string>()
  // Tiny frontier (the world graph is small), so a linear "pick the nearest
  // unvisited" beats pulling in a heap dependency.
  while (true) {
    let cur: string | null = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (seen.has(id)) continue
      if (d < best) { best = d; cur = id }
    }
    if (cur === null) return null            // frontier exhausted, never reached `to`
    if (cur === to) break
    seen.add(cur)
    const loc = byId.get(cur)!
    const gated = abilities?.length
      ? (loc.gatedConnections ?? []).filter((g) => abilities.includes(g.requires)).map((g) => g.to)
      : []
    for (const nb of gated.length ? [...loc.connections, ...gated] : loc.connections) {
      if (!byId.has(nb) || seen.has(nb)) continue
      const cost = best + (weight ? weight(nb) : 1)
      if (cost < (dist.get(nb) ?? Infinity)) { dist.set(nb, cost); prev.set(nb, cur) }
    }
  }

  const path: string[] = []
  for (let at: string | null = to; at !== null; at = prev.get(at) ?? null) path.unshift(at)
  return path
}

// The route's steps AFTER the starting node — what a hero's `travelPath` holds
// (the current map isn't a step). Empty when already there.
export function routeStepsFrom(from: string, to: string, locations: Location[], weight?: (id: string) => number): string[] | null {
  const full = routeBetween(from, to, locations, weight)
  return full ? full.slice(1) : null
}

// Nearest location with a 'city' trait, by hop count — the default logistics
// town a hunting field hauls loot back to. null if no city is reachable.
export function nearestCity(from: string, locations: Location[]): string | null {
  const cities = locations.filter((l) => l.traits.includes('city'))
  let best: { id: string; hops: number } | null = null
  for (const city of cities) {
    const route = routeBetween(from, city.id, locations)
    if (!route) continue
    const hops = route.length - 1
    if (!best || hops < best.hops) best = { id: city.id, hops }
  }
  return best?.id ?? null
}
