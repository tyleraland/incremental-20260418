import { useEffect } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import type { Unit } from '@/types'
import {
  LOADOUTS, POSTURES, LOOT_FOCUS, RETURN_RULES, RETURN_MODES,
  locationProfile, isHuntable, type Choice,
} from './expedition'
import { useExpeditionStore } from './expeditionStore'
import { useProtoStore } from './protoStore'
import { packCount, CARRY_CAPACITY } from './economy'

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

function Bar({ label, pct, tone }: { label: string; pct: number; tone: 'loot' | 'supply' }) {
  const full = pct >= 100
  const color = tone === 'loot' ? (full ? 'bg-red-500' : 'bg-game-green') : (pct <= 20 ? 'bg-red-500' : 'bg-game-gold')
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">{label}</span>
        <span className={`text-[10px] font-mono tabular-nums ${full && tone === 'loot' ? 'text-red-400' : 'text-game-text'}`}>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-game-border overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

export function ExpeditionPanel({ unit }: { unit: Unit }) {
  const units = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const packs = useProtoStore((s) => s.packs)
  const heroes = useExpeditionStore((s) => s.heroes)
  const returnMode = useExpeditionStore((s) => s.returnMode)
  const ensure = useExpeditionStore((s) => s.ensure)
  const setChoice = useExpeditionStore((s) => s.setChoice)
  const setReturnMode = useExpeditionStore((s) => s.setReturnMode)
  const applyToParty = useExpeditionStore((s) => s.applyToParty)

  useEffect(() => { ensure(unit.id) }, [unit.id, ensure])

  const he = heroes[unit.id]
  const loc = unit.locationId ? locations.find((l) => l.id === unit.locationId) : null
  const huntable = !!loc && isHuntable(loc)
  const party = huntable ? units.filter((u) => u.locationId === loc!.id) : [unit]

  const capOf = (id: string) => (packCount(packs[id]) / CARRY_CAPACITY) * 100
  const supOf = (id: string) => (heroes[id]?.supplies ?? 1) * 100
  const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0)

  const status = he?.status ?? 'hunting'

  return (
    <div className="space-y-4">
      {/* Where things stand */}
      {!unit.locationId ? (
        <div className="text-[11px] text-game-muted italic">Not deployed. Configure below, then send this hero to a hunting ground.</div>
      ) : !huntable ? (
        <div className="text-[11px] text-game-muted italic">In town. Deploy to a hunting ground to run an expedition.</div>
      ) : (
        <>
          {/* Party summary */}
          <div className="rounded-lg border border-game-border bg-game-bg/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Party</span>
              <span className="text-[10px] text-game-muted">{party.length} hero{party.length === 1 ? '' : 'es'} at {loc!.name}</span>
            </div>
            <Bar label="Capacity" pct={avg(party.map((u) => capOf(u.id)))} tone="loot" />
            <Bar label="Supplies" pct={avg(party.map((u) => supOf(u.id)))} tone="supply" />
          </div>

          {/* Selected hero */}
          <div className="rounded-lg border border-game-border bg-game-bg/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-game-text">{unit.name.split(' ')[0]}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${status === 'returning' ? 'border-game-gold/50 text-game-gold' : 'border-game-green/50 text-game-green'}`}>
                {status === 'returning' ? 'heading to town' : 'hunting'}
              </span>
            </div>
            <Bar label="Capacity" pct={capOf(unit.id)} tone="loot" />
            <Bar label="Supplies" pct={supOf(unit.id)} tone="supply" />
            <div className="text-[10px] text-game-muted">Loot collects in <span className="text-game-text-dim">Field Loot</span> (Equipment tab) — inspect what they're carrying there.</div>
          </div>

          {/* What this area yields */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Yields</span>
            {locationProfile(loc!).signatures.map((c) => (
              <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full border border-game-border text-game-text-dim">{c}</span>
            ))}
          </div>
        </>
      )}

      {/* Per-hero configuration */}
      <div className="space-y-2.5 pt-1 border-t border-game-border/60">
        <Seg label="Loadout"        options={LOADOUTS}     value={he?.loadout ?? 'standard'}   onChange={(v) => setChoice(unit.id, 'loadout', v)} />
        <Seg label="Supply Posture" options={POSTURES}     value={he?.posture ?? 'normal'}     onChange={(v) => setChoice(unit.id, 'posture', v)} />
        <Seg label="Loot Focus"     options={LOOT_FOCUS}   value={he?.lootFocus ?? 'everything'} onChange={(v) => setChoice(unit.id, 'lootFocus', v)} />
        <Seg label="Return When"    options={RETURN_RULES} value={he?.returnRule ?? 'either'}   onChange={(v) => setChoice(unit.id, 'returnRule', v)} />
      </div>

      {/* Party-level: return individually or together; copy this hero's plan */}
      <div className="space-y-2.5 pt-1 border-t border-game-border/60">
        <Seg label="Return Mode" options={RETURN_MODES} value={returnMode} onChange={(v) => setReturnMode(v)} />
        {huntable && party.length > 1 && (
          <button
            onClick={() => applyToParty(unit.id, party.filter((u) => u.id !== unit.id).map((u) => u.id))}
            className="w-full py-1.5 rounded-lg border border-game-border text-[11px] text-game-text-dim hover:text-game-text hover:bg-white/5">
            Apply {unit.name.split(' ')[0]}'s plan to the whole party
          </button>
        )}
      </div>
    </div>
  )
}
