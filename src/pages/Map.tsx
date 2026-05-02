import { useState } from 'react'
import { useGameStore, RECOVERY_TICKS, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { LocationCodex } from '@/components/LocationCodex'

// ── World pages (one per region) ──────────────────────────────────────────────

const GRID_W   = 5
const GRID_H   = 5
const CELL_PX  = 60
const GAP_PX   = 4

interface PageNeighbors { left?: string; right?: string; up?: string; down?: string }
interface PageDef extends PageNeighbors { id: string; name: string }

const PAGES: PageDef[] = [
  { id: 'prontera', name: 'Prontera Region', right: 'geffen',   down: 'kanto' },
  { id: 'geffen',   name: 'Geffen Region',   left:  'prontera', down: 'kanto' },
  { id: 'kanto',    name: 'Kanto',           up:    'prontera' },
]

const PAGE_BY_ID: Record<string, PageDef> = Object.fromEntries(PAGES.map((p) => [p.id, p]))

// Per-region (col, row) on the 5×5 grid (0-indexed). Unknown ids fall back to auto-flow.
const LOCATION_COORDS: Record<string, [number, number]> = {
  // Prontera
  'kings-forest': [1, 1],
  'duskwood':     [2, 3],
  // Geffen
  'lake-arawok':  [1, 1],
  'gray-hills':   [3, 3],
  // Kanto
  'beach-1':  [0, 1],
  'beach-2':  [1, 1],
  'beach-3':  [2, 1],
  'beach-4':  [3, 1],
  'beach-5':  [4, 1],
  'beach-6':  [0, 3],
  'beach-7':  [1, 3],
  'beach-8':  [2, 3],
  'beach-9':  [3, 3],
  'beach-10': [4, 3],
}

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
      <div className="flex gap-px pb-1">
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
  const style  = coords ? { gridColumn: coords[0] + 1, gridRow: coords[1] + 1 } : undefined

  return (
    <button
      onClick={() => setSelectedLocation(isSelected ? null : location.id)}
      style={style}
      className={[
        'relative z-10 flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-md border text-left transition-all overflow-hidden',
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

// ── PageArrow ─────────────────────────────────────────────────────────────────

function PageArrow({ direction, target, onClick }: {
  direction: 'left' | 'right' | 'up' | 'down'
  target: PageDef | null
  onClick: () => void
}) {
  const sym = direction === 'left' ? '◀' : direction === 'right' ? '▶' : direction === 'up' ? '▲' : '▼'
  const label = target?.name ?? ''
  const visible = !!target
  const horizontal = direction === 'left' || direction === 'right'

  return (
    <button
      onClick={visible ? onClick : undefined}
      disabled={!visible}
      className={[
        horizontal
          ? 'w-7 self-stretch flex flex-col items-center justify-center'
          : 'h-7 self-center flex items-center justify-center px-2 py-0.5 gap-1.5',
        'rounded-md border text-[10px] font-semibold uppercase tracking-wider transition-colors',
        visible
          ? 'border-game-border text-game-text-dim hover:border-game-primary/60 hover:text-game-text'
          : 'border-transparent text-transparent pointer-events-none',
      ].join(' ')}
    >
      {horizontal ? (
        <span className="text-sm leading-none">{sym}</span>
      ) : (
        <>
          <span className="leading-none">{sym}</span>
          <span className="leading-none">{label}</span>
        </>
      )}
    </button>
  )
}

// ── WorldMap ──────────────────────────────────────────────────────────────────

function WorldMap({ locations, units }: { locations: Location[]; units: Unit[] }) {
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const pageId              = useGameStore((s) => s.mapPageId)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const page = PAGE_BY_ID[pageId] ?? PAGES[0]

  const left  = page.left  ? PAGE_BY_ID[page.left]  : null
  const right = page.right ? PAGE_BY_ID[page.right] : null
  const up    = page.up    ? PAGE_BY_ID[page.up]    : null
  const down  = page.down  ? PAGE_BY_ID[page.down]  : null

  const goto = (target: PageDef | null) => {
    if (!target) return
    setMapPage(target.id)
    setSelectedLocation(null)
  }

  const pageLocations = locations.filter((l) => l.region === page.id)

  return (
    <div className="rounded-lg border border-game-border bg-game-surface overflow-hidden">
      {/* Title */}
      <div className="px-3 py-2 border-b border-game-border bg-game-bg/60">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-game-text">
          {page.name}
        </h2>
      </div>

      <div className="px-2 py-2 space-y-1">
        {/* Up arrow row */}
        <div className="flex justify-center min-h-[28px]">
          <PageArrow direction="up" target={up} onClick={() => goto(up)} />
        </div>

        {/* Middle row: left arrow, grid, right arrow */}
        <div className="flex items-center justify-center gap-1">
          <PageArrow direction="left" target={left} onClick={() => goto(left)} />
          <div
            className="bg-game-bg rounded-md p-1.5"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.5px)',
              backgroundSize: `${CELL_PX + GAP_PX}px ${CELL_PX + GAP_PX}px`,
              backgroundPosition: `${(CELL_PX + GAP_PX) / 2 + 6 - 0.5}px ${(CELL_PX + GAP_PX) / 2 + 6 - 0.5}px`,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_W}, ${CELL_PX}px)`,
                gridTemplateRows:    `repeat(${GRID_H}, ${CELL_PX}px)`,
                gap: `${GAP_PX}px`,
              }}
            >
              {pageLocations.map((loc) => (
                <LocationCell
                  key={loc.id}
                  location={loc}
                  units={units.filter((u) => u.locationId === loc.id)}
                />
              ))}
            </div>
          </div>
          <PageArrow direction="right" target={right} onClick={() => goto(right)} />
        </div>

        {/* Down arrow row */}
        <div className="flex justify-center min-h-[28px]">
          <PageArrow direction="down" target={down} onClick={() => goto(down)} />
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
  const setMapPage          = useGameStore((s) => s.setMapPage)
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

  // Go-to-Combat target:
  //   - location-only        → that location
  //   - unit(s)-only         → their shared location (if any)
  //   - both, units already there → that location
  //   - both, units elsewhere     → hidden
  const combatTargetLocId =
    hasLoc && hasUnits  ? (allAlreadyHere ? selectedLocationId : null)
    : hasLoc            ? selectedLocationId
    : hasUnits          ? sharedLocId
    :                     null

  // Find-on-Map: only when selected units share a real location.
  const findTargetLocId = hasUnits ? sharedLocId : null

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
    if (combatTargetLocId) setCombatLocation(combatTargetLocId)
    setActiveTab('combat')
    clearSelection()
    setSelectedLocation(null)
  }

  function handleFindOnMap() {
    if (!findTargetLocId) return
    const loc = locations.find((l) => l.id === findTargetLocId)
    if (!loc) return
    setMapPage(loc.region)
    setSelectedLocation(findTargetLocId)
  }

  function handleClear() {
    clearSelection()
    setSelectedLocation(null)
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-game-surface border-t border-game-border shadow-2xl shadow-black/30">
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
          <span className="text-xs text-game-text-dim italic">Tap a location to see details</span>
        )}
      </div>

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
            {findTargetLocId && (
              <button onClick={handleFindOnMap} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">
                Find on Map
              </button>
            )}
            {combatTargetLocId && (
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
            {combatTargetLocId && (
              <button onClick={handleGoCombat} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">
                Go to Combat ›
              </button>
            )}
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
