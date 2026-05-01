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
import { useGameStore, RECOVERY_TICKS, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { LocationCodex } from '@/components/LocationCodex'

const REGIONS = [
  { id: 'prontera', name: 'Prontera Region' },
  { id: 'geffen',   name: 'Geffen Region' },
  { id: 'kanto',    name: 'Kanto' },
]

// ── UnitRect ──────────────────────────────────────────────────────────────────

function hpBarColor(health: number) {
  if (health > 60) return 'bg-game-green'
  if (health > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

function UnitRect({ unit, overlay = false }: { unit: Unit; overlay?: boolean }) {
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
          ) : null}
        </>
      )}
    </div>
  )
}

// ── DraggableUnit ─────────────────────────────────────────────────────────────

function DraggableUnit({ unit, groupDragging = false }: { unit: Unit; groupDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: unit.id })

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
      <UnitRect unit={unit} />
    </div>
  )
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

function CompactUnitChip({ unit }: { unit: Unit }) {
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

// ── DraggableCompactUnit ──────────────────────────────────────────────────────

function DraggableCompactUnit({ unit, groupDragging = false }: { unit: Unit; groupDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: unit.id })
  const style = {
    touchAction: 'none' as const,
    ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging || groupDragging ? 'opacity-30' : ''}>
      <CompactUnitChip unit={unit} />
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
            <DraggableCompactUnit key={u.id} unit={u} groupDragging={selectedDragging.includes(u.id)} />
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
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-1">Units</div>
            <div className="flex flex-wrap gap-2 min-h-[44px]">
              {units.map((u) => (
                <DraggableCompactUnit key={u.id} unit={u} groupDragging={selectedDragging.includes(u.id)} />
              ))}
              {units.length === 0 && (
                <span className="text-xs text-game-muted italic">Drop units here</span>
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

function SelectionBar() {
  const { selectedUnitIds, locations, assignUnits, clearSelection } = useGameStore()
  const [open, setOpen] = useState(false)

  if (selectedUnitIds.length === 0) return null

  function handleClearAll() { clearSelection(); setOpen(false) }
  const handleAssign = (locationId: string | null) => { assignUnits(selectedUnitIds, locationId); setOpen(false) }

  return (
    <div className="fixed bottom-4 inset-x-0 z-30 px-4 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-2">
        <div className="bg-game-surface border border-game-primary rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-game-primary/30">
          <span className="flex-1 text-sm font-medium min-w-0 truncate">
            {selectedUnitIds.length} unit{selectedUnitIds.length !== 1 ? 's' : ''} selected
          </span>
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
