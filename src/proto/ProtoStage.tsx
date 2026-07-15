import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGameStore, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import type { BattleState } from '@/engine'
import { BattleView } from '@/components/BattleView'
import { useProtoStore, type ZoomLevel } from './protoStore'
import { useQuestBoard } from './QuestJournal'
import { StageOverlay } from './StageOverlay'
import { mapPreviewUrl } from './mapPreview'

// ── Prototype Stage ────────────────────────────────────────────────────────────
//
// The always-on left half: ONE viewport with a continuous zoom axis (0 → 2).
//   0   World    — the whole overworld, locations + travel routes + hero clusters
//   1   Locale   — flown in onto one location and its neighbours
//   2   Battle   — the live battlefield (the real BattleView)
//
// There is no hard cut between locale and battle: as zoom climbs past ~1.3 the
// map keeps scaling up while the battlefield crossfades in over it, so the node
// "opens" into the fight. Wheel (desktop) and pinch (touch) drive the axis
// continuously; the zoom rail / breadcrumb tween to the named stops.

const LOCATION_COORDS: Record<string, [number, number]> = {
  // World page — open-world locations only (cities + open fields).
  'geffen-city': [2, 3], 'payon-city': [5, 2], 'prontera-city': [5, 3],
  'prontera-field-3': [6, 3], 'harpy-roost': [7, 3], 'pg-overgrown-maze': [8, 4],
  'boar-meadow': [6, 4], 'wolf-den': [7, 4], 'prontera-field-2': [5, 4], 'beach-1': [5, 5],
  'mirror-vale': [6, 5],   // §mapgen: first generated map
  // Fixed Encounters page (sandbox-only test dungeon, entered from Prontera) —
  // discrete-wave arenas + the early fields + the Elemental Frontier chain.
  'geffen-field-1': [1, 1], 'prontera-field-1': [2, 1], 'elite-four': [3, 1],
  'pg-guardian-stand': [1, 2], 'pg-veiled-approach': [2, 2], 'pg-wolf-pack': [3, 2],
  'pg-threat-trial': [4, 2], 'pg-divided-hall': [5, 2], 'pg-ravine': [6, 2], 'pg-slime-huddle': [7, 2],
  'pg-menagerie': [8, 2],
  'pg-bottleneck': [1, 3], 'pg-serpentine': [2, 3], 'pg-pillared-hall': [3, 3],
  'pg-moat': [4, 3], 'pg-elemental-circle': [5, 3],
  'ember-hollow': [1, 4], 'cinder-dunes': [2, 4], 'hollow-barrow': [3, 4], 'irradiated-marsh': [4, 4],
  // Geffen Dungeon page — L-shape (Floor 1 → Floor 5)
  'geffen-dungeon-1': [2, 2], 'geffen-dungeon-2': [3, 2], 'geffen-dungeon-3': [4, 2],
  'geffen-dungeon-4': [4, 3], 'geffen-dungeon-5': [4, 4],
  // Sky Aerie page
  'aerie-1': [3, 3],
}

// Map pages (regions) reachable in the stage. Dungeons are entered from a world
// location's `dungeonEntryRegion` (LocationDetail) and exited back to their
// `entryLocationId`. Mirrors PAGES in the production Map.
const REGIONS: Record<string, { name: string; icon: string; entryLocationId?: string }> = {
  world:              { name: 'World',           icon: '🗺' },
  'geffen-dungeon':   { name: 'Geffen Dungeon',  icon: '◆', entryLocationId: 'geffen-city' },
  aerie:              { name: 'Sky Aerie',       icon: '▲', entryLocationId: 'harpy-roost' },
  'fixed-encounters': { name: 'Fixed Encounters', icon: '⚔', entryLocationId: 'prontera-city' },
}

const CELL = 96 // world-space px per grid step
const TILE = CELL - 6 // the blurry map-preview tile; a thin seam between neighbours reads as water/void

