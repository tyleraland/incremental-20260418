// Stamps / vaults — authored MapSpec fragments placed by constraint (idea
// catalog §I, ⭐"highest-leverage single item"; DCSS vaults / Unexplored set
// pieces). A stamp is DATA in the plain-registry pattern: relative geometry in
// a w×h footprint (origin = the footprint's lower-left corner, world y-up),
// resolved into the draft by `placeStamp`. Recipes decide WHERE (constraint
// matching is the recipe's business — it knows its rooms/dead-ends); stamps
// only say what they need (`fits`, footprint, barrier spend).
//
// This is where curated authoring meets generation: author a set-piece once,
// every recipe can place it under validation. Keep stamps SMALL and legible —
// a stamp that wants to be a whole map should be a recipe.

import type { MapDraft } from './draft'
import { addBarrier, addPoi, paint } from './draft'
import type { CollisionKind, BarrierMaterial, PoiKind, ScatterKind, SurfaceMaterial } from './types'

export interface StampDef {
  id: string
  w: number
  h: number
  // Placement constraint the hosting recipe honors: 'room' = inside a chamber
  // with clearance, 'dead-end' = a leaf room off the critical path (§D:
  // "dead-ends worth risking"), 'any' = anywhere with clearance.
  fits: 'room' | 'dead-end' | 'any'
  collision?: { x: number; y: number; w: number; h: number; kind: CollisionKind; material: BarrierMaterial }[]
  paint?: { x: number; y: number; w: number; h: number; m: SurfaceMaterial }[]
  scatter?: { x: number; y: number; kind: ScatterKind; size: number }[]
  pois?: { x: number; y: number; kind: PoiKind; tags?: string[] }[]
}

// Barrier rects this stamp spends — recipes budget before placing.
export function stampBarrierCost(s: StampDef): number {
  return s.collision?.length ?? 0
}

export function placeStamp(draft: MapDraft, s: StampDef, at: { x: number; y: number }, seed: number): void {
  for (const c of s.collision ?? []) {
    addBarrier(draft, { x: at.x + c.x, y: at.y + c.y, w: c.w, h: c.h, kind: c.kind, material: c.material })
  }
  for (const p of s.paint ?? []) {
    for (let y = Math.floor(at.y + p.y); y < at.y + p.y + p.h; y++) {
      for (let x = Math.floor(at.x + p.x); x < at.x + p.x + p.w; x++) paint(draft, x, y, p.m)
    }
  }
  s.scatter?.forEach((it, i) => {
    draft.scatter.push({
      kind: it.kind, x: Math.round((at.x + it.x) * 100) / 100, y: Math.round((at.y + it.y) * 100) / 100,
      size: it.size, seed: (seed + i * 7919) >>> 0, solid: false,
    })
  })
  s.pois?.forEach((p, i) => {
    addPoi(draft, { id: `${s.id}-${p.kind}-${i}`, kind: p.kind, at: { x: at.x + p.x, y: at.y + p.y }, tags: p.tags })
  })
}

// ── Starter vault set ────────────────────────────────────────────────────────

// Four pillars around a prize: cover + body-block weave with a reason to enter.
const PILLAR_VAULT: StampDef = {
  id: 'pillar-vault',
  w: 9, h: 9, fits: 'room',
  collision: [
    { x: 1.5, y: 1.5, w: 1.4, h: 1.4, kind: 'wall', material: 'cut-stone' },
    { x: 6.1, y: 1.5, w: 1.4, h: 1.4, kind: 'wall', material: 'cut-stone' },
    { x: 1.5, y: 6.1, w: 1.4, h: 1.4, kind: 'wall', material: 'cut-stone' },
    { x: 6.1, y: 6.1, w: 1.4, h: 1.4, kind: 'wall', material: 'cut-stone' },
  ],
  pois: [{ x: 4.5, y: 4.5, kind: 'vault', tags: ['prize'] }],
}

// A quiet landmark: orientation + a little life. No barrier spend.
const SHRINE: StampDef = {
  id: 'shrine',
  w: 5, h: 5, fits: 'any',
  paint: [{ x: 1, y: 1, w: 3, h: 3, m: 'stone-floor' }],
  scatter: [
    { x: 1.2, y: 1.2, kind: 'flower', size: 0.6 },
    { x: 3.8, y: 1.4, kind: 'flower', size: 0.55 },
    { x: 2.5, y: 3.8, kind: 'rock', size: 0.7 },
  ],
  pois: [{ x: 2.5, y: 2.5, kind: 'landmark', tags: ['shrine'] }],
}

// §J visible-unreachable goal pocket: treasure behind see-across bars. The
// vault POI is tagged 'optional' — the reachability rule exempts it, and it's
// the standing test case for lock-and-key (phase 4 replaces 'optional' with a
// lock whose key makes it reachable-if-openable).
const BARRED_CELL: StampDef = {
  id: 'barred-cell',
  w: 7, h: 6, fits: 'dead-end',
  collision: [
    { x: 1, y: 1, w: 0.9, h: 4, kind: 'wall', material: 'cut-stone' },   // left wall
    { x: 5.1, y: 1, w: 0.9, h: 4, kind: 'wall', material: 'cut-stone' }, // right wall
    { x: 1, y: 4.2, w: 5, h: 0.9, kind: 'wall', material: 'cut-stone' }, // back wall
    { x: 1.9, y: 1, w: 3.2, h: 0.8, kind: 'cliff', material: 'bars' },   // the bars — see in, can't walk in
  ],
  scatter: [{ x: 3.5, y: 3, kind: 'rock', size: 0.8 }],
  pois: [{ x: 3.5, y: 2.8, kind: 'vault', tags: ['optional', 'prize'] }],
}

export const STAMP_REGISTRY: Record<string, StampDef> = {
  'pillar-vault': PILLAR_VAULT,
  'shrine': SHRINE,
  'barred-cell': BARRED_CELL,
}
