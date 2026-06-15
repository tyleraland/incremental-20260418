import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGameStore, getDerivedStats, type Unit, type Location } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'

// ── Prototype Stage ────────────────────────────────────────────────────────────
//
// The always-on left half: a single viewport that ZOOMS between scales —
//   0  World    — the whole overworld, locations + travel routes + hero clusters
//   1  Locale   — flown in onto one location and its neighbours
//   2  Battle   — drops into the live battlefield (reuses the real BattleView)
//
// Selecting a hero (roster) flies the camera to their location; the zoom slider
// (right edge) or the breadcrumb step in/out. Mock-grade: coordinates are copied
// from the real Map so the world reads familiar, but pan/zoom is its own thing.

// Copied from src/pages/Map.tsx — a prototype is allowed to duplicate (CLAUDE.md:
// three similar lines beat a premature abstraction). Only the world page is shown.
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

// HP-coloured status dot for a hero, mirroring the real map's convention.
function heroDot(u: Unit, maxHp: number): string {
  if (u.recoveryTicksLeft > 0) return 'bg-purple-500'
  if (u.isResting) return 'bg-sky-500'
  const pct = (u.health / maxHp) * 100
  return pct > 60 ? 'bg-game-green' : pct > 30 ? 'bg-game-gold' : 'bg-red-500'
}

