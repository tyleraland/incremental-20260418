import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useGameStore, getInitials, TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS, type Unit,
} from '@/stores/useGameStore'
import { useProtoStore } from './protoStore'

// ── Army Matrix ────────────────────────────────────────────────────────────--
//
// The squad command surface that sits next to the battlefield. A channel × hero
// grid of the party's combat doctrine: every cell is tappable to assign tactics,
// Optimize proposes class-fit loadouts (ghosted) and Assign commits them, and
// each hero column can be Locked so a bulk Optimize/Assign won't overwrite a
// hand-tuned hero. The matrix the player reads top-down to compare the whole
// army at once, and edits in place without leaving the fight.

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const CHANNELS: { id: string; label: string }[] = [
  { id: 'movement', label: 'Move' }, { id: 'targeting', label: 'Target' },
  { id: 'action', label: 'Action' }, { id: 'reaction', label: 'React' }, { id: 'passive', label: 'Passive' },
]

// Mock "best fit" doctrine per class — Optimize proposes these (skipping any a
// hero already runs, trimmed to the free slots). equipTactic validates for real.
const CLASS_RECS: Record<string, string[]> = {
  Fighter: ['charger', 'tank-buster', 'opportunist'],
  Ranger:  ['kiter', 'focus-casters', 'opportunist'],
  Mage:    ['kiter', 'storm-caller', 'wary-caster'],
  Cleric:  ['retreater', 'focus-casters'],
  Rogue:   ['flanker', 'assassinate', 'opportunist'],
  Novice:  ['charger', 'opportunist'],
}

