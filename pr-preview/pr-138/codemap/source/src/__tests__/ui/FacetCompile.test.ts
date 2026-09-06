import { compileFacetDirections, compileFacetView } from '@/render/paperRig/facet'
import type { FacetPoly } from '@/render/paperRig/facet'
import { PAPER_RIG_HEADINGS } from '@/render/paperRig/compile'
import { WORKBENCH_HORSE } from '@/render/paperRig/horse'

describe('paper-rig facet compiler', () => {
  it('deterministically compiles eight genuinely different faceted views', () => {
    const a = compileFacetDirections(WORKBENCH_HORSE)
    const b = compileFacetDirections(WORKBENCH_HORSE)
    expect(a).toEqual(b) // byte-identical replays (render determinism contract)
    expect(a.map((view) => view.headingDeg)).toEqual(PAPER_RIG_HEADINGS)
    expect(new Set(a.map((view) => view.polys.map((p) => p.d).join(''))).size).toBe(8)
  })

  it('emits visible, valid, shaded polygons per view', () => {
    for (const view of compileFacetDirections(WORKBENCH_HORSE)) {
      expect(view.polys.length).toBeGreaterThan(20) // back-face cull still leaves a solid
      for (const poly of view.polys as FacetPoly[]) {
        expect(poly.d).toMatch(/^M[-\d.]/)
        expect(poly.d.includes('NaN')).toBe(false)
        expect(poly.shade).toBeGreaterThanOrEqual(0)
        expect(poly.shade).toBeLessThanOrEqual(1)
      }
    }
  })

  it('depth-sorts a single view far-to-near for painter ordering', () => {
    const view = compileFacetView(WORKBENCH_HORSE, 90)
    const depths = view.polys.map((p) => p.depth)
    const sorted = [...depths].sort((x, y) => y - x)
    expect(depths).toEqual(sorted)
  })
})
