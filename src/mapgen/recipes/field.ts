// The FIELD recipe — overworld, field-first: macro fields → surface partition
// → hard geography (lake + ford, river + crossings, outcrops) → derived region
// graph → scatter → semantic. The point of this recipe is that the layers
// COMPOSE — each pass reads the shared substrate and the planes agree by
// construction (sand rings the water, trees follow moisture, outcrops sit on
// rough ground, fords are walkable because the deep-water rects were built
// around them), and the nav graph is DERIVED from whatever geography grew
// (regions pass → deriveRegions), never authored.
//
// Dungeon (graph-first) and city (road-first) are sibling recipes over this
// same pipeline; they share the bake/validate tail unchanged.

import type { ProficiencyTag, ScatterIntent, ScatterKind, SurfaceMaterial } from '../types'
import type { PassCtx, RecipeDef } from '../pipeline'
import type { Rng } from '../rng'
import { addBarrier, addPoi, isPlaceable, matAt, paint } from '../draft'
import { bfsDepth, deriveRegions, nodeDegrees } from '../graph'
import { placeProficiencyLock, placeShortcutLock, type GateLook } from '../gates'
import { occupancyGrid } from '../validate'
import { tacticalProfile } from '../profile'
import { premisePass } from '../naming'

// ── surface: fields → material bands (§A layer 3) ────────────────────────────
const surfacePass = {
  id: 'surface',
  run({ draft, params, fields }: PassCtx) {
    const desert = params.themes.includes('desert')
    for (let y = 0; y < draft.rows; y++) {
      for (let x = 0; x < draft.cols; x++) {
        const m = fields.moisture(x + 0.5, y + 0.5)
        let mat: SurfaceMaterial = desert ? 'sand' : 'grass'
        if (!desert && m > 0.68) mat = 'meadow'
        if (m < (desert ? 0.42 : 0.3)) mat = 'dirt'
        paint(draft, x, y, mat)
      }
    }
  },
}

// ── hydrology: one lake, deep centre + shallow rim + a ford (§A layer 4) ─────
// Deep water is the locked two-primitive trick: cliff-kind collision rects
// (see-across) wearing the 'deep-water' material, covering the deep cells. The
// ford is a strip forced to shallow BEFORE the rects are built, so crossability
// is true by construction — validation's flood-fill then re-proves it.
const hydrologyPass = {
  id: 'hydrology',
  run({ draft, params, fields, rng, note }: PassCtx) {
    if (!params.themes.some((t) => t === 'water' || t === 'beach')) return
    const { size, spawnApron } = params
    const c = size / 2
    const r = Math.min(26, Math.max(6, size * 0.16))

    // Lake centre: the lowest-elevation coarse-grid candidate that keeps the
    // whole lake off the spawn apron, the map rim, and the keep-clear boxes.
    // Deterministic scan (no rejection sampling) so the site never depends on
    // draw order.
    const step = Math.max(4, Math.floor(size / 10))
    let best: { x: number; y: number } | null = null
    let bestElev = Infinity
    for (let y = r + 2; y <= size - r - 2; y += step) {
      for (let x = r + 2; x <= size - r - 2; x += step) {
        if (Math.hypot(x - c, y - c) < spawnApron + r + 2) continue
        if (params.keepClear.some((k) =>
          Math.hypot(Math.max(k.x, Math.min(x, k.x + k.w)) - x, Math.max(k.y, Math.min(y, k.y + k.h)) - y) < r + 2)) continue
        const e = fields.elevation(x, y)
        if (e < bestElev) { bestElev = e; best = { x, y } }
      }
    }
    if (!best) { note('no room for a lake — skipped'); return }

    // Ford: a vertical shallow strip through the lake, jittered off-centre.
    const fordX = best.x + rng('ford').range(-r / 3, r / 3)

    // Paint the lake: wonky radius via the roughness field (shared substrate —
    // no private noise), deep core, shallow rim, sand ring.
    const deep: { x: number; y: number }[] = []
    for (let y = Math.max(0, Math.floor(best.y - r * 1.5)); y < Math.min(size, Math.ceil(best.y + r * 1.5)); y++) {
      for (let x = Math.max(0, Math.floor(best.x - r * 1.5)); x < Math.min(size, Math.ceil(best.x + r * 1.5)); x++) {
        const d = Math.hypot(x + 0.5 - best.x, y + 0.5 - best.y)
        const rEff = r * (0.78 + 0.35 * fields.roughness(x * 0.7, y * 0.7))
        if (d < rEff * 0.6 && Math.abs(x + 0.5 - fordX) >= 1.5) {
          paint(draft, x, y, 'deep-water')
          deep.push({ x, y })
        } else if (d < rEff) {
          paint(draft, x, y, 'shallow-water')
        } else if (d < rEff * 1.3) {
          paint(draft, x, y, 'sand')
        }
      }
    }
    if (deep.length === 0) { note('lake came out all-shallow — no collision emitted'); return }

    // L6 scratch: the lake's site, for later passes (the river keeps its fords
    // off the lake — a ford strip punched into lake water would be walkable
    // surface under the LAKE's collision rects, the exact lie water-coherence
    // exists to prevent). Owned by this pass; shape { x, y, r }.
    draft.scratch.set('lake', { x: best.x, y: best.y, r })

    // Cover the deep cells with few fat rects: split at the ford, slice each
    // side into horizontal bands, one bbox rect per band. Coarse cover may lap
    // onto the shallow rim (wet, walk-blocked is a lie only on DRY land — the
    // water-coherence rule holds the line at ≥60% wet per rect).
    for (const side of [deep.filter((p) => p.x + 0.5 < fordX), deep.filter((p) => p.x + 0.5 >= fordX)]) {
      if (!side.length) continue
      const ys = side.map((p) => p.y)
      const y0 = Math.min(...ys), y1 = Math.max(...ys)
      const bands = Math.min(4, Math.max(1, Math.ceil((y1 - y0 + 1) / 6)))
      const bandH = (y1 - y0 + 1) / bands
      for (let b = 0; b < bands; b++) {
        const cells = side.filter((p) => p.y >= y0 + b * bandH && p.y < y0 + (b + 1) * bandH)
        if (!cells.length) continue
        const xs = cells.map((p) => p.x)
        const cys = cells.map((p) => p.y)
        addBarrier(draft, {
          x: Math.min(...xs), y: Math.min(...cys),
          w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...cys) - Math.min(...cys) + 1,
          kind: 'cliff', material: 'deep-water',
        })
      }
    }
    note(`lake at ${best.x},${best.y} r≈${r.toFixed(0)}, ford at x≈${fordX.toFixed(0)}, ${draft.collision.length} water rect(s)`)
  },
}

