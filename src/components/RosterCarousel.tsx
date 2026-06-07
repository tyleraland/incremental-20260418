import { useEffect, useRef, useState } from 'react'
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

type SortMode = 'name' | 'class' | 'level' | 'status'
type SortDir  = 'asc' | 'desc'
const SORT_ORDER: SortMode[] = ['name', 'class', 'level', 'status']
const SORT_META: Record<SortMode, { icon: string; label: string; defaultDir: SortDir }> = {
  name:   { icon: 'A', label: 'Name',   defaultDir: 'asc'  },
  class:  { icon: '◆', label: 'Class',  defaultDir: 'asc'  },
  level:  { icon: '⬆', label: 'Level',  defaultDir: 'desc' },
  status: { icon: '◐', label: 'Status', defaultDir: 'asc'  },
}

// Human-readable description of each mode's two directions, for the menu.
function dirLabel(mode: SortMode, dir: SortDir): string {
  switch (mode) {
    case 'name':
    case 'class':  return dir === 'asc' ? 'A→Z' : 'Z→A'
    case 'level':  return dir === 'asc' ? 'Low→High' : 'High→Low'
    case 'status': return dir === 'asc' ? 'Active first' : 'KO first'
  }
}

// Lower rank sorts first: units in the field come before idle/resting/KO'd ones.
function statusRank(unit: Unit): number {
  if (unit.recoveryTicksLeft > 0) return 3 // KO, recovering
  if (unit.isResting) return 2
  if (unit.locationId) return 0            // deployed & ready
  return 1                                 // unassigned but ready
}

// Ascending comparator per mode; direction is applied by the caller.
function ascCompare(mode: SortMode, a: Unit, b: Unit): number {
  switch (mode) {
    case 'name':   return a.name.localeCompare(b.name)
    case 'class':  return (a.class ?? '').localeCompare(b.class ?? '') || a.name.localeCompare(b.name)
    case 'level':  return a.level - b.level
    case 'status': return statusRank(a) - statusRank(b)
  }
}

function sortUnits(units: Unit[], mode: SortMode, dir: SortDir): Unit[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...units].sort((a, b) => sign * ascCompare(mode, a, b))
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
        <span className="absolute -top-1 -left-1 flex items-center gap-1 max-w-[3.5rem] px-1 rounded-full bg-game-bg/90 border border-game-border leading-tight">
          <span className="text-[10px] font-bold text-game-text-dim">{unit.level}</span>
          {unit.class && <span className="text-[8px] text-game-text-dim truncate">{unit.class}</span>}
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
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [sortDir, setSortDir]   = useState<SortDir>(SORT_META['name'].defaultDir)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const sorted = sortUnits(units, sortMode, sortDir)
  const meta = SORT_META[sortMode]

  // Tapping a new mode selects it (its default direction) and closes the menu;
  // tapping the already-active mode flips its direction in place.
  function chooseMode(mode: SortMode) {
    if (mode === sortMode) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortMode(mode)
      setSortDir(SORT_META[mode].defaultDir)
      setMenuOpen(false)
    }
  }

  // Close the sort menu on any outside tap.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  return (
    <div className="-mt-7 flex items-stretch min-w-0">
      {/* Sort button on the left — one tap opens a menu of sort options. */}
      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title={`Sort: ${meta.label} (${dirLabel(sortMode, sortDir)})`}
          className="h-full w-7 flex flex-col items-center justify-center gap-0.5 border-b border-r border-game-border bg-game-surface text-game-text-dim hover:bg-white/5 select-none transition-colors duration-100"
        >
          <span className="text-sm leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
          <span className="text-[7px] leading-none uppercase tracking-wide">{meta.label}</span>
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 z-20 mt-px min-w-[11rem] rounded-md border border-game-border bg-game-surface shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-game-muted border-b border-game-border">Sort by</div>
            {SORT_ORDER.map((mode) => {
              const m = SORT_META[mode]
              const active = mode === sortMode
              // Active row shows the live direction; others preview their default.
              const rowDir = active ? sortDir : m.defaultDir
              return (
                <button
                  key={mode}
                  onClick={() => chooseMode(mode)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-left transition-colors duration-100',
                    active ? 'bg-game-primary/25 text-white' : 'text-game-text hover:bg-white/5',
                  ].join(' ')}
                >
                  <span className="w-4 text-center text-base leading-none">{m.icon}</span>
                  <span className="flex-1">{m.label}</span>
                  <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : 'text-game-muted'}`}>{dirLabel(mode, rowDir)}</span>
                  {active && <span className="text-game-primary text-sm">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="overflow-x-auto flex-1 min-w-0">
        <div className="flex gap-px w-max">
          {sorted.map((u) => <RosterUnitCard key={u.id} unit={u} />)}
        </div>
      </div>
    </div>
  )
}
