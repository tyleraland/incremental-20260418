import { useEffect, useRef, useState } from 'react'
import {
  useGameStore, getDerivedStats, getInitials, getItemTraits,
  TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS,
  type Unit, type DerivedStats,
} from '@/stores/useGameStore'
import { getUnitTraits } from '@/data/traits'
import { SLOT_LABELS, SLOT_COMPATIBLE, CATEGORY_LABELS } from '@/data/equipment'
import { TraitRow } from '@/components/TraitBubble'
import type { EquipSlot, EquipmentItem, WeaponRecord, ItemCategory, Trait } from '@/types'
import { buildSaga } from './lore'
import { ArmyMatrix } from './ArmyMatrix'
import { LocationDetail } from './LocationDetail'

// ── Prototype Lens ─────────────────────────────────────────────────────────────
//
// The always-on right half. Tabs, in altitude order:
//   Location — the focused site's meters, attunement upgrades, story, foes
//   Party    — the party on this battlefield (doctrine + gear matrix)
//   Hero     — one hero (Summary / Gear / Saga / Tactics + battlefield status)
//   Items    — the guild's whole stash, with per-hero equip diffs (n=all ↔ n=1)
//   World    — deploy / roster overview
// Default = Location (first screen is a battlefield). Selecting a hero (roster or
// matrix) drills to Hero; otherwise the tabs are manual — the stage's zoom slider
// drives navigation, not the lens.

type Top = 'location' | 'hero' | 'party' | 'items'
type HeroSub = 'summary' | 'gear' | 'saga' | 'tactics'
const TOP_TABS: { id: Top; label: string; icon: string }[] = [
  { id: 'location', label: 'Location', icon: '⌖' },
  { id: 'hero',     label: 'Hero',     icon: '◈' },
  { id: 'party',    label: 'Party',    icon: '☷' },
  { id: 'items',    label: 'Items',    icon: '🎒' },
]
const HERO_SUBS: { id: HeroSub; label: string }[] = [
  { id: 'summary', label: 'Summary' }, { id: 'gear', label: 'Gear' },
  { id: 'tactics', label: 'Tactics' }, { id: 'saga', label: 'Saga' },
]

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const CHANNELS: { id: string; label: string }[] = [
  { id: 'movement', label: 'Movement' }, { id: 'targeting', label: 'Targeting' },
  { id: 'action', label: 'Action' }, { id: 'reaction', label: 'Reaction' }, { id: 'passive', label: 'Passive' },
]

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

