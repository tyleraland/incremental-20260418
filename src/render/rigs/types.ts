import type { PaperRole } from '@/render/palette'

export type RigJointId = string
export type RigPoseId = 'bind' | 'idleA' | 'idleB' | 'walkA' | 'walkB' | 'attack' | 'hit'
export type RigAnimationId = 'idle' | 'walk' | 'attack' | 'hit'

export interface RigPoint {
  x: number
  y: number
  // Height/depth is authored independently from screen x/y. The renderer uses
  // it for painter ordering plus a small top-down projection lift.
  z: number
}

export interface RigJoint extends RigPoint {
  id: RigJointId
  label: string
  parent?: RigJointId
}

export interface RigParams {
  bodyLength: number
  bodyWidth: number
  headSize: number
  neckLength: number
  legLength: number
  stance: number
  tailLength: number
}

export type RigPart =
  | { id: string; kind: 'capsule'; a: RigJointId; b: RigJointId; width: number; widthParam?: keyof RigParams; z: number; fill: PaperRole; lit: PaperRole; outline?: PaperRole }
  | { id: string; kind: 'ellipse'; a: RigJointId; b: RigJointId; width: number; widthParam?: keyof RigParams; z: number; fill: PaperRole; lit: PaperRole; outline?: PaperRole }
  | { id: string; kind: 'joint'; at: RigJointId; radius: number; z: number; fill: PaperRole; lit: PaperRole; outline?: PaperRole }

export interface RigAnimation {
  frames: RigPoseId[]
  durationMs: number
  loop: boolean
}

export interface RigTemplate {
  id: string
  family: string
  forward: '+x'
  viewBox: [number, number, number, number]
  defaultParams: RigParams
  buildJoints: (params: RigParams) => RigJoint[]
  parts: RigPart[]
  poses: Record<Exclude<RigPoseId, 'bind'>, Partial<Record<RigJointId, RigPoint>>>
  animations: Record<RigAnimationId, RigAnimation>
}

export interface RigDraft {
  version: 1
  templateId: string
  name: string
  params: RigParams
  // Pose values are deltas from the parameterized template. Keeping edits as
  // deltas means a longer body can retain a hand-tuned gait.
  poseOffsets: Partial<Record<RigPoseId, Record<RigJointId, RigPoint>>>
}

export const zeroPoint = (): RigPoint => ({ x: 0, y: 0, z: 0 })

export function addPoint(a: RigPoint, b?: RigPoint): RigPoint {
  return b ? { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } : { ...a }
}

export function mixPoint(a: RigPoint, b: RigPoint, t: number): RigPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}
