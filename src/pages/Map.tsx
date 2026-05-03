import { useState } from 'react'
import { useGameStore, MONSTER_REGISTRY, RECOVERY_TICKS, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'

// ── World pages (one per region) ──────────────────────────────────────────────

const GRID_W   = 3
const GRID_H   = 3
const CELL_PX  = 88
const GAP_PX   = 4

interface PageNeighbors { left?: string; right?: string; up?: string; down?: string }
interface PageDef extends PageNeighbors {
  id: string
  name: string
  // For dungeon pages: the world location used as entry. The up-arrow exits
  // to that location's region with the entry location selected. Dungeons
  // never have left/right/down neighbors.
  isDungeon?: boolean
  entryLocationId?: string
}

const PAGES: PageDef[] = [
  // Prontera is east of Geffen.
  { id: 'geffen',         name: 'Geffen Region',   right: 'prontera', down: 'kanto' },
  { id: 'prontera',       name: 'Prontera Region', left:  'geffen',   down: 'kanto' },
  { id: 'kanto',          name: 'Kanto',           up:    'prontera' },
  { id: 'geffen-dungeon', name: 'Geffen Dungeon',  isDungeon: true,   entryLocationId: 'geffen-city' },
]

const PAGE_BY_ID: Record<string, PageDef> = Object.fromEntries(PAGES.map((p) => [p.id, p]))

// Per-region (col, row) on the 3×3 grid (0-indexed). Unknown ids fall back to auto-flow.
const LOCATION_COORDS: Record<string, [number, number]> = {
  // Prontera region
  'prontera-field-1': [0, 0], 'prontera-field-2': [1, 0], 'prontera-field-3': [2, 0],
  'kings-forest':     [0, 1], 'prontera-city':    [1, 1], 'prontera-field-4': [2, 1],
  'duskwood':         [0, 2], 'prontera-field-5': [1, 2], 'prontera-field-6': [2, 2],

  // Geffen region
  'geffen-field-1': [0, 0], 'geffen-field-2': [1, 0], 'mount-mjolnir':  [2, 0],
  'geffen-field-3': [0, 1], 'geffen-city':    [1, 1], 'geffen-field-4': [2, 1],
  'geffen-field-5': [0, 2], 'geffen-field-6': [1, 2], 'geffen-field-7': [2, 2],

  // Geffen Dungeon — top row + right column (Floor 1 top-left → Floor 5 bottom-right)
  'geffen-dungeon-1': [0, 0],
  'geffen-dungeon-2': [1, 0],
  'geffen-dungeon-3': [2, 0],
  'geffen-dungeon-4': [2, 1],
  'geffen-dungeon-5': [2, 2],

  // Kanto — 9 beaches fill the 3×3
  'beach-1': [0, 0], 'beach-2': [1, 0], 'beach-3': [2, 0],
  'beach-4': [0, 1], 'beach-5': [1, 1], 'beach-6': [2, 1],
  'beach-7': [0, 2], 'beach-8': [1, 2], 'beach-9': [2, 2],
}

function hpBarColor(hp: number) {
  if (hp > 60) return 'bg-game-green'
  if (hp > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

const ELEMENT_COLORS: Record<string, string> = {
  fire:      'text-orange-400 bg-orange-950/40 border-orange-800/50',
  lightning: 'text-yellow-300 bg-yellow-950/40 border-yellow-700/50',
  ice:       'text-sky-300 bg-sky-950/40 border-sky-700/50',
  earth:     'text-amber-600 bg-amber-950/40 border-amber-700/50',
  wind:      'text-green-400 bg-green-950/40 border-green-800/50',
  water:     'text-blue-400 bg-blue-950/40 border-blue-800/50',
  neutral:   'text-game-text-dim bg-game-border/20 border-game-border/50',
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
        'shrink-0 w-28 px-3 py-2 border-b text-left select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:bg-white/5',
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
    <div className="-mt-7 overflow-x-auto">
      <div className="flex gap-px">
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
          : 'h-5 self-center flex items-center justify-center px-2 gap-1.5',
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

  // Dungeon pages: only an up arrow, which exits to the entry location's
  // region and selects the entry so the player has context. World pages use
  // their declared neighbors and clear selection on navigation.
  const dungeonExit = page.isDungeon && page.entryLocationId
    ? locations.find((l) => l.id === page.entryLocationId) ?? null
    : null

  const left  = page.isDungeon ? null : (page.left  ? PAGE_BY_ID[page.left]  : null)
  const right = page.isDungeon ? null : (page.right ? PAGE_BY_ID[page.right] : null)
  const down  = page.isDungeon ? null : (page.down  ? PAGE_BY_ID[page.down]  : null)
  const up: PageDef | null = page.isDungeon
    ? (dungeonExit ? { id: dungeonExit.region, name: dungeonExit.name } : null)
    : (page.up ? PAGE_BY_ID[page.up] : null)

  const goto = (target: PageDef | null) => {
    if (!target) return
    setMapPage(target.id)
    if (page.isDungeon && dungeonExit) {
      // Returning to the entry location — keep it selected so deploy/codex
      // are one tap away.
      setSelectedLocation(dungeonExit.id)
    } else {
      setSelectedLocation(null)
    }
  }

  const pageLocations = locations.filter((l) => l.region === page.id)

  return (
    <div className="bg-game-surface overflow-hidden">
      <div className="px-2 py-1 space-y-1">
        {/* Up arrow row */}
        <div className="flex justify-center min-h-[20px]">
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
              {/* Placeholder cells fill every (col, row) so empty slots are visible
                  but non-interactive. Locations render on top via explicit gridColumn/Row. */}
              {Array.from({ length: GRID_W * GRID_H }).map((_, i) => {
                const x = i % GRID_W
                const y = Math.floor(i / GRID_W)
                const occupied = pageLocations.some((l) => {
                  const c = LOCATION_COORDS[l.id]
                  return c && c[0] === x && c[1] === y
                })
                if (occupied) return null
                return (
                  <div
                    key={`ph-${x}-${y}`}
                    style={{ gridColumn: x + 1, gridRow: y + 1 }}
                    className="rounded-md border border-game-border/30 bg-game-surface/20 pointer-events-none"
                  />
                )
              })}
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
        <div className="flex justify-center min-h-[20px]">
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
  const toggleSelectUnit    = useGameStore((s) => s.toggleSelectUnit)
  const clearSelection      = useGameStore((s) => s.clearSelection)
  const assignUnits         = useGameStore((s) => s.assignUnits)
  const setActiveTab        = useGameStore((s) => s.setActiveTab)
  const setCombatLocation   = useGameStore((s) => s.setCombatLocation)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const toggleUnit          = useGameStore((s) => s.toggleUnit)
  const expandedUnitIds     = useGameStore((s) => s.expandedUnitIds)
  const locations           = useGameStore((s) => s.locations)
  const units               = useGameStore((s) => s.units)
  const locationFamiliarity = useGameStore((s) => s.locationFamiliarity)
  const locationMonstersSeen = useGameStore((s) => s.locationMonstersSeen)
  const encounters          = useGameStore((s) => s.encounters)

  const [codexMonsterId, setCodexMonsterId] = useState<string | null>(null)
  const codexSeenCount = useGameStore((s) => codexMonsterId ? (s.monsterSeen[codexMonsterId] ?? 0) : 0)

  const location = selectedLocationId ? (locations.find((l) => l.id === selectedLocationId) ?? null) : null
  const hasUnits = selectedUnitIds.length > 0
  const hasLoc   = location !== null

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id))
  const sharedLocId   = selectedUnits.length > 0 && selectedUnits.every((u) => u.locationId === selectedUnits[0].locationId)
    ? selectedUnits[0].locationId
    : null
  const allAlreadyHere = hasLoc && selectedUnits.length > 0 && selectedUnits.every((u) => u.locationId === selectedLocationId)

  const dungeonEntry = location?.dungeonEntryRegion
    ? { regionId: location.dungeonEntryRegion, regionName: PAGE_BY_ID[location.dungeonEntryRegion]?.name ?? location.dungeonEntryRegion }
    : null

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

  function handleEnterDungeon() {
    if (!dungeonEntry) return
    setMapPage(dungeonEntry.regionId)
    setSelectedLocation(null)  // entry location lives on a different page; keep unit selection so deploy is one tap
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

      {/* Middle: familiarity + traits + encounters, fills remaining vertical space */}
      <div className="flex-1 min-h-0 px-4 py-3 space-y-4 overflow-y-auto">
        {location ? (() => {
          const famPct  = Math.round(((locationFamiliarity[location.id] ?? 0) / location.familiarityMax) * 100)
          const seenIds = (() => {
            const saved   = (locationMonstersSeen[location.id] ?? []).filter((id) => location.monsterIds.includes(id))
            const inSlots = (encounters[location.id] ?? []).map((sl) => sl.monsterId).filter((id) => location.monsterIds.includes(id))
            return [...new Set([...saved, ...inSlots])]
          })()
          const unknownCount = location.monsterIds.length - seenIds.length
          const unitsHere = units.filter((u) => u.locationId === location.id)
          return (
            <>
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
                    {location.traits.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60 capitalize">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })() : null}
      </div>

      <div className="px-4 py-3 flex items-center gap-2 flex-wrap min-h-[60px] shrink-0 border-t border-game-border/50">
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
            {dungeonEntry && (
              <button onClick={handleEnterDungeon} className="text-sm py-1.5 px-3 rounded-lg border border-red-500/60 bg-red-600/20 text-red-200 hover:bg-red-600/30 hover:border-red-500 transition-colors">
                Enter {dungeonEntry.regionName}
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
            {dungeonEntry && (
              <button onClick={handleEnterDungeon} className="text-sm py-1.5 px-3 rounded-lg border border-red-500/60 bg-red-600/20 text-red-200 hover:bg-red-600/30 hover:border-red-500 transition-colors">
                Enter {dungeonEntry.regionName}
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

// ── Map ───────────────────────────────────────────────────────────────────────

export function Map() {
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)

  return (
    <div className="h-full grid grid-rows-[auto_auto_minmax(0,1fr)] pt-4">
      <RosterCarousel units={units} />
      <WorldMap locations={locations} units={units} />
      <LocationDetailPanel />
    </div>
  )
}
