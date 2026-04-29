import { useState, useLayoutEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useGameStore, MONSTER_REGISTRY, RECOVERY_TICKS, ATTACK_SPEED_BASE, REGEN_RATE, getDerivedStats, type MonsterBehavior, type Unit, type Location } from '@/stores/useGameStore'


const REGIONS = [
  { id: 'prontera', name: 'Prontera Region' },
  { id: 'geffen',   name: 'Geffen Region' },
  { id: 'kanto',    name: 'Kanto' },
]
import { MonsterCodex } from '@/components/MonsterCodex'
import { LocationCodex } from '@/components/LocationCodex'

// ── UnitRect ──────────────────────────────────────────────────────────────────

function hpBarColor(health: number) {
  if (health > 60) return 'bg-game-green'
  if (health > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

function hpTextColor(hp: number) { return hp >= 75 ? 'text-game-green' : hp >= 40 ? 'text-game-gold' : 'text-red-400' }

const ELEMENT_COLORS: Record<string, string> = {
  fire:      'text-orange-400 bg-orange-950/40 border-orange-800/50',
  lightning: 'text-yellow-300 bg-yellow-950/40 border-yellow-700/50',
  ice:       'text-sky-300 bg-sky-950/40 border-sky-700/50',
  earth:     'text-amber-600 bg-amber-950/40 border-amber-700/50',
  wind:      'text-green-400 bg-green-950/40 border-green-800/50',
  water:     'text-blue-400 bg-blue-950/40 border-blue-800/50',
  neutral:   'text-game-text-dim bg-game-border/20 border-game-border/50',
}

function ElementBadge({ element }: { element: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${ELEMENT_COLORS[element] ?? ELEMENT_COLORS.neutral}`}>
      {element}
    </span>
  )
}


function UnitRect({ unit, overlay = false, targetMonsterName = null, isFleeing = false, isHunting = false }: {
  unit: Unit; overlay?: boolean; targetMonsterName?: string | null; isFleeing?: boolean; isHunting?: boolean
}) {
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const equipment        = useGameStore((s) => s.equipment)
  const isSelected       = selectedUnitIds.includes(unit.id)
  const isRecovering     = unit.recoveryTicksLeft > 0
  const maxHp            = getDerivedStats(unit, equipment).maxHp
  const hpPct            = Math.max(0, Math.min(100, (unit.health / maxHp) * 100))
  const recoverPct       = isRecovering ? ((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100 : 0

  return (
    <div
      onClick={(e) => { e.stopPropagation(); toggleSelectUnit(unit.id) }}
      className={[
        'px-3 py-2 rounded-lg border select-none cursor-pointer min-w-[72px]',
        'transition-colors duration-100',
        overlay ? 'shadow-xl rotate-2 scale-105' : '',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:border-game-primary/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="text-sm font-semibold leading-tight">{unit.name}</div>
        <div className="text-xs text-game-text-dim shrink-0">Lv.{unit.level}</div>
      </div>
      {!overlay && (
        <>
          <div className="w-full bg-game-border/60 rounded-full h-1.5 overflow-hidden">
            {isRecovering ? (
              <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${recoverPct}%`, transition: 'none' }} />
            ) : (
              <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'width 0.7s linear' }} />
            )}
          </div>
          {isRecovering ? (
            <div className="text-[10px] text-purple-400 mt-0.5">KO</div>
          ) : isFleeing ? (
            <div className="text-[10px] text-sky-400 mt-0.5">Fleeing</div>
          ) : isHunting ? (
            <div className="text-[10px] text-amber-400 mt-0.5">Hunting</div>
          ) : targetMonsterName ? (
            <>
              <div className="text-[10px] text-game-green mt-0.5">Attacking</div>
              <div className="text-[10px] text-game-text-dim truncate">→ {targetMonsterName}</div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

// ── DraggableUnit ─────────────────────────────────────────────────────────────

function DraggableUnit({ unit, groupDragging = false }: { unit: Unit; groupDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: unit.id })
  const allUnits     = useGameStore((s) => s.units)
  const slots        = useGameStore((s) => unit.locationId ? (s.encounters[unit.locationId] ?? []) : [])
  const fleeingTicks = useGameStore((s) => unit.locationId ? (s.locationFleeing[unit.locationId] ?? 0) : 0)
  const isFleeing    = fleeingTicks > 0

  const isHunting = !isFleeing && !!unit.locationId && unit.health > 0 && unit.recoveryTicksLeft === 0 && slots.length === 0

  const targetMonsterName = (() => {
    if (isFleeing || isHunting || !unit.locationId || slots.length === 0 || unit.health <= 0 || unit.recoveryTicksLeft > 0) return null
    const alive = allUnits.filter((u) => u.locationId === unit.locationId && u.health > 0 && u.recoveryTicksLeft === 0)
    const idx   = alive.findIndex((u) => u.id === unit.id)
    if (idx === -1) return null
    const prioritySlots = slots.filter((sl) => sl.behavior === 'prioritize')
    const normalSlots   = slots.filter((sl) => sl.behavior === 'normal')
    const focusSlots    = prioritySlots.length > 0 ? prioritySlots : normalSlots
    if (focusSlots.length === 0) return null
    return MONSTER_REGISTRY[focusSlots[idx % focusSlots.length]?.monsterId ?? '']?.name ?? null
  })()

  const style = {
    touchAction: 'none' as const,
    ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging || groupDragging ? 'opacity-30' : ''}
    >
      <UnitRect unit={unit} targetMonsterName={targetMonsterName} isFleeing={isFleeing} isHunting={isHunting} />
    </div>
  )
}

