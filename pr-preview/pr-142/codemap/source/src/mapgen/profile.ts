// Tactical-profile annotation (idea catalog §L): the map self-describes so the
// richness reaches player decisions (deploy UI, waypoint AI). Shared by every
// recipe's semantic pass. Cheap heuristics, refined per phase — the numbers
// exist so consumers have SOMETHING to switch on from day one.

import type { TacticalProfile } from './types'
import type { MapDraft } from './draft'

export function tacticalProfile(draft: MapDraft): TacticalProfile {
  const { cols, rows, collision } = draft
  const area = cols * rows
  // Openness by CELL SAMPLING, not summed rect areas — a mask-carved dungeon's
  // cover rects overlap heavily (the merge-friendly expand step), so summing
  // double-counts and pins openness to 0.
  let blocked = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x + 0.5, cy = y + 0.5
      if (collision.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) blocked++
    }
  }

  // chokepoints: rect pairs whose facing edges leave a 1.5–4 cell gap while
  // overlapping on the cross axis — the funnel signature (a dungeon door is
  // exactly this: the two wall rects a door gap splits).
  let chokepoints = 0
  for (let i = 0; i < collision.length; i++) {
    for (let j = i + 1; j < collision.length; j++) {
      const a = collision[i], b = collision[j]
      const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
      const gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
      if (gx > 1.5 && gx < 4 && gy < 0) chokepoints++
      else if (gy > 1.5 && gy < 4 && gx < 0) chokepoints++
    }
  }

  // longLanes: sampled rows/cols whose longest wall-free (sight-free) run spans
  // most of the map — where ranged units can stretch their legs.
  const walls = collision.filter((r) => r.kind === 'wall')
  let longLanes = 0
  for (let y = 2; y < rows - 2; y += 4) {
    const cuts = walls.filter((r) => y + 0.5 > r.y && y + 0.5 < r.y + r.h).map((r) => [r.x, r.x + r.w])
    if (maxRun(cuts, cols) >= cols * 0.7) longLanes++
  }
  for (let x = 2; x < cols - 2; x += 4) {
    const cuts = walls.filter((r) => x + 0.5 > r.x && x + 0.5 < r.x + r.w).map((r) => [r.y, r.y + r.h])
    if (maxRun(cuts, rows) >= rows * 0.7) longLanes++
  }

  // coverClusters: wall masses within 2 cells merge into one usable cover blob.
  const parent = walls.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i], b = walls[j]
      const gx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
      const gy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
      if (Math.hypot(gx, gy) < 2) parent[find(i)] = find(j)
    }
  }
  const coverClusters = new Set(walls.map((_, i) => find(i))).size

  return {
    openness: Math.round(Math.max(0, Math.min(1, 1 - blocked / area)) * 100) / 100,
    barrierCount: collision.length,
    chokepoints,
    longLanes,
    coverClusters,
  }
}

function maxRun(cuts: number[][], span: number): number {
  const sorted = [...cuts].sort((a, b) => a[0] - b[0])
  let run = 0, at = 0
  for (const [s, e] of sorted) {
    run = Math.max(run, s - at)
    at = Math.max(at, e)
  }
  return Math.max(run, span - at)
}
