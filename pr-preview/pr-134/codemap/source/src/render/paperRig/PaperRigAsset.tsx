import { memo } from 'react'
import { PAPER_PALETTE } from '@/render/palette'
import type { CompiledPaperRigPart, CompiledPaperRigView } from '@/render/paperRig/types'

export type PaperRigArtStyle = 'rim-ink' | 'stencil-5'

const STENCIL_BANDS = [
  PAPER_PALETTE.rigStencil0,
  PAPER_PALETTE.rigStencil1,
  PAPER_PALETTE.rigStencil2,
  PAPER_PALETTE.rigStencil3,
  PAPER_PALETTE.rigStencil4,
] as const

function rimFill(part: CompiledPaperRigPart) {
  if (part.paletteRole === 'eye') return PAPER_PALETTE.rigRimInk
  if (part.paletteRole === 'hoof') return PAPER_PALETTE.rigRimAccent
  if (part.paletteRole === 'accent' || part.paletteRole === 'accessory') return PAPER_PALETTE.rigRimLight
  if (part.paletteRole === 'secondary') return PAPER_PALETTE.rigRimShade
  if (part.sourceKind === 'coreOccluder') return PAPER_PALETTE.rigRimBase
  if (part.compositingGroup === 'camera-far appendages') return PAPER_PALETTE.rigRimShade
  if (part.compositingGroup === 'camera-near appendages') return PAPER_PALETTE.rigRimLight
  return PAPER_PALETTE.rigRimBase
}

function stencilFill(part: CompiledPaperRigPart) {
  if (part.paletteRole === 'eye') return PAPER_PALETTE.rigStencil0
  if (part.sourceKind === 'coreOccluder') return PAPER_PALETTE.rigStencil2
  return STENCIL_BANDS[part.depthBand]
}

export const PaperRigAsset = memo(function PaperRigAsset({
  specimen,
  view,
  artStyle,
  size = 220,
}: {
  specimen: string
  view: CompiledPaperRigView
  artStyle: PaperRigArtStyle
  size?: number
}) {
  const rim = artStyle === 'rim-ink'
  return (
    <svg
      data-paper-rig-asset={specimen}
      data-paper-rig-style={artStyle}
      data-rig-heading={view.headingDeg}
      data-rig-elevation={view.elevationDeg}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${specimen} in ${artStyle} style at ${view.elevationDeg} degrees elevation`}
      className="block w-full h-full overflow-visible"
    >
      <ellipse {...view.shadow} fill={PAPER_PALETTE.rigGround} />
      <path
        data-rig-outline
        d={view.mergedD}
        fill={rim ? PAPER_PALETTE.rigRimInk : PAPER_PALETTE.rigStencil0}
        stroke={rim ? PAPER_PALETTE.rigRimInk : PAPER_PALETTE.rigStencil0}
        strokeWidth={rim ? 3.4 : 2.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {view.parts.map((part) => (
        <path
          key={part.id}
          data-rig-part={part.id}
          data-rig-source={part.sourceKind}
          data-rig-group={part.compositingGroup}
          data-rig-depth-band={part.depthBand}
          d={part.d}
          fill={rim ? rimFill(part) : stencilFill(part)}
        />
      ))}
    </svg>
  )
})
