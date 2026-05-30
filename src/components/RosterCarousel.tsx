import { useRef } from 'react'
import { useGameStore, RECOVERY_TICKS, getDerivedStats, getInitials, type Unit } from '@/stores/useGameStore'

// Horizontal hero roster strip, pinned at the top of the Map tab in both the
// overworld and battle drop-in views so unit selection stays available and the
// transition between the two feels seamless.

function hpBarColor(hp: number) {
  if (hp > 60) return 'bg-game-green'
  if (hp > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

function RosterUnitCard({ unit }: { unit: Unit }) {
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const showUnitOnMap    = useGameStore((s) => s.showUnitOnMap)
  const equipment        = useGameStore((s) => s.equipment)
  const locations        = useGameStore((s) => s.locations)
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
  const isRecovering     = unit.recoveryTicksLeft > 0
  const isResting        = unit.isResting
  const maxHp            = getDerivedStats(unit, equipment).maxHp
  const hpPct            = Math.max(0, Math.min(100, (unit.health / maxHp) * 100))
  const recoverPct       = isRecovering ? ((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100 : 0
  const locationName     = unit.locationId ? (locations.find((l) => l.id === unit.locationId)?.name ?? null) : null

  return (
    <button
      onClick={handleTap}
      className={[
        'shrink-0 w-[4.25rem] px-1.5 py-1 border-b text-left select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:bg-white/5',
      ].join(' ')}
    >
      <div className="flex items-center gap-1">
        <span
          className={[
            'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border',
            isSelected ? 'bg-game-primary/40 border-game-primary/60 text-white' : 'bg-game-primary/15 border-game-border text-game-text',
          ].join(' ')}
        >
          {getInitials(unit.name)}
        </span>
        <div className="min-w-0 flex-1 leading-none">
          <div className="text-[11px] font-semibold leading-tight truncate">{unit.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[8px] text-game-text-dim shrink-0">L{unit.level}</span>
        <div className="flex-1 bg-game-border/60 rounded-full h-1 overflow-hidden">
          {isRecovering ? (
            <div className="bg-purple-500 h-1 rounded-full" style={{ width: `${recoverPct}%`, transition: 'none' }} />
          ) : isResting ? (
            <div className="bg-sky-500 h-1 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
          ) : (
            <div className={`${hpBarColor(hpPct)} h-1 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
          )}
        </div>
      </div>
      <div className="text-[9px] text-game-text-dim truncate mt-0.5 leading-none">
        {isRecovering ? <span className="text-purple-400">KO</span>
          : isResting   ? <span className="text-sky-400">Resting</span>
          : locationName ?? <span className="text-game-muted italic">unassigned</span>}
      </div>
    </button>
  )
}

export function RosterCarousel({ units }: { units: Unit[] }) {
  return (
    <div className="-mt-7 overflow-x-auto">
      <div className="flex gap-px">
        {units.map((u) => <RosterUnitCard key={u.id} unit={u} />)}
      </div>
    </div>
  )
}
