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
import { useGameStore, MONSTER_REGISTRY, RECOVERY_TICKS, getDerivedStats, getUnitTraits, type MonsterBehavior, type Unit, type Location, type MonsterDef } from '@/stores/useGameStore'

const REGIONS = [
  { id: 'prontera', name: 'Prontera Region' },
  { id: 'geffen',   name: 'Geffen Region' },
  { id: 'kanto',    name: 'Kanto' },
]
import { MonsterCodex } from '@/components/MonsterCodex'

// ── UnitRect ──────────────────────────────────────────────────────────────────

function hpBarColor(health: number) {
  if (health > 60) return 'bg-game-green'
  if (health > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

function UnitRect({ unit, overlay = false, targetMonsterName = null, isFleeing = false, isHunting = false }: {
  unit: Unit; overlay?: boolean; targetMonsterName?: string | null; isFleeing?: boolean; isHunting?: boolean
}) {
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const isSelected       = selectedUnitIds.includes(unit.id)
  const isRecovering     = unit.recoveryTicksLeft > 0
  const hpPct            = Math.max(0, Math.min(100, unit.health))
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
          {isRecovering && <div className="text-[10px] text-purple-400 mt-0.5">KO</div>}
          {!isRecovering && isFleeing && <div className="text-[10px] text-sky-400 mt-0.5">fleeing</div>}
          {!isRecovering && !isFleeing && isHunting && <div className="text-[10px] text-amber-400 mt-0.5">hunting...</div>}
          {!isRecovering && !isFleeing && !isHunting && targetMonsterName && (
            <div className="text-[10px] text-game-text-dim mt-0.5 truncate">→ {targetMonsterName}</div>
          )}
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

  const isHunting = (() => {
    if (isFleeing || !unit.locationId || unit.health <= 0 || unit.recoveryTicksLeft > 0) return false
    return slots.length === 0
  })()

  const targetMonsterName = (() => {
    if (isFleeing || isHunting || !unit.locationId || slots.length === 0 || unit.health <= 0 || unit.recoveryTicksLeft > 0) return null
    const alive = allUnits.filter((u) => u.locationId === unit.locationId && u.health > 0 && u.recoveryTicksLeft === 0)
    const idx   = alive.findIndex((u) => u.id === unit.id)
    if (idx === -1) return null
    const prioritySlots = slots.filter((sl) => sl.behavior === 'prioritize' && sl.progress < 1)
    const normalSlots   = slots.filter((sl) => sl.behavior === 'normal'     && sl.progress < 1)
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

// ── MonsterList ───────────────────────────────────────────────────────────────

function EncounterDots({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="flex justify-center gap-0.5 mb-1">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="block w-2 h-2 rounded-full bg-game-green animate-pulse" />
      ))}
    </div>
  )
}

function SlotBar({ prog, targetName }: { prog: number; targetName: string | null }) {
  const barRef   = useRef<HTMLDivElement>(null)
  const prevProg = useRef(prog)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const resetting = prog === 0 && prevProg.current > 0
    bar.style.transition = resetting ? 'none' : 'width 0.9s linear'
    bar.style.width      = `${(1 - prog) * 100}%`
    prevProg.current = prog
  })

  return (
    <div>
      <div className="w-full bg-game-border rounded-full h-1.5 overflow-hidden">
        <div ref={barRef} className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(1 - prog) * 100}%` }} />
      </div>
      {targetName && <div className="text-[10px] text-game-text-dim text-right mt-0.5">→ {targetName}</div>}
    </div>
  )
}

const BEHAVIOR_OPTIONS: { b: MonsterBehavior; label: string; desc: string; activeClass: string }[] = [
  { b: 'normal',     label: 'Normal',     desc: 'Fight normally',                          activeClass: 'border-game-primary bg-game-primary/10 text-game-text' },
  { b: 'prioritize', label: 'Prioritize', desc: 'Focus entire party on this first',        activeClass: 'border-amber-600 bg-amber-950/50 text-amber-300' },
  { b: 'ignore',     label: 'Ignore',     desc: 'Skip this monster; flee if only it remains', activeClass: 'border-game-border bg-game-border/20 text-game-text-dim' },
  { b: 'avoid',      label: 'Avoid',      desc: 'Flee the encounter immediately if present',  activeClass: 'border-sky-600 bg-sky-950/50 text-sky-300' },
]

function MonsterBehaviorPanel({
  monster, locationId, onClose, onOpenCodex,
}: { monster: MonsterDef; locationId: string; onClose: () => void; onOpenCodex: () => void }) {
  const behavior           = useGameStore((s) => (s.encounters[locationId] ?? []).find((sl) => sl.monsterId === monster.id)?.behavior ?? 'normal')
  const setMonsterBehavior = useGameStore((s) => s.setMonsterBehavior)
  const active             = BEHAVIOR_OPTIONS.find((o) => o.b === behavior)!

  return (
    <div className="mt-2 rounded-xl border border-game-border bg-game-bg px-3 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-game-text-dim">{monster.name}</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded text-game-text-dim hover:text-game-text hover:bg-white/5 text-xs">✕</button>
      </div>
      <div className="flex gap-1">
        {BEHAVIOR_OPTIONS.map(({ b, label, activeClass }) => {
          const isActive = behavior === b
          return (
            <button
              key={b}
              onClick={() => setMonsterBehavior(locationId, monster.id, b)}
              className={`flex-1 py-1 rounded-md border text-xs font-medium transition-colors ${isActive ? activeClass : 'border-game-border/50 text-game-text-dim hover:border-game-border hover:text-game-text'}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-game-text-dim">{active.desc}</span>
        <button onClick={onOpenCodex} className="text-xs font-medium px-2 py-0.5 rounded border border-game-accent/50 text-game-accent hover:bg-game-accent/10 hover:border-game-accent transition-colors shrink-0 ml-2">Codex →</button>
      </div>
    </div>
  )
}

