// Asset-coverage self-consistency (src/render/coverage.ts). Coverage GAPS are
// intentional design debt surfaced to a human (the ?workshop=1 panel + the
// ?mapgen=1 per-map ⚠️), NOT build failures — so this suite never red-flags a
// gap. It asserts the coverage MODEL is sound (counts reconcile, every theme
// present, deterministic) and that a few known-COVERED themes report their
// capabilities correctly, so a regression that silently drops an edge/cluster
// prop would trip.
import { describe, it, expect } from 'vitest'
import { THEME_TAGS, SCATTER_KINDS } from '@/mapgen'
import { assetCoverage, coverageForTheme, coverageGaps, PROP_ROLES, themesMissingEdge } from '@/render/coverage'

describe('asset coverage model', () => {
  const cov = assetCoverage()

  it('reports exactly one entry per ThemeTag, in vocab order', () => {
    expect(cov.map((c) => c.theme)).toEqual([...THEME_TAGS])
  })

  it('byRole sums to availableCount (every prop has exactly one role)', () => {
    for (const c of cov) {
      const sum = PROP_ROLES.reduce((n, r) => n + c.byRole[r], 0)
      expect(sum).toBe(c.availableCount)
    }
  })

  it('has* flags agree with the role counts', () => {
    for (const c of cov) {
      expect(c.hasEdge).toBe(c.byRole.edge > 0)
      expect(c.hasCluster).toBe(c.byRole.cluster > 0)
      expect(c.hasUnderstory).toBe(c.byRole.understory > 0)
      expect(c.hasAccent).toBe(c.byRole.accent > 0)
    }
  })

  it('byKind keys are exactly the scatter vocab and non-negative', () => {
    for (const c of cov) {
      expect(Object.keys(c.byKind).sort()).toEqual([...SCATTER_KINDS].sort())
      for (const k of SCATTER_KINDS) expect(c.byKind[k]).toBeGreaterThanOrEqual(0)
    }
  })

  it('themedCount never exceeds availableCount (themed ⊆ available)', () => {
    for (const c of cov) expect(c.themedCount).toBeLessThanOrEqual(c.availableCount)
  })

  it('is deterministic (two calls deep-equal)', () => {
    expect(assetCoverage()).toEqual(cov)
  })

  it('a theme with no themed props reports the single total-fallback gap only', () => {
    for (const c of cov) {
      if (!c.hasThemed) {
        expect(c.gaps.length).toBe(1)
        expect(c.gaps[0]).toMatch(/no themed props/)
      }
    }
  })

  it('coverageGaps flattens to (theme, gap) pairs matching the per-theme lists', () => {
    const flat = coverageGaps()
    const expected = cov.flatMap((c) => c.gaps.map((gap) => ({ theme: c.theme, gap })))
    expect(flat).toEqual(expected)
  })
})

describe('known-covered themes report their capabilities', () => {
  // These hold in the CURRENT prop catalog (props.ts PROP_META). They pin real
  // coverage so a regression that drops the asset is caught — none of them
  // red-flags an intentional gap.
  it('dungeon + ruins have edge assets (moss / cobweb)', () => {
    expect(coverageForTheme('dungeon').hasEdge).toBe(true)
    expect(coverageForTheme('ruins').hasEdge).toBe(true)
  })
  it('water + beach have edge assets (reeds)', () => {
    expect(coverageForTheme('water').hasEdge).toBe(true)
    expect(coverageForTheme('beach').hasEdge).toBe(true)
  })
  it('city has edge assets (cobbles / flagstone)', () => {
    expect(coverageForTheme('city').hasEdge).toBe(true)
  })
  it('forest has cluster + understory (canopy / fern)', () => {
    const f = coverageForTheme('forest')
    expect(f.hasCluster).toBe(true)
    expect(f.hasUnderstory).toBe(true)
  })
})

describe('themesMissingEdge helper', () => {
  it('flags a plains-only theme set (plains has no edge/ribbon prop today)', () => {
    expect(themesMissingEdge(['plains'])).toContain('plains')
  })
  it('does not flag a theme set that includes water', () => {
    expect(themesMissingEdge(['water'])).toEqual([])
  })
})