// ── RIVER_DIALS — the P2 river's review knobs (track C structural core) ──────
// Group ALL river tunables here (same discipline as SCATTER_DIALS). The river
// is the region DIVIDER: it bisects the map edge-to-edge so the derived graph
// (regions pass) becomes non-trivial, and its punched fords become the
// 'crossing' edges.
//
// FORD-AS-EDGE DECISION (settled here, per BACKLOG track-B follow-up): ford
// strips are `fordRows` = 2 cells wide and the regions pass STAYS at
// deriveRegions' default pinchWidth 3. A 2-wide walkable gap has max clearance
// 1 < ceil(3/2) = 2, so it erodes away and registers as a pinch → a real
// 'crossing' edge with its doorAt inside the ford. The alternative (3–4-wide
// fords + pinchWidth 5) was rejected: it would ALSO reclassify every 3–4-wide
// gap between outcrops as a region boundary, exploding graphs that read fine
// today. The lake's ~3-wide ford deliberately stays NON-pinch (the lake never
// bisects a map — you can walk around it — so an edge there would be noise).
// A 2-wide strip is a genuine tactical choke and stays engine-passable (the
// dungeon's corridors are 2-wide).
export const RIVER_DIALS = {
  minSize: 56,        // maps smaller than this stay river-less (the lane math below
                      //   needs size/2 ≥ apron + laneGap + laneMargin + minLaneWidth)
  maxRects: 14,       // EXPLICIT budget allotment: the river never spends more rects
                      //   than min(this, maxBarriers − already-spent − outcropReserve);
                      //   can't fit → skip whole
  outcropReserve: 4,  // rects LEFT for the outcrops pass (decision 3: allotments, not a
                      //   race — without this a tight cap let the river starve outcrops
                      //   to zero and the map reads as bare banks)
  segRows: 20,        // ~rows of course per cover rect: one bbox rect per knot segment
  minSegments: 3,     // fewer cover segments than this can't read as a river → skip
  maxSegDrift: 4,     // max cross-axis wander per knot segment (bounds rect width =
                      //   drift + 2·deepHalf, which keeps rects comfortably wet in
                      //   practice — a keep-clear push can exceed this bound, where
                      //   the water-coherence rule + reroll policy backstop)
  deepHalf: 1.5,      // deep channel half-width → ~3 painted deep cells per row
  shallowRim: 1.5,    // shallow-water rim beyond the deep core (the wet margin)
  sandRim: 1.5,       // sand banks beyond the shallows (same read as the lake shore)
  fordCount: 2,       // fords punched per river (2 keeps one outcrop mishap from
                      //   severing the map; validation still backstops)
  fordRows: 2,        // ford strip width along the flow axis — see the decision above
  fordMinSpacing: 0.22, // min ford separation as a fraction of map size
  fordEdgeMargin: 8,  // fords keep off the map rim (border-seeded clearance is noisy there)
  laneMargin: 6,      // river centreline keeps this far off the cross-axis map edges
  laneGap: 6,         // extra clearance beyond the spawn apron: the whole course runs in
                      //   one LANE beside the apron, so apron-clear holds by construction
  minLaneWidth: 10,   // a lane narrower than this can't wander → no river
  bridgeChance: 0.35, // chance ONE ford dresses as a plank bridge ('road' strip instead
                      //   of shallow-water; rng-conditioned, no new vocabulary)
}

