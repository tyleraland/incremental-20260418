import { useState, useRef, useEffect } from 'react'
import { useGameStore, MONSTER_REGISTRY, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'
import { BattleView } from '@/components/BattleView'
import { SCENARIO_REGISTRY } from '@/data/scenarios'

// ── Pages ────────────────────────────────────────────────────────────────────
//
// Two pages: a single pannable "world" with the Geffen → Prontera → Kanto
// chain, and the Geffen Dungeon as a separate sub-area. Region-per-page is
// gone; we navigate within the world by dragging the camera (it's mobile-first
// so no scroll wheel assumed).

interface PageDef {
  id: string
  name: string
  isDungeon?: boolean
  // Dungeon pages: which world location they were entered from. Up-arrow exits
  // back to the world page with that location selected.
  entryLocationId?: string
  // Location this page first centres the camera on (its entry/first cell).
  focusLocationId?: string
}

const PAGES: PageDef[] = [
  { id: 'world',          name: 'World', focusLocationId: 'geffen-city' },
  { id: 'geffen-dungeon', name: 'Geffen Dungeon', isDungeon: true, entryLocationId: 'geffen-city', focusLocationId: 'geffen-dungeon-1' },
  { id: 'aerie',          name: 'Sky Aerie',      isDungeon: true, entryLocationId: 'harpy-roost', focusLocationId: 'aerie-1' },
]

const PAGE_BY_ID: Record<string, PageDef> = Object.fromEntries(PAGES.map((p) => [p.id, p]))

// Per-page grid dimensions. The world is intentionally bigger than a phone
// screen — the player pans to navigate. Empty slots render as faint
// placeholders; populated slots (the path) sit on top.
const PAGE_GRID: Record<string, { cols: number; rows: number }> = {
  'world':          { cols: 12, rows: 8 },
  'geffen-dungeon': { cols: 6,  rows: 5 },
  'aerie':          { cols: 4,  rows: 4 },
}

// Grid coords for cells that ARE on the path. Adjacent path cells are also
// adjacent on the grid (no jumps), so the chain reads as a connected route.
const LOCATION_COORDS: Record<string, [number, number]> = {
  // World — path runs east through the middle, then turns south.
  'geffen-city':      [2, 3],
  'elite-four':       [2, 2],   // Elite Four arena (north of Geffen)
  'geffen-field-1':   [3, 3],   // Geffen Outskirts
  'prontera-field-1': [4, 3],   // Western Approach
  'prontera-city':    [5, 3],
  'prontera-field-3': [6, 3],   // Prontera Field (east)
  'harpy-roost':      [7, 3],   // Harpy Roost (continues east; dense open-world)
  'boar-meadow':      [6, 4],   // Boar Meadow (passive herd — aggression showcase)
  'wolf-den':         [7, 4],   // Dire Wolf Den (aggressive pack — aggression showcase)
  'prontera-field-2': [5, 4],   // Southern Road
  'beach-1':          [5, 5],   // Kanto Beach

  // Proving Grounds — a sandbox cluster east of the path (no path connections).
  'pg-guardian-stand': [8, 2],
  'pg-veiled-approach': [9, 2],
  'pg-wolf-pack':       [10, 2],
  'pg-divided-hall':    [8, 3],
  'pg-ravine':          [9, 3],
  'pg-slime-huddle':    [10, 3],

  // Pathing Grounds — a second sandbox row below the proving grounds.
  'pg-bottleneck':      [8, 5],
  'pg-serpentine':      [9, 5],
  'pg-pillared-hall':   [10, 5],
  'pg-moat':            [8, 6],
  'pg-overgrown-maze':  [9, 6],

  // Geffen Dungeon — L-shape (top row + right column), Floor 1 → Floor 5.
  'geffen-dungeon-1': [1, 1],
  'geffen-dungeon-2': [2, 1],
  'geffen-dungeon-3': [3, 1],
  'geffen-dungeon-4': [3, 2],
  'geffen-dungeon-5': [3, 3],

  // Sky Aerie — a small page reached from the Harpy Roost.
  'aerie-1': [1, 1],
}

const CELL_W   = 74
const CELL_H   = 61
const CELL_GAP = 4   // small grid gutter; adjacent cells visually butt together

function cellOriginX(col: number): number { return col * (CELL_W + CELL_GAP) }
function cellOriginY(row: number): number { return row * (CELL_H + CELL_GAP) }
function cellCenterX(col: number): number { return cellOriginX(col) + CELL_W / 2 }
function cellCenterY(row: number): number { return cellOriginY(row) + CELL_H / 2 }

const ELEMENT_COLORS: Record<string, string> = {
  fire:      'text-orange-400 bg-orange-950/40 border-orange-800/50',
  lightning: 'text-yellow-300 bg-yellow-950/40 border-yellow-700/50',
  ice:       'text-sky-300 bg-sky-950/40 border-sky-700/50',
  earth:     'text-amber-600 bg-amber-950/40 border-amber-700/50',
  wind:      'text-green-400 bg-green-950/40 border-green-800/50',
  water:     'text-blue-400 bg-blue-950/40 border-blue-800/50',
  neutral:   'text-game-text-dim bg-game-border/20 border-game-border/50',
}

// Kind symbols for the map cells & matching trait chips.
const LOCATION_KIND: Record<string, { symbol: string; label: string; cls: string; iconCls: string }> = {
  city:     { symbol: '⌂', label: 'City',     cls: 'text-amber-300 border-amber-700/60 bg-amber-950/40',  iconCls: 'text-amber-400/80'  },
  forest:   { symbol: '♣', label: 'Forest',   cls: 'text-green-300 border-green-800/60 bg-green-950/40',  iconCls: 'text-green-400/80'  },
  mountain: { symbol: '▲', label: 'Mountain', cls: 'text-stone-300 border-stone-700/60 bg-stone-900/50', iconCls: 'text-stone-300/80'  },
  beach:    { symbol: '≈', label: 'Beach',    cls: 'text-sky-300   border-sky-800/60   bg-sky-950/40',   iconCls: 'text-sky-300/80'    },
  dungeon:  { symbol: '◆', label: 'Dungeon',  cls: 'text-rose-300  border-rose-800/60  bg-rose-950/40',  iconCls: 'text-rose-300/80'   },
  plains:   { symbol: '·', label: 'Plains',   cls: 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30', iconCls: 'text-emerald-400/60' },
  arena:    { symbol: '⚔', label: 'Arena',    cls: 'text-violet-300 border-violet-800/60 bg-violet-950/40', iconCls: 'text-violet-400/80' },
}

const KIND_PRIORITY = ['dungeon', 'arena', 'city', 'mountain', 'forest', 'beach', 'plains'] as const

function getLocationKind(traits: string[]) {
  for (const k of KIND_PRIORITY) if (traits.includes(k)) return { key: k, ...LOCATION_KIND[k] }
  return null
}

// ── LocationCell ──────────────────────────────────────────────────────────────

function LocationCell({ location, units, style }: { location: Location; units: Unit[]; style: React.CSSProperties }) {
  const equipment           = useGameStore((s) => s.equipment)
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const enterBattleView     = useGameStore((s) => s.enterBattleView)
  const isSelected          = selectedLocationId === location.id
  const kind                = getLocationKind(location.traits)
  const hasScenario         = !!location.testScenarioId
  const lastTapRef          = useRef(0)

  // Single tap selects (shows the detail panel); double-tap (within 300 ms)
  // drops straight into the location's battlefield. The first tap still
  // selects immediately — the second tap short-circuits before re-toggling.
  function handleTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0
      enterBattleView(location.id)
      return
    }
    lastTapRef.current = now
    setSelectedLocation(isSelected ? null : location.id)
  }

  return (
    <button
      onClick={handleTap}
      style={style}
      title={location.name}
      className={[
        'flex items-center justify-center rounded-md border transition-all overflow-hidden',
        isSelected
          ? 'border-game-primary bg-game-primary/30 ring-2 ring-game-primary/50 shadow-lg shadow-game-primary/30 scale-[1.04]'
          : 'border-game-border bg-game-surface/85 hover:border-game-primary/70 hover:bg-game-surface/95',
      ].join(' ')}
    >
      {kind && (
        <span
          aria-hidden
          className={`text-[22px] leading-none pointer-events-none drop-shadow ${kind.iconCls}`}
        >
          {kind.symbol}
        </span>
      )}
      {/* scenario marker — top-right amber dot */}
      {hasScenario && (
        <span
          aria-hidden
          title="Has a test scenario"
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400/80 ring-1 ring-amber-300/40"
        />
      )}
      {/* unit dots — bottom left */}
      <div className="absolute bottom-1 left-1 grid grid-cols-3 gap-0.5">
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
          <span className="text-[8px] text-game-text-dim leading-none self-center col-span-3">+{units.length - 6}</span>
        )}
      </div>
    </button>
  )
}

