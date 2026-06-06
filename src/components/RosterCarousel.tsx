import { useRef, useState } from 'react'
import { useGameStore, getDerivedStats, getInitials, type Unit } from '@/stores/useGameStore'

// Horizontal hero roster strip, pinned at the top of the Map tab in both the
// overworld and battle drop-in views so unit selection stays available and the
// transition between the two feels seamless.

// Class → portrait glyph (mirrors BattleView's chip glyphs). Falls back to the
// unit's initials when the class has no icon.
const CLASS_ICON: Record<string, string> = {
  Fighter: '⚔',
  Ranger:  '🏹',
  Mage:    '✦',
  Cleric:  '✚',
  Rogue:   '🗡',
}

function portraitGlyph(unit: Unit): string {
  if (unit.class && CLASS_ICON[unit.class]) return CLASS_ICON[unit.class]
  return getInitials(unit.name)
}

type SortMode = 'roster' | 'level' | 'status'
const SORT_ORDER: SortMode[] = ['roster', 'level', 'status']
const SORT_META: Record<SortMode, { icon: string; label: string }> = {
  roster: { icon: '☰', label: 'Roster' },
  level:  { icon: '⬆', label: 'Level' },
  status: { icon: '◐', label: 'Status' },
}

// Lower rank sorts first: units in the field come before idle/resting/KO'd ones.
function statusRank(unit: Unit): number {
  if (unit.recoveryTicksLeft > 0) return 3 // KO, recovering
  if (unit.isResting) return 2
  if (unit.locationId) return 0            // deployed & ready
  return 1                                 // unassigned but ready
}

function sortUnits(units: Unit[], mode: SortMode): Unit[] {
  if (mode === 'roster') return units
  const copy = [...units]
  if (mode === 'level') copy.sort((a, b) => b.level - a.level)
  else copy.sort((a, b) => statusRank(a) - statusRank(b))
  return copy
}

function RosterUnitCard({ unit }: { unit: Unit }) {
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const showUnitOnMap    = useGameStore((s) => s.showUnitOnMap)
  const isSelected       = selectedUnitIds.includes(unit.id)
  const lastTapRef       = useRef(0)

  // Single tap toggles selection; double-tap (within 300 ms) pops back to the
  // overworld framed on this unit's location — mirrors the location double-tap
  // that drops into battle.
  function handleTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0
      showUnitOnMap(unit.id)
      return
    }
    lastTapRef.current = now
    toggleSelectUnit(unit.id)
  }
  const isRecovering = unit.recoveryTicksLeft > 0
  const isResting    = unit.isResting
  // Explicit status flag for the non-ready states; ready units stay uncluttered.
  const statusBadge = isRecovering
    ? { text: 'KO', tone: 'bg-purple-600 text-white' }
    : isResting
      ? { text: 'Rest', tone: 'bg-sky-600 text-white' }
      : null

  // Portrait ring colour conveys status at a glance (selection wins).
  const portraitTone = isSelected
    ? 'border-game-primary bg-game-primary/30 text-white'
    : isRecovering
      ? 'border-purple-500/70 bg-purple-500/10 text-purple-300'
      : isResting
        ? 'border-sky-500/70 bg-sky-500/10 text-sky-300'
        : unit.locationId
          ? 'border-game-green/60 bg-game-green/10 text-game-text'
          : 'border-game-border bg-game-surface text-game-text'

  return (
    <button
      onClick={handleTap}
      className={[
        'shrink-0 w-[4.5rem] flex flex-col items-center gap-1 px-1 py-1.5 border-b select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/15'
          : 'border-game-border bg-game-surface hover:bg-white/5',
      ].join(' ')}
    >
      {/* Portrait (class icon) with a level badge corner. */}
      <div className="relative">
        <span
          className={[
            'w-11 h-11 rounded-lg flex items-center justify-center text-xl border-2',
            portraitTone,
          ].join(' ')}
        >
          {portraitGlyph(unit)}
        </span>
        <span className="absolute -top-1 -left-1 px-1 rounded-full bg-game-bg/90 border border-game-border text-[8px] font-bold leading-tight text-game-text-dim">
          {unit.level}
        </span>
        {statusBadge && (
          <span className={`absolute -top-1 -right-1 px-1 rounded-full text-[7px] font-bold leading-tight ${statusBadge.tone}`}>
            {statusBadge.text}
          </span>
        )}
      </div>
      {/* Name on the bottom. */}
      <div className="w-full text-[10px] font-semibold leading-tight text-center truncate text-game-text">
        {unit.name}
      </div>
    </button>
  )
}

export function RosterCarousel({ units }: { units: Unit[] }) {
  const [sortMode, setSortMode] = useState<SortMode>('roster')
  const sorted = sortUnits(units, sortMode)
  const meta = SORT_META[sortMode]

  function cycleSort() {
    const next = SORT_ORDER[(SORT_ORDER.indexOf(sortMode) + 1) % SORT_ORDER.length]
    setSortMode(next)
  }

  return (
    <div className="-mt-7 flex items-stretch">
      {/* Sort toggle on the left — cycles roster → level → status. */}
      <button
        onClick={cycleSort}
        title={`Sort: ${meta.label}`}
        className="shrink-0 w-7 flex flex-col items-center justify-center gap-0.5 border-b border-r border-game-border bg-game-surface text-game-text-dim hover:bg-white/5 select-none transition-colors duration-100"
      >
        <span className="text-sm leading-none">{meta.icon}</span>
        <span className="text-[7px] leading-none uppercase tracking-wide">{meta.label}</span>
      </button>
      <div className="overflow-x-auto flex-1">
        <div className="flex gap-px">
          {sorted.map((u) => <RosterUnitCard key={u.id} unit={u} />)}
        </div>
      </div>
    </div>
  )
}
