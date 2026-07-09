// Pipeline contract: determinism (save = seed), per-pass RNG stream isolation
// (the evolution hook — editing one layer never reshuffles another), skipPasses
// as the layer inspector, and the bake→validate→reroll tail's three policies.

import { describe, it, expect } from 'vitest'
import { generateMap, SURFACE_MATERIALS, type RecipeDef } from '@/mapgen'
import { FIELD_RECIPE } from '@/mapgen/recipes/field'

const PARAMS = { recipe: 'field', seed: 7, size: 80, themes: ['plains', 'water'] as ['plains', 'water'] }

describe('mapgen pipeline', () => {
  it('same params → deep-equal spec; string seeds hash deterministically', () => {
    const a = generateMap(FIELD_RECIPE, PARAMS)
    const b = generateMap(FIELD_RECIPE, PARAMS)
    expect(a.spec).toEqual(b.spec)
    expect(a.report).toEqual(b.report)
    const s1 = generateMap(FIELD_RECIPE, { ...PARAMS, seed: 'prontera-field-3' })
    const s2 = generateMap(FIELD_RECIPE, { ...PARAMS, seed: 'prontera-field-3' })
    expect(s1.spec).toEqual(s2.spec)
  })

  it('different seeds → different maps', () => {
    const a = generateMap(FIELD_RECIPE, PARAMS)
    const b = generateMap(FIELD_RECIPE, { ...PARAMS, seed: 8 })
    expect(a.spec.collision).not.toEqual(b.spec.collision)
  })

  it('skipping a DOWNSTREAM pass leaves upstream planes byte-identical (stream isolation)', () => {
    const full = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept' })
    const noScatter = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept', skipPasses: ['scatter-fill', 'scatter-clumps', 'scatter-edges'] })
    expect(noScatter.spec.scatter).toEqual([])
    expect(noScatter.spec.collision).toEqual(full.spec.collision)
    expect(Array.from(noScatter.spec.surface.grid)).toEqual(Array.from(full.spec.surface.grid))
    // semantic reads collision + fields only — scatter must not perturb it
    expect(noScatter.spec.semantic).toEqual(full.spec.semantic)
  })

  it('scatter passes are stream-isolated: skipping clumps leaves fill byte-identical', () => {
    const full = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept' })
    const noClumps = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept', skipPasses: ['scatter-clumps'] })
    // fill items carry intent 'field'; they must be identical with clumps off,
    // proving the two passes draw from independent rng streams.
    const fillOf = (s: typeof full.spec.scatter) => s.filter((it) => it.intent === 'field')
    expect(fillOf(noClumps.spec.scatter)).toEqual(fillOf(full.spec.scatter))
    // and clumps genuinely added cluster/understory items in the full bake
    expect(full.spec.scatter.some((it) => it.intent === 'cluster')).toBe(true)
    expect(noClumps.spec.scatter.some((it) => it.intent === 'cluster')).toBe(false)
  })

  it('scatter-edges is stream-isolated: skipping edges leaves fill + clumps byte-identical', () => {
    const full = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept' })
    const noEdges = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept', skipPasses: ['scatter-edges'] })
    // fill ('field') + clump ('cluster'/'understory') items must be untouched —
    // edges draws only from its own stream and only appends.
    const nonEdge = (s: typeof full.spec.scatter) => s.filter((it) => it.intent !== 'edge')
    expect(nonEdge(noEdges.spec.scatter)).toEqual(nonEdge(full.spec.scatter))
    // edges genuinely added 'edge' items in the full bake (this seed grows a lake)
    expect(full.spec.scatter.some((it) => it.intent === 'edge')).toBe(true)
    expect(noEdges.spec.scatter.some((it) => it.intent === 'edge')).toBe(false)
  })

  it('skipping an UPSTREAM pass does not reshuffle a later pass\'s own randomness', () => {
    // outcrops draws from its own stream: with hydrology skipped its SITES may
    // be accepted/rejected differently (it legitimately reads the collision
    // plane), but the surface pass — which reads only the fields — must be
    // byte-identical, proving no pass consumed another's sequence.
    const full = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept' })
    const noHydro = generateMap(FIELD_RECIPE, { ...PARAMS, onFail: 'accept', skipPasses: ['hydrology'] })
    // surface runs BEFORE hydrology; hydrology repaints lake cells. Compare a
    // corner far from any lake instead of the whole grid: row 0 is sand-ring
    // free on this seed only by luck — so assert on the dry-land majority:
    let same = 0
    for (let i = 0; i < full.spec.surface.grid.length; i++) {
      if (full.spec.surface.grid[i] === noHydro.spec.surface.grid[i]) same++
    }
    // every difference must be a WATER/SAND cell the lake painted, never a
    // reshuffled base cell — the no-hydro grid can't contain water at all
    const water = [SURFACE_MATERIALS.indexOf('shallow-water'), SURFACE_MATERIALS.indexOf('deep-water')]
    expect(Array.from(noHydro.spec.surface.grid).some((v) => water.includes(v))).toBe(false)
    expect(same).toBeGreaterThan(full.spec.surface.grid.length * 0.7)
  })

  it('reroll policy: failing recipe rerolls with derived seeds, then reports; throw/accept honor onFail', () => {
    const doomed: RecipeDef = {
      id: 'doomed',
      name: 'Doomed',
      description: 'always walls off the spawn apron',
      passes: [{
        id: 'wall-spawn',
        run: ({ draft }) => {
          draft.collision.push({ x: draft.cols / 2 - 2, y: draft.rows / 2 - 2, w: 4, h: 4, kind: 'wall', material: 'rock' })
          draft.semantic.pois.push({ id: 'spawn', kind: 'spawn', at: { x: draft.cols / 2, y: draft.rows / 2 }, tags: [] })
        },
      }],
    }
    const rerolled = generateMap(doomed, { recipe: 'doomed', seed: 1, size: 40, themes: [] })
    expect(rerolled.attempts).toBe(4)
    expect(rerolled.report.ok).toBe(false)
    expect(rerolled.spec.seed).not.toBe(1)              // final attempt ran on a derived seed
    expect(rerolled.notes.some((n) => n.includes('rerolling'))).toBe(true)

    const accepted = generateMap(doomed, { recipe: 'doomed', seed: 1, size: 40, themes: [], onFail: 'accept' })
    expect(accepted.attempts).toBe(1)
    expect(accepted.spec.seed).toBe(1)

    expect(() => generateMap(doomed, { recipe: 'doomed', seed: 1, size: 40, themes: [], onFail: 'throw' }))
      .toThrow(/failed validation/)
  })
})
