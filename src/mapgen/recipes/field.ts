// The FIELD recipe — overworld, field-first (idea catalog prototyping order
// steps 1–3 in one vertical slice): macro fields → surface partition → hard
// geography (lake + ford, outcrops) → scatter → semantic. The point of this
// recipe is to prove the layers COMPOSE — each pass reads the shared substrate
// and the planes agree by construction (sand rings the water, trees follow
// moisture, outcrops sit on rough ground, the ford is walkable because the
// deep-water rects were built around it).
//
// Dungeon (graph-first) and city (road-first) are future recipes over this same
// pipeline; they share the bake/validate tail unchanged.

import type { ScatterKind, SurfaceMaterial } from '../types'
import type { PassCtx, RecipeDef } from '../pipeline'
import { addBarrier, addPoi, isPlaceable, matAt, paint } from '../draft'
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

// ── outcrops: rock/ravine/hedge masses where the ground is rough (layer 4) ───
const outcropsPass = {
  id: 'outcrops',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size } = params
    const budget = params.maxBarriers - draft.collision.length
    const target = Math.min(budget, Math.max(3, Math.round(size / 12)))
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

// ── scatter: props follow moisture + surface material (§A layer 9) ───────────
const KIND_SIZE: Record<ScatterKind, number> = { tree: 1.3, bush: 0.8, rock: 0.9, stump: 0.7, flower: 0.5, reed: 0.7 }

const scatterPass = {
  id: 'scatter',
  run({ draft, params, fields, rng, note }: PassCtx) {
    const { size } = params
    const mult = params.themes.includes('forest') ? 2.2 : params.themes.includes('desert') ? 0.5 : 1
    const target = Math.round(Math.min(96, Math.max(8, (size * size) / 45)) * mult)
    const r = rng('place')
    let placed = 0
    for (let guard = 0; placed < target && guard < target * 6; guard++) {
      const x = r.range(1, size - 1), y = r.range(1, size - 1)
      if (!isPlaceable(draft, { x, y }, 0.5)) continue
      const mat = matAt(draft, x, y)
      if (mat === 'deep-water' || mat === 'shallow-water') continue
      const m = fields.moisture(x, y)
      let kind: ScatterKind
      if (mat === 'sand') kind = nearWater(draft, x, y) ? 'reed' : 'rock'
      else if (mat === 'dirt') kind = r.chance(0.6) ? 'rock' : 'stump'
      else kind = m > 0.55 ? 'tree' : r.chance(0.5) ? 'bush' : 'flower'
      draft.scatter.push({
        kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
        size: Math.round(KIND_SIZE[kind] * r.range(0.75, 1.25) * 100) / 100,
        seed: r.int(1 << 30), solid: false,
      })
      placed++
    }
    if (placed < target) note(`scatter starved: ${placed}/${target} placed`)
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
  run({ draft, params, fields, rng }: PassCtx) {
    const { size } = params
    // Spawn at the centre (the store's form-up knot), unless the caller placed one.
    if (!params.pois.some((p) => p.kind === 'spawn')) {
      addPoi(draft, { id: 'spawn', kind: 'spawn', at: { x: size / 2, y: size / 2 } })
    }
    params.pois.forEach((p, i) => addPoi(draft, { id: p.id ?? `${p.kind}-${i}`, kind: p.kind, at: p.at, tags: p.tags }))

    // One landmark at the highest placeable ground — the §H orientation
    // silhouette site (render decides WHAT stands there; we only say where).
    const r = rng('landmark')
    let best: { x: number; y: number } | null = null, bestE = -1
    for (let i = 0; i < 40; i++) {
      const x = r.range(3, size - 3), y = r.range(3, size - 3)
      if (!isPlaceable(draft, { x, y }, 2)) continue
      const e = fields.elevation(x, y)
      if (e > bestE) { bestE = e; best = { x, y } }
    }
    if (best) addPoi(draft, { id: 'landmark', kind: 'landmark', at: best, tags: ['vista'] })

    // Nav skeleton: nodes only for a field (roads arrive with the city recipe).
    draft.semantic.nav.nodes = draft.semantic.pois.map((p) => ({ id: `nav-${p.id}`, at: p.at, poiId: p.id }))

    draft.semantic.tactical = tacticalProfile(draft)
  },
}

export const FIELD_RECIPE: RecipeDef = {
  id: 'field',
  name: 'Overworld Field',
  description: 'Field-first open-world map: noise substrate → material bands → lake/ford + outcrops → scatter → POIs + tactical profile.',
  passes: [surfacePass, hydrologyPass, outcropsPass, scatterPass, semanticPass, premisePass],
}
