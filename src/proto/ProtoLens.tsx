import { useState } from 'react'
import {
  useGameStore, getDerivedStats, getInitials,
  TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS,
  type Unit, type DerivedStats,
} from '@/stores/useGameStore'
import { getUnitTraits } from '@/data/traits'
import { SLOT_LABELS, SLOT_COMPATIBLE } from '@/data/equipment'
import type { EquipSlot, EquipmentItem, WeaponRecord } from '@/types'
import { buildSaga } from './lore'

// ── Prototype Lens ─────────────────────────────────────────────────────────────
//
// The always-on right half. Per-hero lenses (Summary / Saga / Gear / Tactician)
// bind to the selected hero; squad lenses (Party / Deploy) span the whole roster.
// The guiding bias: put the numbers that change a decision next to each other —
// equip a sword and see ATK move on the same row; compare every hero's doctrine
// in one channel×hero grid — rather than making the player hold state in memory.

type Lens = 'summary' | 'saga' | 'gear' | 'tactics' | 'party' | 'deploy'
const LENSES: { id: Lens; label: string; icon: string; squad?: boolean }[] = [
  { id: 'summary', label: 'Summary',   icon: '◈' },
  { id: 'saga',    label: 'Saga',      icon: '✶' },
  { id: 'gear',    label: 'Gear',      icon: '⚙' },
  { id: 'tactics', label: 'Tactics',   icon: '⚑' },
  { id: 'party',   label: 'Party',     icon: '☷', squad: true },
  { id: 'deploy',  label: 'Deploy',    icon: '➤', squad: true },
]

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const CHANNELS: { id: string; label: string }[] = [
  { id: 'movement', label: 'Movement' }, { id: 'targeting', label: 'Targeting' },
  { id: 'action', label: 'Action' }, { id: 'reaction', label: 'Reaction' }, { id: 'passive', label: 'Passive' },
]

function selectHero(u: Unit) {
  useGameStore.setState({ selectedUnitIds: [u.id], ...(u.locationId ? { selectedLocationId: u.locationId } : {}) })
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
        <div className="w-16 h-16 rounded-2xl bg-game-surface border border-game-primary/40 flex items-center justify-center text-3xl">
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

// ── Gear lens (delta-aware) ───────────────────────────────────────────────────
const GEAR_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'accessory', 'sideboard1', 'sideboard2']
// The derived stats a gear swap can move — shown as a before→after delta.
const DELTA_STATS: [keyof DerivedStats, string][] = [
  ['attack', 'ATK'], ['defense', 'DEF'], ['magicAttack', 'M.ATK'],
  ['magicDefense', 'M.DEF'], ['attackRange', 'RNG'], ['maxHp', 'HP'],
]

// Clone the unit with a candidate item placed in `slot`, so getDerivedStats can
// price the swap exactly the way the live game would (weapon-set aware).
function withItem(unit: Unit, slot: EquipSlot, itemId: string | null): Unit {
  if (slot === 'mainHand' || slot === 'offHand') {
    const weaponSets = unit.weaponSets.map((ws, i) =>
      i === unit.activeWeaponSet ? { ...ws, [slot]: itemId } : ws) as [WeaponRecord, WeaponRecord]
    return { ...unit, weaponSets }
  }
  return { ...unit, equipment: { ...unit.equipment, [slot]: itemId } }
}

function DeltaChips({ before, after }: { before: DerivedStats; after: DerivedStats }) {
  const chips = DELTA_STATS.map(([k, label]) => {
    const d = Math.round(after[k] as number) - Math.round(before[k] as number)
    return d !== 0 ? { label, d } : null
  }).filter(Boolean) as { label: string; d: number }[]
  if (chips.length === 0) return <span className="text-[10px] text-game-muted">no stat change</span>
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.label} className={['text-[10px] px-1.5 py-0.5 rounded tabular-nums',
          c.d > 0 ? 'bg-game-green/15 text-game-green' : 'bg-red-500/15 text-red-300'].join(' ')}>
          {c.label} {c.d > 0 ? '+' : ''}{c.d}
        </span>
      ))}
    </div>
  )
}