// ── river: hydrology v2 — the descending edge-to-edge channel (P2, track C) ──
// Trigger: theme 'water' only (a water map gets lake AND river; 'beach' alone
// keeps its lake/shore but no river — a beach is coastline, not a valley) and
// size ≥ minSize (small skirmish fields stay river-less).
//
// Shape: a monotone polyline along the FLOW axis (the axis with the stronger
// edge-to-edge elevation gradient), source = the higher edge. Cross-axis
// position is elevation-guided (knots descend toward low ground, jittered from
// the 'trace' stream) inside one LANE beside the spawn apron — |cross − spawn|
// ≥ apron + laneGap for the entire course, so no rect can violate apron-clear.
// Fords are punched (forced walkable) BEFORE the collision rects are built,
// exactly like the lake's ford; cover is one fat bbox rect per knot segment
// (cliff kind, 'deep-water' material — the locked two-primitive trick), split
// at the fords. Budget discipline: allotment ≤ RIVER_DIALS.maxRects and ≤ the
// remaining maxBarriers, spend note()d; if a coherent river can't fit, the
// pass skips ENTIRELY (no half-rivers).
const riverPass = {
  id: 'river',
  run({ draft, params, fields, rng, note }: PassCtx) {
    if (!params.themes.includes('water')) return
    const { size } = params
    const D = RIVER_DIALS
    if (size < D.minSize) { note(`map ${size} < ${D.minSize} — too small for a river, skipped`); return }

    // ── budget allotment (decision 3: explicit per-pass allotment) ──────────
    // The reserve keeps the river from winning the whole race under a tight
    // cap: outcrops run after and must still be able to fire.
    const remaining = params.maxBarriers - draft.collision.length
    const allot = Math.min(D.maxRects, remaining - D.outcropReserve)
    const nSeg = Math.min(Math.ceil(size / D.segRows), allot - D.fordCount)
    if (nSeg < D.minSegments) {
      note(`no barrier budget for a coherent river (${remaining} rect(s) left, need ≥ ${D.minSegments + D.fordCount}) — skipped`)
      return
    }

    // ── flow axis + direction: descend the stronger edge-to-edge gradient ───
    const edgeMean = (pt: (t: number) => Pt2) => {
      let s = 0
      for (let i = 0; i < 9; i++) { const p = pt((i + 0.5) * (size / 9)); s += fields.elevation(p.x, p.y) }
      return s / 9
    }
    const eN = edgeMean((t) => ({ x: t, y: 1 })), eS = edgeMean((t) => ({ x: t, y: size - 1 }))
    const eW = edgeMean((t) => ({ x: 1, y: t })), eE = edgeMean((t) => ({ x: size - 1, y: t }))
    const vert = Math.abs(eN - eS) >= Math.abs(eE - eW)
    const forward = vert ? eN >= eS : eW >= eE  // a=0 sits at the HIGHER edge
    // (a, b) = (along-flow, cross-axis) → grid cell. All geometry below works in
    // flow coords; only this mapper and the rect emitter know the orientation.
    const at = (a: number, b: number): Pt2 => {
      const flow = forward ? a : size - 1 - a
      return vert ? { x: b, y: flow } : { x: flow, y: b }
    }

    // ── lane: one side of the spawn apron, whole course (see header) ────────
    const spawnAt = params.pois.find((p) => p.kind === 'spawn')?.at ?? { x: size / 2, y: size / 2 }
    const cross = vert ? spawnAt.x : spawnAt.y
    const gap = params.spawnApron + D.laneGap
    const lanes: [number, number][] = [
      [D.laneMargin, cross - gap],
      [cross + gap, size - D.laneMargin],
    ].filter(([lo, hi]) => hi - lo >= D.minLaneWidth) as [number, number][]
    if (!lanes.length) { note('no lane wide enough beside the spawn apron — river skipped'); return }
    const laneElev = (l: [number, number]) => {
      let s = 0
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const p = at((i + 0.5) * (size / 5), l[0] + (j + 0.5) * ((l[1] - l[0]) / 5))
        s += fields.elevation(p.x, p.y)
      }
      return s / 25
    }
    let lane = lanes[0]
    if (lanes.length === 2) {
      const d = laneElev(lanes[0]) - laneElev(lanes[1])
      // rivers sit in the valley — take the lower lane; near-tie → coin flip
      lane = Math.abs(d) < 0.02 ? (rng('lane').chance(0.5) ? lanes[0] : lanes[1]) : d < 0 ? lanes[0] : lanes[1]
    }
    const clampLane = (b: number) => Math.min(lane[1], Math.max(lane[0], b))

    // ── knots: elevation-guided descending wander, bounded drift per segment ─
    const H = Math.ceil(size / nSeg)
    // keep-clear boxes (portals): the channel + banks must never cover one.
    // Knots within the box's (inflated) flow-range are pushed outside its
    // cross-range; both bracketing knots of any affected row get pushed to the
    // SAME side (nearest viable), so the interpolated course clears it too.
    const rim = D.deepHalf + D.shallowRim + D.sandRim + 2
    const avoidBoxes = (a: number, b: number): number | null => {
      for (const box of params.keepClear) {
        const f0 = (vert ? box.y : box.x) - 2 * H, f1 = (vert ? box.y + box.h : box.x + box.w) + 2 * H
        const flow = forward ? a : size - 1 - a
        if (flow < f0 || flow > f1) continue
        const c0 = (vert ? box.x : box.y) - rim, c1 = (vert ? box.x + box.w : box.y + box.h) + rim
        if (b <= c0 || b >= c1) continue
        const sides = [c0, c1].filter((v) => v >= lane[0] && v <= lane[1])
        if (!sides.length) return null  // box blocks the whole lane at this reach
        b = sides.reduce((p, q) => (Math.abs(q - b) < Math.abs(p - b) ? q : p))
      }
      return b
    }
    const tr = rng('trace')
    const knotA = Array.from({ length: nSeg + 1 }, (_, k) => Math.round((k * (size - 1)) / nSeg))
    const knotB: number[] = []
    let prev = 0
    for (let k = 0; k <= nSeg; k++) {
      let best = Number.NaN, bestScore = Infinity
      const steps = k === 0 ? 7 : 5
      for (let i = 0; i < steps; i++) {
        const cand = k === 0
          ? lane[0] + (i + 0.5) * ((lane[1] - lane[0]) / steps)   // source: scan the lane
          : clampLane(prev + (i - (steps - 1) / 2) * (D.maxSegDrift / 2))
        const p = at(knotA[k], cand)
        const score = fields.elevation(p.x, p.y) + tr.range(0, 0.06)
        if (score < bestScore) { bestScore = score; best = cand }
      }
      const routed = avoidBoxes(knotA[k], best)
      if (routed === null) { note('keep-clear box blocks the river lane — skipped'); return }
      prev = routed
      knotB.push(routed)
    }
    // per-row centreline (linear between knots — the slope bound is what keeps
    // one bbox rect per segment mostly wet)
    const cLine = new Float64Array(size)
    for (let k = 0; k < nSeg; k++) {
      const a0 = knotA[k], a1 = knotA[k + 1]
      for (let a = a0; a <= a1; a++) cLine[a] = knotB[k] + ((knotB[k + 1] - knotB[k]) * (a - a0)) / (a1 - a0)
    }

    // ── fords: shallow reaches, spaced, off the rim and the lake ────────────
    // Chosen BEFORE painting so the strips are walkable by construction; low
    // elevation preferred (fords are where the water runs shallow).
    const lake = draft.scratch.get('lake') as { x: number; y: number; r: number } | undefined
    const fordable: { a: number; e: number }[] = []
    for (let a = D.fordEdgeMargin; a <= size - 1 - D.fordEdgeMargin - D.fordRows; a++) {
      const p = at(a, cLine[a])
      if (lake && Math.hypot(p.x - lake.x, p.y - lake.y) < lake.r * 1.6) continue
      fordable.push({ a, e: fields.elevation(p.x, p.y) })
    }
    fordable.sort((p, q) => p.e - q.e || p.a - q.a)
    const fords: number[] = []
    for (const c of fordable) {
      if (fords.length >= D.fordCount) break
      if (fords.every((f) => Math.abs(f - c.a) >= size * D.fordMinSpacing)) fords.push(c.a)
    }
    if (!fords.length) { note('no viable ford reach — river skipped (a fordless river would sever the map)'); return }
    fords.sort((p, q) => p - q)
    // bridge dressing: one ford may wear 'road' instead of shallow-water — the
    // same walkable gap as a plank crossing; the regions pass doesn't care.
    const br = rng('bridge')
    const bridgeAt = br.chance(D.bridgeChance) ? fords[br.int(fords.length)] : -1

    // ── paint the channel (lake's discipline: deep core, shallow rim, sand) ──
    // Wetness ordering: deep paints over anything (it gets covered), shallow
    // never downgrades deep, sand never downgrades water — so the river can
    // cross the lake without poking holes in either feature's coherence.
    const wetHalf = D.deepHalf + D.shallowRim
    const sandHalf = wetHalf + D.sandRim
    const inFord = (a: number) => fords.some((f) => a >= f && a < f + D.fordRows)
    // deep span per flow-row (cross-cell min/max) — what the cover rects wrap
    const spanMin = new Int32Array(size).fill(-1)
    const spanMax = new Int32Array(size).fill(-1)
    for (let a = 0; a < size; a++) {
      const c = cLine[a]
      const ford = inFord(a)
      const fordMat: SurfaceMaterial = bridgeAt >= 0 && a >= bridgeAt && a < bridgeAt + D.fordRows ? 'road' : 'shallow-water'
      for (let bi = Math.floor(c - sandHalf); bi <= Math.ceil(c + sandHalf); bi++) {
        if (bi < 0 || bi >= size) continue
        const d = Math.abs(bi + 0.5 - c)
        const p = at(a, bi)
        const cur = matAt(draft, p.x, p.y)
        if (d < wetHalf && ford) {
          paint(draft, p.x, p.y, fordMat)
        } else if (d < D.deepHalf) {
          paint(draft, p.x, p.y, 'deep-water')
          if (spanMin[a] < 0 || bi < spanMin[a]) spanMin[a] = bi
          if (bi > spanMax[a]) spanMax[a] = bi
        } else if (d < wetHalf) {
          if (cur !== 'deep-water') paint(draft, p.x, p.y, 'shallow-water')
        } else if (d < sandHalf) {
          if (cur !== 'deep-water' && cur !== 'shallow-water') paint(draft, p.x, p.y, 'sand')
        }
      }
    }

    // ── cover: one bbox rect per knot segment, split at the fords ───────────
    // The drift bound keeps each bbox ≤ maxSegDrift + 2·deepHalf wide, so the
    // rect is mostly wet (water-coherence's ≥60%) by construction; rect count
    // ≤ nSeg + fords ≤ the allotment by construction.
    const spent0 = draft.collision.length
    const emit = (a0: number, a1: number) => {
      let bMin = Infinity, bMax = -Infinity
      for (let a = a0; a <= a1; a++) {
        if (spanMin[a] < 0) continue
        if (spanMin[a] < bMin) bMin = spanMin[a]
        if (spanMax[a] > bMax) bMax = spanMax[a]
      }
      if (bMin > bMax) return
      const fa = forward ? a0 : size - 1 - a1
      const fb = forward ? a1 : size - 1 - a0
      addBarrier(draft, vert
        ? { x: bMin, y: fa, w: bMax - bMin + 1, h: fb - fa + 1, kind: 'cliff', material: 'deep-water' }
        : { x: fa, y: bMin, w: fb - fa + 1, h: bMax - bMin + 1, kind: 'cliff', material: 'deep-water' })
    }
    for (let k = 0; k < nSeg; k++) {
      let a = knotA[k]
      const end = k === nSeg - 1 ? size - 1 : knotA[k + 1] - 1
      while (a <= end) {
        const cut = fords.find((f) => f + D.fordRows > a && f <= end)
        if (cut === undefined) { emit(a, end); break }
        if (cut > a) emit(a, Math.min(cut - 1, end))
        a = cut + D.fordRows
      }
    }
    const spent = draft.collision.length - spent0
    note(`${vert ? 'N–S' : 'W–E'} course, ${fords.length} ford(s)${bridgeAt >= 0 ? ' (1 bridge)' : ''}, ` +
      `${spent} rect(s) spent of ${allot} allotted (${draft.collision.length}/${params.maxBarriers} total)`)
  },
}

interface Pt2 { x: number; y: number }

