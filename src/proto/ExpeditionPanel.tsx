import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import type { Unit } from '@/types'
import {
  RETURN_CONDITIONS, RETURN_MODES, ALL_LOOT_CATEGORIES, SUPPLY_OPTIONS, supplyOption,
  isHuntable, isCity, nearestCity, loadoutWeight, loadoutCost, supplyPool, type Choice, type Loadout,
} from './expedition'
import { useExpeditionStore } from './expeditionStore'
import { useProtoStore } from './protoStore'
import { packCount, CARRY_CAPACITY } from './economy'

// Capacity/Supplies as the word + the % (no bar). Red at pack-full / low supplies.
function Stat({ label, pct, tone, na }: { label: string; pct: number; tone: 'loot' | 'supply'; na?: boolean }) {
  const danger = tone === 'loot' ? pct >= 100 : pct <= 20
  return (
    <span className="text-[12px] text-game-text-dim">
      {label}{' '}
      {na ? <span className="text-game-muted">—</span>
        : <span className={`font-mono tabular-nums ${danger ? 'text-red-400' : 'text-game-text'}`}>{Math.round(pct)}%</span>}
    </span>
  )
}

const toggleChip = (on: boolean) =>
  `text-[11px] px-1.5 py-0.5 rounded border transition-colors ${on
    ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
    : 'border-game-border text-game-muted hover:text-game-text'}`

