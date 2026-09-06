// Variant generation (asset-pipeline step 7, BACKLOG → Graphics): `wonkPathD`
// re-cuts a path deterministically, and `variants()` multiplies an archetype
// into siblings that keep its structure — command skeleton, palette roles,
// path count — so generated assets pass the palette gate by construction and
// terrain screenshots stay byte-stable.
import { describe, it, expect, vi } from 'vitest'
import { wonkPathD } from '@/render/authoring'
import { variants, cutout, TERRAIN_PROPS } from '@/render/props'
import type { Biome } from '@/render/appearance'

// Path data reduced to its command skeleton: every number → '#', whitespace
// dropped. Two paths with equal skeletons have identical command sequences.
const skeleton = (d: string) => d.replace(/-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g, '#').replace(/[\s,]+/g, '')

const BIOMES: Biome[] = ['grass', 'stone', 'plaza']

describe('variant generation', () => {
  it('wonkPathD is deterministic, seeded, and structure-preserving', () => {
    const d = 'M0 -0.75C0.55 -0.7 0.9 -0.3 0.85 0.2C0.8 0.65 0.35 0.85 0 0.85Z'
    const rng = vi.spyOn(Math, 'random')
    const a = wonkPathD(d, 7, 0.08)
    expect(rng).not.toHaveBeenCalled()
    rng.mockRestore()
    expect(wonkPathD(d, 7, 0.08)).toBe(a)          // same seed → same cut
    expect(wonkPathD(d, 8, 0.08)).not.toBe(a)      // new seed → new cut
    expect(a).not.toBe(d)                          // it actually moved something
    expect(skeleton(a)).toBe(skeleton(d))          // commands/arity unchanged
    expect(a).not.toContain('NaN')
  })

  it('keeps a cutout base+lit pair in sync and arc rotation/flags exact', () => {
    const arc = 'M-0.42 0A0.42 0.42 0 1 0 0.42 0A0.42 0.42 0 1 0 -0.42 0Z'
    const [v] = variants({ id: 'x', size: 1, paths: cutout(arc, 'woodDeep', 'wood') }, 1)
    expect(v.paths[0].d).toBe(v.paths[1].d)        // the two-tone pair still matches
    expect(v.paths[1].lit).toBe(true)
    expect(skeleton(v.paths[0].d)).toBe(skeleton(arc))
    // radii wobble but the x-rotation and sweep/large-arc flags never do
    expect(v.paths[0].d).toMatch(/A[\d.]+ [\d.]+ 0 1 0 /)
  })

  it('registry density: each biome carries archetypes ×(1 + variants), roles intact', () => {
    for (const biome of BIOMES) {
      const defs = TERRAIN_PROPS[biome]
      expect(defs.length, `${biome} density`).toBeGreaterThanOrEqual(20)
      expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length)   // unique ids
      for (const def of defs.filter((d) => d.id.includes('~'))) {
        const parent = defs.find((x) => x.id === def.id.split('~')[0])
        expect(parent, `${biome}/${def.id} has its archetype`).toBeTruthy()
        expect(def.paths.length).toBe(parent!.paths.length)
        def.paths.forEach((p, i) => {
          expect(p.fill).toBe(parent!.paths[i].fill)
          expect(p.stroke).toBe(parent!.paths[i].stroke)
          expect(skeleton(p.d)).toBe(skeleton(parent!.paths[i].d))
        })
      }
    }
  })
})
