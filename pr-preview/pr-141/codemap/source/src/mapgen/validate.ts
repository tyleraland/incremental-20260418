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
import { floodOpen, occupancyGrid, solveLockFlow } from './solve'

// The shared occupancy/flood machinery lives in solve.ts (the solver floods
// the same PAD-inflated model); re-exported here so derived-plane producers
// keep importing "the validator's pathing reality" from the validator.
export { occupancyGrid } from './solve'

// kind each material must ride on — the §B "one collision, many paints" table.
const MATERIAL_KIND: Record<string, 'wall' | 'cliff'> = {
  'rock': 'wall', 'cut-stone': 'wall', 'wood': 'wall', 'rubble': 'wall',
  'hedge': 'cliff', 'deep-water': 'cliff', 'ravine': 'cliff', 'bars': 'cliff',
}

function occupancy(spec: MapSpec): Uint8Array {
  return occupancyGrid(spec.collision, spec.cols, spec.rows)
}

// Label every open cell with its flood component id (scanline discovery,
// 4-neighbour); -1 = blocked. The graph-truthful rule reads this so an edge
// between two nodes is honest even when neither touches the spawn component.
function components(blocked: Uint8Array, cols: number, rows: number): Int32Array {
  const comp = new Int32Array(cols * rows).fill(-1)
  let next = 0
  for (let i0 = 0; i0 < comp.length; i0++) {
    if (blocked[i0] || comp[i0] !== -1) continue
    const id = next++
    comp[i0] = id
    const stack = [i0]
    while (stack.length) {
      const i = stack.pop()!
      const x = i % cols, y = (i / cols) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const j = ny * cols + nx
        if (!blocked[j] && comp[j] === -1) { comp[j] = id; stack.push(j) }
      }
    }
  }
  return comp
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

  const blocked = occupancy(spec)

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
    // Exemptions — this is CONDITIONAL reachability (§D):
    //   'optional'        a §J visible-unreachable pocket, deliberate forever
    //   'locked:<lockId>' gated content: exempt while its lock is CLOSED, but
    //                     a lock the party OPENED must actually deliver — the
    //                     tag stops exempting and the `locks` rule (below)
    //                     enforces both directions.
    const lockById = new Map(spec.semantic.locks.map((l) => [l.id, l]))
    const exempt = (p: (typeof spec.semantic.pois)[number]) =>
      p.tags.includes('optional') ||
      // 'gate' POIs mark the seal itself — a closed gate's marker sits INSIDE
      // its plug; the locks rule below owns their semantics (approachability)
      p.kind === 'gate' ||
      p.tags.some((t) => t.startsWith('locked:') && lockById.get(t.slice(7))?.open === false)
    const seen = floodOpen(blocked, spec.cols, spec.rows, spawn.at)
    const reachableAt = (p: { x: number; y: number }) => {
      const xi = Math.min(spec.cols - 1, Math.max(0, Math.floor(p.x)))
      const yi = Math.min(spec.rows - 1, Math.max(0, Math.floor(p.y)))
      return !!seen[yi * spec.cols + xi]
    }
    const unreachablePois = spec.semantic.pois.filter((p) => !exempt(p) && !reachableAt(p.at))
    let open = 0, reached = 0
    for (let i = 0; i < blocked.length; i++) { if (!blocked[i]) open++; if (seen[i]) reached++ }
    const frac = open ? reached / open : 0
    const okReach = unreachablePois.length === 0 && frac >= 0.85
    rule('reachable', okReach,
      okReach
        ? `all ${spec.semantic.pois.length} POIs reachable; ${(frac * 100).toFixed(0)}% of open cells connected`
        : `${unreachablePois.map((p) => p.id).join(',') || 'no POI stranded'}; ${(frac * 100).toFixed(0)}% of open cells connected (need ≥85%)`)

    // locks — the §D contract, both directions, per lock:
    //   · the gate itself is approachable (you can walk up and SEE the door);
    //   · CLOSED → every gated POI is genuinely unreachable (the seal seals —
    //     a leaky gate would hand out the prize for free);
    //   · OPEN → every gated POI is reachable (the party's kit actually paid);
    //   · never gate the critical path: no spawn/portal/lair POI may be gated.
    if (spec.semantic.locks.length) {
      const problems: string[] = []
      const poiById = new Map(spec.semantic.pois.map((p) => [p.id, p]))
      // "approachable" = some open cell within a few steps of the gate site is
      // reachable — the party can walk up and SEE the door even though the
      // door cell itself sits inside the sealing plug.
      const approachable = (p: { x: number; y: number }) => {
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (reachableAt({ x: p.x + dx, y: p.y + dy })) return true
          }
        }
        return false
      }
      for (const lock of spec.semantic.locks) {
        if (lock.at && !approachable(lock.at)) problems.push(`${lock.id}: gate site unreachable`)
        for (const gid of lock.gates) {
          const poi = poiById.get(gid)
          if (!poi) { problems.push(`${lock.id}: gated POI ${gid} missing`); continue }
          if (['spawn', 'portal', 'lair'].includes(poi.kind)) problems.push(`${lock.id}: gates critical-path POI ${gid} (${poi.kind})`)
          const canReach = reachableAt(poi.at)
          if (lock.open && !canReach) problems.push(`${lock.id}: OPEN but ${gid} still unreachable`)
          if (!lock.open && canReach) problems.push(`${lock.id}: CLOSED but ${gid} is reachable (leaky seal)`)
        }
      }
      rule('locks', problems.length === 0,
        problems.length === 0
          ? spec.semantic.locks.map((l) => `${l.id} ${l.open ? 'open' : 'closed'}`).join(', ')
          : problems.join('; '))
    }

    // key-flow — §D key logistics: every closed 'key' lock must be provably
    // openable per the fixpoint solver (solve.ts): its key POI acquirable
    // without passing the lock itself. A missing key, a key sealed behind its
    // own gate, or a circular chain is a deadlocked bake. (The key POI itself
    // carries no `locked:` tag on the single-link recipes, so the `reachable`
    // rule already demands it on the ungated subgraph; chains tag chained keys
    // and lean on this rule for the fixpoint proof.)
    const keyLocks = spec.semantic.locks.filter((l) => l.kind === 'key')
    if (keyLocks.length) {
      const flow = solveLockFlow(spec)
      const deadlocked = new Set(flow.blocked)
      const problems: string[] = []
      for (const l of keyLocks) {
        if (l.open) continue
        if (!spec.semantic.pois.some((p) => p.kind === 'key' && p.tags.includes(`opens:${l.id}`))) {
          problems.push(`${l.id}: no key POI (opens:${l.id})`)
        } else if (deadlocked.has(l.id)) {
          problems.push(`${l.id}: deadlocked — key unreachable without opening the lock itself`)
        }
      }
      rule('key-flow', problems.length === 0,
        problems.length === 0
          ? `${keyLocks.length} key lock(s) solvable${flow.order.length ? ` (order: ${flow.order.join(' → ')})` : ''}`
          : problems.join('; '))
    }
  }

  // graph-truthful — L4 contract rule 4: every published nav edge is
  // physically real, flood-fill agreeing. For each edge whose lock is absent
  // or OPEN: the two endpoint nodes must share a flood component, and the
  // edge's doorAt (if set) must be an open cell (floor/clamp, same cell test
  // as reachableAt). Edges with a CLOSED lock are exempt — the `locks` rule
  // owns sealed geometry (both directions).
  // Anchor precision: a node's anchor may legitimately sit inside stamped
  // interior geometry (the barred-cell's §J pocket swallows a room's centre).
  // An anchor whose own cell is open AND in a substantial component speaks
  // for itself — EXACTLY that component, no tolerance (this is what closes
  // the blind zone: a ±4 box freely sees across walls, so two nearby anchors
  // with any shared open cell in the overlap would auto-pass a severed
  // corridor). Only a buried anchor, or one inside a tiny pocket (the
  // barred-cell vault interior is ~4 cells; POCKET_MAX gives headroom while
  // staying far below any real room/region component), falls back to the
  // component set of open cells within ±4 — the locks rule's approachable()
  // envelope.
  const navEdges = spec.semantic.nav.edges
  if (navEdges.length === 0) {
    rule('graph-truthful', true, 'no nav edges')
  } else {
    const POCKET_MAX = 32
    const comp = components(blocked, spec.cols, spec.rows)
    const compSize = new Map<number, number>()
    for (let i = 0; i < comp.length; i++) {
      if (comp[i] !== -1) compSize.set(comp[i], (compSize.get(comp[i]) ?? 0) + 1)
    }
    const compAt = (p: { x: number; y: number }) => {
      const xi = Math.min(spec.cols - 1, Math.max(0, Math.floor(p.x)))
      const yi = Math.min(spec.rows - 1, Math.max(0, Math.floor(p.y)))
      return comp[yi * spec.cols + xi]
    }
    const compsNear = (p: { x: number; y: number }) => {
      const own = compAt(p)
      if (own !== -1 && (compSize.get(own) ?? 0) > POCKET_MAX) return new Set([own])
      const set = new Set<number>()
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const c = compAt({ x: p.x + dx, y: p.y + dy })
          if (c !== -1) set.add(c)
        }
      }
      return set
    }
    const nodeById = new Map(spec.semantic.nav.nodes.map((q) => [q.id, q]))
    const openLock = new Map(spec.semantic.locks.map((l) => [l.id, l.open]))
    const problems: string[] = []
    let checked = 0
    for (const e of navEdges) {
      if (e.lockId && openLock.get(e.lockId) === false) continue
      checked++
      const a = nodeById.get(e.a), b = nodeById.get(e.b)
      if (!a || !b) { problems.push(`${e.a}→${e.b}: endpoint node missing`); continue }
      const ca = compsNear(a.at), cb = compsNear(b.at)
      if (ca.size === 0) problems.push(`${e.a}→${e.b}: anchor ${e.a} buried (no open cell nearby)`)
      if (cb.size === 0) problems.push(`${e.a}→${e.b}: anchor ${e.b} buried (no open cell nearby)`)
      if (ca.size && cb.size && ![...ca].some((c) => cb.has(c))) {
        problems.push(`${e.a}→${e.b}: endpoints in different flood components`)
      }
      if (e.doorAt && compAt(e.doorAt) === -1) {
        problems.push(`${e.a}→${e.b}: doorAt ${e.doorAt.x},${e.doorAt.y} is blocked`)
      }
    }
    rule('graph-truthful', problems.length === 0,
      problems.length === 0
        ? `${checked}/${navEdges.length} open edge(s) flood-verified`
        : problems.join('; '))
  }

  // intensity — track D digest sanity: every published NavNode.intensity is a
  // finite number in [0,1] (the store paces the open-world trickle off it —
  // a NaN or out-of-range value would silently skew spawn weighting). Nodes
  // without intensity are fine: city skips it by decision, and the field's
  // POI-stub fallback nodes never carry one.
  const withIntensity = spec.semantic.nav.nodes.filter((n) => n.intensity !== undefined)
  const badIntensity = withIntensity.filter(
    (n) => typeof n.intensity !== 'number' || !Number.isFinite(n.intensity) || n.intensity! < 0 || n.intensity! > 1,
  )
  rule('intensity', badIntensity.length === 0,
    badIntensity.length
      ? `${badIntensity.map((n) => `${n.id}=${n.intensity}`).join(',')} outside [0,1]`
      : withIntensity.length
        ? `${withIntensity.length} node intensity value(s) in [0,1]`
        : 'no intensities published')

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