// ── UnassignedPool ────────────────────────────────────────────────────────────

function UnassignedPool({ units, selectedDragging }: { units: Unit[]; selectedDragging: string[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'unassigned' })

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-xl border-2 border-dashed p-4 transition-colors duration-150',
        isOver ? 'border-game-accent bg-game-accent/5' : 'border-game-border',
      ].join(' ')}
    >
      <div className="text-xs uppercase tracking-widest text-game-text-dim mb-3">
        Unassigned · {units.length}
      </div>
      <div className="flex flex-wrap gap-2 min-h-[44px]">
        {units.map((u) => (
          <DraggableUnit key={u.id} unit={u} groupDragging={selectedDragging.includes(u.id)} />
        ))}
        {units.length === 0 && (
          <span className="text-xs text-game-muted italic self-center">All units assigned</span>
        )}
      </div>
    </div>
  )
}

// ── CompactUnitChip ───────────────────────────────────────────────────────────

function CompactUnitChip({ unit, locationId }: { unit: Unit; locationId: string }) {
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const slots            = useGameStore((s) => s.encounters[locationId] ?? [])
  const isFleeing        = useGameStore((s) => (s.locationFleeing[locationId] ?? 0) > 0)
  const allUnits         = useGameStore((s) => s.units)
  const isSelected       = selectedUnitIds.includes(unit.id)

  const isKO      = unit.health <= 0 || unit.recoveryTicksLeft > 0
  const alive     = allUnits.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
  const idx       = alive.findIndex((u) => u.id === unit.id)
  const pSlots    = slots.filter((sl) => sl.behavior === 'prioritize')
  const nSlots    = slots.filter((sl) => sl.behavior === 'normal')
  const focus     = pSlots.length > 0 ? pSlots : nSlots
  const hasTarget = !isKO && !isFleeing && idx >= 0 && focus.length > 0

  let label: string, color: string
  if (isKO)           { label = 'KO';   color = 'text-purple-400' }
  else if (isFleeing) { label = 'Flee'; color = 'text-sky-400'    }
  else if (hasTarget) { label = 'Atk';  color = 'text-game-green' }
  else if (slots.length === 0) { label = 'Hunt'; color = 'text-amber-400' }
  else                { label = '—';    color = 'text-game-muted'  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggleSelectUnit(unit.id) }}
      className={[
        'flex flex-col items-center py-1 px-0.5 rounded-lg border text-center min-w-0 transition-colors',
        isSelected ? 'border-game-primary bg-game-primary/20' : 'border-game-border/60 bg-game-surface/50',
      ].join(' ')}
    >
      <span className={`text-[9px] font-medium leading-tight ${color}`}>{label}</span>
      <span className="text-[9px] text-game-text-dim truncate w-full leading-tight">{unit.name.slice(0, 5)}</span>
    </button>
  )
}