function worldX(c: [number, number]) { return c[0] * CELL + CELL / 2 }
function worldY(c: [number, number]) { return c[1] * CELL + CELL / 2 }

function heroDot(u: Unit, maxHp: number): string {
  if (u.recoveryTicksLeft > 0) return 'bg-purple-500'
  if (u.isResting) return 'bg-sky-500'
  const pct = (u.health / maxHp) * 100
  return pct > 60 ? 'bg-game-green' : pct > 30 ? 'bg-game-gold' : 'bg-red-500'
}

// ── continuous-zoom transfer functions ───────────────────────────────────────
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
// World 0.55× → Locale 1.4× → keep growing to 3.6× as the node fills the frame.
function mapScaleFor(z: number) {
  return z <= 1 ? lerp(0.85, 1.4, clamp(z, 0, 1)) : lerp(1.4, 3.6, clamp(z - 1, 0, 1))
}
const battleOpacityFor = (z: number) => clamp((z - 1.3) / 0.45, 0, 1) // fades in over 1.3 → 1.75
const battleScaleFor   = (z: number) => lerp(0.94, 1, clamp((z - 1.25) / 0.55, 0, 1))

// ── NodeScatter ───────────────────────────────────────────────────────────────
// A live mini-view of an open-world battle, plotted inside its world-map node:
// each HERO at its REAL position, gliding between tick positions. Because the
// proto full-sims every deployed field every tick (it never sets a single
// "watched" battle), this is a true window on combat that's genuinely happening
// in parallel — the map reads as alive, not frozen, without dropping in. Monsters
// are summarised by the node's live foe-count badge (not plotted here — the dot
// swarm belongs on the battlefield mini-map, not the overworld). Fades in from
// world→locale altitude so the zoomed-out overview stays legible.
function NodeScatter({ battle, zoom, px }: { battle: BattleState; zoom: number; px: number }) {
  const op = clamp((zoom - 0.4) / 0.7, 0, 1)     // ~0 at full world, ~1 by locale
  if (op <= 0.02) return null
  const cols = battle.cols || 1, rows = battle.rows || 1
  const heroes = battle.combatants.filter((c) => c.team === 'player' && c.alive)
  const tx = (p: { x: number; y: number }) =>
    `translate(${(p.x / cols) * px}px, ${((rows - p.y) / rows) * px}px)`
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: op }}>
      {heroes.map((c) => (
        <span key={c.id} className="absolute top-0 left-0 w-[5px] h-[5px] -ml-[2.5px] -mt-[2.5px] rounded-full bg-sky-300 ring-1 ring-sky-100/50 shadow-sm"
          style={{ transform: tx(c.pos), transition: 'transform 220ms linear', willChange: 'transform' }} />
      ))}
    </div>
  )
}

