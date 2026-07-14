import type {
  PaperRigAnchor,
  PaperRigClip,
  PaperRigCompositingGroup,
  PaperRigGasket,
  PaperRigJoint,
  PaperRigLodTier,
  PaperRigPaintRegion,
  PaperRigPaletteRole,
  PaperRigPlate,
  PaperRigSide,
  PaperRigSpec,
  PaperRigVec3,
} from '@/render/paperRig/types'

const v = (x: number, y: number, z: number): PaperRigVec3 => [x, y, z]
const APPENDAGE_GROUPS = ['camera-far appendages', 'camera-near appendages'] as const

function joint(
  id: string,
  parentId: string | null,
  localBindPositionMeters: PaperRigVec3,
  semanticRole: string,
  options: Partial<Pick<PaperRigJoint, 'absoluteSide' | 'mirroredCounterpartId' | 'groundContact' | 'coverageGasketId'>> = {},
): PaperRigJoint {
  return {
    id,
    stableId: id,
    parentId,
    localBindPositionMeters,
    localBindRotationDegrees: v(0, 0, 0),
    semanticRole,
    absoluteSide: options.absoluteSide ?? 'center',
    mirroredCounterpartId: options.mirroredCounterpartId ?? null,
    groundContact: options.groundContact ?? false,
    coverageGasketId: options.coverageGasketId ?? (parentId ? `${id}Gasket` : null),
  }
}

interface PlateOptions {
  id: string
  boneId: string
  size: readonly [number, number]
  semanticRole: string
  bodyRegion: string
  side?: PaperRigSide
  depthBias: number
  paletteRole: PaperRigPaletteRole
  compositingGroup: PaperRigCompositingGroup
  headingSwapsNearFar?: boolean
  silhouetteCritical: boolean
  lodTier: PaperRigLodTier
  lodMergeGroup: string
  mirrorPlateId?: string | null
}

function plate(options: PlateOptions): PaperRigPlate {
  return {
    id: options.id,
    stableId: options.id,
    semanticRole: options.semanticRole,
    bodyRegion: options.bodyRegion,
    side: options.side ?? 'center',
    attachment: { type: 'rigidBone', boneId: options.boneId },
    localGeometry: { type: 'primitive', primitive: 'ellipse', sizeMeters: options.size },
    depthBias: options.depthBias,
    paletteRole: options.paletteRole,
    opacity: 1,
    intentionalHoles: [],
    compositingGroup: options.compositingGroup,
    eligibleCompositingGroups: options.headingSwapsNearFar ? APPENDAGE_GROUPS : null,
    headingSwapsNearFar: options.headingSwapsNearFar ?? false,
    silhouetteCritical: options.silhouetteCritical,
    lodTier: options.lodTier,
    lodMergeGroup: options.lodMergeGroup,
    mirrorPlateId: options.mirrorPlateId ?? null,
  }
}

function span(options: Omit<PlateOptions, 'boneId' | 'size'> & { from: string; to: string; width: number }): PaperRigPlate {
  return {
    ...plate({ ...options, boneId: options.to, size: [options.width, options.width] }),
    attachment: { type: 'jointSpan', jointIds: [options.from, options.to] },
    localGeometry: { type: 'capsuleSpan', jointIds: [options.from, options.to], widthMeters: options.width, overlapRatio: 1.18 },
  }
}

interface GasketOptions {
  id: string
  jointId: string
  diameter: number
  bodyRegion: string
  side?: PaperRigSide
  depthBias: number
  paletteRole: PaperRigPaletteRole
  compositingGroup: PaperRigCompositingGroup
  headingSwapsNearFar?: boolean
  lodMergeGroup: string
}

function gasket(options: GasketOptions): PaperRigGasket {
  return {
    id: options.id,
    stableId: options.id,
    jointId: options.jointId,
    semanticRole: 'jointGasket',
    bodyRegion: options.bodyRegion,
    side: options.side ?? 'center',
    diameterMeters: options.diameter,
    attachment: { type: 'rigidBone', boneId: options.jointId },
    localGeometry: { type: 'circle', diameterMeters: options.diameter },
    depthBias: options.depthBias,
    paletteRole: options.paletteRole,
    opacity: 1,
    intentionalHoles: [],
    compositingGroup: options.compositingGroup,
    eligibleCompositingGroups: options.headingSwapsNearFar ? APPENDAGE_GROUPS : null,
    headingSwapsNearFar: options.headingSwapsNearFar ?? false,
    silhouetteCritical: false,
    lodTier: 'detail',
    lodMergeGroup: options.lodMergeGroup,
  }
}

