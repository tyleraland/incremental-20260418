// Dev-only Monster Lab (`?monsterlab=1`, ☰ Menu → Developer): retune a monster's
// stats / skills / tactics LIVE and watch the effect on the next spawn, then hand
// off a change-request report an LLM can bake into `src/data/monsters.ts`.
//
// Every edit mutates the live `MONSTER_REGISTRY` and persists to localStorage via
// `monsterOverrides.ts`, so tweaks take effect for subsequent spawns/waves (in
// this session and after "← Game"). "Generate change request" diffs the live defs
// against the authored baseline and emits a copy/downloadable markdown report.
//
// Battle Simulator (▶ button): drops the tuned monster into a real battlefield
// against heroes you build — fresh class templates or shallow copies of your save
// roster — sharing the Battle Sandbox's save-safe scene seeder (simBattle.ts).
// App.tsx gates ?monsterlab no-persist, so the synthetic scene NEVER touches a
// save (sandbox or curated).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Location, MonsterDef, MonsterSize } from '@/types'
import { useGameStore, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { monsterBodyShape, BODY_SHAPES, type BodyShape } from '@/render/appearance'
import { BodyAnimPreview } from './BodyAnimPreview'
import { SKILL_REGISTRY } from '@/data/skills'
import { TACTIC_REGISTRY } from '@/engine/tactics'
import { ALL_ELEMENTS, type Element } from '@/engine/elements'
import { TICKS_PER_SECOND } from '@/lib/time'
import { BattleView } from '@/components/BattleView'
import { getAppearance } from '@/render/appearance'
import { TOKEN_SKINS } from '@/render/skins'
import type { Combatant } from '@/engine'
import { seedSimBattle } from './simBattle'
import {
  buildChangeReport,
  buildDraftExport,
  currentDef,
  deleteDraftMonster,
  diffMonster,
  draftIds,
  isDraftMonster,
  isOverridden,
  originalDef,
  overriddenIds,
  resetAllOverrides,
  resetOverride,
  setDraftMonster,
  setOverride,
} from '@/data/monsterOverrides'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

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
  const firstId = () => Object.values(MONSTER_REGISTRY).sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? 'slime'
  const [selectedId, setSelectedId] = useState(firstId)
  const [draft, setDraft] = useState<MonsterDef>(() => clone(currentDef(firstId())!))
  const [search, setSearch] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [copiedDraft, setCopiedDraft] = useState(false)
  // The real save roster, captured ONCE before the simulator ever overwrites the
  // store scene — so "copy from save" keeps working across rebuilds. Deep-cloned,
  // so nothing the sim does can reach back to a persisted unit.
  const savedRoster = useRef<Unit[] | null>(null)
  function openSim() {
    if (!savedRoster.current) savedRoster.current = useGameStore.getState().units.map((u) => clone(u))
    setSimOpen(true)
  }
  // Bumped after any mutation to refresh override markers / the changed-count.
  const [rev, setRev] = useState(0)
  const bump = () => setRev((r) => r + 1)

  // The Monster Lab is an ART surface — always show the real paper skin (never the
  // circle debug token) in the preview AND the Battle Sim. Force it on mount,
  // restore the player's choice on the way out.
  useEffect(() => {
    const prev = useGameStore.getState().battleSkin
    useGameStore.setState({ battleSkin: 'paper' })
    return () => useGameStore.setState({ battleSkin: prev })
  }, [])

  const overrides = useMemo(() => new Set(overriddenIds()), [rev])
  const drafts = useMemo(() => new Set(draftIds()), [rev])
  const monsterList = useMemo(
    () => Object.values(MONSTER_REGISTRY)
      .map((m) => ({ id: m.id, name: m.name, draft: isDraftMonster(m.id) }))
      .sort((a, b) => Number(b.draft) - Number(a.draft) || a.name.localeCompare(b.name)),
    [rev],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? monsterList.filter((m) => m.name.toLowerCase().includes(q) || m.id.includes(q)) : monsterList
  }, [monsterList, search])

  function pick(id: string) {
    setSelectedId(id)
    setDraft(clone(currentDef(id)!))
    setCopiedDraft(false)
  }

  // Apply a mutation to the working draft, push it live, and refresh markers.
  function edit(mut: (d: MonsterDef) => void) {
    const next = clone(draft)
    mut(next)
    setDraft(next)
    if (isDraftMonster(selectedId)) setDraftMonster(next)
    else setOverride(selectedId, next)
    bump()
  }

  function reset() {
    if (isDraftMonster(selectedId)) return
    resetOverride(selectedId)
    setDraft(clone(originalDef(selectedId)!))
    bump()
  }

  function createDraft() {
    const src = currentDef(selectedId) ?? MONSTER_REGISTRY.slime
    const id = `draft-${Date.now().toString(36)}`
    const next: MonsterDef = {
      ...clone(src),
      id,
      name: 'New Monster',
      bodyShape: monsterBodyShape(src.id),
      drops: [],
    }
    setDraftMonster(next)
    setSelectedId(id)
    setDraft(clone(next))
    bump()
  }

  function deleteDraft() {
    if (!isDraftMonster(selectedId)) return
    if (!confirm(`Delete local draft "${draft.name}"?`)) return
    deleteDraftMonster(selectedId)
    const nextId = firstId()
    setSelectedId(nextId)
    setDraft(clone(currentDef(nextId)!))
    bump()
  }

  function copyDraft() {
    const text = buildDraftExport(selectedId)
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedDraft(true)
      setTimeout(() => setCopiedDraft(false), 1500)
    }, () => {})
  }

  function openInSandbox() {
    const q = new URLSearchParams(window.location.search)
    q.delete('monsterlab')
    q.set('sandbox', '1')
    q.set('monster', selectedId)
    window.location.search = q.toString()
  }

  const isDraft = drafts.has(selectedId)
  const dirty = isDraft ? [] : diffMonster(selectedId)
  const changedCount = overrides.size
  const baseline = originalDef(selectedId) ?? draft

  return (
    <div className="fixed inset-0 bg-game-bg text-game-text flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-game-border bg-game-surface/70 pl-24">
        <span className="text-sm font-semibold">🧟 Monster Lab</span>
        <span className="text-[10px] text-game-muted hidden sm:inline">live tuning · applies to the next spawn</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={openSim}
            title={`Drop ${draft.name} into a battlefield`}
            className="px-3 py-1.5 rounded-lg border border-game-green/60 bg-game-green/15 text-xs text-game-green font-medium hover:bg-game-green/25"
          >▶ Battle sim</button>
          <button
            onClick={openInSandbox}
            title="Open this monster in the Battle Sandbox"
            className="px-3 py-1.5 rounded-lg border border-game-border text-xs text-game-text-dim hover:text-game-text"
          >🧪 Sandbox</button>
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
            <button
              onClick={createDraft}
              className="mb-2 w-full px-2 py-1.5 rounded-md border border-game-primary/60 bg-game-primary/15 text-xs text-game-text font-medium hover:bg-game-primary/25"
            >+ Draft New</button>
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
                {m.draft && <span className="text-game-primary text-[9px]" title="Local draft">draft</span>}
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
            {isDraft && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-game-primary/20 text-game-primary border border-game-primary/40">
                local draft
              </span>
            )}
            {isOverridden(selectedId) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-game-gold/20 text-game-gold border border-game-gold/40">
                {dirty.length} change{dirty.length === 1 ? '' : 's'}
              </span>
            )}
            <button
              onClick={reset}
              disabled={isDraft || !isOverridden(selectedId)}
              className="ml-auto px-2.5 py-1 rounded-lg border border-game-border text-[11px] text-game-text-dim hover:text-game-text disabled:opacity-40"
            >↺ Reset this monster</button>
            {isDraft && (
              <>
                <button
                  onClick={copyDraft}
                  className="px-2.5 py-1 rounded-lg border border-game-primary/60 bg-game-primary/15 text-[11px] text-game-text font-medium hover:bg-game-primary/25"
                >{copiedDraft ? '✓ Copied' : '📋 Copy JSON'}</button>
                <button
                  onClick={deleteDraft}
                  className="px-2.5 py-1 rounded-lg border border-red-500/50 text-[11px] text-red-300 hover:bg-red-500/10"
                >Delete draft</button>
              </>
            )}
          </div>

          {/* Appearance — an interactive idle/walk/attack state machine (top) over
              a paper-only reference: token states, facing wheel, resolved descriptor
              (live from the draft — size/element/name). No circle debug token. */}
          <Section title="Appearance" hint="paper-skin body · animation states + rendered token reference">
            <div className="space-y-3">
              <MonsterAnimPreview
                monsterId={selectedId}
                bodyShape={draft.bodyShape}
                onBodyShape={(shape) => edit((d) => { d.bodyShape = shape })}
              />
              <AppearanceViewer def={draft} />
            </div>
          </Section>

          {/* Core + identity */}
          <Section title="Core">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CORE_FIELDS.map((f) => (
                <NumberField key={f.label} field={f} draft={draft} orig={baseline} onEdit={edit} />
              ))}
              <TextField label="Name" value={draft.name} base={baseline.name} onEdit={(v) => edit((d) => { d.name = v || 'Unnamed Monster' })} />
              <TextField label="Attack name" value={draft.attackName} base={baseline.attackName} onEdit={(v) => edit((d) => { d.attackName = v || 'Attack' })} />
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
                <NumberField key={f.label} field={f} draft={draft} orig={baseline} onEdit={edit} />
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
      {simOpen && <BattleSim monsterId={selectedId} savedRoster={savedRoster.current ?? []} onClose={() => setSimOpen(false)} />}
    </div>
  )
}