// ── WorldNode ───────────────────────────────────────────────────────────────
export function WorldNode({ loc, units, equipment, battle, zoom, selected, questReady, onTap, onDive }: {
  loc: Location; units: Unit[]; equipment: ReturnType<typeof useGameStore.getState>['equipment']
  battle?: BattleState; zoom: number
  selected: boolean; questReady: boolean; onTap: () => void; onDive: () => void
}) {
  const c = LOCATION_COORDS[loc.id]; if (!c) return null
  const here = units.filter((u) => u.locationId === loc.id)
  const showScatter = loc.openWorld && !!battle && battle.mode === 'open'
  const preview = mapPreviewUrl(loc)
  const lastTap = useRef(0)
  function tap() {
    const now = Date.now()
    if (now - lastTap.current < 320) { lastTap.current = 0; onDive(); return }
    lastTap.current = now; onTap()
  }
  return (
    <button
      onClick={tap}
      title={loc.name}
      className={[
        'absolute -translate-x-1/2 -translate-y-1/2 group rounded-lg overflow-hidden border transition-[box-shadow,border-color] duration-150',
        selected
          ? 'border-game-primary ring-2 ring-game-primary/50 z-10 shadow-[0_0_16px_rgba(99,102,241,0.5)]'
          : 'border-white/10 hover:border-game-primary/50',
      ].join(' ')}
      style={{ left: worldX(c), top: worldY(c), width: TILE, height: TILE }}
    >
      {/* blurry terrain preview — the landmass/water/barrier read. Scaled out a
          touch so the blur halo never exposes the tile edge. */}
      <div
        className="absolute inset-0 bg-game-surface"
        style={{
          backgroundImage: preview ? `url(${preview})` : undefined,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(1.6px) saturate(1.14) brightness(1.1)',
          transform: 'scale(1.18)',
        }}
      />
      {/* inner vignette gives the flat thumbnail some depth + keeps chrome legible */}
      <div className="absolute inset-0 rounded-lg" style={{ boxShadow: 'inset 0 0 10px 1px rgba(0,0,0,0.45)' }} />
      {selected && <div className="absolute inset-0 rounded-lg bg-game-primary/10" />}

      {/* live hero positions, gliding — the map reads as alive */}
      {showScatter && <NodeScatter battle={battle!} zoom={zoom} px={TILE} />}

      {/* open-world marker */}
      {loc.openWorld && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-black/50" title="Open world" />
      )}
      {/* a quest here is ready to collect — a yellow (?) nudge */}
      {questReady && (
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-game-gold text-game-bg text-[11px] font-bold leading-none flex items-center justify-center border border-black/40 shadow"
          title="Rewards ready to collect"
        >?</span>
      )}
      {/* heroes stationed here (HP-coloured pips) — presence even without a live battle */}
      {here.length > 0 && (
        <span className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-0.5 px-1 py-0.5 rounded-full bg-black/55 backdrop-blur-sm">
          {here.slice(0, 4).map((u) => (
            <span key={u.id} className={`w-1.5 h-1.5 rounded-full ${heroDot(u, getDerivedStats(u, equipment).maxHp)}`} />
          ))}
        </span>
      )}

      {/* location name plate, printed on the map */}
      <span
        className={[
          'absolute bottom-1 left-1/2 -translate-x-1/2 max-w-[130%] px-1.5 py-0.5 rounded whitespace-nowrap text-[10px] font-semibold leading-none transition-colors',
          selected ? 'text-white bg-black/75' : 'text-white/90 bg-black/55 group-hover:text-white group-hover:bg-black/70',
        ].join(' ')}
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
      >{loc.name}</span>
    </button>
  )
}

