// Map generation — the pass pipeline (idea catalog §A: "ordered passes; each an
// independent, prototypable building block").
//
// A recipe is DATA: an ordered list of named passes over one shared MapDraft.
// The runner owns everything passes shouldn't reinvent:
//   - seeding: each pass draws from its own RNG STREAM (rng.ts) — inserting or
//     skipping a pass never reshuffles its neighbours' randomness, so the
//     layer-inspector (`skipPasses`) and future pass insertions diff cleanly;
//   - the bake + validate tail with the reroll/accept/throw policy;
//   - notes: passes report what they capped or dropped (no silent truncation).
//
// Passes mutate the draft in place through draft.ts helpers. Keep them pure
// given (draft, ctx): no module state, no Date, no Math.random.

import type { GenParams, GenResult } from './types'
import { bake, makeDraft, normalizeParams, type MapDraft, type NormParams } from './draft'
import { makeFields, type FieldBundle } from './fields'
import { streamRng, type Rng } from './rng'
import { validate } from './validate'

export interface PassCtx {
  draft: MapDraft
  params: NormParams
  fields: FieldBundle
  // Named stream scoped to THIS pass (+ optional sub-stream). Two passes asking
  // for the same name still get independent sequences.
  rng: (name?: string) => Rng
  note: (msg: string) => void
}

export interface PassDef {
  id: string
  run(ctx: PassCtx): void
}

export interface RecipeDef {
  id: string
  name: string
  description: string
  passes: PassDef[]
  // Recipe-appropriate param defaults (a dungeon wants a small spawn apron —
  // its spawn sits in a room, not an open field). Caller params always win.
  defaults?: Partial<Pick<GenParams, 'size' | 'themes' | 'maxBarriers' | 'spawnApron'>>
}

const MAX_ATTEMPTS = 4

// Derive the next attempt's seed. Deterministic, so "seed 7 rerolled twice"
// reproduces forever; distinct from seed+1 so neighbouring user seeds don't
// collide with reroll chains.
const rerollSeed = (seed: number) => (seed + 0x9e3779b9) >>> 0

export function generateMap(recipe: RecipeDef, rawParams: GenParams): GenResult {
  // Recipe defaults fill only the holes the caller left (explicit undefined
  // counts as a hole, so spreads compose predictably).
  const withDefaults: GenParams = { ...rawParams }
  const bag = withDefaults as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(recipe.defaults ?? {})) {
    if (bag[k] === undefined) bag[k] = v
  }
  const base = normalizeParams({ ...withDefaults, recipe: recipe.id })
  const notes: string[] = []
  let seed = base.seed
  let last: GenResult | null = null
  // DEV-ONLY (base.debug): the accepted attempt's scratch, captured for the
  // ?mapgen=1 lab. Tracks each attempt's draft so after the loop it holds the
  // accepted (passing or final) attempt's derived planes. Never touches spec.
  let lastScratch: Map<string, unknown> | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const params: NormParams = { ...base, seed }
    const draft = makeDraft(params)
    const fields = makeFields(seed, params.size)
    for (const pass of recipe.passes) {
      if (params.skipPasses.includes(pass.id)) { notes.push(`skip:${pass.id}`); continue }
      pass.run({
        draft,
        params,
        fields,
        rng: (name = '') => streamRng(seed, `${pass.id}:${name}`),
        note: (msg) => notes.push(`${pass.id}: ${msg}`),
      })
    }
    const spec = bake(draft)
    const report = validate(spec, params)
    last = { spec, report, attempts: attempt, notes }
    lastScratch = draft.scratch
    if (report.ok || base.onFail !== 'reroll') break
    notes.push(`attempt ${attempt} failed: ${report.rules.filter((r) => !r.ok).map((r) => r.rule).join(',')} — rerolling`)
    seed = rerollSeed(seed)
  }

  // Attach the derived planes ONLY under the dev debug flag. This rides the
  // in-memory GenResult exclusively — it is never baked or serialized, so
  // non-debug callers (adapter, fuzz gates, save path) see byte-identical
  // behavior and the spec stays the sole persisted contract.
  if (base.debug && lastScratch) last!.scratch = lastScratch

  if (!last!.report.ok && base.onFail === 'throw') {
    throw new Error(
      `mapgen: ${recipe.id} seed ${base.seed} failed validation after ${last!.attempts} attempt(s): ` +
      last!.report.rules.filter((r) => !r.ok).map((r) => `${r.rule} (${r.detail})`).join('; '),
    )
  }
  return last!
}