const sideFor = (name: string): PaperRigSide => name.startsWith('near') ? 'left' : 'right'
const groupFor = (name: string): PaperRigCompositingGroup => name.startsWith('near') ? 'camera-near appendages' : 'camera-far appendages'
const opposite = (name: string) => name.startsWith('near') ? `far${name.slice(4)}` : `near${name.slice(3)}`

const limbNames = ['nearFront', 'farFront', 'nearRear', 'farRear'] as const
const limbPlates: PaperRigPlate[] = limbNames.flatMap((name) => {
  const side = sideFor(name)
  const group = groupFor(name)
  const mirror = opposite(name)
  return [
    span({ id: `${name}UpperPlate`, from: `${name}Hip`, to: `${name}Knee`, width: 0.17, semanticRole: 'body', bodyRegion: 'limb', side, depthBias: 1, paletteRole: 'base', compositingGroup: group, headingSwapsNearFar: true, silhouetteCritical: false, lodTier: 'major', lodMergeGroup: `limb.${side}`, mirrorPlateId: `${mirror}UpperPlate` }),
    span({ id: `${name}LowerPlate`, from: `${name}Knee`, to: `${name}Hoof`, width: 0.14, semanticRole: 'body', bodyRegion: 'limb', side, depthBias: 1.2, paletteRole: 'base', compositingGroup: group, headingSwapsNearFar: true, silhouetteCritical: false, lodTier: 'major', lodMergeGroup: `limb.${side}`, mirrorPlateId: `${mirror}LowerPlate` }),
    plate({ id: `${name}HoofPlate`, boneId: `${name}Hoof`, size: [0.20, 0.15], semanticRole: 'accent', bodyRegion: 'hoof', side, depthBias: 0, paletteRole: 'hoof', compositingGroup: group, headingSwapsNearFar: true, silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: `hoof.${side}`, mirrorPlateId: `${mirror}HoofPlate` }),
  ]
})

const plates: PaperRigPlate[] = [
  plate({ id: 'castShadow', boneId: 'root', size: [1.55, 0.68], semanticRole: 'shadow', bodyRegion: 'groundShadow', depthBias: -99, paletteRole: 'shadow', compositingGroup: 'ground shadow', silhouetteCritical: false, lodTier: 'major', lodMergeGroup: 'groundShadow.center' }),
  span({ id: 'torsoPlate', from: 'pelvis', to: 'chest', width: 0.66, semanticRole: 'body', bodyRegion: 'core', depthBias: 3, paletteRole: 'base', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'core.center' }),
  plate({ id: 'pelvisPlate', boneId: 'pelvis', size: [0.68, 0.62], semanticRole: 'body', bodyRegion: 'core', depthBias: 3.1, paletteRole: 'base', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'core.center' }),
  span({ id: 'withersPlate', from: 'chest', to: 'neckBase', width: 0.50, semanticRole: 'body', bodyRegion: 'core', depthBias: 3.8, paletteRole: 'base', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'core.center' }),
  span({ id: 'neckPlate', from: 'neckBase', to: 'neckTip', width: 0.26, semanticRole: 'body', bodyRegion: 'neck', depthBias: 4, paletteRole: 'base', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'neck.center' }),
  span({ id: 'headConnectorPlate', from: 'neckTip', to: 'head', width: 0.30, semanticRole: 'body', bodyRegion: 'head', depthBias: 4.8, paletteRole: 'base', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'head.center' }),
  plate({ id: 'headPlate', boneId: 'head', size: [0.40, 0.54], semanticRole: 'body', bodyRegion: 'head', depthBias: 5, paletteRole: 'base', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'head.center' }),
  span({ id: 'muzzleConnectorPlate', from: 'head', to: 'muzzle', width: 0.23, semanticRole: 'accent', bodyRegion: 'head', depthBias: 5.05, paletteRole: 'secondary', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'head.center' }),
  plate({ id: 'muzzlePlate', boneId: 'muzzle', size: [0.27, 0.36], semanticRole: 'accent', bodyRegion: 'head', depthBias: 5.1, paletteRole: 'secondary', compositingGroup: 'core surface plates', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'head.center' }),
  ...limbPlates,
  span({ id: 'tailConnectorPlate', from: 'pelvis', to: 'tailBase', width: 0.15, semanticRole: 'accent', bodyRegion: 'tail', depthBias: 1.9, paletteRole: 'secondary', compositingGroup: 'camera-far appendages', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'tail.center' }),
  span({ id: 'tailPlate', from: 'tailBase', to: 'tailTip', width: 0.13, semanticRole: 'accent', bodyRegion: 'tail', depthBias: 2, paletteRole: 'secondary', compositingGroup: 'camera-far appendages', silhouetteCritical: true, lodTier: 'silhouette', lodMergeGroup: 'tail.center' }),
]

