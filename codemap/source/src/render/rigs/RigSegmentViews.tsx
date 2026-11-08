import { useState } from 'react'
import { PAPER_PALETTE } from '@/render/palette'
import type { ResolvedRig } from '@/render/rigs/model'
import type { RigJoint } from '@/render/rigs/types'

type Axis = 'x' | 'y' | 'z'
type ScaleMode = 'normalized' | 'true'
interface Domain { min: number; max: number }
type Domains = Record<Axis, Domain>

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

function rawDomain(joints: RigJoint[], axis: Axis): Domain {
  const values = joints.map((joint) => joint[axis])
  return { min: Math.min(...values), max: Math.max(...values) }
}

function domainsFor(joints: RigJoint[], mode: ScaleMode): Domains {
  const raw = {
    x: rawDomain(joints, 'x'),
    y: rawDomain(joints, 'y'),
    z: rawDomain(joints, 'z'),
  }
  const ranges = Object.values(raw).map(({ min, max }) => max - min)
  const sharedRange = Math.max(1, ...ranges) * 1.24
  return Object.fromEntries((['x', 'y', 'z'] as const).map((axis) => {
    const { min, max } = raw[axis]
    const center = (min + max) / 2
    if (mode === 'true') return [axis, { min: center - sharedRange / 2, max: center + sharedRange / 2 }]
    const range = max - min
    const paddedRange = Math.max(1, range * 1.24)
    return [axis, { min: center - paddedRange / 2, max: center + paddedRange / 2 }]
  })) as Domains
}

const ticks = ({ min, max }: Domain) => [min, (min + max) / 2, max]
const n = (value: number) => Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1)

function Projection({
  joints,
  selectedId,
  horizontal,
  vertical,
  label,
  domains,
}: {
  joints: RigJoint[]
  selectedId: string
  horizontal: 'x' | 'y'
  vertical: 'y' | 'z'
  label: string
  domains: Domains
}) {
  const h = domains[horizontal]
  const v = domains[vertical]
  const left = 16
  const right = 96
  const top = 8
  const bottom = 64
  const mapX = (value: number) => left + (value - h.min) / (h.max - h.min) * (right - left)
  const mapY = (value: number) => vertical === 'z'
    ? bottom - (value - v.min) / (v.max - v.min) * (bottom - top)
    : top + (value - v.min) / (v.max - v.min) * (bottom - top)
  const point = (joint: RigJoint) => ({ x: mapX(joint[horizontal]), y: mapY(joint[vertical]) })
  const ids = new Set(joints.map((joint) => joint.id))
  return <div className="rounded-lg border border-game-border bg-game-bg/60 p-2">
    <div className="flex justify-between text-[9px] uppercase tracking-wider text-game-muted"><span>{label}</span><span>{horizontal}/{vertical}</span></div>
    <svg
      viewBox="0 0 104 78"
      className="w-full h-36"
      aria-label={`${label} segment projection`}
      data-rig-projection={label.toLowerCase()}
      data-horizontal-domain={`${h.min}:${h.max}`}
      data-vertical-domain={`${v.min}:${v.max}`}
    >
      {ticks(h).map((value) => {
        const x = mapX(value)
        return <g key={`h-${value}`}><line x1={x} y1={top} x2={x} y2={bottom} stroke={PAPER_PALETTE.wallTop} strokeWidth="0.35" opacity="0.65" /><text x={x} y="73" textAnchor="middle" fontSize="4.2" fill={PAPER_PALETTE.rock}>{n(value)}</text></g>
      })}
      {ticks(v).map((value) => {
        const y = mapY(value)
        return <g key={`v-${value}`}><line x1={left} y1={y} x2={right} y2={y} stroke={PAPER_PALETTE.wallTop} strokeWidth="0.35" opacity="0.65" /><text x="13" y={y + 1.5} textAnchor="end" fontSize="4.2" fill={PAPER_PALETTE.rock}>{n(value)}</text></g>
      })}
      <text x="101" y="73" textAnchor="end" fontSize="5" fontWeight="700" fill={PAPER_PALETTE.bannerGold}>{horizontal.toUpperCase()}</text>
      <text x="4" y="7" fontSize="5" fontWeight="700" fill={PAPER_PALETTE.bannerGold}>{vertical.toUpperCase()}</text>
      {joints.filter((joint) => joint.parent && ids.has(joint.parent)).map((joint) => {
        const a = point(joints.find((item) => item.id === joint.parent)!)
        const b = point(joint)
        return <line key={joint.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER_PALETTE.bannerGold} strokeWidth="2.2" strokeLinecap="round" />
      })}
      {joints.map((joint, index) => {
        const p = point(joint)
        const selected = joint.id === selectedId
        return <g key={joint.id}>
          <circle cx={p.x} cy={p.y} r={selected ? 4 : 2.8} fill={selected ? PAPER_PALETTE.lampGlow : PAPER_PALETTE.cream} stroke={PAPER_PALETTE.ink} strokeWidth="0.8" />
          <text x={p.x + 3.5} y={p.y - 3} fontSize="4.5" fontWeight="700" fill={selected ? PAPER_PALETTE.lampGlow : PAPER_PALETTE.cream}>{index + 1}</text>
        </g>
      })}
    </svg>
  </div>
}

