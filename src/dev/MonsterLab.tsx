// Dev-only Monster Lab (`?monsterlab=1`, ☰ Menu → Developer): retune a monster's
// stats / skills / tactics LIVE and watch the effect on the next spawn, then hand
// off a change-request report an LLM can bake into `src/data/monsters.ts`.
//
// Every edit mutates the live `MONSTER_REGISTRY` and persists to localStorage via
// `monsterOverrides.ts`, so tweaks take effect for subsequent spawns/waves (in
// this session and after "← Game"). "Generate change request" diffs the live defs
// against the authored baseline and emits a copy/downloadable markdown report.
import { useMemo, useState } from 'react'
import type { MonsterDef, MonsterSize } from '@/types'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { SKILL_REGISTRY } from '@/data/skills'
import { TACTIC_REGISTRY } from '@/engine/tactics'
import { ALL_ELEMENTS, type Element } from '@/engine/elements'
import {
  buildChangeReport,
  currentDef,
  diffMonster,
  isOverridden,
  originalDef,
  overriddenIds,
  resetAllOverrides,
  resetOverride,
  setOverride,
} from '@/data/monsterOverrides'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const MONSTER_LIST = Object.values(MONSTER_REGISTRY)
  .map((m) => ({ id: m.id, name: m.name }))
  .sort((a, b) => a.name.localeCompare(b.name))

const SIZES: MonsterSize[] = ['small', 'medium', 'large']

// One editable numeric leaf: read + write against a working draft. Tuple legs
// (defense/magicDefense) are addressed by their leg index.
type NumField = {
  label: string
  hint?: string
  get: (d: MonsterDef) => number
  set: (d: MonsterDef, v: number) => void
  step?: number
  min?: number
}
const CORE_FIELDS: NumField[] = [
  { label: 'Level', get: (d) => d.level, set: (d, v) => (d.level = v), min: 1 },
  { label: 'Health', step: 5, get: (d) => d.health, set: (d, v) => (d.health = v), min: 1 },
]
const STAT_FIELDS: NumField[] = [
  { label: 'Attack', get: (d) => d.stats.attack, set: (d, v) => (d.stats.attack = v) },
  { label: 'Def · ability', hint: 'defense[0]', get: (d) => d.stats.defense[0], set: (d, v) => (d.stats.defense[0] = v) },
  { label: 'Def · armor', hint: 'defense[1]', get: (d) => d.stats.defense[1], set: (d, v) => (d.stats.defense[1] = v) },
  { label: 'Magic Atk', get: (d) => d.stats.magicAttack, set: (d, v) => (d.stats.magicAttack = v) },
  { label: 'M.Def · ability', hint: 'magicDefense[0]', get: (d) => d.stats.magicDefense[0], set: (d, v) => (d.stats.magicDefense[0] = v) },
  { label: 'M.Def · armor', hint: 'magicDefense[1]', get: (d) => d.stats.magicDefense[1], set: (d, v) => (d.stats.magicDefense[1] = v) },
  { label: 'Attack Speed', get: (d) => d.stats.attackSpeed, set: (d, v) => (d.stats.attackSpeed = v) },
  { label: 'Accuracy', get: (d) => d.stats.accuracy, set: (d, v) => (d.stats.accuracy = v) },
  { label: 'Dodge', get: (d) => d.stats.dodge, set: (d, v) => (d.stats.dodge = v) },
  { label: 'Move Speed', hint: 'ft/s', step: 0.5, get: (d) => d.stats.moveSpeed ?? 0, set: (d, v) => (d.stats.moveSpeed = v) },
  { label: 'Attack Range', hint: 'ft', step: 5, get: (d) => d.stats.attackRange ?? 5, set: (d, v) => (d.stats.attackRange = v) },
]

const ALL_SKILLS = Object.values(SKILL_REGISTRY).sort((a, b) => a.name.localeCompare(b.name))
const ALL_TACTICS = Object.values(TACTIC_REGISTRY).sort((a, b) => a.name.localeCompare(b.name))