// ── outcrops: rock/ravine/hedge masses where the ground is rough (layer 4) ───
const outcropsPass = {
  id: 'outcrops',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size } = params
    // gateReserve: leave as-if-closed headroom for the gates pass (P3) — same
    // allotment discipline as RIVER_DIALS.outcropReserve. Unconditional, so
    // budgets never depend on whether a gate later fires (kit-invariance).
    const budget = params.maxBarriers - draft.collision.length
    const target = Math.min(budget - GATE_DIALS.gateReserve, Math.max(3, Math.round(size / 12)))
    if (target <= 0) { note('no barrier budget left after hydrology'); return }
    const forest = params.themes.includes('forest')
    const r = rng('sites')
    const baseline = draft.collision.length
    let placed = 0
    for (let guard = 0; placed < target && guard < target * 20; guard++) {
      const x = r.range(2, size - 7)
      const y = r.range(2, size - 7)
      // Bias to rough ground; relax once placement gets starved so a smooth
      // seed still gets its landmarks.
      const rough = fields.roughness(x, y)
      if (rough < (guard < target * 8 ? 0.55 : 0.4)) continue
      const w = 2 + r.next() * 3, h = 2 + r.next() * 3
      if (!isPlaceable(draft, { x: x + w / 2, y: y + h / 2 }, Math.max(w, h) / 2 + 1)) continue
      const elev = fields.elevation(x, y)
      // Material follows the substrate: high rough ground = rock wall; low
      // ground cracks into a see-across ravine; forests grow hedges instead.
      const kind = elev < 0.38 ? ('cliff' as const) : forest && r.chance(0.35) ? ('cliff' as const) : ('wall' as const)
      const material = kind === 'wall' ? ('rock' as const) : elev < 0.38 ? ('ravine' as const) : ('hedge' as const)
      addBarrier(draft, { x, y, w, h, kind, material })
      // A second offset rect ~half the time makes an L/T mass — breaks the
      // lone-box read and manufactures corners (cover) for free. It hugs the
      // first rect (so isPlaceable, which avoids collision, can't vet it);
      // check the apron/keep-clear boxes directly instead.
      if (r.chance(0.5) && placed + 1 < target && draft.collision.length < params.maxBarriers) {
        const x2 = x + w * r.range(0.4, 0.9), y2 = y + h * r.range(-0.4, 0.9)
        const w2 = 1.5 + r.next() * 2.5, h2 = 1.5 + r.next() * 2.5
        const cx2 = x2 + w2 / 2, cy2 = y2 + h2 / 2, m2 = Math.max(w2, h2) / 2 + 1
        const clear = Math.hypot(cx2 - size / 2, cy2 - size / 2) >= params.spawnApron + m2 &&
          !params.keepClear.some((k) => cx2 > k.x - m2 - 1 && cx2 < k.x + k.w + m2 + 1 && cy2 > k.y - m2 - 1 && cy2 < k.y + k.h + m2 + 1)
        if (clear) addBarrier(draft, { x: x2, y: y2, w: w2, h: h2, kind, material })
      }
      placed = draft.collision.length - baseline
    }
    note(`${draft.collision.length}/${params.maxBarriers} barrier rects after outcrops (placed ${placed}, target ${target})`)
  },
}

// ── regions: the DERIVED nav-graph producer (L4 track B) ─────────────────────
// Runs once the hard geography is settled (after outcrops, before scatter —
// scatter adds no collision). Rasterizes the collision plane into the exact
// walk mask the validator's flood-fill sees (occupancyGrid — cell-centre in
// pad-inflated rect), segments it with deriveRegions, and publishes REAL
// nodes/edges on the nav skeleton. Depth is rooted at the SPAWN region: a
// caller-provided spawn POI (params.pois) wins; otherwise the map centre,
// where the semantic pass will place the field's default spawn — the two
// passes must stay agreed on the spawn site.
// Deterministic, draws no RNG; the pass id still rides skipPasses (the lab's
// layer inspector) and the per-pass stream discipline.
const regionsPass = {
  id: 'regions',
  run({ draft, note }: PassCtx) {
    const blocked = occupancyGrid(draft.collision, draft.cols, draft.rows)
    const walk = new Uint8Array(blocked.length)
    for (let i = 0; i < blocked.length; i++) walk[i] = blocked[i] ? 0 : 1
    // L6 derived planes (draft.scratch, never baked):
    //   'walk'    — Uint8Array, 1 = walkable (the validator's occupancy model)
    //   'regions' — Int32Array, region index per cell, -1 = blocked/unclaimed
    draft.scratch.set('walk', walk)
    // pinchWidth stays at deriveRegions' default 3: the river's 2-wide ford
    // strips erode into 'crossing' edges, while 3-wide gaps (the lake's ford,
    // ordinary outcrop gaps) stay intra-region — the settled ford-as-edge
    // decision (see RIVER_DIALS).
    const { nodes, edges, claims } = deriveRegions(walk, draft.cols, draft.rows)
    draft.scratch.set('regions', claims)
    if (!nodes.length) { note('no regions derived — nav left empty'); return }
    const spawnAt = draft.params.pois.find((p) => p.kind === 'spawn')?.at
      ?? { x: draft.cols / 2, y: draft.rows / 2 }
    const rootCell = Math.floor(spawnAt.y) * draft.cols + Math.floor(spawnAt.x)
    // The spawn apron keeps the spawn site open, so it is claimed on any sane
    // bake; fall back to the first region rather than crash on a doomed one.
    let rootId = nodes[0].id
    if (claims[rootCell] >= 0) rootId = `region-${claims[rootCell]}`
    else note(`spawn cell unclaimed — depth rooted at ${rootId}`)
    const depth = bfsDepth(edges, rootId)
    for (const nd of nodes) {
      const d = depth.get(nd.id)
      if (d !== undefined) nd.depth = d
    }
    draft.semantic.nav.nodes = nodes
    draft.semantic.nav.edges = edges
    note(`${nodes.length} region(s), ${edges.length} crossing(s)`)
  },
}

// ── GATE_DIALS — the P3 overworld-gate review knobs ──────────────────────────
// Same discipline as RIVER_DIALS/SCATTER_DIALS: every gate tunable in one
// commented block. Overworld gates are phase 4's "field-recipe gates" — the
// feature this recipe exists to prove — so the route coin is deliberately
// generous; the vault has NO coin (natural pockets are ~nonexistent on
// today's river geography — 0 across ~600 sweep bakes; see the pass header).
export const GATE_DIALS = {
  routeChance: 0.6,     // coin for the route lock (a gated secondary crossing)
  sealHalf: 2.25,       // plug half-extent (gates.ts default; swallows a ≤3-wide pinch —
                        //   derived pinches are <3 wide by the ford-as-edge decision).
                        //   Water-coherence holds at this size: the plug sits on the wet
                        //   ford channel (measured 0 dry-rect failures across sweeps)
  vaultMaxAreaFrac: 0.08, // a vault pocket may claim at most this fraction of the
                        //   walkable cells — sealing it must keep the validator's
                        //   ≥85% open-cell connectivity comfortably intact
  gateReserve: 2,       // rects the OUTCROPS pass leaves unspent for gate plugs (one
                        //   route + one vault, 1 rect each as-if-closed) — without it
                        //   outcrops fill the cap and every gate skips on budget
}