export function RigSegmentViews({ rig, selectedJoint }: { rig: ResolvedRig; selectedJoint: string }) {
  const [scaleMode, setScaleMode] = useState<ScaleMode>('normalized')
  const joints = focusJoints(rig, selectedJoint)
  if (!joints.length) return null
  const domains = domainsFor(joints, scaleMode)
  return <div className="space-y-2" data-rig-scale-mode={scaleMode}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[9px] text-game-muted">{scaleMode === 'normalized' ? 'Axis-normalized · X/Y/Z each fit the plot and keep the same domain wherever reused.' : 'True scale · one model unit has the same visual size on every axis.'}</p>
      <div className="inline-flex overflow-hidden rounded-md border border-game-border text-[9px]">
        <button onClick={() => setScaleMode('normalized')} className={`px-2 py-1.5 ${scaleMode === 'normalized' ? 'bg-game-primary/20 text-game-text' : 'text-game-muted'}`}>Normalized</button>
        <button onClick={() => setScaleMode('true')} className={`border-l border-game-border px-2 py-1.5 ${scaleMode === 'true' ? 'bg-game-primary/20 text-game-text' : 'text-game-muted'}`}>True scale</button>
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <Projection joints={joints} selectedId={selectedJoint} horizontal="x" vertical="y" label="Top" domains={domains} />
      <Projection joints={joints} selectedId={selectedJoint} horizontal="x" vertical="z" label="Side" domains={domains} />
      <Projection joints={joints} selectedId={selectedJoint} horizontal="y" vertical="z" label="Front" domains={domains} />
    </div>
    <div className="overflow-x-auto rounded-lg border border-game-border bg-game-bg/50">
      <table className="w-full min-w-[420px] border-collapse text-[9px]">
        <thead className="text-game-muted"><tr><th className="px-2 py-1.5 text-left font-medium"># Joint</th><th className="px-2 py-1.5 text-right font-medium">X</th><th className="px-2 py-1.5 text-right font-medium">Y</th><th className="px-2 py-1.5 text-right font-medium">Z</th></tr></thead>
        <tbody>{joints.map((joint, index) => <tr key={joint.id} className={`border-t border-game-border/60 ${joint.id === selectedJoint ? 'bg-game-gold/10 text-game-gold' : 'text-game-text-dim'}`}><td className="px-2 py-1.5">{index + 1} · {joint.label}</td><td className="px-2 py-1.5 text-right font-mono">{joint.x.toFixed(2)}</td><td className="px-2 py-1.5 text-right font-mono">{joint.y.toFixed(2)}</td><td className="px-2 py-1.5 text-right font-mono">{joint.z.toFixed(2)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
}