const coreGaskets: PaperRigGasket[] = [
  gasket({ id: 'pelvisGasket', jointId: 'pelvis', diameter: 0.32, bodyRegion: 'core', depthBias: 3.05, paletteRole: 'base', compositingGroup: 'core surface plates', lodMergeGroup: 'core.center' }),
  gasket({ id: 'chestGasket', jointId: 'chest', diameter: 0.32, bodyRegion: 'core', depthBias: 3.75, paletteRole: 'base', compositingGroup: 'core surface plates', lodMergeGroup: 'core.center' }),
  gasket({ id: 'neckBaseGasket', jointId: 'neckBase', diameter: 0.32, bodyRegion: 'neck', depthBias: 3.95, paletteRole: 'base', compositingGroup: 'core surface plates', lodMergeGroup: 'neck.center' }),
  gasket({ id: 'neckTipGasket', jointId: 'neckTip', diameter: 0.276, bodyRegion: 'head', depthBias: 4.75, paletteRole: 'base', compositingGroup: 'core surface plates', lodMergeGroup: 'head.center' }),
  gasket({ id: 'headGasket', jointId: 'head', diameter: 0.32, bodyRegion: 'head', depthBias: 5, paletteRole: 'secondary', compositingGroup: 'core surface plates', lodMergeGroup: 'head.center' }),
  gasket({ id: 'muzzleGasket', jointId: 'muzzle', diameter: 0.2484, bodyRegion: 'head', depthBias: 5.05, paletteRole: 'secondary', compositingGroup: 'core surface plates', lodMergeGroup: 'head.center' }),
]

const limbGaskets: PaperRigGasket[] = limbNames.flatMap((name) => {
  const side = sideFor(name)
  const group = groupFor(name)
  return [
    gasket({ id: `${name}HipGasket`, jointId: `${name}Hip`, diameter: 0.1564, bodyRegion: 'limb', side, depthBias: 0.95, paletteRole: 'base', compositingGroup: group, headingSwapsNearFar: true, lodMergeGroup: `limb.${side}` }),
    gasket({ id: `${name}KneeGasket`, jointId: `${name}Knee`, diameter: 0.1564, bodyRegion: 'limb', side, depthBias: 1.15, paletteRole: 'base', compositingGroup: group, headingSwapsNearFar: true, lodMergeGroup: `limb.${side}` }),
    gasket({ id: `${name}HoofGasket`, jointId: `${name}Hoof`, diameter: 0.184, bodyRegion: 'limb', side, depthBias: 1.15, paletteRole: 'base', compositingGroup: group, headingSwapsNearFar: true, lodMergeGroup: `limb.${side}` }),
  ]
})

const gaskets: PaperRigGasket[] = [
  ...coreGaskets,
  ...limbGaskets,
  gasket({ id: 'tailBaseGasket', jointId: 'tailBase', diameter: 0.138, bodyRegion: 'tail', depthBias: 1.95, paletteRole: 'secondary', compositingGroup: 'camera-far appendages', lodMergeGroup: 'tail.center' }),
  gasket({ id: 'tailTipGasket', jointId: 'tailTip', diameter: 0.1196, bodyRegion: 'tail', depthBias: 1.95, paletteRole: 'secondary', compositingGroup: 'camera-far appendages', lodMergeGroup: 'tail.center' }),
]

const paintRegions: PaperRigPaintRegion[] = [
  { id: 'bellyColorRegion', owningPlateId: 'torsoPlate', closedPath: 'M -0.34 -0.36 C -0.08 -0.52 0.20 -0.48 0.35 -0.20 L 0.28 0.40 C 0.02 0.52 -0.24 0.46 -0.36 0.18 Z', coordinateSpace: 'plate-local-normalized', paletteRole: 'secondary', opacity: 1, mirrorBehavior: 'none', lodTier: 'detail', compileMode: 'solid-overlay-clipped-to-owner', intentionalHoles: [] },
  { id: 'faceMarkingRegion', owningPlateId: 'headConnectorPlate', closedPath: 'M -0.30 -0.10 Q 0 -0.34 0.30 -0.10 Q 0 0.18 -0.30 -0.10 Z', coordinateSpace: 'plate-local-normalized', paletteRole: 'marking', opacity: 1, mirrorBehavior: 'bilateral', lodTier: 'micro', compileMode: 'solid-overlay-clipped-to-owner', intentionalHoles: [] },
  { id: 'sockMarkingRegion', owningPlateId: 'nearFrontUpperPlate', closedPath: 'M -0.50 0 L 0.50 0 L 0.50 0.50 L -0.50 0.50 Z', coordinateSpace: 'plate-local-normalized', paletteRole: 'marking', opacity: 1, mirrorBehavior: 'copy-to-mirrored-owner', lodTier: 'micro', compileMode: 'solid-overlay-clipped-to-owner', intentionalHoles: [] },
]

