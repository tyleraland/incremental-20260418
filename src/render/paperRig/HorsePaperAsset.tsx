import { memo } from 'react'
import { PAPER_PALETTE } from '@/render/palette'
import { compilePaperRigDirections, nearestPaperRigHeading } from '@/render/paperRig/compile'
import { WORKBENCH_HORSE } from '@/render/paperRig/horse'

const HORSE_VIEWS = compilePaperRigDirections(WORKBENCH_HORSE)
const viewByHeading = new Map(HORSE_VIEWS.map((view) => [view.headingDeg, view]))
const ANIMATED_PARTS: Record<string, string> = {
  neckPlate: 'horse-rig-bob',
  headPlate: 'horse-rig-bob',
  tailPlate: 'horse-rig-sway',
}

export const HorsePaperAsset = memo(function HorsePaperAsset({
  headingDeg,
  lod = 'detail',
  animateParts = false,
  size = 54,
}: {
  headingDeg: number
  lod?: 'detail' | 'far'
  animateParts?: boolean
  size?: number
}) {
  const heading = nearestPaperRigHeading(headingDeg)
  const view = viewByHeading.get(heading) ?? HORSE_VIEWS[0]
  return (
    <svg
      data-paper-rig-asset="horse"
      data-rig-heading={heading}
      data-rig-lod={lod}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className="block w-full h-full overflow-visible"
    >
      <ellipse {...view.shadow} fill={PAPER_PALETTE.shadow} opacity="0.24" />
      {lod === 'far' ? (
        <path d={view.mergedD} fill={PAPER_PALETTE.wood} stroke={PAPER_PALETTE.ink} strokeWidth="2.4" strokeLinejoin="round" />
      ) : view.parts.map((part) => (
        <path
          key={part.id}
          data-rig-part={part.id}
          data-rig-animate={animateParts ? ANIMATED_PARTS[part.id] : undefined}
          d={part.d}
          fill={PAPER_PALETTE[part.paint]}
          stroke={PAPER_PALETTE.ink}
          strokeWidth="1.15"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
})

export const HORSE_PAPER_VIEWS = HORSE_VIEWS
