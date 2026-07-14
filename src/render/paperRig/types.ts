import type { PaperRole } from '@/render/palette'

export type PaperRigVec2 = readonly [number, number]
export type PaperRigVec3 = readonly [number, number, number]
export type PaperRigSide = 'left' | 'right' | 'center'
export type PaperRigLodTier = 'silhouette' | 'major' | 'detail' | 'micro'
export type PaperRigPaletteRole = 'base' | 'secondary' | 'accent' | 'marking' | 'hoof' | 'eye' | 'equipment' | 'accessory' | 'shadow'
export type PaperRigCompositingGroup =
  | 'ground shadow'
  | 'camera-far appendages'
  | 'opaque core occluder'
  | 'core surface plates'
  | 'camera-near appendages'
  | 'paint/details/accessories'

export interface PaperRigJoint {
  id: string
  stableId: string
  parentId: string | null
  localBindPositionMeters: PaperRigVec3
  localBindRotationDegrees: PaperRigVec3
  semanticRole: string
  absoluteSide: PaperRigSide
  mirroredCounterpartId: string | null
  groundContact: boolean
  coverageGasketId: string | null
}

export type PaperRigGeometry =
  | {
    type: 'primitive'
    primitive: 'ellipse' | 'disc' | 'roundedTip'
    sizeMeters: readonly number[]
  }
  | {
    type: 'capsuleSpan' | 'taperedSpan'
    jointIds: readonly [string, string]
    widthMeters: number
    overlapRatio: number
  }
  | {
    type: 'circle'
    diameterMeters: number
  }
  | {
    type: 'closedPath'
    d: string
    coordinateSpace: 'plate-local-normalized'
  }

export type PaperRigAttachment =
  | { type: 'rigidBone'; boneId: string }
  | { type: 'jointSpan'; jointIds: readonly [string, string] }

export interface PaperRigRenderable {
  id: string
  stableId: string
  semanticRole: string
  bodyRegion: string
  side: PaperRigSide
  attachment: PaperRigAttachment
  localGeometry: PaperRigGeometry
  depthBias: number
  paletteRole: PaperRigPaletteRole
  opacity: 1
  intentionalHoles: readonly string[]
  compositingGroup: PaperRigCompositingGroup
  eligibleCompositingGroups?: readonly PaperRigCompositingGroup[] | null
  headingSwapsNearFar: boolean
  silhouetteCritical: boolean
  lodTier: PaperRigLodTier
  lodMergeGroup: string
}

export interface PaperRigPlate extends PaperRigRenderable {
  mirrorPlateId: string | null
}

export interface PaperRigGasket extends PaperRigRenderable {
  jointId: string
  diameterMeters: number
}

export interface PaperRigPaintRegion {
  id: string
  owningPlateId: string
  closedPath: string
  coordinateSpace: 'plate-local-normalized'
  paletteRole: PaperRigPaletteRole
  opacity: 1
  mirrorBehavior: 'none' | 'bilateral' | 'copy-to-mirrored-owner'
  lodTier: PaperRigLodTier
  compileMode: 'solid-overlay-clipped-to-owner'
  intentionalHoles: readonly string[]
}

export interface PaperRigAnchor {
  id: string
  boneId: string
  localPositionMeters: PaperRigVec3
  localRotationDegrees: PaperRigVec3
  moduleType: string
  paletteRole: 'accessory'
  opacity: 1
  lodTier: PaperRigLodTier
}

export interface PaperRigClip {
  id: string
  inherits: string
  durationMs: number
  loop: boolean
  easing: string
}

export interface PaperRigSpec {
  schema: 'paper-rig/1'
  schemaVersion: '1.1.0'
  generatorVersion: string
  modelId: string
  stableModelId: string
  family: string
  heightMeters: number
  scale: {
    tokenUnitsPerMeter: number
    tokenBox: readonly [number, number]
    tokenGroundPoint: PaperRigVec2
  }
  opacityInvariant: {
    requiredOpacity: 1
    gradientsAllowed: false
    filtersAllowed: false
    masksAllowed: false
    partialOpacityAllowed: false
    implicitBackgroundShadingAllowed: false
    intentionalHolesMustBeDeclared: true
  }
  joints: readonly PaperRigJoint[]
  groundContacts: readonly string[]
  plates: readonly PaperRigPlate[]
  gaskets: readonly PaperRigGasket[]
  coreOccluder: {
    id: string
    memberPlateIds: readonly string[]
    memberGasketIds: readonly string[]
    paletteRole: PaperRigPaletteRole
    opacity: 1
    intentionalHoles: readonly string[]
    compositingGroup: 'opaque core occluder'
  }
  compositingPolicy: {
    orderedGroups: readonly PaperRigCompositingGroup[]
    sortWithinGroup: string
    bilateralSwap: string
  }
  paintRegions: readonly PaperRigPaintRegion[]
  anchors: readonly PaperRigAnchor[]
  clips: Readonly<Record<string, PaperRigClip>>
  directionalBake: {
    headingsDegrees: readonly number[]
    validationElevationsDegrees: readonly number[]
  }
  lod: {
    tiers: readonly PaperRigLodTier[]
    mergeGroups: Readonly<Record<string, readonly string[]>>
    far: {
      opaqueSilhouette: true
      removeOrder: readonly PaperRigLodTier[]
      preserve: readonly string[]
      preserveFacing: true
      preserveContacts: true
    }
  }
  validation: {
    status: 'passed' | 'failed'
    issues: readonly unknown[]
  }
}

export interface CompiledPaperRigPart {
  id: string
  d: string
  paint: PaperRole
  sourceKind: 'plate' | 'gasket' | 'coreOccluder'
  compositingGroup: PaperRigCompositingGroup
  lodTier: PaperRigLodTier
}

export interface CompiledPaperRigView {
  headingDeg: number
  shadow: { cx: number; cy: number; rx: number; ry: number }
  parts: readonly CompiledPaperRigPart[]
  mergedD: string
}