// Asset reference: draws the selected monster's real battlefield token through the
// production render seam (`getAppearance` → the PAPER skin — the circle debug token
// isn't wanted here), so it's exactly what ships — no reimplementation. Reflects
// the LIVE draft: name → glyph, id → body silhouette, element → rim tint, size →
// scale. The key token states, a facing wheel, and the resolved descriptor;
// complements the interactive idle/walk/attack preview above it.
const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315]
const viewerDims = (px: number) => ({ width: `${px}px`, height: `${px}px`, fontSize: `${Math.round(px * 0.4)}px` })

function AppearanceViewer({ def }: { def: MonsterDef }) {
  // getAppearance takes a Combatant; only these fields are read (verified in
  // appearance.ts), so a minimal cast is safe and routes through the real seam
  // for the element tint + size scale (those helpers are module-private).
  const a = useMemo(() => {
    const fake = {
      id: def.id, name: def.name, team: 'enemy',
      alive: true, channel: undefined,
      attackElement: 'neutral', armorElement: def.element,
    } as unknown as Combatant
    return getAppearance(fake, () => null)
  }, [def.id, def.name, def.element, def.size, def.bodyShape])

  const px = Math.round(60 * a.scale)
  const states: { label: string; alive: boolean; facingDeg: number | null; moving: boolean; selected: boolean; simple: boolean }[] = [
    { label: 'idle',     alive: true,  facingDeg: 0,    moving: false, selected: false, simple: false },
    { label: 'moving',   alive: true,  facingDeg: 0,    moving: true,  selected: false, simple: false },
    { label: 'selected', alive: true,  facingDeg: 0,    moving: false, selected: true,  simple: false },
    { label: 'far LOD',  alive: true,  facingDeg: 0,    moving: false, selected: false, simple: true },
    { label: 'KO',       alive: false, facingDeg: null, moving: false, selected: false, simple: false },
  ]

  const Body = TOKEN_SKINS.paper
  return (
    <div className="space-y-3">
      {/* Key token states (paper only) — idle/moving/selected/far-LOD/KO. */}
      <div className="rounded-lg border border-game-border bg-game-bg/60 p-3">
        <div className="text-[10px] uppercase tracking-widest text-game-muted mb-3">token states · paper</div>
        <div className="flex items-end justify-between gap-2">
          {states.map((st) => (
            <div key={st.label} className="flex flex-col items-center gap-1.5">
              <div className="flex items-end justify-center" style={{ height: `${Math.round(60 * 1.35)}px` }}>
                <Body glyph={a.glyph} tone={a.tone} bodyShape={a.bodyShape} tint={a.tint} creature dims={viewerDims(px)}
                  alive={st.alive} facingDeg={st.facingDeg} moving={st.moving} selected={st.selected} simple={st.simple} />
              </div>
              <span className="text-[9px] text-game-muted">{st.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Facing wheel — the paper skin rotates the silhouette to heading. */}
      <div className="rounded-lg border border-game-border bg-game-bg/60 p-3">
        <div className="text-[10px] uppercase tracking-widest text-game-muted mb-3">Facing · paper</div>
        <div className="flex items-center justify-between gap-1 flex-wrap">
          {FACINGS.map((deg) => (
            <div key={deg} className="flex flex-col items-center gap-1">
              <Body glyph={a.glyph} tone={a.tone} bodyShape={a.bodyShape} tint={a.tint} creature alive selected={false} facingDeg={deg} dims={viewerDims(44)} />
              <span className="text-[9px] text-game-muted tabular-nums">{deg}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* Resolved descriptor — the values the render seam derived from the draft. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-game-muted">
        <span>shape <span className="font-mono text-game-text-dim">{a.bodyShape}</span></span>
        <span>glyph <span className="font-mono text-game-text-dim">{a.glyph}</span></span>
        <span>scale <span className="font-mono text-game-text-dim">{a.scale.toFixed(2)}× <span className="text-game-muted">({def.size})</span></span></span>
        <span>rim tint <span className="font-mono text-game-text-dim">{a.tint ? def.element : 'none'}</span></span>
      </div>
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

// ── Appearance preview ───────────────────────────────────────────────────────
// The monster's paper-skin body with an idle/walk/attack state machine (shared
// BodyAnimPreview — the same CSS the battlefield uses). A body-shape override
// lets you preview ANY silhouette, not just the one this monster resolves to — so
// the walk-cycle bodies (spider/mimic) are inspectable even though no monster maps
// to them yet; it resets to the monster's shape when you switch monsters.
function MonsterAnimPreview({ monsterId, bodyShape, onBodyShape }: { monsterId: string; bodyShape?: string; onBodyShape: (shape: BodyShape | undefined) => void }) {
  const monShape = monsterBodyShape(monsterId)
  const shape = ((bodyShape && BODY_SHAPES.includes(bodyShape as BodyShape)) ? bodyShape : monShape) as BodyShape

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <BodyAnimPreview shape={shape} states={['idle', 'walk', 'attack']} />
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-game-muted">
          <span>body</span>
          <select
            value={bodyShape ?? ''}
            onChange={(e) => onBodyShape(e.target.value ? (e.target.value as BodyShape) : undefined)}
            className="px-1.5 py-1 rounded-md bg-game-bg border border-game-border text-[11px] text-game-text"
          >
            <option value="">monster ({monShape})</option>
            {BODY_SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {shape === 'beast' && !bodyShape && <span className="text-game-border">generic fallback</span>}
        </div>
        <p className="text-[10px] text-game-muted leading-snug max-w-[18rem]">
          Live paper-skin token, facing right. <b className="text-game-text-dim">Walk</b> shuffles the feet; <b className="text-game-text-dim">Attack</b> loops the jab + lunge. Bodies with no legs/feet just hold on Walk (try <code>spider</code> / <code>mimic</code>).
        </p>
      </div>
    </div>
  )
}

function TextField({ label, value, base, onEdit }: { label: string; value: string; base: string; onEdit: (v: string) => void }) {
  const changed = value !== base
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-game-muted flex items-center gap-1">
        {label}
        {changed && <span className="text-game-gold" title={`was ${base}`}>•</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onEdit(e.target.value)}
        className={['px-2 py-1.5 rounded-md bg-game-bg border border-game-border text-xs', changed ? 'text-game-gold font-medium' : 'text-game-text'].join(' ')}
      />
    </label>
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

// ── Battle Simulator ─────────────────────────────────────────────────────────
// Drops the tuned monster into a real battlefield against a hero roster you build
// (fresh class templates and/or shallow copies of the save roster), on the shared
// save-safe seeder. Full-screen BattleView + a floating control card, same shape
// as the Battle Sandbox. Owns its own paused tick loop; App gates ?monsterlab
// no-persist so none of this reaches a save.
const SIM_LOC = 'monster-lab-sim'
const HERO_TEMPLATES = INITIAL_UNITS.filter((u) => u.class)
const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }

function BattleSim({ monsterId, savedRoster, onClose }: { monsterId: string; savedRoster: Unit[]; onClose: () => void }) {
  const nextId = useRef(0)
  const reid = (u: Unit): Unit => ({ ...clone(u), id: `mlab-hero-${nextId.current++}` })
  const seedRoster = () => {
    const fromSave = savedRoster.filter((u) => u.class).slice(0, 3)
    const base = fromSave.length ? fromSave : HERO_TEMPLATES.slice(0, 3)
    return base.map(reid)
  }

  const [roster, setRoster] = useState<Unit[]>(seedRoster)
  const [comp, setComp] = useState<Record<string, number>>({ [monsterId]: 3 })
  const [mapId, setMapId] = useState('custom')
  const [customSize, setCustomSize] = useState(48)
  const [panelOpen, setPanelOpen] = useState(true)
  const [addHero, setAddHero] = useState('')
  const simMonsters = useMemo(
    () => Object.values(MONSTER_REGISTRY).slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [monsterId],
  )

  const paused = useGameStore((s) => s.paused)
  // Real open-world maps for the dropdown, captured once (before seeding injects
  // the sim loc). seedSimBattle preserves the others, so re-opens still see them.
  const realMaps = useMemo(
    () => useGameStore.getState().locations.filter((l: Location) => l.openWorld && l.id !== SIM_LOC),
    [],
  )
  const live = useGameStore((s) => {
    const b = s.battles[SIM_LOC]
    if (!b) return { heroes: 0, foes: 0, round: 0 }
    return {
      heroes: b.combatants.filter((c) => c.team === 'player' && c.alive).length,
      foes: b.combatants.filter((c) => c.team === 'enemy' && c.alive).length,
      round: b.round,
    }
  })

  const rebuild = useMemo(
    () => () => {
      const base = mapId === 'custom' ? null : realMaps.find((l) => l.id === mapId) ?? null
      seedSimBattle({
        locationId: SIM_LOC,
        roster,
        monsters: Object.entries(comp).map(([id, count]) => ({ id, count })),
        base,
        customSize,
      })
    },
    [roster, comp, mapId, customSize, realMaps],
  )

  // Own a paused tick loop (App's is disabled under ?monsterlab / noPersist).
  useEffect(() => {
    useGameStore.setState({ paused: true })
    const id = setInterval(() => {
      const s = useGameStore.getState()
      if (!s.paused) s.tick()
    }, 1000 / TICKS_PER_SECOND)
    return () => clearInterval(id)
  }, [])

  // Re-seed on any control change (and once on mount).
  useEffect(() => { rebuild() }, [rebuild])

  const close = () => { useGameStore.getState().exitBattleView(); onClose() }
  const bumpMon = (id: string, d: number) =>
    setComp((c) => {
      const n = Math.max(0, (c[id] ?? 0) + d)
      const next = { ...c }
      if (n === 0) delete next[id]
      else next[id] = n
      return next
    })

  const totalMonsters = Object.values(comp).reduce((s, n) => s + n, 0)
  const rowBtn = 'w-7 h-7 shrink-0 flex items-center justify-center rounded-md border border-game-border text-game-text hover:bg-white/10 text-sm leading-none'
  const monsterName = MONSTER_REGISTRY[monsterId]?.name ?? monsterId

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-game-bg text-game-text">
      <div className="flex-1 min-h-0 flex flex-col">
        <BattleView locationId={SIM_LOC} />
      </div>

      <div className="absolute top-2 right-2 z-[160] w-72 max-w-[85vw] max-h-[92vh] flex flex-col rounded-xl border border-game-border bg-game-surface/95 backdrop-blur shadow-2xl">
        <header className="shrink-0 flex items-center gap-2 px-3 h-10 border-b border-game-border">
          <span className="text-sm font-semibold">⚔ Battle Sim</span>
          <button onClick={() => setPanelOpen((v) => !v)} className="ml-auto text-xs text-game-text-dim hover:text-game-text">{panelOpen ? 'Hide ▲' : 'Show ▼'}</button>
          <button onClick={close} title="Back to editor" className="w-7 h-7 flex items-center justify-center rounded-md border border-game-border text-game-text-dim hover:text-game-text text-xs">✕</button>
        </header>

        {panelOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => useGameStore.getState().togglePause()}
                className={['flex-1 h-9 rounded-lg border text-sm font-medium', paused ? 'border-game-green/60 bg-game-green/15 text-game-green' : 'border-game-gold/60 bg-game-gold/15 text-game-gold'].join(' ')}
              >{paused ? '▶ Play' : '⏸ Pause'}</button>
              <button onClick={rebuild} className="h-9 px-3 rounded-lg border border-game-border text-game-text-dim hover:text-game-text text-xs" title="Re-seed the scene">↻ Rebuild</button>
            </div>
            <div className="text-[11px] text-game-text-dim tabular-nums">
              live: <span className="text-blue-300">{live.heroes} heroes</span> · <span className="text-red-300">{live.foes} foes</span> · round {live.round}
            </div>

            {/* Heroes */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-widest text-game-muted">Heroes</span>
              <div className="space-y-1">
                {roster.length === 0 && <div className="text-[11px] text-game-text-dim italic">No heroes — add some below.</div>}
                {roster.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 rounded-md bg-game-bg/60 border border-game-border px-2 py-1">
                    <span className="text-[10px] w-4 text-center shrink-0" title={u.class ?? 'Novice'}>{CLASS_ICON[u.class ?? ''] ?? '◆'}</span>
                    <span className="flex-1 truncate text-xs">{u.name}</span>
                    <span className="text-[9px] text-game-muted">Lv{u.level}</span>
                    <button onClick={() => setRoster((r) => r.filter((x) => x.id !== u.id))} className="w-6 h-6 rounded bg-game-surface border border-game-border text-red-400/80 hover:text-red-400 text-xs" title="Remove">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <select value={addHero} onChange={(e) => setAddHero(e.target.value)} className="flex-1 h-8 rounded-md border border-game-border bg-game-bg px-2 text-xs min-w-0">
                  <option value="">Add hero…</option>
                  <optgroup label="Class templates">
                    {HERO_TEMPLATES.map((u) => <option key={`t:${u.id}`} value={`t:${u.id}`}>{u.class} · {u.name}</option>)}
                  </optgroup>
                  {savedRoster.length > 0 && (
                    <optgroup label="Copy from save">
                      {savedRoster.map((u) => <option key={`s:${u.id}`} value={`s:${u.id}`}>{u.name} (Lv{u.level} {u.class ?? 'Novice'})</option>)}
                    </optgroup>
                  )}
                </select>
                <button
                  className={rowBtn}
                  title="Add hero"
                  onClick={() => {
                    if (!addHero) return
                    const [kind, id] = [addHero[0], addHero.slice(2)]
                    const src = (kind === 's' ? savedRoster : HERO_TEMPLATES).find((u) => u.id === id)
                    if (src) setRoster((r) => [...r, reid(src)])
                    setAddHero('')
                  }}
                >＋</button>
              </div>
            </div>

            {/* Map */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-widest text-game-muted">Map</span>
              <select value={mapId} onChange={(e) => setMapId(e.target.value)} className="w-full h-8 rounded-md border border-game-border bg-game-bg px-2 text-xs">
                <option value="custom">Custom square</option>
                {realMaps.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.openWorldSize ?? 50}²)</option>)}
              </select>
              {mapId === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="range" min={20} max={120} step={2} value={customSize} onChange={(e) => setCustomSize(Number(e.target.value))} className="flex-1" />
                  <span className="w-12 text-right text-xs tabular-nums text-game-text-dim">{customSize}²</span>
                </div>
              )}
            </div>

            {/* Monsters */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-game-muted flex-1">Monsters</span>
                <span className="text-[10px] text-game-text-dim tabular-nums">{totalMonsters} total</span>
              </div>
              <div className="text-[10px] text-game-gold">featured: {monsterName}</div>
              <div className="flex items-center gap-1.5">
                <select value="" onChange={(e) => { if (e.target.value) bumpMon(e.target.value, 1) }} className="flex-1 h-8 rounded-md border border-game-border bg-game-bg px-2 text-xs min-w-0">
                  <option value="">Add monster…</option>
                  {simMonsters.map((m) => <option key={m.id} value={m.id}>Lv{m.level} · {m.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                {Object.entries(comp).map(([id, n]) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className={['flex-1 truncate text-xs', id === monsterId ? 'text-game-gold' : ''].join(' ')}>{MONSTER_REGISTRY[id]?.name ?? id}</span>
                    <button className={rowBtn} onClick={() => bumpMon(id, -10)}>−10</button>
                    <button className={rowBtn} onClick={() => bumpMon(id, -1)}>−1</button>
                    <span className="w-8 text-center tabular-nums text-xs">{n}</span>
                    <button className={rowBtn} onClick={() => bumpMon(id, 1)}>+1</button>
                    <button className={rowBtn} onClick={() => bumpMon(id, 10)}>+10</button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-game-text-dim leading-snug border-t border-game-border/40 pt-2">
              Uses the monster's LIVE tuned stats. Composing rebuilds the scene (positions reset) — set it up paused, then ▶ Play. Shallow copies only; never touches your save.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
