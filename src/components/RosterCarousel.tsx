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
  const equipment        = useGameStore((s) => s.equipment)
  const locations        = useGameStore((s) => s.locations)
  const isSelected       = selectedUnitIds.includes(unit.id)
  const isRecovering     = unit.recoveryTicksLeft > 0
  const isResting        = unit.isResting
  const maxHp            = getDerivedStats(unit, equipment).maxHp
  const hpPct            = Math.max(0, Math.min(100, (unit.health / maxHp) * 100))
  const recoverPct       = isRecovering ? ((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100 : 0
  const locationName     = unit.locationId ? (locations.find((l) => l.id === unit.locationId)?.name ?? null) : null

  return (
    <button
      onClick={() => toggleSelectUnit(unit.id)}
      className={[
        'shrink-0 w-24 px-2 py-1.5 border-b text-left select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:bg-white/5',
      ].join(' ')}
    >
      <div className="flex items-center gap-1 mb-1">
        <span
          className={[
            'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border',
            isSelected ? 'bg-game-primary/40 border-game-primary/60 text-white' : 'bg-game-primary/15 border-game-border text-game-text',
          ].join(' ')}
        >
          {getInitials(unit.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold leading-tight truncate">{unit.name}</div>
          <div className="text-[10px] text-game-text-dim leading-none mt-0.5">Lv.{unit.level}</div>
        </div>
      </div>
      <div className="w-full bg-game-border/60 rounded-full h-1.5 overflow-hidden">
        {isRecovering ? (
          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${recoverPct}%`, transition: 'none' }} />
        ) : isResting ? (
          <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
        ) : (
          <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
        )}
      </div>
      <div className="text-[10px] text-game-text-dim truncate mt-1">
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