function Seg<T extends string>({ label, options, value, onChange }: {
  label: string; options: Choice<T>[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-widest text-game-text-dim">{label}</div>
      <div className="flex gap-1 flex-wrap">
        {options.map((o) => (
          <button key={o.id} title={o.hint} onClick={() => onChange(o.id)}
            className={`text-[11px] px-2 py-0.5 rounded border ${value === o.id ? 'border-game-primary/60 bg-game-primary/15 text-game-text' : 'border-game-border text-game-text-dim hover:text-game-text'}`}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

const sourceLabel = (e: { storage: boolean; merchant: boolean }) =>
  e.storage && e.merchant ? 'storage or merchant' : e.storage ? 'from storage' : e.merchant ? 'buy from merchant' : 'no source'

// The add/edit menu for one supply line: pick a consumable (from stash or a town
// merchant), set the quantity, and choose the source.
function SupplyMenu({ unitId, initial, loadout, onClose }: {
  unitId: string; initial: string | null; loadout: Loadout; onClose: () => void
}) {
  const addSupply = useExpeditionStore((s) => s.addSupply)
  const setSupplyQty = useExpeditionStore((s) => s.setSupplyQty)
  const toggleSource = useExpeditionStore((s) => s.toggleSupplySource)
  const removeSupply = useExpeditionStore((s) => s.removeSupply)
  const [sel, setSel] = useState<string | null>(initial)

  const entry = sel ? loadout[sel] : undefined
  const opt = sel ? supplyOption(sel) : undefined
  const addable = SUPPLY_OPTIONS.filter((o) => !loadout[o.id])
  const step = (d: number) => sel && setSupplyQty(unitId, sel, Math.max(1, (loadout[sel]?.qty ?? 1) + d))

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-game-border bg-game-surface p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest text-game-text-dim">{sel ? 'Supply' : 'Add a supply'}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-game-border text-game-text hover:bg-game-border/50">✕</button>
        </div>

        {!sel ? (
          addable.length === 0
            ? <div className="text-[12px] text-game-muted italic py-2">Every known consumable is already in the loadout.</div>
            : <div className="space-y-1">
                {addable.map((o) => (
                  <button key={o.id} onClick={() => { addSupply(unitId, o.id); setSel(o.id) }}
                    className="w-full flex items-center gap-2 rounded-lg border border-game-border px-2.5 py-2 hover:border-game-primary/50">
                    <span className="text-lg">{o.icon}</span>
                    <span className="text-xs text-game-text flex-1 text-left">{o.name}</span>
                    <span className="text-[11px] text-game-muted">{o.cost}g</span>
                  </button>
                ))}
              </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{opt?.icon}</span>
              <span className="text-sm font-medium text-game-text flex-1">{opt?.name ?? sel}</span>
            </div>

            {/* quantity ±1/10/100 */}
            <div className="flex items-center justify-center gap-1">
              {[-100, -10, -1].map((d) => <button key={d} onClick={() => step(d)} className="px-1.5 h-8 rounded border border-game-border text-[12px] font-mono text-game-text hover:bg-game-border/50">{d}</button>)}
              <span className="w-12 text-center text-base font-mono tabular-nums text-game-text">{entry?.qty ?? 0}</span>
              {[1, 10, 100].map((d) => <button key={d} onClick={() => step(d)} className="px-1.5 h-8 rounded border border-game-border text-[12px] font-mono text-game-text hover:bg-game-border/50">+{d}</button>)}
            </div>

            {/* source: storage / merchant / either */}
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-widest text-game-text-dim">Source</div>
              <div className="flex gap-1">
                <button onClick={() => toggleSource(unitId, sel, 'storage')} className={toggleChip(!!entry?.storage)}>{entry?.storage ? '✓ ' : ''}Pull from storage</button>
                <button onClick={() => toggleSource(unitId, sel, 'merchant')} className={toggleChip(!!entry?.merchant)}>{entry?.merchant ? '✓ ' : ''}Buy from merchant</button>
              </div>
            </div>

            <button onClick={() => { removeSupply(unitId, sel); onClose() }}
              className="w-full py-1.5 rounded-lg border border-red-500/40 text-[12px] text-red-300 hover:bg-red-500/10">Remove from loadout</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function ExpeditionPanel({ unit }: { unit: Unit }) {
  const units = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const packs = useProtoStore((s) => s.packs)
  const heroes = useExpeditionStore((s) => s.heroes)
  const returnMode = useExpeditionStore((s) => s.returnMode)
  const ensure = useExpeditionStore((s) => s.ensure)
  const toggleLootCat = useExpeditionStore((s) => s.toggleLootCat)
  const toggleReturnOn = useExpeditionStore((s) => s.toggleReturnOn)
  const toggleShareFlag = useExpeditionStore((s) => s.toggleShareFlag)
  const setReturnTown = useExpeditionStore((s) => s.setReturnTown)
  const setReturnMode = useExpeditionStore((s) => s.setReturnMode)
  const applyToParty = useExpeditionStore((s) => s.applyToParty)
  const commitStep = useExpeditionStore((s) => s.commitStep)
  const runToMapEdge = useGameStore((s) => s.runToMapEdge)

  const [menu, setMenu] = useState<{ initial: string | null } | null>(null)
  const [townOpen, setTownOpen] = useState(false)

  useEffect(() => { ensure(unit.id) }, [unit.id, ensure])

  const he = heroes[unit.id] ?? { loadout: {} as Loadout, lootCats: [...ALL_LOOT_CATEGORIES], returnOn: ['pack-full' as const], shareLoot: true, acceptLoot: true, shareSupplies: false, acceptSupplies: true, suppliesLeft: 1, status: 'hunting' as const, locationId: null }
  const loc = unit.locationId ? locations.find((l) => l.id === unit.locationId) : null
  const huntable = !!loc && isHuntable(loc)
  const party = huntable ? units.filter((u) => u.locationId === loc!.id) : []

  const capCount = packCount(packs[unit.id])
  const cap = (capCount / CARRY_CAPACITY) * 100
  const sup = (he.suppliesLeft ?? 1) * 100
  const hasSup = supplyPool(he.loadout) > 0
  const firstName = (u: Unit) => u.name.split(' ')[0]
  const weight = loadoutWeight(he.loadout)
  const cost = loadoutCost(he.loadout)
  const loadoutEntries = Object.entries(he.loadout)

  const cities = locations.filter(isCity)
  const auto = nearestCity(unit.locationId, locations)
  const chosenTown = he.returnTown ? locations.find((l) => l.id === he.returnTown) : null
  const returnNow = () => {
    const ids = (returnMode === 'group' && huntable) ? party.map((u) => u.id) : [unit.id]
    for (const id of ids) { commitStep(id, { status: 'returning' }); runToMapEdge(id) }
  }

  return (
    <div className="space-y-4">
      {/* Status + meters for the scoped hero (name is in the scope bar above) */}
      <div className="rounded-lg border border-game-border bg-game-bg/60 p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          {huntable ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${he.status === 'returning' ? 'border-game-gold/50 text-game-gold' : 'border-game-green/50 text-game-green'}`}>
              {he.status === 'returning' ? '⌂ heading to town' : 'hunting'}
            </span>
          ) : (
            <span className="text-[12px] text-game-muted italic">{!unit.locationId ? 'Not deployed' : 'In town'} — plan below</span>
          )}
          {party.length > 1 && <span className="ml-auto text-[11px] text-game-muted">+{party.length - 1} more here</span>}
        </div>
        {huntable && (
          <div className="flex items-center gap-4">
            <span className="text-[12px] text-game-text-dim">
              Capacity <span className={`font-mono tabular-nums ${cap >= 100 ? 'text-red-400' : 'text-game-text'}`}>{capCount} / {CARRY_CAPACITY} ({Math.round(cap)}%)</span>
            </span>
            <Stat label="Supplies" pct={sup} tone="supply" na={!hasSup} />
            <span className="text-[11px] text-game-muted ml-auto">loot → Field Loot</span>
          </div>
        )}
      </div>

      {/* Supplies loadout — a list + add via menu */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest text-game-text-dim">Supplies Loadout</span>
          <span className="text-[11px] text-game-muted tabular-nums">weight {weight} · {cost}g</span>
        </div>
        {loadoutEntries.map(([id, e]) => {
          const o = supplyOption(id)
          return (
            <button key={id} onClick={() => setMenu({ initial: id })}
              className="w-full flex items-center gap-2 rounded-lg border border-game-border bg-game-bg/40 px-2.5 py-1.5 hover:border-game-primary/50 text-left">
              <span className="text-base">{o?.icon ?? '•'}</span>
              <span className="text-xs text-game-text">{o?.name ?? id}</span>
              <span className="text-[12px] font-mono text-game-gold tabular-nums">×{e.qty}</span>
              <span className="ml-auto text-[10px] text-game-muted">{sourceLabel(e)}</span>
            </button>
          )
        })}
        <button onClick={() => setMenu({ initial: null })}
          className="w-full py-1.5 rounded-lg border border-dashed border-game-border text-[12px] text-game-text-dim hover:text-game-text hover:border-game-primary/50">
          + Add supply
        </button>
      </div>

      {/* Keep loot — category checkboxes */}
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-widest text-game-text-dim">Keep Loot</div>
        <div className="flex gap-1 flex-wrap">
          {ALL_LOOT_CATEGORIES.map((c) => {
            const on = he.lootCats.includes(c)
            return <button key={c} onClick={() => toggleLootCat(unit.id, c)} className={toggleChip(on)}>{on ? '✓ ' : ''}{c}</button>
          })}
        </div>
      </div>

      {/* Return when — condition checkboxes + which town + return now */}
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-widest text-game-text-dim">Return When</div>
        <div className="flex gap-1 flex-wrap items-center">
          {RETURN_CONDITIONS.map((c) => {
            const on = he.returnOn.includes(c.id)
            return <button key={c.id} onClick={() => toggleReturnOn(unit.id, c.id)} className={toggleChip(on)} title={c.hint}>{on ? '✓ ' : ''}{c.label}</button>
          })}
          <button onClick={returnNow} disabled={!huntable} title="Send them home right now"
            className="text-[11px] px-2 py-0.5 rounded border border-game-gold/50 text-game-gold hover:bg-game-gold/10 disabled:opacity-30 disabled:cursor-not-allowed">⌂ Return now</button>
        </div>
        {/* Which town to return to — default nearest, overridable */}
        <div className="relative">
          <button onClick={() => setTownOpen((o) => !o)}
            className="text-[11px] px-2 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text">
            Return to: <span className="text-game-text">{chosenTown ? chosenTown.name : `Nearest${auto ? ` · ${auto.name}` : ''}`}</span> ▾
          </button>
          {townOpen && (
            <div className="absolute z-10 mt-1 w-48 rounded-lg border border-game-border bg-game-surface p-1 shadow-lg">
              <button onClick={() => { setReturnTown(unit.id, null); setTownOpen(false) }}
                className={`w-full text-left text-[12px] px-2 py-1 rounded hover:bg-game-border/40 ${!he.returnTown ? 'text-game-primary' : 'text-game-text-dim'}`}>
                Nearest{auto ? ` (${auto.name})` : ''}
              </button>
              {cities.map((c) => (
                <button key={c.id} onClick={() => { setReturnTown(unit.id, c.id); setTownOpen(false) }}
                  className={`w-full text-left text-[12px] px-2 py-1 rounded hover:bg-game-border/40 ${he.returnTown === c.id ? 'text-game-primary' : 'text-game-text-dim'}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Party sharing — who pools loot / supplies with the party */}
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-widest text-game-text-dim">Party Sharing</div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => toggleShareFlag(unit.id, 'acceptLoot')} className={toggleChip(he.acceptLoot)} title="Take on loot from the party (fill evenly)">{he.acceptLoot ? '✓ ' : ''}Accept loot</button>
          <button onClick={() => toggleShareFlag(unit.id, 'shareLoot')} className={toggleChip(he.shareLoot)} title="Hand loot to the party to balance fills">{he.shareLoot ? '✓ ' : ''}Share loot</button>
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => toggleShareFlag(unit.id, 'acceptSupplies')} className={toggleChip(he.acceptSupplies)} title="Draw supplies from the party">{he.acceptSupplies ? '✓ ' : ''}Accept supplies</button>
          <button onClick={() => toggleShareFlag(unit.id, 'shareSupplies')} className={toggleChip(he.shareSupplies)} title="Give supplies to the party">{he.shareSupplies ? '✓ ' : ''}Share supplies</button>
        </div>
      </div>

      {/* Party-level: solo vs together; copy this hero's plan */}
      <div className="space-y-2.5 pt-1 border-t border-game-border/60">
        <Seg label="Return Mode" options={RETURN_MODES} value={returnMode} onChange={(v) => setReturnMode(v)} />
        {huntable && party.length > 1 && (
          <button
            onClick={() => applyToParty(unit.id, party.filter((u) => u.id !== unit.id).map((u) => u.id))}
            className="w-full py-1.5 rounded-lg border border-game-border text-[12px] text-game-text-dim hover:text-game-text hover:bg-white/5">
            Apply {firstName(unit)}'s plan to the whole party
          </button>
        )}
      </div>

      {menu && <SupplyMenu unitId={unit.id} initial={menu.initial} loadout={he.loadout} onClose={() => setMenu(null)} />}
    </div>
  )
}