const anchor = (id: string, boneId: string, localPositionMeters: PaperRigVec3, moduleType: string): PaperRigAnchor => ({ id, boneId, localPositionMeters, localRotationDegrees: v(0, 0, 0), moduleType, paletteRole: 'accessory', opacity: 1, lodTier: 'detail' })
const anchors: PaperRigAnchor[] = [
  anchor('headgearAnchor', 'head', v(0, 0, 0.18), 'hat'),
  anchor('saddleBackAnchor', 'chest', v(-0.05, 0, 0.32), 'saddle'),
  anchor('standardHatAnchor', 'head', v(0, 0, 0), 'hat'),
  anchor('standardHelmetAnchor', 'head', v(0, 0, 0), 'helmet'),
  anchor('standardCollarAnchor', 'neckBase', v(0, 0, 0), 'collar'),
  anchor('standardBackItemAnchor', 'chest', v(0, 0, 0), 'backItem'),
  anchor('standardSaddleAnchor', 'chest', v(0, 0, 0), 'saddle'),
  anchor('standardTailModuleAnchor', 'tailBase', v(0, 0, 0), 'tail'),
]

const clip = (id: string, inherits: string, durationMs: number, loop: boolean, easing: string): PaperRigClip => ({ id, inherits, durationMs, loop, easing })
const clips = {
  idleA: clip('idleA', 'bind', 1800, true, 'ease-in-out'),
  walkA: clip('walkA', 'idleA', 950, true, 'linear'),
  attack: clip('attack', 'idleA', 720, false, 'cubic-bezier(.2,.8,.2,1)'),
  idle: clip('idle', 'bind', 1800, true, 'ease-in-out'),
  walk: clip('walk', 'idle', 950, true, 'linear'),
  hit: clip('hit', 'idle', 460, false, 'cubic-bezier(.2,.8,.3,1)'),
  ko: clip('ko', 'bind', 900, false, 'ease-in'),
} satisfies Record<string, PaperRigClip>

const normalizedMergeGroups = [...plates, ...gaskets].reduce<Record<string, string[]>>((groups, part) => {
  const members = groups[part.lodMergeGroup] ?? []
  members.push(part.id)
  groups[part.lodMergeGroup] = members
  return groups
}, {})
const corePlateIds = ['torsoPlate', 'pelvisPlate', 'withersPlate', 'neckPlate', 'headConnectorPlate', 'headPlate', 'muzzleConnectorPlate', 'muzzlePlate']
const coreGasketIds = ['pelvisGasket', 'chestGasket', 'neckBaseGasket', 'neckTipGasket', 'headGasket', 'muzzleGasket']

