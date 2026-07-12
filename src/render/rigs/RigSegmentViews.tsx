import { PAPER_PALETTE } from '@/render/palette'
import type { ResolvedRig } from '@/render/rigs/model'
import type { RigJoint } from '@/render/rigs/types'

function focusJoints(rig: ResolvedRig, selectedId: string): RigJoint[] {
  const limb = selectedId.match(/^(far|near)(Front|Rear)/)?.[0]
  if (limb) return Object.values(rig).filter((joint) => joint.id.startsWith(limb))
  const ids = new Set<string>()
  let current: RigJoint | undefined = rig[selectedId]
  while (current) {
    ids.add(current.id)
    current = current.parent ? rig[current.parent] : undefined
  }
  Object.values(rig).forEach((joint) => { if (joint.parent === selectedId) ids.add(joint.id) })
  return Object.values(rig).filter((joint) => ids.has(joint.id))
}

function Projection({
  joints,
  selectedId,
  horizontal,
  vertical,
  label,
}: {
  joints: RigJoint[]
  selectedId: string
  horizontal: 'x' | 'y'
  vertical: 'y' | 'z'
  label: string
}) {
  const xs = joints.map((joint) => joint[horizontal])
  const ys = joints.map((joint) => joint[vertical])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(8, maxX - minX)
  const spanY = Math.max(8, maxY - minY)
  const point = (joint: RigJoint) => ({
    x: 10 + (joint[horizontal] - minX) / spanX * 80,
    y: vertical === 'z'
      ? 68 - (joint[vertical] - minY) / spanY * 54
      : 14 + (joint[vertical] - minY) / spanY * 54,
  })
  const ids = new Set(joints.map((joint) => joint.id))
  return <div className="rounded-lg border border-game-border bg-game-bg/60 p-2">
    <div className="flex justify-between text-[9px] uppercase tracking-wider text-game-muted"><span>{label}</span><span>{horizontal}/{vertical}</span></div>
    <svg viewBox="0 0 100 76" className="w-full h-24" aria-label={`${label} segment projection`}>
      <line x1="8" y1="68" x2="94" y2="68" stroke={PAPER_PALETTE.wallTop} strokeWidth="0.6" />
      <line x1="10" y1="8" x2="10" y2="70" stroke={PAPER_PALETTE.wallTop} strokeWidth="0.6" />
      {joints.filter((joint) => joint.parent && ids.has(joint.parent)).map((joint) => {
        const a = point(joints.find((item) => item.id === joint.parent)!)
        const b = point(joint)
        return <line key={joint.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER_PALETTE.bannerGold} strokeWidth="2.2" strokeLinecap="round" />
      })}
      {joints.map((joint) => {
        const p = point(joint)
        return <circle key={joint.id} cx={p.x} cy={p.y} r={joint.id === selectedId ? 4 : 2.8} fill={joint.id === selectedId ? PAPER_PALETTE.lampGlow : PAPER_PALETTE.cream} stroke={PAPER_PALETTE.ink} strokeWidth="0.8" />
      })}
    </svg>
  </div>
}

export function RigSegmentViews({ rig, selectedJoint }: { rig: ResolvedRig; selectedJoint: string }) {
  const joints = focusJoints(rig, selectedJoint)
  if (!joints.length) return null
  return <div className="grid grid-cols-3 gap-2">
    <Projection joints={joints} selectedId={selectedJoint} horizontal="x" vertical="y" label="Top" />
    <Projection joints={joints} selectedId={selectedJoint} horizontal="x" vertical="z" label="Side" />
    <Projection joints={joints} selectedId={selectedJoint} horizontal="y" vertical="z" label="Front" />
  </div>
}
