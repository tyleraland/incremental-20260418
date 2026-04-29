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
import { useGameStore, MONSTER_REGISTRY, RECOVERY_TICKS, ATTACK_SPEED_BASE, REGEN_RATE, RESTING_REGEN_RATE, TICKS_PER_SECOND, getDerivedStats, type MonsterBehavior, type Unit, type Location, type EncounterSlot } from '@/stores/useGameStore'
import type { MonsterDef } from '@/types'


const REGIONS = [
  { id: 'prontera', name: 'Prontera Region' },
  { id: 'geffen',   name: 'Geffen Region' },
  { id: 'kanto',    name: 'Kanto' },
]

function calcCooldown(attackSpeed: number): number {
  return Math.max(1, Math.round(TICKS_PER_SECOND * ATTACK_SPEED_BASE / attackSpeed))
}

function calcDps(m: MonsterDef, defense: number): number {
  return Math.ceil(m.stats.attack / Math.max(defense, 1)) * (TICKS_PER_SECOND / calcCooldown(m.stats.attackSpeed))
}

// history includes 0 for misses; returns actual rolling DPS in history units per second
function rollingRate(history: number[], cooldownTicks: number): number | null {
  if (history.length === 0) return null
  return (history.reduce((s, x) => s + x, 0) / history.length) * (TICKS_PER_SECOND / cooldownTicks)
}