// Typed transcription of paper-rig-workbench_v2.html's exported horse package.
// The authoring HTML stays outside the application; this fixture is the stable
// schema/import seam consumed by the compiler and runtime probe.
export const WORKBENCH_V2_HORSE: PaperRigSpec = {
  schema: 'paper-rig/1',
  schemaVersion: '1.1.0',
  generatorVersion: '0.6.0',
  modelId: 'horseBase',
  stableModelId: 'horseBase',
  family: 'quadruped',
  heightMeters: 1.62,
  scale: { tokenUnitsPerMeter: 28, tokenBox: [100, 100], tokenGroundPoint: [50, 68] },
  opacityInvariant: { requiredOpacity: 1, gradientsAllowed: false, filtersAllowed: false, masksAllowed: false, partialOpacityAllowed: false, implicitBackgroundShadingAllowed: false, intentionalHolesMustBeDeclared: true },
  joints: [
    joint('root', null, v(0, 0, 0), 'root', { coverageGasketId: null }),
    joint('pelvis', 'root', v(-0.36, 0, 0.78), 'body'),
    joint('chest', 'pelvis', v(0.72, 0, 0.24), 'body'),
    joint('neckBase', 'chest', v(0.32, 0, 0.22), 'neck'),
    joint('neckTip', 'neckBase', v(0.30, 0, 0.34), 'neck'),
    joint('head', 'neckTip', v(0.27, 0, 0.08), 'head'),
    joint('muzzle', 'head', v(0.18, 0, -0.04), 'head'),
    joint('nearFrontHip', 'chest', v(-0.10, 0.25, -0.02), 'limb', { absoluteSide: 'left', mirroredCounterpartId: 'farFrontHip' }),
    joint('nearFrontKnee', 'nearFrontHip', v(0.02, 0, -0.48), 'limb', { absoluteSide: 'left', mirroredCounterpartId: 'farFrontKnee' }),
    joint('nearFrontHoof', 'nearFrontKnee', v(0.05, 0, -0.45), 'limb', { absoluteSide: 'left', mirroredCounterpartId: 'farFrontHoof', groundContact: true }),
    joint('farFrontHip', 'chest', v(-0.10, -0.25, -0.02), 'limb', { absoluteSide: 'right', mirroredCounterpartId: 'nearFrontHip' }),
    joint('farFrontKnee', 'farFrontHip', v(0.02, 0, -0.48), 'limb', { absoluteSide: 'right', mirroredCounterpartId: 'nearFrontKnee' }),
    joint('farFrontHoof', 'farFrontKnee', v(0.05, 0, -0.45), 'limb', { absoluteSide: 'right', mirroredCounterpartId: 'nearFrontHoof', groundContact: true }),
    joint('nearRearHip', 'pelvis', v(-0.08, 0.26, -0.01), 'limb', { absoluteSide: 'left', mirroredCounterpartId: 'farRearHip' }),
    joint('nearRearKnee', 'nearRearHip', v(-0.10, 0, -0.48), 'limb', { absoluteSide: 'left', mirroredCounterpartId: 'farRearKnee' }),
    joint('nearRearHoof', 'nearRearKnee', v(0.06, 0, -0.44), 'limb', { absoluteSide: 'left', mirroredCounterpartId: 'farRearHoof', groundContact: true }),
    joint('farRearHip', 'pelvis', v(-0.08, -0.26, -0.01), 'limb', { absoluteSide: 'right', mirroredCounterpartId: 'nearRearHip' }),
    joint('farRearKnee', 'farRearHip', v(-0.10, 0, -0.48), 'limb', { absoluteSide: 'right', mirroredCounterpartId: 'nearRearKnee' }),
    joint('farRearHoof', 'farRearKnee', v(0.06, 0, -0.44), 'limb', { absoluteSide: 'right', mirroredCounterpartId: 'nearRearHoof', groundContact: true }),
    joint('tailBase', 'pelvis', v(-0.28, 0, 0.08), 'tail'),
    joint('tailTip', 'tailBase', v(-0.35, 0, -0.18), 'tail'),
  ],
  groundContacts: ['nearFrontHoof', 'farFrontHoof', 'nearRearHoof', 'farRearHoof'],
  plates,
  gaskets,
  coreOccluder: { id: 'coreOccluder', memberPlateIds: corePlateIds, memberGasketIds: coreGasketIds, paletteRole: 'base', opacity: 1, intentionalHoles: [], compositingGroup: 'opaque core occluder' },
  compositingPolicy: {
    orderedGroups: ['ground shadow', 'camera-far appendages', 'opaque core occluder', 'core surface plates', 'camera-near appendages', 'paint/details/accessories'],
    sortWithinGroup: 'camera-relative depth, far-to-near, then stable ID',
    bilateralSwap: 'absolute left/right plates are assigned near/far from projected camera depth at each heading',
  },
  paintRegions,
  anchors,
  clips,
  directionalBake: { headingsDegrees: [0, 45, 90, 135, 180, 225, 270, 315], validationElevationsDegrees: [30, 45, 60, 75] },
  lod: {
    tiers: ['silhouette', 'major', 'detail', 'micro'],
    mergeGroups: normalizedMergeGroups,
    far: {
      opaqueSilhouette: true,
      removeOrder: ['micro', 'detail', 'major'],
      preserve: [...new Set([...plates.filter((part) => part.silhouetteCritical).map((part) => part.id), 'head', 'tailBase', 'nearFrontHoof', 'farFrontHoof', 'nearRearHoof', 'farRearHoof'])],
      preserveFacing: true,
      preserveContacts: true,
    },
  },
  validation: { status: 'passed', issues: [] },
}

export const WORKBENCH_HORSE = WORKBENCH_V2_HORSE
