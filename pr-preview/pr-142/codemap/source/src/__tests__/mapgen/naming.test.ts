// §M story scaffolds — the shared premise pass: every recipe's bake carries a
// place name + ONE-line premise (scaffold, never prose), deterministic per
// seed, varied across seeds, and honest about the map it describes (the line
// reads the bake — water shows up as a ford, a sealed gate as an unopened
// door). Skipping the pass (layer inspector) leaves both fields null.

import { describe, it, expect } from 'vitest'
import { generateMap, RECIPE_REGISTRY } from '@/mapgen'

describe('premise pass (§M naming)', () => {
  it('every recipe fills name + a single-line premise', () => {
    for (const recipe of Object.values(RECIPE_REGISTRY)) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const r = generateMap(recipe, { recipe: recipe.id, seed, size: recipe.defaults?.size ?? 64, themes: recipe.defaults?.themes ?? [] })
        const { name, premise } = r.spec.semantic
        expect(name, `${recipe.id} seed ${seed}`).toBeTruthy()
        expect(premise, `${recipe.id} seed ${seed}`).toBeTruthy()
        expect(premise!).not.toContain('\n')
        expect(premise!.length).toBeLessThan(120)   // a scaffold, never prose
        expect(premise!).not.toMatch(/\ba [aeiou]/i)   // article agreement ("an old fen")
      }
    }
  })

  it('deterministic per seed, varied across seeds', () => {
    const at = (seed: number) => generateMap(RECIPE_REGISTRY.field, { recipe: 'field', seed, size: 48, themes: ['plains'] }).spec.semantic
    expect(at(7)).toEqual(at(7))
    const names = new Set(Array.from({ length: 8 }, (_, i) => `${at(i + 1).name}|${at(i + 1).premise}`))
    expect(names.size).toBeGreaterThan(2)
  })

  it('the premise reads the bake: a lake field gets its ford line', () => {
    // themed sweep — find a seed whose lake actually formed, then check the line
    for (let seed = 1; seed <= 12; seed++) {
      const r = generateMap(RECIPE_REGISTRY.field, { recipe: 'field', seed, size: 96, themes: ['plains', 'water'] })
      if (r.spec.collision.some((b) => b.material === 'deep-water')) {
        expect(r.spec.semantic.premise).toContain('split by a ford')
        return
      }
    }
    throw new Error('no lake formed in 12 water-themed seeds — hydrology regressed?')
  })

  it('skipping the pass leaves the scaffold null (stream isolation holds)', () => {
    const skipped = generateMap(RECIPE_REGISTRY.field, { recipe: 'field', seed: 5, size: 48, themes: ['plains'], skipPasses: ['premise'] })
    expect(skipped.spec.semantic.name).toBeNull()
    expect(skipped.spec.semantic.premise).toBeNull()
    // and the rest of the map is byte-identical to the unskipped bake
    const full = generateMap(RECIPE_REGISTRY.field, { recipe: 'field', seed: 5, size: 48, themes: ['plains'] })
    expect(skipped.spec.collision).toEqual(full.spec.collision)
    expect(skipped.spec.scatter).toEqual(full.spec.scatter)
  })
})
