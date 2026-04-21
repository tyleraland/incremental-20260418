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
import { useGameStore, TRAIT_REGISTRY, MONSTER_REGISTRY, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { TraitRow } from '@/components/TraitBubble'
import { MonsterCodex } from '@/components/MonsterCodex'

// ── UnitRect ──────────────────────────────────────────────────────────────────

function UnitRect({ unit, overlay = false }: { unit: Unit; overlay?: boolean }) {
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const isSelected = selectedUnitIds.includes(unit.id)

  return (
    <div
      onClick={(e) => { e.stopPropagation(); toggleSelectUnit(unit.id) }}
      className={[
        'px-3 py-2 rounded-lg border select-none cursor-pointer min-w-[72px] text-center',
        'transition-colors duration-100',
        overlay ? 'shadow-xl rotate-2 scale-105' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:border-game-primary/50',
      ].join(' ')}
    >
      <div className="text-sm font-semibold leading-tight">{unit.name}</div>
      <div className="text-xs text-game-text-dim">Lv.{unit.level}</div>
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
  const seenCount      = useGameStore((s) => s.monsterSeen[monsterId] ?? 0)
  const activeSlots    = useGameStore((s) => s.activeEncounters[locationId] ?? [])
  const dotCount       = activeSlots.filter((id) => id === monsterId).length
  const monster        = MONSTER_REGISTRY[monsterId]

  if (!monster) return null

  return (
    <>
      <div className="flex flex-col items-center">
        <EncounterDots count={dotCount} />
        <button
          onClick={() => setCodexOpen(true)}
          className="px-3 py-2 rounded-lg border border-game-border bg-game-bg text-center min-w-[72px] hover:border-game-accent/60 hover:bg-game-accent/5 transition-colors"
        >
          <div className="text-sm font-semibold text-game-text">{monster.name}</div>
          <div className="text-xs text-game-accent">Lv.{monster.level}</div>
        </button>
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

// ── Difficulty indicator ──────────────────────────────────────────────────────

function locationEffectiveness(units: Unit[], location: Location, allEquipment: Parameters<typeof getDerivedStats>[1]): number | null {
  if (units.length === 0) return null
  const monsters = location.monsterIds.map((id) => MONSTER_REGISTRY[id]).filter(Boolean)
  if (monsters.length === 0) return null

  const avgUnitAtk = units.reduce((s, u) => s + getDerivedStats(u, allEquipment).attack, 0) / units.length
  const avgUnitDef = units.reduce((s, u) => s + getDerivedStats(u, allEquipment).defense, 0) / units.length
  const avgMonAtk  = monsters.reduce((s, m) => s + m!.stats.attack,  0) / monsters.length
  const avgMonDef  = monsters.reduce((s, m) => s + m!.stats.defense, 0) / monsters.length

  return Math.round(((avgUnitAtk / avgMonDef + avgUnitDef / avgMonAtk) / 2) * 100)
}

type DifficultyTier = { label: string; pill: string }

function difficultyTier(pct: number): DifficultyTier {
  if (pct < 25)  return { label: 'Impossible', pill: 'bg-game-border text-game-muted border-game-border' }
  if (pct < 50)  return { label: 'V. Hard',    pill: 'bg-red-950 text-red-300 border-red-800/60' }
  if (pct < 75)  return { label: 'Hard',       pill: 'bg-orange-950 text-orange-300 border-orange-800/60' }
  if (pct < 100) return { label: 'Tough',      pill: 'bg-yellow-950 text-yellow-300 border-yellow-800/60' }
  if (pct < 125) return { label: 'Effective',  pill: 'bg-emerald-950 text-emerald-300 border-emerald-800/60' }
  return               { label: 'Easy',        pill: 'bg-sky-950 text-sky-300 border-sky-800/60' }
}

function DifficultyPill({ pct }: { pct: number }) {
  const { label, pill } = difficultyTier(pct)
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${pill}`}>
      {label}
    </span>
  )
}

// ── LocationSection ───────────────────────────────────────────────────────────

function LocationSection({ location, units, selectedDragging }: {
  location: Location
  units: Unit[]
  selectedDragging: string[]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: location.id })
  const isExpanded   = useGameStore((s) => s.expandedLocationIds.includes(location.id))
  const toggleLocation = useGameStore((s) => s.toggleLocation)
  const allEquipment = useGameStore((s) => s.equipment)
  const effectiveness = locationEffectiveness(units, location, allEquipment)

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
          {effectiveness !== null && <DifficultyPill pct={effectiveness} />}
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

function SelectionBar() {
  const { selectedUnitIds, locations, assignUnits, clearSelection } = useGameStore()
  const [open, setOpen] = useState(false)

  if (selectedUnitIds.length === 0) return null

  const handleAssign = (locationId: string | null) => {
    assignUnits(selectedUnitIds, locationId)
    setOpen(false)
  }

  return (
    <div className="fixed bottom-4 inset-x-0 z-30 px-4 pointer-events-none">
      <div className="pointer-events-auto bg-game-surface border border-game-primary rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-game-primary/30">
        <span className="flex-1 text-sm font-medium">{selectedUnitIds.length} selected</span>
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