// ── MonsterList ───────────────────────────────────────────────────────────────

const BEHAVIOR_OPTIONS: { b: MonsterBehavior; label: string; desc: string; activeClass: string }[] = [
  { b: 'normal',     label: 'Normal',     desc: 'Fight normally',                          activeClass: 'border-game-primary bg-game-primary/10 text-game-text' },
  { b: 'prioritize', label: 'Prioritize', desc: 'Focus entire party on this first',        activeClass: 'border-amber-600 bg-amber-950/50 text-amber-300' },
  { b: 'ignore',     label: 'Ignore',     desc: 'Skip this monster; flee if only it remains', activeClass: 'border-game-border bg-game-border/20 text-game-text-dim' },
  { b: 'avoid',      label: 'Avoid',      desc: 'Flee the encounter immediately if present',  activeClass: 'border-sky-600 bg-sky-950/50 text-sky-300' },
]

// MonsterDetailPanel — simplified; reads one slot by index from store
function MonsterDetailPanel({ locationId, slotIndex, onClose }: {
  locationId: string; slotIndex: number; onClose: () => void
}) {
  const equipment          = useGameStore((s) => s.equipment)
  const allUnits           = useGameStore((s) => s.units)
  const slot               = useGameStore((s) => (s.encounters[locationId] ?? [])[slotIndex] ?? null)
  const setMonsterBehavior = useGameStore((s) => s.setMonsterBehavior)

  if (!slot) return null
  const monster = MONSTER_REGISTRY[slot.monsterId]
  if (!monster) return null

  const behavior   = slot.behavior ?? 'normal'
  const targetUnit = allUnits.find((u) => u.id === slot.targetUnitId)
  const hpPct      = Math.max(0, Math.round((1 - slot.progress) * 100))
  const phase      = slot.phase ?? 'standing'

  const targetDerived    = targetUnit ? getDerivedStats(targetUnit, equipment) : null
  const monsterDrainRate = phase === 'standing' ? monster.health / (monster.level * 5) : null
  const monsterDealtDps  = phase === 'standing' && targetDerived
    ? (monster.stats.attack * monster.stats.attackSpeed / ATTACK_SPEED_BASE) / Math.max(targetDerived.defense, 1)
    : null
  const hpColor = hpPct >= 75 ? 'text-game-green' : hpPct >= 40 ? 'text-game-gold' : 'text-red-400'

  return (
    <div className="rounded-xl border border-game-border bg-game-surface px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-game-text">{monster.name}</span>
          <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{monster.level}</span>
          <ElementBadge element={monster.element} />
        </div>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs shrink-0">✕</button>
      </div>
      {/* HP bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-game-border/60 rounded-full h-1.5 overflow-hidden">
          <div className={`h-1.5 rounded-full transition-none ${hpPct >= 75 ? 'bg-game-green' : hpPct >= 40 ? 'bg-game-gold' : 'bg-red-500'}`} style={{ width: `${hpPct}%` }} />
        </div>
        <span className={`text-[10px] font-medium tabular-nums shrink-0 ${hpColor}`}>{hpPct}%</span>
        {monsterDrainRate !== null && (
          <span className="text-[10px] text-red-400 shrink-0">(-{monsterDrainRate.toFixed(1)}/s)</span>
        )}
      </div>
      {/* Target */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-game-muted">→</span>
        {targetUnit ? (
          <>
            <span className="text-game-text-dim">{targetUnit.name}</span>
            {monsterDealtDps !== null && <span className="text-[10px] text-game-muted">({monsterDealtDps.toFixed(1)}/s)</span>}
          </>
        ) : <span className="text-game-muted italic">no target</span>}
      </div>
      {/* Behaviors */}
      <div className="flex items-center gap-1 flex-wrap">
        {BEHAVIOR_OPTIONS.map(({ b, label, activeClass }) => (
          <button key={b} onClick={() => setMonsterBehavior(locationId, slot.monsterId, b)}
            className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${behavior === b ? activeClass : 'border-game-border/40 text-game-text-dim hover:border-game-border hover:text-game-text'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// MonsterCard — one card per encounter slot
function MonsterCard({ slotIndex, locationId }: { slotIndex: number; locationId: string }) {
  const slot                  = useGameStore((s) => (s.encounters[locationId] ?? [])[slotIndex] ?? null)
  const selectedMonsterSlot   = useGameStore((s) => s.selectedMonsterSlot)
  const setSelectedMonsterSlot = useGameStore((s) => s.setSelectedMonsterSlot)
  const locationFleeing       = useGameStore((s) => s.locationFleeing[locationId] ?? 0)
  const units                 = useGameStore((s) => s.units)
  const barRef                = useRef<HTMLDivElement>(null)
  const prevProg              = useRef(slot?.progress ?? 0)

  useLayoutEffect(() => {
    if (!slot || !barRef.current) return
    const prog = slot.progress
    const resetting = prog === 0 && prevProg.current > 0
    barRef.current.style.transition = resetting ? 'none' : 'width 1s linear'
    barRef.current.style.width      = `${(1 - prog) * 100}%`
    prevProg.current = prog
  })

  if (!slot) return null
  const monster = MONSTER_REGISTRY[slot.monsterId]
  if (!monster) return null

  const isSelected = selectedMonsterSlot?.locationId === locationId && selectedMonsterSlot?.slotIndex === slotIndex
  const isFleeing  = locationFleeing > 0
  const behavior   = slot.behavior ?? 'normal'
  const targetName = !isFleeing && slot.targetUnitId ? (units.find((u) => u.id === slot.targetUnitId)?.name ?? null) : null

  const borderCls = isSelected          ? 'border-game-primary bg-game-primary/10' :
    behavior === 'prioritize'           ? 'border-amber-700/60' :
    behavior === 'avoid'                ? 'border-sky-700/60'   : 'border-game-border'

  function toggle() {
    if (isSelected) setSelectedMonsterSlot(null)
    else setSelectedMonsterSlot({ locationId, slotIndex })
  }

  return (
    <button onClick={toggle}
      className={`px-3 py-2 rounded-lg border bg-game-bg text-center transition-colors ${borderCls} ${behavior === 'ignore' ? 'opacity-50' : ''}`}
      style={{ minWidth: 72 }}
    >
      <div className="text-sm font-semibold text-game-text">{monster.name}</div>
      <div className="text-xs text-game-accent">Lv.{monster.level}</div>
      <div className="mt-1 w-full bg-game-border rounded-full h-1.5 overflow-hidden">
        <div ref={barRef} className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(1 - (slot.progress)) * 100}%` }} />
      </div>
      {targetName && <div className="text-[10px] text-game-text-dim mt-0.5 truncate">→ {targetName}</div>}
    </button>
  )
}

function MonsterList({ location }: { location: Location }) {
  const locationSlots = useGameStore((s) => s.encounters[location.id] ?? [])

  if (locationSlots.length === 0) return <p className="text-xs text-game-muted italic">No active encounter.</p>

  return (
    <div className="flex flex-wrap gap-2 items-start">
      {locationSlots.map((_, i) => (
        <MonsterCard key={i} slotIndex={i} locationId={location.id} />
      ))}
    </div>
  )
}

// ── UnitDetailPanel ───────────────────────────────────────────────────────────

function UnitDetailPanel({ unit, locationId, onClose }: { unit: Unit; locationId: string; onClose: () => void }) {
  const equipment = useGameStore((s) => s.equipment)
  const allUnits  = useGameStore((s) => s.units)
  const slots     = useGameStore((s) => s.encounters[locationId] ?? [])
  const fleeing   = useGameStore((s) => s.locationFleeing[locationId] ?? 0)
  const locations = useGameStore((s) => s.locations)

  const derived      = getDerivedStats(unit, equipment)
  const isRecovering = unit.recoveryTicksLeft > 0
  const hpPct        = Math.max(0, Math.min(100, (unit.health / derived.maxHp) * 100))

  const alive          = allUnits.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
  const idx            = alive.findIndex((u) => u.id === unit.id)
  const prioritySlots  = slots.filter((sl) => sl.behavior === 'prioritize')
  const normalSlots    = slots.filter((sl) => sl.behavior === 'normal')
  const focusSlots     = prioritySlots.length > 0 ? prioritySlots : normalSlots
  const targetSlotObj  = idx >= 0 && focusSlots.length > 0 ? focusSlots[idx % focusSlots.length] : null
  const targetMonster  = targetSlotObj ? (MONSTER_REGISTRY[targetSlotObj.monsterId] ?? null) : null
  const targetPhase    = targetSlotObj?.phase ?? 'standing'

  const mainHandId = unit.weaponSets[unit.activeWeaponSet].mainHand
  const weaponName = mainHandId ? (equipment.find((e) => e.id === mainHandId)?.name ?? mainHandId) : 'Unarmed'

  const destId   = unit.travelPath?.at(-1) ?? null
  const destName = destId ? (locations.find((l) => l.id === destId)?.name ?? destId) : null

  // Stats: only valid during active combat (not fleeing, not KO, encounter present)
  const inCombat = slots.length > 0 && !isRecovering && fleeing === 0

  // Dealt: based on progress rate — monster.health / (level * 5) HP-equivalent per tick
  const dpsDealt = inCombat && targetMonster && targetPhase === 'standing'
    ? targetMonster.health / (targetMonster.level * 5)
    : null

  // Taken: sum of damage from all monsters targeting this unit (only standing ones)
  const dpsTaken = inCombat
    ? slots.reduce((sum, sl) => {
        if (sl.behavior === 'avoid' || sl.targetUnitId !== unit.id || (sl.phase ?? 'standing') !== 'standing') return sum
        const m = MONSTER_REGISTRY[sl.monsterId]
        if (!m) return sum
        return sum + (m.stats.attack * m.stats.attackSpeed / ATTACK_SPEED_BASE) / Math.max(derived.defense, 1)
      }, 0)
    : null

  return (
    <div className="mt-2 rounded-xl border border-game-border bg-game-bg px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-game-text">{unit.name}</span>
          <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{unit.level}</span>
          {unit.class && <span className="text-[10px] text-game-text-dim border border-game-border rounded px-1.5 py-0.5">{unit.class}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-mono font-semibold ${hpTextColor(hpPct)}`}>{unit.health} / {derived.maxHp}</span>
          {dpsTaken !== null && dpsTaken > 0 ? (
            <span className="text-[10px] text-red-400">(-{dpsTaken.toFixed(1)}/s)</span>
          ) : (isRecovering || unit.locationId === null) ? (
            <span className="text-[10px] text-game-green">(+{REGEN_RATE.toFixed(1)}/s)</span>
          ) : null}
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs">✕</button>
        </div>
      </div>

      {/* HP bar */}
      <div className="w-full bg-game-border/60 rounded-full h-1.5 overflow-hidden">
        {isRecovering ? (
          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100}%`, transition: 'none' }} />
        ) : (
          <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'width 0.7s linear' }} />
        )}
      </div>
      {/* EXP bar */}
      <div className="w-full bg-game-border/60 rounded-full h-1 overflow-hidden">
        <div className="bg-game-primary h-1 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (unit.exp / unit.expToNext) * 100)}%` }} />
      </div>

      {/* Status line */}
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        {isRecovering ? (
          <span className="text-purple-400">KO — recovering</span>
        ) : fleeing > 0 ? (
          <span className="text-sky-400">Fleeing...</span>
        ) : targetMonster && targetPhase === 'approaching' ? (
          <>
            <span className="text-game-muted">Approaching</span>
            <span className="text-game-text font-medium">{targetMonster.name}</span>
            <ElementBadge element={targetMonster.element} />
          </>
        ) : targetMonster ? (
          <>
            <span className="text-game-muted">Attacking</span>
            <span className="text-game-text font-medium">{targetMonster.name}</span>
            <span className="text-game-muted">with</span>
            <span className="text-game-text-dim">{weaponName}</span>
            <ElementBadge element={targetMonster.element} />
            {dpsDealt !== null && (
              <span className="text-[10px] text-game-muted">({dpsDealt.toFixed(1)}/s)</span>
            )}
          </>
        ) : slots.length === 0 ? (
          <span className="text-amber-400">Hunting...</span>
        ) : null}
      </div>

      {destName && (
        <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-sky-950/30 border border-sky-800/40">
          <span className="text-sky-400">Traveling through →</span>
          <span className="text-sky-300 font-medium">{destName}</span>
        </div>
      )}
    </div>
  )
}

// ── LocationSection ───────────────────────────────────────────────────────────

function LocationSection({ location, units, selectedDragging }: {
  location: Location
  units: Unit[]
  selectedDragging: string[]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: location.id })
  const isExpanded     = useGameStore((s) => s.expandedLocationIds.includes(location.id))
  const toggleLocation = useGameStore((s) => s.toggleLocation)
  const isEmpty        = units.length === 0 && !isExpanded
  const [codexOpen, setCodexOpen] = useState(false)

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-lg border transition-colors duration-150 overflow-hidden',
        isOver  ? 'border-game-primary bg-game-primary/5' : 'border-game-border',
        isEmpty ? 'bg-transparent'                        : '',
      ].join(' ')}
    >
      <button
        className={['w-full flex items-center justify-between text-left', isEmpty ? 'px-3 py-1.5' : 'px-4 py-3'].join(' ')}
        onClick={() => toggleLocation(location.id)}
      >
        <span className={isEmpty ? 'text-sm text-game-text-dim' : 'font-semibold text-game-text'}>{location.name}</span>
        <div className="flex items-center gap-2">
          {units.length > 0 && !isExpanded && (
            <span className="text-xs text-game-text-dim bg-game-border rounded-full px-2 py-0.5">{units.length}</span>
          )}
          <span className="text-game-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Collapsed: compact 5-per-row status chips */}
      {units.length > 0 && !isExpanded && (
        <div className="px-3 pb-2 grid grid-cols-5 gap-1">
          {units.map((u) => (
            <CompactUnitChip key={u.id} unit={u} locationId={location.id} />
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-game-border space-y-3">
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs uppercase tracking-widest text-game-text-dim">Encounter</div>
            <button
              onClick={(e) => { e.stopPropagation(); setCodexOpen(true) }}
              className="text-xs font-medium px-2 py-0.5 rounded border border-game-accent/40 text-game-accent hover:bg-game-accent/10 hover:border-game-accent transition-colors"
            >
              Codex →
            </button>
          </div>
          <MonsterList location={location} />
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Units</div>
            <div className="flex flex-wrap gap-2 min-h-[44px]">
              {units.map((u) => (
                <DraggableUnit key={u.id} unit={u} groupDragging={selectedDragging.includes(u.id)} />
              ))}
              {units.length === 0 && (
                <span className="text-xs text-game-muted italic self-center">Drop units here</span>
              )}
            </div>
          </div>
        </div>
      )}
      {codexOpen && <LocationCodex location={location} onClose={() => setCodexOpen(false)} />}
    </div>
  )
}

// ── RegionSection ─────────────────────────────────────────────────────────────

function RegionSection({ region, locations, units, selectedDragging }: {
  region: { id: string; name: string }
  locations: Location[]
  units: Unit[]
  selectedDragging: string[]
}) {
  const isExpanded   = useGameStore((s) => s.expandedRegionIds.includes(region.id))
  const toggleRegion = useGameStore((s) => s.toggleRegion)
  const regionUnitCount = units.filter((u) => locations.some((l) => l.id === u.locationId)).length

  return (
    <div>
      <button
        className="w-full flex items-center justify-between py-2 px-1"
        onClick={() => toggleRegion(region.id)}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-game-text-dim">{region.name}</span>
        <div className="flex items-center gap-2">
          {regionUnitCount > 0 && (
            <span className="text-xs text-game-text-dim">{regionUnitCount} units</span>
          )}
          <span className="text-game-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {isExpanded && (
        <div className="space-y-1.5">
          {locations.map((loc) => (
            <LocationSection
              key={loc.id}
              location={loc}
              units={units.filter((u) => u.locationId === loc.id)}
              selectedDragging={selectedDragging}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── SelectionBar ──────────────────────────────────────────────────────────────

function SelectionBar({ onOpenCodex }: { onOpenCodex: (monsterId: string) => void }) {
  const { selectedUnitIds, expandedUnitIds, locations, assignUnits, clearSelection, setActiveTab, toggleUnit, units } = useGameStore()
  const selectedMonsterSlot    = useGameStore((s) => s.selectedMonsterSlot)
  const setSelectedMonsterSlot = useGameStore((s) => s.setSelectedMonsterSlot)
  const monsterSlotMonsterId   = useGameStore((s) =>
    s.selectedMonsterSlot
      ? (s.encounters[s.selectedMonsterSlot.locationId]?.[s.selectedMonsterSlot.slotIndex]?.monsterId ?? null)
      : null
  )
  const [open, setOpen] = useState(false)

  const hasUnits        = selectedUnitIds.length > 0
  const hasMonster      = selectedMonsterSlot !== null
  const selectedUnit    = selectedUnitIds.length === 1 ? (units.find((u) => u.id === selectedUnitIds[0]) ?? null) : null
  const monsterForCodex = monsterSlotMonsterId ? (MONSTER_REGISTRY[monsterSlotMonsterId] ?? null) : null

  if (!hasUnits && !hasMonster) return null

  function handleClearAll() { clearSelection(); setSelectedMonsterSlot(null); setOpen(false) }
  const handleAssign = (locationId: string | null) => { assignUnits(selectedUnitIds, locationId); setOpen(false) }
  const handleViewUnit = () => {
    const unitId = selectedUnitIds[0]
    if (!expandedUnitIds.includes(unitId)) toggleUnit(unitId)
    setActiveTab('units')
    clearSelection()
  }

  return (
    <div className="fixed bottom-4 inset-x-0 z-30 px-4 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-2">
        {/* Monster detail panel */}
        {hasMonster && (
          <MonsterDetailPanel
            locationId={selectedMonsterSlot!.locationId}
            slotIndex={selectedMonsterSlot!.slotIndex}
            onClose={() => setSelectedMonsterSlot(null)}
          />
        )}
        {/* Unit detail panel (only when exactly 1 unit selected) */}
        {selectedUnit && (
          <UnitDetailPanel
            unit={selectedUnit}
            locationId={selectedUnit.locationId ?? ''}
            onClose={clearSelection}
          />
        )}
        {/* Action bar */}
        <div className="bg-game-surface border border-game-primary rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-game-primary/30">
          <span className="flex-1 text-sm font-medium min-w-0 truncate">
            {hasUnits
              ? `${selectedUnitIds.length} unit${selectedUnitIds.length !== 1 ? 's' : ''} selected`
              : (monsterForCodex?.name ?? 'Monster') + ' selected'}
          </span>
          {/* View › — only for single unit, no monster */}
          {selectedUnit && !hasMonster && (
            <button className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0" onClick={handleViewUnit}>
              View ›
            </button>
          )}
          {/* Codex → — only when monster selected alone */}
          {hasMonster && !hasUnits && monsterForCodex && (
            <button className="text-sm py-1.5 px-3 rounded-lg border border-game-accent/50 text-game-accent hover:bg-game-accent/10 transition-colors shrink-0"
              onClick={() => onOpenCodex(monsterForCodex.id)}>
              Codex →
            </button>
          )}
          {/* Move to — only for units */}
          {hasUnits && (
            <div className="relative shrink-0">
              <button className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1" onClick={() => setOpen((v) => !v)}>
                Move to <span className="text-xs opacity-70">▾</span>
              </button>
              {open && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                  <div className="absolute bottom-full mb-2 right-0 z-20 bg-game-surface border border-game-border rounded-xl overflow-hidden w-52 shadow-2xl">
                    <button className="w-full text-left px-4 py-3 text-sm text-game-text-dim hover:bg-white/5 transition-colors" onClick={() => handleAssign(null)}>
                      Unassigned
                    </button>
                    {locations.map((loc) => (
                      <button key={loc.id} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-t border-game-border/50" onClick={() => handleAssign(loc.id)}>
                        {loc.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-game-text-dim hover:text-game-text hover:bg-white/5 transition-colors shrink-0" onClick={handleClearAll}>
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Map ───────────────────────────────────────────────────────────────────────

export function Map() {
  const { units, locations, selectedUnitIds, assignUnits } = useGameStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [codexMonsterId, setCodexMonsterId] = useState<string | null>(null)
  const codexSeenCount = useGameStore((s) => codexMonsterId ? (s.monsterSeen[codexMonsterId] ?? 0) : 0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const activeUnit = units.find((u) => u.id === activeId) ?? null
  const draggingGroup = activeId !== null && selectedUnitIds.includes(activeId)
  const dragCount = draggingGroup ? selectedUnitIds.length : 1

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const unitId = active.id as string
    const locationId = (over.id as string) === 'unassigned' ? null : (over.id as string)
    const idsToMove = selectedUnitIds.includes(unitId) ? selectedUnitIds : [unitId]
    assignUnits(idsToMove, locationId)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="p-4 space-y-3 pb-32">
        <UnassignedPool
          units={units.filter((u) => u.locationId === null)}
          selectedDragging={draggingGroup ? selectedUnitIds : []}
        />
        {REGIONS.map((region) => (
          <RegionSection
            key={region.id}
            region={region}
            locations={locations.filter((l) => l.region === region.id)}
            units={units}
            selectedDragging={draggingGroup ? selectedUnitIds : []}
          />
        ))}
      </div>

      <SelectionBar onOpenCodex={(id) => { setCodexMonsterId(id) }} />

      {codexMonsterId && MONSTER_REGISTRY[codexMonsterId] && (
        <MonsterCodex
          monster={MONSTER_REGISTRY[codexMonsterId]}
          seenCount={codexSeenCount}
          onClose={() => setCodexMonsterId(null)}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {activeUnit && (
          <div className="relative">
            <UnitRect unit={activeUnit} overlay />
            {dragCount > 1 && (
              <span className="absolute -top-2 -right-2 bg-game-primary text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {dragCount}
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