// ── Battlefield status (live combatant readout) ───────────────────────────────
const STATUS_TINT: Record<string, string> = {
  buff: 'border-game-green/40 bg-game-green/10 text-game-green',
  debuff: 'border-red-500/40 bg-red-500/10 text-red-300',
  control: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
}
function BattleStatus({ unit }: { unit: Unit }) {
  const battle = useGameStore((s) => (unit.locationId ? s.battles[unit.locationId] : undefined))
  const me = battle?.combatants.find((c) => c.id === unit.id)
  if (!battle || !me) return null
  const hpPct = Math.max(0, (me.hp / me.maxHp) * 100)
  const target = me.lockedTargetId ? battle.combatants.find((c) => c.id === me.lockedTargetId) : null
  return (
    <div className="mb-3 rounded-lg border border-game-border bg-game-bg/60 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-game-accent">● On the battlefield</span>
        <span className="text-[10px] text-game-text-dim tabular-nums">{Math.ceil(me.hp)}/{me.maxHp} HP</span>
      </div>
      <div className="h-1.5 rounded-full bg-game-border overflow-hidden">
        <div className={`h-full rounded-full ${hpPct > 60 ? 'bg-game-green' : hpPct > 30 ? 'bg-game-gold' : 'bg-red-500'}`} style={{ width: `${hpPct}%` }} />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-game-text-dim">
        <span>{me.channel ? `casting ${me.channel.skillId ?? '…'}` : me.moving ? 'moving' : 'engaging'}</span>
        {target && <span className="ml-auto">⊕ target: <span className="text-game-text">{target.name}</span></span>}
      </div>
      {me.statuses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {me.statuses.map((s, i) => (
            <span key={`${s.id}-${i}`} className={['text-[9px] px-1.5 py-0.5 rounded border', STATUS_TINT[s.category ?? 'debuff'] ?? STATUS_TINT.debuff].join(' ')} title={s.flags.join(', ')}>
              {s.name} <span className="opacity-70 tabular-nums">{s.duration}r</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Items lens (guild stash, n=all ↔ per-hero n=1 diffs) ───────────────────────
const CAT_SLOT: Partial<Record<ItemCategory, EquipSlot>> = {
  'weapon-1h': 'mainHand', 'weapon-2h': 'mainHand', shield: 'offHand', armor: 'armor', accessory: 'accessory',
}
const ITEM_CATEGORIES: ItemCategory[] = ['weapon-1h', 'weapon-2h', 'shield', 'armor', 'accessory', 'tool']

// Tri-state type filters (include / exclude / off), modelled on the production
// Inventory's type chips but each one cycles through three states.
type FilterKey = 'weapon' | 'armor' | 'accessory' | 'tool' | 'material'
type FilterState = 'off' | 'include' | 'exclude'
const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'weapon', label: 'Weapons', icon: '🗡' },
  { key: 'armor', label: 'Armor', icon: '🛡' },
  { key: 'accessory', label: 'Accessory', icon: '💍' },
  { key: 'tool', label: 'Tools', icon: '🔧' },
  { key: 'material', label: 'Materials', icon: '📦' },
]
function filterKeyOf(cat: ItemCategory): FilterKey {
  if (cat === 'weapon-1h' || cat === 'weapon-2h') return 'weapon'
  if (cat === 'shield' || cat === 'armor') return 'armor'
  if (cat === 'accessory') return 'accessory'
  return 'tool'
}
const nextState = (s: FilterState): FilterState => (s === 'off' ? 'include' : s === 'include' ? 'exclude' : 'off')

// Objective (absolute, unsigned) stat/trait chips for an item, + a range chip
// for weapons — mirrors the production Inventory's chip row.
function objectiveChips(it: EquipmentItem): Trait[] {
  const chips = getItemTraits(it)
  if (it.category === 'weapon-1h' || it.category === 'weapon-2h') {
    const r = it.stats.range ?? 5
    chips.push({ id: `rng-${it.id}`, label: r > 5 ? `${r} RNG` : 'melee', category: 'stat', description: r > 5 ? `Reaches ${r} ft.` : 'Melee weapon.' })
  }
  return chips
}
// Relative stat deltas (signed) vs the hero's worn item in that slot — as text.
const REL_STATS: [keyof EquipmentItem['stats'], string][] = [
  ['attack', 'ATK'], ['defense', 'DEF'], ['specialAttack', 'M.ATK'], ['specialDefense', 'M.DEF'],
]
function relativeDeltas(it: EquipmentItem, current: EquipmentItem | null): { l: string; d: number }[] {
  const out: { l: string; d: number }[] = []
  for (const [k, l] of REL_STATS) { const d = (it.stats[k] ?? 0) - (current?.stats[k] ?? 0); if (d) out.push({ l, d }) }
  const iw = it.category === 'weapon-1h' || it.category === 'weapon-2h'
  const cw = current && (current.category === 'weapon-1h' || current.category === 'weapon-2h')
  if (iw && cw) { const d = (it.stats.range ?? 5) - (current!.stats.range ?? 5); if (d) out.push({ l: 'RNG', d }) }
  return out
}

function canUse(it: EquipmentItem, unit: Unit): boolean {
  const cls = unit.class ?? 'Novice'
  if (it.requiredLevel && unit.level < it.requiredLevel) return false
  if (it.requiredClasses && !it.requiredClasses.includes(cls)) return false
  return true
}

function ItemsLens({ unit }: { unit: Unit | null }) {
  const equipment = useGameStore((s) => s.equipment)
  const miscItems = useGameStore((s) => s.miscItems)
  const equipItem = useGameStore((s) => s.equipItem)
  const [filters, setFilters] = useState<Record<FilterKey, FilterState>>({ weapon: 'off', armor: 'off', accessory: 'off', tool: 'off', material: 'off' })
  // Scope: everything in the stash, vs only what THIS hero can equip/use.
  const [scope, setScope] = useState<'all' | 'usable'>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const usable = scope === 'usable' && !!unit
  const includes = FILTERS.map((f) => f.key).filter((k) => filters[k] === 'include')
  const excludes = FILTERS.map((f) => f.key).filter((k) => filters[k] === 'exclude')
  const visible = (k: FilterKey) => (includes.length === 0 || includes.includes(k)) && !excludes.includes(k)
  const cycle = (k: FilterKey) => setFilters((f) => ({ ...f, [k]: nextState(f[k]) }))
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const mats = usable ? miscItems.filter((m) => m.kind === 'consumable') : miscItems

  return (
    <div className="space-y-2">
      {/* slim header line + scope toggle */}
      <div className="flex items-center gap-2 text-[10px] text-game-text-dim">
        <span className="truncate">Stash · {equipment.length} gear · {miscItems.length} mat{unit ? <> · vs <span className="text-game-primary">{unit.name.split(' ')[0]}</span></> : null}</span>
        <div className="ml-auto flex rounded-md border border-game-border overflow-hidden shrink-0">
          <button onClick={() => setScope('all')} className={`px-2 py-0.5 ${scope === 'all' ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text'}`}>All</button>
          <button onClick={() => unit && setScope('usable')} disabled={!unit} className={`px-2 py-0.5 border-l border-game-border ${usable ? 'bg-game-primary/20 text-game-text' : unit ? 'text-game-text-dim hover:text-game-text' : 'text-game-muted cursor-not-allowed'}`}>{unit ? `${unit.name.split(' ')[0]} can use` : 'Usable'}</button>
        </div>
      </div>

      {/* tri-state type filters: off → include (✓) → exclude (✕) */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const st = filters[f.key]
          return (
            <button
              key={f.key}
              onClick={() => cycle(f.key)}
              title={`${f.label}: ${st}`}
              className={[
                'flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] transition-colors',
                st === 'include' ? 'border-game-green/60 bg-game-green/10 text-game-green'
                  : st === 'exclude' ? 'border-red-500/60 bg-red-500/10 text-red-300 line-through'
                  : 'border-game-border text-game-text-dim hover:text-game-text',
              ].join(' ')}
            >
              <span>{st === 'include' ? '✓' : st === 'exclude' ? '✕' : f.icon}</span>
              {f.label}
            </button>
          )
        })}
      </div>

      {ITEM_CATEGORIES.map((cat) => {
        if (!visible(filterKeyOf(cat))) return null
        let items = equipment.filter((e) => e.category === cat)
        if (usable && unit) items = items.filter((it) => canUse(it, unit))
        if (items.length === 0) return null
        const slot = CAT_SLOT[cat]
        const currentId = unit && slot ? (slot === 'mainHand' ? unit.weaponSets[unit.activeWeaponSet].mainHand : unit.equipment[slot as keyof typeof unit.equipment]) : null
        const current = currentId ? equipment.find((e) => e.id === currentId) ?? null : null
        const isCollapsed = collapsed.has(cat)
        return (
          <div key={cat}>
            <button onClick={() => toggle(cat)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-game-text-dim hover:text-game-text py-1">
              <span className="w-3 text-center">{isCollapsed ? '▸' : '▾'}</span>
              <span>{CATEGORY_LABELS[cat]}</span>
              <span className="text-game-muted normal-case tracking-normal">({items.length})</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const worn = current?.id === it.id
                  const rel = unit && slot && !worn ? relativeDeltas(it, current) : []
                  return (
                    <div key={it.id} className="rounded-md border border-game-border bg-game-bg px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-game-text font-medium truncate flex-1">{it.name}</span>
                        {it.slots ? <span className="text-[9px] text-game-text-dim" title={`${it.slots} card sockets`}>◳{it.slots}</span> : null}
                        {unit && slot && (worn
                          ? <span className="text-[10px] text-game-primary shrink-0">worn</span>
                          : <button onClick={() => equipItem(unit.id, slot, it.id)} className="text-[10px] px-1.5 py-0.5 rounded border border-game-primary/50 text-game-text hover:bg-game-primary/15 shrink-0">equip ›</button>)}
                      </div>
                      <TraitRow traits={objectiveChips(it)} className="mt-1" />
                      {rel.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {rel.map((x) => (
                            <span key={x.l} className={`text-[11px] font-mono ${x.d > 0 ? 'text-game-green' : 'text-red-400'}`}>{x.d > 0 ? '+' : ''}{x.d} {x.l}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {visible('material') && mats.length > 0 && (
        <div>
          <button onClick={() => toggle('__mats')} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-game-text-dim hover:text-game-text py-1">
            <span className="w-3 text-center">{collapsed.has('__mats') ? '▸' : '▾'}</span>
            <span>{usable ? 'Consumables' : 'Materials & consumables'}</span>
            <span className="text-game-muted normal-case tracking-normal">({mats.length})</span>
          </button>
          {!collapsed.has('__mats') && (
            <div className="grid grid-cols-2 gap-1">
              {mats.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5 rounded border border-game-border bg-game-bg px-2 py-1" title={m.description}>
                  <span className="text-xs text-game-text truncate flex-1">{m.name}</span>
                  <span className="text-[10px] text-game-text-dim tabular-nums">×{m.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ProtoLens shell ─────────────────────────────────────────────────────────--
export function ProtoLens() {
  const units            = useGameStore((s) => s.units)
  const equipment        = useGameStore((s) => s.equipment)
  const locations        = useGameStore((s) => s.locations)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const selectedLocId    = useGameStore((s) => s.selectedLocationId)

  const [top, setTop] = useState<Top>('location')
  const [heroSub, setHeroSub] = useState<HeroSub>('summary')

  // Selecting a hero (roster or the Party matrix) drills into the Hero tab.
  const heroId = selectedUnitIds[0] ?? null
  const prevHero = useRef<string | null>(null)
  useEffect(() => {
    if (prevHero.current !== heroId && heroId) setTop('hero')
    prevHero.current = heroId
  }, [heroId])

  const unit = units.find((u) => u.id === selectedUnitIds[0]) ?? null
  const location = selectedLocId ? locations.find((l) => l.id === selectedLocId) ?? null : null

  // Party = the party currently on the focused battlefield (empty → matrix shows
  // a prompt to deploy / focus a location).
  const squad = location ? units.filter((u) => u.locationId === location.id) : []

  return (
    <div className="h-full flex flex-col bg-game-surface/40 min-h-0">
      <div className="shrink-0 flex border-b border-game-border bg-game-surface/60">
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            aria-label={t.label}
            onClick={() => setTop(t.id)}
            className={[
              'flex-1 flex flex-col items-center gap-0.5 py-1.5 transition-colors relative',
              top === t.id ? 'text-game-primary' : 'text-game-muted hover:text-game-text-dim',
            ].join(' ')}
          >
            <span className="text-sm leading-none">{t.icon}</span>
            <span className="text-[9px] font-medium">{t.label}</span>
            {top === t.id && <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-game-primary" />}
          </button>
        ))}
      </div>

      {/* Hero sub-tabs only appear on the Hero altitude. */}
      {top === 'hero' && unit && (
        <div className="shrink-0 flex gap-1 px-3 py-1.5 border-b border-game-border/60 bg-game-bg/30">
          {HERO_SUBS.map((s) => (
            <button
              key={s.id}
              onClick={() => setHeroSub(s.id)}
              className={['text-[11px] px-2 py-0.5 rounded-full transition-colors',
                heroSub === s.id ? 'bg-game-primary/20 text-game-text border border-game-primary/40' : 'text-game-text-dim hover:text-game-text border border-transparent'].join(' ')}
            >{s.label}</button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {top === 'hero' && (unit ? (
          <>
            <BattleStatus unit={unit} />
            {heroSub === 'summary' && <SummaryLens unit={unit} ds={getDerivedStats(unit, equipment)} />}
            {heroSub === 'gear'    && <GearLens unit={unit} />}
            {heroSub === 'tactics' && <TacticianLens unit={unit} />}
            {heroSub === 'saga'    && <SagaLens unit={unit} />}
          </>
        ) : <Empty icon="◈" title="Select a hero" sub="Pick a hero from the roster to see their dossier." />)}

        {top === 'location' && (location
          ? <LocationDetail location={location} />
          : <Empty icon="⌖" title="No location focused" sub="Tap a location on the map (or zoom into the locale) to manage it." />)}

        {top === 'party' && <ArmyMatrix squad={squad} locationName={location?.name ?? 'No battlefield focused'} />}

        {top === 'items' && <ItemsLens unit={unit} />}
      </div>
    </div>
  )
}

function Empty({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center">
      <div>
        <div className="text-4xl mb-2 opacity-40">{icon}</div>
        <div className="text-sm text-game-text-dim">{title}</div>
        <div className="text-xs text-game-muted mt-1 max-w-[16rem]">{sub}</div>
      </div>
    </div>
  )
}
