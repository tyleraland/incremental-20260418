import { useState } from 'react'
import { useGameStore, RECOVERY_TICKS, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { LocationCodex } from '@/components/LocationCodex'

const REGIONS = [
  { id: 'prontera', name: 'Prontera Region' },
  { id: 'geffen',   name: 'Geffen Region' },
  { id: 'kanto',    name: 'Kanto' },
]

function hpBarColor(hp: number) {
  if (hp > 60) return 'bg-game-green'
  if (hp > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

// ── RosterUnitCard ────────────────────────────────────────────────────────────

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
        'shrink-0 w-28 px-3 py-2 rounded-lg border text-left select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:border-game-primary/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="text-sm font-semibold leading-tight truncate">{unit.name}</div>
        <div className="text-xs text-game-text-dim shrink-0">Lv.{unit.level}</div>
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

// ── RosterCarousel ────────────────────────────────────────────────────────────

function RosterCarousel({ units }: { units: Unit[] }) {
  return (
    <div className="-mx-4 px-4 overflow-x-auto">
      <div className="flex gap-2 pb-1">
        {units.map((u) => (
          <RosterUnitCard key={u.id} unit={u} />
        ))}
      </div>
    </div>
  )
}

// ── LocationRow ───────────────────────────────────────────────────────────────

function LocationCell({ location, units }: { location: Location; units: Unit[] }) {
  const equipment           = useGameStore((s) => s.equipment)
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const isSelected          = selectedLocationId === location.id

  return (
    <button
      onClick={() => setSelectedLocation(isSelected ? null : location.id)}
      className={[
        'flex flex-col items-start gap-1.5 px-3 py-2.5 rounded-lg border text-left transition-colors min-h-[68px]',
        isSelected ? 'border-game-primary bg-game-primary/10' : 'border-game-border hover:border-game-primary/40',
      ].join(' ')}
    >
      <span className="text-xs font-semibold text-game-text leading-tight">{location.name}</span>
      <div className="flex flex-wrap gap-1 mt-auto min-h-[8px]">
        {units.map((u) => {
          const isRec  = u.recoveryTicksLeft > 0
          const maxHp  = getDerivedStats(u, equipment).maxHp
          const hpPct  = (u.health / maxHp) * 100
          const color  = isRec
            ? 'bg-purple-500'
            : u.isResting ? 'bg-sky-500'
            : hpPct > 60   ? 'bg-game-green'
            : hpPct > 30   ? 'bg-game-gold'
            : 'bg-red-500'
          return <span key={u.id} className={`w-2 h-2 rounded-full ${color}`} />
        })}
      </div>
    </button>
  )
}

// ── RegionSection ─────────────────────────────────────────────────────────────

function RegionSection({ region, locations, units }: {
  region: { id: string; name: string }
  locations: Location[]
  units: Unit[]
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {locations.map((loc) => (
            <LocationCell
              key={loc.id}
              location={loc}
              units={units.filter((u) => u.locationId === loc.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── LocationDetailPanel ───────────────────────────────────────────────────────

function LocationDetailPanel() {
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  const clearSelection      = useGameStore((s) => s.clearSelection)
  const assignUnits         = useGameStore((s) => s.assignUnits)
  const setActiveTab        = useGameStore((s) => s.setActiveTab)
  const setCombatLocation   = useGameStore((s) => s.setCombatLocation)
  const toggleUnit          = useGameStore((s) => s.toggleUnit)
  const expandedUnitIds     = useGameStore((s) => s.expandedUnitIds)
  const locations           = useGameStore((s) => s.locations)
  const units               = useGameStore((s) => s.units)

  const [codexOpen, setCodexOpen] = useState(false)

  const location = selectedLocationId ? (locations.find((l) => l.id === selectedLocationId) ?? null) : null
  const hasUnits = selectedUnitIds.length > 0
  const hasLoc   = location !== null

  if (!hasUnits && !hasLoc) return null

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id))
  const sharedLocId   = selectedUnits.length > 0 && selectedUnits.every((u) => u.locationId === selectedUnits[0].locationId)
    ? selectedUnits[0].locationId
    : null
  const allAlreadyHere = hasLoc && selectedUnits.length > 0 && selectedUnits.every((u) => u.locationId === selectedLocationId)

  function handleDeploy() {
    if (!selectedLocationId || allAlreadyHere) return
    assignUnits(selectedUnitIds, selectedLocationId)
  }

  function handleViewUnit() {
    const unitId = selectedUnits[0]?.id
    if (!unitId) return
    if (!expandedUnitIds.includes(unitId)) toggleUnit(unitId)
    setActiveTab('units')
    clearSelection()
    setSelectedLocation(null)
  }

  function handleGoCombat() {
    if (sharedLocId) setCombatLocation(sharedLocId)
    setActiveTab('combat')
    clearSelection()
    setSelectedLocation(null)
  }

  function handleClear() {
    clearSelection()
    setSelectedLocation(null)
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-game-surface border-t border-game-border max-h-[45vh] overflow-y-auto shadow-2xl shadow-black/30">
      {/* Summary section */}
      {location ? (
        <div className="px-4 py-3 border-b border-game-border">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-game-text">{location.name}</span>
            <button
              onClick={() => setCodexOpen(true)}
              className="text-xs px-2 py-0.5 rounded border border-game-accent/40 text-game-accent hover:bg-game-accent/10 hover:border-game-accent transition-colors shrink-0"
            >
              Codex →
            </button>
          </div>
          <p className="text-xs text-game-text-dim leading-snug">{location.description}</p>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-game-border">
          <span className="text-xs text-game-text-dim italic">Select a location to see details</span>
        </div>
      )}

      {/* Actions section */}
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
        {hasUnits ? (
          <>
            <span className="text-xs text-game-text-dim mr-auto">
              {selectedUnits.length} unit{selectedUnits.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleDeploy}
              disabled={!hasLoc || allAlreadyHere}
              className={[
                'btn-primary text-sm py-1.5 px-3',
                (!hasLoc || allAlreadyHere) ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {hasLoc
                ? (allAlreadyHere ? 'Already here' : `Deploy here`)
                : 'Deploy (pick a location)'}
            </button>
            {selectedUnits.length === 1 && (
              <button onClick={handleViewUnit} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">
                View ›
              </button>
            )}
            {sharedLocId && (
              <button onClick={handleGoCombat} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">
                Go to Combat ›
              </button>
            )}
            <button onClick={handleClear} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-game-text-dim mr-auto italic">Location actions</span>
            <span className="text-xs text-game-muted italic">More actions coming soon…</span>
            <button onClick={handleClear} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </>
        )}
      </div>

      {codexOpen && location && <LocationCodex location={location} onClose={() => setCodexOpen(false)} />}
    </div>
  )
}

// ── Map ───────────────────────────────────────────────────────────────────────

export function Map() {
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)

  return (
    <>
      <div className="p-4 space-y-3 pb-64">
        <RosterCarousel units={units} />
        {REGIONS.map((region) => (
          <RegionSection
            key={region.id}
            region={region}
            locations={locations.filter((l) => l.region === region.id)}
            units={units}
          />
        ))}
      </div>

      <LocationDetailPanel />
    </>
  )
}
