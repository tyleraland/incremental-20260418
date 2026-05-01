import { useEffect, useRef, useState } from 'react'
import { useGameStore, RECOVERY_TICKS, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { LocationCodex } from '@/components/LocationCodex'

// ── World grid layout ─────────────────────────────────────────────────────────

const GRID_SIZE = 15
const CELL_PX   = 72

// Locations placed at fixed (col, row) positions on the 15×15 world grid.
// Unknown ids fall back to CSS Grid auto-flow so test fixtures still render.
const LOCATION_COORDS: Record<string, [number, number]> = {
  'kings-forest': [3, 3],
  'duskwood':     [5, 5],
  'lake-arawok':  [11, 3],
  'gray-hills':   [13, 5],
  'beach-1':  [2, 10],
  'beach-2':  [4, 10],
  'beach-3':  [6, 10],
  'beach-4':  [8, 10],
  'beach-5':  [10, 10],
  'beach-6':  [12, 10],
  'beach-7':  [3, 12],
  'beach-8':  [5, 12],
  'beach-9':  [7, 12],
  'beach-10': [9, 12],
}

interface Biome {
  id: string; name: string
  minX: number; maxX: number; minY: number; maxY: number
  bg: string; ring: string; text: string; pill: string
}

const BIOMES: Biome[] = [
  { id: 'prontera', name: 'Prontera', minX: 2,  maxX: 7,  minY: 2, maxY: 7,
    bg: 'bg-emerald-900/15', ring: 'border-emerald-700/30', text: 'text-emerald-300/70',
    pill: 'border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/30' },
  { id: 'geffen',   name: 'Geffen',   minX: 9,  maxX: 14, minY: 2, maxY: 7,
    bg: 'bg-amber-900/15',   ring: 'border-amber-700/30',   text: 'text-amber-300/70',
    pill: 'border-amber-700/50 text-amber-300 hover:bg-amber-900/30' },
  { id: 'kanto',    name: 'Kanto',    minX: 1,  maxX: 14, minY: 9, maxY: 14,
    bg: 'bg-sky-900/15',     ring: 'border-sky-700/30',     text: 'text-sky-300/70',
    pill: 'border-sky-700/50 text-sky-300 hover:bg-sky-900/30' },
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

function RosterCarousel({ units }: { units: Unit[] }) {
  return (
    <div className="-mx-4 px-4 overflow-x-auto">
      <div className="flex gap-2 pb-1">
        {units.map((u) => <RosterUnitCard key={u.id} unit={u} />)}
      </div>
    </div>
  )
}

// ── LocationCell ──────────────────────────────────────────────────────────────

function LocationCell({ location, units }: { location: Location; units: Unit[] }) {
  const equipment           = useGameStore((s) => s.equipment)
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const isSelected          = selectedLocationId === location.id

  const coords = LOCATION_COORDS[location.id]
  const style  = coords ? { gridColumn: coords[0], gridRow: coords[1] } : undefined

  return (
    <button
      data-location-id={location.id}
      onClick={() => setSelectedLocation(isSelected ? null : location.id)}
      style={style}
      className={[
        'relative z-10 m-1 flex flex-col items-start gap-1 px-1.5 py-1.5 rounded-md border text-left transition-all',
        isSelected
          ? 'border-game-primary bg-game-primary/30 ring-2 ring-game-primary/50 shadow-lg shadow-game-primary/30 scale-[1.04]'
          : 'border-game-border bg-game-surface hover:border-game-primary/60',
      ].join(' ')}
    >
      <span className="text-[10px] font-semibold text-game-text leading-tight line-clamp-2">
        {location.name}
      </span>
      <div className="flex flex-wrap gap-0.5 mt-auto min-h-[6px]">
        {units.slice(0, 6).map((u) => {
          const isRec = u.recoveryTicksLeft > 0
          const maxHp = getDerivedStats(u, equipment).maxHp
          const hpPct = (u.health / maxHp) * 100
          const color = isRec
            ? 'bg-purple-500'
            : u.isResting ? 'bg-sky-500'
            : hpPct > 60   ? 'bg-game-green'
            : hpPct > 30   ? 'bg-game-gold'
            : 'bg-red-500'
          return <span key={u.id} className={`w-1.5 h-1.5 rounded-full ${color}`} />
        })}
        {units.length > 6 && (
          <span className="text-[8px] text-game-text-dim leading-none self-center">+{units.length - 6}</span>
        )}
      </div>
    </button>
  )
}

// ── WorldMap ──────────────────────────────────────────────────────────────────

function WorldMap({ locations, units }: { locations: Location[]; units: Unit[] }) {
  const selectedLocationId = useGameStore((s) => s.selectedLocationId)
  const containerRef = useRef<HTMLDivElement>(null)

  function scrollToBiome(b: Biome) {
    const el = containerRef.current
    if (!el) return
    const cx = ((b.minX + b.maxX) / 2 - 0.5) * CELL_PX
    const cy = ((b.minY + b.maxY) / 2 - 0.5) * CELL_PX
    el.scrollTo({ left: cx - el.clientWidth / 2, top: cy - el.clientHeight / 2, behavior: 'smooth' })
  }

  // Scroll the selected location into view if it's offscreen.
  useEffect(() => {
    if (!selectedLocationId) return
    const coords = LOCATION_COORDS[selectedLocationId]
    if (!coords) return
    const el = containerRef.current
    if (!el) return
    const [x, y] = coords
    const cellLeft = (x - 1) * CELL_PX
    const cellTop  = (y - 1) * CELL_PX
    const inView =
      cellLeft >= el.scrollLeft && cellLeft + CELL_PX <= el.scrollLeft + el.clientWidth &&
      cellTop  >= el.scrollTop  && cellTop  + CELL_PX <= el.scrollTop  + el.clientHeight
    if (!inView) {
      el.scrollTo({
        left: cellLeft - el.clientWidth / 2 + CELL_PX / 2,
        top:  cellTop  - el.clientHeight / 2 + CELL_PX / 2,
        behavior: 'smooth',
      })
    }
  }, [selectedLocationId])

  const unitCountByRegion = (regionId: string) =>
    units.filter((u) => locations.find((l) => l.id === u.locationId)?.region === regionId).length

  return (
    <div className="rounded-lg border border-game-border overflow-hidden bg-game-surface">
      {/* Quick-jump region pills */}
      <div className="flex gap-1.5 px-2 py-1.5 border-b border-game-border bg-game-bg/60">
        {BIOMES.map((b) => {
          const here = unitCountByRegion(b.id)
          return (
            <button
              key={b.id}
              onClick={() => scrollToBiome(b)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-colors ${b.pill}`}
            >
              {b.name}
              {here > 0 && <span className="ml-1 text-game-text-dim font-normal">· {here}</span>}
            </button>
          )
        })}
      </div>

      {/* Pannable world */}
      <div
        ref={containerRef}
        className="overflow-auto bg-game-bg"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.5px)',
          backgroundSize: `${CELL_PX}px ${CELL_PX}px`,
          backgroundPosition: `${CELL_PX / 2 - 0.5}px ${CELL_PX / 2 - 0.5}px`,
          maxHeight: '55vh',
        }}
      >
        <div
          className="relative"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_PX}px)`,
            gridTemplateRows:    `repeat(${GRID_SIZE}, ${CELL_PX}px)`,
          }}
        >
          {/* Biome backdrops with embedded region label */}
          {BIOMES.map((b) => (
            <div
              key={b.id}
              style={{
                gridColumn: `${b.minX} / ${b.maxX + 1}`,
                gridRow:    `${b.minY} / ${b.maxY + 1}`,
              }}
              className={`pointer-events-none m-1 rounded-2xl border ${b.ring} ${b.bg}`}
            >
              <div className={`px-2 pt-1.5 text-[10px] uppercase tracking-widest font-semibold ${b.text}`}>
                {b.name}
              </div>
            </div>
          ))}

          {/* Locations */}
          {locations.map((loc) => (
            <LocationCell
              key={loc.id}
              location={loc}
              units={units.filter((u) => u.locationId === loc.id)}
            />
          ))}
        </div>
      </div>
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
    <div className="fixed bottom-0 inset-x-0 z-30 bg-game-surface border-t border-game-border shadow-2xl shadow-black/30">
      {/* Summary section — fixed min-height for predictable layout */}
      <div className="px-4 py-3 border-b border-game-border min-h-[64px] flex flex-col justify-center">
        {location ? (
          <>
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
          </>
        ) : (
          <span className="text-xs text-game-text-dim italic">Tap a location on the world map to see details</span>
        )}
      </div>

      {/* Actions section — fixed min-height */}
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap min-h-[60px]">
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
        ) : hasLoc ? (
          <>
            <span className="text-xs text-game-text-dim mr-auto italic">Location actions</span>
            <span className="text-xs text-game-muted italic">More actions coming soon…</span>
            <button onClick={handleClear} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <span className="text-xs text-game-muted italic">Select a unit from the roster, or tap a location.</span>
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
        <WorldMap locations={locations} units={units} />
      </div>
      <LocationDetailPanel />
    </>
  )
}
