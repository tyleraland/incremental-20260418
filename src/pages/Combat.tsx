import { useState, useLayoutEffect, useRef } from 'react'
import { useGameStore, MONSTER_REGISTRY, RECOVERY_TICKS, ATTACK_SPEED_BASE, REGEN_RATE, RESTING_REGEN_RATE, TICKS_PER_SECOND, getDerivedStats, getUnitTraits, type MonsterBehavior, type Unit, type Location, type EncounterSlot } from '@/stores/useGameStore'
import type { MonsterDef } from '@/types'
import { MonsterCodex } from '@/components/MonsterCodex'
import { LocationCodex } from '@/components/LocationCodex'
import { CombatReport } from '@/components/CombatReport'

function calcCooldown(attackSpeed: number): number {
  return Math.max(1, Math.round(TICKS_PER_SECOND * ATTACK_SPEED_BASE / attackSpeed))
}

function calcDps(m: MonsterDef, defense: number): number {
  return Math.ceil(m.stats.attack / Math.max(defense, 1)) * (TICKS_PER_SECOND / calcCooldown(m.stats.attackSpeed))
}

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

function hpBarColor(hp: number) {
  if (hp > 60) return 'bg-game-green'
  if (hp > 30) return 'bg-game-gold'
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

const BEHAVIOR_OPTIONS: { b: MonsterBehavior; label: string; activeClass: string }[] = [
  { b: 'normal',     label: 'Normal',     activeClass: 'border-game-primary bg-game-primary/10 text-game-text' },
  { b: 'prioritize', label: 'Prioritize', activeClass: 'border-amber-600 bg-amber-950/50 text-amber-300' },
  { b: 'ignore',     label: 'Ignore',     activeClass: 'border-game-border bg-game-border/20 text-game-text-dim' },
  { b: 'avoid',      label: 'Avoid',      activeClass: 'border-sky-600 bg-sky-950/50 text-sky-300' },
]

// ── BigUnitCard ───────────────────────────────────────────────────────────────

function BigUnitCard({ unit, locationId, isSelected, onTap }: {
  unit: Unit; locationId: string; isSelected: boolean; onTap: () => void
}) {
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
  const targetSlotIdx  = targetSlotObj ? slots.indexOf(targetSlotObj) : -1
  const targetMonster  = targetSlotObj ? (MONSTER_REGISTRY[targetSlotObj.monsterId] ?? null) : null
  const targetMonsterName = targetSlotIdx >= 0 ? slotDisplayName(slots, targetSlotIdx) : (targetMonster?.name ?? null)
  const targetPhase    = targetSlotObj?.phase ?? 'standing'

  const mainHandId = unit.weaponSets[unit.activeWeaponSet].mainHand
  const weaponName = mainHandId ? (equipment.find((e) => e.id === mainHandId)?.name ?? mainHandId) : 'Unarmed'

  const destId   = unit.travelPath?.at(-1) ?? null
  const destName = destId ? (locations.find((l) => l.id === destId)?.name ?? destId) : null

  const inCombat = slots.length > 0 && !isRecovering && fleeing === 0

  const hitFraction = targetSlotObj && targetSlotObj.takenHistory.length > 0
    ? targetSlotObj.takenHistory.filter(c => c > 0).length / targetSlotObj.takenHistory.length
    : 1
  const dpsDealt = inCombat && targetMonster && targetPhase === 'standing'
    ? hitFraction * targetMonster.health / (targetMonster.level * 5)
    : null

  const lastDmgDealt = targetMonster && targetSlotObj && !targetSlotObj.lastProgressMissed
    ? Math.round((targetSlotObj.takenHistory.at(-1) ?? 0) * targetMonster.health)
    : null

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
    <button
      onClick={onTap}
      className={[
        'w-full text-left rounded-lg border bg-game-surface px-2.5 py-2 space-y-1.5 transition-colors',
        isSelected
          ? 'border-game-primary bg-game-primary/10'
          : 'border-game-border hover:border-game-primary/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-game-text truncate">{unit.name}</span>
          <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{unit.level}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[11px] font-mono font-semibold ${hpTextColor(hpPct)}`}>{unit.health}/{derived.maxHp}</span>
          {dpsTaken !== null && dpsTaken > 0 ? (
            <span className="text-[10px] text-red-400">-{dpsTaken.toFixed(1)}/s</span>
          ) : unit.isResting ? (
            <span className="text-[10px] text-sky-400">+{RESTING_REGEN_RATE * TICKS_PER_SECOND}/s</span>
          ) : unit.locationId === null ? (
            <span className="text-[10px] text-game-green">+{REGEN_RATE * TICKS_PER_SECOND}/s</span>
          ) : null}
        </div>
      </div>

      <div className="w-full bg-game-border/60 rounded-full h-1.5 overflow-hidden">
        {isRecovering ? (
          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100}%`, transition: 'none' }} />
        ) : unit.isResting ? (
          <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
        ) : (
          <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
        )}
      </div>
      <div className="w-full bg-game-border/60 rounded-full h-1 overflow-hidden">
        <div className="bg-game-primary h-1 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (unit.exp / unit.expToNext) * 100)}%` }} />
      </div>

      <div className="flex items-center gap-1 text-[11px] flex-wrap min-h-[18px]">
        {isRecovering ? (
          <span className="text-purple-400">KO</span>
        ) : unit.isResting ? (
          <span className="text-sky-400">Resting</span>
        ) : fleeing > 0 ? (
          <span className="text-sky-400">Fleeing</span>
        ) : targetMonster && targetPhase === 'approaching' ? (
          <>
            <span className="text-game-muted">approaching</span>
            <span className="text-game-text font-medium">→ {targetMonsterName}</span>
          </>
        ) : targetMonster ? (
          <>
            <span className="text-game-text font-medium">→ {targetMonsterName}</span>
            <span className="text-game-text-dim">w/ {weaponName}</span>
            {dpsDealt !== null && <span className="text-amber-400">{dpsDealt.toFixed(1)}/s</span>}
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
        <div className="text-[10px] text-sky-400 truncate">→ traveling to {destName}</div>
      )}
    </button>
  )
}