type Zoom = 0 | 1 | 2
const SCALE: Record<Zoom, number> = { 0: 0.62, 1: 1.45, 2: 1 }

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
          ? 'border-game-primary bg-game-primary/25 ring-4 ring-game-primary/30 scale-110 shadow-lg shadow-game-primary/40'
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
  const units              = useGameStore((s) => s.units)
  const locations          = useGameStore((s) => s.locations)
  const equipment          = useGameStore((s) => s.equipment)
  const selectedLocationId = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const setCombatLocation  = useGameStore((s) => s.setCombatLocation)
  const battles            = useGameStore((s) => s.battles)

  const [zoom, setZoom] = useState<Zoom>(0)
  // World-space point the camera is centred on, and a manual drag offset (screen px).
  const [focus, setFocus] = useState<{ x: number; y: number }>({ x: 6 * CELL, y: 3.5 * CELL })
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; base: { x: number; y: number }; moved: boolean } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const worldLocs = locations.filter((l) => l.region === 'world' && LOCATION_COORDS[l.id])
  const focusLoc = selectedLocationId ? locations.find((l) => l.id === selectedLocationId) ?? null : null

  // Fly the camera to the selected location whenever it changes (roster pick, node tap).
  useEffect(() => {
    if (!focusLoc) return
    const c = LOCATION_COORDS[focusLoc.id]; if (!c) return
    setFocus({ x: worldX(c), y: worldY(c) }); setDrag({ x: 0, y: 0 })
    setZoom((z) => (z === 0 ? 1 : z))
    setCombatLocation(focusLoc.id)
  }, [focusLoc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function flyTo(loc: Location) { setSelectedLocation(loc.id) }
  function dive(loc: Location)  { setSelectedLocation(loc.id); setZoom(2) }
  function zoomOut() {
    if (zoom === 2) { setZoom(1); return }
    setZoom(0); setFocus({ x: 6 * CELL, y: 3.5 * CELL }); setDrag({ x: 0, y: 0 })
  }

  // Drag-to-pan (world & locale only).
  function onDown(e: React.PointerEvent) {
    if (zoom === 2) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, base: drag, moved: false }
  }
  function onMove(e: React.PointerEvent) {
    const d = dragRef.current; if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true
    if (d.moved) setDrag({ x: d.base.x + dx, y: d.base.y + dy })
  }
  function onUp() { dragRef.current = null }

  const scale = SCALE[zoom]
  const panX = size.w / 2 - focus.x * scale + drag.x
  const panY = size.h / 2 - focus.y * scale + drag.y

  // Connection lines between linked world locations.
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const l of worldLocs) {
    const a = LOCATION_COORDS[l.id]; if (!a) continue
    for (const cid of l.connections) {
      if (cid < l.id) continue // de-dupe each undirected edge
      const b = LOCATION_COORDS[cid]; if (!b) continue
      lines.push({ x1: worldX(a), y1: worldY(a), x2: worldX(b), y2: worldY(b) })
    }
  }

  const battleLive = focusLoc ? !!battles[focusLoc.id] : false

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-game-bg via-[#0b0b14] to-[#0d0d18]">
      {/* breadcrumb */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1 text-[11px]">
        <button onClick={zoomOut} className={`px-2 py-1 rounded-md border border-game-border bg-game-bg/80 ${zoom === 0 ? 'text-game-text' : 'text-game-text-dim hover:text-game-text'}`}>World</button>
        {focusLoc && <span className="text-game-muted">›</span>}
        {focusLoc && (
          <button onClick={() => setZoom(1)} className={`px-2 py-1 rounded-md border border-game-border bg-game-bg/80 ${zoom === 1 ? 'text-game-text' : 'text-game-text-dim hover:text-game-text'}`}>{focusLoc.name}</button>
        )}
        {focusLoc && zoom === 2 && <span className="text-game-muted">›</span>}
        {focusLoc && zoom === 2 && <span className="px-2 py-1 rounded-md border border-game-primary/50 bg-game-primary/15 text-game-text">⚔ Battlefield</span>}
      </div>

      {/* zoom rail */}
      <div className="absolute top-1/2 right-2 -translate-y-1/2 z-20 flex flex-col gap-1.5 bg-game-bg/70 border border-game-border rounded-xl p-1.5">
        {([2, 1, 0] as Zoom[]).map((z) => (
          <button
            key={z}
            onClick={() => { if (z === 2 && !focusLoc) return; setZoom(z) }}
            disabled={z === 2 && !focusLoc}
            title={['World', 'Locale', 'Battle'][z]}
            className={[
              'w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-colors',
              zoom === z ? 'bg-game-primary text-white' : 'text-game-text-dim hover:bg-white/5',
              z === 2 && !focusLoc ? 'opacity-30 cursor-not-allowed' : '',
            ].join(' ')}
          >{['🗺', '⌖', '⚔'][z]}</button>
        ))}
      </div>

      {zoom === 2 && focusLoc ? (
        <div className="absolute inset-0 pt-12">
          <div className="h-full">
            <BattleView locationId={focusLoc.id} />
          </div>
          {!battleLive && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-game-text-dim bg-game-bg/80 border border-game-border rounded-full px-3 py-1">
              Formation preview — deploy heroes here to begin the fight
            </div>
          )}
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="absolute inset-0 select-none cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
          <div className="absolute top-0 left-0 origin-top-left transition-transform duration-500 ease-out"
               style={{ transform: `translate(${panX}px, ${panY}px) scale(${scale})` }}>
            <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0 }}>
              {lines.map((ln, i) => (
                <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                      stroke="#2a2a3a" strokeWidth={3} strokeDasharray="2 6" strokeLinecap="round" />
              ))}
            </svg>
            {worldLocs.map((loc) => (
              <WorldNode
                key={loc.id} loc={loc} units={units} equipment={equipment}
                selected={selectedLocationId === loc.id}
                onTap={() => flyTo(loc)} onDive={() => dive(loc)}
              />
            ))}
          </div>
        </div>
      )}

      {/* dive affordance at locale zoom */}
      {zoom === 1 && focusLoc && (
        <button
          onClick={() => setZoom(2)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full border border-game-primary/60 bg-game-primary/20 text-sm text-game-text hover:bg-game-primary/30 transition-colors shadow-lg shadow-game-primary/20"
        >⚔ Drop into {focusLoc.name}</button>
      )}
    </div>
  )
}
