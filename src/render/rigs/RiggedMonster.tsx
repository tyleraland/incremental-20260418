import type { PointerEventHandler } from 'react'
import { PAPER_PALETTE } from '@/render/palette'
import type { ResolvedRig } from '@/render/rigs/model'
import type { RigParams, RigPart, RigTemplate } from '@/render/rigs/types'

const PROJECT_Z = 0.72

function projected(joint: ResolvedRig[string]) {
  return { x: joint.x, y: joint.y - joint.z * PROJECT_Z }
}
function widthFor(part: Extract<RigPart, { kind: 'capsule' | 'ellipse' }>, params: RigParams) {
  return part.widthParam ? params[part.widthParam] : part.width
}

function Segment({ part, rig, params }: { part: RigPart; rig: ResolvedRig; params: RigParams }) {
  const fill = PAPER_PALETTE[part.fill]
  const lit = PAPER_PALETTE[part.lit]
  const outline = PAPER_PALETTE[part.outline ?? 'ink']
  if (part.kind === 'joint') {
    const p = projected(rig[part.at])
    return <g data-rig-part={part.id}>
      <circle cx={p.x} cy={p.y} r={part.radius + 1.3} fill={outline} />
      <circle cx={p.x} cy={p.y} r={part.radius} fill={fill} />
      <circle cx={p.x - 0.8} cy={p.y - 0.8} r={part.radius * 0.78} fill={lit} />
    </g>
  }
  const a = projected(rig[part.a])
  const b = projected(rig[part.b])
  const width = widthFor(part, params)
  if (part.kind === 'capsule') {
    return <g data-rig-part={part.id}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={outline} strokeWidth={width + 2.6} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={fill} strokeWidth={width} strokeLinecap="round" />
      <line x1={a.x - 0.8} y1={a.y - 0.8} x2={b.x - 0.8} y2={b.y - 0.8} stroke={lit} strokeWidth={width * 0.72} strokeLinecap="round" />
    </g>
  }
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const length = Math.hypot(b.x - a.x, b.y - a.y) + width
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  return <g data-rig-part={part.id} transform={`rotate(${angle} ${cx} ${cy})`}>
    <ellipse cx={cx} cy={cy} rx={length / 2 + 1.3} ry={width / 2 + 1.3} fill={outline} />
    <ellipse cx={cx} cy={cy} rx={length / 2} ry={width / 2} fill={fill} />
    <ellipse cx={cx - 0.8} cy={cy - 0.8} rx={length / 2 - 1.1} ry={Math.max(1, width / 2 - 1.1)} fill={lit} />
  </g>
}

export function RiggedMonster({
  template,
  rig,
  params,
  showRig = false,
  selectedJoint,
  onJointPointerDown,
}: {
  template: RigTemplate
  rig: ResolvedRig
  params: RigParams
  showRig?: boolean
  selectedJoint?: string
  onJointPointerDown?: (id: string) => PointerEventHandler<SVGCircleElement>
}) {
  const joints = Object.values(rig)
  const sorted = [...template.parts].sort((a, b) => {
    const az = a.z + (a.kind === 'joint' ? rig[a.at].z : (rig[a.a].z + rig[a.b].z) / 2) * 0.01
    const bz = b.z + (b.kind === 'joint' ? rig[b.at].z : (rig[b.a].z + rig[b.b].z) / 2) * 0.01
    return az - bz
  })
  return (
    <svg
      data-rigged-monster
      viewBox={template.viewBox.join(' ')}
      role="img"
      aria-label={`${template.family} rig preview`}
      className="block w-full h-full overflow-visible"
      style={{ touchAction: 'none' }}
    >
      <ellipse cx="50" cy="72" rx="38" ry="9" fill={PAPER_PALETTE.shadow} opacity="0.2" />
      {sorted.map((part) => <Segment key={part.id} part={part} rig={rig} params={params} />)}
      {showRig && <g data-rig-overlay>
        {joints.filter((joint) => joint.parent && rig[joint.parent]).map((joint) => {
          const a = projected(rig[joint.parent!])
          const b = projected(joint)
          return <line key={`bone-${joint.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER_PALETTE.bannerGold} strokeWidth="0.8" strokeDasharray="2 2" />
        })}
        {joints.map((joint) => {
          const p = projected(joint)
          const selected = joint.id === selectedJoint
          return <circle
            key={joint.id}
            data-rig-joint={joint.id}
            cx={p.x}
            cy={p.y}
            r={selected ? 3.2 : 2.3}
            fill={selected ? PAPER_PALETTE.lampGlow : PAPER_PALETTE.cream}
            stroke={PAPER_PALETTE.bannerGold}
            strokeWidth="1"
            onPointerDown={onJointPointerDown?.(joint.id)}
            style={{ pointerEvents: onJointPointerDown ? 'all' : 'none', touchAction: 'none' }}
          />
        })}
      </g>}
    </svg>
  )
}
