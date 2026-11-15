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

// Default half-extent of the square seal plug — swallows a ≤3-wide pinch.
// Exported so recipe vetting (keyfetch's plug-footprint checks) shares one
// source of truth with the placers below.
export const SEAL_HALF = 2.25

export interface ProficiencyLockSite {
  tag: ProficiencyTag
  at: Pt              // the pinch (mirrored by the 'gate' POI; a closed seal centers here)
  prizeAt: Pt         // what the lock guards (a 'vault' POI, tagged `locked:<id>`)
  look?: GateLook     // seal dressing override (defaults to GATE_LOOKS[tag])
  sealHalf?: number   // half-extent of the square seal plug (default SEAL_HALF — swallows a ≤3-wide pinch)
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
    const half = site.sealHalf ?? SEAL_HALF
    // a fat plug over the pinch — oversized so any pinch narrower than the
    // plug is sealed regardless of heading; the excess melts into the render.
    // lockId marks the plug as THIS lock's seal geometry (solve.ts removes it
    // when reasoning about openable locks; the engine adapter drops the field).
    addBarrier(draft, { x: at.x - half, y: at.y - half, w: half * 2, h: half * 2, kind: look.kind, material: look.material, lockId: id })
  }
  draft.semantic.locks.push({ id, kind: 'proficiency', tag, at, open, gates: [`${id}-prize`] })
  return { id, open }
}

export interface ShortcutLockSite {
  tag: ProficiencyTag
  at: Pt              // the pinch (mirrored by the 'gate' POI; a closed seal centers here)
  look?: GateLook     // seal dressing override (defaults to GATE_LOOKS[tag])
  sealHalf?: number   // half-extent of the square seal plug (default SEAL_HALF — swallows a ≤3-wide pinch)
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
    const half = site.sealHalf ?? SEAL_HALF
    // same fat-plug pattern as placeProficiencyLock: oversized so any pinch
    // narrower than the plug is sealed regardless of heading
    addBarrier(draft, { x: at.x - half, y: at.y - half, w: half * 2, h: half * 2, kind: look.kind, material: look.material, lockId: id })
  }
  draft.semantic.locks.push({ id, kind: 'proficiency', tag, at, open, gates: [] })
  return { id, open }
}

// The default key-lock dressing: bars (§J "target it, can't reach it") — the
// party can SEE the vault through the portcullis; the key raises it.
export const KEY_LOOK: GateLook = { kind: 'cliff', material: 'bars' }

export interface KeyLockSite {
  at: Pt              // the pinch (mirrored by the 'gate' POI; a closed seal centers here)
  prizeAt: Pt         // what the lock guards (a 'vault' POI, tagged `locked:<id>`)
  keyAt: Pt           // where the key sits (a 'key' POI, tagged `opens:<id>`) — caller proves it reachable
  look?: GateLook     // seal dressing override (defaults to KEY_LOOK)
  sealHalf?: number   // half-extent of the square seal plug (default SEAL_HALF — swallows a ≤3-wide pinch)
}

// A KEY lock (§D key logistics): the prize opens when the party HOLDS the key
// — resolved against params.heldKeys at bake, exactly like the proficiency
// kit. The key itself is a 'key' POI the caller places on the provably
// ungated subgraph (solve.ts's fixpoint + the validator's `key-flow` rule
// prove acquirability, chains included). Id is the key-lock ordinal — stable
// PER ATTEMPT because placement is kit/key-invariant (as-if-closed). Reroll
// chains can still diverge between variants (one variant failing validation
// re-seeds while the other passes attempt 1) — the same caveat every lock
// resolution carries (see locks.test.ts's attempts===1 notes).
// Caller wires the edge (`edge.lockId = id`) — the lock doesn't know its graph.
export function placeKeyLock(
  draft: MapDraft,
  site: KeyLockSite,
): { id: string; open: boolean } {
  const { at, prizeAt, keyAt } = site
  const id = `lock-key-${draft.semantic.locks.filter((l) => l.kind === 'key').length}`
  const open = draft.params.heldKeys.includes(id)
  addPoi(draft, { id: `${id}-prize`, kind: 'vault', at: prizeAt, tags: ['prize', `locked:${id}`] })
  addPoi(draft, { id: `${id}-gate`, kind: 'gate', at, tags: open ? ['key', 'open'] : ['key'] })
  addPoi(draft, { id: `${id}-key`, kind: 'key', at: keyAt, tags: [`opens:${id}`] })
  if (!open) {
    const look = site.look ?? KEY_LOOK
    const half = site.sealHalf ?? SEAL_HALF
    // same fat-plug pattern as the proficiency locks; lockId makes the seal
    // geometry first-class for the solver
    addBarrier(draft, { x: at.x - half, y: at.y - half, w: half * 2, h: half * 2, kind: look.kind, material: look.material, lockId: id })
  }
  draft.semantic.locks.push({ id, kind: 'key', at, open, gates: [`${id}-prize`] })
  return { id, open }
}
