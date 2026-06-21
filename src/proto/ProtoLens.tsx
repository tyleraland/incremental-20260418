import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useGameStore, getDerivedStats, getInitials, getItemTraits, getAvailableSkills, SKILL_REGISTRY,
  TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS, MAX_PARTY_TACTICS, SKILL_TACTICS, inheritedTacticIds,
  MONSTER_REGISTRY,
  type Unit, type DerivedStats,
} from '@/stores/useGameStore'
import { SLOT_LABELS, SLOT_COMPATIBLE, CATEGORY_LABELS } from '@/data/equipment'
import { getUnitTraits } from '@/data/traits'
import { TraitRow } from '@/components/TraitBubble'
import { ACTION_SLOT_COUNT } from '@/types'
import type { EquipSlot, EquipmentItem, WeaponRecord, ItemCategory, Trait, ActionSlotEntry } from '@/types'
import { useProtoStore } from './protoStore'
import { GOLD_ID, materialValue, equipmentValue } from './economy'
import { SocketPips, socketsOf } from './CardBits'
import { PackStrip } from './PackStrip'
import { seedProtoMocks } from './seed'
import { StatsTab, DebugTab, StatusList } from '@/components/BattleView'
import { MonsterCodex } from '@/components/MonsterCodex'
import { LocationDetail } from './LocationDetail'

// ── Prototype Lens ─────────────────────────────────────────────────────────────
//
// The always-on right half. Tabs, in altitude order:
//   Location — the focused site's heroes, quest board, and inhabitants
//   Party    — the party on this battlefield (doctrine + gear matrix)
//   Hero     — one hero (Summary / Gear / Saga / Tactics + battlefield status)
//   Items    — the guild's whole stash, with per-hero equip diffs (n=all ↔ n=1)
//   World    — deploy / roster overview
// Default = Location (first screen is a battlefield). Selecting a hero (roster or
// matrix) drills to Hero; otherwise the tabs are manual — the stage's zoom slider
// drives navigation, not the lens.

// Skills & Tactics are now top-level (sit beside Location / Equipment); Party
// moved to the global top nav (it spans multiple units). Equipment (the gutted
// "Items") is this hero's gear + personal inventory.
type Top = 'location' | 'hero' | 'equipment' | 'skills' | 'tactics'
type HeroSub = 'stats' | 'pet'
const TOP_TABS: { id: Top; label: string; icon: string }[] = [
  { id: 'location',  label: 'Location',  icon: '⌖' },
  { id: 'hero',      label: 'Hero',      icon: '◈' },
  { id: 'equipment', label: 'Equipment', icon: '🎒' },
  { id: 'skills',    label: 'Skills',    icon: '✦' },
  { id: 'tactics',   label: 'Tactics',   icon: '☷' },
]
// The hero's whole dossier is one container (UnitLens); a Pet sub appears only
// once a hero has a beast companion.
const HERO_SUBS: { id: HeroSub; label: string }[] = [
  { id: 'stats', label: 'Stats' },
]
const PET_SUB: { id: HeroSub; label: string } = { id: 'pet', label: 'Pet' }

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const CHANNELS: { id: string; label: string }[] = [
  { id: 'movement', label: 'Movement' }, { id: 'targeting', label: 'Targeting' },
  { id: 'action', label: 'Action' }, { id: 'reaction', label: 'Reaction' }, { id: 'passive', label: 'Passive' },
]

// ── Shared bits for the compact Unit card ──────────────────────────────────────
// A space-efficient bar with the value printed on it.
function StatBar({ label, cur, max, color }: { label: string; cur: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (cur / max) * 100 : 0)
  return (
    <div className="relative h-4 rounded-full bg-game-border overflow-hidden">
      <div className={`absolute inset-y-0 left-0 ${color}`} style={{ width: `${pct}%`, transition: 'width 380ms linear' }} />
      <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-medium">
        <span className="text-white/90" style={{ textShadow: '0 1px 2px rgba(0,0,0,.7)' }}>{label}</span>
        <span className="text-white/90 tabular-nums" style={{ textShadow: '0 1px 2px rgba(0,0,0,.7)' }}>{Math.floor(cur)} / {max}</span>
      </div>
    </div>
  )
}