// ── gates: overworld lock-and-key on DERIVED edges (P3; track C / phase 4) ───
// The convergence thesis, cashed in: a dungeon door and an overworld ford are
// the SAME L5 call (gates.ts) — this pass only picks candidates off the
// derived graph and proves them safe. Two archetypes, ≤1 of each per map,
// never on the same edge:
//   · ROUTE lock (the flagship) — placeShortcutLock on ONE redundant derived
//     'crossing' edge. Function-first, theme-late: one mapping per crossing
//     type, keyed off the surface at the pinch —
//       ford   (shallow-water) → mobility, cliff/'deep-water' (the water runs
//              too deep here — see the far bank, can't wade);
//       bridge (road)          → might, wall/'wood' (collapsed planks —
//              clear the fallen timber);
//       dry gap (anything else)→ might, wall/'rock' (a rockfall chokes the gap).
//   · VAULT lock — placeProficiencyLock on a NATURAL secret pocket: a small,
//     POI-free, degree-1 region behind its single pinch, sealed as a
//     perception-hidden trail (wall/'rock' — GATE_LOOKS' own mapping). Pockets
//     are not manufactured here (no extra geometry) — if geography didn't grow
//     one, the vault skips.
//
// KIT-INVARIANT by design (the dungeon shortcut pass's discipline): every
// decision below — coin, candidate order, budget, flood — treats ALL locks
// as-if-closed: budget counts draft.collision.length + open-lock count, and
// the flood blocks EVERY placed plug regardless of open state. An open kit
// only ever REMOVES seal geometry — "open = the same map minus plugs" holds
// for the COLLISION and semantic planes; scatter runs after gates and reads
// collision through isPlaceable, so decorative scatter MAY drift between
// variants near an opened pinch (same property as the dungeon; the plane
// that matters to the engine is exact).
//
// Critical-path rule (graph contract rule 2): a route candidate must leave an
// ungated route when closed — graph check first (removing the edge keeps its
// banks connected), then the exact flood on the scratch walk mask at the
// VALIDATOR-padded plug radius (occupancy pads rects by 0.45; an unpadded
// flood would pass routes the bake then fails and burn reroll attempts):
// every region anchor and every known POI (portals!) must stay reached,
// except those inside deliberately lock-sealed pockets.
const gatesPass = {
  id: 'gates',
  run({ draft, params, rng, note }: PassCtx) {
    // Phase-4 policy switch: the adapter bakes LIVE locations with gates OFF
    // unless the location opts in (mapGen.gates) — feel needs human play
    // before live adoption. Lib/lab/test callers default ON.
    if (!params.gates) { note('gates disabled (live phase-4 opt-in — mapGen.gates)'); return }
    const walk = draft.scratch.get('walk') as Uint8Array | undefined
    const claims = draft.scratch.get('regions') as Int32Array | undefined
    const nodes = draft.semantic.nav.nodes
    const edges = draft.semantic.nav.edges
    if (!walk || !claims || !nodes.length) { note('no derived graph — no gates'); return }
    if (!edges.length) { note('single-region map, no crossings — no gates'); return }

    const { size } = params
    const cols = draft.cols
    const half = GATE_DIALS.sealHalf
    // POIs known at this point in the pipeline (the semantic pass runs later):
    // the caller's pre-placed anchors (portals) + the spawn site the semantic
    // pass will use. All must stay reached in every closed variant.
    const spawnAt = params.pois.find((p) => p.kind === 'spawn')?.at ?? { x: size / 2, y: size / 2 }
    const keepReached: Pt2[] = [spawnAt, ...params.pois.filter((p) => p.kind !== 'spawn').map((p) => p.at)]
    const cellOf = (p: Pt2) =>
      Math.min(draft.rows - 1, Math.max(0, Math.floor(p.y))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(p.x)))

    // every placed plug, open or closed — the as-if-closed flood set
    const plugs: Pt2[] = draft.semantic.locks.filter((l) => l.at).map((l) => l.at!)
    const openLocks = () => draft.semantic.locks.filter((l) => l.open).length
    // regions a lock deliberately seals — their anchors stop counting for the
    // stay-reached requirement (mirrors the validator's locked-POI exemption)
    const sealedRegions = new Set<number>()
    const regionOf = (id: string) => Number(id.slice('region-'.length))

    // flood the walk mask from the spawn with every plug (incl. the probe)
    // blocked at the padded footprint; null = the spawn itself got buried
    const floodSeen = (probe: Pt2): Uint8Array | null => {
      const all = [...plugs, probe]
      const fh = half + 0.45
      const passable = (x: number, y: number) =>
        walk[y * cols + x] === 1 && !all.some((p) => Math.abs(x + 0.5 - p.x) < fh && Math.abs(y + 0.5 - p.y) < fh)
      const start = cellOf(spawnAt)
      if (!passable(start % cols, (start / cols) | 0)) return null
      const seen = new Uint8Array(walk.length)
      const stack = [start]
      seen[start] = 1
      while (stack.length) {
        const i = stack.pop()!
        const x = i % cols, y = (i / cols) | 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= draft.rows) continue
          const j = ny * cols + nx
          if (!seen[j] && passable(nx, ny)) { seen[j] = 1; stack.push(j) }
        }
      }
      return seen
    }
    const holdsFor = (seen: Uint8Array | null, alsoSealed = -1): boolean => {
      if (!seen) return false
      for (const p of keepReached) if (!seen[cellOf(p)]) return false
      for (const nd of nodes) {
        const region = regionOf(nd.id)
        if (region === alsoSealed || sealedRegions.has(region)) continue
        if (!seen[cellOf(nd.at)]) return false
      }
      return true
    }
    // shared site pre-filter: the plug must not intrude the spawn apron or a
    // keep-clear box (addBarrier would happily place it; the validator would
    // reroll — cheaper to never pick such a pinch). half·√2 because the
    // validator measures to the RECT's nearest point — a diagonal corner
    // reaches farther than the half-extent (review finding).
    const plugSiteOk = (at: Pt2): boolean =>
      Math.hypot(at.x - spawnAt.x, at.y - spawnAt.y) >= params.spawnApron + half * Math.SQRT2 + 0.5 &&
      !params.keepClear.some((k) =>
        at.x > k.x - half - 1 && at.x < k.x + k.w + half + 1 && at.y > k.y - half - 1 && at.y < k.y + k.h + half + 1)

    // ── 1. route lock: gate ONE redundant crossing (the flagship) ────────────
    const r = rng('route')
    if (!r.chance(GATE_DIALS.routeChance)) {
      note('route gate skipped (coin)')
    } else if (draft.collision.length + openLocks() + 1 > params.maxBarriers) {
      note('route gate skipped (no as-if-closed barrier budget)')
    } else {
      // never gate the only crossing between two banks: removing the edge
      // (with every locked edge already treated as removed) must keep its
      // endpoints connected — the closed variant keeps an ungated route
      const viable = edges
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.doorAt && !e.lockId && plugSiteOk(e.doorAt))
        .filter(({ e, i }) => {
          const rest = edges.filter((o, j) => j !== i && !o.lockId)
          return bfsDepth(rest, e.a).has(e.b)
        })
      if (!viable.length) {
        note(`route gate skipped (no candidate: ${edges.length} crossing(s), none redundant)`)
      } else {
        const start = r.int(viable.length)
        let choice: (typeof viable)[number] | null = null
        for (let k = 0; k < viable.length; k++) {
          const probe = viable[(start + k) % viable.length]
          if (holdsFor(floodSeen(probe.e.doorAt!))) { choice = probe; break }
        }
        if (!choice) {
          note(`route gate skipped (flood rejected all ${viable.length} candidate(s))`)
        } else {
          const at = choice.e.doorAt!
          const mat = matAt(draft, at.x, at.y)
          const crossing = mat === 'shallow-water' ? 'ford' : mat === 'road' ? 'bridge' : 'dry gap'
          // one mapping per crossing type — see the pass header
          const [tag, look]: [ProficiencyTag, GateLook] =
            crossing === 'ford' ? ['mobility', { kind: 'cliff', material: 'deep-water' }]
            : crossing === 'bridge' ? ['might', { kind: 'wall', material: 'wood' }]
            : ['might', { kind: 'wall', material: 'rock' }]
          const { id, open } = placeShortcutLock(draft, { tag, at, look, sealHalf: half })
          edges[choice.i].lockId = id
          plugs.push(at)
          // A sealed FORD repaints its plug footprint to deep-water SURFACE:
          // terrain deliberately draws no deep-water cliff rects (the water
          // wash is their visual), so without this the closed variant renders
          // as a walkable-looking shallow ford with an invisible wall (review
          // finding). Painting the covered cells keeps water-coherence true
          // (they sit under the plug rect) and makes the fiction read: the
          // water HERE runs too deep.
          if (!open && crossing === 'ford') {
            for (let y = Math.floor(at.y - half); y <= Math.ceil(at.y + half); y++) {
              for (let x = Math.floor(at.x - half); x <= Math.ceil(at.x + half); x++) {
                if (x + 0.5 > at.x - half && x + 0.5 < at.x + half && y + 0.5 > at.y - half && y + 0.5 < at.y + half) {
                  paint(draft, x, y, 'deep-water')
                }
              }
            }
          }
          note(`route ${tag} gate ${open ? 'OPEN (party kit)' : 'sealed'} on ${choice.e.a}→${choice.e.b} (${crossing}) at ${at.x},${at.y}`)
        }
      }
    }

    // ── 2. vault lock: a secret pocket, whenever geography grew one ──────────
    const v = rng('vault')
    const degree = nodeDegrees(edges)
    let walkable = 0
    for (let i = 0; i < walk.length; i++) if (walk[i]) walkable++
    const regionCells = new Map<number, number>()
    for (let i = 0; i < claims.length; i++) {
      if (claims[i] >= 0) regionCells.set(claims[i], (regionCells.get(claims[i]) ?? 0) + 1)
    }
    const poiRegions = new Set(keepReached.map((p) => claims[cellOf(p)]))
    const pockets = nodes
      .map((n) => ({
        n,
        region: regionOf(n.id),
        edge: edges.find((e) => (e.a === n.id || e.b === n.id) && e.doorAt && !e.lockId),
      }))
      .filter((c) =>
        degree.get(c.n.id) === 1 && !!c.edge &&
        !poiRegions.has(c.region) &&
        (regionCells.get(c.region) ?? Infinity) <= walkable * GATE_DIALS.vaultMaxAreaFrac &&
        plugSiteOk(c.edge!.doorAt!))
    if (!pockets.length) {
      note('vault skipped (no natural pocket: needs a small POI-free degree-1 region)')
    } else if (draft.collision.length + openLocks() + 1 > params.maxBarriers) {
      note('vault skipped (no as-if-closed barrier budget)')
    } else {
      const start = v.int(pockets.length)
      let pick: (typeof pockets)[number] | null = null
      for (let k = 0; k < pockets.length; k++) {
        const probe = pockets[(start + k) % pockets.length]
        const seen = floodSeen(probe.edge!.doorAt!)
        // the plug must SEAL the pocket (prize anchor unreached — the graph's
        // degree-1 promise re-proven on cells) without collateral damage
        if (seen && !seen[cellOf(probe.n.at)] && holdsFor(seen, probe.region)) { pick = probe; break }
      }
      if (!pick) {
        note(`vault skipped (flood rejected all ${pockets.length} pocket(s): plug leaks or strands a neighbour)`)
      } else {
        const at = pick.edge!.doorAt!
        // perception: a hidden trail through the rocks (GATE_LOOKS' default look)
        const { id, open } = placeProficiencyLock(draft, { tag: 'perception', at, prizeAt: pick.n.at, sealHalf: half })
        pick.edge!.lockId = id
        plugs.push(at)
        sealedRegions.add(pick.region)
        // kit-invariant landmark guard: semantic keeps the landmark out of the
        // pocket in BOTH variants (an open kit must not relocate the landmark)
        draft.scratch.set('vault-region', pick.region)
        note(`vault perception gate ${open ? 'OPEN (party kit)' : 'sealed'} on ${pick.n.id} (${regionCells.get(pick.region)} cell(s)) at ${at.x},${at.y}`)
      }
    }
  },
}

