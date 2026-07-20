import { createRigDraft, poseLayers, resolveRigPose, sampleRigAnimation, validateRigTemplate } from '@/render/rigs/model'
import { quadrupedRig } from '@/render/rigs/quadruped'

describe('rigged monster prototype', () => {
  it('keeps the producer contract internally valid', () => {
    expect(validateRigTemplate(quadrupedRig)).toEqual([])
    expect(new Set(quadrupedRig.buildJoints(quadrupedRig.defaultParams).map((joint) => joint.id)).size).toBe(19)
  })

  it('parameterizes the skeleton without changing joint ids', () => {
    const draft = createRigDraft(quadrupedRig)
    const before = resolveRigPose(quadrupedRig, draft, 'bind')
    draft.params.bodyLength += 10
    const after = resolveRigPose(quadrupedRig, draft, 'bind')
    expect(after.pelvis.x).toBe(before.pelvis.x - 5)
    expect(after.chest.x).toBe(before.chest.x + 5)
    expect(Object.keys(after)).toEqual(Object.keys(before))
  })

  it('propagates a parent edit through the joint tree', () => {
    const draft = createRigDraft(quadrupedRig)
    draft.poseOffsets.bind = { chest: { x: 3, y: -2, z: 0.5 } }
    const rig = resolveRigPose(quadrupedRig, draft, 'bind')
    const authored = quadrupedRig.buildJoints(draft.params)
    const head = authored.find((joint) => joint.id === 'head')!
    const nearFoot = authored.find((joint) => joint.id === 'nearFrontFoot')!
    expect(rig.head).toMatchObject({ x: head.x + 3, y: head.y - 2, z: head.z + 0.5 })
    expect(rig.nearFrontFoot).toMatchObject({ x: nearFoot.x + 3, y: nearFoot.y - 2, z: nearFoot.z + 0.5 })
  })

  it('samples authored animation from the same shared skeleton', () => {
    const draft = createRigDraft(quadrupedRig)
    const a = sampleRigAnimation(quadrupedRig, draft, 'walk', 0)
    const between = sampleRigAnimation(quadrupedRig, draft, 'walk', 0.25)
    const b = resolveRigPose(quadrupedRig, draft, 'walkB')
    expect(a.nearFrontFoot.x).toBe(resolveRigPose(quadrupedRig, draft, 'walkA').nearFrontFoot.x)
    expect(between.nearFrontFoot.x).toBeCloseTo((a.nearFrontFoot.x + b.nearFrontFoot.x) / 2)
  })

  it('layers actions over the authored idle instead of duplicating it', () => {
    const draft = createRigDraft(quadrupedRig)
    const before = resolveRigPose(quadrupedRig, draft, 'attack')
    draft.poseOffsets.idleA = { head: { x: 2, y: -1, z: 0.4 } }
    const after = resolveRigPose(quadrupedRig, draft, 'attack')
    expect(poseLayers(quadrupedRig, 'attack')).toEqual(['idleA', 'attack'])
    expect(after.head.x - before.head.x).toBeCloseTo(2)
    expect(after.head.y - before.head.y).toBeCloseTo(-1)
    expect(after.muzzle.z - before.muzzle.z).toBeCloseTo(0.4)
  })

  it('starts drafts with independent silhouette and color overrides', () => {
    const draft = createRigDraft(quadrupedRig)
    expect(draft.partStyles).toEqual({})
    expect(draft.partColors).toEqual({})
  })
})
