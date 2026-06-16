import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGameStore, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'
import { useProtoStore, type ZoomLevel } from './protoStore'

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
  'geffen-city': [2, 3], 'elite-four': [2, 2], 'geffen-field-1': [3, 3],
  'prontera-field-1': [4, 3], 'prontera-city': [5, 3], 'prontera-field-3': [6, 3],
  'harpy-roost': [7, 3], 'boar-meadow': [6, 4], 'wolf-den': [7, 4],
  'prontera-field-2': [5, 4], 'beach-1': [5, 5],
  'pg-guardian-stand': [8, 2], 'pg-veiled-approach': [9, 2], 'pg-wolf-pack': [10, 2],
  'pg-threat-trial': [11, 2], 'pg-divided-hall': [8, 3], 'pg-ravine': [9, 3],
  'pg-slime-huddle': [10, 3], 'pg-bottleneck': [8, 5], 'pg-serpentine': [9, 5],
  'pg-pillared-hall': [10, 5], 'pg-moat': [8, 6], 'pg-overgrown-maze': [9, 6],
  'pg-elemental-circle': [10, 6], 'ember-hollow': [7, 7], 'cinder-dunes': [8, 7],
  'hollow-barrow': [9, 7], 'irradiated-marsh': [10, 7],
}

const CELL = 96 // world-space px per grid step

const KIND_GLYPH: Record<string, { symbol: string; ring: string; glow: string }> = {
  city:     { symbol: '⌂', ring: 'border-amber-600/60',  glow: 'text-amber-300'   },
  arena:    { symbol: '⚔', ring: 'border-violet-600/60', glow: 'text-violet-300'  },
  dungeon:  { symbol: '◆', ring: 'border-rose-600/60',   glow: 'text-rose-300'    },
  mountain: { symbol: '▲', ring: 'border-stone-500/60',  glow: 'text-stone-300'   },
  forest:   { symbol: '♣', ring: 'border-green-700/60',  glow: 'text-green-300'   },
  beach:    { symbol: '≈', ring: 'border-sky-700/60',    glow: 'text-sky-300'     },
  plains:   { symbol: '·', ring: 'border-emerald-800/50',glow: 'text-emerald-300' },
}
const KIND_PRIORITY = ['dungeon', 'arena', 'city', 'mountain', 'forest', 'beach', 'plains'] as const
function kindOf(traits: string[]) {
  for (const k of KIND_PRIORITY) if (traits.includes(k)) return { key: k, ...KIND_GLYPH[k] }
  return { key: 'plains', ...KIND_GLYPH.plains }
}

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
  return z <= 1 ? lerp(0.55, 1.4, clamp(z, 0, 1)) : lerp(1.4, 3.6, clamp(z - 1, 0, 1))
}
const battleOpacityFor = (z: number) => clamp((z - 1.3) / 0.45, 0, 1) // fades in over 1.3 → 1.75
const battleScaleFor   = (z: number) => lerp(0.94, 1, clamp((z - 1.25) / 0.55, 0, 1))
const ZOOM_NAMES = ['World', 'Locale', 'Battle']