// ── ProtoStage ──────────────────────────────────────────────────────────────
export function ProtoStage() {
  const units               = useGameStore((s) => s.units)
  const locations           = useGameStore((s) => s.locations)
  const equipment           = useGameStore((s) => s.equipment)
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const setCombatLocation   = useGameStore((s) => s.setCombatLocation)
  const battles             = useGameStore((s) => s.battles)
  const mapPageId           = useGameStore((s) => s.mapPageId)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const stageOverlay        = useProtoStore((s) => s.stageOverlay)
  const closeStageOverlay   = useProtoStore((s) => s.closeStageOverlay)
  const requestZoom         = useProtoStore((s) => s.requestZoom)
  const requestHeroBattle   = useProtoStore((s) => s.requestHeroBattle)

  // Follow from the battlefield detail card: select the hero in the roster and
  // lock the camera onto them (battleFollowId), staying on the battlefield.
  function followFromCard(unitId: string) {
    useGameStore.setState({ selectedUnitIds: [unitId], battleFollowId: unitId })
    requestZoom(2)
  }

  // Tapping a combatant on the battlefield opens the unified Unit card in the
  // lens (the floating sheet is gone in proto). Heroes select in the roster;
  // monsters route to the Unit tab as an inspected foe.
  function inspectOnBattlefield(combatantId: string) {
    const isHero = useGameStore.getState().units.some((u) => u.id === combatantId)
    if (isHero) {
      useGameStore.setState({ selectedUnitIds: [combatantId] })
      useProtoStore.getState().clearFoe()
      requestHeroBattle()
    } else if (focusLoc) {
      useProtoStore.getState().inspectFoe(focusLoc.id, combatantId)
    }
  }

  // Default to the *locale* altitude (zoom 1) rather than the fully zoomed-out
  // world overview — the same stop the ‹ › stepper settles on. The battlefield
  // only crossfades in past ~1.3, so this is "world map, zoomed in" with no battle.
  const [zoom, setZoom] = useState(1)       // continuous 0..2
  const [navOpen, setNavOpen] = useState(false)   // breadcrumb collapsed → top-left chip
  // Start centred on the current page's centroid so the locale-altitude default
  // frames the map's content (not the hard-coded world-overview centre).
  const [focus, setFocus] = useState(() => {
    const { locations: locs, mapPageId: page } = useGameStore.getState()
    const onPage = locs.filter((l) => l.region === page && LOCATION_COORDS[l.id])
    if (onPage.length === 0) return { x: 6 * CELL, y: 3.5 * CELL }
    let sx = 0, sy = 0
    for (const l of onPage) { const c = LOCATION_COORDS[l.id]; sx += worldX(c); sy += worldY(c) }
    return { x: sx / onPage.length, y: sy / onPage.length }
  })
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Pointer bookkeeping: single-pointer drag-pan + two-pointer pinch-zoom.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragRef = useRef<{ sx: number; sy: number; base: { x: number; y: number }; moved: boolean } | null>(null)
  const pinchRef = useRef<number | null>(null)
  const tweenRef = useRef<number | null>(null)
  const mapActiveRef = useRef(true)   // current mapActive, for the native wheel listener's stale closure

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // The stage renders one region (map page) at a time. Dungeon pages are entered
  // from a world location's "Enter <Region>" (LocationDetail) and exited here.
  const pageLocs = locations.filter((l) => l.region === mapPageId && LOCATION_COORDS[l.id])
  // Locations with a quest ready to collect → a yellow (?) nudge on the node.
  const questBoard = useQuestBoard()
  const questReadyLocs = new Set(questBoard.filter((e) => e.status === 'ready').map((e) => e.locationId))
  const region = REGIONS[mapPageId] ?? REGIONS.world
  const focusLoc = selectedLocationId ? locations.find((l) => l.id === selectedLocationId) ?? null : null
  const maxZoom = focusLoc ? 2 : 1   // can't dive without a focused location

  // Centre of the current page (centroid of its placed cells) — the World stop.
  const pageCenter = (() => {
    if (pageLocs.length === 0) return { x: 6 * CELL, y: 3.5 * CELL }
    let sx = 0, sy = 0
    for (const l of pageLocs) { const c = LOCATION_COORDS[l.id]; sx += worldX(c); sy += worldY(c) }
    return { x: sx / pageLocs.length, y: sy / pageLocs.length }
  })()
  function leaveDungeon() {
    const back = region.entryLocationId
    setMapPage('world')
    if (back) setSelectedLocation(back)
  }

  // Tween the zoom axis to a named stop (button / breadcrumb / dive).
  function animateZoomTo(target: number) {
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current)
    const from = zoom, t0 = performance.now(), dur = 420
    const step = (t: number) => {
      const k = clamp((t - t0) / dur, 0, 1)
      const eased = 1 - Math.pow(1 - k, 3)
      setZoom(lerp(from, target, eased))
      if (k < 1) tweenRef.current = requestAnimationFrame(step)
    }
    tweenRef.current = requestAnimationFrame(step)
  }

  // Fly to the selected location whenever it changes (roster pick, node tap).
  // Zoom itself is driven explicitly (node taps below, or a store zoom request)
  // so a single tap can settle on the locale while a dive/roster goes to battle.
  useEffect(() => {
    if (!focusLoc) return
    const c = LOCATION_COORDS[focusLoc.id]; if (!c) return
    setFocus({ x: worldX(c), y: worldY(c) }); setDrag({ x: 0, y: 0 })
    setCombatLocation(focusLoc.id)
  }, [focusLoc?.id])

  // Honour cross-component zoom requests (initial battlefield, roster pick).
  const zoomRequest = useProtoStore((s) => s.zoomRequest)
  useEffect(() => {
    if (zoomRequest) animateZoomTo(zoomRequest.level)
  }, [zoomRequest?.nonce])


  // Native non-passive wheel listener so we can preventDefault (page-scroll).
  // A plain two-finger trackpad scroll is a PAN gesture, NOT zoom — only a pinch
  // (which browsers report as ctrl+wheel) drives the zoom axis. Previously every
  // wheel zoomed, so trying to scroll-pan a big field zoomed you out to the locale.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        // pinch-to-zoom — but only while the MAP owns the stage. Once the battle
        // has taken over, the pinch belongs to the battle CAMERA (BattleView's
        // own wheel/pinch handling, which runs first as the deeper target);
        // driving the stage axis too made every battle zoom-out gesture
        // crossfade back to the locale. Exiting battle is explicit: the
        // breadcrumb / zoom rail / ⤢ Overworld.
        if (!mapActiveRef.current) return
        if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = null }
        setZoom((z) => clamp(z - e.deltaY * 0.01, 0, maxZoom))
      } else if (mapActiveRef.current) {
        // scroll = pan the overworld (battlefield owns its own pan, so ignore there)
        setDrag((d) => ({ x: d.x - e.deltaX, y: d.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [maxZoom])

  const scale = mapScaleFor(zoom)
  const battleOpacity = focusLoc ? battleOpacityFor(zoom) : 0
  const mapActive = battleOpacity < 0.5      // map handles pan/tap until the battle takes over
  mapActiveRef.current = mapActive
  const panX = size.w / 2 - focus.x * scale + drag.x
  const panY = size.h / 2 - focus.y * scale + drag.y

  function dist2() {
    const pts = [...pointers.current.values()]
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }
  function onDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Touch pinch drives the stage axis only while the MAP owns the stage —
    // in battle the same gesture is the battle camera's (BattleView pinch),
    // and driving both meant zooming the camera also crossfaded to the locale.
    if (pointers.current.size === 2) { pinchRef.current = mapActive ? dist2() : null; dragRef.current = null; return }
    if (mapActive) dragRef.current = { sx: e.clientX, sy: e.clientY, base: drag, moved: false }
  }
  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      if (!mapActiveRef.current) { pinchRef.current = null; return }
      const d = dist2()
      if (pinchRef.current != null) setZoom((z) => clamp(z + (d - pinchRef.current!) * 0.006, 0, maxZoom))
      pinchRef.current = d
      return
    }
    const dg = dragRef.current; if (!dg || !mapActive) return
    const dx = e.clientX - dg.sx, dy = e.clientY - dg.sy
    if (!dg.moved && Math.hypot(dx, dy) > 5) dg.moved = true
    if (dg.moved) setDrag({ x: dg.base.x + dx, y: dg.base.y + dy })
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (pointers.current.size === 0) dragRef.current = null
  }

  // A map-node tap is a LOCATION pick — the command bar + lens flip to location
  // scope (a roster tap flips them back to hero scope).
  function flyTo(loc: Location) { setSelectedLocation(loc.id); useProtoStore.getState().setScopeFocus('location'); animateZoomTo(Math.max(1, zoom)) }
  function dive(loc: Location)  { setSelectedLocation(loc.id); useProtoStore.getState().setScopeFocus('location'); animateZoomTo(2) }
  function gotoStop(z: number) {
    // The "World" stop now settles at the locale altitude (z=1) rather than the
    // far-out overview. Recentre on the current location if one is selected
    // (stepping up from its battlefield keeps it framed), else the whole page.
    if (z <= 1) {
      const c = focusLoc ? LOCATION_COORDS[focusLoc.id] : null
      setFocus(c ? { x: worldX(c), y: worldY(c) } : pageCenter)
      setDrag({ x: 0, y: 0 })
    }
    animateZoomTo(z)
  }

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const l of pageLocs) {
    const a = LOCATION_COORDS[l.id]; if (!a) continue
    for (const cid of l.connections) {
      if (cid < l.id) continue
      const b = LOCATION_COORDS[cid]; if (!b) continue
      lines.push({ x1: worldX(a), y1: worldY(a), x2: worldX(b), y2: worldY(b) })
    }
  }
  const battleLive = focusLoc ? !!battles[focusLoc.id] : false
  const nearest = Math.round(zoom)

  // Occupied locations on THIS page (have ≥1 hero + a map coord) — the ‹ ›
  // stepper cycles through these, keeping the current altitude (≥ locale).
  const occupied = pageLocs.filter((l) => units.some((u) => u.locationId === l.id))
  const occIdx = occupied.findIndex((l) => l.id === selectedLocationId)
  function stepLocation(dir: -1 | 1) {
    if (occupied.length === 0) return
    const i = occIdx < 0 ? (dir === 1 ? 0 : occupied.length - 1) : (occIdx + dir + occupied.length) % occupied.length
    setSelectedLocation(occupied[i].id)
    animateZoomTo(Math.max(1, zoom))
  }

  // Publish the current altitude so the lens can follow it (world/locale/battle).
  useEffect(() => {
    useProtoStore.getState().setZoomLevel(Math.min(2, Math.max(0, nearest)) as ZoomLevel)
  }, [nearest])

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-game-bg via-[#0b0b14] to-[#0d0d18]">
      {/* nav breadcrumb — collapsed to a compact top-LEFT chip so the battlefield
          reclaims the top of the stage; tap to expand the full World›Locale›Battle
          chain + the occupied-location stepper. */}
      <div className="absolute top-2 left-2 z-30 text-[11px]">
        {!navOpen ? (
          <button
            onClick={() => setNavOpen(true)}
            title="Navigate" aria-label="Navigate"
            className="flex items-center gap-1 bg-game-bg/85 border border-game-border rounded-lg px-2 py-1 backdrop-blur-sm text-game-text-dim hover:text-game-text"
          >
            <span aria-hidden>{nearest === 2 ? '⚔' : region.icon}</span>
            <span className="truncate max-w-[40vw]">{nearest === 2 && focusLoc ? `${region.name} › ${focusLoc.name}` : region.name}</span>
            <span className="text-game-muted">⌄</span>
          </button>
        ) : (
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center bg-game-bg/90 border border-game-border rounded-lg px-1 py-0.5 backdrop-blur-sm">
              {/* In a dungeon page, a leading Exit chip pops back to the world. */}
              {mapPageId !== 'world' && (
                <button
                  onClick={() => { leaveDungeon(); setNavOpen(false) }}
                  title={`Leave ${region.name}`}
                  aria-label={`Leave ${region.name}`}
                  className="mr-0.5 px-2 py-1 rounded-md flex items-center gap-1 font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                ><span aria-hidden>↩</span><span>Exit</span></button>
              )}
              {([1, 2] as const).map((z, i) => {
                const label = z === 1 ? region.name : (focusLoc?.name ?? 'Battle')
                const icon = z === 1 ? region.icon : '⚔'
                const disabled = z > 1 && !focusLoc
                return (
                  <span key={z} className="flex items-center">
                    {i > 0 && <span className="px-0.5 text-game-muted">›</span>}
                    <button
                      onClick={() => { if (!disabled) { gotoStop(z); setNavOpen(false) } }}
                      disabled={disabled}
                      className={[
                        'px-2 py-1 rounded-md flex items-center gap-1 transition-colors max-w-[34vw] truncate',
                        nearest === z ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text',
                        disabled ? 'opacity-40 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <span aria-hidden>{icon}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  </span>
                )
              })}
              <button onClick={() => setNavOpen(false)} title="Collapse" aria-label="Collapse navigation" className="ml-0.5 px-1.5 py-1 rounded-md text-game-muted hover:text-game-text">✕</button>
            </div>

            {/* occupied-location stepper (‹ N/M ›) */}
            {occupied.length > 1 && (
              <div className="flex items-center gap-1 bg-game-bg/85 border border-game-border rounded-lg px-1 py-0.5 backdrop-blur-sm">
                <button onClick={() => stepLocation(-1)} title="Previous location with units" aria-label="Previous location with units" className="w-6 h-6 flex items-center justify-center rounded-md text-game-text-dim hover:text-game-text">‹</button>
                <span className="text-[9px] text-game-muted tabular-nums px-0.5">{occIdx >= 0 ? occIdx + 1 : '–'}/{occupied.length}</span>
                <button onClick={() => stepLocation(1)} title="Next location with units" aria-label="Next location with units" className="w-6 h-6 flex items-center justify-center rounded-md text-game-text-dim hover:text-game-text">›</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* viewport: map layer (always) + battle layer (crossfades in) */}
      <div
        ref={wrapRef}
        className="absolute inset-0 select-none touch-none"
        style={{ cursor: mapActive ? 'grab' : 'default' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        {/* map */}
        <div
          className="absolute inset-0"
          style={{ opacity: 1 - battleOpacity, pointerEvents: mapActive ? 'auto' : 'none' }}
        >
          <div className="absolute top-0 left-0 origin-top-left"
               style={{ transform: `translate(${panX}px, ${panY}px) scale(${scale})` }}>
            {pageLocs.map((loc) => (
              <WorldNode key={loc.id} loc={loc} units={units} equipment={equipment}
                         battle={battles[loc.id]} zoom={zoom}
                         selected={selectedLocationId === loc.id}
                         questReady={questReadyLocs.has(loc.id)}
                         onTap={() => flyTo(loc)} onDive={() => dive(loc)} />
            ))}
            {/* travel routes — dashed connections drawn OVER the tiles (the tiles
                now fill their cells, so a route reads as a path across the map,
                not a line hidden beneath the nodes). Dark halo + light dashes for
                contrast on any terrain. */}
            <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0 }}>
              {lines.map((ln, i) => (
                <line key={`h${i}`} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                      stroke="rgba(0,0,0,0.4)" strokeWidth={5} strokeLinecap="round" />
              ))}
              {lines.map((ln, i) => (
                <line key={`d${i}`} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                      stroke="#c7cdea" strokeOpacity={0.75} strokeWidth={2.5} strokeDasharray="1.5 7" strokeLinecap="round" />
              ))}
            </svg>
          </div>
        </div>

        {/* battlefield — mounted once we're zooming in, crossfaded over the map */}
        {focusLoc && zoom > 1.2 && (
          <div
            className="absolute inset-0 bg-game-bg"
            style={{
              opacity: battleOpacity,
              transform: `scale(${battleScaleFor(zoom)})`,
              pointerEvents: mapActive ? 'none' : 'auto',
            }}
          >
            <div className="h-full"><BattleView locationId={focusLoc.id} onFollow={followFromCard} onInspect={inspectOnBattlefield} insetTopControls /></div>
            {!battleLive && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-game-text-dim bg-game-bg/80 border border-game-border rounded-full px-3 py-1">
                Formation preview — deploy heroes here to begin the fight
              </div>
            )}
          </div>
        )}
      </div>

      {/* details/research overlay (skill tree, …) — in front of the battlefield */}
      {stageOverlay && <StageOverlay overlay={stageOverlay} onClose={closeStageOverlay} />}
    </div>
  )
}
