import { useState } from 'react'
import { createPortal } from 'react-dom'
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
import {
  useGameStore, TRAIT_REGISTRY, MONSTER_REGISTRY, DROP_ITEMS,
  type Unit, type Location, type MonsterDef,
} from '@/stores/useGameStore'
import { TraitRow } from '@/components/TraitBubble'

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

// ── MonsterCodex ──────────────────────────────────────────────────────────────

const STAT_ROWS = [
  { key: 'attack'      as const, label: 'ATK',   color: 'text-game-gold'   },
  { key: 'defense'     as const, label: 'DEF',   color: 'text-sky-400'     },
  { key: 'magicAttack' as const, label: 'M.ATK', color: 'text-game-accent' },
  { key: 'magicDefense'as const, label: 'M.DEF', color: 'text-violet-400'  },
  { key: 'attackSpeed' as const, label: 'SPD',   color: 'text-game-green'  },
  { key: 'accuracy'    as const, label: 'ACC',   color: 'text-orange-400'  },
  { key: 'dodge'       as const, label: 'DOD',   color: 'text-pink-400'    },
]

function MonsterCodex({ monster, onClose }: { monster: MonsterDef; onClose: () => void }) {
  const discoveredDrops = useGameStore((s) => s.discoveredDrops)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-game-text text-lg leading-tight">{monster.name}</span>
              <span className="text-xs text-game-text-dim bg-game-border rounded-full px-2 py-0.5">Lv.{monster.level}</span>
            </div>
            <div className="text-xs text-game-muted mt-0.5 uppercase tracking-widest">Codex Entry</div>
          </div>
          <button
            className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Stats */}
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Combat Stats</div>
            <div className="grid grid-cols-4 gap-2">
              {STAT_ROWS.slice(0, 4).map(({ key, label, color }) => (
                <div key={key} className="bg-game-bg rounded-lg py-2.5 text-center">
                  <div className={`text-xl font-bold font-mono leading-none ${color}`}>{monster.stats[key]}</div>
                  <div className="text-xs text-game-text-dim mt-1">{label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {STAT_ROWS.slice(4).map(({ key, label, color }) => (
                <div key={key} className="bg-game-bg rounded-lg py-2.5 text-center">
                  <div className={`text-xl font-bold font-mono leading-none ${color}`}>{monster.stats[key]}</div>
                  <div className="text-xs text-game-text-dim mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Drops */}
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">
              Drops · {monster.drops.length}
            </div>
            <div className="space-y-2">
              {monster.drops.map((drop, i) => {
                const known = discoveredDrops.includes(`${monster.id}:${drop.itemId}`)
                const name  = DROP_ITEMS[drop.itemId] ?? drop.itemId
                const pct   = Math.round(drop.dropRate * 100)
                const qty   = drop.quantityMin === drop.quantityMax
                  ? `×${drop.quantityMin}`
                  : `×${drop.quantityMin}–${drop.quantityMax}`

                return (
                  <div
                    key={i}
                    className={[
                      'flex items-center gap-3 bg-game-bg rounded-lg px-3 py-2.5',
                      !known ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    {known ? (
                      <>
                        <span className="text-sm text-game-text flex-1">{name}</span>
                        <span className="text-xs text-game-text-dim font-mono">{pct}%</span>
                        <span className="text-xs text-game-text-dim font-mono">{qty}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-game-muted italic flex-1">???</span>
                        <span className="text-xs text-game-muted">undiscovered</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── MonsterList ───────────────────────────────────────────────────────────────

function MonsterRow({ monsterId }: { monsterId: string }) {
  const [codexOpen, setCodexOpen] = useState(false)
  const discoveredMonsters = useGameStore((s) => s.discoveredMonsters)
  const discoverMonster    = useGameStore((s) => s.discoverMonster)
  const isDiscovered = discoveredMonsters.includes(monsterId)
  const monster = MONSTER_REGISTRY[monsterId]

  if (!monster) return null

  if (!isDiscovered) {
    return (
      <button
        onClick={() => discoverMonster(monsterId)}
        className="px-3 py-2 rounded-lg border border-dashed border-game-border bg-game-bg text-center min-w-[72px] opacity-60 hover:opacity-80 transition-opacity"
      >
        <div className="text-sm font-semibold text-game-muted">???</div>
        <div className="text-xs text-game-muted">Lv.?</div>
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setCodexOpen(true)}
        className="px-3 py-2 rounded-lg border border-game-border bg-game-bg text-center min-w-[72px] hover:border-game-accent/60 hover:bg-game-accent/5 transition-colors"
      >
        <div className="text-sm font-semibold text-game-text">{monster.name}</div>
        <div className="text-xs text-game-accent">Lv.{monster.level}</div>
      </button>
      {codexOpen && <MonsterCodex monster={monster} onClose={() => setCodexOpen(false)} />}
    </>
  )
}

function MonsterList({ location }: { location: Location }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Monsters</div>
      <div className="flex flex-wrap gap-2">
        {location.monsterIds.map((id) => (
          <MonsterRow key={id} monsterId={id} />
        ))}
      </div>
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
  const isExpanded = useGameStore((s) => s.expandedLocationIds.includes(location.id))
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
        <div className="flex items-center gap-3">
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
    <div className="fixed bottom-16 inset-x-0 z-30 px-4 pb-2 pointer-events-none">
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
