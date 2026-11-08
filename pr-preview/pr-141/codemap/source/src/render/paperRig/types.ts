import type { PaperRole } from '@/render/palette'

export type PaperRigVec3 = readonly [number, number, number]

export interface PaperRigJoint {
  id: string
  parent: string | null
  bind: PaperRigVec3
  role: string
}

export interface PaperRigPlate {
  id: string
  bone: string
  shape: 'ellipse' | 'bone'
  size: readonly number[]
  role: 'shadow' | 'body' | 'accent'
  zBias: number
  span?: readonly [string, string]
  jointOverlap?: number
}

export interface PaperRigSpec {
  schema: 'paper-rig/1'
  id: string
  family: string
  heightMeters: number
  tokenScale: number
  tokenGroundY: number
  axes: {
    origin: string
    forward: '+x'
    lateral: '+y'
    up: '+z'
    units: 'meters'
  }
  joints: readonly PaperRigJoint[]
  plates: readonly PaperRigPlate[]
}

export interface CompiledPaperRigPart {
  id: string
  d: string
  paint: PaperRole
}

export interface CompiledPaperRigView {
  headingDeg: number
  shadow: { cx: number; cy: number; rx: number; ry: number }
  parts: readonly CompiledPaperRigPart[]
  mergedD: string
}
