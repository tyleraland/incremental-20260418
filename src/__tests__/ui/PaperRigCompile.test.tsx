import { render } from '@testing-library/react'
import { compilePaperRigDirections, nearestPaperRigHeading, PAPER_RIG_HEADINGS, validatePaperRigSpec } from '@/render/paperRig/compile'
import { HorsePaperAsset, HORSE_PAPER_VIEWS } from '@/render/paperRig/HorsePaperAsset'
import { WORKBENCH_V2_HORSE } from '@/render/paperRig/horse'

describe('paper-rig horse compiler', () => {
  it('imports and validates the workbench v2 semantic package', () => {
    expect(WORKBENCH_V2_HORSE.schemaVersion).toBe('1.1.0')
    expect(WORKBENCH_V2_HORSE.generatorVersion).toBe('0.6.0')
    expect(WORKBENCH_V2_HORSE.joints).toHaveLength(21)
    expect(WORKBENCH_V2_HORSE.plates).toHaveLength(23)
    expect(WORKBENCH_V2_HORSE.gaskets).toHaveLength(20)
    expect(WORKBENCH_V2_HORSE.paintRegions).toHaveLength(3)
    expect(WORKBENCH_V2_HORSE.anchors).toHaveLength(8)
    expect(Object.keys(WORKBENCH_V2_HORSE.clips)).toEqual(['idleA', 'walkA', 'attack', 'idle', 'walk', 'hit', 'ko'])
    expect(() => validatePaperRigSpec(WORKBENCH_V2_HORSE)).not.toThrow()
  })

  it('deterministically compiles semantic groups, gaskets, and eight directions', () => {
    const a = compilePaperRigDirections(WORKBENCH_V2_HORSE)
    const b = compilePaperRigDirections(WORKBENCH_V2_HORSE)
    expect(a).toEqual(b)
    expect(a.map((view) => view.headingDeg)).toEqual(PAPER_RIG_HEADINGS)
    expect(new Set(a.map((view) => view.mergedD)).size).toBe(8)
    expect(a.every((view) => view.parts.length === 43)).toBe(true)
    expect(a.every((view) => view.parts.filter((part) => part.sourceKind === 'gasket').length === 20)).toBe(true)
    expect(a.every((view) => view.parts.filter((part) => part.sourceKind === 'coreOccluder').length === 1)).toBe(true)
    expect(a.every((view) => !view.mergedD.includes('NaN'))).toBe(true)

    const paintByPart = new Map(a[0].parts.map((part) => [part.id, part.paint]))
    expect(a.every((view) => view.parts.every((part) => paintByPart.get(part.id) === part.paint))).toBe(true)
    const groupOrder = new Map(WORKBENCH_V2_HORSE.compositingPolicy.orderedGroups.map((group, index) => [group, index]))
    expect(a.every((view) => view.parts.every((part, index) => index === 0 || groupOrder.get(view.parts[index - 1].compositingGroup)! <= groupOrder.get(part.compositingGroup)!))).toBe(true)

    const groupAt = (heading: number, id: string) => a.find((view) => view.headingDeg === heading)!.parts.find((part) => part.id === id)!.compositingGroup
    expect(groupAt(90, 'nearFrontUpperPlate')).not.toBe(groupAt(270, 'nearFrontUpperPlate'))
  })

  it('renders one outer outline, opaque joint coverage, and one far-LOD body', () => {
    expect(nearestPaperRigHeading(-10)).toBe(0)
    expect(nearestPaperRigHeading(23)).toBe(45)
    const { container, rerender } = render(<HorsePaperAsset headingDeg={91} />)
    expect(container.querySelector('[data-rig-heading="90"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-rig-part]')).toHaveLength(43)
    expect(container.querySelectorAll('[data-rig-source="gasket"]')).toHaveLength(20)
    expect(container.querySelectorAll('[data-rig-source="coreOccluder"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-rig-outline]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-rig-part][stroke]')).toHaveLength(0)
    expect(container.querySelectorAll('[opacity]')).toHaveLength(0)

    rerender(<HorsePaperAsset headingDeg={91} lod="far" />)
    expect(container.querySelectorAll('[data-rig-part]')).toHaveLength(0)
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('precompiles views once for the runtime component', () => {
    expect(HORSE_PAPER_VIEWS).toHaveLength(8)
  })
})