export function ArmyMatrix({ squad, locationName }: { squad: Unit[]; locationName: string }) {
  const partyTactics  = useGameStore((s) => s.partyTactics)
  const equipTactic   = useGameStore((s) => s.equipTactic)
  const unequipTactic = useGameStore((s) => s.unequipTactic)
  const heroLocks     = useProtoStore((s) => s.heroLocks)
  const toggleLock    = useProtoStore((s) => s.toggleLock)
  const proposals     = useProtoStore((s) => s.proposals)
  const setProposals  = useProtoStore((s) => s.setProposals)
  const clearProposals = useProtoStore((s) => s.clearProposals)

  const [picker, setPicker] = useState<{ unit: Unit; channel: string } | null>(null)

  const hasProposals = Object.values(proposals).some((a) => a.length > 0)

  function optimize() {
    const next: Record<string, string[]> = {}
    for (const u of squad) {
      if (heroLocks.includes(u.id)) continue
      const recs = CLASS_RECS[u.class ?? 'Novice'] ?? CLASS_RECS.Novice
      const equipped = new Set(u.tactics.map((t) => t.id))
      const free = MAX_UNIT_TACTICS - u.tactics.length
      const add = recs
        .filter((id) => TACTIC_REGISTRY[id] && !equipped.has(id))
        .slice(0, Math.max(0, free))
      if (add.length) next[u.id] = add
    }
    setProposals(next)
  }
  function assign() {
    for (const u of squad) {
      if (heroLocks.includes(u.id)) continue
      for (const id of proposals[u.id] ?? []) equipTactic(u.id, id)
    }
    clearProposals()
  }

  return (
    <div className="space-y-3">
      {/* command bar */}
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Army doctrine</div>
          <div className="text-xs text-game-text font-medium truncate">{locationName}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={optimize} className="text-[11px] px-2.5 py-1 rounded-lg border border-game-accent/50 text-game-accent hover:bg-game-accent/10">⚡ Optimize</button>
          <button
            onClick={assign}
            disabled={!hasProposals}
            className={['text-[11px] px-2.5 py-1 rounded-lg border', hasProposals
              ? 'border-game-primary/60 bg-game-primary/15 text-game-text hover:bg-game-primary/25'
              : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
          >✓ Assign</button>
          {hasProposals && <button onClick={clearProposals} title="Discard proposals" className="text-[11px] px-1.5 py-1 rounded-lg border border-game-border text-game-text-dim hover:text-game-text">✕</button>}
        </div>
      </div>

      {partyTactics.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap rounded-md border border-game-secondary/30 bg-game-secondary/5 px-2 py-1.5">
          <span className="text-[9px] uppercase tracking-wider text-game-secondary">Party</span>
          {partyTactics.map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-game-secondary/15 text-game-text" title={TACTIC_REGISTRY[t.id]?.description}>{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
          ))}
        </div>
      )}

      {/* matrix */}
      <div className="overflow-x-auto -mx-3 px-3">
        <div className="min-w-max">
          {/* hero header row */}
          <div className="flex">
            <div className="w-14 shrink-0" />
            {squad.map((u) => {
              const locked = heroLocks.includes(u.id)
              return (
                <div key={u.id} className={['w-28 shrink-0 px-1.5 pb-2 border-b-2',
                  locked ? 'border-game-gold/60' : 'border-game-border'].join(' ')}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => useGameStore.setState({ selectedUnitIds: [u.id], ...(u.locationId ? { selectedLocationId: u.locationId } : {}) })} className="flex items-center gap-1 min-w-0">
                      <span className="text-sm">{u.class && CLASS_ICON[u.class] ? CLASS_ICON[u.class] : getInitials(u.name)}</span>
                      <span className="text-[11px] font-medium text-game-text truncate">{u.name.split(' ')[0]}</span>
                    </button>
                    <button
                      onClick={() => toggleLock(u.id)}
                      title={locked ? 'Locked — Optimize/Assign skips this hero' : 'Lock this hero'}
                      className={['ml-auto text-xs leading-none', locked ? 'text-game-gold' : 'text-game-muted hover:text-game-text-dim'].join(' ')}
                    >{locked ? '🔒' : '🔓'}</button>
                  </div>
                  <div className="text-[9px] text-game-text-dim truncate">{u.class ?? 'Novice'} · {u.tactics.length}/{MAX_UNIT_TACTICS}</div>
                </div>
              )
            })}
          </div>

          {/* channel rows */}
          {CHANNELS.map((ch) => (
            <div key={ch.id} className="flex border-t border-game-border/50">
              <div className="w-14 shrink-0 py-1.5 text-[9px] uppercase tracking-wider text-game-text-dim sticky left-0 bg-game-surface/40">{ch.label}</div>
              {squad.map((u) => {
                const inCh = u.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === ch.id)
                const prop = (proposals[u.id] ?? []).filter((id) => TACTIC_REGISTRY[id]?.channel === ch.id)
                const locked = heroLocks.includes(u.id)
                return (
                  <button
                    key={u.id}
                    data-cell={`${u.id}:${ch.id}`}
                    onClick={() => setPicker({ unit: u, channel: ch.id })}
                    className={['w-28 shrink-0 py-1.5 px-1 text-left space-y-0.5 border-l border-game-border/30 hover:bg-white/5 transition-colors',
                      locked ? 'bg-game-gold/5' : ''].join(' ')}
                  >
                    {inCh.length === 0 && prop.length === 0 && <span className="text-[10px] text-game-muted">＋</span>}
                    {inCh.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-1">
                        <span className="text-[8px] text-game-muted tabular-nums">{i + 1}</span>
                        <span className="text-[10px] text-game-text leading-tight">{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
                      </div>
                    ))}
                    {prop.map((id) => (
                      <div key={id} className="flex items-center gap-1 rounded border border-dashed border-game-accent/60 bg-game-accent/5 px-1">
                        <span className="text-[8px] text-game-accent">+</span>
                        <span className="text-[10px] text-game-accent leading-tight">{TACTIC_REGISTRY[id]?.name ?? id}</span>
                      </div>
                    ))}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-game-muted italic">
        Tap a cell to assign tactics · Optimize proposes class-fit doctrine (dashed) · Assign commits it · 🔒 protects a hero.
      </div>

      {picker && createPortal(
        <CellPicker
          unit={picker.unit}
          channel={picker.channel}
          onAdd={(id) => equipTactic(picker.unit.id, id)}
          onRemove={(id) => unequipTactic(picker.unit.id, id)}
          onClose={() => setPicker(null)}
        />,
        document.body,
      )}
    </div>
  )
}

// ── CellPicker (portal modal) ─────────────────────────────────────────────────
function CellPicker({ unit, channel, onAdd, onRemove, onClose }: {
  unit: Unit; channel: string
  onAdd: (id: string) => void; onRemove: (id: string) => void; onClose: () => void
}) {
  // Re-read the live unit so the list reflects adds/removes without closing.
  const live = useGameStore((s) => s.units.find((u) => u.id === unit.id)) ?? unit
  const chLabel = CHANNELS.find((c) => c.id === channel)?.label ?? channel
  const equipped = live.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === channel)
  const equippedIds = new Set(live.tactics.map((t) => t.id))
  const available = listTactics('unit').filter((d) => d.channel === channel && !equippedIds.has(d.id))
  const atCap = live.tactics.length >= MAX_UNIT_TACTICS

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full sm:max-w-sm max-h-[70vh] flex flex-col bg-game-surface border border-game-border rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-game-border flex items-center gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-game-text-dim">{chLabel} · {live.name.split(' ')[0]}</div>
            <div className="text-xs text-game-text-dim">{live.tactics.length}/{MAX_UNIT_TACTICS} tactics</div>
          </div>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {equipped.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-game-text-dim mb-1">Equipped (priority)</div>
              <div className="space-y-1">
                {equipped.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border border-game-primary/40 bg-game-primary/10 px-2 py-1.5">
                    <span className="text-[10px] text-game-muted tabular-nums">{i + 1}</span>
                    <span className="text-xs text-game-text flex-1">{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
                    <button onClick={() => onRemove(t.id)} className="text-[10px] text-red-300 hover:text-red-200">remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-game-text-dim mb-1">{atCap ? 'Slots full — remove one to add' : 'Available'}</div>
            <div className="space-y-1">
              {available.length === 0 && <div className="text-xs text-game-muted italic">No more {chLabel.toLowerCase()} tactics.</div>}
              {available.map((d) => (
                <button
                  key={d.id}
                  disabled={atCap}
                  onClick={() => onAdd(d.id)}
                  className={['w-full text-left rounded-md border px-2 py-1.5 transition-colors',
                    atCap ? 'border-game-border opacity-40 cursor-not-allowed' : 'border-game-border bg-game-bg hover:border-game-primary/50'].join(' ')}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-game-text">{d.name}</span>
                    {d.kind === 'floor' && <span className="text-[8px] px-1 rounded bg-game-border text-game-text-dim">floor</span>}
                  </div>
                  <div className="text-[10px] text-game-text-dim leading-snug">{d.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
