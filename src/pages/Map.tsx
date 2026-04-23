import { useState } from 'react'
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
import { useGameStore, TRAIT_REGISTRY, MONSTER_REGISTRY, RECOVERY_TICKS, getDerivedStats, getUnitTraits, type Unit, type Location } from '@/stores/useGameStore'
import { TraitRow } from '@/components/TraitBubble'
import { MonsterCodex } from '@/components/MonsterCodex'

// ── UnitRect ──────────────────────────────────────────────────────────────────

function hpBarColor(health: number) {
  if (health > 60) return 'bg-game-green'
  if (health > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

function UnitRect({ unit, overlay = false, targetMonsterName = null }: {
  unit: Unit; overlay?: boolean; targetMonsterName?: string | null
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
          {!isRecovering && targetMonsterName && (
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
  const allUnits = useGameStore((s) => s.units)
  const slots    = useGameStore((s) => unit.locationId ? (s.activeEncounters[unit.locationId] ?? []) : [])

  const targetMonsterName = (() => {
    if (!unit.locationId || slots.length === 0 || unit.health <= 0 || unit.recoveryTicksLeft > 0) return null
    const alive = allUnits.filter((u) => u.locationId === unit.locationId && u.health > 0 && u.recoveryTicksLeft === 0)
    const idx   = alive.findIndex((u) => u.id === unit.id)
    if (idx === -1) return null
    const monsterId = slots[idx % slots.length]
    return MONSTER_REGISTRY[monsterId]?.name ?? null
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
      <UnitRect unit={unit} targetMonsterName={targetMonsterName} />
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

function MonsterRow({ monsterId, locationId }: { monsterId: string; locationId: string }) {
  const [codexOpen, setCodexOpen] = useState(false)
  const seenCount         = useGameStore((s) => s.monsterSeen[monsterId] ?? 0)
  const activeSlots       = useGameStore((s) => s.activeEncounters[locationId] ?? [])
  const encounterProgress = useGameStore((s) => s.encounterProgress[locationId] ?? [])
  const encounterTargets  = useGameStore((s) => s.encounterTargets[locationId] ?? [])
  const units             = useGameStore((s) => s.units)
  const monster           = MONSTER_REGISTRY[monsterId]

  const slotData = activeSlots
    .map((id, i) => ({ id, prog: encounterProgress[i] ?? 0, targetId: encounterTargets[i] ?? null }))
    .filter(({ id }) => id === monsterId)

  if (!monster) return null

  return (
    <>
      <div className="flex flex-col items-center gap-1" style={{ minWidth: 72 }}>
        <EncounterDots count={slotData.length} />
        <button
          onClick={() => setCodexOpen(true)}
          className="w-full px-3 py-2 rounded-lg border border-game-border bg-game-bg text-center hover:border-game-accent/60 hover:bg-game-accent/5 transition-colors"
        >
          <div className="text-sm font-semibold text-game-text">{monster.name}</div>
          <div className="text-xs text-game-accent">Lv.{monster.level}</div>
        </button>
        {slotData.length > 0 && (
          <div className="w-full space-y-1">
            {slotData.map(({ prog, targetId }, i) => {
              const targetName = targetId ? units.find((u) => u.id === targetId)?.name : null
              return (
                <div key={i}>
                  <div className="w-full bg-game-border rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-red-500 h-1.5 rounded-full"
                      style={{ width: `${(1 - prog) * 100}%`, transition: prog === 0 ? 'none' : 'width 0.7s linear' }}
                    />
                  </div>
                  {targetName && (
                    <div className="text-[10px] text-game-text-dim text-right mt-0.5">→ {targetName}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {codexOpen && <MonsterCodex monster={monster} seenCount={seenCount} onClose={() => setCodexOpen(false)} />}
    </>
  )
}

function MonsterList({ location }: { location: Location }) {
  const familiarity         = useGameStore((s) => s.locationFamiliarity[location.id] ?? 0)
  const locationMonstersSeen = useGameStore((s) => s.locationMonstersSeen[location.id] ?? [])
  const famPct              = Math.round((familiarity / location.familiarityMax) * 100)
  const unknownCount        = location.monsterIds.length - locationMonstersSeen.length

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
        <div className="flex flex-wrap gap-2 items-end">
          {locationMonstersSeen.map((id) => (
            <MonsterRow key={id} monsterId={id} locationId={location.id} />
          ))}
          {unknownCount > 0 && (
            <div className="px-3 py-2 rounded-lg border border-dashed border-game-border bg-game-bg text-center min-w-[72px] opacity-50">
              <div className="text-sm text-game-muted">+{unknownCount}</div>
              <div className="text-xs text-game-muted">unknown</div>
            </div>
          )}
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

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-xl border transition-colors duration-150 overflow-hidden',
        isOver ? 'border-game-primary bg-game-primary/5' : 'border-game-border',
      ].join(' ')}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left"
        onClick={() => toggleLocation(location.id)}
      >
        <span className="font-semibold text-game-text">{location.name}</span>
        <div className="flex items-center gap-2">
          {units.length > 0 && (
            <span className="text-xs text-game-text-dim bg-game-border rounded-full px-2 py-0.5">
              {units.length}
            </span>
          )}
          <span className="text-game-muted text-sm">{isExpanded ? '▲' : '▼'}</span>
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
          <TraitRow
            traits={location.traits.map((id) => TRAIT_REGISTRY[id]).filter(Boolean) as any}
          />
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
        {locations.map((loc) => (
          <LocationSection
            key={loc.id}
            location={loc}
            units={units.filter((u) => u.locationId === loc.id)}
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
