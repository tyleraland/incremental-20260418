import { useGameStore, type Unit, type EquipSlot } from '@/stores/useGameStore'

const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  tool: 'Tool',
  armor: 'Armor',
  accessory: 'Acc.',
}

function EquipSlotButton({ unit, slot }: { unit: Unit; slot: EquipSlot }) {
  const { equipment, openEquipFor } = useGameStore((s) => ({
    equipment: s.equipment,
    openEquipFor: s.openEquipFor,
  }))
  const itemId = unit.equipment[slot]
  const item = equipment.find((e) => e.id === itemId)

  return (
    <button
      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-game-border hover:border-game-primary/60 hover:bg-game-primary/5 transition-colors"
      onClick={() => openEquipFor(unit.id, slot)}
    >
      <span className="text-xs text-game-text-dim w-14 shrink-0">{SLOT_LABELS[slot]}</span>
      <span className={['text-sm', item ? 'text-game-text' : 'text-game-muted italic'].join(' ')}>
        {item ? item.name : 'Empty'}
      </span>
    </button>
  )
}

function UnitRow({ unit }: { unit: Unit }) {
  const { selectedUnitIds, expandedUnitIds, toggleSelectUnit, toggleUnit, locations } = useGameStore(
    (s) => ({
      selectedUnitIds: s.selectedUnitIds,
      expandedUnitIds: s.expandedUnitIds,
      toggleSelectUnit: s.toggleSelectUnit,
      toggleUnit: s.toggleUnit,
      locations: s.locations,
    })
  )
  const isSelected = selectedUnitIds.includes(unit.id)
  const isExpanded = expandedUnitIds.includes(unit.id)
  const location = locations.find((l) => l.id === unit.locationId)

  return (
    <div className={['border rounded-xl overflow-hidden transition-colors', isSelected ? 'border-game-primary' : 'border-game-border'].join(' ')}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox */}
        <button
          className={[
            'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
            isSelected ? 'border-game-primary bg-game-primary' : 'border-game-muted',
          ].join(' ')}
          onClick={() => toggleSelectUnit(unit.id)}
          aria-label={`Select ${unit.name}`}
        >
          {isSelected && <span className="text-white text-xs leading-none">✓</span>}
        </button>

        {/* Main row — tap to expand */}
        <button
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          onClick={() => toggleUnit(unit.id)}
        >
          <span className="font-semibold text-game-text truncate">{unit.name}</span>
          <span className="text-xs text-game-text-dim shrink-0">Lv.{unit.level}</span>
          {location && (
            <span className="text-xs text-game-accent bg-game-accent/10 px-2 py-0.5 rounded-full shrink-0 truncate max-w-[100px]">
              {location.name}
            </span>
          )}
          <span className="ml-auto text-game-muted text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-game-border space-y-3">
          <div className="flex gap-4 pt-3">
            <div className="text-sm">
              <span className="text-game-text-dim">Attack </span>
              <span className="text-game-gold font-mono font-semibold">{unit.stats.attack}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {(['weapon', 'tool', 'armor', 'accessory'] as EquipSlot[]).map((slot) => (
              <EquipSlotButton key={slot} unit={unit} slot={slot} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Units() {
  const { units, selectedUnitIds, clearSelection } = useGameStore((s) => ({
    units: s.units,
    selectedUnitIds: s.selectedUnitIds,
    clearSelection: s.clearSelection,
  }))

  return (
    <div className="p-4 space-y-2 pb-24">
      {selectedUnitIds.length > 0 && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs text-game-text-dim">{selectedUnitIds.length} selected</span>
          <button className="text-xs text-game-primary hover:underline" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}
      {units.map((unit) => (
        <UnitRow key={unit.id} unit={unit} />
      ))}
    </div>
  )
}
