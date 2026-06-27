import { useEffect } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import type { Unit } from '@/types'
import {
  RETURN_CONDITIONS, RETURN_MODES, ALL_LOOT_CATEGORIES, SUPPLY_OPTIONS,
  locationProfile, isHuntable, loadoutWeight, loadoutCost, supplyPool, type Choice,
} from './expedition'
import { useExpeditionStore } from './expeditionStore'
import { useProtoStore } from './protoStore'
import { packCount, CARRY_CAPACITY } from './economy'

// A compact capacity/supplies readout — no big bars (a thin sliver + the number).
function Mini({ label, pct, tone, na }: { label: string; pct: number; tone: 'loot' | 'supply'; na?: boolean }) {
  const full = pct >= 100
  const color = tone === 'loot' ? (full ? 'bg-red-500' : 'bg-game-green') : (pct <= 20 ? 'bg-red-500' : 'bg-game-gold')
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] text-game-text-dim">{label}</span>
      {na ? <span className="text-[10px] text-game-muted">—</span> : (
        <>
          <span className="inline-block w-10 h-1 rounded-full bg-game-border overflow-hidden align-middle">
            <span className={`block h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </span>
          <span className="text-[10px] font-mono tabular-nums text-game-text">{Math.round(pct)}%</span>
        </>
      )}
    </span>
  )
}

const toggleChip = (on: boolean) =>
  `text-[10px] px-1.5 py-0.5 rounded border transition-colors ${on
    ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
    : 'border-game-border text-game-muted hover:text-game-text'}`

function Seg<T extends string>({ label, options, value, onChange }: {
  label: string; options: Choice<T>[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim">{label}</div>
      <div className="flex gap-1 flex-wrap">
        {options.map((o) => (
          <button key={o.id} title={o.hint} onClick={() => onChange(o.id)}
            className={`text-[10px] px-2 py-0.5 rounded border ${value === o.id ? 'border-game-primary/60 bg-game-primary/15 text-game-text' : 'border-game-border text-game-text-dim hover:text-game-text'}`}>{o.label}</button>
        ))}
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
  const setSupplyQty = useExpeditionStore((s) => s.setSupplyQty)
  const toggleLootCat = useExpeditionStore((s) => s.toggleLootCat)
  const toggleReturnOn = useExpeditionStore((s) => s.toggleReturnOn)
  const setReturnMode = useExpeditionStore((s) => s.setReturnMode)
  const applyToParty = useExpeditionStore((s) => s.applyToParty)

  useEffect(() => { ensure(unit.id) }, [unit.id, ensure])

  const he = heroes[unit.id] ?? { loadout: {}, lootCats: [...ALL_LOOT_CATEGORIES], returnOn: ['pack-full' as const], suppliesLeft: 1, status: 'hunting' as const, locationId: null }
  const loc = unit.locationId ? locations.find((l) => l.id === unit.locationId) : null
  const huntable = !!loc && isHuntable(loc)
  const party = huntable ? units.filter((u) => u.locationId === loc!.id) : []

  const capOf = (id: string) => (packCount(packs[id]) / CARRY_CAPACITY) * 100
  const supOf = (id: string) => (heroes[id]?.suppliesLeft ?? 1) * 100
  const hasSup = (id: string) => supplyPool(heroes[id]?.loadout ?? {}) > 0
  const statusOf = (id: string) => heroes[id]?.status ?? 'hunting'
  const firstName = (u: Unit) => u.name.split(' ')[0]
  const weight = loadoutWeight(he.loadout)
  const cost = loadoutCost(he.loadout)

  return (
    <div className="space-y-4">
      {/* Party status — who's out, who's heading home (the tuning signal) */}
      {!unit.locationId ? (
        <div className="text-[11px] text-game-muted italic">Not deployed. Plan below, then send this hero to a hunting ground.</div>
      ) : !huntable ? (
        <div className="text-[11px] text-game-muted italic">In town. Deploy to a hunting ground to begin.</div>
      ) : (
        <div className="rounded-lg border border-game-border bg-game-bg/60 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Party</span>
            <span className="text-[10px] text-game-muted">{party.length} at {loc!.name}</span>
          </div>
          {party.map((u) => (
            <div key={u.id} className={`flex items-center gap-2 ${u.id === unit.id ? '' : 'opacity-80'}`}>
              <span className="text-[11px] text-game-text w-16 truncate">{firstName(u)}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${statusOf(u.id) === 'returning' ? 'border-game-gold/50 text-game-gold' : 'border-game-green/50 text-game-green'}`}>
                {statusOf(u.id) === 'returning' ? '⌂ heading to town' : 'hunting'}
              </span>
              <span className="ml-auto flex items-center gap-2.5">
                <Mini label="cap" pct={capOf(u.id)} tone="loot" />
                <Mini label="sup" pct={supOf(u.id)} tone="supply" na={!hasSup(u.id)} />
              </span>
            </div>
          ))}
          <div className="text-[10px] text-game-muted pt-0.5">Loot collects in <span className="text-game-text-dim">Field Loot</span> (Equipment tab) — inspect what they carry there.</div>
        </div>
      )}

      {/* Supplies loadout — what this hero actually carries */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Supplies Loadout</span>
          <span className="text-[10px] text-game-muted tabular-nums">weight {weight} · {cost}g</span>
        </div>
        {SUPPLY_OPTIONS.map((o) => {
          const qty = he.loadout[o.id] ?? 0
          const on = qty > 0
          return (
            <div key={o.id} className="flex items-center gap-2">
              <button onClick={() => setSupplyQty(unit.id, o.id, on ? 0 : 5)} className={toggleChip(on)}>
                {on ? '✓' : '○'} {o.icon} {o.name}
              </button>
              {on && (
                <span className="ml-auto flex items-center gap-1">
                  <button onClick={() => setSupplyQty(unit.id, o.id, qty - 1)} className="w-6 h-6 rounded border border-game-border text-game-text hover:bg-game-border/50">−</button>
                  <span className="w-7 text-center text-[11px] font-mono tabular-nums text-game-text">{qty}</span>
                  <button onClick={() => setSupplyQty(unit.id, o.id, qty + 1)} className="w-6 h-6 rounded border border-game-border text-game-text hover:bg-game-border/50">+</button>
                </span>
              )}
            </div>
          )
        })}
        <div className="text-[10px] text-game-muted">Carry more to last longer in the field — but it adds weight and cost. Nothing? They run light, with no supplies to spend.</div>
      </div>

      {/* Loot focus — categories to keep (checkboxes) */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Keep Loot</div>
        <div className="flex gap-1 flex-wrap">
          {ALL_LOOT_CATEGORIES.map((c) => {
            const on = he.lootCats.includes(c)
            const sig = huntable && locationProfile(loc!).signatures.includes(c)
            return (
              <button key={c} onClick={() => toggleLootCat(unit.id, c)} className={toggleChip(on)} title={sig ? 'This area yields this' : undefined}>
                {on ? '✓ ' : ''}{c}{sig ? ' ★' : ''}
              </button>
            )
          })}
        </div>
        <div className="text-[10px] text-game-muted">★ = this area's signature drops. Unchecked categories are left on the ground.</div>
      </div>

      {/* Return when — conditions (checkboxes) */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Return When</div>
        <div className="flex gap-1 flex-wrap">
          {RETURN_CONDITIONS.map((c) => {
            const on = he.returnOn.includes(c.id)
            return <button key={c.id} onClick={() => toggleReturnOn(unit.id, c.id)} className={toggleChip(on)} title={c.hint}>{on ? '✓ ' : ''}{c.label}</button>
          })}
        </div>
      </div>

      {/* Party-level: solo vs together; copy this hero's plan */}
      <div className="space-y-2.5 pt-1 border-t border-game-border/60">
        <Seg label="Return Mode" options={RETURN_MODES} value={returnMode} onChange={(v) => setReturnMode(v)} />
        {huntable && party.length > 1 && (
          <button
            onClick={() => applyToParty(unit.id, party.filter((u) => u.id !== unit.id).map((u) => u.id))}
            className="w-full py-1.5 rounded-lg border border-game-border text-[11px] text-game-text-dim hover:text-game-text hover:bg-white/5">
            Apply {firstName(unit)}'s plan to the whole party
          </button>
        )}
      </div>
    </div>
  )
}
