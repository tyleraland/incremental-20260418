import { useState } from 'react'
import {
  useGameStore, getDerivedStats, getInitials,
  TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS,
  type Unit, type DerivedStats,
} from '@/stores/useGameStore'
import { getUnitTraits } from '@/data/traits'
import { SLOT_LABELS, SLOT_COMPATIBLE } from '@/data/equipment'
import type { EquipSlot, EquipmentItem, TacticSlot } from '@/types'
import { buildSaga } from './lore'

// ── Prototype Lens ─────────────────────────────────────────────────────────────
//
// The always-on right half: a context inspector bound to the selected hero. It
// trades altitude — Summary (high-level vitals + role) and Saga (pure narrative)
// at the top of the scale; Gear and Tactician (per-point numbers + the combat
// levers) at the bottom. Deploy spans both: move the hero across the world while
// watching the battle on the left.

type Lens = 'summary' | 'gear' | 'tactics' | 'saga' | 'deploy'
const LENSES: { id: Lens; label: string; icon: string; altitude: string }[] = [
  { id: 'summary', label: 'Summary',   icon: '◈', altitude: 'high' },
  { id: 'saga',    label: 'Saga',      icon: '✶', altitude: 'high' },
  { id: 'gear',    label: 'Gear',      icon: '⚙', altitude: 'low'  },
  { id: 'tactics', label: 'Tactician', icon: '⚑', altitude: 'low'  },
  { id: 'deploy',  label: 'Deploy',    icon: '➤', altitude: 'mid'  },
]

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const CHANNELS: { id: string; label: string }[] = [
  { id: 'movement', label: 'Movement' }, { id: 'targeting', label: 'Targeting' },
  { id: 'action', label: 'Action' }, { id: 'reaction', label: 'Reaction' }, { id: 'passive', label: 'Passive' },
]

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="uppercase tracking-wider text-game-text-dim">{label}</span>
        <span className="text-game-text tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-game-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  )
}

