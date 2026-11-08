import { HORSE_PART_PAINTS } from '@/render/paperRig/horse'
import type { CompiledPaperRigView, PaperRigSpec, PaperRigVec3 } from '@/render/paperRig/types'

const PAPER_RIG_ELEVATION_DEG = 60
export const PAPER_RIG_HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const

const add = (a: PaperRigVec3, b: PaperRigVec3): PaperRigVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dot = (a: PaperRigVec3, b: PaperRigVec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const n = (value: number) => Number(value.toFixed(3))

// The camera basis, shared with the facet compiler so both stylizers project
// through the identical orthographic 60°-elevation view.
export function paperRigBasis(elevationDeg = PAPER_RIG_ELEVATION_DEG): { right: PaperRigVec3; up: PaperRigVec3; forward: PaperRigVec3 } {
  const e = elevationDeg * Math.PI / 180
  return {
    right: [0, 1, 0],
    up: [Math.sin(e), 0, Math.cos(e)],
    forward: [Math.cos(e), 0, -Math.sin(e)],
  }
}

export function worldJoints(spec: PaperRigSpec): Record<string, PaperRigVec3> {
  const out: Record<string, PaperRigVec3> = {}
  const pending = new Map(spec.joints.map((joint) => [joint.id, joint]))
  const visit = (id: string, visiting = new Set<string>()): PaperRigVec3 => {
    if (out[id]) return out[id]
    const joint = pending.get(id)
    if (!joint) throw new Error(`Missing paper-rig joint: ${id}`)
    if (visiting.has(id)) throw new Error(`Paper-rig joint cycle: ${id}`)
    visiting.add(id)
    out[id] = joint.parent ? add(visit(joint.parent, visiting), joint.bind) : joint.bind
    visiting.delete(id)
    return out[id]
  }
  spec.joints.forEach((joint) => visit(joint.id))
  return out
}

export function rotateHeading(point: PaperRigVec3, headingDeg: number): PaperRigVec3 {
  const a = headingDeg * Math.PI / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [point[0] * c - point[1] * s, point[0] * s + point[1] * c, point[2]]
}

function capsulePath(ax: number, ay: number, bx: number, by: number, width: number, overlap: number) {
  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy)
  if (length < 0.001) {
    const r = width / 2
    return `M${n(ax - r)} ${n(ay)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`
  }
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

export function compilePaperRigView(spec: PaperRigSpec, headingDeg: number): CompiledPaperRigView {
  const basis = paperRigBasis()
  const world = worldJoints(spec)
  const projected = Object.fromEntries(Object.entries(world).map(([id, point]) => {
    const p = rotateHeading(point, headingDeg)
    return [id, {
      x: 50 + dot(p, basis.right) * spec.tokenScale,
      y: spec.tokenGroundY - dot(p, basis.up) * spec.tokenScale,
      depth: dot(p, basis.forward),
    }]
  }))
  const shadowPlate = spec.plates.find((part) => part.role === 'shadow')
  if (!shadowPlate || shadowPlate.size.length < 2) throw new Error('Paper rig needs one two-axis shadow plate')
  const paintById = new Map(spec.plates
    .filter((part) => part.role !== 'shadow')
    .map((part, index) => [part.id, HORSE_PART_PAINTS[index % HORSE_PART_PAINTS.length]]))
  const sorted = spec.plates
    .filter((part) => part.role !== 'shadow')
    .sort((a, b) => {
      const ad = (projected[a.bone]?.depth ?? 0) - a.zBias * 0.001
      const bd = (projected[b.bone]?.depth ?? 0) - b.zBias * 0.001
      return bd - ad || a.id.localeCompare(b.id)
    })
  const parts = sorted.map((part) => {
    let d: string
    if (part.span) {
      const a = projected[part.span[0]]
      const b = projected[part.span[1]]
      if (!a || !b) throw new Error(`Missing span joint for ${part.id}`)
      d = capsulePath(a.x, a.y, b.x, b.y, part.size[0] * spec.tokenScale, part.jointOverlap ?? 1)
    } else {
      const p = projected[part.bone]
      if (!p || part.size.length < 2) throw new Error(`Missing ellipse data for ${part.id}`)
      d = ellipsePath(p.x, p.y, part.size[0] * spec.tokenScale / 2, part.size[1] * spec.tokenScale / 2)
    }
    return { id: part.id, d, paint: paintById.get(part.id)!, role: part.role as 'body' | 'accent' }
  })
  return {
    headingDeg,
    shadow: {
      cx: 50,
      cy: spec.tokenGroundY,
      rx: shadowPlate.size[0] * spec.tokenScale / 2,
      ry: shadowPlate.size[1] * spec.tokenScale / 2,
    },
    parts,
    mergedD: parts.map((part) => part.d).join(''),
  }
}

export function compilePaperRigDirections(spec: PaperRigSpec): readonly CompiledPaperRigView[] {
  return PAPER_RIG_HEADINGS.map((heading) => compilePaperRigView(spec, heading))
}

export function nearestPaperRigHeading(deg: number): number {
  return ((Math.round(deg / 45) * 45) % 360 + 360) % 360
}
