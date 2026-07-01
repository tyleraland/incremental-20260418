import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import type { Unit } from '@/types'
import {
  RETURN_CONDITIONS, RETURN_MODES, SUPPLY_MODES, ALL_LOOT_CATEGORIES, SUPPLY_OPTIONS, supplyOption,
  isHuntable, isCity, nearestCity, loadoutWeight, loadoutCost, supplyState, type Choice, type Loadout,
} from './expedition'
import { useExpeditionStore } from './expeditionStore'
import { TOWN_RESUPPLY_TICKS } from './expeditionDriver'
import { useProtoStore } from './protoStore'
import { heroCarried, isOverweight, OVERWEIGHT_FRACTION, WEIGHT_LIMIT } from './economy'

// §travel-defend: per-hero behaviour when a hostile is in sight while routing.
const TRAVEL_ENGAGE_OPTS: Choice<'ignore' | 'retaliate' | 'clear'>[] = [
  { id: 'ignore',    label: 'Run past',      hint: 'March straight through — never stop to fight. Fastest, but takes the hits.' },
  { id: 'retaliate', label: 'Retaliate',     hint: 'Keep marching, but fire on hostiles that come into range as you pass. Default.' },
  { id: 'clear',     label: 'Fight through', hint: 'Stop and put down threats in sight before continuing. Safest, but slower and may leave the path to chase.' },
]

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
  const ticks = useGameStore((s) => s.ticks)
  const locations = useGameStore((s) => s.locations)
  const packs = useProtoStore((s) => s.packs)
  const heroes = useExpeditionStore((s) => s.heroes)
  const returnMode = useExpeditionStore((s) => s.returnMode)
  const ensure = useExpeditionStore((s) => s.ensure)
  const toggleLootCat = useExpeditionStore((s) => s.toggleLootCat)
  const toggleReturnOn = useExpeditionStore((s) => s.toggleReturnOn)
  const setSupplyMode = useExpeditionStore((s) => s.setSupplyMode)
  const toggleShareFlag = useExpeditionStore((s) => s.toggleShareFlag)
  const setReturnTown = useExpeditionStore((s) => s.setReturnTown)
  const setReturnMode = useExpeditionStore((s) => s.setReturnMode)
  const applyToParty = useExpeditionStore((s) => s.applyToParty)
  const commitStep = useExpeditionStore((s) => s.commitStep)
  const setTravelEngage = useGameStore((s) => s.setTravelEngage)

  const [menu, setMenu] = useState<{ initial: string | null } | null>(null)
  const [townOpen, setTownOpen] = useState(false)

  useEffect(() => { ensure(unit.id) }, [unit.id, ensure])

  const he = heroes[unit.id] ?? { loadout: {} as Loadout, lootCats: [...ALL_LOOT_CATEGORIES], returnOn: ['pack-full' as const], supplyMode: 'any' as const, shareLoot: true, acceptLoot: true, shareSupplies: false, acceptSupplies: true, suppliesLeft: 1, status: 'hunting' as const, locationId: null }
  const loc = unit.locationId ? locations.find((l) => l.id === unit.locationId) : null
  const huntable = !!loc && isHuntable(loc)
  const party = huntable ? units.filter((u) => u.locationId === loc!.id) : []

  const capWeight = heroCarried(packs[unit.id], unit.pack)
  const cap = (capWeight / WEIGHT_LIMIT) * 100
  // Supplies = real loadout usage, computed live from the carried pack (so it's
  // accurate the instant a potion is spent or restocked in town), not a stored timer.
  const supSt = supplyState(unit.pack, he.loadout)
  const sup = supSt.fraction * 100
  const hasSup = supSt.total > 0
  const firstName = (u: Unit) => u.name.split(' ')[0]
  const weight = loadoutWeight(he.loadout)
  const cost = loadoutCost(he.loadout)
  const loadoutEntries = Object.entries(he.loadout)

  const cities = locations.filter(isCity)
  const auto = nearestCity(unit.locationId, locations)
  const chosenTown = he.returnTown ? locations.find((l) => l.id === he.returnTown) : null

  // Higher-level plan while parked in town on a resupply trip: where they head back
  // to, alone vs with the party, and how long until they leave (a countdown bar).
  const inTownResupply = !huntable && !!loc && isCity(loc) && he.status === 'returning' && he.resupplyUntil != null
  const anchorLoc = he.locationId ? locations.find((l) => l.id === he.locationId) : null
  const resupplyLeft = inTownResupply ? Math.max(0, (he.resupplyUntil as number) - ticks) : 0
  const resupplyPct = inTownResupply ? Math.min(100, ((TOWN_RESUPPLY_TICKS - resupplyLeft) / TOWN_RESUPPLY_TICKS) * 100) : 0
  const resupplySecs = Math.ceil(resupplyLeft / TICKS_PER_SECOND)
  const travelGroup = returnMode === 'group'
  // The stored status is only 'hunting' | 'returning', which can't tell the OUTBOUND
  // leg (walking to town) from the INBOUND one (walking back to the hunt spot) — both
  // are 'returning'. Derive the real logistics phase for the status pill from the
  // resupply timer + whether the hero is still on the road (a live travelPath):
  //   hunting → traveling-to-hunt → hunting → to-town → resupplying → to-hunt → hunting
  const walking = (unit.travelPath?.length ?? 0) > 0
  const phase: 'hunting' | 'traveling' | 'to-town' | 'resupplying' | 'to-hunt' | 'idle' =
    he.status === 'returning'
      ? (he.resupplyUntil == null ? 'to-town' : inTownResupply ? 'resupplying' : 'to-hunt')
      : (walking ? 'traveling' : huntable ? 'hunting' : 'idle')
  const PHASE_PILL: Record<string, { label: string; cls: string } | null> = {
    hunting:     { label: 'hunting',             cls: 'border-game-green/50 text-game-green' },
    traveling:   { label: '→ traveling to hunt', cls: 'border-game-green/50 text-game-green' },
    'to-town':   { label: '⌂ returning to town', cls: 'border-game-gold/50 text-game-gold' },
    resupplying: { label: '⌂ resupplying',       cls: 'border-game-gold/50 text-game-gold' },
    'to-hunt':   { label: '→ returning to hunt', cls: 'border-game-gold/50 text-game-gold' },
    idle: null,
  }
  const pill = PHASE_PILL[phase]
  const returnNow = () => {
    const ids = (returnMode === 'group' && huntable) ? party.map((u) => u.id) : [unit.id]
    // Flag the return; the driver's resupply phase whisks them to town and back.
    for (const id of ids) commitStep(id, { status: 'returning', locationId: loc?.id ?? null })
  }

  return (
    <div className="space-y-4">
      {/* Status + meters for the scoped hero (name is in the scope bar above) */}
      <div className="rounded-lg border border-game-border bg-game-bg/60 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {pill ? (
              <>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${pill.cls}`}>{pill.label}</span>
                {phase === 'resupplying' && anchorLoc && <span className="text-[11px] text-game-text-dim">→ back to <span className="text-game-text">{anchorLoc.name}</span></span>}
                {phase === 'resupplying' && <span className="text-[11px] text-game-muted">{travelGroup ? 'with the party' : 'alone'}</span>}
              </>
            ) : (
              <span className="text-[12px] text-game-muted italic">{!unit.locationId ? 'Not deployed' : 'In town'} — plan below</span>
            )}
            {party.length > 1 && <span className="text-[11px] text-game-muted">+{party.length - 1} more here</span>}
            {/* Minor Overweight debuff — flags at 70% carry; penalties come later. */}
            {isOverweight(packs[unit.id], unit.pack) && (
              <span title={`Carrying ≥${Math.round(OVERWEIGHT_FRACTION * 100)}% capacity — penalties coming soon.`}
                className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-300">
                ⚠ Minor Overweight
              </span>
            )}
          </div>
          {huntable && (
            <div className="text-right shrink-0 space-y-0.5">
              <div className="text-[12px] text-game-text-dim">
                Capacity <span className={`font-mono tabular-nums ${cap >= 100 ? 'text-red-400' : 'text-game-text'}`}>{capWeight} / {WEIGHT_LIMIT} ({Math.round(cap)}%)</span>
              </div>
              <div className="text-[12px] text-game-text-dim">
                Supplies {hasSup
                  ? <span className={`font-mono tabular-nums ${sup <= 20 ? 'text-red-400' : 'text-game-text'}`}>{Math.round(sup)}%</span>
                  : <span className="text-game-muted">—</span>}
              </div>
            </div>
          )}
        </div>

        {/* Resupply countdown — how long until they restock and head back out. */}
        {inTownResupply && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="uppercase tracking-wider text-game-text-dim">Restocking</span>
              <span className="text-game-text tabular-nums">{resupplySecs > 0 ? `leaves in ${resupplySecs}s` : 'leaving…'}</span>
            </div>
            <div className="h-1.5 rounded-full bg-game-border overflow-hidden">
              <div className="h-full rounded-full bg-game-gold transition-all" style={{ width: `${resupplyPct}%` }} />
            </div>
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
        {/* When 'Supplies out' is a trigger: any one supply dry vs every supply dry. */}
        {he.returnOn.includes('supplies-out') && (
          <div className="flex gap-1 flex-wrap items-center pl-0.5">
            <span className="text-[10px] text-game-muted">Supplies out:</span>
            {SUPPLY_MODES.map((m) => (
              <button key={m.id} title={m.hint} onClick={() => setSupplyMode(unit.id, m.id)}
                className={toggleChip(he.supplyMode === m.id)}>{he.supplyMode === m.id ? '✓ ' : ''}{m.label}</button>
            ))}
          </div>
        )}
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

      {/* §travel-defend: how this hero handles hostiles while walking map→map. */}
      <Seg label="While Travelling" options={TRAVEL_ENGAGE_OPTS} value={unit.travelEngage ?? 'retaliate'} onChange={(v) => setTravelEngage(unit.id, v)} />

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