// ── scatter (§A layer 9): props follow moisture + surface material ───────────
// Two isolatable passes, each on its OWN rng stream so the ?mapgen=1 lab can
// skip either independently (skipping one leaves the other byte-identical):
//   scatter-fill   — density-aware BLUE-NOISE filler (jittered grid) spread
//                    across the walkable ground, thicker where it's moist,
//                    thinned toward the spawn apron. `intent: 'field'`.
//   scatter-clumps — a few grove/bed CENTERS with a radial burst (denser at
//                    the core) + a ring of understory sprigs, so vegetation
//                    reads as groves and flower beds, not a uniform dust.
//                    `intent: 'cluster'` (burst) + `'understory'` (sprigs).
const KIND_SIZE: Record<ScatterKind, number> = { tree: 1.3, bush: 0.8, rock: 0.9, stump: 0.7, flower: 0.5, reed: 0.7 }

// ── SCATTER_DIALS — the human review knobs (first-pass values) ───────────────
// Group ALL scatter tunables here so a reviewer tweaks one commented block. The
// `*Mult` numbers set overall biome density; the `clump*` numbers set how the
// groves/beds read. These are first guesses — see the report for which move the
// look most.
const SCATTER_DIALS = {
  // ── scatter-fill (blue-noise area filler) ──
  fillSpacing: 3.2,     // jittered-grid cell size = min gap between fillers (world units); smaller = denser
  baseDensity: 0.6,     // baseline chance a grid cell emits a prop, before substrate modulation (0–1)
  moistureBias: 0.6,    // how strongly high moisture thickens the fill (0 = flat everywhere, 1 = moist-only)
  apronThin: 1,         // fade fill toward the spawn apron: 1 = full fade at the apron edge, 0 = no thinning
  // ── scatter-clumps (groves / flower beds) ──
  clumpCount: 5,        // grove/bed centres on a BASELINE (~96-unit) map; scales with area × theme mult
  clumpRadius: 5.5,     // burst radius around a centre (world units) — the grove's footprint
  clumpFalloff: 1.9,    // radial density falloff exponent (higher = tighter, denser core)
  clumpDensity: 0.7,    // burst attempts per centre ≈ radius² × this — the grove's fill effort
  understoryPerClump: 5, // bush/flower sprigs sprinkled just around each centre (`understory` intent)
  // ── scatter-edges (verge lines along water + rock boundaries) ──
  shoreDensity: 0.55,   // chance a placeable land-cell hugging the water gets a reed (0–1) — thins the shore line
  edgeSpacing: 2.2,     // ≥1 reed per spacing² cell along the shore = min gap (world units); larger = airier verge
  skirtDensity: 0.5,    // skirt samples per unit of a rock/hedge rect's PERIMETER — higher = denser vegetation ring
  skirtInset: 0.6,      // how far outside a barrier's edge the skirt sits (world units) — hugs the base
  skirtRockChance: 0.28,// fraction of skirt props that are pebble/shard 'rock' debris (the rest are grass 'flower')
  skirtBudget: 0.5,     // fraction of the EDGE cap reserved for skirts before reeds fill the rest — so a long
                        //   shoreline can't starve the outcrop verges (and few walls leave the surplus for reeds)
  // ── theme density + shared cap ──
  forestMult: 1.6,      // scatter density multiplier under the 'forest' theme (lush)
  desertMult: 0.4,      // ...under 'desert' (sparse)
  maxItems: 96,         // BASELINE total-item cap (× theme mult) — keeps a big map from exploding
  fillShare: 0.6,       // fraction of the cap scatter-fill may spend (clumps get the rest + slack)
  clumpShare: 0.55,     // fraction of the cap scatter-clumps may spend (fill + clump ≤ ~1.15× cap, bounded)
  edgeShare: 0.35,      // fraction of the cap scatter-edges may spend (fill + clump + edge ≤ ~1.5× cap, bounded)
}

const r2 = (v: number) => Math.round(v * 100) / 100

// Total-item cap near today's ~96×mult so a large map can't explode.
function scatterCap(size: number, mult: number): number {
  return Math.round(Math.min(SCATTER_DIALS.maxItems, Math.max(8, (size * size) / 45)) * mult)
}

function themeMult(themes: readonly string[]): number {
  return themes.includes('forest') ? SCATTER_DIALS.forestMult : themes.includes('desert') ? SCATTER_DIALS.desertMult : 1
}

// Kind from the substrate — the phase-1 surface-material + moisture logic, kept.
function kindFor(draft: PassCtx['draft'], x: number, y: number, m: number, r: Rng): ScatterKind {
  const mat = matAt(draft, x, y)
  if (mat === 'sand') return nearWater(draft, x, y) ? 'reed' : 'rock'
  if (mat === 'dirt') return r.chance(0.6) ? 'rock' : 'stump'
  return m > 0.55 ? 'tree' : r.chance(0.5) ? 'bush' : 'flower'
}

// Water cells are never placeable for scatter (fillers or clump members) —
// nor is 'road' (only the river's bridge strips paint it in this recipe; a
// tree sprouting mid-plank reads wrong and clutters the choke).
function onWater(draft: PassCtx['draft'], x: number, y: number): boolean {
  const mat = matAt(draft, x, y)
  return mat === 'deep-water' || mat === 'shallow-water' || mat === 'road'
}

function pushScatter(draft: PassCtx['draft'], x: number, y: number, kind: ScatterKind, r: Rng, intent: ScatterIntent): void {
  draft.scatter.push({
    kind, x: r2(x), y: r2(y),
    size: r2(KIND_SIZE[kind] * r.range(0.75, 1.25)),
    seed: r.int(1 << 30), solid: false, intent,
  })
}

