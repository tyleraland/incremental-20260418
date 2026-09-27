import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import {
  buildQuestBoard, CLASS_CHANGE_QUESTS, LOCATION_BOUNTIES,
  type QuestBoardEntry, type BoardStatus, type BountyDef,
} from './protoStore'
import { ClassQuestRow, BountyRow } from './LocationDetail'

// ── Quest Journal ─────────────────────────────────────────────────────────────
//
// The top-bar quest board: one roll-up of every quest (class-change paths +
// location bounties) across the world. Filter by status / scope / location,
// optionally grouped by location, with a "Go to location" jump that focuses the
// map on the quest's site and opens its Location lens.

const STATUS_META: Record<BoardStatus, { label: string; glyph: string; chip: string; icon: string }> = {
  ready:         { label: 'Ready',       glyph: '?', chip: 'border-game-gold/70 text-game-gold bg-game-gold/10',       icon: 'border-game-gold/70 text-game-gold' },
  'in-progress': { label: 'In progress', glyph: '?', chip: 'border-game-border text-game-text-dim bg-white/[0.03]',     icon: 'border-game-border text-game-text-dim' },
  available:     { label: 'Available',   glyph: '!', chip: 'border-game-primary/50 text-game-primary bg-game-primary/10', icon: 'border-game-primary/50 text-game-primary' },
  'not-yet':     { label: 'Upcoming',    glyph: '…', chip: 'border-game-border text-game-muted bg-white/[0.02]',         icon: 'border-game-border text-game-muted' },
  completed:     { label: 'Completed',   glyph: '✓', chip: 'border-game-green/50 text-game-green bg-game-green/5',       icon: 'border-game-green/50 text-game-green' },
}
// Display order (most actionable first).
const STATUS_ORDER: BoardStatus[] = ['ready', 'in-progress', 'available', 'not-yet', 'completed']
type ScopeFilter = 'all' | 'hero' | 'global'

// Shared board derivation — used by both the journal and the nav-button badge.
export function useQuestBoard(): QuestBoardEntry[] {
  const units           = useGameStore((s) => s.units)
  const unitStats       = useGameStore((s) => s.unitStats)
  const monsterDefeated = useGameStore((s) => s.monsterDefeated)
  const questItems      = useGameStore((s) => s.questItems)
  const miscItems       = useGameStore((s) => s.miscItems)
  const locations       = useGameStore((s) => s.locations)
  const classCommit     = useGameStore((s) => s.classQuestCommit)
  const bountyDone      = useGameStore((s) => s.bountyDone)
  const bountyClaimed    = useGameStore((s) => s.bountyClaimed)
  const completions      = useGameStore((s) => s.questCompletions)
  return useMemo(() => buildQuestBoard({
    classCommit, bountyDone, bountyClaimed, completions, units,
    view: { unitStats, monsterDefeated, questItems, miscItems },
    locationName: (id) => locations.find((l) => l.id === id)?.name ?? id,
  }), [classCommit, bountyDone, bountyClaimed, completions, units, unitStats, monsterDefeated, questItems, miscItems, locations])
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={['shrink-0 text-[11px] px-2 py-1 rounded-full border transition-colors',
        active ? 'border-game-primary bg-game-primary/15 text-game-text' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}
    >{children}</button>
  )
}

// An upcoming bounty whose prerequisites aren't met yet — read-only preview (the
// interactive BountyRow would wrongly offer a claim). Shows what unlocks it.
function LockedQuestPreview({ e, def }: { e: QuestBoardEntry; def: BountyDef }) {
  const prereqNames = (def.requires ?? [])
    .map((id) => LOCATION_BOUNTIES.find((b) => b.id === id)?.title ?? id)
  return (
    <div className="rounded-md border border-game-border bg-white/[0.02] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full border border-game-border text-game-muted flex items-center justify-center text-[11px] font-bold leading-none shrink-0">…</span>
        <span className="text-xs text-game-muted flex-1 truncate">{def.title}</span>
        <span className="text-[9px] text-game-muted shrink-0 uppercase tracking-wider">locked</span>
      </div>
      <div className="text-[10px] text-game-muted truncate pl-7 mt-0.5">
        {e.objectiveLabel}{e.rewardText ? <span className="text-game-gold/70"> · {e.rewardText}</span> : null}
      </div>
      {prereqNames.length > 0 && (
        <div className="text-[10px] text-game-muted italic pl-7 mt-0.5">Unlocks after: {prereqNames.join(', ')}</div>
      )}
    </div>
  )
}

