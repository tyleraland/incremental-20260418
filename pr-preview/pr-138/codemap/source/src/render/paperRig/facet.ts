import { paperRigBasis, PAPER_RIG_HEADINGS, rotateHeading, worldJoints } from '@/render/paperRig/compile'
import type { PaperRigSpec, PaperRigVec3 } from '@/render/paperRig/types'

// ── Faceted low-poly compiler (Style D) ──────────────────────────────────────
//
// The report's "planar flat-shaded facets as vector fills". Unlike compile.ts
// (which projects joints and draws 2D capsule/ellipse silhouettes), this builds
// actual low-poly 3D geometry around the rig — a prism tube per bone, a coarse
// spheroid per blob plate — projects every face through the SAME camera, culls
// back-faces, and flat-shades each face by its normal · a fixed screen-space
// light. Output is a depth-sorted list of solid polygons + a per-face `shade`
// (0..1); the stylizer maps shade → a palette ramp. Pure + deterministic (no
// RNG); trig/sqrt only, quantized coordinates. Palette-agnostic on purpose.

type V3 = readonly [number, number, number]

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / len, a[1] / len, a[2] / len]
}

// Light in view-basis coordinates (right, up, forward): up-left and toward the
// camera (−forward), matching the paper language's one-light-from-up-left rule.
const LIGHT = norm([-0.45, 0.78, -0.5])
const AMBIENT = 0.32

export interface FacetPoly { d: string; shade: number; depth: number }
export interface CompiledFacetView {
  headingDeg: number
  shadow: { cx: number; cy: number; rx: number; ry: number }
  polys: readonly FacetPoly[]
}

// A convex solid carries its center so face normals can be oriented outward.
interface Solid { faces: V3[][]; center: V3 }

// A prism tube of `sides` around the A→B axis, radius r.
function tube(a: V3, b: V3, r: number, sides: number): Solid {
  const axis = norm(sub(b, a))
  const ref: V3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = norm(cross(axis, ref))
  const w = norm(cross(axis, u))
  const ring = (c: V3) => Array.from({ length: sides }, (_, i) => {
    const ang = (i / sides) * Math.PI * 2
    return addV(c, addV(scale(u, Math.cos(ang) * r), scale(w, Math.sin(ang) * r)))
  })
  const ra = ring(a)
  const rb = ring(b)
  const faces = Array.from({ length: sides }, (_, i) => {
    const j = (i + 1) % sides
    return [ra[i], ra[j], rb[j], rb[i]]
  })
  return { faces, center: scale(addV(a, b), 0.5) }
}

// A coarse spheroid (UV sphere: pole fans + middle quad rings), radii per axis.
function spheroid(c: V3, rx: number, ry: number, rz: number, lon: number, lat: number): Solid {
  const pt = (theta: number, phi: number): V3 => addV(c, [
    Math.cos(phi) * Math.sin(theta) * rx,
    Math.cos(theta) * ry,
    Math.sin(phi) * Math.sin(theta) * rz,
  ])
  const top: V3 = addV(c, [0, ry, 0])
  const bot: V3 = addV(c, [0, -ry, 0])
  const faces: V3[][] = []
  for (let i = 0; i < lon; i++) {
    const p0 = (i / lon) * Math.PI * 2
    const p1 = ((i + 1) / lon) * Math.PI * 2
    for (let k = 0; k < lat; k++) {
      const t0 = ((k + 1) / (lat + 1)) * Math.PI
      const t1 = ((k + 2) / (lat + 1)) * Math.PI
      if (k === 0) faces.push([top, pt(t0, p0), pt(t0, p1)])
      faces.push([pt(t0, p0), pt(t1, p0), pt(t1, p1), pt(t0, p1)])
    }
    const tl = (lat / (lat + 1)) * Math.PI
    faces.push([pt(tl, p0), bot, pt(tl, p1)])
  }
  return { faces, center: c }
}

const centroid = (face: V3[]): V3 => scale(face.reduce(addV, [0, 0, 0] as V3), 1 / face.length)

export function compileFacetView(spec: PaperRigSpec, headingDeg: number): CompiledFacetView {
  const basis = paperRigBasis()
  const world = worldJoints(spec)
  const shadowPlate = spec.plates.find((p) => p.role === 'shadow')
  if (!shadowPlate || shadowPlate.size.length < 2) throw new Error('Facet rig needs one two-axis shadow plate')

  // Build low-poly solids (in rotated world/meter space) for every non-shadow plate.
  const solids: Solid[] = []
  for (const plate of spec.plates) {
    if (plate.role === 'shadow') continue
    const rot = (id: string): V3 => rotateHeading(world[id] as PaperRigVec3, headingDeg)
    if (plate.span) {
      const sides = plate.size[0] > 0.3 ? 6 : 5 // chunkier tube for the torso/neck
      solids.push(tube(rot(plate.span[0]), rot(plate.span[1]), plate.size[0] / 2, sides))
    } else {
      const rx = plate.size[0] / 2
      const ry = (plate.size[1] ?? plate.size[0]) / 2
      solids.push(spheroid(rot(plate.bone), rx, ry, rx, 6, 2))
    }
  }

  // Project each face; orient its normal outward; cull back-faces; shade; sort.
  const polys: FacetPoly[] = []
  for (const solid of solids) {
    for (const face of solid.faces) {
      const c = centroid(face)
      let nrm = norm(cross(sub(face[1], face[0]), sub(face[2], face[0])))
      if (dot(nrm, sub(c, solid.center)) < 0) nrm = scale(nrm, -1) // point outward
      const nf = dot(nrm, basis.forward)
      if (nf > -0.02) continue // faces away from the camera (forward points into screen)
      const viewN: V3 = [dot(nrm, basis.right), dot(nrm, basis.up), dot(nrm, basis.forward)]
      const shade = Math.min(1, AMBIENT + (1 - AMBIENT) * Math.max(0, dot(viewN, LIGHT)))
      const pts = face.map((v) => {
        const x = 50 + dot(v, basis.right) * spec.tokenScale
        const y = spec.tokenGroundY - dot(v, basis.up) * spec.tokenScale
        return `${x.toFixed(2)} ${y.toFixed(2)}`
      })
      polys.push({ d: `M${pts.join('L')}Z`, shade, depth: dot(c, basis.forward) })
    }
  }
  polys.sort((a, b) => b.depth - a.depth) // far first (painter's)

  return {
    headingDeg,
    shadow: {
      cx: 50,
      cy: spec.tokenGroundY,
      rx: shadowPlate.size[0] * spec.tokenScale / 2,
      ry: shadowPlate.size[1] * spec.tokenScale / 2,
    },
    polys,
  }
}

export function compileFacetDirections(spec: PaperRigSpec): readonly CompiledFacetView[] {
  return PAPER_RIG_HEADINGS.map((heading) => compileFacetView(spec, heading))
}