// scatter-fill: a jittered grid gives blue-noise candidates (one per spacing²
// cell, min-gap by construction). Density modulation is a per-cell WEIGHT
// (moist thickens, apron thins); the budget is then spread across the WHOLE map
// proportional to weight — a global scale, never a top-down hard stop (which
// would pile all the fill in the first rows and leave the rest bare).
const scatterFillPass = {
  id: 'scatter-fill',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size, spawnApron } = params
    const mult = themeMult(params.themes)
    const cap = Math.round(scatterCap(size, mult) * SCATTER_DIALS.fillShare)
    const r = rng('fill')
    const spacing = SCATTER_DIALS.fillSpacing
    const cols = Math.ceil(size / spacing)
    const cx = size / 2, cy = size / 2
    // Pass A: gather placeable jittered candidates + each cell's density weight.
    const cand: { x: number; y: number; m: number; w: number }[] = []
    let totalW = 0
    for (let gy = 0; gy < cols; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x = (gx + r.range(0.15, 0.85)) * spacing
        const y = (gy + r.range(0.15, 0.85)) * spacing
        if (x < 1 || y < 1 || x > size - 1 || y > size - 1) continue
        if (!isPlaceable(draft, { x, y }, 0.5) || onWater(draft, x, y)) continue
        const m = fields.moisture(x, y)
        let w = SCATTER_DIALS.baseDensity * mult *
          (1 - SCATTER_DIALS.moistureBias + SCATTER_DIALS.moistureBias * m)
        const dist = Math.hypot(x - cx, y - cy)
        if (dist < spawnApron * 2) {
          const t = Math.max(0, (dist - spawnApron) / spawnApron) // 0 at apron edge → 1 two-apron out
          w *= Math.min(1, (1 - SCATTER_DIALS.apronThin) + t * SCATTER_DIALS.apronThin)
        }
        cand.push({ x, y, m, w })
        totalW += w
      }
    }
    // Pass B: scale keep-probability so the EXPECTED count ≈ min(cap, ΣweightW),
    // spread across the whole field weighted by moisture — no spatial bias.
    const scale = totalW > cap ? cap / totalW : 1
    let placed = 0
    for (const cell of cand) {
      if (placed >= cap) break
      if (!r.chance(Math.min(1, cell.w * scale))) continue
      pushScatter(draft, cell.x, cell.y, kindFor(draft, cell.x, cell.y, cell.m, r), r, 'field')
      placed++
    }
    note(`scatter-fill: ${placed} fillers of ${cand.length} candidates (cap ${cap})`)
    if (placed >= cap) note(`scatter-fill capped at ${cap}`)
  },
}

// scatter-clumps: a few centres, each a radial burst + understory ring. Reads
// as groves (moist) / flower beds (drier grass) rather than a uniform field.
const scatterClumpsPass = {
  id: 'scatter-clumps',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size } = params
    const mult = themeMult(params.themes)
    const cap = Math.round(scatterCap(size, mult) * SCATTER_DIALS.clumpShare)
    const areaScale = (size * size) / (96 * 96)
    const count = Math.max(1, Math.round(SCATTER_DIALS.clumpCount * areaScale * mult))
    const r = rng('clumps')
    const radius = SCATTER_DIALS.clumpRadius
    let placed = 0
    let clumps = 0
    for (let c = 0; c < count && placed < cap; c++) {
      // Pick a suitable centre: sample a handful, bias to the MOISTEST placeable
      // non-water/non-sand ground (groves want good soil, never a lake or dune).
      let center: { x: number; y: number; m: number } | null = null
      for (let s = 0; s < 12; s++) {
        const x = r.range(3, size - 3), y = r.range(3, size - 3)
        if (!isPlaceable(draft, { x, y }, 1) || onWater(draft, x, y)) continue
        if (matAt(draft, x, y) === 'sand') continue
        const m = fields.moisture(x, y)
        if (!center || m > center.m) center = { x, y, m }
      }
      if (!center) continue
      clumps++
      // moist → tree grove; drier grass → flower bed.
      const clumpKind: ScatterKind = center.m > 0.5 ? 'tree' : 'flower'
      // radial BURST with centre-weighted falloff.
      const bursts = Math.round(radius * radius * SCATTER_DIALS.clumpDensity)
      for (let i = 0; i < bursts && placed < cap; i++) {
        const ang = r.next() * Math.PI * 2
        const rr = Math.pow(r.next(), SCATTER_DIALS.clumpFalloff) * radius
        const x = center.x + Math.cos(ang) * rr, y = center.y + Math.sin(ang) * rr
        if (x < 1 || y < 1 || x > size - 1 || y > size - 1) continue
        if (!isPlaceable(draft, { x, y }, 0.4) || onWater(draft, x, y)) continue
        pushScatter(draft, x, y, clumpKind, r, 'cluster')
        placed++
      }
      // UNDERSTORY: a few low sprigs just around the centre.
      for (let u = 0; u < SCATTER_DIALS.understoryPerClump && placed < cap; u++) {
        const ang = r.next() * Math.PI * 2
        const rr = r.range(0.5, radius * 0.6)
        const x = center.x + Math.cos(ang) * rr, y = center.y + Math.sin(ang) * rr
        if (x < 1 || y < 1 || x > size - 1 || y > size - 1) continue
        if (!isPlaceable(draft, { x, y }, 0.4) || onWater(draft, x, y)) continue
        const uk: ScatterKind = clumpKind === 'tree'
          ? (r.chance(0.5) ? 'bush' : 'flower')
          : (r.chance(0.6) ? 'flower' : 'bush')
        pushScatter(draft, x, y, uk, r, 'understory')
        placed++
      }
    }
    note(`scatter-clumps: ${clumps} clumps, ${placed} items (cap ${cap})`)
    if (placed >= cap) note(`scatter-clumps capped at ${cap}`)
  },
}

