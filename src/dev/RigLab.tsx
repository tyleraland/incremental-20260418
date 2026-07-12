import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RiggedMonster } from '@/render/rigs/RiggedMonster'
import { createRigDraft, resolveRigPose, sampleRigAnimation, validateRigTemplate } from '@/render/rigs/model'
import { quadrupedRig } from '@/render/rigs/quadruped'
import type { RigAnimationId, RigDraft, RigParams, RigPoint, RigPoseId } from '@/render/rigs/types'

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

function isDraft(value: unknown): value is RigDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<RigDraft>
  return draft.version === 1 && draft.templateId === quadrupedRig.id && !!draft.params && !!draft.poseOffsets
}
function loadDraft(): RigDraft {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isDraft(parsed)) return parsed
  } catch { /* a malformed local experiment should not brick the lab */ }
  return createRigDraft(quadrupedRig)
}

function pointFor(draft: RigDraft, pose: RigPoseId, id: string): RigPoint {
  return draft.poseOffsets[pose]?.[id] ?? { x: 0, y: 0, z: 0 }
}

export default function RigLab() {
  const [draft, setDraft] = useState(loadDraft)
  const [editPose, setEditPose] = useState<RigPoseId>('bind')
  const [animation, setAnimation] = useState<RigAnimationId | null>('idle')
  const [phase, setPhase] = useState(0)
  const [showRig, setShowRig] = useState(true)
  const [selectedJoint, setSelectedJoint] = useState('head')
  const [status, setStatus] = useState('Saved on this device')
  const [importText, setImportText] = useState('')
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; offset: RigPoint; svg: SVGSVGElement } | null>(null)

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
      const next = {
        x: active.offset.x + (event.clientX - active.x) * vw / rect.width,
        y: active.offset.y + (event.clientY - active.y) * vh / rect.height,
        z: active.offset.z,
      }
      setDraft((current) => ({
        ...current,
        poseOffsets: {
          ...current.poseOffsets,
          [editPose]: { ...current.poseOffsets[editPose], [active.id]: next },
        },
      }))
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
  }, [editPose])

  const rig = useMemo(
    () => animation ? sampleRigAnimation(quadrupedRig, draft, animation, phase) : resolveRigPose(quadrupedRig, draft, editPose),
    [animation, draft, editPose, phase],
  )
  const selected = rig[selectedJoint]
  const errors = validateRigTemplate(quadrupedRig)
  const json = JSON.stringify(draft, null, 2)

  const startDrag = (id: string) => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.preventDefault()
    setAnimation(null)
    setSelectedJoint(id)
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    drag.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset: pointFor(draft, editPose, id), svg }
  }

  const updateParam = (id: keyof RigParams, value: number) => {
    setAnimation(null)
    setDraft((current) => ({ ...current, params: { ...current.params, [id]: value } }))
  }

  const setSelectedZ = (value: number) => {
    if (!selected) return
    const currentOffset = pointFor(draft, editPose, selectedJoint)
    const next = { ...currentOffset, z: currentOffset.z + value - selected.z }
    setDraft((current) => ({
      ...current,
      poseOffsets: { ...current.poseOffsets, [editPose]: { ...current.poseOffsets[editPose], [selectedJoint]: next } },
    }))
  }

  const copy = async () => {
    await navigator.clipboard.writeText(json)
    setStatus('Rig JSON copied')
  }

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: draft.name, text: json })
      setStatus('Shared')
    } else await copy()
  }

  const importDraft = () => {
    try {
      const parsed = JSON.parse(importText)
      if (!isDraft(parsed)) throw new Error('Expected a quadruped-v0 rig draft')
      setDraft(parsed)
      setImportText('')
      setStatus('Imported and saved')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import rig')
    }
  }

  const reset = () => {
    if (!confirm('Reset this local rig draft?')) return
    setDraft(createRigDraft(quadrupedRig))
    setStatus('Reset')
  }

  return (
    <div data-rig-lab className="min-h-full bg-game-bg text-game-text p-3 pt-12 sm:p-6 sm:pt-12 overflow-auto">
      <header className="max-w-6xl mx-auto mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-game-primary">Prototype · template {quadrupedRig.id}</p>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Rig Lab</h1>
            <p className="text-xs text-game-text-dim mt-1">Shape one skeleton, preview its motion, then share the small rig draft.</p>
          </div>
          <span className="text-[10px] text-game-muted text-right">forward +x<br />{status}</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_340px] gap-3">
        <section className="rounded-2xl border border-game-border bg-game-surface overflow-hidden">
          <div className="aspect-square max-h-[66vh] min-h-[320px] p-4 bg-game-bg/40">
            <RiggedMonster
              template={quadrupedRig}
              rig={rig}
              params={draft.params}
              showRig={showRig}
              selectedJoint={selectedJoint}
              onJointPointerDown={startDrag}
            />
          </div>
          <div className="p-3 border-t border-game-border space-y-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {ANIMATIONS.map((id) => <button
                key={id}
                onClick={() => setAnimation(id)}
                className={`shrink-0 px-3 py-2 rounded-lg border text-xs capitalize ${animation === id ? 'border-game-primary bg-game-primary/20' : 'border-game-border text-game-text-dim'}`}
              >▶ {id}</button>)}
              <button onClick={() => setAnimation(null)} className={`shrink-0 px-3 py-2 rounded-lg border text-xs ${!animation ? 'border-game-primary bg-game-primary/20' : 'border-game-border text-game-text-dim'}`}>Edit pose</button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {POSES.map((pose) => <button
                key={pose}
                onClick={() => { setAnimation(null); setEditPose(pose) }}
                className={`shrink-0 px-2.5 py-1.5 rounded-md border text-[11px] ${!animation && editPose === pose ? 'border-game-gold text-game-gold bg-game-gold/10' : 'border-game-border text-game-muted'}`}
              >{pose}</button>)}
            </div>
            <label className="flex items-center gap-2 text-xs text-game-text-dim">
              <input type="checkbox" checked={showRig} onChange={(event) => setShowRig(event.target.checked)} className="accent-game-primary" />
              Show skeleton · tap and drag a joint to edit {editPose}
            </label>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Skeleton proportions</h2>
              <button onClick={reset} className="text-[10px] text-game-muted">Reset</button>
            </div>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              aria-label="Rig name"
              className="w-full rounded-lg border border-game-border bg-game-bg px-3 py-2 text-xs"
            />
            {PARAMS.map((param) => <label key={param.id} className="block">
              <span className="flex justify-between text-[11px] text-game-text-dim"><span>{param.label}</span><output>{draft.params[param.id]}</output></span>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={draft.params[param.id]}
                onChange={(event) => updateParam(param.id, Number(event.target.value))}
                className="w-full accent-game-primary"
              />
            </label>)}
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Selected joint</h2>
            <select value={selectedJoint} onChange={(event) => setSelectedJoint(event.target.value)} className="w-full rounded-lg border border-game-border bg-game-bg px-3 py-2 text-xs">
              {Object.values(rig).map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}
            </select>
            {selected && <label className="block">
              <span className="flex justify-between text-[11px] text-game-text-dim"><span>Z height / layer</span><output>{selected.z.toFixed(2)}</output></span>
              <input type="range" min="0" max="6" step="0.1" value={selected.z} onChange={(event) => { setAnimation(null); setSelectedZ(Number(event.target.value)) }} className="w-full accent-game-gold" />
            </label>}
            <p className="text-[10px] leading-relaxed text-game-muted">Z lifts a joint in the top-down projection and contributes to stable part ordering. X/Y come from direct manipulation.</p>
          </section>

          <section className="rounded-2xl border border-game-border bg-game-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Share this model</h2>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copy} className="px-3 py-2 rounded-lg border border-game-border text-xs">Copy JSON</button>
              <button onClick={share} className="px-3 py-2 rounded-lg border border-game-primary bg-game-primary/15 text-xs">Share…</button>
            </div>
            <details>
              <summary className="text-[11px] text-game-text-dim cursor-pointer">Import shared JSON</summary>
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={5} placeholder="Paste rig JSON" className="mt-2 w-full rounded-lg border border-game-border bg-game-bg p-2 font-mono text-[10px]" />
              <button onClick={importDraft} className="mt-2 w-full px-3 py-2 rounded-lg border border-game-border text-xs">Import</button>
            </details>
            <p className={`text-[10px] ${errors.length ? 'text-red-300' : 'text-game-muted'}`}>{errors.length ? errors.join(' · ') : 'Template contract valid · edits saved locally'}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
