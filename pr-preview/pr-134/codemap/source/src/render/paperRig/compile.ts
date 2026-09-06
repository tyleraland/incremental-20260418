import type { PaperRole } from '@/render/palette'
import type {
  CompiledPaperRigPart,
  CompiledPaperRigView,
  PaperRigCompositingGroup,
  PaperRigGasket,
  PaperRigPaletteRole,
  PaperRigPlate,
  PaperRigRenderable,
  PaperRigSpec,
  PaperRigVec3,
} from '@/render/paperRig/types'

export const DEFAULT_PAPER_RIG_ELEVATION = 60
export const PAPER_RIG_HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const

export const PAPER_RIG_PAINT: Readonly<Record<PaperRigPaletteRole, PaperRole>> = {
  base: 'plaster',
  secondary: 'plasterDark',
  accent: 'bannerGold',
  marking: 'ink',
  hoof: 'woodDeep',
  eye: 'ink',
  equipment: 'steel',
  accessory: 'bannerGold',
  shadow: 'shadow',
}

const add = (a: PaperRigVec3, b: PaperRigVec3): PaperRigVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dot = (a: PaperRigVec3, b: PaperRigVec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const n = (value: number) => Number(value.toFixed(3))

export function validatePaperRigSpec(spec: PaperRigSpec) {
  if (spec.schema !== 'paper-rig/1' || spec.schemaVersion !== '1.1.0') throw new Error(`Unsupported paper-rig schema: ${spec.schema}@${spec.schemaVersion}`)
  if (spec.validation.status !== 'passed') throw new Error(`Refusing failed paper-rig package: ${spec.modelId}`)
  const opacity = spec.opacityInvariant
  if (opacity.requiredOpacity !== 1 || opacity.gradientsAllowed || opacity.filtersAllowed || opacity.masksAllowed || opacity.partialOpacityAllowed || opacity.implicitBackgroundShadingAllowed) {
    throw new Error(`Paper rig violates the opaque flat-render contract: ${spec.modelId}`)
  }
  const ids = [...spec.joints, ...spec.plates, ...spec.gaskets].map((item) => item.id)
  if (new Set(ids).size !== ids.length) throw new Error(`Paper rig has duplicate stable IDs: ${spec.modelId}`)
  const jointIds = new Set(spec.joints.map((joint) => joint.id))
  const renderableIds = new Set([...spec.plates, ...spec.gaskets].map((part) => part.id))
  for (const joint of spec.joints) {
    if (joint.parentId && !jointIds.has(joint.parentId)) throw new Error(`Missing paper-rig parent joint: ${joint.parentId}`)
    if (joint.coverageGasketId && joint.coverageGasketId !== 'not-required-nonvisible-helper' && !renderableIds.has(joint.coverageGasketId)) {
      throw new Error(`Missing paper-rig gasket: ${joint.coverageGasketId}`)
    }
  }
  for (const part of [...spec.plates, ...spec.gaskets]) {
    const referenced = part.attachment.type === 'rigidBone' ? [part.attachment.boneId] : part.attachment.jointIds
    referenced.forEach((id) => {
      if (!jointIds.has(id)) throw new Error(`Missing paper-rig attachment joint: ${id}`)
    })
    if (part.opacity !== 1 || part.intentionalHoles.length) throw new Error(`Paper-rig part must be opaque and hole-free: ${part.id}`)
  }
  for (const id of [...spec.coreOccluder.memberPlateIds, ...spec.coreOccluder.memberGasketIds]) {
    if (!renderableIds.has(id)) throw new Error(`Missing core-occluder member: ${id}`)
  }
  const requiredGroups: PaperRigCompositingGroup[] = ['ground shadow', 'camera-far appendages', 'opaque core occluder', 'core surface plates', 'camera-near appendages', 'paint/details/accessories']
  if (requiredGroups.some((group, index) => spec.compositingPolicy.orderedGroups[index] !== group)) throw new Error(`Paper rig has an unsupported compositing policy: ${spec.modelId}`)
}

function worldJoints(spec: PaperRigSpec): Record<string, PaperRigVec3> {
  const out: Record<string, PaperRigVec3> = {}
  const pending = new Map(spec.joints.map((joint) => [joint.id, joint]))
  const visit = (id: string, visiting = new Set<string>()): PaperRigVec3 => {
    if (out[id]) return out[id]
    const joint = pending.get(id)
    if (!joint) throw new Error(`Missing paper-rig joint: ${id}`)
    if (visiting.has(id)) throw new Error(`Paper-rig joint cycle: ${id}`)
    visiting.add(id)
    out[id] = joint.parentId ? add(visit(joint.parentId, visiting), joint.localBindPositionMeters) : joint.localBindPositionMeters
    visiting.delete(id)
    return out[id]
  }
  spec.joints.forEach((joint) => visit(joint.id))
  return out
}

function rotateHeading(point: PaperRigVec3, headingDeg: number): PaperRigVec3 {
  const a = headingDeg * Math.PI / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [point[0] * c - point[1] * s, point[0] * s + point[1] * c, point[2]]
}

function capsulePath(ax: number, ay: number, bx: number, by: number, width: number, overlap: number) {
  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy)
  if (length < 0.001) return ellipsePath(ax, ay, width / 2, width / 2)
  const ux = dx / length
  const uy = dy / length
  const px = -uy * width / 2
  const py = ux * width / 2
  const extra = width * Math.max(0, overlap - 1) / 2
  const x1 = ax - ux * extra
  const y1 = ay - uy * extra
  const x2 = bx + ux * extra
  const y2 = by + uy * extra
  return `M${n(x1 + px)} ${n(y1 + py)}L${n(x2 + px)} ${n(y2 + py)}A${n(width / 2)} ${n(width / 2)} 0 0 1 ${n(x2 - px)} ${n(y2 - py)}L${n(x1 - px)} ${n(y1 - py)}A${n(width / 2)} ${n(width / 2)} 0 0 1 ${n(x1 + px)} ${n(y1 + py)}Z`
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`
}

interface ProjectedPoint { x: number; y: number; depth: number }

function renderableDepth(part: PaperRigRenderable, projected: Record<string, ProjectedPoint>) {
  if (part.attachment.type === 'rigidBone') return projected[part.attachment.boneId]?.depth ?? 0
  const [a, b] = part.attachment.jointIds
  return ((projected[a]?.depth ?? 0) + (projected[b]?.depth ?? 0)) / 2
}

function renderablePath(part: PaperRigRenderable, projected: Record<string, ProjectedPoint>, scale: number) {
  const geometry = part.localGeometry
  if (geometry.type === 'capsuleSpan' || geometry.type === 'taperedSpan') {
    const [from, to] = geometry.jointIds
    const a = projected[from]
    const b = projected[to]
    if (!a || !b) throw new Error(`Missing span joint for ${part.id}`)
    return capsulePath(a.x, a.y, b.x, b.y, geometry.widthMeters * scale, geometry.overlapRatio)
  }
  if (part.attachment.type !== 'rigidBone') throw new Error(`Unsupported non-rigid primitive: ${part.id}`)
  const point = projected[part.attachment.boneId]
  if (!point) throw new Error(`Missing attachment joint for ${part.id}`)
  if (geometry.type === 'circle') return ellipsePath(point.x, point.y, geometry.diameterMeters * scale / 2, geometry.diameterMeters * scale / 2)
  if (geometry.type === 'primitive') {
    if (geometry.sizeMeters.length < 2) throw new Error(`Missing primitive size for ${part.id}`)
    return ellipsePath(point.x, point.y, geometry.sizeMeters[0] * scale / 2, geometry.sizeMeters[1] * scale / 2)
  }
  throw new Error(`Unsupported paper-rig geometry for ${part.id}: ${geometry.type}`)
}

function dynamicGroup(
  part: PaperRigPlate | PaperRigGasket,
  projected: Record<string, ProjectedPoint>,
  plateById: ReadonlyMap<string, PaperRigPlate>,
  jointById: ReadonlyMap<string, PaperRigSpec['joints'][number]>,
) {
  if (!part.headingSwapsNearFar) return part.compositingGroup
  const ownDepth = renderableDepth(part, projected)
  let counterpartDepth: number | undefined
  if ('mirrorPlateId' in part && part.mirrorPlateId) {
    const mirror = plateById.get(part.mirrorPlateId)
    if (mirror) counterpartDepth = renderableDepth(mirror, projected)
  } else if ('jointId' in part) {
    const mirrorJoint = jointById.get(part.jointId)?.mirroredCounterpartId
    if (mirrorJoint) counterpartDepth = projected[mirrorJoint]?.depth
  }
  if (counterpartDepth === undefined || Math.abs(ownDepth - counterpartDepth) < 0.0001) return part.compositingGroup
  return ownDepth > counterpartDepth ? 'camera-far appendages' : 'camera-near appendages'
}

export function compilePaperRigView(spec: PaperRigSpec, headingDeg: number, elevationDeg = DEFAULT_PAPER_RIG_ELEVATION): CompiledPaperRigView {
  validatePaperRigSpec(spec)
  if (!spec.directionalBake.validationElevationsDegrees.includes(elevationDeg)) throw new Error(`Paper-rig elevation was not validated: ${elevationDeg}°`)
  const e = elevationDeg * Math.PI / 180
  const basis = {
    right: [0, 1, 0] as PaperRigVec3,
    up: [Math.sin(e), 0, Math.cos(e)] as PaperRigVec3,
    forward: [Math.cos(e), 0, -Math.sin(e)] as PaperRigVec3,
  }
  const world = worldJoints(spec)
  const [groundX, groundY] = spec.scale.tokenGroundPoint
  const projected: Record<string, ProjectedPoint> = Object.fromEntries(Object.entries(world).map(([id, point]) => {
    const p = rotateHeading(point, headingDeg)
    return [id, {
      x: groundX + dot(p, basis.right) * spec.scale.tokenUnitsPerMeter,
      y: groundY - dot(p, basis.up) * spec.scale.tokenUnitsPerMeter,
      depth: dot(p, basis.forward),
    }]
  }))
  const shadowPlate = spec.plates.find((part) => part.paletteRole === 'shadow')
  if (!shadowPlate || shadowPlate.localGeometry.type !== 'primitive' || shadowPlate.localGeometry.sizeMeters.length < 2) throw new Error('Paper rig needs one two-axis shadow plate')

  const plateById = new Map(spec.plates.map((part) => [part.id, part]))
  const jointById = new Map(spec.joints.map((joint) => [joint.id, joint]))
  const physical = [...spec.plates.filter((part) => part !== shadowPlate), ...spec.gaskets].map((part) => ({
    source: part,
    d: renderablePath(part, projected, spec.scale.tokenUnitsPerMeter),
    depth: renderableDepth(part, projected) - part.depthBias * 0.001,
    group: dynamicGroup(part, projected, plateById, jointById),
  }))
  const physicalById = new Map(physical.map((item) => [item.source.id, item]))
  const occluderMembers = [...spec.coreOccluder.memberPlateIds, ...spec.coreOccluder.memberGasketIds].map((id) => {
    const member = physicalById.get(id)
    if (!member) throw new Error(`Missing compiled core-occluder member: ${id}`)
    return member
  })
  const groupIndex = new Map(spec.compositingPolicy.orderedGroups.map((group, index) => [group, index]))
  const compiled = [
    ...physical.map((item): Omit<CompiledPaperRigPart, 'depthBand'> & { depth: number } => ({
      id: item.source.id,
      d: item.d,
      paint: PAPER_RIG_PAINT[item.source.paletteRole],
      paletteRole: item.source.paletteRole,
      semanticRole: item.source.semanticRole,
      bodyRegion: item.source.bodyRegion,
      sourceKind: 'jointId' in item.source ? 'gasket' : 'plate',
      compositingGroup: item.group,
      lodTier: item.source.lodTier,
      depth: item.depth,
    })),
    {
      id: spec.coreOccluder.id,
      d: occluderMembers.map((item) => item.d).join(''),
      paint: PAPER_RIG_PAINT[spec.coreOccluder.paletteRole],
      paletteRole: spec.coreOccluder.paletteRole,
      semanticRole: 'opaqueCoreOccluder',
      bodyRegion: 'core',
      sourceKind: 'coreOccluder' as const,
      compositingGroup: spec.coreOccluder.compositingGroup,
      lodTier: 'silhouette' as const,
      depth: occluderMembers.reduce((sum, item) => sum + item.depth, 0) / occluderMembers.length,
    },
  ].sort((a, b) => (groupIndex.get(a.compositingGroup) ?? 99) - (groupIndex.get(b.compositingGroup) ?? 99) || b.depth - a.depth || a.id.localeCompare(b.id))
  const minDepth = Math.min(...compiled.map((part) => part.depth))
  const maxDepth = Math.max(...compiled.map((part) => part.depth))
  const depthSpan = Math.max(0.0001, maxDepth - minDepth)

  return {
    headingDeg,
    elevationDeg,
    shadow: {
      cx: groundX,
      cy: groundY,
      rx: shadowPlate.localGeometry.sizeMeters[0] * spec.scale.tokenUnitsPerMeter / 2,
      ry: shadowPlate.localGeometry.sizeMeters[1] * spec.scale.tokenUnitsPerMeter / 2,
    },
    parts: compiled.map(({ depth, ...part }) => ({
      ...part,
      depthBand: Math.max(0, Math.min(4, Math.round((depth - minDepth) / depthSpan * 4))) as 0 | 1 | 2 | 3 | 4,
    })),
    // Far LOD stays a single fully opaque path. Keeping all physical geometry
    // costs path bytes but no extra DOM nodes and preserves legs/contact points.
    mergedD: physical.map((item) => item.d).join(''),
  }
}

export function compilePaperRigDirections(spec: PaperRigSpec, elevationDeg = DEFAULT_PAPER_RIG_ELEVATION): readonly CompiledPaperRigView[] {
  validatePaperRigSpec(spec)
  return spec.directionalBake.headingsDegrees.map((heading) => compilePaperRigView(spec, heading, elevationDeg))
}

export function nearestPaperRigHeading(deg: number): number {
  return ((Math.round(deg / 45) * 45) % 360 + 360) % 360
}
