import { render } from '@testing-library/react'
import { compilePaperRigDirections, nearestPaperRigHeading, PAPER_RIG_HEADINGS } from '@/render/paperRig/compile'
import { HorsePaperAsset, HORSE_PAPER_VIEWS } from '@/render/paperRig/HorsePaperAsset'
import { HORSE_PART_PAINTS, WORKBENCH_HORSE } from '@/render/paperRig/horse'

describe('paper-rig horse compiler', () => {
  it('imports the workbench horse contract without losing semantic structure', () => {
    expect(WORKBENCH_HORSE.joints).toHaveLength(21)
    expect(WORKBENCH_HORSE.plates).toHaveLength(23)
    expect(new Set(WORKBENCH_HORSE.joints.map((joint) => joint.id)).size).toBe(21)
    expect(HORSE_PART_PAINTS).toHaveLength(22)
  })

  it('deterministically compiles eight genuinely different angled views', () => {
    const a = compilePaperRigDirections(WORKBENCH_HORSE)
    const b = compilePaperRigDirections(WORKBENCH_HORSE)
    expect(a).toEqual(b)
    expect(a.map((view) => view.headingDeg)).toEqual(PAPER_RIG_HEADINGS)
    expect(new Set(a.map((view) => view.mergedD)).size).toBe(8)
    expect(a.every((view) => view.parts.length === 22)).toBe(true)
    expect(a.every((view) => !view.mergedD.includes('NaN'))).toBe(true)
    const paintByPart = new Map(a[0].parts.map((part) => [part.id, part.paint]))
    expect(a.every((view) => view.parts.every((part) => paintByPart.get(part.id) === part.paint))).toBe(true)
  })

  it('selects the nearest directional asset and collapses far LOD to one body path', () => {
    expect(nearestPaperRigHeading(-10)).toBe(0)
    expect(nearestPaperRigHeading(23)).toBe(45)
    const { container, rerender } = render(<HorsePaperAsset headingDeg={91} />)
    expect(container.querySelector('[data-rig-heading="90"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-rig-part]')).toHaveLength(22)
    rerender(<HorsePaperAsset headingDeg={91} lod="far" />)
    expect(container.querySelectorAll('[data-rig-part]')).toHaveLength(0)
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('precompiles views once for the runtime component', () => {
    expect(HORSE_PAPER_VIEWS).toHaveLength(8)
  })
})