// scatter-edges (§A layer 9, phase 3): EDGE features — props that hug a
// BOUNDARY rather than filling area or clumping. Two boundaries, both placing
// `intent: 'edge'` items on WALKABLE LAND just outside the feature:
//   1. shoreline reeds — walkable SHORE cells (not water) adjacent to a water
//      cell get a reed, spaced along the waterline (render resolves reed→reeds,
//      an edge-role prop that renders near water). NB: hydrology rings every
//      lake with a fat (~6-cell) sand beach, so the only walkable cell that ever
//      touches water is that inner sand band — a pure grass "land cell adjacent
//      to water" never exists here. Placing the reed line on the waterline sand
//      is what actually hugs the shore (grass 6 cells inland would not); the
//      predicate stays generator-agnostic ("walkable, non-water, touching
//      water") so a future no-beach recipe drops reeds straight on grass.
//   2. rock/hedge SKIRT — a verge ringing each outcrop WALL (material rock or
//      hedge, never the deep-water/ravine cliffs): a grass tuft (`flower`) or
//      occasional pebble (`rock`) at the base. NOT `bush`/`reed` — in the grass
//      biome those resolve to `reeds` (edge role, near-water), which reads wrong
//      at a dry rock base; `flower`/`rock` give the intended dry verge/debris.
// One rng stream ('edges'); shares the item cap via `edgeShare` so fill+clump+
// edge stay bounded near `scatterCap`.
const scatterEdgesPass = {
  id: 'scatter-edges',
  run({ draft, params, rng, note }: PassCtx) {
    const { size } = params
    const mult = themeMult(params.themes)
    const cap = Math.round(scatterCap(size, mult) * SCATTER_DIALS.edgeShare)
    const r = rng('edges')
    let placed = 0

    // ── 1. rock / hedge skirt ───────────────────────────────────────────────
    // Sample each outcrop WALL's perimeter, offset `skirtInset` outward onto the
    // land at its base. Density scales with perimeter × `skirtDensity`. Skirts
    // run BEFORE reeds: they're bounded by the (few) walls' perimeter, so taking
    // their modest slice first keeps a long shoreline's reeds from starving them.
    const walls = draft.collision.filter((c) => c.material === 'rock' || c.material === 'hedge')
    const inset = SCATTER_DIALS.skirtInset
    const skirtCap = Math.round(cap * SCATTER_DIALS.skirtBudget)
    let skirts = 0
    for (const rect of walls) {
      if (placed >= skirtCap) break
      const perim = 2 * (rect.w + rect.h)
      const samples = Math.max(3, Math.round(perim * SCATTER_DIALS.skirtDensity))
      for (let i = 0; i < samples && placed < skirtCap; i++) {
        // Walk the perimeter; project the boundary point outward along its normal.
        let t = (i / samples) * perim
        let bx: number, by: number
        if (t < rect.w) { bx = rect.x + t; by = rect.y - inset }
        else if ((t -= rect.w) < rect.h) { bx = rect.x + rect.w + inset; by = rect.y + t }
        else if ((t -= rect.h) < rect.w) { bx = rect.x + rect.w - t; by = rect.y + rect.h + inset }
        else { t -= rect.w; bx = rect.x - inset; by = rect.y + rect.h - t }
        const px = bx + r.range(-0.25, 0.25), py = by + r.range(-0.25, 0.25)
        if (px < 1 || py < 1 || px > size - 1 || py > size - 1) continue
        if (onWater(draft, px, py)) continue
        if (!isPlaceable(draft, { x: px, y: py }, 0.2)) continue
        const kind: ScatterKind = r.chance(SCATTER_DIALS.skirtRockChance) ? 'rock' : 'flower'
        pushScatter(draft, px, py, kind, r, 'edge')
        skirts++; placed++
      }
    }

    // ── 2. shoreline reeds ──────────────────────────────────────────────────
    // One reed per `edgeSpacing` cell along the waterline, thinned by
    // `shoreDensity`. A walkable non-water cell qualifies when any of its 8
    // neighbours is water — in this recipe that's the inner sand beach; the reed
    // line then sits right on the waterline. Reeds fill the edge budget left
    // after the skirts.
    const spacing = SCATTER_DIALS.edgeSpacing
    const spCols = Math.ceil(size / spacing)
    const taken = new Set<number>()
    let reeds = 0
    shore: for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (placed >= cap) break shore
        const mat = matAt(draft, x, y)
        // road too: a bridge plank flanked by river water reads as "shore",
        // but a reed mid-plank sits in the tactical choke (review finding)
        if (mat === 'shallow-water' || mat === 'deep-water' || mat === 'road') continue
        let onShore = false
        for (let dy = -1; dy <= 1 && !onShore; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nm = matAt(draft, x + dx, y + dy)
            if (nm === 'shallow-water' || nm === 'deep-water') { onShore = true; break }
          }
        }
        if (!onShore) continue
        const px = x + 0.5, py = y + 0.5
        if (!isPlaceable(draft, { x: px, y: py }, 0.5)) continue
        const key = Math.floor(py / spacing) * spCols + Math.floor(px / spacing)
        if (taken.has(key)) continue
        if (!r.chance(SCATTER_DIALS.shoreDensity)) continue
        taken.add(key)
        pushScatter(draft, px, py, 'reed', r, 'edge')
        reeds++; placed++
      }
    }

    note(`scatter-edges: ${reeds} shore reeds, ${skirts} skirt props (cap ${cap})`)
    if (placed >= cap) note(`scatter-edges capped at ${cap}`)
  },
}

function nearWater(draft: PassCtx['draft'], x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const m = matAt(draft, x + dx, y + dy)
      if (m === 'shallow-water' || m === 'deep-water') return true
    }
  }
  return false
}

// ── semantic: POIs, nav stubs, tactical self-description (§A layers 5+7, §L) ─
const semanticPass = {
  id: 'semantic',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size } = params
    // Spawn at the centre (the store's form-up knot), unless the caller placed one.
    if (!params.pois.some((p) => p.kind === 'spawn')) {
      addPoi(draft, { id: 'spawn', kind: 'spawn', at: { x: size / 2, y: size / 2 } })
    }
    params.pois.forEach((p, i) => addPoi(draft, { id: p.id ?? `${p.kind}-${i}`, kind: p.kind, at: p.at, tags: p.tags }))

    // One landmark at the highest placeable ground — the §H orientation
    // silhouette site (render decides WHAT stands there; we only say where).
    // A vault-sealed pocket (gates pass) is off-limits in EVERY variant —
    // kit-invariant on purpose: an open kit must not relocate the landmark,
    // and a closed bake must not strand it (the reachable rule would reroll).
    const claims = draft.scratch.get('regions') as Int32Array | undefined
    const vaultRegion = draft.scratch.get('vault-region') as number | undefined
    const r = rng('landmark')
    let best: { x: number; y: number } | null = null, bestE = -1
    for (let i = 0; i < 40; i++) {
      const x = r.range(3, size - 3), y = r.range(3, size - 3)
      if (vaultRegion !== undefined && claims &&
        claims[Math.floor(y) * draft.cols + Math.floor(x)] === vaultRegion) continue
      if (!isPlaceable(draft, { x, y }, 2)) continue
      const e = fields.elevation(x, y)
      if (e > bestE) { bestE = e; best = { x, y } }
    }
    if (best) addPoi(draft, { id: 'landmark', kind: 'landmark', at: best, tags: ['vista'] })

    // Link POIs onto the derived region graph (the `regions` pass): each POI
    // marks the node whose CLAIMED cells contain it (exact, via the 'regions'
    // scratch plane) — a node keeps only its first POI, spawn takes
    // precedence. If the regions pass was skipped (skipPasses) or derived
    // nothing, fall back to the old POI-stub nodes so the lab's layer
    // inspector still shows a nav plane instead of crashing.
    const regionNodes = draft.semantic.nav.nodes
    if (regionNodes.length && claims) {
      const byId = new Map(regionNodes.map((nd) => [nd.id, nd]))
      // link precedence spawn > portal > rest: portals are contract-rule-2
      // citizens (depth across the river reads off their nodes) and must not
      // lose their node to a gate/vault POI the gates pass inserted earlier
      const rank = (p: (typeof draft.semantic.pois)[number]) =>
        p.kind === 'spawn' ? 0 : p.kind === 'portal' ? 1 : 2
      const pois = [...draft.semantic.pois].sort((a, b) => rank(a) - rank(b))
      const unlinked: string[] = []
      for (const p of pois) {
        const xi = Math.min(draft.cols - 1, Math.max(0, Math.floor(p.at.x)))
        const yi = Math.min(draft.rows - 1, Math.max(0, Math.floor(p.at.y)))
        const region = claims[yi * draft.cols + xi]
        const nd = region >= 0 ? byId.get(`region-${region}`) : undefined
        if (nd && nd.poiId === undefined) nd.poiId = p.id
        else unlinked.push(p.id)
      }
      // no silent truncation: one poiId per node means same-region POIs
      // (portals sharing the spawn region on a 1-region map) go unlinked —
      // consumers needing portal→node arrive with track C (contract rule 2)
      if (unlinked.length) note(`${unlinked.length} POI(s) not linked to a node: ${unlinked.join(',')}`)
    } else {
      draft.semantic.nav.nodes = draft.semantic.pois.map((p) => ({ id: `nav-${p.id}`, at: p.at, poiId: p.id }))
    }

    draft.semantic.tactical = tacticalProfile(draft)
  },
}

export const FIELD_RECIPE: RecipeDef = {
  id: 'field',
  name: 'Overworld Field',
  description: 'Field-first open-world map: noise substrate → material bands → lake/ford + river/crossings + outcrops → derived region graph → proficiency gates on derived edges → scatter → POIs + tactical profile.',
  // gates right after regions: locks are structure (they claim a derived edge
  // and its pinch), scatter is dressing (isPlaceable already avoids the plug).
  passes: [surfacePass, hydrologyPass, riverPass, outcropsPass, regionsPass, gatesPass, scatterFillPass, scatterClumpsPass, scatterEdgesPass, semanticPass, premisePass],
}
