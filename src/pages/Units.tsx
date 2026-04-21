import { useGameStore, type Unit, type EquipSlot, SLOT_LABELS } from '@/stores/useGameStore'

// ── Shared primitives ─────────────────────────────────────────────────────────

function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 bg-game-border rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function healthColor(hp: number) {
  if (hp >= 75) return 'text-game-green'
  if (hp >= 40) return 'text-game-gold'
  return 'text-red-400'
}
function healthBar(hp: number) {
  if (hp >= 75) return 'bg-game-green'
  if (hp >= 40) return 'bg-game-gold'
  return 'bg-red-400'
}
function healthDot(hp: number) {
  if (hp >= 75) return 'bg-game-green'
  if (hp >= 40) return 'bg-game-gold'
  return 'bg-red-400'
}

// ── Equipment slot button ─────────────────────────────────────────────────────

function EquipSlotBtn({ unit, slot }: { unit: Unit; slot: EquipSlot }) {
  const equipment = useGameStore((s) => s.equipment)
  const openEquipFor = useGameStore((s) => s.openEquipFor)

  const item = equipment.find((e) => e.id === unit.equipment[slot])
  const mainHandItem = equipment.find((e) => e.id === unit.equipment.mainHand)
  const locked = slot === 'offHand' && mainHandItem?.category === 'weapon-2h'

  return (
    <button
      disabled={locked}
      onClick={() => !locked && openEquipFor(unit.id, slot)}
      className={[
        'flex flex-col gap-0.5 p-2.5 rounded-lg border text-left w-full transition-colors',
        locked
          ? 'border-game-border opacity-40 cursor-not-allowed'
          : 'border-game-border hover:border-game-primary/70 active:bg-game-primary/5 cursor-pointer',
      ].join(' ')}
    >
      <span className="text-xs text-game-text-dim">{SLOT_LABELS[slot]}</span>
      <span className={['text-sm leading-snug', item ? 'text-game-text font-medium' : 'text-game-muted italic'].join(' ')}>
        {locked ? '2H locked' : (item?.name ?? '—')}
      </span>
    </button>
  )
}

// ── Expanded unit detail ──────────────────────────────────────────────────────

function UnitDetail({ unit }: { unit: Unit }) {
  const combatStats = [
    { label: 'ATK', value: unit.stats.attack, color: 'text-game-gold' },
    { label: 'DEF', value: unit.stats.defense, color: 'text-sky-400' },
    { label: 'SP.ATK', value: unit.stats.specialAttack, color: 'text-game-accent' },
    { label: 'SP.DEF', value: unit.stats.specialDefense, color: 'text-violet-400' },
  ]

  return (
    <div className="border-t border-game-border px-4 pb-5 pt-4 space-y-5">

      {/* Identity + bars */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Level', value: unit.level },
            { label: 'Age', value: `${unit.age}y` },
            { label: 'Class', value: unit.class ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-game-bg rounded-lg px-3 py-2">
              <div className="text-xs text-game-text-dim mb-0.5">{label}</div>
              <div className="text-sm font-semibold text-game-text">{value}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-game-text-dim">Health</span>
              <span className={healthColor(unit.health)}>{unit.health}%</span>
            </div>
            <ProgressBar value={unit.health} max={100} colorClass={healthBar(unit.health)} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-game-text-dim">EXP</span>
              <span className="text-game-text-dim">{unit.exp} / {unit.expToNext}</span>
            </div>
            <ProgressBar value={unit.exp} max={unit.expToNext} colorClass="bg-game-primary" />
          </div>
        </div>
      </div>

      {/* Proficiencies */}
      {unit.proficiencies.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Proficiencies</div>
          <div className="flex flex-wrap gap-1.5">
            {unit.proficiencies.map((p) => (
              <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-game-border text-game-text-dim">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Combat stats */}
      <div>
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Combat</div>
        <div className="grid grid-cols-4 gap-2">
          {combatStats.map(({ label, value, color }) => (
            <div key={label} className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className={`text-xl font-bold font-mono leading-none ${color}`}>{value}</div>
              <div className="text-xs text-game-text-dim mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div>
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Equipment</div>
        <div className="grid grid-cols-2 gap-2">
          {(['mainHand', 'offHand', 'armor', 'accessory'] as EquipSlot[]).map((slot) => (
            <EquipSlotBtn key={slot} unit={unit} slot={slot} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Unit row ──────────────────────────────────────────────────────────────────

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
    <div className={[
      'border rounded-xl overflow-hidden transition-colors duration-100',
      isSelected ? 'border-game-primary' : 'border-game-border',
    ].join(' ')}>

      {/* Row header */}
      <div className="flex items-center gap-3 px-3 py-3">
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

        {/* Health dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${healthDot(unit.health)}`} />

        {/* Main tap area */}
        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={() => toggleUnit(unit.id)}>
          <span className="font-semibold text-game-text">{unit.name}</span>
          <span className="text-xs text-game-text-dim shrink-0">Lv.{unit.level}</span>
          {unit.class && (
            <span className="text-xs text-game-secondary bg-game-secondary/10 px-1.5 py-0.5 rounded shrink-0">
              {unit.class}
            </span>
          )}
          {location && (
            <span className="text-xs text-game-accent bg-game-accent/10 px-1.5 py-0.5 rounded truncate max-w-[90px] shrink-0">
              {location.name}
            </span>
          )}
          <span className="ml-auto text-game-muted text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {isExpanded && <UnitDetail unit={unit} />}
    </div>
  )
}

// ── Units page ────────────────────────────────────────────────────────────────

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
