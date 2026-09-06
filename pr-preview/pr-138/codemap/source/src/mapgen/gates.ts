// Recipe-agnostic lock-and-key placement (procedural-generation-architecture-plan.md L5).
//
// A lock is GRAPH machinery, not dungeon machinery: given a pinch site (a
// dungeon door, an overworld ford or ridge gap) and a prize site, this places
// the §D/§F contract — prize POI + gate POI + (if the party's kit lacks the
// tag) a sealing plug whose material follows the tag — and records the Lock
// on the semantic plane. The validator's `locks` rule then guarantees both
// directions (sealed-when-closed, delivered-when-open) for ANY recipe.
//
// Recipes own everything upstream of this call: choosing the edge (dungeon:
// a seal-tight dead-end room; overworld track C: a secondary derived
// crossing), picking the tag from their own rng stream, and proving the plug
// actually seals (the dungeon's walk-mask flood; the overworld's region
// derivation). Function-first, theme-late: the look table maps tag → themed
// concrete; pass a custom look for recipe-specific dressing (a mobility ford
// wants water, not rubble).

import type { BarrierMaterial, CollisionKind, ProficiencyTag, Pt } from './types'
import type { MapDraft } from './draft'
import { addBarrier, addPoi } from './draft'

export interface GateLook { kind: CollisionKind; material: BarrierMaterial }

// The default tag → seal dressing (dungeon flavors; overworld overrides).
export const GATE_LOOKS: Partial<Record<ProficiencyTag, GateLook>> = {
  might: { kind: 'wall', material: 'rubble' },        // collapsed passage — clear it
  arcane: { kind: 'wall', material: 'cut-stone' },    // rune-sealed door
  perception: { kind: 'wall', material: 'rock' },     // hidden door (reads as bare rock)
  mobility: { kind: 'cliff', material: 'ravine' },    // chasm — see the prize, can't cross
}
export const GATE_TAGS = Object.keys(GATE_LOOKS) as ProficiencyTag[]

export interface ProficiencyLockSite {
  tag: ProficiencyTag
  at: Pt              // the pinch (mirrored by the 'gate' POI; a closed seal centers here)
  prizeAt: Pt         // what the lock guards (a 'vault' POI, tagged `locked:<id>`)
  look?: GateLook     // seal dressing override (defaults to GATE_LOOKS[tag])
  sealHalf?: number   // half-extent of the square seal plug (default 2.25 — swallows a ≤3-wide pinch)
}

// Resolve against the deploying party's kit (params.proficiencies) and emit.
// Variant-at-deploy, resolved ONCE at bake: matching kit → the lock bakes
// OPEN and no seal geometry exists; otherwise a fat plug over the pinch.
// Caller wires the edge (`edge.lockId = id`) — the lock doesn't know its graph.
export function placeProficiencyLock(
  draft: MapDraft,
  site: ProficiencyLockSite,
): { id: string; open: boolean } {
  const { tag, at, prizeAt } = site
  const open = draft.params.proficiencies.includes(tag)
  const id = `lock-${tag}`
  addPoi(draft, { id: `${id}-prize`, kind: 'vault', at: prizeAt, tags: ['prize', `locked:${id}`] })
  addPoi(draft, { id: `${id}-gate`, kind: 'gate', at, tags: open ? [tag, 'open'] : [tag] })
  if (!open) {
    const look = site.look ?? GATE_LOOKS[tag]!
    const half = site.sealHalf ?? 2.25
    // a fat plug over the pinch — oversized so any pinch narrower than the
    // plug is sealed regardless of heading; the excess melts into the render
    addBarrier(draft, { x: at.x - half, y: at.y - half, w: half * 2, h: half * 2, kind: look.kind, material: look.material })
  }
  draft.semantic.locks.push({ id, kind: 'proficiency', tag, at, open, gates: [`${id}-prize`] })
  return { id, open }
}

export interface ShortcutLockSite {
  tag: ProficiencyTag
  at: Pt              // the pinch (mirrored by the 'gate' POI; a closed seal centers here)
  look?: GateLook     // seal dressing override (defaults to GATE_LOOKS[tag])
  sealHalf?: number   // half-extent of the square seal plug (default 2.25 — swallows a ≤3-wide pinch)
}

// A ROUTE lock, not a prize lock — the cycle-rewrite shortcut (architecture
// plan track E). It gates a graph EDGE the caller has proven redundant (a
// cycle's short way): closed = the party takes the long way around; open = the
// shortcut works. `gates: []` because no POI is behind it — the validator's
// `locks` rule then only checks gate-site approachability, and the `reachable`
// rule proves nothing was stranded. Id is namespaced `lock-shortcut-<tag>` so
// it never collides with a dead-end vault lock of the same tag on one floor.
// Caller wires the edge (`edge.lockId = id`) — the lock doesn't know its graph.
export function placeShortcutLock(
  draft: MapDraft,
  site: ShortcutLockSite,
): { id: string; open: boolean } {
  const { tag, at } = site
  const open = draft.params.proficiencies.includes(tag)
  const id = `lock-shortcut-${tag}`
  addPoi(draft, { id: `${id}-gate`, kind: 'gate', at, tags: open ? [tag, 'open'] : [tag] })
  if (!open) {
    const look = site.look ?? GATE_LOOKS[tag]!
    const half = site.sealHalf ?? 2.25
    // same fat-plug pattern as placeProficiencyLock: oversized so any pinch
    // narrower than the plug is sealed regardless of heading
    addBarrier(draft, { x: at.x - half, y: at.y - half, w: half * 2, h: half * 2, kind: look.kind, material: look.material })
  }
  draft.semantic.locks.push({ id, kind: 'proficiency', tag, at, open, gates: [] })
  return { id, open }
}
