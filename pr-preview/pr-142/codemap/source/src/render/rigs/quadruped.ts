import type { RigJoint, RigParams, RigTemplate } from '@/render/rigs/types'

function joints(p: RigParams): RigJoint[] {
  const rearX = 50 - p.bodyLength / 2
  const frontX = 50 + p.bodyLength / 2
  const side = p.bodyWidth * 0.34
  const kneeDrop = p.legLength * 0.52
  const footDrop = p.legLength + p.stance
  const neckX = frontX + p.neckLength
  const headX = neckX + p.headSize * 0.55
  const tailX = rearX - p.tailLength
  const leg = (id: string, label: string, parent: string, x: number, y: number, z: number): RigJoint[] => {
    const rear = id.includes('Rear')
    return [
      { id: `${id}Hip`, label: `${label} hip`, parent, x, y: 50 + y * side, z },
      // Rear knees break forward while front knees break back, preserving the
      // supplied horse's useful reflex-joint read without hard-coding its pixels.
      { id: `${id}Knee`, label: `${label} knee`, parent: `${id}Hip`, x: x + p.legLength * (rear ? 0.22 : -0.08), y: 50 + y * (side + kneeDrop), z: z - 0.25 },
      { id: `${id}Foot`, label: `${label} foot`, parent: `${id}Knee`, x: x + p.legLength * (rear ? -0.08 : 0.08), y: 50 + y * (side + footDrop), z: 0 },
    ]
  }

  return [
    { id: 'pelvis', label: 'Pelvis', x: rearX, y: 50, z: 2.4 },
    { id: 'chest', label: 'Chest', parent: 'pelvis', x: frontX, y: 50, z: 2.7 },
    { id: 'neck', label: 'Neck', parent: 'chest', x: neckX, y: 50, z: 3.2 },
    { id: 'head', label: 'Head', parent: 'neck', x: headX, y: 50, z: 3.6 },
    { id: 'muzzle', label: 'Muzzle', parent: 'head', x: headX + p.headSize * 0.62, y: 50, z: 3.45 },
    { id: 'tailRoot', label: 'Tail root', parent: 'pelvis', x: rearX - 2, y: 50, z: 2.1 },
    { id: 'tailTip', label: 'Tail tip', parent: 'tailRoot', x: tailX, y: 54, z: 1.25 },
    ...leg('farRear', 'Far rear', 'pelvis', rearX, -1, 0.75),
    ...leg('farFront', 'Far front', 'chest', frontX, -1, 0.85),
    ...leg('nearRear', 'Near rear', 'pelvis', rearX, 1, 1.15),
    ...leg('nearFront', 'Near front', 'chest', frontX, 1, 1.25),
  ]
}

const legParts = (id: string, z: number) => [
  { id: `${id}Upper`, kind: 'capsule' as const, a: `${id}Hip`, b: `${id}Knee`, width: 5.8, z, fill: 'woodDeep' as const, lit: 'wood' as const, outline: 'ink' as const },
  { id: `${id}Lower`, kind: 'capsule' as const, a: `${id}Knee`, b: `${id}Foot`, width: 5, z: z + 0.01, fill: 'woodDeep' as const, lit: 'woodLight' as const, outline: 'ink' as const },
  { id: `${id}Foot`, kind: 'joint' as const, at: `${id}Foot`, radius: 3.5, z: z + 0.02, fill: 'wallBase' as const, lit: 'wallTop' as const, outline: 'ink' as const },
]