function MonsterRow({ monsterId, locationId, selected, onSelect }: {
  monsterId: string; locationId: string; selected: boolean; onSelect: () => void
}) {
  const [codexOpen, setCodexOpen] = useState(false)
  const seenCount       = useGameStore((s) => s.monsterSeen[monsterId] ?? 0)
  const locationSlots   = useGameStore((s) => s.encounters[locationId] ?? [])
  const locationFleeing = useGameStore((s) => s.locationFleeing[locationId] ?? 0)
  const units           = useGameStore((s) => s.units)
  const monster         = MONSTER_REGISTRY[monsterId]

  const slotData = locationSlots.filter((sl) => sl.monsterId === monsterId)
  const behavior = locationSlots.find((sl) => sl.monsterId === monsterId)?.behavior ?? 'normal'

  if (!monster) return null

  const isFleeing = locationFleeing > 0
  const borderCls =
    selected         ? 'border-game-primary bg-game-primary/10' :
    behavior === 'prioritize' ? 'border-amber-700/60' :
    behavior === 'avoid'      ? 'border-sky-700/60'   : 'border-game-border'

  return (
    <>
      <div className="flex flex-col items-center gap-1" style={{ minWidth: 72 }}>
        <EncounterDots count={slotData.length} />
        <button
          onClick={onSelect}
          className={`w-full px-3 py-2 rounded-lg border bg-game-bg text-center transition-colors ${borderCls} ${behavior === 'ignore' ? 'opacity-50' : ''}`}
        >
          <div className="text-sm font-semibold text-game-text">{monster.name}</div>
          <div className="text-xs text-game-accent">Lv.{monster.level}</div>
        </button>
        {slotData.length > 0 && (
          <div className="w-full space-y-1">
            {slotData.map((sl, i) => {
              const targetName = !isFleeing && sl.targetUnitId ? (units.find((u) => u.id === sl.targetUnitId)?.name ?? null) : null
              return <SlotBar key={i} prog={sl.progress} targetName={targetName} />
            })}
          </div>
        )}
      </div>
      {codexOpen && <MonsterCodex monster={monster} seenCount={seenCount} onClose={() => setCodexOpen(false)} />}
    </>
  )
}