export default function MonsterLab() {
  const [selectedId, setSelectedId] = useState(MONSTER_LIST[0]?.id ?? '')
  const [draft, setDraft] = useState<MonsterDef>(() => clone(currentDef(MONSTER_LIST[0]?.id ?? '')!))
  const [search, setSearch] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  // Bumped after any mutation to refresh override markers / the changed-count.
  const [rev, setRev] = useState(0)
  const bump = () => setRev((r) => r + 1)

  const overrides = useMemo(() => new Set(overriddenIds()), [rev])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? MONSTER_LIST.filter((m) => m.name.toLowerCase().includes(q) || m.id.includes(q)) : MONSTER_LIST
  }, [search])

  function pick(id: string) {
    setSelectedId(id)
    setDraft(clone(currentDef(id)!))
  }

  // Apply a mutation to the working draft, push it live, and refresh markers.
  function edit(mut: (d: MonsterDef) => void) {
    const next = clone(draft)
    mut(next)
    setDraft(next)
    setOverride(selectedId, next)
    bump()
  }

  function reset() {
    resetOverride(selectedId)
    setDraft(clone(originalDef(selectedId)!))
    bump()
  }

  const dirty = diffMonster(selectedId)
  const changedCount = overrides.size

  return (
    <div className="fixed inset-0 bg-game-bg text-game-text flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-game-border bg-game-surface/70 pl-24">
        <span className="text-sm font-semibold">🧟 Monster Lab</span>
        <span className="text-[10px] text-game-muted hidden sm:inline">live tuning · applies to the next spawn</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { if (confirm('Revert ALL monster overrides to their authored values?')) { resetAllOverrides(); pick(selectedId); bump() } }}
            disabled={changedCount === 0}
            className="px-2.5 py-1.5 rounded-lg border border-game-border text-xs text-game-text-dim hover:text-game-text disabled:opacity-40"
          >Reset all</button>
          <button
            onClick={() => setReportOpen(true)}
            disabled={changedCount === 0}
            className="px-3 py-1.5 rounded-lg border border-game-primary/60 bg-game-primary/15 text-xs text-game-text font-medium hover:bg-game-primary/25 disabled:opacity-40"
          >📋 Change request{changedCount ? ` (${changedCount})` : ''}</button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Monster list */}
        <aside className="w-40 sm:w-52 shrink-0 border-r border-game-border flex flex-col bg-game-surface/30">
          <div className="p-2 border-b border-game-border">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1.5 rounded-md bg-game-bg border border-game-border text-xs text-game-text placeholder:text-game-muted"
            />
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => pick(m.id)}
                className={[
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs',
                  m.id === selectedId ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:bg-white/5',
                ].join(' ')}
              >
                <span className="truncate flex-1">{m.name}</span>
                {overrides.has(m.id) && <span className="text-game-gold text-[9px]" title="Overridden">●</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* Editor */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{draft.name}</h2>
            <code className="text-[10px] text-game-muted">{draft.id}</code>
            {isOverridden(selectedId) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-game-gold/20 text-game-gold border border-game-gold/40">
                {dirty.length} change{dirty.length === 1 ? '' : 's'}
              </span>
            )}
            <button
              onClick={reset}
              disabled={!isOverridden(selectedId)}
              className="ml-auto px-2.5 py-1 rounded-lg border border-game-border text-[11px] text-game-text-dim hover:text-game-text disabled:opacity-40"
            >↺ Reset this monster</button>
          </div>

          {/* Core + identity */}
          <Section title="Core">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CORE_FIELDS.map((f) => (
                <NumberField key={f.label} field={f} draft={draft} orig={originalDef(selectedId)!} onEdit={edit} />
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-game-muted">Element</span>
                <select
                  value={draft.element}
                  onChange={(e) => edit((d) => (d.element = e.target.value as Element))}
                  className="px-2 py-1.5 rounded-md bg-game-bg border border-game-border text-xs text-game-text"
                >
                  {ALL_ELEMENTS.map((el) => <option key={el} value={el}>{el}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-game-muted">Size</span>
                <select
                  value={draft.size}
                  onChange={(e) => edit((d) => (d.size = e.target.value as MonsterSize))}
                  className="px-2 py-1.5 rounded-md bg-game-bg border border-game-border text-xs text-game-text"
                >
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          </Section>

          {/* Stats */}
          <Section title="Stats">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STAT_FIELDS.map((f) => (
                <NumberField key={f.label} field={f} draft={draft} orig={originalDef(selectedId)!} onEdit={edit} />
              ))}
            </div>
          </Section>

          {/* Skills */}
          <Section title="Skills" hint="engine skill kit — same as a hero's action bar">
            <ListEditor
              rows={(draft.skills ?? []).map((s) => ({
                key: s.id,
                label: SKILL_REGISTRY[s.id]?.name ?? s.id,
                value: s.level,
                max: SKILL_REGISTRY[s.id]?.maxLevel ?? 10,
              }))}
              valueLabel="Lv"
              onValue={(id, v) => edit((d) => {
                const list = d.skills ?? (d.skills = [])
                const row = list.find((s) => s.id === id)
                if (row) row.level = v
              })}
              onRemove={(id) => edit((d) => { d.skills = (d.skills ?? []).filter((s) => s.id !== id); if (d.skills.length === 0) delete d.skills })}
              addOptions={ALL_SKILLS.filter((s) => !(draft.skills ?? []).some((x) => x.id === s.id)).map((s) => ({ id: s.id, name: s.name }))}
              onAdd={(id) => edit((d) => { (d.skills ?? (d.skills = [])).push({ id, level: 1 }) })}
              addLabel="+ Add skill"
            />
          </Section>

          {/* Tactics */}
          <Section title="Tactics" hint="behaviour kit — pure behaviour, no stat effect">
            <ListEditor
              rows={(draft.tactics ?? []).map((t) => ({
                key: t.id,
                label: TACTIC_REGISTRY[t.id]?.name ?? t.id,
                value: t.rank,
                max: 9,
              }))}
              valueLabel="r"
              onValue={(id, v) => edit((d) => {
                const list = d.tactics ?? (d.tactics = [])
                const row = list.find((t) => t.id === id)
                if (row) row.rank = v
              })}
              onRemove={(id) => edit((d) => { d.tactics = (d.tactics ?? []).filter((t) => t.id !== id); if (d.tactics.length === 0) delete d.tactics })}
              addOptions={ALL_TACTICS.filter((t) => !(draft.tactics ?? []).some((x) => x.id === t.id)).map((t) => ({ id: t.id, name: t.name }))}
              onAdd={(id) => edit((d) => { (d.tactics ?? (d.tactics = [])).push({ id, rank: 1 }) })}
              addLabel="+ Add tactic"
            />
          </Section>
        </main>
      </div>

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-game-border bg-game-surface/40 p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-game-text-dim">{title}</h3>
        {hint && <span className="text-[10px] text-game-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function NumberField({
  field,
  draft,
  orig,
  onEdit,
}: {
  field: NumField
  draft: MonsterDef
  orig: MonsterDef
  onEdit: (mut: (d: MonsterDef) => void) => void
}) {
  const cur = field.get(draft)
  const base = field.get(orig)
  const changed = cur !== base
  const step = field.step ?? 1
  const commit = (v: number) => {
    if (Number.isNaN(v)) return
    const clamped = field.min !== undefined ? Math.max(field.min, v) : v
    onEdit((d) => field.set(d, clamped))
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-game-muted flex items-center gap-1">
        {field.label}
        {field.hint && <span className="text-game-border">{field.hint}</span>}
        {changed && <span className="text-game-gold" title={`was ${base}`}>•</span>}
      </span>
      <div className="flex items-stretch">
        <button onClick={() => commit(cur - step)} className="px-2 rounded-l-md bg-game-bg border border-game-border border-r-0 text-game-text-dim hover:text-game-text text-xs">−</button>
        <input
          type="number"
          step={step}
          value={cur}
          onChange={(e) => commit(Number(e.target.value))}
          className={['w-full min-w-0 px-1.5 py-1.5 bg-game-bg border-y border-game-border text-xs text-center tabular-nums', changed ? 'text-game-gold font-medium' : 'text-game-text'].join(' ')}
        />
        <button onClick={() => commit(cur + step)} className="px-2 rounded-r-md bg-game-bg border border-game-border border-l-0 text-game-text-dim hover:text-game-text text-xs">+</button>
      </div>
    </label>
  )
}

type Row = { key: string; label: string; value: number; max: number }
function ListEditor({
  rows,
  valueLabel,
  onValue,
  onRemove,
  addOptions,
  onAdd,
  addLabel,
}: {
  rows: Row[]
  valueLabel: string
  onValue: (id: string, v: number) => void
  onRemove: (id: string) => void
  addOptions: { id: string; name: string }[]
  onAdd: (id: string) => void
  addLabel: string
}) {
  const [adding, setAdding] = useState('')
  return (
    <div className="space-y-1.5">
      {rows.length === 0 && <div className="text-[11px] text-game-muted italic">none</div>}
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 rounded-md bg-game-bg/60 border border-game-border px-2 py-1">
          <span className="flex-1 text-xs truncate">{r.label}</span>
          <code className="text-[9px] text-game-muted hidden sm:inline">{r.key}</code>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-game-muted">{valueLabel}</span>
            <button onClick={() => onValue(r.key, Math.max(1, r.value - 1))} className="w-6 h-6 rounded bg-game-surface border border-game-border text-game-text-dim hover:text-game-text text-xs">−</button>
            <span className="w-5 text-center text-xs tabular-nums">{r.value}</span>
            <button onClick={() => onValue(r.key, Math.min(r.max, r.value + 1))} className="w-6 h-6 rounded bg-game-surface border border-game-border text-game-text-dim hover:text-game-text text-xs">+</button>
          </div>
          <button onClick={() => onRemove(r.key)} className="w-6 h-6 rounded bg-game-surface border border-game-border text-red-400/80 hover:text-red-400 text-xs" title="Remove">✕</button>
        </div>
      ))}
      {addOptions.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-md bg-game-bg border border-game-border text-xs text-game-text"
          >
            <option value="">{addLabel}…</option>
            {addOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button
            onClick={() => { if (adding) { onAdd(adding); setAdding('') } }}
            disabled={!adding}
            className="px-2.5 py-1.5 rounded-md border border-game-border text-xs text-game-text-dim hover:text-game-text disabled:opacity-40"
          >{addLabel}</button>
        </div>
      )}
    </div>
  )
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const report = useMemo(() => buildChangeReport(), [])
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  }
  function download() {
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'monster-change-request.md'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-game-border bg-game-surface" onClick={(e) => e.stopPropagation()}>
        <header className="shrink-0 flex items-center gap-2 px-4 h-12 border-b border-game-border">
          <span className="text-sm font-semibold">Change request</span>
          <span className="text-[10px] text-game-muted">hand this to an LLM to bake into monsters.ts</span>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text">✕</button>
        </header>
        <textarea
          readOnly
          value={report}
          className="flex-1 min-h-0 w-full resize-none p-3 bg-game-bg font-mono text-[11px] leading-relaxed text-game-text-dim"
        />
        <footer className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-game-border">
          <button onClick={copy} className="px-3 py-1.5 rounded-lg border border-game-primary/60 bg-game-primary/15 text-xs font-medium hover:bg-game-primary/25">{copied ? '✓ Copied' : '📋 Copy'}</button>
          <button onClick={download} className="px-3 py-1.5 rounded-lg border border-game-border text-xs text-game-text-dim hover:text-game-text">⬇ Download .md</button>
        </footer>
      </div>
    </div>
  )
}