// The action bar as a 2×3 grid: each slot's name above a cooldown bar (skills) +
// time remaining. Consumables/items show as labels; empty slots are dashed.
type GridCell = { empty?: boolean; name: string; icon?: string; bar?: { frac: number; time: string } }
function CooldownGrid({ cells }: { cells: GridCell[] }) {
  if (cells.length === 0) return null
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cells.map((cell, i) => cell.empty ? (
        <div key={i} className="rounded-md border border-dashed border-game-border/50 min-h-[2.6rem]" />
      ) : (
        <div key={i} className="rounded-md border border-game-border bg-game-bg px-1.5 py-1 min-h-[2.6rem] flex flex-col justify-center">
          <div className="text-[10px] text-game-text truncate leading-tight">{cell.icon ? `${cell.icon} ` : ''}{cell.name}</div>
          {cell.bar && (
            <>
              <div className="h-1 rounded-sm bg-black/50 overflow-hidden my-0.5"><div className={`h-full ${cell.bar.frac >= 1 ? 'bg-emerald-400' : 'bg-sky-500/80'}`} style={{ width: `${cell.bar.frac * 100}%`, transition: 'width 380ms linear' }} /></div>
              <div className="text-[9px] text-game-text-dim text-right tabular-nums leading-none">{cell.bar.time}</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Hero lens (the Hero tab) ───────────────────────────────────────────────────--
// Combat-first: identity + statuses, the action bar with cooldowns, vitals, then
// the COMBAT STATS (derived) in the upper section and the UPGRADEABLE abilities
// lower. A link opens the roomy Hero Detail.
function HeroLens({ unit }: { unit: Unit }) {
  const equipment = useGameStore((s) => s.equipment)
  const miscItems = useGameStore((s) => s.miscItems)
  const spendAbilityPoint = useGameStore((s) => s.spendAbilityPoint)
  const battle = useGameStore((s) => (unit.locationId ? s.battles[unit.locationId] : undefined))

  const ds = getDerivedStats(unit, equipment)
  const c = battle?.combatants.find((x) => x.id === unit.id)
  const live = !!(c && battle)
  const hp = c ? c.hp : unit.health
  const maxHp = c ? c.maxHp : ds.maxHp
  const traits = getUnitTraits(unit)

  // Action bar → grid cells (skills carry a live cooldown bar; otherwise rdy).
  const slots = unit.actionSlots ?? Array<ActionSlotEntry | null>(ACTION_SLOT_COUNT).fill(null)
  const cells: GridCell[] = slots.map((e) => {
    if (!e) return { empty: true, name: '' }
    if (e.kind === 'skill') {
      const liveSkill = c?.skills.find((s) => s.id === e.id)
      const left = liveSkill ? (c!.skillCooldowns[e.id] ?? 0) : 0
      const cd = liveSkill?.cooldown ?? 1
      const ready = left <= 0
      return { name: SKILL_REGISTRY[e.id]?.name ?? e.id, bar: { frac: ready ? 1 : 1 - left / Math.max(1, cd), time: ready ? 'rdy' : String(left) } }
    }
    if (e.kind === 'consumable') return { name: miscItems.find((m) => m.id === e.id)?.name ?? e.id, icon: '🫙' }
    return { name: equipment.find((it) => it.id === e.id)?.name ?? e.id, icon: '⚔' }
  })

  const combatStats: [string, number][] = [
    ['ATK', ds.attack], ['DEF', ds.defense], ['M.ATK', ds.magicAttack], ['M.DEF', ds.magicDefense],
    ['SPD', ds.attackSpeed], ['ACC', ds.accuracy], ['DODGE', ds.dodge], ['RANGE', ds.attackRange],
  ]
  const abilities: [keyof Unit['abilities'], string][] = [
    ['strength', 'STR'], ['agility', 'AGI'], ['dexterity', 'DEX'], ['constitution', 'CON'], ['intelligence', 'INT'],
  ]

  return (
    <div className="space-y-3">
      {/* Identity + follow now live in the persistent HeroScopeBar above; the card
          opens straight onto the action bar. Live statuses still surface here. */}
      {live && c!.statuses.length > 0 && <StatusList statuses={c!.statuses} />}

      <CooldownGrid cells={cells} />

      <div className="space-y-1.5">
        <StatBar label="HP" cur={hp} max={maxHp} color="bg-game-green" />
        <StatBar label="EXP" cur={unit.exp} max={unit.expToNext} color="bg-game-accent" />
      </div>

      {/* Upper: combat (derived) stats */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Combat stats</div>
        <div className="grid grid-cols-4 gap-1.5">
          {combatStats.map(([label, v]) => (
            <div key={label} className="rounded-lg bg-game-bg border border-game-border py-1.5 flex flex-col items-center">
              <span className="text-[9px] text-game-text-dim">{label}</span>
              <span className="text-sm font-semibold text-game-text tabular-nums leading-none mt-0.5">{Math.round(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lower: upgradeable abilities */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Upgradeable</span>
          {unit.abilityPoints > 0 && <span className="text-[10px] text-game-gold">{unit.abilityPoints} pts to spend</span>}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {abilities.map(([k, label]) => (
            <button
              key={k}
              disabled={unit.abilityPoints <= 0}
              onClick={() => spendAbilityPoint(unit.id, k)}
              className={['rounded-lg border py-1.5 flex flex-col items-center transition-colors',
                unit.abilityPoints > 0 ? 'border-game-gold/40 hover:bg-game-gold/10 cursor-pointer' : 'border-game-border cursor-default'].join(' ')}
            >
              <span className="text-[9px] text-game-text-dim">{label}</span>
              <span className="text-base font-semibold text-game-text leading-none">{unit.abilities[k]}</span>
              {unit.abilityPoints > 0 && <span className="text-[8px] text-game-gold leading-none mt-0.5">＋</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Traits — folded in from the retired Hero Detail overlay so the lens is the
          single hero deep-dive (nothing lost). */}
      {traits.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Traits</div>
          <div className="flex flex-wrap gap-1.5">
            {traits.map((t) => (
              <span key={t.id} title={t.description} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60">{t.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Persistent hero scope-bar ──────────────────────────────────────────────────
// One identity strip that rides above the four hero-scoped tabs (Hero / Equipment
// / Skills / Tactics) so it's always obvious WHOSE dossier you're editing as you
// switch tabs — the lens's answer to "wait, whose stats are these?". Owns the
// avatar, name/level/HP, and the camera-follow toggle (lifted out of HeroLens).
function HeroScopeBar({ unit }: { unit: Unit }) {
  const equipment = useGameStore((s) => s.equipment)
  const battle = useGameStore((s) => (unit.locationId ? s.battles[unit.locationId] : undefined))
  const battleFollowId = useGameStore((s) => s.battleFollowId)
  const ds = getDerivedStats(unit, equipment)
  const c = battle?.combatants.find((x) => x.id === unit.id)
  const live = !!(c && battle)
  const hp = c ? c.hp : unit.health
  const maxHp = c ? c.maxHp : ds.maxHp
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const following = battleFollowId === unit.id
  const ring = `conic-gradient(${hpPct > 60 ? '#10b981' : hpPct > 30 ? '#f59e0b' : '#ef4444'} ${hpPct}%, #2a2a3a 0)`
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-game-border/60 bg-game-bg/40">
      <div className="relative w-7 h-7 rounded-full p-[2px] shrink-0" style={{ background: ring }}>
        <div className="w-full h-full rounded-full bg-game-surface border border-game-border flex items-center justify-center text-xs">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-game-text leading-none truncate">{unit.name}</div>
        <div className="text-[10px] text-game-text-dim leading-none mt-0.5 truncate">
          Lv {unit.level} · {unit.class ?? 'Novice'} · {Math.round(hp)}/{Math.round(maxHp)} HP
        </div>
      </div>
      {live && (
        <button
          onClick={() => useGameStore.setState({ battleFollowId: following ? null : unit.id })}
          title="Lock the camera onto this hero"
          className={`ml-auto shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${following ? 'border-game-accent/60 bg-game-accent/15 text-game-accent' : 'border-game-border text-game-text-dim hover:text-game-text'}`}
        >🎥 {following ? 'Following' : 'Follow'}</button>
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

// ── Equip safety (mirrors production Inventory) ───────────────────────────────
// Class/level gates lock an item with a reason; gear already reserved (worn or
// sideboarded) by *another* hero is hidden from the picker entirely. The hero's
// own worn/reserved gear stays visible so it can be swapped freely.
function equipRestriction(it: EquipmentItem, unit: Unit): string | null {
  if (it.requiredLevel && unit.level < it.requiredLevel) return `Lv ${it.requiredLevel}`
  if (it.requiredClasses && !it.requiredClasses.includes(unit.class ?? 'Novice')) return `${it.requiredClasses.join(' / ')} only`
  return null
}
function reservedByOthers(units: Unit[], unitId: string): Set<string> {
  const reserved = new Set<string>()
  for (const o of units) {
    if (o.id === unitId) continue
    const refs = [
      o.weaponSets[0].mainHand, o.weaponSets[0].offHand,
      o.weaponSets[1].mainHand, o.weaponSets[1].offHand,
      o.equipment.armor, o.equipment.accessory, o.equipment.sideboard1, o.equipment.sideboard2,
    ]
    for (const id of refs) if (id) reserved.add(id)
  }
  return reserved
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

// ── Swap menu (full-cover) ────────────────────────────────────────────────────
// The relative-bonus comparison for one slot, as a menu that covers the screen
// top-to-bottom (a portal) rather than an inline expand — tap a candidate to see
// how it moves this hero's stats and equip it.
function SwapMenu({ unit, slot, onClose }: { unit: Unit; slot: EquipSlot; onClose: () => void }) {
  const equipment = useGameStore((s) => s.equipment)
  const equipItem = useGameStore((s) => s.equipItem)
  const units     = useGameStore((s) => s.units)
  const base = getDerivedStats(unit, equipment)
  const currentId = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
  const current = equipment.find((e) => e.id === currentId)
  const reserved = reservedByOthers(units, unit.id)
  const candidates = equipment.filter((e) => SLOT_COMPATIBLE[slot].includes(e.category) && (e.id === current?.id || !reserved.has(e.id)))
  const doEquip = (id: string | null) => { equipItem(unit.id, slot, id); onClose() }
  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">{SLOT_LABELS[slot]}</span>
        <span className="text-[10px] text-game-muted">— {unit.name} · relative bonuses</span>
        <button onClick={onClose} className="ml-auto flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 max-w-xl w-full mx-auto space-y-1.5">
        {current && (
          <button onClick={() => doEquip(null)} className="w-full rounded-md border border-game-border/60 bg-game-bg px-2.5 py-2 text-left hover:border-red-500/50">
            <div className="flex items-center justify-between mb-1"><span className="text-xs text-game-text-dim italic">Unequip {current.name}</span><span className="text-[10px] text-red-300">remove</span></div>
            <DeltaChips before={base} after={getDerivedStats(withItem(unit, slot, null), equipment)} />
          </button>
        )}
        {candidates.length === 0 && <div className="text-xs text-game-muted italic px-1">No compatible items in the stash.</div>}
        {candidates.map((it) => {
          const equipped = current?.id === it.id
          const restriction = equipped ? null : equipRestriction(it, unit)
          const locked = !!restriction
          const after = getDerivedStats(withItem(unit, slot, it.id), equipment)
          return (
            <button key={it.id} disabled={locked} onClick={() => !locked && doEquip(it.id)}
              className={['w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                equipped ? 'border-game-primary/60 bg-game-primary/10' : locked ? 'border-game-border/40 bg-game-bg/40 opacity-50 cursor-not-allowed' : 'border-game-border bg-game-bg hover:border-game-primary/50'].join(' ')}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-game-text font-medium truncate">{it.name}</span>
                {equipped ? <span className="text-[10px] text-game-primary shrink-0">equipped</span> : locked ? <span className="text-[10px] text-game-muted shrink-0">{restriction}</span> : <span className="text-[10px] text-game-text-dim shrink-0">equip ›</span>}
              </div>
              {equipped ? <span className="text-[10px] text-game-muted">currently worn</span> : locked ? <span className="text-[10px] text-game-muted italic">can't equip</span> : <DeltaChips before={base} after={after} />}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

// ── Equipment lens (gutted "Items") — this hero's gear + personal inventory ────--
// Equipped slots (with socket pips), the personal pack, and what they carry into
// battle. Tapping a slot opens the full-cover relative-bonus SwapMenu.
function EquipmentLens({ unit }: { unit: Unit }) {
  const equipment = useGameStore((s) => s.equipment)
  const miscItems = useGameStore((s) => s.miscItems)
  const sockets   = useProtoStore((s) => s.sockets)
  const [swapSlot, setSwapSlot] = useState<EquipSlot | null>(null)

  const itemFor = (slot: EquipSlot): EquipmentItem | undefined => {
    const id = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
    return equipment.find((e) => e.id === id)
  }
  const mainHand = equipment.find((e) => e.id === unit.weaponSets[unit.activeWeaponSet].mainHand)

  // Personal inventory carried into battle: action-bar consumables + staged items.
  const carried = (unit.actionSlots ?? []).filter((e): e is ActionSlotEntry => !!e && (e.kind === 'consumable' || e.kind === 'item'))
  const carriedLabel = (e: ActionSlotEntry) => e.kind === 'consumable' ? (miscItems.find((m) => m.id === e.id)?.name ?? e.id) : (equipment.find((i) => i.id === e.id)?.name ?? e.id)

  return (
    <div className="space-y-4">
      <PackStrip unit={unit} />

      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Equipped</div>
        <div className="grid grid-cols-2 gap-1.5">
          {GEAR_SLOTS.map((slot) => {
            const it = itemFor(slot)
            const locked = slot === 'offHand' && mainHand?.category === 'weapon-2h'
            const isSide = slot === 'sideboard1' || slot === 'sideboard2'
            return (
              <button key={slot} disabled={locked} onClick={() => setSwapSlot(slot)}
                className={['rounded-lg border p-2 text-left transition-colors',
                  locked ? 'border-game-border opacity-40' : isSide ? 'border-game-border/60 bg-game-bg/40 hover:border-game-primary/50' : 'border-game-border hover:border-game-primary/50'].join(' ')}>
                <div className="text-[9px] uppercase tracking-wider text-game-text-dim">{SLOT_LABELS[slot]}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={['text-xs leading-snug min-w-0 truncate', it ? 'text-game-text font-medium' : 'text-game-muted italic'].join(' ')}>{locked ? '2H locked' : it?.name ?? 'empty'}</span>
                  {it && <SocketPips slots={socketsOf(sockets, it)} className="shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>
        <div className="text-[10px] text-game-muted italic mt-1.5">Tap a slot to compare gear (opens a full menu with the stat impact).</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Carried <span className="text-game-muted normal-case tracking-normal">— into battle</span></div>
        {carried.length === 0 ? (
          <div className="text-[11px] text-game-muted italic">Nothing staged. Add consumables/items on the Skills bar.</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {carried.map((e, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60">{e.kind === 'consumable' ? '🫙 ' : '⚔ '}{carriedLabel(e)}</span>
            ))}
          </div>
        )}
      </div>

      {swapSlot && <SwapMenu unit={unit} slot={swapSlot} onClose={() => setSwapSlot(null)} />}
    </div>
  )
}

// ── Tactician lens (single hero) ──────────────────────────────────────────────
// Mirrors the production Tactics tab: an editable party doctrine (shared, capped),
// the hero's manual per-channel priority list, and the tactics inherited free from
// equipped skills (decouple-able). Only skills change numbers — tactics are pure
// behaviour, so everything here is a reorder/equip/decouple.
function TacticianLens({ unit }: { unit: Unit }) {
  const moveTactic    = useGameStore((s) => s.moveTactic)
  const equipTactic   = useGameStore((s) => s.equipTactic)
  const unequipTactic = useGameStore((s) => s.unequipTactic)
  const toggleInherited = useGameStore((s) => s.toggleInheritedTactic)
  const [adding, setAdding] = useState(false)

  const equippedIds = new Set(unit.tactics.map((t) => t.id))
  const byChannel = (ch: string) => unit.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === ch)
  const atCap = unit.tactics.length >= MAX_UNIT_TACTICS

  // Tactics granted free by equipped (action-bar) skills — shown separately and
  // decouple-able; excluded from the manual "add" catalog so they're not dupes.
  const equippedSkillIds = (unit.actionSlots ?? []).filter((e): e is ActionSlotEntry => e?.kind === 'skill').map((e) => e.id)
  const suppressed = new Set(unit.suppressedTactics ?? [])
  const grantedBy: Record<string, string[]> = {}
  for (const sid of equippedSkillIds) for (const tid of SKILL_TACTICS[sid] ?? []) (grantedBy[tid] ??= []).push(SKILL_REGISTRY[sid]?.name ?? sid)
  const inherited = inheritedTacticIds(equippedSkillIds).filter((id) => !equippedIds.has(id))
  const available = listTactics('unit').filter((d) => !equippedIds.has(d.id) && !(d.id in grantedBy))

  return (
    <div className="space-y-4">
      <PartyDoctrine />

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

      {inherited.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Inherited from skills</span>
            <span className="text-[9px] text-game-muted">free · auto</span>
          </div>
          <div className="space-y-1">
            {inherited.map((id) => {
              const def = TACTIC_REGISTRY[id]
              if (!def) return null
              const off = suppressed.has(id)
              const sources = (grantedBy[id] ?? []).join(', ')
              return (
                <div key={id} className={['flex items-start gap-1.5 rounded-md border border-dashed px-2 py-1.5',
                  off ? 'border-game-border bg-game-bg/40 opacity-60' : 'border-amber-400/40 bg-amber-400/5'].join(' ')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={['text-xs font-medium', off ? 'text-game-muted line-through' : 'text-game-text'].join(' ')}>{def.name}</span>
                      <span className="text-[8px] px-1 rounded border border-amber-400/40 text-amber-300/90">from {sources}</span>
                    </div>
                    <div className="text-[10px] text-game-text-dim leading-snug">{def.description}</div>
                  </div>
                  <button
                    onClick={() => toggleInherited(unit.id, id)}
                    title={off ? `Re-couple ${def.name}` : `Decouple ${def.name}`}
                    className={['shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs', off ? 'bg-game-green/15 text-game-green' : 'bg-amber-500/15 text-amber-300'].join(' ')}
                  >{off ? '+' : '−'}</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

// Party doctrine — shared tactics applied to every deployed hero. Editable here
// (equip/unequip, capped at MAX_PARTY_TACTICS) since the party screen and the
// hero's Tactics lens are the two places you tune combat behaviour.
function PartyDoctrine() {
  const partyTactics      = useGameStore((s) => s.partyTactics)
  const equipPartyTactic  = useGameStore((s) => s.equipPartyTactic)
  const unequipPartyTactic = useGameStore((s) => s.unequipPartyTactic)
  const [adding, setAdding] = useState(false)

  const equippedIds = new Set(partyTactics.map((t) => t.id))
  const available = listTactics('party').filter((d) => !equippedIds.has(d.id))
  const atCap = partyTactics.length >= MAX_PARTY_TACTICS

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Party doctrine</span>
        <span className="text-[9px] text-game-muted">{partyTactics.length}/{MAX_PARTY_TACTICS} · all deployed</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {partyTactics.map((t) => {
          const def = TACTIC_REGISTRY[t.id]
          return (
            <span key={t.id} className="flex items-center gap-1 text-[11px] pl-2 pr-1 py-1 rounded-md border border-game-secondary/40 bg-game-secondary/10 text-game-text" title={def?.description}>
              {def?.name ?? t.id}
              <button onClick={() => unequipPartyTactic(t.id)} className="text-game-muted hover:text-red-300" aria-label="Remove party tactic">✕</button>
            </span>
          )
        })}
        {!atCap && available.length > 0 && (
          <button onClick={() => setAdding((v) => !v)} className="text-[11px] px-2 py-1 rounded-md border border-game-secondary/40 text-game-text-dim hover:text-game-text hover:bg-game-secondary/10">
            {adding ? 'Close' : '＋ Doctrine'}
          </button>
        )}
      </div>
      {adding && !atCap && (
        <div className="mt-1.5 space-y-1 max-h-36 overflow-y-auto">
          {available.map((def) => (
            <button
              key={def.id}
              onClick={() => { equipPartyTactic(def.id); setAdding(false) }}
              className="w-full text-left rounded-md border border-game-border bg-game-bg px-2 py-1.5 hover:border-game-secondary/50"
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
  )
}

// ── Pet lens (beast companion) ────────────────────────────────────────────────
// Surfaces only once a hero learns Beast Companion. Statline scales with the
// hero's level (kept in sync with companionToEngineInput); tactics use the same
// per-channel priority rules as a hero's (pets have no skills, so no inherited).
function CompanionLens({ unit }: { unit: Unit }) {
  const equipCompanionTactic   = useGameStore((s) => s.equipCompanionTactic)
  const unequipCompanionTactic = useGameStore((s) => s.unequipCompanionTactic)
  const moveCompanionTactic    = useGameStore((s) => s.moveCompanionTactic)
  const [adding, setAdding] = useState(false)
  const comp = unit.companion
  if (!comp) return null

  const lv = Math.max(1, unit.level)
  const stats: [string, number][] = [['HP', 50 + 14 * lv], ['ATK', 7 + 2 * lv], ['DEF', 3 + lv]]
  const equipped = comp.tactics
  const equippedIds = new Set(equipped.map((t) => t.id))
  const byChannel = (ch: string) => equipped.filter((t) => TACTIC_REGISTRY[t.id]?.channel === ch)
  const available = listTactics('unit').filter((d) => !equippedIds.has(d.id))
  const atCap = equipped.length >= MAX_UNIT_TACTICS

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none">🐺</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-game-text truncate">{comp.name}</div>
          <div className="text-[11px] text-game-text-dim">Beast companion · scales with you (Lv {lv})</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-game-bg border border-game-border py-1.5 flex flex-col items-center">
            <span className="text-sm font-semibold text-game-text tabular-nums leading-none">{v}</span>
            <span className="text-[9px] text-game-text-dim mt-0.5">{k}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-game-muted leading-snug">Fights at your side on a short leash; rejoins when you next deploy. Levels with you (a dedicated pet XP track is coming).</p>

      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Pet tactics</span>
        <span className="text-[10px] text-game-text-dim">{equipped.length}/{MAX_UNIT_TACTICS}</span>
      </div>
      {equipped.length === 0 ? (
        <p className="text-[11px] text-game-muted italic">No tactics — the pet just holds and bites the nearest foe.</p>
      ) : (
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
                          <div className="text-xs font-medium text-game-text">{def?.name ?? t.id}</div>
                          <div className="text-[10px] text-game-text-dim leading-snug">{def?.description}</div>
                        </div>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button onClick={() => moveCompanionTactic(unit.id, t.id, -1)} className="w-5 h-4 rounded bg-game-border/60 text-[9px] text-game-text-dim hover:text-game-text leading-none">▲</button>
                          <button onClick={() => moveCompanionTactic(unit.id, t.id, 1)} className="w-5 h-4 rounded bg-game-border/60 text-[9px] text-game-text-dim hover:text-game-text leading-none">▼</button>
                        </div>
                        <button onClick={() => unequipCompanionTactic(unit.id, t.id)} className="text-game-muted hover:text-red-300 text-xs shrink-0 pt-0.5">✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
                onClick={() => { equipCompanionTactic(unit.id, def.id); setAdding(false) }}
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

// ── Skills lens (bottom = quick decisions: the action bar) ────────────────────--
// Assign learned active skills to the 6-slot action bar — the loadout the hero
// casts in battle. Learning new skills / spending points is "research" and lives
// in the top stage overlay (Skill tree ▸), so you can tweak the bar while the
// fight plays — the shell's "decisions in the lens, details/research on top" split.
function SkillsLens({ unit }: { unit: Unit }) {
  const setActionSlot   = useGameStore((s) => s.setActionSlot)
  const equipment       = useGameStore((s) => s.equipment)
  const miscItems       = useGameStore((s) => s.miscItems)
  const units           = useGameStore((s) => s.units)
  const openStageOverlay = useProtoStore((s) => s.openStageOverlay)
  const [slotIdx, setSlotIdx] = useState<number | null>(null)

  const slots = unit.actionSlots ?? Array<ActionSlotEntry | null>(ACTION_SLOT_COUNT).fill(null)
  const onBar = new Set(slots.filter((e): e is ActionSlotEntry => !!e && e.kind === 'skill').map((e) => e.id))
  const itemsOnBar = new Set(slots.filter((e): e is ActionSlotEntry => !!e && e.kind === 'item').map((e) => e.id))
  const consumablesOnBar = new Set(slots.filter((e): e is ActionSlotEntry => !!e && e.kind === 'consumable').map((e) => e.id))
  // Learned ACTIVE skills are the assignable pool (passives are always-on).
  const learnedActive = getAvailableSkills(unit).filter((e) => e.current > 0 && e.skill.type === 'active')
  const pool = learnedActive.filter((e) => !onBar.has(e.skill.id))
  // Items the hero can stage on the bar — reserved into the sideboard (stat-
  // inactive) so they're carried, not worn. Hide gear another hero holds.
  const reserved = reservedByOthers(units, unit.id)
  const itemPool = equipment.filter((it) => canUse(it, unit) && !reserved.has(it.id) && !itemsOnBar.has(it.id))
  // Consumables (potions/food) the hero can carry on the bar to use in battle.
  const consumablePool = miscItems.filter((i) => i.kind === 'consumable' && i.quantity > 0 && !consumablesOnBar.has(i.id))

  function label(e: ActionSlotEntry | null): string {
    if (!e) return ''
    if (e.kind === 'skill') return SKILL_REGISTRY[e.id]?.name ?? e.id
    if (e.kind === 'consumable') return miscItems.find((i) => i.id === e.id)?.name ?? 'item'
    return equipment.find((it) => it.id === e.id)?.name ?? 'item'
  }

  return (
    <div className="space-y-3">
      {/* Entry to the skill tree (where points are spent / skills learned) */}
      <button
        onClick={() => openStageOverlay({ kind: 'skill-tree', unitId: unit.id })}
        className={['inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold text-sm transition-colors self-start',
          unit.skillPoints > 0 ? 'bg-game-gold text-game-bg hover:bg-game-gold/90 shadow' : 'bg-game-primary text-white hover:bg-game-primary/80 shadow'].join(' ')}
      >
        <span className="text-base leading-none">🌳</span> Skill Tree
        {unit.skillPoints > 0 && <span className="bg-black/20 rounded px-1.5 py-0.5 text-[11px] tabular-nums">{unit.skillPoints} pt</span>}
        <span className="opacity-70">▸</span>
      </button>

      <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Action bar — battle skills</div>

      <div className="grid grid-cols-3 gap-1.5">
        {slots.map((entry, i) => (
          <button
            key={i}
            onClick={() => setSlotIdx(slotIdx === i ? null : i)}
            className={['h-12 rounded-lg border flex items-center justify-center px-1 text-center transition-colors',
              slotIdx === i ? 'border-game-primary bg-game-primary/15'
                : entry ? 'border-game-border bg-game-bg hover:border-game-primary/50'
                : 'border-dashed border-game-border/60 bg-game-bg/40 hover:border-game-primary/40'].join(' ')}
          >
            <span className={['text-[11px] leading-tight', entry ? 'text-game-text font-medium' : 'text-game-muted'].join(' ')}>
              {entry ? label(entry) : '＋'}
            </span>
          </button>
        ))}
      </div>

      {slotIdx !== null && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Slot {slotIdx + 1} — skill, consumable, or item</div>
          <div className="space-y-1">
            {slots[slotIdx] && (
              <button onClick={() => { setActionSlot(unit.id, slotIdx, null); setSlotIdx(null) }}
                className="w-full text-left rounded-md border border-game-border/60 bg-game-bg px-2.5 py-1.5 text-xs text-game-text-dim italic hover:border-red-500/50">
                Clear slot
              </button>
            )}
            {pool.length === 0 && <div className="text-xs text-game-muted italic px-1">No more learned active skills — learn some in the Skill tree.</div>}
            {pool.map(({ skill, current }) => (
              <button
                key={skill.id}
                onClick={() => { setActionSlot(unit.id, slotIdx, { kind: 'skill', id: skill.id }); setSlotIdx(null) }}
                className="w-full text-left rounded-md border border-game-border bg-game-bg px-2.5 py-1.5 hover:border-game-primary/50"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-game-text">{skill.name}</span>
                  <span className="text-[9px] text-game-text-dim">Lv {current}</span>
                </div>
                <div className="text-[10px] text-game-text-dim leading-snug">{skill.description(current)}</div>
              </button>
            ))}
            {consumablePool.length > 0 && (
              <>
                <div className="text-[9px] uppercase tracking-widest text-game-muted pt-1.5 px-1">Consumables — carry to use in battle</div>
                {consumablePool.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setActionSlot(unit.id, slotIdx, { kind: 'consumable', id: c.id }); setSlotIdx(null) }}
                    className="w-full text-left rounded-md border border-game-border/70 bg-game-bg/60 px-2.5 py-1.5 hover:border-game-green/50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm leading-none">🫙</span>
                      <span className="text-xs font-medium text-game-text">{c.name}</span>
                      <span className="text-[9px] text-game-text-dim tabular-nums">×{c.quantity}</span>
                    </div>
                    {c.description && <div className="text-[10px] text-game-text-dim leading-snug truncate">{c.description}</div>}
                  </button>
                ))}
              </>
            )}
            {itemPool.length > 0 && (
              <>
                <div className="text-[9px] uppercase tracking-widest text-game-muted pt-1.5 px-1">Items — reserve to sideboard</div>
                {itemPool.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => { setActionSlot(unit.id, slotIdx, { kind: 'item', id: it.id }); setSlotIdx(null) }}
                    className="w-full text-left rounded-md border border-game-border/70 bg-game-bg/60 px-2.5 py-1.5 hover:border-game-secondary/50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-game-text">{it.name}</span>
                      <span className="text-[9px] text-game-muted">{CATEGORY_LABELS[it.category]}</span>
                    </div>
                    {it.description && <div className="text-[10px] text-game-text-dim leading-snug truncate">{it.description}</div>}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      {slotIdx === null && <div className="text-[10px] text-game-muted italic">Tap a slot to assign a skill, a consumable (carried to use in battle), or stage an item (reserved to the sideboard).</div>}
    </div>
  )
}

// ── Focus cue ─────────────────────────────────────────────────────────────────
// Whether the selected hero is on the battlefield you're currently viewing, with
// shortcuts: bring them HERE (deploy to the focused location) or JUMP the camera
// to where they are. Resolves the "I selected someone elsewhere" ambiguity.
function FocusCue({ unit, location }: { unit: Unit; location: { id: string; name: string } | null }) {
  const assignUnits = useGameStore((s) => s.assignUnits)
  const requestZoom = useProtoStore((s) => s.requestZoom)
  const here = !!location && unit.locationId === location.id
  // When the hero is on the viewed battlefield, say nothing (reclaim the space);
  // only surface the cue when they're elsewhere.
  if (here) return null
  function jump() {
    if (!unit.locationId) return
    useGameStore.setState({ selectedLocationId: unit.locationId, combatLocationId: unit.locationId, battleFollowId: unit.id })
    requestZoom(2)
  }
  return (
    <div className="mb-2 rounded-md border border-amber-600/40 bg-amber-950/20 px-2.5 py-1.5">
      <div className="text-[10px] text-amber-200/90">
        {unit.name.split(' ')[0]} is {unit.locationId ? 'elsewhere' : 'at the guild'}
        {location ? <> — you're viewing <span className="text-game-text">{location.name}</span></> : null}
      </div>
      <div className="flex gap-1.5 mt-1">
        {location && (
          <button onClick={() => assignUnits([unit.id], location.id)} className="text-[10px] px-2 py-0.5 rounded border border-game-primary/50 text-game-text hover:bg-game-primary/15">➤ Deploy here</button>
        )}
        {unit.locationId && (
          <button onClick={jump} className="text-[10px] px-2 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text">⌖ Jump to them</button>
        )}
      </div>
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

// Which hero (if any) holds each gear id — worn or reserved in a weapon set /
// sideboard. Drives "held by <hero>" labels and the equipped/unequipped filter.
function heldByMap(units: Unit[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const u of units) {
    const refs = [
      u.weaponSets[0].mainHand, u.weaponSets[0].offHand,
      u.weaponSets[1].mainHand, u.weaponSets[1].offHand,
      u.equipment.armor, u.equipment.accessory, u.equipment.sideboard1, u.equipment.sideboard2,
    ]
    for (const id of refs) if (id) m.set(id, u.name)
  }
  return m
}
type EquipFilter = 'both' | 'equipped' | 'unequipped'
const EQUIP_FILTER_NEXT: Record<EquipFilter, EquipFilter> = { both: 'equipped', equipped: 'unequipped', unequipped: 'both' }
const EQUIP_FILTER_LABEL: Record<EquipFilter, string> = { both: 'All', equipped: 'Held', unequipped: 'Free' }

// ── Foe card — a monster inspected on the battlefield, shown in the Unit tab ───--
function FoeCard({ locId, combatantId }: { locId: string; combatantId: string }) {
  const battle = useGameStore((s) => s.battles[locId])
  const monsterSeen = useGameStore((s) => s.monsterSeen)
  const [codex, setCodex] = useState(false)
  const c = battle?.combatants.find((x) => x.id === combatantId)
  if (!battle || !c) return <Empty icon="☠" title="Foe is gone" sub="This monster left the battlefield. Tap another, or pick a hero." />
  const monsterId = c.id.split('#')[0]
  const def = MONSTER_REGISTRY[monsterId]
  const cells: GridCell[] = c.skills.map((s) => {
    const left = c.skillCooldowns[s.id] ?? 0
    const ready = left <= 0
    return { name: s.name, bar: { frac: ready ? 1 : 1 - left / Math.max(1, s.cooldown), time: ready ? 'rdy' : String(left) } }
  })
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-red-200 truncate">{c.name}</span>
          {def && <span className="text-xs text-game-text-dim shrink-0">Lv {def.level}</span>}
          <span className={`text-[10px] uppercase tracking-wide shrink-0 ${c.provoked ? 'text-red-300' : 'text-amber-300'}`}>{c.alive ? (c.provoked ? 'hostile' : 'passive') : 'KO'}</span>
        </div>
        {c.statuses.length > 0 && <StatusList statuses={c.statuses} />}
      </div>

      <CooldownGrid cells={cells} />

      <StatBar label="HP" cur={c.hp} max={c.maxHp} color="bg-red-600" />

      {def && (
        <button onClick={() => setCodex(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-game-border text-sm text-game-text-dim hover:text-game-text hover:bg-white/5">📖 Codex Entry ▸</button>
      )}
      {codex && def && <MonsterCodex monster={def} seenCount={monsterSeen[monsterId] ?? 0} onClose={() => setCodex(false)} />}
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
  const markUnitViewed   = useGameStore((s) => s.markUnitViewed)
  const openReport       = useGameStore((s) => s.openReport)
  const selectedFoe      = useProtoStore((s) => s.selectedFoe)
  const clearFoe         = useProtoStore((s) => s.clearFoe)
  const [top, setTop] = useState<Top>('location')
  const [heroSub, setHeroSub] = useState<HeroSub>('stats')
  // Seed the mock pack/card economy once (idempotent) so the hero board has cards
  // even before the Town overlay is opened.
  useEffect(() => { seedProtoMocks() }, [])

  // Drill into Hero only on an explicit focus request (double-tap a roster hero
  // / initial load). A plain single-tap selects quietly and leaves the tab — so
  // you can keep, say, the Location lens up while you pick a hero to deploy.
  const heroTabRequest = useProtoStore((s) => s.heroTabRequest)
  const prevReq = useRef(heroTabRequest)
  useEffect(() => {
    if (heroTabRequest !== prevReq.current) {
      // Badge-driven routing: a focus that's answering an attention "!" lands on
      // the tab that holds the unspent resource — skill points → Skills, otherwise
      // (ability points / a fresh level / nothing) → Hero.
      const s = useGameStore.getState()
      const u = s.units.find((x) => x.id === s.selectedUnitIds[0])
      setTop(u && u.abilityPoints <= 0 && u.skillPoints > 0 ? 'skills' : 'hero')
      prevReq.current = heroTabRequest
    }
  }, [heroTabRequest])

  // The Quest Journal's "go to location" drills the lens into the Location tab.
  const locationTabRequest = useProtoStore((s) => s.locationTabRequest)
  const prevLocReq = useRef(locationTabRequest)
  useEffect(() => {
    if (locationTabRequest !== prevLocReq.current) { setTop('location'); prevLocReq.current = locationTabRequest }
  }, [locationTabRequest])

  // A battlefield chip tap routes here → Unit tab (the unified card shows the
  // live combat info automatically when the hero is fighting).
  const heroBattleRequest = useProtoStore((s) => s.heroBattleRequest)
  const prevBattleReq = useRef(heroBattleRequest)
  useEffect(() => {
    if (heroBattleRequest !== prevBattleReq.current) { setTop('hero'); setHeroSub('stats'); prevBattleReq.current = heroBattleRequest }
  }, [heroBattleRequest])

  const unit = units.find((u) => u.id === selectedUnitIds[0]) ?? null
  const location = selectedLocId ? locations.find((l) => l.id === selectedLocId) ?? null : null

  // Viewing a hero's dossier clears their "to-do" cue (new level / unspent pts) —
  // same rule as the production unit detail (re-fires when the level changes).
  useEffect(() => {
    if (top === 'hero' && unit) markUnitViewed(unit.id)
  }, [top, unit?.id, unit?.level, markUnitViewed])

  // The Unit dossier is one container; a Pet sub-tab appears only with a companion.
  const heroSubs = unit?.companion ? [...HERO_SUBS, PET_SUB] : HERO_SUBS
  const effSub: HeroSub = heroSub === 'pet' && !unit?.companion ? 'stats' : heroSub

  // A gold pip on the tab that holds an unspent resource for the selected hero —
  // the same attention signal the roster chips carry, mirrored onto the lens so
  // you can see (and reach) the pending decision without leaving the current tab.
  const tabPip = (id: Top): boolean =>
    !!unit && ((id === 'hero' && unit.abilityPoints > 0) || (id === 'skills' && unit.skillPoints > 0))

  return (
    <div className="relative h-full flex flex-col bg-game-surface/40 min-h-0">
      <div className="shrink-0 flex border-b border-game-border bg-game-surface/60">
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            aria-label={t.label}
            onClick={() => setTop(t.id)}
            className={[
              'flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors relative',
              top === t.id ? 'text-game-primary' : 'text-game-muted hover:text-game-text-dim',
            ].join(' ')}
          >
            <span className="text-base leading-none relative">
              {t.icon}
              {tabPip(t.id) && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-game-gold border border-game-bg" />}
            </span>
            <span className="text-[11px] font-medium">{t.label}</span>
            {top === t.id && <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-game-primary" />}
          </button>
        ))}
      </div>

      {/* Persistent hero identity across the four hero-scoped tabs. Location is
          site-scoped, so it owns its own header (the location name) instead. */}
      {top !== 'location' && unit && !selectedFoe && <HeroScopeBar unit={unit} />}

      {/* Hero sub-tabs only appear when there's a Pet (Report otherwise lives in
          Hero Detail). Hidden for a foe. */}
      {top === 'hero' && unit && !selectedFoe && heroSubs.length > 1 && (
        <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-game-border/60 bg-game-bg/30">
          {heroSubs.map((s) => (
            <button
              key={s.id}
              onClick={() => setHeroSub(s.id)}
              className={['text-[11px] px-2 py-0.5 rounded-full transition-colors',
                effSub === s.id ? 'bg-game-primary/20 text-game-text border border-game-primary/40' : 'text-game-text-dim hover:text-game-text border border-transparent'].join(' ')}
            >{s.label}</button>
          ))}
          <button
            onClick={() => openReport(unit.id)}
            title="Open full report"
            className="ml-auto text-[11px] px-2 py-0.5 rounded-full border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5"
          >Report ▸</button>
        </div>
      )}

      {/* Content. A modest zoom nudges every nested text size up a touch without
          rewriting dozens of explicit `text-[*]` classes (h-full keeps Empty
          states centred; overflow is handled by the scroll container above). */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="h-full" style={{ zoom: 1.08 }}>
          {top === 'hero' && (unit ? (
            <>
              <FocusCue unit={unit} location={location} />
              {effSub === 'pet' ? <CompanionLens unit={unit} /> : <HeroLens unit={unit} />}
            </>
          ) : <Empty icon="◈" title="Select a hero" sub="Pick a hero from the roster, or tap one on the battlefield." />)}

          {top === 'location' && (location
            ? <LocationDetail location={location} />
            : <Empty icon="⌖" title="No location focused" sub="Tap a location on the map (or zoom into the locale) to manage it." />)}

          {top === 'equipment' && (unit ? <EquipmentLens unit={unit} /> : <Empty icon="🎒" title="Select a hero" sub="Equipment & personal inventory belong to a hero — pick one." />)}
          {top === 'skills'    && (unit ? <SkillsLens unit={unit} /> : <Empty icon="✦" title="Select a hero" sub="Pick a hero to set their battle skills." />)}
          {top === 'tactics'   && (unit ? <TacticianLens unit={unit} /> : <Empty icon="☷" title="Select a hero" sub="Pick a hero to tune their tactics." />)}
        </div>
      </div>

      {/* Battlefield inspect (monsters now; NPCs/etc. later) — a separate view
          that covers the lens tabs. The stage stays live on the other half. */}
      {selectedFoe && (
        <div className="absolute inset-0 z-30 flex flex-col bg-game-surface">
          <header className="shrink-0 flex items-center gap-2 px-3 h-10 border-b border-game-border bg-game-surface/80">
            <span className="text-xs font-semibold text-game-text">🔍 Inspect</span>
            <button onClick={() => clearFoe()} className="ml-auto flex items-center gap-1.5 px-2.5 h-7 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Back</button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <div className="h-full" style={{ zoom: 1.08 }}>
              <FoeCard locId={selectedFoe.locId} combatantId={selectedFoe.combatantId} />
            </div>
          </div>
        </div>
      )}
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