// Adapted from the supplied horse prototype: the useful information is the
// joint graph, diagonal gait and explicit depth—not its one-off DOM structure.
export const quadrupedRig: RigTemplate = {
  id: 'quadruped-v0',
  family: 'quadruped',
  forward: '+x',
  viewBox: [-8, 4, 116, 92],
  defaultParams: {
    bodyLength: 34,
    bodyWidth: 28,
    headSize: 13,
    neckLength: 10,
    legLength: 17,
    stance: 2,
    tailLength: 20,
  },
  buildJoints: joints,
  parts: [
    ...legParts('farRear', 0.5),
    ...legParts('farFront', 0.6),
    { id: 'tail', kind: 'capsule', a: 'tailRoot', b: 'tailTip', width: 7, z: 1.1, fill: 'woodDeep', lit: 'wood', outline: 'ink' },
    ...legParts('nearRear', 1.4),
    ...legParts('nearFront', 1.5),
    { id: 'body', kind: 'ellipse', a: 'pelvis', b: 'chest', width: 28, widthParam: 'bodyWidth', z: 2.2, fill: 'woodDeep', lit: 'wood', outline: 'ink' },
    { id: 'neck', kind: 'capsule', a: 'chest', b: 'neck', width: 15, widthParam: 'headSize', z: 3, fill: 'wood', lit: 'woodLight', outline: 'ink' },
    { id: 'head', kind: 'ellipse', a: 'neck', b: 'head', width: 15, widthParam: 'headSize', z: 3.4, fill: 'wood', lit: 'woodLight', outline: 'ink' },
    { id: 'muzzle', kind: 'ellipse', a: 'head', b: 'muzzle', width: 9, z: 3.5, fill: 'woodDeep', lit: 'wood', outline: 'ink' },
  ],
  poses: {
    idleA: { chest: { x: 0, y: 0, z: 0 }, head: { x: 0, y: -0.4, z: 0 }, tailTip: { x: 0, y: -3, z: 0 } },
    idleB: { chest: { x: 0.8, y: 0, z: 0.2 }, head: { x: 1, y: 0.5, z: 0.2 }, muzzle: { x: 1.2, y: 0.5, z: 0.2 }, tailTip: { x: 0, y: 3, z: 0 } },
    walkA: {
      farFrontFoot: { x: 6, y: -3, z: 0.8 }, nearRearFoot: { x: 6, y: 3, z: 0.8 },
      nearFrontFoot: { x: -5, y: 2, z: 0 }, farRearFoot: { x: -5, y: -2, z: 0 },
      chest: { x: 1, y: 0, z: 0.4 }, head: { x: 1.5, y: -0.5, z: 0.3 }, tailTip: { x: 0, y: 3, z: 0 },
    },
    walkB: {
      nearFrontFoot: { x: 6, y: 3, z: 0.8 }, farRearFoot: { x: 6, y: -3, z: 0.8 },
      farFrontFoot: { x: -5, y: -2, z: 0 }, nearRearFoot: { x: -5, y: 2, z: 0 },
      chest: { x: -1, y: 0, z: 0.1 }, head: { x: -0.5, y: 0.5, z: 0 }, tailTip: { x: 0, y: -3, z: 0 },
    },
    attack: {
      chest: { x: 4, y: 0, z: 0.4 }, neck: { x: 8, y: 0, z: 0.5 }, head: { x: 13, y: 0, z: 0.4 }, muzzle: { x: 15, y: 0, z: 0.3 },
      farFrontFoot: { x: 4, y: 0, z: 0.6 }, nearFrontFoot: { x: 4, y: 0, z: 0.6 }, tailTip: { x: 4, y: -4, z: 0 },
    },
    hit: { pelvis: { x: -4, y: 0, z: 0 }, chest: { x: -5, y: 0, z: -0.2 }, neck: { x: -7, y: 1, z: -0.3 }, head: { x: -9, y: 2, z: -0.5 }, muzzle: { x: -10, y: 2, z: -0.5 } },
  },
  poseBase: {
    walkA: 'idleA',
    walkB: 'idleB',
    attack: 'idleA',
    hit: 'idleA',
  },
  animations: {
    idle: { frames: ['idleA', 'idleB'], durationMs: 2200, loop: true },
    walk: { frames: ['walkA', 'walkB'], durationMs: 700, loop: true },
    attack: { frames: ['bind', 'attack', 'bind'], durationMs: 650, loop: true },
    hit: { frames: ['bind', 'hit', 'bind'], durationMs: 760, loop: true },
  },
}

export const RIG_TEMPLATES = { [quadrupedRig.id]: quadrupedRig } as const
