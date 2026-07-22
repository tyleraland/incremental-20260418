import type { PaperRole } from '@/render/palette'
import type { PaperRigJoint, PaperRigPlate, PaperRigSpec, PaperRigVec3 } from '@/render/paperRig/types'

const v = (x: number, y: number, z: number): PaperRigVec3 => [x, y, z]
const joint = (id: string, parent: string | null, bind: PaperRigVec3, role: string): PaperRigJoint => ({ id, parent, bind, role })
const plate = (id: string, bone: string, shape: PaperRigPlate['shape'], size: readonly number[], role: PaperRigPlate['role'], zBias: number): PaperRigPlate => ({ id, bone, shape, size, role, zBias })
const span = (id: string, from: string, to: string, width: number, role: PaperRigPlate['role'], zBias: number): PaperRigPlate => ({
  ...plate(id, to, 'bone', [width], role, zBias),
  span: [from, to],
  jointOverlap: 1.18,
})

// Direct transcription of the workbench's horse quadruped. Keeping this as a
// small typed fixture makes the import/compiler seam explicit without making
// the game depend on the standalone authoring HTML.
export const WORKBENCH_HORSE: PaperRigSpec = {
  schema: 'paper-rig/1',
  id: 'horseBase',
  family: 'quadruped',
  heightMeters: 1.62,
  tokenScale: 28,
  tokenGroundY: 68,
  axes: {
    origin: 'ground center between contacts',
    forward: '+x',
    lateral: '+y',
    up: '+z',
    units: 'meters',
  },
  joints: [
    joint('root', null, v(0, 0, 0), 'root'),
    joint('pelvis', 'root', v(-0.36, 0, 0.78), 'body'),
    joint('chest', 'pelvis', v(0.72, 0, 0.24), 'body'),
    joint('neckBase', 'chest', v(0.32, 0, 0.22), 'neck'),
    joint('neckTip', 'neckBase', v(0.30, 0, 0.34), 'neck'),
    joint('head', 'neckTip', v(0.27, 0, 0.08), 'head'),
    joint('muzzle', 'head', v(0.18, 0, -0.04), 'head'),
    joint('nearFrontHip', 'chest', v(-0.10, 0.25, -0.02), 'limb'),
    joint('nearFrontKnee', 'nearFrontHip', v(0.02, 0, -0.48), 'limb'),
    joint('nearFrontHoof', 'nearFrontKnee', v(0.05, 0, -0.45), 'limb'),
    joint('farFrontHip', 'chest', v(-0.10, -0.25, -0.02), 'limb'),
    joint('farFrontKnee', 'farFrontHip', v(0.02, 0, -0.48), 'limb'),
    joint('farFrontHoof', 'farFrontKnee', v(0.05, 0, -0.45), 'limb'),
    joint('nearRearHip', 'pelvis', v(-0.08, 0.26, -0.01), 'limb'),
    joint('nearRearKnee', 'nearRearHip', v(-0.10, 0, -0.48), 'limb'),
    joint('nearRearHoof', 'nearRearKnee', v(0.06, 0, -0.44), 'limb'),
    joint('farRearHip', 'pelvis', v(-0.08, -0.26, -0.01), 'limb'),
    joint('farRearKnee', 'farRearHip', v(-0.10, 0, -0.48), 'limb'),
    joint('farRearHoof', 'farRearKnee', v(0.06, 0, -0.44), 'limb'),
    joint('tailBase', 'pelvis', v(-0.28, 0, 0.08), 'tail'),
    joint('tailTip', 'tailBase', v(-0.35, 0, -0.18), 'tail'),
  ],
  plates: [
    plate('castShadow', 'root', 'ellipse', [1.55, 0.68], 'shadow', -99),
    span('torsoPlate', 'pelvis', 'chest', 0.66, 'body', 3),
    plate('pelvisPlate', 'pelvis', 'ellipse', [0.68, 0.62], 'body', 3.1),
    span('withersPlate', 'chest', 'neckBase', 0.50, 'body', 3.8),
    span('neckPlate', 'neckBase', 'neckTip', 0.26, 'body', 4),
    span('headConnectorPlate', 'neckTip', 'head', 0.30, 'body', 4.8),
    plate('headPlate', 'head', 'ellipse', [0.40, 0.54], 'body', 5),
    span('muzzleConnectorPlate', 'head', 'muzzle', 0.23, 'accent', 5.05),
    plate('muzzlePlate', 'muzzle', 'ellipse', [0.27, 0.36], 'accent', 5.1),
    ...(['nearFront', 'farFront', 'nearRear', 'farRear'] as const).flatMap((name) => [
      span(`${name}UpperPlate`, `${name}Hip`, `${name}Knee`, 0.17, 'body', 1),
      span(`${name}LowerPlate`, `${name}Knee`, `${name}Hoof`, 0.14, 'body', 1.2),
      plate(`${name}HoofPlate`, `${name}Hoof`, 'ellipse', [0.20, 0.15], 'accent', 0),
    ]),
    span('tailConnectorPlate', 'pelvis', 'tailBase', 0.15, 'accent', 1.9),
    span('tailPlate', 'tailBase', 'tailTip', 0.13, 'accent', 2),
  ],
}

// Deliberately loud diagnostic paint: every non-shadow plate gets a distinct
// named palette role. This is for proving plate identity and painter ordering,
// not an art direction proposal.
export const HORSE_PART_PAINTS: readonly PaperRole[] = [
  'roofTile', 'bannerBlue', 'pineLit', 'lampGlow', 'waterShallow', 'bloom',
  'woodLight', 'roofSlate', 'th0', 'plaster', 'fountainWater', 'rr2',
  'flagstone', 'tileMoss', 'steel', 'cob2', 'sh2', 'ms1', 'wtr2',
  'roofShingle', 'bannerGold', 'cream',
]