function MonsterList({ location }: { location: Location }) {
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null)
  const familiarity          = useGameStore((s) => s.locationFamiliarity[location.id] ?? 0)
  const locationMonstersSeen = useGameStore((s) => s.locationMonstersSeen[location.id] ?? [])
  const famPct               = Math.round((familiarity / location.familiarityMax) * 100)
  const unknownCount         = location.monsterIds.length - locationMonstersSeen.length
  const [codexMonster, setCodexMonster] = useState<string | null>(null)
  const seenCount = useGameStore((s) => codexMonster ? (s.monsterSeen[codexMonster] ?? 0) : 0)

  const toggleSelect = (id: string) => setSelectedMonsterId(v => v === id ? null : id)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-widest text-game-text-dim">Monsters</div>
        <div className="text-xs text-game-accent">{famPct}% familiarity</div>
      </div>
      {famPct === 0 ? (
        <p className="text-xs text-game-muted italic">
          {location.monsterIds.length} monsters inhabit this area. Explore to learn more.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            {locationMonstersSeen.map((id) => (
              <MonsterRow
                key={id}
                monsterId={id}
                locationId={location.id}
                selected={selectedMonsterId === id}
                onSelect={() => toggleSelect(id)}
              />
            ))}
            {unknownCount > 0 && (
              <div className="px-3 py-2 rounded-lg border border-dashed border-game-border bg-game-bg text-center min-w-[72px] opacity-50">
                <div className="text-sm text-game-muted">+{unknownCount}</div>
                <div className="text-xs text-game-muted">unknown</div>
              </div>
            )}
          </div>
          {selectedMonsterId && MONSTER_REGISTRY[selectedMonsterId] && (
            <MonsterBehaviorPanel
              monster={MONSTER_REGISTRY[selectedMonsterId]}
              locationId={location.id}
              onClose={() => setSelectedMonsterId(null)}
              onOpenCodex={() => { setCodexMonster(selectedMonsterId); setSelectedMonsterId(null) }}
            />
          )}
        </>
      )}
      {codexMonster && MONSTER_REGISTRY[codexMonster] && (
        <MonsterCodex
          monster={MONSTER_REGISTRY[codexMonster]}
          seenCount={seenCount}
          onClose={() => setCodexMonster(null)}
        />
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

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-lg border transition-colors duration-150 overflow-hidden',
        isOver   ? 'border-game-primary bg-game-primary/5' : 'border-game-border',
        isEmpty  ? 'bg-transparent'                        : '',
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

      {units.length > 0 && !isExpanded && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {units.map((u) => (
            <DraggableUnit key={u.id} unit={u} groupDragging={selectedDragging.includes(u.id)} />
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-game-border space-y-4">
          <p className="text-game-text-dim text-sm mt-3">{location.description}</p>
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

function hpTextColor(hp: number) { return hp >= 75 ? 'text-game-green' : hp >= 40 ? 'text-game-gold' : 'text-red-400' }

function SelectionBar() {
  const { selectedUnitIds, expandedUnitIds, locations, units, equipment, assignUnits, clearSelection, setActiveTab, toggleUnit } = useGameStore()
  const [open, setOpen] = useState(false)

  if (selectedUnitIds.length === 0) return null

  const singleUnit = selectedUnitIds.length === 1 ? units.find((u) => u.id === selectedUnitIds[0]) ?? null : null
  const derived    = singleUnit ? getDerivedStats(singleUnit, equipment) : null
  const elements   = singleUnit ? getUnitTraits(singleUnit).filter((t) => t.category === 'element') : []

  const handleAssign = (locationId: string | null) => {
    assignUnits(selectedUnitIds, locationId)
    setOpen(false)
  }

  const handleViewUnit = () => {
    const unitId = selectedUnitIds[0]
    if (!expandedUnitIds.includes(unitId)) toggleUnit(unitId)
    setActiveTab('units')
    clearSelection()
  }

  return (
    <div className="fixed bottom-4 inset-x-0 z-30 px-4 pointer-events-none">
      <div className="pointer-events-auto space-y-2">

        {singleUnit && derived && (
          <div className="bg-game-surface border border-game-border rounded-xl p-3 shadow-2xl">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="font-semibold text-game-text text-sm">{singleUnit.name}</span>
                {singleUnit.class && (
                  <span className="ml-2 text-xs text-game-text-dim px-1.5 py-0.5 rounded border border-game-border">{singleUnit.class}</span>
                )}
              </div>
              <span className={`text-sm font-mono font-semibold ${hpTextColor(singleUnit.health)}`}>{singleUnit.health} HP</span>
            </div>
            <div className="w-full bg-game-border rounded-full h-1.5 mb-2">
              <div
                className={`h-1.5 rounded-full transition-all ${hpBarColor(singleUnit.health)}`}
                style={{ width: `${singleUnit.health}%` }}
              />
            </div>
            {elements.length > 0 && (
              <div className="flex gap-1 mb-2">
                {elements.map((t) => (
                  <span key={t.id} className={`text-xs px-1.5 py-0.5 rounded border ${t.colorClass}`}>{t.label}</span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-4 gap-1 text-xs">
              {([['ATK', derived.attack], ['DEF', derived.defense], ['SPD', derived.attackSpeed], ['ACC', derived.accuracy]] as const).map(([label, val]) => (
                <div key={label} className="text-center bg-game-border/30 rounded p-1">
                  <div className="text-game-text-dim">{label}</div>
                  <div className="font-semibold text-game-text">{Math.round(val as number)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-game-surface border border-game-primary rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-game-primary/30">
          <span className="flex-1 text-sm font-medium">{selectedUnitIds.length} selected</span>
          {selectedUnitIds.length === 1 && (
            <button
              className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors"
              onClick={handleViewUnit}
            >
              View ›
            </button>
          )}
          <div className="relative">
            <button
              className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
              onClick={() => setOpen((v) => !v)}
            >
              Move to <span className="text-xs opacity-70">▾</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute bottom-full mb-2 right-0 z-20 bg-game-surface border border-game-border rounded-xl overflow-hidden w-52 shadow-2xl">
                  <button
                    className="w-full text-left px-4 py-3 text-sm text-game-text-dim hover:bg-white/5 transition-colors"
                    onClick={() => handleAssign(null)}
                  >
                    Unassigned
                  </button>
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-t border-game-border/50"
                      onClick={() => handleAssign(loc.id)}
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-game-text-dim hover:text-game-text hover:bg-white/5 transition-colors"
            onClick={clearSelection}
          >
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

      <SelectionBar />

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