// ── BigMonsterCard ────────────────────────────────────────────────────────────

function BigMonsterCard({ slotIndex, locationId, isSelected, onTap }: {
  slotIndex: number; locationId: string; isSelected: boolean; onTap: () => void
}) {
  const equipment          = useGameStore((s) => s.equipment)
  const allUnits           = useGameStore((s) => s.units)
  const allSlots           = useGameStore((s) => s.encounters[locationId] ?? [])
  const slot               = allSlots[slotIndex] ?? null
  const locationFleeing    = useGameStore((s) => s.locationFleeing[locationId] ?? 0)

  const barRef   = useRef<HTMLDivElement>(null)
  const prevProg = useRef(slot?.progress ?? 0)

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

  const behavior   = slot.behavior ?? 'normal'
  const isFleeing  = locationFleeing > 0
  const targetUnit = !isFleeing ? allUnits.find((u) => u.id === slot.targetUnitId) : null
  const hpPct      = Math.max(0, Math.round((1 - slot.progress) * 100))
  const currentHp  = Math.round((1 - slot.progress) * monster.health)
  const phase      = slot.phase ?? 'standing'
  const hpColor    = hpPct >= 75 ? 'text-game-green' : hpPct >= 40 ? 'text-game-gold' : 'text-red-400'

  const targetDerived = targetUnit ? getDerivedStats(targetUnit, equipment) : null
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

  const borderCls = isSelected            ? 'border-game-primary bg-game-primary/10' :
                    behavior === 'prioritize' ? 'border-amber-700/60' :
                    behavior === 'avoid'      ? 'border-sky-700/60'   : 'border-game-border'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      className={`cursor-pointer rounded-lg border bg-game-bg px-2.5 py-2 space-y-1.5 transition-colors ${borderCls} ${behavior === 'ignore' ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1 flex-wrap min-w-0">
        <span className="text-sm font-semibold text-game-text truncate">{slotDisplayName(allSlots, slotIndex)}</span>
        <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{monster.level}</span>
        <ElementBadge element={monster.element} />
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex-1 bg-game-border/60 rounded-full h-1.5 overflow-hidden">
          <div ref={barRef} className="bg-red-500 h-1.5 rounded-full" style={{ width: `${hpPct}%` }} />
        </div>
        <span className={`text-[10px] font-medium tabular-nums shrink-0 ${hpColor}`}>{currentHp}/{monster.health}</span>
        {monsterDrainRate !== null && (
          <span className="text-[10px] text-red-400 shrink-0">-{monsterDrainRate.toFixed(1)}/s</span>
        )}
      </div>

      <div className="flex items-center gap-1 text-[11px] flex-wrap min-h-[18px]">
        {isFleeing ? (
          <span className="text-sky-400">target lost</span>
        ) : targetUnit && phase !== 'retreating' ? (
          <>
            <span className="text-game-text font-medium">→ {targetUnit.name}</span>
            <span className="text-game-text-dim">w/ {monster.attackName}</span>
            {monsterDealtDps !== null && <span className="text-red-400">{monsterDealtDps.toFixed(1)}/s</span>}
            {slot.lastAttackMissed
              ? <span className="text-[10px] font-semibold text-game-muted">(MISS)</span>
              : lastHitDmg !== null && lastHitDmg > 0
              ? <span className="text-[10px] font-semibold text-red-300">({Math.round(lastHitDmg)})</span>
              : null}
          </>
        ) : phase === 'approaching' ? (
          <span className="text-game-muted italic">approaching...</span>
        ) : (
          <span className="text-game-muted italic">no target</span>
        )}
      </div>
    </div>
  )
}

// ── RosterChunk ───────────────────────────────────────────────────────────────

function RosterChunk({ location, units, isFocused, onPick }: {
  location: Location; units: Unit[]; isFocused: boolean; onPick: () => void
}) {
  return (
    <button
      onClick={onPick}
      className={[
        'shrink-0 px-3 py-2 border-b text-left transition-colors flex items-center gap-2',
        isFocused
          ? 'border-game-primary bg-game-primary/15'
          : 'border-game-border bg-game-surface hover:bg-white/5',
      ].join(' ')}
    >
      <span className="text-sm font-semibold text-game-text truncate">{location.name}</span>
      <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">
        {units.length}
      </span>
    </button>
  )
}

// ── FullUnitDetailPanel ───────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center px-2 py-1.5 rounded bg-game-border/30 border border-game-border/40">
      <span className="text-[10px] uppercase tracking-wider text-game-text-dim">{label}</span>
      <span className="text-sm font-mono font-semibold text-game-text">{value}</span>
    </div>
  )
}

function FullUnitDetailPanel({ unit, locationId, onClose, onView }: {
  unit: Unit; locationId: string; onClose: () => void; onView: () => void
}) {
  const equipment = useGameStore((s) => s.equipment)
  const allUnits  = useGameStore((s) => s.units)
  const slots     = useGameStore((s) => s.encounters[locationId] ?? [])
  const fleeing   = useGameStore((s) => s.locationFleeing[locationId] ?? 0)

  const derived      = getDerivedStats(unit, equipment)
  const traits       = getUnitTraits(unit)
  const isRecovering = unit.recoveryTicksLeft > 0
  const hpPct        = Math.max(0, Math.min(100, (unit.health / derived.maxHp) * 100))

  const alive          = allUnits.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
  const idx            = alive.findIndex((u) => u.id === unit.id)
  const prioritySlots  = slots.filter((sl) => sl.behavior === 'prioritize')
  const normalSlots    = slots.filter((sl) => sl.behavior === 'normal')
  const focusSlots     = prioritySlots.length > 0 ? prioritySlots : normalSlots
  const targetSlotObj  = idx >= 0 && focusSlots.length > 0 ? focusSlots[idx % focusSlots.length] : null
  const targetSlotIdx  = targetSlotObj ? slots.indexOf(targetSlotObj) : -1
  const targetMonster  = targetSlotObj ? (MONSTER_REGISTRY[targetSlotObj.monsterId] ?? null) : null
  const targetMonsterName = targetSlotIdx >= 0 ? slotDisplayName(slots, targetSlotIdx) : (targetMonster?.name ?? null)
  const targetPhase    = targetSlotObj?.phase ?? 'standing'

  const mainHandId = unit.weaponSets[unit.activeWeaponSet].mainHand
  const weaponName = mainHandId ? (equipment.find((e) => e.id === mainHandId)?.name ?? mainHandId) : 'Unarmed'

  const inCombat = slots.length > 0 && !isRecovering && fleeing === 0
  const hitFraction = targetSlotObj && targetSlotObj.takenHistory.length > 0
    ? targetSlotObj.takenHistory.filter(c => c > 0).length / targetSlotObj.takenHistory.length
    : 1
  const dpsDealt = inCombat && targetMonster && targetPhase === 'standing'
    ? hitFraction * targetMonster.health / (targetMonster.level * 5)
    : null
  const lastDmgDealt = targetMonster && targetSlotObj && !targetSlotObj.lastProgressMissed
    ? Math.round((targetSlotObj.takenHistory.at(-1) ?? 0) * targetMonster.health)
    : null
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
    <div className="rounded-xl border-2 border-game-primary bg-indigo-950 px-3 py-2.5 space-y-2 shadow-2xl shadow-game-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-base font-semibold text-game-text">{unit.name}</span>
          <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{unit.level}</span>
          {unit.class && <span className="text-[10px] text-game-text-dim border border-game-border rounded px-1.5 py-0.5">{unit.class}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-sm font-mono font-semibold ${hpTextColor(hpPct)}`}>{unit.health}/{derived.maxHp}</span>
          {dpsTaken !== null && dpsTaken > 0 ? (
            <span className="text-[10px] text-red-400">-{dpsTaken.toFixed(1)}/s</span>
          ) : unit.isResting ? (
            <span className="text-[10px] text-sky-400">+{RESTING_REGEN_RATE * TICKS_PER_SECOND}/s</span>
          ) : unit.locationId === null ? (
            <span className="text-[10px] text-game-green">+{REGEN_RATE * TICKS_PER_SECOND}/s</span>
          ) : null}
          <button onClick={onView} className="text-xs py-1 px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">View ›</button>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs">✕</button>
        </div>
      </div>

      <div className="w-full bg-game-border/60 rounded-full h-2 overflow-hidden">
        {isRecovering ? (
          <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100}%`, transition: 'none' }} />
        ) : unit.isResting ? (
          <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
        ) : (
          <div className={`${hpBarColor(hpPct)} h-2 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
        )}
      </div>
      <div className="w-full bg-game-border/60 rounded-full h-1 overflow-hidden">
        <div className="bg-game-primary h-1 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (unit.exp / unit.expToNext) * 100)}%` }} />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <StatTile label="ATK" value={derived.attack} />
        <StatTile label="DEF" value={derived.defense} />
        <StatTile label="SPD" value={derived.attackSpeed} />
        <StatTile label="ACC" value={derived.accuracy} />
      </div>

      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {traits.map((t) => (
            <span key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${t.colorClass ?? 'text-game-text-dim border-game-border/50 bg-game-border/20'}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs flex-wrap min-h-[20px]">
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
    </div>
  )
}

// ── FullMonsterDetailPanel ────────────────────────────────────────────────────

function FullMonsterDetailPanel({ locationId, slotIndex, onClose, onOpenCodex }: {
  locationId: string; slotIndex: number; onClose: () => void; onOpenCodex: (monsterId: string) => void
}) {
  const equipment          = useGameStore((s) => s.equipment)
  const allUnits           = useGameStore((s) => s.units)
  const allSlots           = useGameStore((s) => s.encounters[locationId] ?? [])
  const slot               = allSlots[slotIndex] ?? null
  const setMonsterBehavior = useGameStore((s) => s.setMonsterBehavior)
  const locationFleeing    = useGameStore((s) => s.locationFleeing[locationId] ?? 0)

  if (!slot) return null
  const monster = MONSTER_REGISTRY[slot.monsterId]
  if (!monster) return null

  const behavior   = slot.behavior ?? 'normal'
  const isFleeing  = locationFleeing > 0
  const targetUnit = !isFleeing ? allUnits.find((u) => u.id === slot.targetUnitId) : null
  const hpPct      = Math.max(0, Math.round((1 - slot.progress) * 100))
  const currentHp  = Math.round((1 - slot.progress) * monster.health)
  const phase      = slot.phase ?? 'standing'
  const hpColor    = hpPct >= 75 ? 'text-game-green' : hpPct >= 40 ? 'text-game-gold' : 'text-red-400'

  const targetDerived = targetUnit ? getDerivedStats(targetUnit, equipment) : null
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

  return (
    <div className="rounded-xl border-2 border-game-primary bg-indigo-950 px-3 py-2.5 space-y-2 shadow-2xl shadow-game-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-base font-semibold text-game-text">{slotDisplayName(allSlots, slotIndex)}</span>
          <span className="text-[10px] text-game-text-dim bg-game-border/60 rounded-full px-1.5 py-0.5">Lv.{monster.level}</span>
          <ElementBadge element={monster.element} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-sm font-mono font-semibold ${hpColor}`}>{currentHp}/{monster.health}</span>
          {monsterDrainRate !== null && (
            <span className="text-[10px] text-red-400">-{monsterDrainRate.toFixed(1)}/s</span>
          )}
          <button onClick={() => onOpenCodex(monster.id)} className="text-xs py-1 px-2 rounded-lg border border-game-accent/40 text-game-accent hover:bg-game-accent/10 hover:border-game-accent transition-colors">Codex →</button>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs">✕</button>
        </div>
      </div>

      <div className="w-full bg-game-border/60 rounded-full h-2 overflow-hidden">
        <div className="bg-red-500 h-2 rounded-full transition-none" style={{ width: `${hpPct}%` }} />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <StatTile label="ATK" value={monster.stats.attack} />
        <StatTile label="DEF" value={monster.stats.defense[0] + monster.stats.defense[1]} />
        <StatTile label="SPD" value={monster.stats.attackSpeed} />
        <StatTile label="ACC" value={monster.stats.accuracy} />
      </div>

      <div className="flex items-center gap-1.5 text-xs flex-wrap min-h-[20px]">
        {isFleeing ? (
          <span className="text-sky-400">target lost</span>
        ) : targetUnit && phase !== 'retreating' ? (
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

// ── Combat ────────────────────────────────────────────────────────────────────

export function Combat() {
  const units                  = useGameStore((s) => s.units)
  const locations              = useGameStore((s) => s.locations)
  const combatLocationId       = useGameStore((s) => s.combatLocationId)
  const setCombatLocation      = useGameStore((s) => s.setCombatLocation)
  const allEncounters          = useGameStore((s) => s.encounters)
  const selectedUnitIds        = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit       = useGameStore((s) => s.toggleSelectUnit)
  const clearSelection         = useGameStore((s) => s.clearSelection)
  const selectedMonsterSlot    = useGameStore((s) => s.selectedMonsterSlot)
  const setSelectedMonsterSlot = useGameStore((s) => s.setSelectedMonsterSlot)
  const setActiveTab           = useGameStore((s) => s.setActiveTab)
  const toggleUnit             = useGameStore((s) => s.toggleUnit)
  const expandedUnitIds        = useGameStore((s) => s.expandedUnitIds)

  const [codexMonsterId, setCodexMonsterId] = useState<string | null>(null)
  const [locationCodexOpen, setLocationCodexOpen] = useState(false)
  const [combatReportOpen, setCombatReportOpen] = useState(false)
  const codexSeenCount = useGameStore((s) => codexMonsterId ? (s.monsterSeen[codexMonsterId] ?? 0) : 0)

  const occupiedLocations = locations.filter((l) => units.some((u) => u.locationId === l.id))

  const focusId = combatLocationId && occupiedLocations.some((l) => l.id === combatLocationId)
    ? combatLocationId
    : (occupiedLocations[0]?.id ?? null)

  const focusedLocation = focusId ? (locations.find((l) => l.id === focusId) ?? null) : null
  const focusedUnits    = focusId ? units.filter((u) => u.locationId === focusId) : []
  const monsterSlots    = focusId ? (allEncounters[focusId] ?? []) : []

  // Only surface the detail panel for selections that belong to the focused location.
  const detailUnit = focusedUnits.find((u) => selectedUnitIds.includes(u.id)) ?? null
  const detailMonsterSlotIndex = selectedMonsterSlot && selectedMonsterSlot.locationId === focusId
    && selectedMonsterSlot.slotIndex < monsterSlots.length
      ? selectedMonsterSlot.slotIndex : -1
  const hasDetail = detailUnit !== null || detailMonsterSlotIndex >= 0

  const handleViewUnit = () => {
    if (!detailUnit) return
    if (!expandedUnitIds.includes(detailUnit.id)) toggleUnit(detailUnit.id)
    setActiveTab('units')
    clearSelection()
  }

  return (
    <>
      <div className={`p-4 ${hasDetail ? 'pb-96' : 'pb-8'}`}>
        {/* Roster groups */}
        {occupiedLocations.length > 0 ? (
          <div className="-mx-4 -mt-7 overflow-x-auto">
            <div className="flex gap-px">
              {occupiedLocations.map((loc) => (
                <RosterChunk
                  key={loc.id}
                  location={loc}
                  units={units.filter((u) => u.locationId === loc.id)}
                  isFocused={focusId === loc.id}
                  onPick={() => setCombatLocation(loc.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-game-muted italic py-12">
            No units are assigned to any location. Assign units on the Map tab.
          </div>
        )}

        {/* Single focused location encounter */}
        {focusedLocation && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-game-text-dim uppercase tracking-widest">{focusedLocation.name}</h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setCombatReportOpen(true)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-game-gold/40 text-game-gold hover:bg-game-gold/10 hover:border-game-gold transition-colors"
                >
                  Report ↗
                </button>
                <button
                  onClick={() => setLocationCodexOpen(true)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-game-accent/40 text-game-accent hover:bg-game-accent/10 hover:border-game-accent transition-colors"
                >
                  Location Codex →
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Units</div>
                {focusedUnits.length > 0 ? (
                  focusedUnits.map((u) => (
                    <BigUnitCard
                      key={u.id}
                      unit={u}
                      locationId={focusedLocation.id}
                      isSelected={selectedUnitIds.includes(u.id)}
                      onTap={() => toggleSelectUnit(u.id)}
                    />
                  ))
                ) : (
                  <div className="text-xs text-game-muted italic">No units here.</div>
                )}
              </div>
              <div className="space-y-2 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-game-text-dim text-right">Encounter</div>
                {monsterSlots.length > 0 ? (
                  monsterSlots.map((_, i) => {
                    const isSel = selectedMonsterSlot?.locationId === focusedLocation.id && selectedMonsterSlot?.slotIndex === i
                    return (
                      <BigMonsterCard
                        key={i}
                        slotIndex={i}
                        locationId={focusedLocation.id}
                        isSelected={isSel}
                        onTap={() => setSelectedMonsterSlot(isSel ? null : { locationId: focusedLocation.id, slotIndex: i })}
                      />
                    )
                  })
                ) : (
                  <div className="text-xs text-game-muted italic text-right">No active encounter.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {hasDetail && focusedLocation && (
        <div className="fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2 max-w-2xl mx-auto">
            {detailMonsterSlotIndex >= 0 && (
              <FullMonsterDetailPanel
                locationId={focusedLocation.id}
                slotIndex={detailMonsterSlotIndex}
                onClose={() => setSelectedMonsterSlot(null)}
                onOpenCodex={(id) => setCodexMonsterId(id)}
              />
            )}
            {detailUnit && (
              <FullUnitDetailPanel
                unit={detailUnit}
                locationId={focusedLocation.id}
                onClose={() => clearSelection()}
                onView={handleViewUnit}
              />
            )}
          </div>
        </div>
      )}

      {codexMonsterId && MONSTER_REGISTRY[codexMonsterId] && (
        <MonsterCodex
          monster={MONSTER_REGISTRY[codexMonsterId]}
          seenCount={codexSeenCount}
          onClose={() => setCodexMonsterId(null)}
        />
      )}
      {locationCodexOpen && focusedLocation && (
        <LocationCodex location={focusedLocation} onClose={() => setLocationCodexOpen(false)} />
      )}
      {combatReportOpen && focusedLocation && (
        <CombatReport
          locationId={focusedLocation.id}
          locationName={focusedLocation.name}
          onClose={() => setCombatReportOpen(false)}
        />
      )}
    </>
  )
}
