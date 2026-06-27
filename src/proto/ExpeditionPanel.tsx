import { useEffect, useRef, useMemo } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import type { Location, Unit } from '@/types'
import {
  LOADOUTS, POSTURES, LOOT_FOCUS, RETURN_RULES, LOADOUT_BASE_FILL,
  DEFAULT_CHOICES, locationProfile, isHuntable, type Choice,
} from './expedition'
import { useExpeditionStore } from './expeditionStore'
import { ReturnReport } from './ReturnReport'

const chip = (active: boolean) =>
  `text-[10px] px-2 py-0.5 rounded border transition-colors ${active
    ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
    : 'border-game-border text-game-text-dim hover:text-game-text'}`

function Seg<T extends string>({ label, options, value, onChange }: {
  label: string; options: Choice<T>[]; value: T; onChange: (v: T) => void
}) {
  const hint = options.find((o) => o.id === value)?.hint
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim">{label}</div>
      <div className="flex gap-1 flex-wrap">
        {options.map((o) => <button key={o.id} onClick={() => onChange(o.id)} className={chip(value === o.id)}>{o.label}</button>)}
      </div>
      <div className="text-[10px] text-game-muted leading-snug">{hint}</div>
    </div>
  )
}

function Meter({ base, capacity }: { base: number; capacity: number }) {
  const pct = Math.round(capacity * 100)
  const loot = Math.max(0, capacity - base)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Capacity</span>
        <span className={`text-xs font-mono tabular-nums ${capacity >= 1 ? 'text-red-400' : 'text-game-text'}`}>{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-game-border overflow-hidden flex">
        <div className="h-full bg-game-muted/50" style={{ width: `${base * 100}%` }} title="supplies · tools · quest gear" />
        <div className={`h-full ${capacity >= 1 ? 'bg-red-500' : 'bg-game-green'}`} style={{ width: `${loot * 100}%` }} title="loot" />
      </div>
      <div className="flex items-center gap-3 mt-1 text-[9px] text-game-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-game-muted/50" /> supplies/tools/quest</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-game-green" /> loot</span>
      </div>
    </div>
  )
}

export function ExpeditionPanel({ location, heroes }: { location: Location; heroes: Unit[] }) {
  const profile = useMemo(() => locationProfile(location), [location])
  const ticks = useGameStore((s) => s.ticks)
  const exp = useExpeditionStore((s) => s.expeditions[location.id])
  const report = useExpeditionStore((s) => s.report)
  const ensure = useExpeditionStore((s) => s.ensure)
  const setChoice = useExpeditionStore((s) => s.setChoice)
  const advance = useExpeditionStore((s) => s.advance)
  const returnNow = useExpeditionStore((s) => s.returnNow)
  const dismissReport = useExpeditionStore((s) => s.dismissReport)

  const party = heroes.length
  const lastTicks = useRef(ticks)

  useEffect(() => { if (isHuntable(location)) ensure(location.id) }, [location.id, ensure])

  // Drive the run off the real game tick (so it shares the pause/cadence). Each
  // tick advances the meter by the elapsed seconds; a fired Return Rule sends the
  // party home and produces the report.
  useEffect(() => {
    const dt = Math.min(2, Math.max(0, (ticks - lastTicks.current) / TICKS_PER_SECOND))
    lastTicks.current = ticks
    if (dt <= 0 || party <= 0 || !isHuntable(location)) return
    const trigger = advance(location.id, dt, profile)
    if (trigger) returnNow(location.id, trigger, profile, party, location.name)
  }, [ticks, party, location, profile, advance, returnNow])

  if (!isHuntable(location)) return null

  const view = exp ?? { ...DEFAULT_CHOICES, capacity: LOADOUT_BASE_FILL[DEFAULT_CHOICES.loadout], supplies: 1, danger: 0, elapsed: 0 }
  const base = LOADOUT_BASE_FILL[view.loadout]

  return (
    <div className="rounded-lg border border-game-border bg-game-bg/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Expedition</span>
        <span className="text-[10px] text-game-muted">
          {party === 0 ? 'no party — station heroes to begin' : `${party} hero${party === 1 ? '' : 'es'} hunting`}
        </span>
      </div>

      <Meter base={base} capacity={view.capacity} />

      {/* supplies + danger */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Supplies</span>
            <span className="text-[10px] font-mono text-game-text tabular-nums">{Math.round(view.supplies * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-game-border overflow-hidden">
            <div className={`h-full ${view.supplies < 0.2 ? 'bg-red-500' : 'bg-game-gold'}`} style={{ width: `${view.supplies * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Danger</span>
            <span className={`text-[10px] font-mono tabular-nums ${view.danger >= 0.7 ? 'text-red-400' : 'text-game-text-dim'}`}>{Math.round(view.danger * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-game-border overflow-hidden">
            <div className={`h-full ${view.danger >= 0.7 ? 'bg-red-500' : 'bg-game-secondary'}`} style={{ width: `${view.danger * 100}%` }} />
          </div>
        </div>
      </div>

      {/* what this area yields */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Yields</span>
        {profile.signatures.map((c) => (
          <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full border border-game-border text-game-text-dim">{c}</span>
        ))}
      </div>

      {/* the four composable choices */}
      <div className="space-y-2.5 pt-1 border-t border-game-border/60">
        <Seg label="Loadout"       options={LOADOUTS}     value={view.loadout}    onChange={(v) => setChoice(location.id, 'loadout', v)} />
        <Seg label="Supply Posture" options={POSTURES}    value={view.posture}    onChange={(v) => setChoice(location.id, 'posture', v)} />
        <Seg label="Loot Focus"    options={LOOT_FOCUS}   value={view.lootFocus}  onChange={(v) => setChoice(location.id, 'lootFocus', v)} />
        <Seg label="Return Rule"   options={RETURN_RULES} value={view.returnRule} onChange={(v) => setChoice(location.id, 'returnRule', v)} />
      </div>

      {party > 0 && (
        <button
          onClick={() => returnNow(location.id, 'manual', profile, party, location.name)}
          className="w-full py-1.5 rounded-lg border border-game-border text-[12px] text-game-text-dim hover:text-game-text hover:bg-white/5">
          ⌂ Return to town now
        </button>
      )}

      {report && report.locationId === location.id && (
        <ReturnReport report={report} locationName={location.name} onClose={dismissReport} />
      )}
    </div>
  )
}
