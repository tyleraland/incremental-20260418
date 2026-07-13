import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { PAPER_PALETTE } from '@/render/palette'
import { RiggedMonster } from '@/render/rigs/RiggedMonster'
import { RigSegmentViews } from '@/render/rigs/RigSegmentViews'
import { createRigDraft, poseLayers, resolveRigPose, sampleRigAnimation, validateRigTemplate } from '@/render/rigs/model'
import { quadrupedRig } from '@/render/rigs/quadruped'
import type { RigAnimationId, RigDraft, RigParams, RigPartColors, RigPartStyle, RigPoint, RigPoseId } from '@/render/rigs/types'

const STORAGE_KEY = 'rig-lab-draft-v1'
const POSES: RigPoseId[] = ['bind', 'idleA', 'idleB', 'walkA', 'walkB', 'attack', 'hit']
const ANIMATIONS: RigAnimationId[] = ['idle', 'walk', 'attack', 'hit']
const PARAMS: { id: keyof RigParams; label: string; min: number; max: number; step: number }[] = [
  { id: 'bodyLength', label: 'Body length', min: 22, max: 48, step: 1 },
  { id: 'bodyWidth', label: 'Body width', min: 18, max: 38, step: 1 },
  { id: 'headSize', label: 'Head size', min: 8, max: 22, step: 1 },
  { id: 'neckLength', label: 'Neck length', min: 3, max: 22, step: 1 },
  { id: 'legLength', label: 'Leg length', min: 10, max: 26, step: 1 },
  { id: 'stance', label: 'Stance', min: -2, max: 9, step: 0.5 },
  { id: 'tailLength', label: 'Tail length', min: 8, max: 32, step: 1 },
]
const DEFAULT_PART_STYLE: RigPartStyle = { shape: 'round', widthScale: 1, sharpness: 0.35 }
const zero = (): RigPoint => ({ x: 0, y: 0, z: 0 })

interface LastEdit { source: string; pose: RigPoseId; delta: RigPoint }

function isDraft(value: unknown): value is Partial<RigDraft> & Pick<RigDraft, 'version' | 'templateId' | 'params' | 'poseOffsets'> {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<RigDraft>
  return draft.version === 1 && draft.templateId === quadrupedRig.id && !!draft.params && !!draft.poseOffsets
}

function normalizeDraft(value: Partial<RigDraft>): RigDraft {
  const fresh = createRigDraft(quadrupedRig)
  return {
    ...fresh,
    ...value,
    params: { ...fresh.params, ...value.params },
    poseOffsets: value.poseOffsets ?? {},
    partStyles: value.partStyles ?? {},
    partColors: value.partColors ?? {},
  }
}

function loadDraft(): RigDraft {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isDraft(parsed)) return normalizeDraft(parsed)
  } catch { /* a malformed local experiment should not brick the lab */ }
  return createRigDraft(quadrupedRig)
}

function pointFor(draft: RigDraft, pose: RigPoseId, id: string): RigPoint {
  return draft.poseOffsets[pose]?.[id] ?? zero()
}

function mirroredJoint(id: string) {
  if (id.startsWith('far')) return `near${id.slice(3)}`
  if (id.startsWith('near')) return `far${id.slice(4)}`
  return undefined
}

function diagonalJoint(id: string) {
  const match = id.match(/^(far|near)(Front|Rear)(.*)$/)
  if (!match) return undefined
  const side = match[1] === 'far' ? 'near' : 'far'
  const end = match[2] === 'Front' ? 'Rear' : 'Front'
  return `${side}${end}${match[3]}`
}

function transformed(delta: RigPoint, angleDeg: number, flipY: boolean): RigPoint {
  const angle = angleDeg * Math.PI / 180
  const y = flipY ? -delta.y : delta.y
  return {
    x: delta.x * Math.cos(angle) - y * Math.sin(angle),
    y: delta.x * Math.sin(angle) + y * Math.cos(angle),
    z: delta.z,
  }
}