function slotDisplayName(allSlots: EncounterSlot[], slotIndex: number): string {
  const slot = allSlots[slotIndex]
  if (!slot) return ''
  const name = MONSTER_REGISTRY[slot.monsterId]?.name ?? slot.monsterId
  const hasDupes = allSlots.filter(s => s.monsterId === slot.monsterId).length > 1
  if (!hasDupes) return name
  let rank = 0
  for (let i = 0; i <= slotIndex; i++) {
    if (allSlots[i].monsterId === slot.monsterId) rank++
  }
  return `${name} ${rank}`
}
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
  const isResting        = unit.isResting
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
            ) : isResting ? (
              <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
            ) : (
              <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
            )}
          </div>
          {isRecovering ? (
            <div className="text-[10px] text-purple-400 mt-0.5">KO</div>
          ) : isResting ? (
            <div className="text-[10px] text-sky-400 mt-0.5">Resting</div>
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
    const targetSlot = focusSlots[idx % focusSlots.length]
    const targetIdx  = slots.indexOf(targetSlot)
    return slotDisplayName(slots, targetIdx)
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

// ── LocationUnitCard (non-draggable, for expanded locations) ─────────────────

function LocationUnitCard({ unit, locationId }: { unit: Unit; locationId: string }) {
  const allUnits     = useGameStore((s) => s.units)
  const slots        = useGameStore((s) => s.encounters[locationId] ?? [])
  const fleeingTicks = useGameStore((s) => s.locationFleeing[locationId] ?? 0)
  const isFleeing    = fleeingTicks > 0
  const isHunting    = !isFleeing && unit.health > 0 && unit.recoveryTicksLeft === 0 && slots.length === 0
  const targetMonsterName = (() => {
    if (isFleeing || isHunting || slots.length === 0 || unit.health <= 0 || unit.recoveryTicksLeft > 0) return null
    const alive = allUnits.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
    const idx   = alive.findIndex((u) => u.id === unit.id)
    if (idx === -1) return null
    const prioritySlots = slots.filter((sl) => sl.behavior === 'prioritize')
    const normalSlots   = slots.filter((sl) => sl.behavior === 'normal')
    const focusSlots    = prioritySlots.length > 0 ? prioritySlots : normalSlots
    if (focusSlots.length === 0) return null
    const targetSlot = focusSlots[idx % focusSlots.length]
    const targetIdx  = slots.indexOf(targetSlot)
    return slotDisplayName(slots, targetIdx)
  })()
  return <UnitRect unit={unit} targetMonsterName={targetMonsterName} isFleeing={isFleeing} isHunting={isHunting} />
}

// ── UnassignedPool ────────────────────────────────────────────────────────────

function UnassignedPool({ units, selectedDragging }: { units: Unit[]; selectedDragging: string[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'unassigned' })

  const isEmpty = units.length === 0

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-xl border-2 border-dashed transition-colors duration-150',
        isEmpty ? 'p-2' : 'p-4',
        isOver ? 'border-game-accent bg-game-accent/5' : 'border-game-border',
      ].join(' ')}
    >
      {isEmpty ? (
        <div className="text-xs text-game-muted italic text-center">All units assigned</div>
      ) : (
        <>
          <div className="text-xs uppercase tracking-widest text-game-text-dim mb-3">
            Unassigned · {units.length}
          </div>
          <div className="flex flex-wrap gap-2 min-h-[44px]">
            {units.map((u) => (
              <DraggableUnit key={u.id} unit={u} groupDragging={selectedDragging.includes(u.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── CompactUnitChip ───────────────────────────────────────────────────────────

function CompactUnitChip({ unit, locationId: _locationId }: { unit: Unit; locationId: string }) {
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const equipment        = useGameStore((s) => s.equipment)
  const isSelected       = selectedUnitIds.includes(unit.id)

  const isRecovering = unit.recoveryTicksLeft > 0
  const maxHp  = getDerivedStats(unit, equipment).maxHp
  const hpPct  = Math.max(0, Math.min(100, (unit.health / maxHp) * 100))
  const recPct = isRecovering ? ((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100 : 0
  const barColor = isRecovering ? 'bg-purple-500' : hpPct > 60 ? 'bg-game-green' : hpPct > 30 ? 'bg-game-gold' : 'bg-red-500'

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggleSelectUnit(unit.id) }}
      className={[
        'flex flex-col items-start py-2 px-3 rounded-lg border min-w-[52px] transition-colors',
        isSelected ? 'border-game-primary bg-game-primary/20' : 'border-game-border/60 bg-game-surface/50',
      ].join(' ')}
    >
      <span className="text-xs text-game-text truncate w-full leading-tight">{unit.name}</span>
      <div className="w-full bg-game-border/60 rounded-full h-1 overflow-hidden mt-1.5">
        <div className={`${barColor} h-1 rounded-full`} style={{ width: `${isRecovering ? recPct : hpPct}%`, transition: 'none' }} />
      </div>
    </button>
  )
}

// ── DraggableCompactUnit (draggable wrapper for collapsed chips) ──────────────

function DraggableCompactUnit({ unit, locationId, groupDragging = false }: { unit: Unit; locationId: string; groupDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: unit.id })
  const style = {
    touchAction: 'none' as const,
    ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging || groupDragging ? 'opacity-30' : ''}>
      <CompactUnitChip unit={unit} locationId={locationId} />
    </div>
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
  const allSlots           = useGameStore((s) => s.encounters[locationId] ?? [])
  const slot               = allSlots[slotIndex] ?? null
  const setMonsterBehavior = useGameStore((s) => s.setMonsterBehavior)

  if (!slot) return null
  const monster = MONSTER_REGISTRY[slot.monsterId]
  if (!monster) return null

  const behavior   = slot.behavior ?? 'normal'
  const targetUnit = allUnits.find((u) => u.id === slot.targetUnitId)
  const hpPct      = Math.max(0, Math.round((1 - slot.progress) * 100))
  const currentHp  = Math.round((1 - slot.progress) * monster.health)
  const phase      = slot.phase ?? 'standing'

  const targetDerived    = targetUnit ? getDerivedStats(targetUnit, equipment) : null

  // Count alive units targeting this slot (for accurate drain rate)
  const aliveAtLoc    = allUnits.filter(u => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0 && !u.isResting)
  const prioritySlots = allSlots.filter(s => s.behavior === 'prioritize')
  const normalSlots   = allSlots.filter(s => s.behavior === 'normal')
  const focusSlots    = prioritySlots.length > 0 ? prioritySlots : normalSlots
  const numAttackers  = focusSlots.includes(slot)
    ? aliveAtLoc.filter((_, ui) => focusSlots[ui % focusSlots.length] === slot).length
    : 0
  const takenHitFraction = slot.takenHistory.length > 0
    ? slot.takenHistory.filter(c => c > 0).length / slot.takenHistory.length
    : 1
  const monsterDrainRate = phase === 'standing' && numAttackers > 0
    ? numAttackers * takenHitFraction * monster.health / (monster.level * 5)
    : null
  const atkCooldown      = calcCooldown(monster.stats.attackSpeed)
  const monsterDealtDps  = phase === 'standing' && targetDerived
    ? (rollingRate(slot.dealtHistory, atkCooldown) ?? calcDps(monster, targetDerived.defense))
    : null
  const lastHitDmg = phase === 'standing' && !slot.lastAttackMissed
    ? (slot.dealtHistory.at(-1) ?? 0)
    : null
  const hpColor = hpPct >= 75 ? 'text-game-green' : hpPct >= 40 ? 'text-game-gold' : 'text-red-400'

  return (
    <div className="rounded-xl border border-game-primary/60 bg-indigo-950 px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-game-text">{slotDisplayName(allSlots, slotIndex)}</span>
          <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{monster.level}</span>
          <ElementBadge element={monster.element} />
        </div>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs shrink-0">✕</button>
      </div>
      {/* HP bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-game-border/60 rounded-full h-1.5 overflow-hidden">
          <div className="bg-red-500 h-1.5 rounded-full transition-none" style={{ width: `${hpPct}%` }} />
        </div>
        <span className={`text-[10px] font-medium tabular-nums shrink-0 ${hpColor}`}>{currentHp} / {monster.health}</span>
        {monsterDrainRate !== null && (
          <span className="text-[10px] text-red-400 shrink-0">(-{monsterDrainRate.toFixed(1)}/s)</span>
        )}
      </div>
      {/* Status line */}
      <div className="flex items-center gap-1.5 text-xs overflow-hidden h-5">
        {targetUnit && phase !== 'retreating' ? (
          <>
            <span className="text-game-muted">Attacking</span>
            <span className="text-game-text font-medium">{targetUnit.name}</span>
            <span className="text-game-muted">with</span>
            <span className="text-game-text-dim">{monster.attackName}</span>
            <ElementBadge element="neutral" />
            {monsterDealtDps !== null && <span className="text-xs font-medium text-red-400">{monsterDealtDps.toFixed(1)}/s</span>}
            {slot.lastAttackMissed
              ? <span className="text-[10px] font-semibold text-game-muted">(MISS)</span>
              : lastHitDmg !== null && lastHitDmg > 0
              ? <span className="text-[10px] font-semibold text-red-300">({Math.round(lastHitDmg)})</span>
              : null}
          </>
        ) : phase === 'approaching' ? (
          <span className="text-game-muted italic">Approaching...</span>
        ) : (
          <span className="text-game-muted italic">no target</span>
        )}
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
  const allSlots              = useGameStore((s) => s.encounters[locationId] ?? [])
  const slot                  = allSlots[slotIndex] ?? null
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
    barRef.current.style.transition = resetting ? 'none' : 'width 0.2s linear'
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
      className={`w-full px-3 py-2 rounded-lg border bg-game-bg text-right transition-colors ${borderCls} ${behavior === 'ignore' ? 'opacity-50' : ''}`}
    >
      <div className="text-sm font-semibold text-game-text">{slotDisplayName(allSlots, slotIndex)}</div>
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
    <div className="flex flex-col gap-2">
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
  const targetSlotObj     = idx >= 0 && focusSlots.length > 0 ? focusSlots[idx % focusSlots.length] : null
  const targetSlotIdx     = targetSlotObj ? slots.indexOf(targetSlotObj) : -1
  const targetMonster     = targetSlotObj ? (MONSTER_REGISTRY[targetSlotObj.monsterId] ?? null) : null
  const targetMonsterName = targetSlotIdx >= 0 ? slotDisplayName(slots, targetSlotIdx) : (targetMonster?.name ?? null)
  const targetPhase       = targetSlotObj?.phase ?? 'standing'

  const mainHandId = unit.weaponSets[unit.activeWeaponSet].mainHand
  const weaponName = mainHandId ? (equipment.find((e) => e.id === mainHandId)?.name ?? mainHandId) : 'Unarmed'

  const destId   = unit.travelPath?.at(-1) ?? null
  const destName = destId ? (locations.find((l) => l.id === destId)?.name ?? destId) : null

  // Stats: only valid during active combat (not fleeing, not KO, encounter present)
  const inCombat = slots.length > 0 && !isRecovering && fleeing === 0

  const unitCooldown = calcCooldown(derived.attackSpeed)

  // Per-unit DPS dealt to monster = monster.health/(level*5) per second at 100% hit rate.
  // Scale by hit fraction from combined takenHistory (includes 0s for misses).
  const hitFraction = targetSlotObj && targetSlotObj.takenHistory.length > 0
    ? targetSlotObj.takenHistory.filter(c => c > 0).length / targetSlotObj.takenHistory.length
    : 1
  const dpsDealt = inCombat && targetMonster && targetPhase === 'standing'
    ? hitFraction * targetMonster.health / (targetMonster.level * 5)
    : null

  // Last damage dealt to monster (HP-equivalent of combined chunk from last attack event)
  const lastDmgDealt = targetMonster && targetSlotObj && !targetSlotObj.lastProgressMissed
    ? Math.round((targetSlotObj.takenHistory.at(-1) ?? 0) * targetMonster.health)
    : null

  // Taken: sum of rolling DPS from all standing, non-avoid monsters targeting this unit
  const dpsTaken = inCombat
    ? slots.reduce((sum, sl) => {
        if (sl.behavior === 'avoid') return sum
        if (sl.targetUnitId !== unit.id) return sum
        if (sl.phase !== 'standing') return sum
        const m = MONSTER_REGISTRY[sl.monsterId]
        if (!m) return sum
        const cd = calcCooldown(m.stats.attackSpeed)
        return sum + (rollingRate(sl.dealtHistory, cd) ?? calcDps(m, derived.defense))
      }, 0)
    : null

  return (
    <div className="mt-2 rounded-xl border border-game-primary/60 bg-indigo-950 px-3 py-2 space-y-2">
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
          ) : unit.isResting ? (
            <span className="text-[10px] text-sky-400">(+{RESTING_REGEN_RATE * TICKS_PER_SECOND}/s)</span>
          ) : unit.locationId === null ? (
            <span className="text-[10px] text-game-green">(+{REGEN_RATE * TICKS_PER_SECOND}/s)</span>
          ) : null}
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs">✕</button>
        </div>
      </div>

      {/* HP bar */}
      <div className="w-full bg-game-border/60 rounded-full h-1.5 overflow-hidden">
        {isRecovering ? (
          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100}%`, transition: 'none' }} />
        ) : unit.isResting ? (
          <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
        ) : (
          <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
        )}
      </div>
      {/* EXP bar */}
      <div className="w-full bg-game-border/60 rounded-full h-1 overflow-hidden">
        <div className="bg-game-primary h-1 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (unit.exp / unit.expToNext) * 100)}%` }} />
      </div>

      {/* Status line */}
      <div className="flex items-center gap-1.5 text-xs overflow-hidden h-5">
        {isRecovering ? (
          <span className="text-purple-400">KO</span>
        ) : unit.isResting ? (
          <span className="text-sky-400">Resting...</span>
        ) : fleeing > 0 ? (
          <span className="text-sky-400">Fleeing...</span>
        ) : targetMonster && targetPhase === 'approaching' ? (
          <>
            <span className="text-game-muted">Approaching</span>
            <span className="text-game-text font-medium">{targetMonsterName}</span>
            <ElementBadge element={targetMonster.element} />
          </>
        ) : targetMonster ? (
          <>
            <span className="text-game-muted">Attacking</span>
            <span className="text-game-text font-medium">{targetMonsterName}</span>
            <span className="text-game-muted">with</span>
            <span className="text-game-text-dim">{weaponName}</span>
            <ElementBadge element={targetMonster.element} />
            {dpsDealt !== null && <span className="text-xs font-medium text-amber-400">{dpsDealt.toFixed(1)}/s</span>}
            {targetSlotObj?.lastProgressMissed
              ? <span className="text-[10px] font-semibold text-game-muted">(MISS)</span>
              : lastDmgDealt !== null && lastDmgDealt > 0
              ? <span className="text-[10px] font-semibold text-amber-300">({lastDmgDealt})</span>
              : null}
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

      {/* Collapsed: draggable status chips */}
      {units.length > 0 && !isExpanded && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {units.map((u) => (
            <DraggableCompactUnit key={u.id} unit={u} locationId={location.id} groupDragging={selectedDragging.includes(u.id)} />
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-game-border pt-3 space-y-2">
          <button
            onClick={(e) => { e.stopPropagation(); setCodexOpen(true) }}
            className="text-xs font-medium px-2 py-0.5 rounded border border-game-accent/40 text-game-accent hover:bg-game-accent/10 hover:border-game-accent transition-colors"
          >
            Location Codex →
          </button>
          <div className="flex gap-5">
            {/* Units — left column */}
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-1">Units</div>
              <div className="flex flex-col gap-2 min-h-[44px]">
                {units.map((u) => (
                  <LocationUnitCard key={u.id} unit={u} locationId={location.id} />
                ))}
                {units.length === 0 && (
                  <span className="text-xs text-game-muted italic">Drop units here</span>
                )}
              </div>
            </div>
            {/* Monsters — right column, only when units are assigned */}
            {units.length > 0 && (
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-widest text-game-text-dim mb-1 text-right">Encounter</div>
                <MonsterList location={location} />
              </div>
            )}
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
        className="w-full flex items-center justify-between pt-2 pb-1 px-1"
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
        {/* Monster detail panel — hidden when 2+ units selected */}
        {hasMonster && selectedUnitIds.length <= 1 && (
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