// One journal entry → the *real* interactive row for its quest (class-change path
// or location bounty), so commit / progress / redeem all happen right here. The
// only exception is an upcoming (locked) bounty, which gets a read-only preview.
function JournalEntry({ e, onGoto }: { e: QuestBoardEntry; onGoto: (e: QuestBoardEntry) => void }) {
  if (e.kind === 'class') {
    const def = CLASS_CHANGE_QUESTS.find((q) => q.id === e.id)
    if (!def) return null
    return <ClassQuestRow q={def} onGoto={() => onGoto(e)} />
  }
  const def = LOCATION_BOUNTIES.find((b) => b.id === e.id)
  if (!def) return null
  if (e.status === 'not-yet') return <LockedQuestPreview e={e} def={def} />
  return <BountyRow def={def} onGoto={() => onGoto(e)} />
}

export function QuestJournal({ onClose, onGoto }: { onClose: () => void; onGoto: (e: QuestBoardEntry) => void }) {
  const board = useQuestBoard()
  const [status, setStatus] = useState<BoardStatus | 'all'>('all')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [grouped, setGrouped] = useState(true)
  const [locFilter, setLocFilter] = useState<string>('all')

  const counts = useMemo(() => {
    const c: Partial<Record<BoardStatus, number>> = {}
    for (const e of board) c[e.status] = (c[e.status] ?? 0) + 1
    return c
  }, [board])

  const locOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of board) if (!seen.has(e.locationId)) seen.set(e.locationId, e.locationName)
    return [...seen.entries()]
  }, [board])

  const filtered = board
    .filter((e) => (status === 'all' || e.status === status) && (scope === 'all' || e.scope === scope) && (locFilter === 'all' || e.locationId === locFilter))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.title.localeCompare(b.title))

  // Group by location (preserving the actionable-first ordering within a group).
  const groups = useMemo(() => {
    if (!grouped) return [{ id: '', name: '', entries: filtered }]
    const m = new Map<string, QuestBoardEntry[]>()
    for (const e of filtered) { const a = m.get(e.locationId); if (a) a.push(e); else m.set(e.locationId, [e]) }
    return [...m.entries()].map(([id, entries]) => ({ id, name: entries[0].locationName, entries }))
  }, [filtered, grouped])

  return createPortal(
    <div data-testid="quest-journal" className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">📜 Quests</span>
        <span className="text-[11px] text-game-text-dim">{board.length} total · {counts.ready ?? 0} ready</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-sm">✕</button>
      </header>

      {/* filters */}
      <div className="shrink-0 border-b border-game-border bg-game-surface/40 px-2 py-1.5 space-y-1.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>All ({board.length})</FilterChip>
          {STATUS_ORDER.map((s) => (counts[s] ? <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_META[s].label} ({counts[s]})</FilterChip> : null))}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <span className="text-[10px] uppercase tracking-wider text-game-muted shrink-0 mr-0.5">Who</span>
          <FilterChip active={scope === 'all'} onClick={() => setScope('all')}>Everyone</FilterChip>
          <FilterChip active={scope === 'hero'} onClick={() => setScope('hero')}>◈ Hero</FilterChip>
          <FilterChip active={scope === 'global'} onClick={() => setScope('global')}>⌂ Guild</FilterChip>
          <span className="w-px h-4 bg-game-border mx-0.5 shrink-0" />
          <FilterChip active={grouped} onClick={() => setGrouped((v) => !v)}>{grouped ? '▾ Grouped' : '▸ Flat'}</FilterChip>
          <select
            value={locFilter}
            onChange={(ev) => setLocFilter(ev.target.value)}
            className="shrink-0 text-[11px] px-1.5 py-1 rounded-full border border-game-border bg-game-bg text-game-text-dim"
          >
            <option value="all">All locations</option>
            {locOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-2 max-w-2xl w-full mx-auto" style={{ zoom: 1.15 }}>
          {filtered.length === 0 && <div className="text-center text-[11px] text-game-muted py-8">No quests match these filters.</div>}
          {groups.map((g) => (
            <div key={g.id || 'flat'} className="space-y-1">
              {grouped && (
                <div className="text-[10px] uppercase tracking-widest text-game-text-dim px-1 pt-1">{g.name} <span className="text-game-muted normal-case tracking-normal">({g.entries.length})</span></div>
              )}
              {g.entries.map((e) => <JournalEntry key={e.id} e={e} onGoto={onGoto} />)}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