// ── Summary lens ──────────────────────────────────────────────────────────────
function SummaryLens({ unit, ds }: { unit: Unit; ds: DerivedStats }) {
  const locations = useGameStore((s) => s.locations)
  const spendAbilityPoint = useGameStore((s) => s.spendAbilityPoint)
  const loc = unit.locationId ? locations.find((l) => l.id === unit.locationId) : null
  const status = unit.recoveryTicksLeft > 0 ? { t: 'Recovering', c: 'text-purple-300' }
    : unit.isResting ? { t: 'Resting', c: 'text-sky-300' }
    : loc ? { t: `Deployed · ${loc.name}`, c: 'text-game-green' }
    : { t: 'Idle at the guild', c: 'text-game-text-dim' }
  const xpPct = Math.min(100, (unit.exp / unit.expToNext) * 100)
  const hpPct = Math.min(100, (unit.health / ds.maxHp) * 100)
  const traits = getUnitTraits(unit)

  const abilities: [keyof Unit['abilities'], string][] = [
    ['strength', 'STR'], ['agility', 'AGI'], ['dexterity', 'DEX'], ['constitution', 'CON'], ['intelligence', 'INT'],
  ]
  const stats: [string, number][] = [
    ['ATK', ds.attack], ['DEF', ds.defense], ['M.ATK', ds.magicAttack], ['M.DEF', ds.magicDefense],
    ['SPD', ds.attackSpeed], ['ACC', ds.accuracy], ['DODGE', ds.dodge], ['RANGE', ds.attackRange],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-game-primary/30 to-game-secondary/20 border border-game-primary/40 flex items-center justify-center text-3xl">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-game-text leading-tight truncate">{unit.name}</div>
          <div className="text-xs text-game-text-dim">{unit.class ?? 'Novice'} · Lv {unit.level} · {unit.age}y</div>
          <div className={`text-[11px] mt-0.5 ${status.c}`}>● {status.t}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[10px] mb-0.5"><span className="uppercase tracking-wider text-game-text-dim">Health</span><span className="text-game-text tabular-nums">{Math.floor(unit.health)} / {ds.maxHp}</span></div>
          <div className="h-2 rounded-full bg-game-border overflow-hidden"><div className="h-full rounded-full bg-game-green" style={{ width: `${hpPct}%` }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-0.5"><span className="uppercase tracking-wider text-game-text-dim">Experience</span><span className="text-game-text tabular-nums">{Math.floor(unit.exp)} / {unit.expToNext}</span></div>
          <div className="h-2 rounded-full bg-game-border overflow-hidden"><div className="h-full rounded-full bg-game-accent" style={{ width: `${xpPct}%` }} /></div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Abilities</span>
          {unit.abilityPoints > 0 && <span className="text-[10px] text-game-gold">{unit.abilityPoints} pts to spend</span>}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {abilities.map(([k, label]) => (
            <button
              key={k}
              disabled={unit.abilityPoints <= 0}
              onClick={() => spendAbilityPoint(unit.id, k)}
              className={[
                'rounded-lg border py-1.5 flex flex-col items-center transition-colors',
                unit.abilityPoints > 0 ? 'border-game-gold/40 hover:bg-game-gold/10 cursor-pointer' : 'border-game-border cursor-default',
              ].join(' ')}
            >
              <span className="text-[9px] text-game-text-dim">{label}</span>
              <span className="text-base font-semibold text-game-text leading-none">{unit.abilities[k]}</span>
              {unit.abilityPoints > 0 && <span className="text-[8px] text-game-gold leading-none mt-0.5">＋</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Combat profile</div>
        <div className="grid grid-cols-4 gap-1.5">
          {stats.map(([label, v]) => (
            <div key={label} className="rounded-lg bg-game-bg border border-game-border py-1.5 flex flex-col items-center">
              <span className="text-[9px] text-game-text-dim">{label}</span>
              <span className="text-sm font-semibold text-game-text tabular-nums leading-none mt-0.5">{Math.round(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {traits.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Traits</div>
          <div className="flex flex-wrap gap-1">
            {traits.map((t) => (
              <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60" title={t.description}>{t.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gear lens ─────────────────────────────────────────────────────────────────
const GEAR_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'accessory', 'sideboard1', 'sideboard2']

function GearLens({ unit }: { unit: Unit }) {
  const equipment = useGameStore((s) => s.equipment)
  const equipItem = useGameStore((s) => s.equipItem)
  const [activeSlot, setActiveSlot] = useState<EquipSlot | null>(null)

  const itemFor = (slot: EquipSlot): EquipmentItem | undefined => {
    const id = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
    return equipment.find((e) => e.id === id)
  }
  const mainHand = equipment.find((e) => e.id === unit.weaponSets[unit.activeWeaponSet].mainHand)
  const candidates = activeSlot
    ? equipment.filter((e) => SLOT_COMPATIBLE[activeSlot].includes(e.category))
    : []
  const current = activeSlot ? itemFor(activeSlot) : undefined

  function statLine(it?: EquipmentItem): string {
    if (!it) return '—'
    const parts: string[] = []
    if (it.stats.attack) parts.push(`ATK ${it.stats.attack}`)
    if (it.stats.defense) parts.push(`DEF ${it.stats.defense}`)
    if (it.stats.specialAttack) parts.push(`M.ATK ${it.stats.specialAttack}`)
    if (it.stats.specialDefense) parts.push(`M.DEF ${it.stats.specialDefense}`)
    if (it.stats.range) parts.push(`RNG ${it.stats.range}`)
    return parts.join(' · ') || 'no stats'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1.5">
        {GEAR_SLOTS.map((slot) => {
          const it = itemFor(slot)
          const locked = slot === 'offHand' && mainHand?.category === 'weapon-2h'
          const isSide = slot === 'sideboard1' || slot === 'sideboard2'
          return (
            <button
              key={slot}
              disabled={locked}
              onClick={() => setActiveSlot(activeSlot === slot ? null : slot)}
              className={[
                'rounded-lg border p-2 text-left transition-colors',
                activeSlot === slot ? 'border-game-primary bg-game-primary/15'
                  : locked ? 'border-game-border opacity-40'
                  : isSide ? 'border-game-border/60 bg-game-bg/40 hover:border-game-primary/50'
                  : 'border-game-border hover:border-game-primary/50',
              ].join(' ')}
            >
              <div className="text-[9px] uppercase tracking-wider text-game-text-dim">{SLOT_LABELS[slot]}</div>
              <div className={['text-xs leading-snug mt-0.5', it ? 'text-game-text font-medium' : 'text-game-muted italic'].join(' ')}>
                {locked ? '2H locked' : it?.name ?? 'empty'}
              </div>
              {it && <div className="text-[9px] text-game-accent mt-0.5">{statLine(it)}</div>}
            </button>
          )
        })}
      </div>

      {activeSlot && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">
            Equip → {SLOT_LABELS[activeSlot]}
          </div>
          <div className="space-y-1">
            {current && (
              <button
                onClick={() => { equipItem(unit.id, activeSlot, null); }}
                className="w-full flex items-center justify-between rounded-md border border-game-border/60 bg-game-bg px-2.5 py-1.5 text-left hover:border-red-500/50"
              >
                <span className="text-xs text-game-text-dim italic">Unequip {current.name}</span>
                <span className="text-[10px] text-red-300">remove</span>
              </button>
            )}
            {candidates.length === 0 && <div className="text-xs text-game-muted italic px-1">No compatible items in stash.</div>}
            {candidates.map((it) => {
              const equipped = current?.id === it.id
              return (
                <button
                  key={it.id}
                  onClick={() => equipItem(unit.id, activeSlot, it.id)}
                  className={[
                    'w-full flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors',
                    equipped ? 'border-game-primary/60 bg-game-primary/10' : 'border-game-border bg-game-bg hover:border-game-primary/50',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="text-xs text-game-text font-medium truncate">{it.name}</div>
                    <div className="text-[9px] text-game-accent">{statLine(it)}</div>
                  </div>
                  {equipped ? <span className="text-[10px] text-game-primary shrink-0">equipped</span>
                    : <span className="text-[10px] text-game-text-dim shrink-0">equip ›</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {!activeSlot && <div className="text-xs text-game-muted italic">Tap a slot to swap gear — stats update live on the Summary lens and on the battlefield.</div>}
    </div>
  )
}

// ── Tactician lens ────────────────────────────────────────────────────────────
function TacticianLens({ unit }: { unit: Unit }) {
  const partyTactics    = useGameStore((s) => s.partyTactics)
  const moveTactic      = useGameStore((s) => s.moveTactic)
  const equipTactic     = useGameStore((s) => s.equipTactic)
  const unequipTactic   = useGameStore((s) => s.unequipTactic)
  const [adding, setAdding] = useState(false)

  const equippedIds = new Set(unit.tactics.map((t) => t.id))
  const byChannel = (ch: string) => unit.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === ch)
  const available = listTactics('unit').filter((d) => !equippedIds.has(d.id))
  const atCap = unit.tactics.length >= MAX_UNIT_TACTICS

  return (
    <div className="space-y-4">
      {partyTactics.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Party doctrine</div>
          <div className="flex flex-wrap gap-1.5">
            {partyTactics.map((t) => {
              const def = TACTIC_REGISTRY[t.id]
              return <span key={t.id} className="text-[11px] px-2 py-1 rounded-md border border-game-secondary/40 bg-game-secondary/10 text-game-text" title={def?.description}>{def?.name ?? t.id}</span>
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Priority by channel</span>
        <span className="text-[10px] text-game-text-dim">{unit.tactics.length}/{MAX_UNIT_TACTICS}</span>
      </div>

      <div className="space-y-3">
        {CHANNELS.map((ch) => {
          const slots = byChannel(ch.id)
          if (slots.length === 0) return null
          return (
            <div key={ch.id}>
              <div className="text-[10px] text-game-muted mb-1">{ch.label}</div>
              <div className="space-y-1">
                {slots.map((t, i) => {
                  const def = TACTIC_REGISTRY[t.id]
                  return (
                    <div key={t.id} className="flex items-start gap-1.5 rounded-md border border-game-border bg-game-bg px-2 py-1.5">
                      <span className="text-[10px] text-game-muted w-4 text-center tabular-nums pt-0.5">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-game-text">{def?.name ?? t.id}</span>
                          {def?.kind === 'floor' && <span className="text-[8px] px-1 rounded bg-game-border text-game-text-dim">floor</span>}
                        </div>
                        <div className="text-[10px] text-game-text-dim leading-snug">{def?.description}</div>
                      </div>
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveTactic(unit.id, t.id, -1)} className="w-5 h-4 rounded bg-game-border/60 text-[9px] text-game-text-dim hover:text-game-text leading-none">▲</button>
                        <button onClick={() => moveTactic(unit.id, t.id, 1)} className="w-5 h-4 rounded bg-game-border/60 text-[9px] text-game-text-dim hover:text-game-text leading-none">▼</button>
                      </div>
                      <button onClick={() => unequipTactic(unit.id, t.id)} className="text-game-muted hover:text-red-300 text-xs shrink-0 pt-0.5">✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div>
        <button
          onClick={() => setAdding((v) => !v)}
          disabled={atCap}
          className={['text-xs px-3 py-1.5 rounded-lg border w-full transition-colors',
            atCap ? 'border-game-border text-game-muted cursor-not-allowed' : 'border-game-primary/50 text-game-text hover:bg-game-primary/10'].join(' ')}
        >{atCap ? 'Tactic slots full' : adding ? 'Close' : '＋ Add tactic'}</button>
        {adding && !atCap && (
          <div className="mt-1.5 space-y-1 max-h-44 overflow-y-auto">
            {available.map((def) => (
              <button
                key={def.id}
                onClick={() => { equipTactic(unit.id, def.id); setAdding(false) }}
                className="w-full text-left rounded-md border border-game-border bg-game-bg px-2 py-1.5 hover:border-game-primary/50"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-game-text">{def.name}</span>
                  <span className="text-[9px] text-game-muted capitalize">{def.channel}</span>
                </div>
                <div className="text-[10px] text-game-text-dim leading-snug">{def.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Saga lens ─────────────────────────────────────────────────────────────────
function SagaLens({ unit }: { unit: Unit }) {
  const eventLog = useGameStore((s) => s.eventLog)
  const saga = buildSaga(unit, eventLog)
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-game-border bg-gradient-to-b from-game-surface to-game-bg p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-game-secondary mb-1">{saga.epithet}</div>
        <div className="text-xl font-semibold text-game-text">{saga.title}</div>
        <p className="text-sm text-game-text-dim italic mt-2 leading-relaxed">{saga.opening}</p>
      </div>
      <p className="text-sm text-game-text leading-relaxed">{saga.body}</p>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Recent deeds</div>
        {saga.deeds.length === 0 ? (
          <div className="text-xs text-game-muted italic">No deeds recorded yet — the saga is unwritten.</div>
        ) : (
          <ol className="relative border-l border-game-border ml-1.5 space-y-2.5 pl-3">
            {saga.deeds.map((d, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.05rem] top-1 w-2 h-2 rounded-full bg-game-accent ring-2 ring-game-bg" />
                <div className="text-xs text-game-text leading-snug">{d.text}</div>
                <div className="text-[9px] text-game-muted">tick {d.tick}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ── Deploy lens ───────────────────────────────────────────────────────────────
function DeployLens({ unit }: { unit: Unit }) {
  const locations  = useGameStore((s) => s.locations)
  const units      = useGameStore((s) => s.units)
  const assignUnits = useGameStore((s) => s.assignUnits)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)

  // Group deployable world locations by region for a scannable list.
  const byRegion = new Map<string, typeof locations>()
  for (const l of locations) {
    const arr = byRegion.get(l.region); if (arr) arr.push(l); else byRegion.set(l.region, [l])
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-game-border bg-game-bg p-2.5">
        <div className="text-xs text-game-text-dim">Currently</div>
        <div className="text-sm text-game-text font-medium">
          {unit.locationId ? (locations.find((l) => l.id === unit.locationId)?.name ?? unit.locationId) : 'At the guild (undeployed)'}
        </div>
        {unit.locationId && (
          <button onClick={() => assignUnits([unit.id], null)} className="mt-1.5 text-[11px] px-2 py-1 rounded border border-game-border text-game-text-dim hover:text-game-text">↩ Recall to guild</button>
        )}
      </div>

      {[...byRegion.entries()].map(([region, locs]) => (
        <div key={region}>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5 capitalize">{region.replace('-', ' ')}</div>
          <div className="space-y-1">
            {locs.map((l) => {
              const here = units.filter((u) => u.locationId === l.id)
              const isHere = unit.locationId === l.id
              return (
                <div key={l.id} className={['flex items-center gap-2 rounded-md border px-2.5 py-1.5',
                  isHere ? 'border-game-primary/50 bg-game-primary/10' : 'border-game-border bg-game-bg'].join(' ')}>
                  <button onClick={() => setSelectedLocation(l.id)} className="min-w-0 flex-1 text-left">
                    <div className="text-xs text-game-text font-medium truncate">{l.name}</div>
                    <div className="text-[9px] text-game-text-dim">{here.length} hero{here.length !== 1 ? 'es' : ''} · {l.monsterIds.length} foe types{l.openWorld ? ' · open' : ''}</div>
                  </button>
                  <button
                    onClick={() => assignUnits([unit.id], l.id)}
                    disabled={isHere}
                    className={['text-[11px] px-2 py-1 rounded shrink-0 transition-colors',
                      isHere ? 'text-game-muted' : 'border border-game-primary/50 text-game-text hover:bg-game-primary/15'].join(' ')}
                  >{isHere ? 'here' : 'send ›'}</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ProtoLens shell ─────────────────────────────────────────────────────────--
export function ProtoLens() {
  const units = useGameStore((s) => s.units)
  const equipment = useGameStore((s) => s.equipment)
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)
  const [lens, setLens] = useState<Lens>('summary')

  const unit = units.find((u) => u.id === selectedUnitIds[0]) ?? null

  if (!unit) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-4xl mb-2 opacity-40">◈</div>
          <div className="text-sm text-game-text-dim">Select a hero from the roster</div>
          <div className="text-xs text-game-muted mt-1">Their summary, gear, tactics and saga appear here while you watch the world on the left.</div>
        </div>
      </div>
    )
  }

  const ds = getDerivedStats(unit, equipment)

  return (
    <div className="h-full flex flex-col bg-game-surface/40 min-h-0">
      {/* lens switcher */}
      <div className="shrink-0 flex border-b border-game-border bg-game-surface/60">
        {LENSES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLens(l.id)}
            className={[
              'flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors relative',
              lens === l.id ? 'text-game-primary' : 'text-game-muted hover:text-game-text-dim',
            ].join(' ')}
          >
            <span className="text-base leading-none">{l.icon}</span>
            <span className="text-[10px] font-medium">{l.label}</span>
            {lens === l.id && <span className="absolute bottom-0 inset-x-3 h-0.5 rounded-full bg-game-primary" />}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {lens === 'summary' && <SummaryLens unit={unit} ds={ds} />}
        {lens === 'gear'    && <GearLens unit={unit} />}
        {lens === 'tactics' && <TacticianLens unit={unit} />}
        {lens === 'saga'    && <SagaLens unit={unit} />}
        {lens === 'deploy'  && <DeployLens unit={unit} />}
      </div>
    </div>
  )
}