// Inline-style nudge: cells use absolute positioning inside the panned world,
// so they need `position: 'absolute'` on top of the props above.
function PositionedCell(props: { location: Location; units: Unit[]; style: React.CSSProperties }) {
  return <LocationCell {...props} style={{ position: 'absolute', ...props.style }} />
}

// ── PannableWorld ─────────────────────────────────────────────────────────────

function PannableWorld({ pageId, locations, units }: { pageId: string; locations: Location[]; units: Unit[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; basePan: { x: number; y: number }; moved: boolean; pointerId: number; captureTarget: Element } | null>(null)
  const suppressClickRef = useRef(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [centered, setCentered] = useState(false)
  const selectedLocationId = useGameStore((s) => s.selectedLocationId)
  const mapFocusNonce      = useGameStore((s) => s.mapFocusNonce)

  const pageLocations = locations.filter((l) => l.region === pageId)
  const grid = PAGE_GRID[pageId] ?? { cols: 1, rows: 1 }

  // World canvas covers the full grid. Empty slots render as faint placeholders;
  // populated cells sit on top.
  const worldW = grid.cols * (CELL_W + CELL_GAP)
  const worldH = grid.rows * (CELL_H + CELL_GAP)

  // Fast lookup of which grid slots are populated, by "col,row" key.
  // (Plain object since `Map` shadows the global constructor in this file.)
  const populated: Record<string, true> = {}
  for (const l of pageLocations) {
    const c = LOCATION_COORDS[l.id]
    if (c) populated[`${c[0]},${c[1]}`] = true
  }

  // Center the camera on the entry location (Geffen City on world, F1 in dungeon)
  // the first time we get measured dimensions for this page.
  useEffect(() => { setCentered(false) }, [pageId])
  useEffect(() => {
    if (centered || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const focusId = PAGE_BY_ID[pageId]?.focusLocationId ?? 'geffen-city'
    const c = LOCATION_COORDS[focusId]
    if (!c) return
    setPan({
      x: rect.width  / 2 - cellCenterX(c[0]),
      y: rect.height / 2 - cellCenterY(c[1]),
    })
    setCentered(true)
  }, [pageId, centered])

  // Recentre on the selected location when something requests focus (roster
  // double-tap / "Map" button bumps mapFocusNonce). Nonce-driven so re-focusing
  // the same cell still re-centres after a manual pan.
  useEffect(() => {
    if (mapFocusNonce === 0 || !selectedLocationId || !containerRef.current) return
    const c = LOCATION_COORDS[selectedLocationId]
    if (!c) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    setPan({
      x: rect.width  / 2 - cellCenterX(c[0]),
      y: rect.height / 2 - cellCenterY(c[1]),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFocusNonce])

  // Pointer capture only kicks in once the pointer has actually moved past the
  // tap threshold — otherwise a child cell's `click` gets diverted to the
  // capturing container and never fires, so taps silently fail to select.
  const onPointerDown = (e: React.PointerEvent) => {
    // Clear any stale "swallow next click" left over from a drag that ended
    // off any clickable — otherwise the next legitimate tap is silently dropped.
    suppressClickRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, basePan: pan, moved: false, pointerId: e.pointerId, captureTarget: e.currentTarget }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true
      try { d.captureTarget.setPointerCapture(d.pointerId) } catch { /* test envs no-op */ }
    }
    if (d.moved) setPan({ x: d.basePan.x + dx, y: d.basePan.y + dy })
  }
  const onPointerUp = () => {
    if (dragRef.current?.moved) suppressClickRef.current = true
    dragRef.current = null
  }

  // Swallow the click that fires immediately after a drag so cells don't
  // toggle when the user was just panning.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: Event) => {
      if (suppressClickRef.current) {
        e.stopPropagation()
        e.preventDefault()
        suppressClickRef.current = false
      }
    }
    el.addEventListener('click', handler, true)
    return () => el.removeEventListener('click', handler, true)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-game-bg overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="absolute"
        style={{ width: worldW, height: worldH, transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {/* Empty grid slots — faint placeholders so the world reads as a
            scannable grid. Skip slots where a location renders on top. */}
        {Array.from({ length: grid.rows }).flatMap((_, row) =>
          Array.from({ length: grid.cols }).map((_, col) => {
            if (populated[`${col},${row}`]) return null
            return (
              <div
                key={`empty-${col}-${row}`}
                className="absolute rounded-md border border-game-border/15 pointer-events-none"
                style={{
                  left: cellOriginX(col), top: cellOriginY(row),
                  width: CELL_W, height: CELL_H,
                }}
              />
            )
          }),
        )}
        {pageLocations.map((loc) => {
          const c = LOCATION_COORDS[loc.id]
          if (!c) return null
          return (
            <PositionedCell
              key={loc.id}
              location={loc}
              units={units.filter((u) => u.locationId === loc.id)}
              style={{
                left: cellOriginX(c[0]),
                top:  cellOriginY(c[1]),
                width: CELL_W, height: CELL_H,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── WorldMap (wrapper: page header + dungeon-exit chip) ──────────────────────

function WorldMap({ locations, units }: { locations: Location[]; units: Unit[] }) {
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const pageId              = useGameStore((s) => s.mapPageId)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const page = PAGE_BY_ID[pageId] ?? PAGES[0]

  // Dungeon: an "Exit" chip returns to the world page with the entry selected.
  const dungeonExit = page.isDungeon && page.entryLocationId
    ? locations.find((l) => l.id === page.entryLocationId) ?? null
    : null
  function exitDungeon() {
    if (!dungeonExit) return
    setMapPage('world')
    setSelectedLocation(dungeonExit.id)
  }

  return (
    <div className="relative h-full w-full">
      <PannableWorld pageId={pageId} locations={locations} units={units} />
      {/* page chip — top-left, sits above the map */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-10 pointer-events-none">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim bg-game-bg/80 border border-game-border rounded px-1.5 py-0.5">
          {page.name}
        </span>
        {dungeonExit && (
          <button
            onClick={exitDungeon}
            className="text-[10px] uppercase tracking-widest text-game-text-dim hover:text-game-text bg-game-bg/80 border border-game-border rounded px-1.5 py-0.5 pointer-events-auto"
          >
            ▲ Exit
          </button>
        )}
      </div>
    </div>
  )
}

// ── UnitActionBar ─────────────────────────────────────────────────────────────

function UnitActionBar() {
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  const clearSelection      = useGameStore((s) => s.clearSelection)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const focusLocationOnMap  = useGameStore((s) => s.focusLocationOnMap)
  const assignUnits         = useGameStore((s) => s.assignUnits)
  const setActiveTab        = useGameStore((s) => s.setActiveTab)
  const enterBattleView     = useGameStore((s) => s.enterBattleView)
  const openReport          = useGameStore((s) => s.openReport)
  const locations           = useGameStore((s) => s.locations)
  const units               = useGameStore((s) => s.units)

  const hasUnits = selectedUnitIds.length > 0

  if (!hasUnits) {
    return <div className="h-12 border-b border-game-border/40" />
  }

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id))
  const location = selectedLocationId ? (locations.find((l) => l.id === selectedLocationId) ?? null) : null
  const hasLoc = location !== null
  const sharedLocId = selectedUnits.every((u) => u.locationId === selectedUnits[0].locationId)
    ? selectedUnits[0].locationId
    : null
  const allAlreadyHere = hasLoc && selectedUnits.every((u) => u.locationId === selectedLocationId)
  const combatTargetLocId = hasLoc ? (allAlreadyHere ? selectedLocationId : null) : sharedLocId

  function handleDeploy() {
    if (!selectedLocationId || allAlreadyHere) return
    assignUnits(selectedUnitIds, selectedLocationId)
  }
  function handleViewUnit() {
    // The Heroes tab shows the primary (1st-selected) unit's detail, so keep the
    // selection intact and just switch tabs.
    if (!selectedUnitIds[0]) return
    setActiveTab('units')
    setSelectedLocation(null)
  }
  function handleFindOnMap() {
    if (!sharedLocId) return
    focusLocationOnMap(sharedLocId)
  }
  function handleGoCombat() {
    if (!combatTargetLocId) return
    enterBattleView(combatTargetLocId)
  }

  return (
    <div className="h-12 px-3 py-1 flex items-stretch gap-1.5 border-b border-game-border bg-game-surface/40 overflow-hidden">
      <span className="text-xs text-game-text-dim shrink-0 mr-auto flex items-center">
        {selectedUnits.length} unit{selectedUnits.length !== 1 ? 's' : ''}
      </span>
      <button
        onClick={handleDeploy}
        disabled={!hasLoc || allAlreadyHere}
        className={[
          'btn-primary text-xs px-2 shrink-0 flex items-center',
          (!hasLoc || allAlreadyHere) ? 'opacity-40 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {hasLoc ? (allAlreadyHere ? 'Here' : 'Deploy') : 'Deploy'}
      </button>
      {selectedUnits.length === 1 && (
        <button onClick={handleViewUnit} className="text-xs px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0 flex items-center">
          View
        </button>
      )}
      {selectedUnits.length === 1 && (
        <button onClick={() => openReport(selectedUnits[0].id)} className="text-xs px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0 flex items-center">
          Report
        </button>
      )}
      {sharedLocId && (
        <button onClick={handleFindOnMap} className="text-xs px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0 flex items-center">
          Map
        </button>
      )}
      {combatTargetLocId && (
        <button onClick={handleGoCombat} className="text-xs px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0 flex items-center">
          Drop in
        </button>
      )}
      <button onClick={() => clearSelection()} aria-label="Clear unit selection" className="w-7 h-7 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors shrink-0">
        ✕
      </button>
    </div>
  )
}

// ── LocationDetailPanel ───────────────────────────────────────────────────────

function LocationDetailPanel() {
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit    = useGameStore((s) => s.toggleSelectUnit)
  const enterBattleView     = useGameStore((s) => s.enterBattleView)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const locations           = useGameStore((s) => s.locations)
  const units               = useGameStore((s) => s.units)
  const locationFamiliarity = useGameStore((s) => s.locationFamiliarity)
  const locationMonstersSeen = useGameStore((s) => s.locationMonstersSeen)

  const [codexMonsterId, setCodexMonsterId] = useState<string | null>(null)
  const codexSeenCount = useGameStore((s) => codexMonsterId ? (s.monsterSeen[codexMonsterId] ?? 0) : 0)

  const location = selectedLocationId ? (locations.find((l) => l.id === selectedLocationId) ?? null) : null
  const hasLoc   = location !== null
  const scenario = location?.testScenarioId ? SCENARIO_REGISTRY[location.testScenarioId] ?? null : null

  const dungeonEntry = location?.dungeonEntryRegion
    ? { regionId: location.dungeonEntryRegion, regionName: PAGE_BY_ID[location.dungeonEntryRegion]?.name ?? location.dungeonEntryRegion }
    : null

  const locationOnlyCombatTargetId = hasLoc && selectedUnitIds.length === 0 ? selectedLocationId : null

  function handleGoCombat() {
    if (!locationOnlyCombatTargetId) return
    enterBattleView(locationOnlyCombatTargetId)
  }
  function handleEnterDungeon() {
    if (!dungeonEntry) return
    setMapPage(dungeonEntry.regionId)
    setSelectedLocation(null)
  }

  return (
    <div className="flex flex-col bg-game-surface border-t border-game-border min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-game-border min-h-[64px] flex flex-col justify-center shrink-0">
        {location ? (
          <>
            <div className="font-semibold text-game-text mb-1">{location.name}</div>
            <p className="text-xs text-game-text-dim leading-snug">{location.description}</p>
          </>
        ) : (
          <span className="text-xs text-game-text-dim italic">Tap a location to see details</span>
        )}
      </div>

      <div className="flex-1 min-h-0 px-4 py-3 space-y-4 overflow-y-auto">
        {location ? (() => {
          const famPct  = Math.round(((locationFamiliarity[location.id] ?? 0) / location.familiarityMax) * 100)
          const seenIds = (locationMonstersSeen[location.id] ?? []).filter((id) => location.monsterIds.includes(id))
          const unknownCount = location.monsterIds.length - seenIds.length
          const unitsHere = units.filter((u) => u.locationId === location.id)
          return (
            <>
              {scenario && (
                <div className="rounded-md border border-amber-700/40 bg-amber-950/20 px-2.5 py-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-300/90 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                    Test Scenario
                    <span className="text-amber-200/80 normal-case tracking-normal font-semibold">{scenario.name}</span>
                  </div>
                  <p className="text-[11px] text-amber-100/80 leading-snug">{scenario.description}</p>
                </div>
              )}

              {location.openWorld && (
                <div className="rounded-md border border-emerald-700/40 bg-emerald-950/20 px-2.5 py-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-300/90 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    Open World
                  </div>
                  <p className="text-[11px] text-emerald-100/80 leading-snug">
                    A persistent hunting ground — monsters respawn over time and your deployed heroes fight them continuously. No discrete waves.
                  </p>
                </div>
              )}

              {unitsHere.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Units here</div>
                  <div className="flex flex-wrap gap-1.5">
                    {unitsHere.map((u) => {
                      const isSelected = selectedUnitIds.includes(u.id)
                      return (
                        <button
                          key={u.id}
                          onClick={() => toggleSelectUnit(u.id)}
                          className={[
                            'shrink-0 px-2 py-1 rounded border text-left transition-colors',
                            isSelected
                              ? 'border-game-primary bg-game-primary/20'
                              : 'border-game-border bg-game-bg hover:border-game-primary/50',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-game-text truncate">{u.name}</span>
                            <span className="text-[9px] text-game-text-dim shrink-0">Lv.{u.level}</span>
                          </div>
                          <div className="text-[9px] text-game-text-dim leading-none mt-0.5">
                            {u.class ?? <span className="italic text-game-muted">unclassed</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="uppercase tracking-widest text-game-text-dim">Familiarity</span>
                  <span className="text-game-accent">{famPct}%</span>
                </div>
                <div className="w-full bg-game-border rounded-full h-1.5">
                  <div className="bg-game-accent h-1.5 rounded-full transition-all" style={{ width: `${famPct}%` }} />
                </div>
              </div>

              {(seenIds.length > 0 || unknownCount > 0) && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Encounters</div>
                  <div className="space-y-1">
                    {seenIds.map((id) => {
                      const m = MONSTER_REGISTRY[id]
                      if (!m) return null
                      return (
                        <button
                          key={id}
                          onClick={() => setCodexMonsterId(id)}
                          className="w-full flex items-center gap-2 bg-game-bg rounded-md px-2.5 py-1.5 border border-transparent hover:border-game-primary/50 transition-colors text-left"
                        >
                          <span className="text-xs text-game-text flex-1 truncate">{m.name}</span>
                          <span className="text-[10px] text-game-text-dim">Lv.{m.level}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${ELEMENT_COLORS[m.element] ?? ELEMENT_COLORS.neutral}`}>
                            {m.element}
                          </span>
                        </button>
                      )
                    })}
                    {unknownCount > 0 && (
                      <div className="flex items-center gap-2 bg-game-bg rounded-md px-2.5 py-1.5 opacity-50">
                        <span className="text-xs text-game-muted flex-1">+{unknownCount} unknown</span>
                        <span className="text-[10px] text-game-muted italic">explore to discover</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {location.traits.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Traits</div>
                  <div className="flex flex-wrap gap-1">
                    {location.traits.map((t) => {
                      const k = LOCATION_KIND[t]
                      if (k) {
                        return (
                          <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${k.cls}`}>
                            <span aria-hidden className="mr-1">{k.symbol}</span>{k.label}
                          </span>
                        )
                      }
                      return (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60 capitalize">
                          {t}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )
        })() : null}
      </div>

      <div className="px-4 py-3 flex items-center gap-2 flex-wrap min-h-[60px] shrink-0 border-t border-game-border/50">
        {hasLoc ? (
          <>
            <span className="text-xs text-game-text-dim mr-auto italic">Location actions</span>
            {locationOnlyCombatTargetId && (
              <button onClick={handleGoCombat} className="text-sm py-1.5 px-3 rounded-lg border border-game-primary/60 bg-game-primary/15 text-game-text hover:bg-game-primary/25 transition-colors">
                Drop in ›
              </button>
            )}
            {dungeonEntry && (
              <button onClick={handleEnterDungeon} className="text-sm py-1.5 px-3 rounded-lg border border-red-500/60 bg-red-600/20 text-red-200 hover:bg-red-600/30 hover:border-red-500 transition-colors">
                Enter {dungeonEntry.regionName}
              </button>
            )}
            <button onClick={() => setSelectedLocation(null)} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <span className="text-xs text-game-muted italic">Tap a location on the map to see actions.</span>
        )}
      </div>

      {codexMonsterId && MONSTER_REGISTRY[codexMonsterId] && (
        <MonsterCodex
          monster={MONSTER_REGISTRY[codexMonsterId]}
          seenCount={codexSeenCount}
          onClose={() => setCodexMonsterId(null)}
        />
      )}
    </div>
  )
}

// ── BattleDropIn (Map's battle mode) ───────────────────────────────────────────

function BattleDropIn() {
  const locations        = useGameStore((s) => s.locations)
  const combatLocationId = useGameStore((s) => s.combatLocationId)
  const exitBattleView   = useGameStore((s) => s.exitBattleView)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const round            = useGameStore((s) => (combatLocationId ? s.battles[combatLocationId]?.round : undefined))

  const name = combatLocationId ? (locations.find((l) => l.id === combatLocationId)?.name ?? 'Battlefield') : 'Battlefield'

  return (
    <div className="h-full flex flex-col pt-1 min-h-0">
      {/* When a roster unit is selected, surface the same action bar as the
          overworld (Deploy/Here, View, Map, Drop in) so the controls are
          available without leaving the battlefield. Otherwise the battle
          context bar (Overworld chip + location name + round). Both share the
          h-12 height so the roster → bar → content rhythm is identical. */}
      {selectedUnitIds.length > 0 ? (
        <UnitActionBar />
      ) : (
        <div className="h-12 px-3 flex items-center gap-1.5 border-b border-game-border bg-game-surface/40 shrink-0">
          <button
            onClick={exitBattleView}
            className="text-xs py-1 px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0"
          >
            ⤢ Overworld
          </button>
          <span className="text-sm font-semibold text-game-text truncate">{name}</span>
          {round != null && <span className="text-xs text-game-text-dim ml-auto tabular-nums shrink-0">round {round}</span>}
        </div>
      )}
      <BattleView locationId={combatLocationId} />
    </div>
  )
}

// ── Map ───────────────────────────────────────────────────────────────────────

export function Map() {
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const mapMode   = useGameStore((s) => s.mapMode)
  const combatLocationId = useGameStore((s) => s.combatLocationId)

  if (mapMode === 'battle' && combatLocationId) {
    return <BattleDropIn />
  }

  return (
    <div className="h-full grid grid-rows-[auto_32vh_minmax(0,1fr)] pt-1 min-h-0">
      <UnitActionBar />
      <WorldMap locations={locations} units={units} />
      <LocationDetailPanel />
    </div>
  )
}