export default function RigLab() {
  const [draft, setDraft] = useState(loadDraft)
  const [editPose, setEditPose] = useState<RigPoseId>('idleA')
  const [animation, setAnimation] = useState<RigAnimationId | null>('idle')
  const [phase, setPhase] = useState(0)
  const [showRig, setShowRig] = useState(true)
  const [selectedJoint, setSelectedJoint] = useState('head')
  const [selectedPart, setSelectedPart] = useState('body')
  const [liveMirror, setLiveMirror] = useState(false)
  const [lastEdit, setLastEdit] = useState<LastEdit | null>(null)
  const [repeatTarget, setRepeatTarget] = useState('nearFrontFoot')
  const [repeatAngle, setRepeatAngle] = useState(0)
  const [repeatFlipY, setRepeatFlipY] = useState(false)
  const [status, setStatus] = useState('Saved on this device')
  const [importText, setImportText] = useState('')
  const drag = useRef<{
    id: string
    pose: RigPoseId
    pointerId: number
    x: number
    y: number
    offset: RigPoint
    mirrorId?: string
    mirrorOffset?: RigPoint
    svg: SVGSVGElement
  } | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    setStatus('Saved on this device')
  }, [draft])

  useEffect(() => {
    if (!animation) return
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const duration = quadrupedRig.animations[animation].durationMs
      setPhase(((now - started) % duration) / duration)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animation])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = drag.current
      if (!active || event.pointerId !== active.pointerId) return
      event.preventDefault()
      const rect = active.svg.getBoundingClientRect()
      const [, , vw, vh] = quadrupedRig.viewBox
      const delta = {
        x: (event.clientX - active.x) * vw / rect.width,
        y: (event.clientY - active.y) * vh / rect.height,
        z: 0,
      }
      setDraft((current) => {
        const offsets = { ...current.poseOffsets[active.pose] }
        offsets[active.id] = { x: active.offset.x + delta.x, y: active.offset.y + delta.y, z: active.offset.z }
        if (active.mirrorId && active.mirrorOffset) {
          offsets[active.mirrorId] = {
            x: active.mirrorOffset.x + delta.x,
            y: active.mirrorOffset.y - delta.y,
            z: active.mirrorOffset.z,
          }
        }
        return { ...current, poseOffsets: { ...current.poseOffsets, [active.pose]: offsets } }
      })
      setLastEdit({ source: active.id, pose: active.pose, delta })
    }
    const up = (event: PointerEvent) => { if (drag.current?.pointerId === event.pointerId) drag.current = null }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const editRig = useMemo(() => resolveRigPose(quadrupedRig, draft, editPose), [draft, editPose])
  const rig = useMemo(
    () => animation ? sampleRigAnimation(quadrupedRig, draft, animation, phase) : editRig,
    [animation, draft, editRig, phase],
  )
  const selected = editRig[selectedJoint]
  const parent = selected?.parent ? editRig[selected.parent] : undefined
  const relative = selected ? {
    x: selected.x - (parent?.x ?? 0),
    y: selected.y - (parent?.y ?? 0),
    z: selected.z - (parent?.z ?? 0),
  } : zero()
  const joints = Object.values(editRig)
  const bounds = joints.reduce((out, joint) => ({
    minX: Math.min(out.minX, joint.x), maxX: Math.max(out.maxX, joint.x),
    minY: Math.min(out.minY, joint.y), maxY: Math.max(out.maxY, joint.y),
    minZ: Math.min(out.minZ, joint.z), maxZ: Math.max(out.maxZ, joint.z),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity })
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  }
  const editableParts = quadrupedRig.parts.filter((part) => part.kind !== 'joint')
  const part = quadrupedRig.parts.find((item) => item.id === selectedPart)!
  const partStyle = draft.partStyles[selectedPart] ?? DEFAULT_PART_STYLE
  const partColors: RigPartColors = draft.partColors[selectedPart] ?? {
    fill: PAPER_PALETTE[part.fill],
    lit: PAPER_PALETTE[part.lit],
    outline: PAPER_PALETTE[part.outline ?? 'ink'],
  }
  const errors = validateRigTemplate(quadrupedRig)
  const json = JSON.stringify(draft, null, 2)

  const startDrag = (id: string) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.preventDefault()
    setAnimation(null)
    setSelectedJoint(id)
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const mirrorId = liveMirror ? mirroredJoint(id) : undefined
    drag.current = {
      id,
      pose: editPose,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset: pointFor(draft, editPose, id),
      mirrorId,
      mirrorOffset: mirrorId ? pointFor(draft, editPose, mirrorId) : undefined,
      svg,
    }
  }

  const commitDelta = (id: string, delta: RigPoint, includeLiveMirror = liveMirror) => {
    if (![delta.x, delta.y, delta.z].every(Number.isFinite)) return
    setAnimation(null)
    setDraft((current) => {
      const offsets = { ...current.poseOffsets[editPose] }
      const existing = pointFor(current, editPose, id)
      offsets[id] = { x: existing.x + delta.x, y: existing.y + delta.y, z: existing.z + delta.z }
      const mirrorId = includeLiveMirror ? mirroredJoint(id) : undefined
      if (mirrorId) {
        const mirror = pointFor(current, editPose, mirrorId)
        offsets[mirrorId] = { x: mirror.x + delta.x, y: mirror.y - delta.y, z: mirror.z + delta.z }
      }
      return { ...current, poseOffsets: { ...current.poseOffsets, [editPose]: offsets } }
    })
    setLastEdit({ source: id, pose: editPose, delta })
  }

  const setCoordinate = (space: 'absolute' | 'relative', axis: keyof RigPoint, value: number) => {
    if (!selected) return
    const current = space === 'absolute' ? selected[axis] : relative[axis]
    commitDelta(selectedJoint, { ...zero(), [axis]: value - current })
  }

  const repeatEdit = (target: string | undefined, flipY = repeatFlipY) => {
    if (!lastEdit || !target || !editRig[target]) return
    setEditPose(lastEdit.pose)
    const delta = transformed(lastEdit.delta, repeatAngle, flipY)
    setDraft((current) => {
      const offsets = { ...current.poseOffsets[lastEdit.pose] }
      const existing = pointFor(current, lastEdit.pose, target)
      offsets[target] = { x: existing.x + delta.x, y: existing.y + delta.y, z: existing.z + delta.z }
      return { ...current, poseOffsets: { ...current.poseOffsets, [lastEdit.pose]: offsets } }
    })
    setSelectedJoint(target)
    setAnimation(null)
    setStatus(`Repeated edit on ${target}`)
  }

  const updateParam = (id: keyof RigParams, value: number) => {
    setAnimation(null)
    setDraft((current) => ({ ...current, params: { ...current.params, [id]: value } }))
  }

  const updatePartStyle = <K extends keyof RigPartStyle>(key: K, value: RigPartStyle[K]) => {
    setDraft((current) => ({
      ...current,
      partStyles: { ...current.partStyles, [selectedPart]: { ...partStyle, [key]: value } },
    }))
  }

  const updatePartColor = (key: keyof RigPartColors, value: string) => {
    setDraft((current) => ({
      ...current,
      partColors: { ...current.partColors, [selectedPart]: { ...partColors, [key]: value } },
    }))
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setStatus('Rig JSON copied') }
    catch { setStatus('Clipboard unavailable') }
  }
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: draft.name, text: json }); setStatus('Shared') }
      else await copy()
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Share unavailable') }
  }
  const importDraft = () => {
    try {
      const parsed = JSON.parse(importText)
      if (!isDraft(parsed)) throw new Error('Expected a quadruped-v0 rig draft')
      setDraft(normalizeDraft(parsed)); setImportText(''); setStatus('Imported and saved')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not import rig') }
  }
  const reset = () => {
    if (!confirm('Reset this local rig draft?')) return
    setDraft(createRigDraft(quadrupedRig)); setLastEdit(null); setStatus('Reset')
  }

  return (
    <div data-rig-lab className="min-h-full bg-game-bg text-game-text p-3 pt-12 sm:p-6 sm:pt-12 overflow-auto">
      <header className="max-w-6xl mx-auto mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-game-primary">Prototype · template {quadrupedRig.id}</p>
        <div className="flex items-end justify-between gap-3">
          <div><h1 className="text-xl sm:text-2xl font-semibold">Rig Lab</h1><p className="text-xs text-game-text-dim mt-1">Author idle once, layer actions, inspect in 3-D, then share the draft.</p></div>
          <span className="text-[10px] text-game-muted text-right">forward +x<br />{status}</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_360px] gap-3">
        <div className="space-y-3">
          <section className="rounded-2xl border border-game-border bg-game-surface overflow-hidden">
            <div className="aspect-square max-h-[66vh] min-h-[320px] p-4 bg-game-bg/40">
              <RiggedMonster template={quadrupedRig} rig={rig} params={draft.params} showRig={showRig} selectedJoint={selectedJoint} onJointPointerDown={startDrag} partStyles={draft.partStyles} partColors={draft.partColors} />
            </div>
            <div className="p-3 border-t border-game-border space-y-3">
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {ANIMATIONS.map((id) => <button key={id} onClick={() => setAnimation(id)} className={`shrink-0 px-3 py-2 rounded-lg border text-xs capitalize ${animation === id ? 'border-game-primary bg-game-primary/20' : 'border-game-border text-game-text-dim'}`}>▶ {id}</button>)}
                <button onClick={() => setAnimation(null)} className={`shrink-0 px-3 py-2 rounded-lg border text-xs ${!animation ? 'border-game-primary bg-game-primary/20' : 'border-game-border text-game-text-dim'}`}>Edit pose</button>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {POSES.map((pose) => <button key={pose} onClick={() => { setAnimation(null); setEditPose(pose) }} title={`${poseLayers(quadrupedRig, pose).join(' → ') || 'bind pose'}`} className={`shrink-0 px-2.5 py-1.5 rounded-md border text-[11px] ${!animation && editPose === pose ? 'border-game-gold text-game-gold bg-game-gold/10' : 'border-game-border text-game-muted'}`}>{pose}</button>)}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-game-text-dim">
                <label className="flex items-center gap-2"><input type="checkbox" checked={showRig} onChange={(event) => setShowRig(event.target.checked)} className="accent-game-primary" />Show skeleton</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={liveMirror} onChange={(event) => setLiveMirror(event.target.checked)} className="accent-game-primary" />Live mirror paired limbs</label>
              </div>
              <p className="text-[10px] text-game-muted">Editing <b className="text-game-text-dim">{editPose}</b>{quadrupedRig.poseBase?.[editPose as Exclude<RigPoseId, 'bind'>] ? ` over ${quadrupedRig.poseBase[editPose as Exclude<RigPoseId, 'bind'>]}` : ''}. Tap and drag a joint; actions inherit their idle posture.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-3 space-y-2">
            <div><h2 className="text-sm font-semibold">Selected chain in 3-D</h2><p className="text-[10px] text-game-muted">The same joints projected top (x/y), side (x/z), and front (y/z).</p></div>
            <RigSegmentViews rig={editRig} selectedJoint={selectedJoint} onSelectJoint={setSelectedJoint} />
          </section>
        </div>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Skeleton proportions</h2><button onClick={reset} className="text-[10px] text-game-muted">Reset</button></div>
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-label="Rig name" className="w-full rounded-lg border border-game-border bg-game-bg px-3 py-2 text-xs" />
            {PARAMS.map((param) => <label key={param.id} className="block"><span className="flex justify-between text-[11px] text-game-text-dim"><span>{param.label}</span><output>{draft.params[param.id]}</output></span><input type="range" min={param.min} max={param.max} step={param.step} value={draft.params[param.id]} onChange={(event) => updateParam(param.id, Number(event.target.value))} className="w-full accent-game-primary" /></label>)}
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Joint coordinates</h2>
            <select value={selectedJoint} onChange={(event) => setSelectedJoint(event.target.value)} className="w-full rounded-lg border border-game-border bg-game-bg px-3 py-2 text-xs">{joints.map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}</select>
            {selected && <>
              {(['absolute', 'relative'] as const).map((space) => <div key={space}><div className="mb-1 text-[9px] uppercase tracking-wider text-game-muted">{space}{space === 'relative' ? ` to ${parent?.label ?? 'rig origin'}` : ' in rig'}</div><div className="grid grid-cols-3 gap-2">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis} className="text-[9px] text-game-muted"><span className="uppercase">{axis}</span><input type="number" step="0.1" value={(space === 'absolute' ? selected[axis] : relative[axis]).toFixed(2)} onChange={(event) => setCoordinate(space, axis, Number(event.target.value))} className="mt-1 w-full rounded-md border border-game-border bg-game-bg p-1.5 text-[11px] text-game-text" /></label>)}</div></div>)}
              <label className="block"><span className="flex justify-between text-[11px] text-game-text-dim"><span>Z height / layer</span><output>{selected.z.toFixed(2)}</output></span><input type="range" min="-2" max="8" step="0.1" value={selected.z} onChange={(event) => setCoordinate('absolute', 'z', Number(event.target.value))} className="w-full accent-game-gold" /></label>
            </>}
            <div className="rounded-lg bg-game-bg/60 p-2 font-mono text-[9px] text-game-muted">rig center [{center.x.toFixed(1)}, {center.y.toFixed(1)}, {center.z.toFixed(1)}]<br />extent [{(bounds.maxX - bounds.minX).toFixed(1)}, {(bounds.maxY - bounds.minY).toFixed(1)}, {(bounds.maxZ - bounds.minZ).toFixed(1)}]</div>
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Repeat last edit</h2>
            {lastEdit ? <>
              <div className="font-mono text-[10px] text-game-muted">{lastEdit.source} · {lastEdit.pose}<br />Δ [{lastEdit.delta.x.toFixed(2)}, {lastEdit.delta.y.toFixed(2)}, {lastEdit.delta.z.toFixed(2)}]</div>
              <div className="grid grid-cols-2 gap-2"><button onClick={() => repeatEdit(mirroredJoint(lastEdit.source), true)} disabled={!mirroredJoint(lastEdit.source)} className="rounded-lg border border-game-border px-2 py-2 text-xs disabled:opacity-35">Mirror pair</button><button onClick={() => repeatEdit(diagonalJoint(lastEdit.source), false)} disabled={!diagonalJoint(lastEdit.source)} className="rounded-lg border border-game-border px-2 py-2 text-xs disabled:opacity-35">Diagonal</button></div>
              <select value={repeatTarget} onChange={(event) => setRepeatTarget(event.target.value)} className="w-full rounded-lg border border-game-border bg-game-bg px-3 py-2 text-xs">{joints.map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}</select>
              <label className="block"><span className="flex justify-between text-[11px] text-game-text-dim"><span>Rotate copied Δ</span><output>{repeatAngle}°</output></span><input type="range" min="-180" max="180" step="5" value={repeatAngle} onChange={(event) => setRepeatAngle(Number(event.target.value))} className="w-full accent-game-primary" /></label>
              <div className="flex items-center gap-2"><label className="flex flex-1 items-center gap-2 text-[11px] text-game-text-dim"><input type="checkbox" checked={repeatFlipY} onChange={(event) => setRepeatFlipY(event.target.checked)} />Flip lateral Y</label><button onClick={() => repeatEdit(repeatTarget)} className="rounded-lg border border-game-primary bg-game-primary/15 px-3 py-2 text-xs">Apply</button></div>
            </> : <p className="text-[10px] text-game-muted">Move or numerically edit a joint, then replay that Δ on its pair, diagonal, or any chosen joint.</p>}
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Silhouette + color</h2>
            <select value={selectedPart} onChange={(event) => setSelectedPart(event.target.value)} className="w-full rounded-lg border border-game-border bg-game-bg px-3 py-2 text-xs">{editableParts.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select>
            <div className="grid grid-cols-4 gap-1">{(['round', 'tapered', 'angular', 'spiky'] as const).map((shape) => <button key={shape} onClick={() => updatePartStyle('shape', shape)} className={`rounded-md border px-1 py-2 text-[9px] ${partStyle.shape === shape ? 'border-game-primary bg-game-primary/20' : 'border-game-border text-game-muted'}`}>{shape}</button>)}</div>
            <label className="block"><span className="flex justify-between text-[11px] text-game-text-dim"><span>Width</span><output>{partStyle.widthScale.toFixed(2)}×</output></span><input type="range" min="0.45" max="1.8" step="0.05" value={partStyle.widthScale} onChange={(event) => updatePartStyle('widthScale', Number(event.target.value))} className="w-full accent-game-primary" /></label>
            <label className="block"><span className="flex justify-between text-[11px] text-game-text-dim"><span>Sharpness</span><output>{partStyle.sharpness.toFixed(2)}</output></span><input type="range" min="0" max="1" step="0.05" value={partStyle.sharpness} onChange={(event) => updatePartStyle('sharpness', Number(event.target.value))} className="w-full accent-game-primary" /></label>
            <div className="grid grid-cols-3 gap-2">{(['fill', 'lit', 'outline'] as const).map((key) => <label key={key} className="text-center text-[9px] uppercase text-game-muted"><input type="color" value={partColors[key]} onChange={(event) => updatePartColor(key, event.target.value)} className="block h-9 w-full rounded border border-game-border bg-transparent" />{key}</label>)}</div>
            <p className="text-[9px] text-game-muted">Exploratory colors stay in the draft; production output must snap or promote them to named paper roles.</p>
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Share this model</h2>
            <div className="grid grid-cols-2 gap-2"><button onClick={copy} className="px-3 py-2 rounded-lg border border-game-border text-xs">Copy JSON</button><button onClick={share} className="px-3 py-2 rounded-lg border border-game-primary bg-game-primary/15 text-xs">Share…</button></div>
            <details><summary className="text-[11px] text-game-text-dim cursor-pointer">Import shared JSON</summary><textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={5} placeholder="Paste rig JSON" className="mt-2 w-full rounded-lg border border-game-border bg-game-bg p-2 font-mono text-[10px]" /><button onClick={importDraft} className="mt-2 w-full px-3 py-2 rounded-lg border border-game-border text-xs">Import</button></details>
            <p className={`text-[10px] ${errors.length ? 'text-red-300' : 'text-game-muted'}`}>{errors.length ? errors.join(' · ') : 'Template contract valid · edits saved locally'}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
