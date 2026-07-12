import type { RigAnimationId, RigDraft, RigJoint, RigPoint, RigPoseId, RigTemplate } from '@/render/rigs/types'
import { addPoint, mixPoint, zeroPoint } from '@/render/rigs/types'

export type ResolvedRig = Record<string, RigJoint>

export function createRigDraft(template: RigTemplate): RigDraft {
  return {
    version: 1,
    templateId: template.id,
    name: 'Untitled quadruped',
    params: { ...template.defaultParams },
    poseOffsets: {},
  }
}
function localOffset(template: RigTemplate, draft: RigDraft, pose: RigPoseId, id: string): RigPoint {
  const bind = draft.poseOffsets.bind?.[id]
  const authored = pose === 'bind' ? undefined : template.poses[pose]?.[id]
  const edited = pose === 'bind' ? undefined : draft.poseOffsets[pose]?.[id]
  return addPoint(addPoint(addPoint(zeroPoint(), bind), authored), edited)
}

export function resolveRigPose(template: RigTemplate, draft: RigDraft, pose: RigPoseId): ResolvedRig {
  const source = template.buildJoints(draft.params)
  const byId = new Map(source.map((joint) => [joint.id, joint]))
  const resolved: ResolvedRig = {}
  const inherited = new Map<string, RigPoint>()

  const visit = (joint: RigJoint, visiting = new Set<string>()): RigJoint => {
    if (resolved[joint.id]) return resolved[joint.id]
    if (visiting.has(joint.id)) throw new Error(`Rig joint cycle at ${joint.id}`)
    visiting.add(joint.id)
    const parentShift = joint.parent && byId.has(joint.parent)
      ? (visit(byId.get(joint.parent)!, visiting), inherited.get(joint.parent) ?? zeroPoint())
      : zeroPoint()
    const shift = addPoint(parentShift, localOffset(template, draft, pose, joint.id))
    inherited.set(joint.id, shift)
    resolved[joint.id] = { ...joint, ...addPoint(joint, shift) }
    visiting.delete(joint.id)
    return resolved[joint.id]
  }

  source.forEach((joint) => visit(joint))
  return resolved
}

export function sampleRigAnimation(
  template: RigTemplate,
  draft: RigDraft,
  animation: RigAnimationId,
  phase: number,
): ResolvedRig {
  const frames = template.animations[animation].frames
  const wrapped = ((phase % 1) + 1) % 1
  const position = wrapped * frames.length
  const index = Math.floor(position) % frames.length
  const next = (index + 1) % frames.length
  const t = position - Math.floor(position)
  const a = resolveRigPose(template, draft, frames[index])
  const b = resolveRigPose(template, draft, frames[next])
  return Object.fromEntries(Object.keys(a).map((id) => [id, { ...a[id], ...mixPoint(a[id], b[id], t) }]))
}

export function validateRigTemplate(template: RigTemplate): string[] {
  const errors: string[] = []
  const joints = template.buildJoints(template.defaultParams)
  const ids = new Set<string>()
  joints.forEach((joint) => {
    if (ids.has(joint.id)) errors.push(`duplicate joint: ${joint.id}`)
    ids.add(joint.id)
    if (![joint.x, joint.y, joint.z].every(Number.isFinite)) errors.push(`non-finite bind point: ${joint.id}`)
  })
  joints.forEach((joint) => {
    if (joint.parent && !ids.has(joint.parent)) errors.push(`missing parent ${joint.parent} for ${joint.id}`)
  })
  template.parts.forEach((part) => {
    const refs = part.kind === 'joint' ? [part.at] : [part.a, part.b]
    refs.forEach((id) => { if (!ids.has(id)) errors.push(`missing joint ${id} for part ${part.id}`) })
  })
  Object.entries(template.poses).forEach(([pose, offsets]) => {
    Object.entries(offsets).forEach(([id, point]) => {
      if (!ids.has(id)) errors.push(`missing joint ${id} in pose ${pose}`)
      if (point && ![point.x, point.y, point.z].every(Number.isFinite)) errors.push(`non-finite point ${id} in pose ${pose}`)
    })
  })
  return errors
}