// ── WorldNode ───────────────────────────────────────────────────────────────
function WorldNode({ loc, units, equipment, selected, onTap, onDive }: {
  loc: Location; units: Unit[]; equipment: ReturnType<typeof useGameStore.getState>['equipment']
  selected: boolean; onTap: () => void; onDive: () => void
}) {
  const c = LOCATION_COORDS[loc.id]; if (!c) return null
  const kind = kindOf(loc.traits)
  const here = units.filter((u) => u.locationId === loc.id)
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
      className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 group"
      style={{ left: worldX(c), top: worldY(c), width: CELL - 14 }}
    >
      <div className={[
        'relative w-12 h-12 rounded-xl border-2 flex items-center justify-center backdrop-blur-sm transition-all',
        selected
          ? 'border-game-primary bg-game-primary/25 ring-4 ring-game-primary/30 scale-110'
          : `${kind.ring} bg-game-surface/80 group-hover:scale-105 group-hover:border-game-primary/60`,
      ].join(' ')}>
        <span className={`text-2xl leading-none drop-shadow ${kind.glow}`}>{kind.symbol}</span>
        {loc.openWorld && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-game-bg" title="Open world" />
        )}
        {here.length > 0 && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 px-1 py-0.5 rounded-full bg-game-bg/90 border border-game-border">
            {here.slice(0, 4).map((u) => (
              <span key={u.id} className={`w-1.5 h-1.5 rounded-full ${heroDot(u, getDerivedStats(u, equipment).maxHp)}`} />
            ))}
          </span>
        )}
      </div>
      <span className={[
        'mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors',
        selected ? 'text-game-text bg-game-bg/80' : 'text-game-text-dim bg-game-bg/40 group-hover:text-game-text',
      ].join(' ')}>{loc.name}</span>
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

  const [zoom, setZoom] = useState(0)       // continuous 0..2
  const [focus, setFocus] = useState({ x: 6 * CELL, y: 3.5 * CELL })
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Pointer bookkeeping: single-pointer drag-pan + two-pointer pinch-zoom.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragRef = useRef<{ sx: number; sy: number; base: { x: number; y: number }; moved: boolean } | null>(null)
  const pinchRef = useRef<number | null>(null)
  const tweenRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const worldLocs = locations.filter((l) => l.region === 'world' && LOCATION_COORDS[l.id])
  const focusLoc = selectedLocationId ? locations.find((l) => l.id === selectedLocationId) ?? null : null
  const maxZoom = focusLoc ? 2 : 1   // can't dive without a focused location

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
  }, [focusLoc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Honour cross-component zoom requests (initial battlefield, roster pick).
  const zoomRequest = useProtoStore((s) => s.zoomRequest)
  useEffect(() => {
    if (zoomRequest) animateZoomTo(zoomRequest.level)
  }, [zoomRequest?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps


  // Native non-passive wheel listener so we can preventDefault (page-scroll) and
  // drive the zoom axis continuously.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (tweenRef.current) { cancelAnimationFrame(tweenRef.current); tweenRef.current = null }
      setZoom((z) => clamp(z - e.deltaY * 0.0016, 0, maxZoom))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [maxZoom])

  const scale = mapScaleFor(zoom)
  const battleOpacity = focusLoc ? battleOpacityFor(zoom) : 0
  const mapActive = battleOpacity < 0.5      // map handles pan/tap until the battle takes over
  const panX = size.w / 2 - focus.x * scale + drag.x
  const panY = size.h / 2 - focus.y * scale + drag.y

  function dist2() {
    const pts = [...pointers.current.values()]
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }
  function onDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) { pinchRef.current = dist2(); dragRef.current = null; return }
    if (mapActive) dragRef.current = { sx: e.clientX, sy: e.clientY, base: drag, moved: false }
  }
  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
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

  function flyTo(loc: Location) { setSelectedLocation(loc.id); animateZoomTo(Math.max(1, zoom)) }
  function dive(loc: Location)  { setSelectedLocation(loc.id); animateZoomTo(2) }
  function gotoStop(z: number) {
    if (z === 0) { setFocus({ x: 6 * CELL, y: 3.5 * CELL }); setDrag({ x: 0, y: 0 }) }
    animateZoomTo(z)
  }

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const l of worldLocs) {
    const a = LOCATION_COORDS[l.id]; if (!a) continue
    for (const cid of l.connections) {
      if (cid < l.id) continue
      const b = LOCATION_COORDS[cid]; if (!b) continue
      lines.push({ x1: worldX(a), y1: worldY(a), x2: worldX(b), y2: worldY(b) })
    }
  }
  const battleLive = focusLoc ? !!battles[focusLoc.id] : false
  const nearest = Math.round(zoom)

  // Publish the current altitude so the lens can follow it (world/locale/battle).
  useEffect(() => {
    useProtoStore.getState().setZoomLevel(Math.min(2, Math.max(0, nearest)) as ZoomLevel)
  }, [nearest])

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-game-bg via-[#0b0b14] to-[#0d0d18]">
      {/* context chip — just names where you are (the slider does the navigating) */}
      {focusLoc && (
        <div className="absolute top-2 left-2 z-30 px-2 py-1 rounded-md border border-game-border bg-game-bg/80 text-[11px] text-game-text-dim pointer-events-none">
          {ZOOM_NAMES[nearest]} · <span className="text-game-text">{focusLoc.name}</span>
        </div>
      )}

      {/* zoom slider — the single nav control: World ⇄ Locale ⇄ Battle */}
      <div className="absolute top-1/2 right-2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 bg-game-bg/70 border border-game-border rounded-xl p-1.5">
        {([2, 1, 0]).map((z) => (
          <button
            key={z}
            onClick={() => { if (z === 2 && !focusLoc) return; gotoStop(z) }}
            disabled={z === 2 && !focusLoc}
            title={ZOOM_NAMES[z]}
            className={[
              'w-9 rounded-lg flex flex-col items-center py-1 transition-colors',
              nearest === z ? 'bg-game-primary text-white' : 'text-game-text-dim hover:bg-white/5',
              z === 2 && !focusLoc ? 'opacity-30 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <span className="text-sm leading-none">{['🗺', '⌖', '⚔'][z]}</span>
            <span className="text-[8px] leading-none mt-0.5">{ZOOM_NAMES[z]}</span>
          </button>
        ))}
        {/* continuous fill indicator */}
        <div className="w-1 h-12 rounded-full bg-game-border overflow-hidden relative">
          <div className="absolute bottom-0 inset-x-0 bg-game-primary/70 rounded-full" style={{ height: `${(zoom / 2) * 100}%` }} />
        </div>
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
            <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0 }}>
              {lines.map((ln, i) => (
                <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                      stroke="#2a2a3a" strokeWidth={3} strokeDasharray="2 6" strokeLinecap="round" />
              ))}
            </svg>
            {worldLocs.map((loc) => (
              <WorldNode key={loc.id} loc={loc} units={units} equipment={equipment}
                         selected={selectedLocationId === loc.id}
                         onTap={() => flyTo(loc)} onDive={() => dive(loc)} />
            ))}
          </div>
        </div>

        {/* battlefield — mounted once we're zooming in, crossfaded over the map */}
        {focusLoc && zoom > 1.2 && (
          <div
            className="absolute inset-0 pt-12 bg-game-bg"
            style={{
              opacity: battleOpacity,
              transform: `scale(${battleScaleFor(zoom)})`,
              pointerEvents: mapActive ? 'none' : 'auto',
            }}
          >
            <div className="h-full"><BattleView locationId={focusLoc.id} /></div>
            {!battleLive && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-game-text-dim bg-game-bg/80 border border-game-border rounded-full px-3 py-1">
                Formation preview — deploy heroes here to begin the fight
              </div>
            )}
          </div>
        )}
      </div>

      {/* dive hint while in the locale band */}
      {focusLoc && zoom >= 0.85 && battleOpacity < 0.15 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full border border-game-border bg-game-bg/80 text-[11px] text-game-text-dim pointer-events-none">
          Pinch / scroll in to drop into {focusLoc.name}
        </div>
      )}
    </div>
  )
}
