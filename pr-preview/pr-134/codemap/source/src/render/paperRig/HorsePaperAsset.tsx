import { memo } from 'react'
import { PAPER_PALETTE } from '@/render/palette'
import { compilePaperRigDirections, nearestPaperRigHeading, PAPER_RIG_PAINT } from '@/render/paperRig/compile'
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
      {/* v2 requires fully opaque output. The semantic shadow is dropped at far
          LOD; detail adds one shared outer silhouette, then paints un-stroked
          plates/gaskets over it so joints never read as outlined stickers. */}
      {lod === 'detail' && <ellipse {...view.shadow} fill={PAPER_PALETTE.shadow} />}
      {lod === 'far' ? (
        <path d={view.mergedD} fill={PAPER_PALETTE[PAPER_RIG_PAINT.base]} stroke={PAPER_PALETTE.ink} strokeWidth="2.4" strokeLinejoin="round" />
      ) : (
        <>
          <path data-rig-outline d={view.mergedD} fill={PAPER_PALETTE.ink} stroke={PAPER_PALETTE.ink} strokeWidth="2.4" strokeLinejoin="round" />
          {view.parts.map((part) => (
            <path
              key={part.id}
              data-rig-part={part.id}
              data-rig-source={part.sourceKind}
              data-rig-group={part.compositingGroup}
              data-rig-animate={animateParts ? ANIMATED_PARTS[part.id] : undefined}
              d={part.d}
              fill={PAPER_PALETTE[part.paint]}
            />
          ))}
        </>
      )}
    </svg>
  )
})

export const HORSE_PAPER_VIEWS = HORSE_VIEWS