function GearLens({ unit }: { unit: Unit }) {
  const equipment = useGameStore((s) => s.equipment)
  const equipItem = useGameStore((s) => s.equipItem)
  const [activeSlot, setActiveSlot] = useState<EquipSlot | null>(null)

  const itemFor = (slot: EquipSlot): EquipmentItem | undefined => {
    const id = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
    return equipment.find((e) => e.id === id)
  }
  const mainHand = equipment.find((e) => e.id === unit.weaponSets[unit.activeWeaponSet].mainHand)
  const base = getDerivedStats(unit, equipment)
  const candidates = activeSlot ? equipment.filter((e) => SLOT_COMPATIBLE[activeSlot].includes(e.category)) : []
  const current = activeSlot ? itemFor(activeSlot) : undefined

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
            </button>
          )
        })}
      </div>

      {activeSlot ? (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">
            {SLOT_LABELS[activeSlot]} — pick to see the impact
          </div>
          <div className="space-y-1.5">
            {current && (
              <button
                onClick={() => equipItem(unit.id, activeSlot, null)}
                className="w-full rounded-md border border-game-border/60 bg-game-bg px-2.5 py-2 text-left hover:border-red-500/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-game-text-dim italic">Unequip {current.name}</span>
                  <span className="text-[10px] text-red-300">remove</span>
                </div>
                <DeltaChips before={base} after={getDerivedStats(withItem(unit, activeSlot, null), equipment)} />
              </button>
            )}
            {candidates.length === 0 && <div className="text-xs text-game-muted italic px-1">No compatible items in stash.</div>}
            {candidates.map((it) => {
              const equipped = current?.id === it.id
              const after = getDerivedStats(withItem(unit, activeSlot, it.id), equipment)
              return (
                <button
                  key={it.id}
                  onClick={() => equipItem(unit.id, activeSlot, it.id)}
                  className={[
                    'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                    equipped ? 'border-game-primary/60 bg-game-primary/10' : 'border-game-border bg-game-bg hover:border-game-primary/50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-game-text font-medium truncate">{it.name}</span>
                    {equipped ? <span className="text-[10px] text-game-primary shrink-0">equipped</span>
                      : <span className="text-[10px] text-game-text-dim shrink-0">equip ›</span>}
                  </div>
                  {equipped ? <span className="text-[10px] text-game-muted">currently worn</span>
                    : <DeltaChips before={base} after={after} />}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-game-muted italic">Tap a slot to compare gear — each option shows how it moves this hero's stats (and it updates live on the battlefield).</div>
      )}
    </div>
  )
}

// ── Tactician lens (single hero) ──────────────────────────────────────────────
function TacticianLens({ unit }: { unit: Unit }) {
  const partyTactics  = useGameStore((s) => s.partyTactics)
  const moveTactic    = useGameStore((s) => s.moveTactic)
  const equipTactic   = useGameStore((s) => s.equipTactic)
  const unequipTactic = useGameStore((s) => s.unequipTactic)
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

// ── Party lens (channel × hero doctrine matrix) ───────────────────────────────
function PartyLens({ selectedId }: { selectedId: string | null }) {
  const units        = useGameStore((s) => s.units)
  const locations    = useGameStore((s) => s.locations)
  const partyTactics = useGameStore((s) => s.partyTactics)

  // Deployed squad first; fall back to the whole roster so the lens is never empty.
  const deployed = units.filter((u) => u.locationId)
  const squad = deployed.length > 0 ? deployed : units
  const locName = (id: string | null) => id ? (locations.find((l) => l.id === id)?.name ?? id) : 'guild'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">
          {deployed.length > 0 ? 'Deployed squad' : 'Roster'} · doctrine
        </span>
        <span className="text-[10px] text-game-text-dim">{squad.length} heroes</span>
      </div>

      {partyTactics.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap rounded-md border border-game-secondary/30 bg-game-secondary/5 px-2 py-1.5">
          <span className="text-[9px] uppercase tracking-wider text-game-secondary">Party</span>
          {partyTactics.map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-game-secondary/15 text-game-text" title={TACTIC_REGISTRY[t.id]?.description}>{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
          ))}
        </div>
      )}

      {/* matrix: sticky channel column on the left, one column per hero */}
      <div className="overflow-x-auto -mx-3 px-3">
        <div className="min-w-max">
          {/* header row */}
          <div className="flex">
            <div className="w-16 shrink-0" />
            {squad.map((u) => (
              <button
                key={u.id}
                onClick={() => selectHero(u)}
                className={['w-28 shrink-0 px-1.5 pb-2 text-left border-b-2 transition-colors',
                  selectedId === u.id ? 'border-game-primary' : 'border-transparent hover:border-game-border'].join(' ')}
              >
                <div className="flex items-center gap-1">
                  <span className="text-sm">{u.class && CLASS_ICON[u.class] ? CLASS_ICON[u.class] : getInitials(u.name)}</span>
                  <span className="text-[11px] font-medium text-game-text truncate">{u.name.split(' ')[0]}</span>
                </div>
                <div className="text-[9px] text-game-text-dim truncate">{u.class ?? 'Novice'} · {locName(u.locationId)}</div>
              </button>
            ))}
          </div>
          {/* one row per channel */}
          {CHANNELS.map((ch) => (
            <div key={ch.id} className="flex border-t border-game-border/50">
              <div className="w-16 shrink-0 py-1.5 text-[9px] uppercase tracking-wider text-game-text-dim sticky left-0 bg-game-surface/40">{ch.label}</div>
              {squad.map((u) => {
                const inCh = u.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === ch.id)
                return (
                  <div key={u.id} className={['w-28 shrink-0 py-1.5 px-1 space-y-0.5',
                    selectedId === u.id ? 'bg-game-primary/5' : ''].join(' ')}>
                    {inCh.length === 0 ? <span className="text-[10px] text-game-muted">·</span>
                      : inCh.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-1" title={TACTIC_REGISTRY[t.id]?.description}>
                          <span className="text-[8px] text-game-muted tabular-nums">{i + 1}</span>
                          <span className="text-[10px] text-game-text leading-tight">{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-game-muted italic">Tap a hero column to open their full Tactician lens. Skill-granted actions inject on top of this manual loadout in combat.</div>
    </div>
  )
}

// ── Saga lens ─────────────────────────────────────────────────────────────────
function SagaLens({ unit }: { unit: Unit }) {
  const eventLog = useGameStore((s) => s.eventLog)
  const saga = buildSaga(unit, eventLog)
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-game-border bg-game-surface/60 p-4">
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
function DeployLens({ unit }: { unit: Unit | null }) {
  const locations  = useGameStore((s) => s.locations)
  const units      = useGameStore((s) => s.units)
  const assignUnits = useGameStore((s) => s.assignUnits)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)

  const byRegion = new Map<string, typeof locations>()
  for (const l of locations) {
    const arr = byRegion.get(l.region); if (arr) arr.push(l); else byRegion.set(l.region, [l])
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-game-border bg-game-bg p-2.5">
        <div className="text-xs text-game-text-dim">{unit ? `${unit.name} is` : 'No hero selected —'}</div>
        <div className="text-sm text-game-text font-medium">
          {unit ? (unit.locationId ? (locations.find((l) => l.id === unit.locationId)?.name ?? unit.locationId) : 'At the guild (undeployed)') : 'pick a hero to send them somewhere'}
        </div>
        {unit?.locationId && (
          <button onClick={() => assignUnits([unit.id], null)} className="mt-1.5 text-[11px] px-2 py-1 rounded border border-game-border text-game-text-dim hover:text-game-text">↩ Recall to guild</button>
        )}
      </div>

      {[...byRegion.entries()].map(([region, locs]) => (
        <div key={region}>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5 capitalize">{region.replace('-', ' ')}</div>
          <div className="space-y-1">
            {locs.map((l) => {
              const here = units.filter((u) => u.locationId === l.id)
              const isHere = unit?.locationId === l.id
              return (
                <div key={l.id} className={['flex items-center gap-2 rounded-md border px-2.5 py-1.5',
                  isHere ? 'border-game-primary/50 bg-game-primary/10' : 'border-game-border bg-game-bg'].join(' ')}>
                  <button onClick={() => setSelectedLocation(l.id)} className="min-w-0 flex-1 text-left">
                    <div className="text-xs text-game-text font-medium truncate">{l.name}</div>
                    <div className="text-[9px] text-game-text-dim">{here.length} hero{here.length !== 1 ? 'es' : ''} · {l.monsterIds.length} foe types{l.openWorld ? ' · open' : ''}</div>
                  </button>
                  <button
                    onClick={() => unit && assignUnits([unit.id], l.id)}
                    disabled={!unit || isHere}
                    className={['text-[11px] px-2 py-1 rounded shrink-0 transition-colors',
                      (!unit || isHere) ? 'text-game-muted' : 'border border-game-primary/50 text-game-text hover:bg-game-primary/15'].join(' ')}
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
  const def = LENSES.find((l) => l.id === lens)!
  const needsHero = !def.squad && !unit

  return (
    <div className="h-full flex flex-col bg-game-surface/40 min-h-0">
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
        {needsHero ? (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <div className="text-4xl mb-2 opacity-40">◈</div>
              <div className="text-sm text-game-text-dim">Select a hero from the roster</div>
              <div className="text-xs text-game-muted mt-1">Their {def.label.toLowerCase()} appears here while you watch the world on the left.</div>
            </div>
          </div>
        ) : (
          <>
            {lens === 'summary' && unit && <SummaryLens unit={unit} ds={getDerivedStats(unit, equipment)} />}
            {lens === 'saga'    && unit && <SagaLens unit={unit} />}
            {lens === 'gear'    && unit && <GearLens unit={unit} />}
            {lens === 'tactics' && unit && <TacticianLens unit={unit} />}
            {lens === 'party'   && <PartyLens selectedId={unit?.id ?? null} />}
            {lens === 'deploy'  && <DeployLens unit={unit} />}
          </>
        )}
      </div>
    </div>
  )
}
