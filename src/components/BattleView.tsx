import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, type CSSProperties } from 'react'
import { useGameStore, waveComposition, locationBarriers, type Location } from '@/stores/useGameStore'
import { expectedRoundGapMs, glideMs } from '@/render/cadence'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { getAppearance, initials, monsterBodyShape, weaponForClass, biomeForLocation, CLASS_ICON, type Appearance, type BodyShape, type Weapon, type Biome } from '@/render/appearance'
import { TOKEN_SKINS, SKIN_CARRIES_FACING, ARENA_SKINS, FX_SKINS, type BattleSkin } from '@/render/skins'
import { hashString, type Rect } from '@/render/authoring'
import { generateForLocationCached, type MapSpec } from '@/mapgen'
import { partyProficiencyTags } from '@/lib/proficiencies'
import { UnitDetailOverlay } from '@/components/BattleUnitSheet'
import {
  COLS, ROWS, startingPosition, COMBAT_SKILLS, distance, sightlineClear,
  type Rank, type Vec2, type Barrier, type BattleState, type Combatant,
} from '@/engine'

// Status/channel durations are stored in ENGINE rounds (buildStatus applies
// scaleRounds), and the engine runs one round per tick = TICKS_PER_SECOND engine
// rounds/sec, so dividing a duration by that yields real seconds. (Logical pace is
// 5 / ROUND_TIME_SCALE ≈ 0.83 rounds/s, but the displayed durations are in engine
// rounds, so this is the engine-round rate, not the logical one.)
const ROUNDS_PER_SEC = 5

// Battle rendering for the Map tab's "drop-in" view. The arena fills the space
// it's given (square, centred) so the battle is showcased; the selected-unit
// detail surfaces as a dismissable bottom-sheet overlay so it never steals
// arena height. Combat resolves in the engine, stepped one round per N ticks in
// the store — this is purely the viewer.

const skillName = (id: string) => COMBAT_SKILLS[id]?.(1)?.name ?? 'Casting'
const CENTER_Y = ROWS / 2

// How long a cast's name lingers anchored to its caster (covers the channel +
// a beat after the cast lands). Newest cast stacks on top of older ones.
const CAST_LABEL_MS = 3000

// A lingering "✦ <skill>" cast label, anchored to its caster. Rendered as a CHILD
// of the caster's BattleChip (not a separately-positioned sibling) so it inherits
// the chip's compositor glide exactly — no drift/snap relative to the token.
interface CastLabelEntry { id: string; sourceId: string; skillId: string; born: number; seq: number }

// Floating combat numbers (damage/heal/DoT) are harvested into a buffer so they
// live their full lob-and-fade animation instead of unmounting when the next round
// arrives (rounds are ~200ms, the arc is ~1.35s). Matches the CSS animation length.
const FLOAT_NUM_MS = 1350

function hpColor(ratio: number): string {
  if (ratio >= 0.75) return 'bg-emerald-500'
  if (ratio >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

// ── Camera ──────────────────────────────────────────────────────────────────---
// Encounters use a STATIC full-arena camera (arenaCamera); open-world battles
// follow the party (followCamera + autoFitSize). The encounter board is a fixed
// COLS×ROWS that fits on screen whole, so there's nothing to pan or zoom to.

const OPEN_CAM_SIZE     = 15  // open-world: default cells shown (pinch to resize)
const OPEN_CAM_MIN_SIZE = 8   // most zoomed-in
const OPEN_CAM_MAX_SIZE = 60  // most zoomed-out (still less than the whole map)
// Level-of-detail: BattleChip drops its floating label/nubs (most of the
// per-token DOM) when the view is either zoomed far out (tokens too small to
// read) OR packed with many on-screen tokens (labels overlap into noise and the
// render cost spikes — e.g. a harpy swarm fitting a tight party view). Either
// condition trips it; zoom/follow in or thin the crowd and full detail returns.
const LOD_CAM_SIZE      = 18   // cells shown above which tokens are too small to label
const LOD_TOKEN_COUNT   = 16   // on-screen tokens above which labels are dropped

// Dev profiling lever (read once): `?lod=off` forces full detail (labels/nubs/
// attack animations) at any density — the worst-case render; `?lod=on` forces
// the low-detail path. null = the normal LOD_* thresholds above decide.
const LOD_FORCED: boolean | null = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get('lod')
    return v === 'off' ? true : v === 'on' ? false : null
  } catch { return null }
})()

// Reference zoom the ground layer is LAID OUT at (cells across the arena at
// scale 1). Camera zoom is a compositor `scale(GROUND_BASE_CELLS / cam.size)`
// on top — never an animated width/height (layout), which desynced from the
// eased transform under jank and made the ground pattern appear to scroll.
// Matches the default open-world camera so borders/hairlines inside the layer
// (drawn in layer-local px) render at their authored size at the usual zoom.
const GROUND_BASE_CELLS = 15

interface Cam { x: number; y: number; size: number }

// Encounters frame the entire arena and never move. We used to sit slightly
// zoomed in and pop out to "fit everyone" once the units spread past a
// threshold — but in a perimeter-kiting fight the spread oscillates across that
// line every few rounds, so the grid + barriers appeared to breathe in and out
// (and a win snapped the survivors as the bbox collapsed). A fixed full-arena
// frame is stable, shows the whole tuned board, and keeps perimeter action in
// view. Square so the cells stay square in the square arena container.
function arenaCamera(cols = COLS, rows = ROWS): Cam {
  const size = Math.max(cols, rows)
  return { x: (cols - size) / 2, y: (rows - size) / 2, size }
}

// Encounters DEFAULT to that static full-arena frame, but honor manual zoom/pan
// once the player takes control (zoom buttons / pinch / drag) — the same
// manualZoom/manualCenter seam open-world uses, just anchored to the arena
// centre instead of following the party. At full zoom-out (want ≥ the whole
// board) with no pan it returns the exact stable frame, so the default is
// unchanged and byte-identical to before. Otherwise it windows a `want`-cell
// view around `center`, CLAMPED inside the arena's own square (the arenaCamera
// origin is its min corner) so it never scrolls past the board.
function encounterCamera(cols: number, rows: number, want: number, center: Vec2 | null): Cam {
  const full = arenaCamera(cols, rows)
  if (want >= full.size && !center) return full
  const size = Math.min(want, full.size)
  const cx = center ? center.x : cols / 2
  const cy = center ? center.y : rows / 2
  return {
    x: Math.max(full.x, Math.min(full.x + full.size - size, cx - size / 2)),
    y: Math.max(full.y, Math.min(full.y + full.size - size, cy - size / 2)),
    size,
  }
}

// Open-world: a fixed-size window that follows the centroid of the given points
// (alive combatants), clamped so it never shows past the map edges. The whole
// open-world field can't fit at once — the player pans to look around.
// `overscroll` (free-look only) lets the window slide half a screen past the map
// edge so the player can pull a corner to centre and see empty space beyond the
// rim — auto-follow (party/hero) passes 0 so it never drifts off the action.
function followCamera(pts: Vec2[], cols: number, rows: number, want: number, overscroll = false): Cam {
  const size = Math.min(want, cols, rows)
  if (pts.length === 0) return { x: (cols - size) / 2, y: (rows - size) / 2, size }
  let sx = 0, sy = 0
  for (const p of pts) { sx += p.x; sy += p.y }
  const cx = sx / pts.length, cy = sy / pts.length
  const slack = overscroll ? size / 2 : 0
  return {
    x: Math.max(-slack, Math.min(cols - size + slack, cx - size / 2)),
    y: Math.max(-slack, Math.min(rows - size + slack, cy - size / 2)),
    size,
  }
}

const FIT_PAD = 5  // cells of breathing room around the party's bounding box

// Auto-zoom that keeps the whole party framed: the party's spread + padding,
// never tighter than the default view nor wider than the zoom-out cap. Used
// until the player takes manual control (pinch / buttons).
function autoFitSize(pts: Vec2[], cols: number, rows: number): number {
  const maxSize = Math.min(OPEN_CAM_MAX_SIZE, cols, rows)
  if (pts.length === 0) return Math.min(OPEN_CAM_SIZE, maxSize)
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const spread = Math.max(maxX - minX, maxY - minY) + FIT_PAD * 2
  return Math.max(OPEN_CAM_SIZE, Math.min(maxSize, spread))
}

// Motion is CSS-transition-driven, not React-driven. The store advances one engine
// round per tick (~5×/s), producing a fresh `battle` → BattleView re-renders → each
// token (BattleChip `animatePos`) and every camera-following world element (grid,
// barriers, zones, floats, …) eases to its new position through a CSS `transition`.
// So a unit's render position IS its engine round position — there's no per-frame
// rAF that re-renders the whole subtree just to interpolate (the old hot path: ~60
// renders/s on top of the ~5/s real ones). Encounters always worked this way (static
// camera + animatePos); open-world now matches, dropping the per-frame React churn.
//
// The glide is driven by `transform: translate` (XFORM_TRANSITION), NOT left/top:
// transform animates on the COMPOSITOR, while left/top forces a full layout every
// frame — which, with dozens of tokens gliding at once, was the dominant mobile
// render cost (measured ~2× fps at 50+ entities). Compositor motion also keeps
// elements glued to each other under main-thread jank (a busy main thread stalls a
// left/top transition mid-glide, so a label/zone visibly desyncs from its token).
//
// A linear transition a hair longer than the round interval means a token is still
// gliding toward its last target when the next round retargets it — continuous
// motion, no "settle-then-go" parking. The interval is NOT a fixed 200ms though: it
// jitters with per-tick load, so the glide duration tracks it adaptively (below).
const CAM_MS = 400
// Positional motion (tokens + every camera-following element) eases over `--seg-ms`,
// a CSS var LiveBattle rewrites each round from an EMA of the *actual* wall-clock
// round interval (see CADENCE_RUNWAY). The store advances on a 200ms setInterval,
// but under load each tick's sim+render overruns and rounds arrive late and in
// bursts — a fixed-duration glide then either parks early (stall-then-jump) or
// sprints to cover a batched multi-cell step (slow-fast wobble). Sizing the glide
// to the measured cadence keeps apparent velocity steady. This re-derives the old
// useSmoothScene EMA win declaratively, without bringing back its per-frame rAF.
// The `${CAM_MS}ms` fallback covers the first frame and the static world-map Arena.
const SEG = `var(--seg-ms, ${CAM_MS}ms)`

const px = (cam: Cam, x: number) => `${((x - cam.x) / cam.size) * 100}%`
const py = (cam: Cam, y: number) => `${(1 - (y - cam.y) / cam.size) * 100}%`
// Same mapping as px/py but as a bare number (percent of the square arena side).
// Used to position elements via a `transform: translate(…cqw, …cqh)` instead of
// left/top: cqw/cqh resolve against the size-container arena, and animating
// `transform` runs the per-round glide on the COMPOSITOR. Animating left/top
// instead forces a full layout every frame — the dominant cost once dozens of
// tokens are gliding (measured: ~2× mobile fps at 50+ entities). Prefer this for
// anything that glides every round (tokens, ground hazards, terrain).
const fxPct = (cam: Cam, x: number) => ((x - cam.x) / cam.size) * 100
const fyPct = (cam: Cam, y: number) => (1 - (y - cam.y) / cam.size) * 100
// Transition that glides `transform` over the adaptive cadence (compositor, no layout).
const XFORM_TRANSITION = `transform ${SEG} linear`

// True when a world point is inside the camera viewport. Off-screen tokens are
// clipped (not clamped to the rim, which made them pile up misleadingly in a
// corner); off-screen *heroes* are instead represented by an EdgeMarker arrow.
export function isOnScreen(cam: Cam, pos: Vec2): boolean {
  const fx = (pos.x - cam.x) / cam.size
  const fy = (pos.y - cam.y) / cam.size
  return fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1
}

// Half a token in world units — clamp the rendered center inward so the card's
// body never clips the arena edge even when a unit is pinned to it.
const TOKEN_INSET = 0.7
const insetX = (cam: Cam, x: number) => Math.max(cam.x + TOKEN_INSET, Math.min(cam.x + cam.size - TOKEN_INSET, x))
const insetY = (cam: Cam, y: number) => Math.max(cam.y + TOKEN_INSET, Math.min(cam.y + cam.size - TOKEN_INSET, y))

// Pan-aware arena. Owns a pixel-drag pan applied as a CSS transform on the inner
// world layer; chips/barriers/lines move with the wrapper instantly so the
// drag tracks the finger. Sizes itself to a square that fits the space it's
// given (`grid place-items-center` parent), so it grows on the drop-in view.
// `zoom`, when provided (open-world), lets a two-finger pinch resize the camera
// (`size` = cells shown; squeeze together → zoom out, spread → zoom in). A single
// finger still pans.
interface ZoomCtl { size: number; min: number; max: number; set: (n: number) => void }

function Arena({ cam, barriers, children, centerY = CENTER_Y, zoom, overlay, groundOverlay, panResetKey, panEnabled = true, mapCols = cam.size, mapRows = cam.size, perimeter = false, framed = true, skin = 'circle', biome = 'grass', terrainSeed = 0, terrainAvoid, mapSpec, sidePx = null, onPanStart, onPanMove, onPanEnd, onPinch }: { cam: Cam; barriers: Barrier[]; children: React.ReactNode; centerY?: number; zoom?: ZoomCtl; overlay?: React.ReactNode; groundOverlay?: React.ReactNode; panResetKey?: string | number; panEnabled?: boolean; mapCols?: number; mapRows?: number; perimeter?: boolean; framed?: boolean; skin?: BattleSkin; biome?: Biome; terrainSeed?: number; terrainAvoid?: Rect[]; mapSpec?: MapSpec; sidePx?: number | null; onPanStart?: () => void; onPanMove?: (worldDx: number, worldDy: number) => void; onPanEnd?: () => void; onPinch?: (active: boolean) => void }) {
  const arenaSkin = ARENA_SKINS[skin]
  const ground = arenaSkin.grounds?.[biome]
  // The baked terrain bitmap decodes async and fades in; the base ground/grid
  // below would otherwise pop in early under it (the "grayish swoops first,
  // cobbles/buildings later" stagger). Gate them on the terrain's readiness so
  // the whole map reveals as one. Reset when the location (terrain sig) changes.
  const [terrainReady, setTerrainReady] = useState(false)
  const onTerrainReady = useCallback(() => setTerrainReady(true), [])
  // Organic terrain layer (render/terrain.tsx): one static per-location SVG
  // inside the ground layer. When a skin carries it, it REPLACES the rect
  // barrier divs and the classic perimeter ring below. §mapgen locations hand
  // it their baked MapSpec so the surface/scatter planes drive the dressing.
  const terrainEl = arenaSkin.terrain?.({ biome, cols: mapCols, rows: mapRows, barriers, seed: terrainSeed, rim: perimeter, avoid: terrainAvoid, spec: mapSpec, onReady: onTerrainReady })
  const terrainSig = terrainEl ? `${biome}|${mapCols}x${mapRows}|${terrainSeed}|${mapSpec ? mapSpec.recipe + mapSpec.seed : ''}` : ''
  useEffect(() => { if (terrainSig) setTerrainReady(false) }, [terrainSig])
  // When a terrain hook is present, the base ground/grid wait for it; otherwise
  // (circle skin / no terrain) they show immediately as before.
  const groundReveal = terrainEl ? { opacity: terrainReady ? 1 : 0, transition: 'opacity 240ms ease-out' } : undefined
  const gridReveal = terrainEl ? { opacity: terrainReady ? 0.4 : 0, transition: 'opacity 240ms ease-out' } : undefined
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; basePan: Vec2; moved: boolean; pointerId: number; target: Element } | null>(null)
  // Active pointers (by id) + the in-progress pinch, for two-finger zoom.
  const pointersRef = useRef<Map<number, Vec2>>(new Map())
  const pinchRef = useRef<{ startDist: number; startSize: number } | null>(null)
  const suppressClickRef = useRef(false)
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })
  // Live-pan coalescing: pointermove can fire faster than the screen refreshes (e.g.
  // a 120Hz touch panel), and each move drives a setManualCenter → full battle
  // re-render. Coalesce to ONE update per animation frame so a crowded field can't
  // build a render backlog that lags the camera behind the finger.
  const panRafRef = useRef<number | null>(null)
  const panLatestRef = useRef<Vec2 | null>(null)
  // total drag px, latest
  const applyPan = (dx: number, dy: number) => {
    if (!onPanMove || !ref.current || ref.current.clientWidth <= 0) return
    const cells = cam.size / ref.current.clientWidth
    onPanMove(-dx * cells, dy * cells)   // screen +x → look left; screen y is flipped
  }
  const flushPan = () => {
    panRafRef.current = null
    const p = panLatestRef.current
    if (p) applyPan(p.x, p.y)
  }
  useEffect(() => () => { if (panRafRef.current != null) cancelAnimationFrame(panRafRef.current) }, [])

  // The pixel pan is a finger-drag nudge layered on top of the camera. When the
  // camera *retargets* (follow a hero / minimap free-look / auto-fit) a leftover
  // pan would offset the freshly-centred view, dragging the whole board (grid +
  // tokens) off-screen — so zero it out on every camera-target change.
  useEffect(() => { setPan({ x: 0, y: 0 }) }, [panResetKey])

  const centerTop = Math.max(0, Math.min(100, (1 - (centerY - cam.y) / cam.size) * 100))

  const pointerGap = (): number => {
    const [a, b] = [...pointersRef.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  const onPointerDown = (e: React.PointerEvent) => {
    suppressClickRef.current = false
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zoom && pointersRef.current.size === 2) {
      // Second finger down → start a pinch; abandon any single-finger pan.
      dragRef.current = null
      pinchRef.current = { startDist: pointerGap(), startSize: zoom.size }
      suppressClickRef.current = true
      onPinch?.(true)   // hold the glide at 0 so the zoom tracks the fingers
    } else if (panEnabled && pointersRef.current.size === 1) {
      // Single-finger pan is a pixel nudge layered on the camera. In an
      // auto-following open-world view it FIGHTS the camera (and even a pinch
      // leaves a tiny residue before the 2nd finger lands), shoving the whole
      // board into a corner — so the open-world caller disables it and navigates
      // via follow + minimap re-center + pinch/zoom instead.
      dragRef.current = { startX: e.clientX, startY: e.clientY, basePan: pan, moved: false, pointerId: e.pointerId, target: e.currentTarget }
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Pinch: scale the camera size by the inverse of the finger spread.
    if (pinchRef.current && zoom && pointersRef.current.size >= 2) {
      const dist = pointerGap()
      if (dist > 0 && pinchRef.current.startDist > 0) {
        const next = pinchRef.current.startSize * (pinchRef.current.startDist / dist)
        zoom.set(Math.max(zoom.min, Math.min(zoom.max, next)))
      }
      return
    }

    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true
      try { d.target.setPointerCapture(d.pointerId) } catch { /* noop in tests */ }
      // Drag crossed the threshold → detach the camera to free-look so it stops
      // following and tracks the finger for the rest of the drag.
      onPanStart?.()
    }
    if (d.moved) {
      if (onPanMove) {
        // Live world-space pan (open-world): record the TOTAL drag delta (absolute
        // from start, so no accumulation drift) and apply it at most once per frame.
        // The look-point is clamped to the map by the caller, so the board can't
        // over-drag and there's nothing to snap back on release.
        panLatestRef.current = { x: dx, y: dy }
        if (panRafRef.current == null) panRafRef.current = requestAnimationFrame(flushPan)
      } else {
        setPan({ x: d.basePan.x + dx, y: d.basePan.y + dy })   // pixel nudge (encounter only)
      }
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2 && pinchRef.current) { pinchRef.current = null; onPinch?.(false) }
    const d = dragRef.current
    if (d?.moved) {
      suppressClickRef.current = true
      // Apply the FINAL position exactly (cancel any frame still pending) so the
      // release lands where the finger lifted, then end the drag (restores the glide).
      if (panRafRef.current != null) { cancelAnimationFrame(panRafRef.current); panRafRef.current = null }
      if (onPanMove) applyPan(e.clientX - d.startX, e.clientY - d.startY)
      onPanEnd?.()
    }
    dragRef.current = null
  }

  // Desktop pinch (browsers report trackpad pinch as ctrl+wheel) zooms the
  // battle CAMERA — the same axis the touch pinch drives. Native non-passive
  // listener so preventDefault stops the browser's page zoom. Plain scroll is
  // left alone (a host like the proto stage may pan with it).
  const zoomCtlRef = useRef(zoom)
  zoomCtlRef.current = zoom
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const z = zoomCtlRef.current
      if (!z || !e.ctrlKey) return
      e.preventDefault()
      z.set(Math.max(z.min, Math.min(z.max, z.size * (1 + e.deltaY * 0.01))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Swallow the synthetic click that fires right after a drag, so chip taps
  // don't toggle selection when the user was just panning.
  useEffect(() => {
    const el = ref.current
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
      ref={ref}
      // `sidePx` (measured by BattleView) makes the arena a real centred square —
      // the largest that fits its wrapper. Pure CSS can't do min(w,h)-square
      // across the app's layouts, so it's measured in JS. Until measured (and in
      // tests without ResizeObserver) fall back to the classic `w-full max-h-full`.
      className={`relative m-auto aspect-square bg-game-surface overflow-hidden select-none${sidePx == null ? ' w-full max-h-full' : ''}${framed ? ' rounded-lg border border-game-border' : ''}`}
      style={{ ...(sidePx == null ? null : { width: sidePx, height: sidePx }), touchAction: 'none', containerType: 'size', ...arenaSkin.surface }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, willChange: 'transform' }}>
        {/* team-half tints, split at the arena's center line. The split eases with
            the camera (CSS) so it pans in sync with the tokens — the divs stay
            anchored to the viewport edges, so only the split line moves (no gap). */}
        <div className="absolute inset-0 origin-top bg-red-500/10 pointer-events-none" style={{ transform: `scaleY(${centerTop / 100})`, transition: `transform ${SEG} linear` }} />
        <div className="absolute inset-0 origin-bottom bg-blue-500/10 pointer-events-none" style={{ transform: `scaleY(${(100 - centerTop) / 100})`, transition: `transform ${SEG} linear` }} />
        {/* GROUND LAYER — a single full-map layer pinned to the world and slid with
            the camera via one compositor `transform`. It holds the grid pattern,
            terrain barriers, and ground effects (zones/firewalls), ALL positioned in
            layer-fraction coords (% of the whole map). Because they're children of
            this one layer they inherit its exact transform/scale, so they stay locked
            to each other and to the grid — no per-element camera math, so a ground
            effect can't drift to its spot a beat after a camera change (each element
            having its OWN eased transform desynced them; the grid eases translate+
            scale while a lone token/zone eased translate-only). The layer spans the
            whole map so its fixed grid pattern always covers the viewport.
            backgroundSize is one world cell (cqmin = % of the square arena). */}
        {/* The layer's LAYOUT size is fixed at a reference zoom (GROUND_BASE_CELLS
            cells visible) and the camera zoom is applied as a `scale()` in the
            same transform as the translate — ONE compositor matrix. Animating
            width/height instead (layout properties) desynced from the eased
            transform under main-thread jank, so the ground pattern visibly
            "scrolled" for a beat on every zoom while the camera moved. */}
        <div
          className="absolute"
          style={{
            left: 0, top: 0,
            width: `${(mapCols / GROUND_BASE_CELLS) * 100}%`,
            height: `${(mapRows / GROUND_BASE_CELLS) * 100}%`,
            transformOrigin: '0 0',
            transform: `translate(${fxPct(cam, 0)}cqw, ${fyPct(cam, mapRows)}cqh) scale(${GROUND_BASE_CELLS / cam.size})`,
            transition: XFORM_TRANSITION,
          }}
        >
          {/* skin ground texture — a single repeating pattern (data URI, picked
              by the location's biome) sized in cells, so it scales/glides WITH
              the layer like the grid below. One paint for the whole map: no
              per-cell DOM. */}
          {ground && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: ground.image,
                backgroundSize: `${(100 / mapCols) * ground.cellsPerTile}% ${(100 / mapRows) * ground.cellsPerTile}%`,
                ...groundReveal,
              }}
            />
          )}
          {/* faint grid pattern (opacity only on this child, so terrain/effects below
              read at full strength) */}
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              ...gridReveal,
              backgroundImage:
                `linear-gradient(to right, ${arenaSkin.gridLine} 1px, transparent 1px),` +
                `linear-gradient(to bottom, ${arenaSkin.gridLine} 1px, transparent 1px)`,
              // One cell = 1/mapCols of the layer (NOT cqmin/arena-relative). This
              // makes the grid scale WITH the layer (and the barriers, also % of it)
              // as it eases through a zoom — a cqmin size resolves against the arena,
              // which doesn't transition, so the grid would snap-resize while the
              // barriers eased, sliding the grid across the terrain.
              backgroundSize: `${100 / mapCols}% ${100 / mapRows}%`,
            }}
          />
          {/* boundary perimeter — a wall ring framing the open-world map edge. Purely
              cosmetic (arenaClamp already contains units, so it's NOT in the engine's
              barrier set): it gives the big field a visible rim so the player reads
              where the map ends. Spans the whole ground layer, so it sits exactly on
              the map edge at any zoom; only the visible side is on-screen at a time. */}
          {perimeter && !terrainEl && (
            <div
              className="absolute inset-0 border-4 border-stone-500/70 pointer-events-none"
              style={{ boxShadow: 'inset 0 0 0 1px rgb(120 113 108 / 0.5), inset 0 0 24px rgb(0 0 0 / 0.55)' }}
            />
          )}
          {/* organic terrain (skin hook): mottling, scatter props, wall/cliff
              blobs and the map rim as ONE static SVG riding this layer's
              compositor transform. Replaces the rect barriers + ring below. */}
          {terrainEl}
          {/* terrain: walls solid (block movement + sight); cliffs translucent +
              dashed (block movement only — ranged attacks fire over them). Positioned
              as a fraction of the map → planted on the grid, no own transition.
              A skin may restyle them via barrierWall/barrierCliff (paper: flat
              two-tone cutout, zero-blur inset face); absent → classic classes. */}
          {!terrainEl && barriers.map((b, i) => {
            const isCliff = b.kind === 'cliff'
            const restyle = isCliff ? arenaSkin.barrierCliff : arenaSkin.barrierWall
            return (
              <div
                key={i}
                className={restyle
                  ? 'absolute rounded-sm pointer-events-none'
                  : isCliff
                    ? 'absolute bg-amber-900/20 border border-dashed border-amber-600/60 rounded-sm pointer-events-none'
                    : 'absolute bg-stone-700/70 border border-stone-500/60 rounded-sm pointer-events-none'}
                style={{ left: `${(b.x / mapCols) * 100}%`, top: `${((mapRows - (b.y + b.h)) / mapRows) * 100}%`, width: `${(b.w / mapCols) * 100}%`, height: `${(b.h / mapRows) * 100}%`, ...restyle }}
              />
            )
          })}
          {/* ground effects (zones / firewalls) — also map-fraction children, so they
              ride the layer exactly and stay glued to the terrain. */}
          {groundOverlay}
        </div>
        {children}
      </div>
      {/* skin lighting: ONE static viewport-fixed vignette layer (a single
          compositor layer, like the perimeter ring) — it never pans or repaints,
          so the lighting read is free. */}
      {arenaSkin.vignette && <div className="absolute inset-0 pointer-events-none" style={{ background: arenaSkin.vignette }} />}
      {/* viewport-fixed overlay (off-screen markers): not panned, clipped to the
          arena square so edge bubbles sit on the rim. */}
      {overlay && <div className="absolute inset-0 z-10 pointer-events-none">{overlay}</div>}
    </div>
  )
}

// ── Live battle ────────────────────────────────────────────────────────────────

const CHIP_FLOAT_W = 'w-14'          // floating name/HP plate above the chip

// Token diameter that tracks the zoom: ~0.9 of a grid cell, expressed in cqmin
// (percent of the square arena's side) so it scales as the camera resizes. The
// arena is a CSS size-container (containerType:'size'). One cell spans
// 100/cam.size of the arena; clamped so it stays visible/tappable at extreme
// zoom. Glyph font-size scales with it.
const CHIP_CELL_FRACTION = 0.9
// Diameter (cells) of the hero-anchored ground light (§terrain, paper skin).
const HERO_LIGHT_CELLS = 16
// `sizeScale` (from the appearance resolver, e.g. a large monster) grows the token
// proportionally — the cqmin term AND the clamp floor/ceiling scale together so it
// stays bigger at every zoom, not just in the mid-range.
// The cqmin value is QUANTIZED (eighth-steps, ~2% at typical zooms): the party
// auto-fit camera "breathes" cam.size by a whisper every round, and an exact value
// would hand every on-screen token a fresh clamp() string per round — re-style/
// re-layout/repaint of every body element ~5×/s and a broken body memo (the
// dominant render cost measured on the ?perf scene, worse the richer the skin).
// Quantized, the strings are stable until the zoom moves ~2% — imperceptible steps,
// and idle tokens' memo'd bodies skip reconcile entirely.
function chipDims(cam: Cam, sizeScale = 1): { width: string; height: string; fontSize: string } {
  const cqmin = Math.round(((CHIP_CELL_FRACTION * sizeScale * 100) / cam.size) * 8) / 8   // one chip in cqmin units
  const size = `clamp(${14 * sizeScale}px, ${cqmin}cqmin, ${64 * sizeScale}px)`
  return { width: size, height: size, fontSize: `clamp(7px, ${cqmin * 0.4}cqmin, 26px)` }
}

function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.length > 8 ? first.slice(0, 7) + '…' : first
}

// Wall-clock length of one *logical* round (2 engine rounds at timeScale=2 ×
// 1000/TICKS_PER_SECOND=5 = 400ms; a raw engine round is 200ms).
const ROUND_MS = 400

// Floating label: name/HP/cast sit BELOW the circle for *every* unit (players
// and enemies alike) so health bars read consistently across the field.
// HP bars on the battlefield are kept sparse: monsters never show one, and a hero
// only shows theirs once actually hurt (below this fraction). Declutters the field
// so the bars that DO appear flag a hero in real trouble.
const HERO_HP_BAR_BELOW = 0.30
function FloatingLabel({ c, isPlayer, casting, scale }: { c: Combatant; isPlayer: boolean; casting: boolean; scale: number }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
  const showHpBar = isPlayer && ratio < HERO_HP_BAR_BELOW
  // Cast bar driven by the live channel (roundsLeft), NOT wall-clock: a round is
  // gated to game ticks, and under load they advance in jumps — a wall-clock
  // animation then runs ahead and fills before the spell fires. Mapping
  // roundsLeft total…1 → 0…1 keeps it locked to the real cast, so it finishes
  // exactly as the spell lands. A round-long width transition ramps each step so
  // it reads smoothly (it only ever looks "stepped" if rounds stall under load).
  // The channel lasts channelTime × timeScale finer rounds (finer rounds), so the
  // bar's total is scaled to match.
  const ch = casting ? c.channel : null
  const chTime = (ch ? (c.skills.find((s) => s.id === ch.skillId)?.channelTime ?? 1) : 1) * scale
  const castFill = ch ? (chTime <= 1 ? 1 : Math.max(0, Math.min(1, (chTime - ch.roundsLeft) / (chTime - 1)))) : 0
  return (
    <div className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 ${CHIP_FLOAT_W} flex flex-col items-center gap-0.5 pointer-events-none`}>
      <span className={`text-[9px] font-semibold leading-none whitespace-nowrap drop-shadow ${isPlayer ? 'text-blue-100/85' : 'text-red-100/85'}`}>
        {shortName(c.name)}
      </span>
      {showHpBar && (
        <div className="w-full h-1 rounded-sm bg-black/50 overflow-hidden">
          <div className={`h-full ${hpColor(ratio)} opacity-90`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
        </div>
      )}
      {ch && (
        <>
          <span className="text-[8px] leading-none whitespace-nowrap text-amber-200/90 drop-shadow animate-pulse">
            ✦ {skillName(ch.skillId)}
          </span>
          {/* Cast-progress bar: blue, ramps over each round, finishes as the spell lands. */}
          <div className="w-full h-1 rounded-sm bg-black/50 overflow-hidden">
            <div className="h-full bg-sky-400" style={{ width: `${castFill * 100}%`, transition: `width ${ROUND_MS}ms linear` }} />
          </div>
        </>
      )}
    </div>
  )
}

// Subtle facing/heading pointer: a small triangular nub at the chip rim,
// rotated to the unit's facing. Engine facing is world-space where +y renders
// UP on screen (py flips y), so the on-screen angle is atan2(-fy, fx). Scales
// with the chip (cqmin) and rides just outside its edge.
function FacingNub({ c, cam, isPlayer, sizeScale = 1 }: { c: Combatant; cam: Cam; isPlayer: boolean; sizeScale?: number }) {
  const f = c.facing ?? { x: 0, y: isPlayer ? 1 : -1 }
  if (Math.hypot(f.x, f.y) < 1e-6) return null
  const angle = (Math.atan2(-f.y, f.x) * 180) / Math.PI   // 0° = pointing right (+x)
  const cqmin = (CHIP_CELL_FRACTION * sizeScale * 100) / cam.size
  const half = `clamp(3px, ${cqmin * 0.22}cqmin, 14px)`   // triangle half-height
  const len  = `clamp(4px, ${cqmin * 0.3}cqmin, 18px)`    // triangle length (the point)
  const reach = `clamp(8px, ${cqmin * 0.6}cqmin, 36px)`   // chip-centre → triangle base
  // Outer wrapper sits at the chip centre and rotates; the triangle is pushed
  // out along local +x. A right-pointing CSS triangle: transparent top/bottom
  // borders give the height, the coloured left border tapers to the right tip.
  return (
    <div className="absolute left-1/2 top-1/2 w-0 h-0 pointer-events-none" style={{ transform: `rotate(${angle}deg)` }}>
      <div
        className="absolute"
        style={{
          left: reach,
          top: 0,
          transform: 'translateY(-50%)',
          width: 0, height: 0,
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderTopWidth: half,
          borderBottomWidth: half,
          borderLeftWidth: len,
          borderLeftColor: isPlayer ? 'rgb(191 219 254 / 0.75)' : 'rgb(254 202 202 / 0.75)',
        }}
      />
    </div>
  )
}

// The "moving" indicator: a pulsing chevron BEHIND the solid direction arrow
// (closer to the token, still ahead in the facing direction), shown only while
// the unit is actually moving — so a token reads as one arrow when holding, a
// trailing second chevron when on the move. Same rotation basis and
// construction as FacingNub; scales with the chip.
function MovingChevron({ c, cam, isPlayer, sizeScale = 1 }: { c: Combatant; cam: Cam; isPlayer: boolean; sizeScale?: number }) {
  const f = c.facing ?? { x: 0, y: isPlayer ? 1 : -1 }
  if (Math.hypot(f.x, f.y) < 1e-6) return null
  const angle = (Math.atan2(-f.y, f.x) * 180) / Math.PI   // 0° = facing +x
  const cqmin = (CHIP_CELL_FRACTION * sizeScale * 100) / cam.size
  const half = `clamp(3px, ${cqmin * 0.22}cqmin, 14px)`   // match FacingNub
  const len  = `clamp(4px, ${cqmin * 0.3}cqmin, 18px)`
  const reach = `clamp(4px, ${cqmin * 0.32}cqmin, 19px)`  // behind the front direction arrow (0.6)
  return (
    <div className="absolute left-1/2 top-1/2 w-0 h-0 pointer-events-none animate-pulse" style={{ transform: `rotate(${angle}deg)` }}>
      <div
        className="absolute"
        style={{
          left: reach, top: 0, transform: 'translateY(-50%)',
          width: 0, height: 0, borderStyle: 'solid', borderColor: 'transparent',
          borderTopWidth: half, borderBottomWidth: half, borderLeftWidth: len,
          borderLeftColor: isPlayer ? 'rgb(191 219 254 / 0.6)' : 'rgb(254 202 202 / 0.6)',
        }}
      />
    </div>
  )
}

// `detail=false` is the level-of-detail path: when the camera is zoomed far out
// (many tiny tokens, open-world), the floating name/HP/cast plate and the
// facing/moving nubs are unreadable noise *and* the bulk of the per-token DOM —
// drop them and render just the body. Full detail returns as you zoom/follow in.
// The token body itself lives in `src/render/skins.tsx` (CircleBody / PaperBody),
// picked by the store's `battleSkin` and fed the appearance resolver's output —
// restyling an entity is a skins-file change, never a BattleView one.
function BattleChip({ c, cam, pos, animatePos, selected, onSelect, appearance, scale, detail, skin, castLabels, spawnPop = true, lungeDeg = null, lungeFlip = false, hitDeg = null }: { c: Combatant; cam: Cam; pos: Vec2; animatePos: boolean; selected: boolean; onSelect: () => void; appearance: Appearance; scale: number; detail: boolean; skin: BattleSkin; castLabels?: CastLabelEntry[]; spawnPop?: boolean; lungeDeg?: number | null; lungeFlip?: boolean; hitDeg?: number | null }) {
  const isPlayer = c.team === 'player'
  const isNeutral = c.team === 'neutral'   // town NPC: stationary, no facing/HP bar
  const casting = c.alive && !!c.channel
  const Body = TOKEN_SKINS[skin]
  // Facing → screen degrees (0° = +x; py flips y). Passed as a NUMBER, never the
  // live c.facing object — the memo'd body compares props, and the engine mutates
  // combatants in place, so an object prop would freeze the blade. Quantized to
  // 15° (24 directions): heading wobbles a hair every round while a unit marches,
  // and an exact angle would defeat the body memo for every mover every round
  // (measured as the dominant paper-skin render cost on the ?perf scene).
  const f = c.facing ?? { x: 0, y: isPlayer ? 1 : -1 }
  const facingDeg = isNeutral || Math.hypot(f.x, f.y) < 1e-6
    ? null
    : Math.round(((Math.atan2(-f.y, f.x) * 180) / Math.PI) / 15) * 15
  // Outer layer owns ONLY the world position, glided via a compositor transform
  // (no layout per frame). The inner layer keeps the spawn pop + centering (which
  // own `transform` themselves — keeping them off the positioned element avoids a
  // transform clash). data-cid/data-chip ride the inner box so its bounding rect
  // is the token circle (what the jerk harness samples).
  return (
    <div
      className="absolute"
      style={{ left: 0, top: 0, transform: `translate(${fxPct(cam, insetX(cam, pos.x))}cqw, ${fyPct(cam, insetY(cam, pos.y))}cqh)`, transition: animatePos ? XFORM_TRANSITION : undefined }}
    >
      <div
        onClick={onSelect}
        data-chip
        data-cid={c.id}
        // title on the WRAPPER (re-rendered every round anyway), not the memo'd
        // body — it embeds live hp, which would break the body memo per hit.
        title={c.channel ? `${c.name} — casting ${skillName(c.channel.skillId)}` : `${c.name} — ${Math.ceil(c.hp)}/${c.maxHp}`}
        className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer${spawnPop ? ' animate-chip-spawn' : ''}`}
      >
        {/* lingering "✦ <skill>" cast labels stack ABOVE the circle, newest on top
            (flex-col-reverse). Rendered here — as a chip child — so they ride the
            chip's compositor glide with zero drift, instead of a separately-
            positioned sibling that snaps to the caster's new spot on mount. Shown
            regardless of LOD (what's being cast matters even when zoomed out). */}
        {castLabels && castLabels.length > 0 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 flex flex-col-reverse items-center gap-0.5 pointer-events-none">
            {castLabels.map((l) => (
              <span key={l.id} className="px-1 rounded bg-black/45 text-amber-200 text-[10px] font-semibold leading-tight whitespace-nowrap drop-shadow animate-cast-label">
                ✦ {skillName(l.skillId)}
              </span>
            ))}
          </div>
        )}
        {detail && <FloatingLabel c={c} isPlayer={isPlayer} casting={casting} scale={scale} />}
        {detail && c.alive && !isNeutral && !SKIN_CARRIES_FACING[skin] && <FacingNub c={c} cam={cam} isPlayer={isPlayer} sizeScale={appearance.scale} />}
        {detail && c.alive && c.moving && !casting && <MovingChevron c={c} cam={cam} isPlayer={isPlayer} sizeScale={appearance.scale} />}
        {/* One-shot melee lunge (BACKLOG → effects pass): a compositor-only nudge
            toward the target when this combatant landed a melee hit this round.
            The wrapper is PERMANENT (conditionally wrapping would remount the
            memo'd body subtree on every attack start/stop); consecutive-round
            attacks restart the animation by alternating two identical keyframe
            sets on round parity — a class swap, never a remount. % translate is
            relative to this wrapper's own box = the token, so the nudge scales
            with zoom for free. */}
        {/* Hit recoil (PERMANENT wrapper, same remount-avoidance rule as the
            lunge): a struck token jerks back along the blow + a brief squash.
            --hit-x/y ride in as % of the token box, direction from hitDeg. */}
        <div
          className={hitDeg != null ? (lungeFlip ? 'animate-hit-a' : 'animate-hit-b') : undefined}
          style={hitDeg != null ? {
            '--hit-x': `${Math.round(Math.cos((hitDeg * Math.PI) / 180) * 14)}%`,
            '--hit-y': `${Math.round(Math.sin((hitDeg * Math.PI) / 180) * 14)}%`,
          } as CSSProperties : undefined}
        >
          <div
            // whole-token lunge (self animation) + part jab (animate-atk targets
            // the body's [data-atk] descendants — no-op for shapes without them):
            // the head snaps ahead of the sliding token, the tail lags. --atk-x/y
            // are SVG user units (viewBox is 0–100) so the jab reads at any zoom.
            className={lungeDeg != null ? (lungeFlip ? 'animate-lunge-a animate-atk-a' : 'animate-lunge-b animate-atk-b') : undefined}
            style={lungeDeg != null ? {
              '--lunge-x': `${Math.round(Math.cos((lungeDeg * Math.PI) / 180) * 30)}%`,
              '--lunge-y': `${Math.round(Math.sin((lungeDeg * Math.PI) / 180) * 30)}%`,
              '--atk-x': `${(Math.cos((lungeDeg * Math.PI) / 180) * 13).toFixed(1)}px`,
              '--atk-y': `${(Math.sin((lungeDeg * Math.PI) / 180) * 13).toFixed(1)}px`,
            } as CSSProperties : undefined}
          >
            <Body
              glyph={appearance.glyph}
              tone={appearance.tone}
              bodyShape={appearance.bodyShape}
              tint={appearance.tint}
              weapon={appearance.weapon}
              alive={c.alive}
              selected={selected}
              facingDeg={facingDeg}
              moving={c.alive && !!c.moving}
              creature={c.team === 'enemy'}
              simple={!detail}
              dims={chipDims(cam, appearance.scale)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// An edge bubble pointing at an off-camera party member: a small initials chip
// clamped to the arena rim plus an arrow rotated toward the unit. `cam` excludes
// manual pan (rare in the follow view), so it tracks the camera, not the pan.
function EdgeMarker({ c, pos, cam }: { c: Combatant; pos: Vec2; cam: Cam }) {
  const fx = (pos.x - cam.x) / cam.size              // 0..1 across the view
  const fy = 1 - (pos.y - cam.y) / cam.size          // 0..1 top→bottom
  const dx = fx - 0.5, dy = fy - 0.5
  const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1
  const pad = 0.05
  const bx = Math.max(pad, Math.min(1 - pad, 0.5 + (dx * 0.5) / m))
  const by = Math.max(pad, Math.min(1 - pad, 0.5 + (dy * 0.5) / m))
  const ratio = Math.max(0, c.hp / c.maxHp)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  return (
    <div className="absolute flex items-center gap-0.5" style={{ left: 0, top: 0, transform: `translate(calc(${bx * 100}cqw - 50%), calc(${by * 100}cqh - 50%))`, transition: XFORM_TRANSITION }}>
      <div
        title={`${c.name} — ${Math.ceil(c.hp)}/${c.maxHp} (off-screen)`}
        className={`w-6 h-6 rounded-full bg-blue-900/90 border-2 flex items-center justify-center text-[8px] font-bold text-blue-50 shadow ${ratio >= 0.75 ? 'border-emerald-300/80' : ratio >= 0.4 ? 'border-amber-300/80' : 'border-red-300/80'}`}
      >
        {initials(c.name)}
      </div>
      <span className="text-blue-200 text-[11px] leading-none drop-shadow" style={{ transform: `rotate(${angle}deg)` }}>➤</span>
    </div>
  )
}

// Floating combat text. `anim` picks the motion: a parabolic "lob" for damage
// (thrown up and to the right), a gentle straight rise for heals, the plain
// float for labels (rally / tactic / aggro). The arc transform is baked into the
// keyframes, so the Tailwind centering classes only matter before it kicks in.
function Float({ cam, pos, className, text, k, anim = 'animate-dmg-float' }: { cam: Cam; pos: Vec2; className: string; text: string; k: string; anim?: string }) {
  // Outer = world position glided via a compositor transform (no per-frame layout);
  // inner owns the lob/fade keyframe (which animates `transform` itself, so it can't
  // share the positioned element). The keyframe's translate(-50%,…) base centres it.
  return (
    <div key={k} className="absolute" style={{ left: 0, top: 0, transform: `translate(${fxPct(cam, insetX(cam, pos.x))}cqw, ${fyPct(cam, insetY(cam, pos.y))}cqh)`, transition: XFORM_TRANSITION }}>
      <div className={`absolute -translate-x-1/2 -translate-y-1/2 font-bold drop-shadow whitespace-nowrap ${anim} ${className}`}>
        {text}
      </div>
    </div>
  )
}

// §3 element-effectiveness clue on a damage number. `event.eff` is the matrix
// multiplier: a super-effective hit (≥1.5×) pops bigger/hotter with a "!!", a
// resisted hit (<1×) dims and shrinks, and an immune hit (0×) reads "immune"
// instead of a meaningless 0 — conveying the matchup at a glance (the article's
// "is the attack super-effective?" cue). Literal class strings so Tailwind sees them.
type EffTier = 'normal' | 'super' | 'resist' | 'immune'
function effTier(eff: number | undefined): EffTier {
  if (eff === 0) return 'immune'
  if (eff === undefined || eff === 1) return 'normal'
  return eff >= 1.5 ? 'super' : 'resist'
}
const DMG_CLS: Record<EffTier, string> = {
  normal: 'text-[17px] text-red-300',
  super:  'text-[19px] font-black text-amber-300',
  resist: 'text-[15px] text-red-300/55',
  immune: 'text-[12px] italic text-slate-300/75',
}
const DOT_CLS: Record<EffTier, string> = {
  normal: 'text-[15px] text-fuchsia-300',
  super:  'text-[16px] font-black text-amber-300',
  resist: 'text-[13px] text-fuchsia-300/55',
  immune: 'text-[12px] italic text-slate-300/75',
}
function dmgText(value: number, tier: EffTier): string {
  if (tier === 'immune') return 'immune'
  return `${value}${tier === 'super' ? ' !!' : ''}`
}


function Legend({ players, enemies, openWorld = false }: { players: number; enemies: number; openWorld?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim py-1.5 shrink-0">
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-900 border border-blue-300/80 inline-block" /> Party ({players})</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-900 border border-red-300/80 inline-block" /> Enemies ({enemies})</span>
      {openWorld && <span className="text-emerald-300/90 font-semibold">⟳ Open world</span>}
    </div>
  )
}

// ── Minimap ──────────────────────────────────────────────────────────────────--
// A corner radar for the open-world field (which is far bigger than the camera).
// Shows every hero (blue) and live enemy (red) over the whole map, plus a box for
// the current camera window — so the player always knows where the party is and
// where they're looking. Tap a hero dot to follow it; tap elsewhere to free-look
// at that spot. Lives in the Arena `overlay` (clipped to the arena square, not
// panned), anchored bottom-right.
// Enemies a living hero can currently SEE — within someone's visionRange and with an
// unobstructed sightline to them (walls block; cliffs don't, matching the engine's
// firing LoS). The minimap only dots these, so the open-world fog hides foes the party
// hasn't spotted. Distance is the cheap gate (most foes are out of range), so the
// sightline test only runs for the few in range.
function visibleEnemyDots(battle: BattleState): Combatant[] {
  const heroes = battle.combatants.filter((c) => c.team === 'player' && c.alive)
  return battle.combatants.filter((c) =>
    c.team === 'enemy' && c.alive &&
    heroes.some((h) => distance(h.pos, c.pos) <= h.visionRange && sightlineClear(h.pos, c.pos, battle.barriers)),
  )
}

type MinimapPick = { unitId: string } | { point: Vec2 }
// Breathing room around the framed party so the edge heroes aren't on the rim.
const MINIMAP_MARGIN = 1.25
// A PARTY-scoped radar (not the whole 200-cell field, where the camera box + dots are
// a pixel each): the square is sized to encompass every hero plus where the camera is
// looking, so the whole party is always visible without the clutter of per-hero sight
// rings. No vision ring is drawn; only in-sight foes dot (within a hero's visionRange
// and unobstructed sightline). Tap a hero to follow; tap elsewhere to free-look there.
function Minimap({ battle, cam, followId, onPick }: { battle: BattleState; cam: Cam; followId: string | null; onPick: (hit: MinimapPick) => void }) {
  const BOX = 64
  const heroes = battle.combatants.filter((c) => c.team === 'player' && c.alive)
  const sight = heroes.reduce((m, h) => Math.max(m, Number.isFinite(h.visionRange) ? h.visionRange : 0), 0)
  // Frame a square over every hero AND the camera centre (so the view box is always in
  // it). Floor the radius at one hero's sight + the camera so a lone/clustered party
  // still gets a sensible zoom; a margin keeps everyone off the rim.
  const camCx = cam.x + cam.size / 2, camCy = cam.y + cam.size / 2
  const pts: Vec2[] = heroes.length ? [...heroes.map((h) => h.pos), { x: camCx, y: camCy }] : [{ x: camCx, y: camCy }]
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2, sight, cam.size / 2) * MINIMAP_MARGIN
  const span = half * 2
  const ox = cx - half, oy = cy - half                  // world coords of the box's bottom-left
  const mx = (x: number) => ((x - ox) / span) * BOX
  const my = (y: number) => (1 - (y - oy) / span) * BOX // +y is up on screen
  const px = (cells: number) => (cells / span) * BOX     // a cell-length in radar px
  const ref = useRef<HTMLDivElement>(null)

  const handlePick = (e: React.PointerEvent) => {
    e.stopPropagation()
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const wx = ox + ((e.clientX - box.left) / BOX) * span
    const wy = oy + (1 - (e.clientY - box.top) / BOX) * span
    let best: { id: string; d: number } | null = null
    for (const c of heroes) {
      const d = Math.hypot(c.pos.x - wx, c.pos.y - wy)
      if (!best || d < best.d) best = { id: c.id, d }
    }
    if (best && best.d <= span * 0.12) onPick({ unitId: best.id })
    else onPick({ point: { x: wx, y: wy } })
  }

  return (
    <div
      ref={ref}
      onPointerDown={handlePick}
      title="Minimap — tap a hero to follow, elsewhere to look around"
      className="absolute top-1 right-1 rounded-md border border-game-border bg-game-surface/85 backdrop-blur-sm overflow-hidden pointer-events-auto cursor-pointer"
      style={{ width: BOX, height: BOX, touchAction: 'none' }}
    >
      {battle.barriers.map((b, i) => (
        <div key={i} className="absolute bg-stone-500/40" style={{ left: mx(b.x), top: my(b.y + b.h), width: px(b.w), height: px(b.h) }} />
      ))}
      {/* Enemy dots — fog-of-war: only foes a living hero can actually SEE (within
          their visionRange AND an unobstructed sightline, so walls hide what's
          behind them). Foes outside every hero's sight show no dot. */}
      {visibleEnemyDots(battle).map((c) => (
        <div key={c.id} className="absolute w-1 h-1 rounded-full bg-red-400/90 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: mx(c.pos.x), top: my(c.pos.y) }} />
      ))}
      {heroes.map((c) => (
        <div
          key={c.id}
          className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none ${c.id === followId ? 'w-1.5 h-1.5 bg-emerald-300' : 'w-1 h-1 bg-blue-300'}`}
          style={{ left: mx(c.pos.x), top: my(c.pos.y) }}
        />
      ))}
    </div>
  )
}

function LiveBattle({ battle, portals, biome, terrainSeed, mapSpec, peacefulCity = false, onFollow, inspectRequest, closeNonce, onInspect, insetTopControls }: { battle: BattleState; portals?: Location['portals']; biome?: Biome; terrainSeed?: number; mapSpec?: MapSpec; peacefulCity?: boolean; onFollow?: (unitId: string) => void; inspectRequest?: BattleInspectRequest | null; closeNonce?: number; onInspect?: (unitId: string) => void; insetTopControls?: boolean }) {
  const units = useGameStore((s) => s.units)
  const skin  = useGameStore((s) => s.battleSkin)
  const fx    = FX_SKINS[skin]
  const heroLight = ARENA_SKINS[skin].heroLight
  // The camera-follow lock lives in the store now (driven by the single top
  // roster — tap a hero there to lock onto them), so this view just reads it.
  const focusUnitId   = useGameStore((s) => s.battleFollowId)
  const combatLocationId = useGameStore((s) => s.combatLocationId)
  const setBattleFollow = useGameStore((s) => s.setBattleFollow)
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)   // for "follow hero" mode target
  // O(1) id → class / combatant lookups, rebuilt only when the roster or the
  // battle advances. These are hit per-token (glyph) and per-event (byId) on
  // every render, so a `.find()` here was an O(N²) scan each animation frame.
  const classById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const u of units) m.set(u.id, u.class ?? null)
    return m
  }, [units])
  const classFor = (id: string) => classById.get(id) ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const combatantById = useMemo(() => {
    const m = new Map<string, Combatant>()
    for (const c of battle.combatants) m.set(c.id, c)
    return m
  }, [battle])
  const byId = (id?: string) => (id ? combatantById.get(id) : undefined)
  // Frozen-able snapshot of the selected combatant — refreshed each round while
  // we're in the same wave (same combatants array reference). When a new wave
  // starts the snapshot freezes, so a respawned same-id monster isn't confused
  // for the entity the player just killed. Cleared by re-tapping / re-selecting.
  const [snapshot, setSnapshot] = useState<Combatant | null>(null)
  const snapshotWaveRef = useRef<Combatant[] | null>(null)

  // Lingering cast labels: each skill cast leaves its name anchored to the
  // caster for CAST_LABEL_MS (covering the channel + a beat after it lands).
  // Keyed by caster so a newer cast supersedes the older one's slot; `seq`
  // orders the stack (newest on top). The list itself only needs an occasional
  // sweep to drop expired entries — render filters by expiry each frame.
  const [castLabels, setCastLabels] = useState<CastLabelEntry[]>([])
  const castSeqRef = useRef(0)
  const lastRoundRef = useRef(-1)
  // Lingering floating numbers (damage/heal/DoT/interrupt). Harvested per round into
  // a buffer keyed independently of the round so each plays its full lob+fade.
  const [floatNums, setFloatNums] = useState<{ id: string; pos: Vec2; text: string; className: string; anim: string; born: number }[]>([])
  const floatSeqRef = useRef(0)
  const lastFloatRoundRef = useRef(-1)
  // Adaptive motion cadence. Each round we measure the real wall-clock gap since the
  // last round-render, EMA-smooth it (per-tick load makes the raw gap jitter), and
  // publish it as the `--seg-ms` CSS var that drives every positional transition (see
  // SEG/XFORM_TRANSITION). Written imperatively on the arena wrapper so it costs no
  // React re-render — the read seam is pure CSS inheritance. arenaWrapRef is an
  // ancestor of the tokens + camera elements, so the var reaches them all.
  const arenaWrapRef = useRef<HTMLDivElement>(null)
  const cadenceEmaRef = useRef(0)
  const lastRoundTsRef = useRef(0)
  const lastSegRef = useRef(ROUND_MS)        // last computed glide duration (ms), to restore after a pan
  const panningRef = useRef(false)           // true while a finger is actively dragging the camera
  const panStartRef = useRef<Vec2 | null>(null)  // view centre captured at pan start
  // The arena is a SQUARE sized to the largest square fitting the wrap. Pure CSS
  // can't express min(width,height)-square across the app's layouts (`w-full +
  // max-h-full aspect-square` degrades to a wide rectangle when the wrap is
  // shorter than it is wide — e.g. a tall detail panel compresses it — and a
  // `containerType`/`cqmin` approach collapses where the height chain is
  // indefinite). So measure the wrap and size the arena in px. Layout-effect so
  // the first paint is already square (no black/letterboxed frame).
  const [arenaSide, setArenaSide] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = arenaWrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const side = Math.floor(Math.min(el.clientWidth, el.clientHeight))
      if (side > 0) setArenaSide((s) => (s === side ? s : side))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const el = arenaWrapRef.current
    if (!el) return
    const now = performance.now()
    // This battle's EXPECTED round gap: the perf tiers pair a coarser timeScale
    // with rarer rounds (everyTicksFor), so a slow-tier field legitimately rounds
    // rarely — that's cadence, not a stall. The glide formula + the coherence
    // budgets it must respect live in render/cadence.ts (pinned by Cadence.test).
    const expectedMs = expectedRoundGapMs(battle.timeScale)
    const raw = lastRoundTsRef.current ? now - lastRoundTsRef.current : ROUND_MS
    lastRoundTsRef.current = now
    // Seed the EMA at the expected gap (not the first raw sample) so a slow-tier
    // field glides smoothly from round one instead of stepping while it converges.
    const ema = cadenceEmaRef.current ? cadenceEmaRef.current * 0.8 + raw * 0.2 : Math.max(raw, expectedMs)
    cadenceEmaRef.current = ema
    const seg = glideMs(ema, expectedMs)
    lastSegRef.current = seg
    // While the player is dragging the camera, hold the glide at 0 so the board
    // tracks the finger instantly instead of easing a beat behind it.
    el.style.setProperty('--seg-ms', panningRef.current ? '0ms' : `${seg}ms`)
  }, [battle.round])

  // Harvest this round's cast events into lingering labels. cast_start (channel
  // begins) and skill_use (instant cast / channel resolves) both count. Keyed by
  // caster+skill so a channel's start+resolve, and rapid re-casts of one spell,
  // collapse into ONE label that refreshes its timer and rises to the top;
  // distinct skills stack separately. Guarded by round so a re-render doesn't
  // re-harvest the same round's events.
  useEffect(() => {
    if (battle.round === lastRoundRef.current) return
    lastRoundRef.current = battle.round
    const now = Date.now()
    const castsThisRound: { sourceId: string; skillId: string }[] = []
    const seen = new Set<string>()
    for (const e of battle.events) {
      if (e.round !== battle.round) continue
      if ((e.type !== 'cast_start' && e.type !== 'skill_use') || !e.skillId) continue
      const key = `${e.sourceId}:${e.skillId}`
      if (seen.has(key)) continue
      seen.add(key)
      castsThisRound.push({ sourceId: e.sourceId, skillId: e.skillId })
    }
    setCastLabels((prev) => {
      const kept = prev.filter((l) => now - l.born < CAST_LABEL_MS)
      if (castsThisRound.length === 0) return kept.length === prev.length ? prev : kept
      const fresh = new Set(castsThisRound.map((c) => `${c.sourceId}:${c.skillId}`))
      // Drop any label being re-cast this round (it'll be re-added on top,
      // refreshed), keep the rest, then append the fresh casts newest-last.
      const next = kept.filter((l) => !fresh.has(`${l.sourceId}:${l.skillId}`))
      for (const { sourceId, skillId } of castsThisRound) {
        next.push({ id: `${sourceId}:${skillId}:${castSeqRef.current}`, sourceId, skillId, born: now, seq: castSeqRef.current++ })
      }
      return next
    })
  }, [battle])

  // Tick a sweep so labels disappear on time even if no new round arrives.
  useEffect(() => {
    if (castLabels.length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setCastLabels((prev) => (prev.some((l) => now - l.born >= CAST_LABEL_MS) ? prev.filter((l) => now - l.born < CAST_LABEL_MS) : prev))
    }, 300)
    return () => clearInterval(t)
  }, [castLabels.length])

  useEffect(() => {
    if (!selectedId) return
    if (snapshotWaveRef.current !== battle.combatants) return   // frozen
    const live = battle.combatants.find((c) => c.id === selectedId)
    if (live) setSnapshot(live)
  }, [battle, selectedId])

  // A fresh follow lock (roster tap, roster double-tap, or minimap) cancels any
  // free-look point so the camera snaps to the chosen hero.
  useEffect(() => {
    if (focusUnitId) setManualCenter(null)
  }, [focusUnitId])

  // Drop a stale follow when the followed hero dies / leaves the field, so the
  // camera falls back to the party instead of locking onto nothing. But NOT during
  // a map change (return-to-town, portal cross, redeploy): the hero's locationId
  // and the camera's combatLocationId flip to the new field atomically, yet the
  // store doesn't reconcile them into that field's combatant list until the next
  // tick — so for one render they look "absent". As long as they're still assigned
  // to the watched location, keep following; they'll reappear next tick.
  useEffect(() => {
    if (!focusUnitId) return
    if (battle.combatants.some((c) => c.id === focusUnitId && c.alive)) return
    const u = units.find((x) => x.id === focusUnitId)
    if (u && u.locationId === combatLocationId) return
    setBattleFollow(null)
  }, [battle, focusUnitId, setBattleFollow, units, combatLocationId])

  // Camera target controls (shared by the roster follow + minimap + the mode
  // toggle). The 3-state mode block (party / hero / free) lives below, after `cam`
  // is derived (it reads the live camera centre).
  const followUnit = (id: string) => { setBattleFollow(id); setManualCenter(null) }
  const onMinimapPick = (hit: MinimapPick) => {
    // Free-looking holds its zoom (see effSize) — seed camSize to the current zoom
    // so the view doesn't jump when the minimap drops us onto a point.
    if ('unitId' in hit) followUnit(hit.unitId)
    else { setManualCenter(hit.point); setBattleFollow(null); setCamSize(cam.size) }
  }

  const handleSelect = (c: Combatant) => {
    // When the host wants the card elsewhere (proto → Hero tab), route the id out
    // and don't open the in-view sheet.
    if (onInspect) { onInspect(c.id); return }
    // Inspecting a chip is orthogonal to following — keep the current camera lock.
    if (selectedId === c.id) {
      setSelectedId(null)
      setSnapshot(null)
      snapshotWaveRef.current = null
    } else {
      setSelectedId(c.id)
      setSnapshot(c)
      snapshotWaveRef.current = battle.combatants
    }
  }
  // External "inspect this combatant" request (proto Hero lens → battlefield
  // card). Opens the detail card for the unit if it's present in this battle.
  useEffect(() => {
    if (!inspectRequest) return
    const live = battle.combatants.find((c) => c.id === inspectRequest.unitId)
    if (!live) return
    setSelectedId(live.id)
    setSnapshot(live)
    snapshotWaveRef.current = battle.combatants
  // fire on each new request nonce
  }, [inspectRequest?.nonce])

  // External "dismiss the card" signal (e.g. a roster tap that also selects a
  // hero). Bumped nonce → close; skip the initial value so it doesn't fire on mount.
  const closeNonceRef = useRef(closeNonce)
  useEffect(() => {
    if (closeNonce === closeNonceRef.current) return
    closeNonceRef.current = closeNonce
    setSelectedId(null)
    setSnapshot(null)
    snapshotWaveRef.current = null
  }, [closeNonce])

  const closeDetail = () => {
    setSelectedId(null)
    setSnapshot(null)
    snapshotWaveRef.current = null
  }

  const sameWave = snapshotWaveRef.current === battle.combatants
  const selected: Combatant | null = (() => {
    if (!selectedId) return null
    if (sameWave) {
      const live = battle.combatants.find((c) => c.id === selectedId)
      if (live) return live
    }
    return snapshot
  })()
  const cols = battle.cols ?? COLS
  const rows = battle.rows ?? ROWS
  const isOpen = battle.mode === 'open'
  // Open-world camera: auto-fits the party until the player pinches / uses the
  // zoom buttons (manualZoom), then holds their chosen size. Always centred on
  // the party.
  const [camSize, setCamSize] = useState(OPEN_CAM_SIZE)
  const [manualZoom, setManualZoom] = useState(false)
  // Free-look target from a minimap tap on empty ground: the camera centres here
  // (instead of the party) until the player re-follows. Cleared by ⊙/follow.
  const [manualCenter, setManualCenter] = useState<Vec2 | null>(null)
  // Spawn-pop gating. The chip-spawn keyframe (grow→overshoot→settle) should mark a
  // unit ARRIVING while you watch — not the roster already present when the view
  // mounts. Since the view remounts per location (breadcrumb switch), without this
  // every chip would replay the pop on each switch. Freeze the mount roster; a chip
  // pops iff its id wasn't part of it (i.e. a later wave / open-world trickle spawn).
  const mountIdsRef = useRef<Set<string> | null>(null)
  if (mountIdsRef.current === null) mountIdsRef.current = new Set(battle.combatants.map((c) => c.id))
  // A unit's render position IS its engine round position; the CSS transitions on
  // the tokens and the camera-following world elements ease the per-round steps, so
  // the camera (derived from these positions below) stays glued — without a
  // per-frame React re-render. (rpos/rposId kept as the read seam the FX/camera code
  // already uses, so the rest of the view is unchanged.)
  const rpos = (c: Combatant): Vec2 => c.pos
  const rposId = (id: string | null | undefined): Vec2 | null => (id ? byId(id)?.pos ?? null : null)
  const fxPos = (id: string | null | undefined): Vec2 | undefined => rposId(id) ?? byId(id ?? undefined)?.pos

  // Round-scoped derivations — recomputed only when the battle advances (its
  // identity changes each round), NOT on the 60fps motion re-renders. One pass
  // buckets this round's events by type instead of six separate `.filter()`s,
  // and tallies alive/party/counts in the same sweep.
  const { alive, party, playersAlive, enemiesAlive, hits, tacticUses, spawns, aggros, rallies, lungeDegs, hitDegs } = useMemo(() => {
    const alive: Combatant[] = []
    const party: Combatant[] = []
    let playersAlive = 0, enemiesAlive = 0
    for (const c of battle.combatants) {
      if (!c.alive) continue
      alive.push(c)
      if (c.team === 'player') { party.push(c); playersAlive++ }
      else if (c.team === 'enemy') enemiesAlive++
    }
    type Ev = typeof battle.events
    const hits: Ev = [], tacticUses: Ev = [], spawns: Ev = [], aggros: Ev = [], rallies: Ev = []
    // Melee attackers this round → screen angle toward their target, quantized
    // to the facing grid. Drives the one-shot lunge nudge on the attacker's chip
    // (melee only — a bow/spell "lunge" would read as a flinch).
    const lungeDegs = new Map<string, number>()
    // Struck combatants this round → screen angle of the blow (source→target),
    // quantized. Drives the one-shot hit recoil on the TARGET's chip (any damage
    // type — the flinch reads whether it was a bite, an arrow, or a spell).
    const hitDegs = new Map<string, number>()
    const recordHit = (e: Ev[number]) => {
      if (!e.targetId) return
      const src = byId(e.sourceId), tgt = byId(e.targetId)
      if (!tgt) return
      const dx = tgt.pos.x - (src?.pos.x ?? tgt.pos.x), dy = tgt.pos.y - (src?.pos.y ?? tgt.pos.y)
      hitDegs.set(e.targetId, dx || dy ? Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI) / 15) * 15 : 90)
    }
    for (const e of battle.events) {
      if (e.round !== battle.round) continue
      switch (e.type) {
        case 'melee_attack':
          if (e.value != null) {
            hits.push(e)
            recordHit(e)
            const src = byId(e.sourceId), tgt = byId(e.targetId)
            if (src?.alive && tgt) {
              const dx = tgt.pos.x - src.pos.x, dy = tgt.pos.y - src.pos.y
              if (dx || dy) lungeDegs.set(src.id, Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI) / 15) * 15)
            }
          }
          break
        case 'ranged_attack': case 'skill_use': if (e.value != null) { hits.push(e); recordHit(e) } break
        case 'tactic_use': tacticUses.push(e); break
        case 'spawn': spawns.push(e); break
        case 'aggro': aggros.push(e); break
        case 'rally': rallies.push(e); break
      }
    }
    return { alive, party, playersAlive, enemiesAlive, hits, tacticUses, spawns, aggros, rallies, lungeDegs, hitDegs }
    // eslint-disable-next-line react-hooks/exhaustive-deps — byId derives from battle
  }, [battle])

  // Harvest this round's damage/heal/DoT/interrupt numbers into the lingering
  // buffer (anchored at the struck unit's spot when it lands), so each plays its
  // full lob+fade rather than being cut off when the next round renders. Guarded by
  // round so a re-render doesn't double-harvest.
  useEffect(() => {
    if (battle.round === lastFloatRoundRef.current) return
    lastFloatRoundRef.current = battle.round
    const now = Date.now()
    const fresh: typeof floatNums = []
    const at = (id: string | null | undefined): Vec2 | null => { const c = id ? battle.combatants.find((x) => x.id === id) : null; return c ? rpos(c) : null }
    for (const e of battle.events) {
      if (e.round !== battle.round) continue
      if ((e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use') && e.value != null) {
        const p = at(e.targetId); if (!p) continue
        const tier = effTier(e.eff)
        fresh.push({ id: `dn${floatSeqRef.current++}`, pos: p, text: dmgText(e.value, tier), className: DMG_CLS[tier], anim: tier === 'immune' ? 'animate-dmg-float' : 'animate-dmg-arc', born: now })
      } else if (e.type === 'heal' && e.value != null) {
        const p = at(e.targetId); if (!p) continue
        fresh.push({ id: `dn${floatSeqRef.current++}`, pos: p, text: `${e.value}`, className: 'text-[16px] text-emerald-300', anim: 'animate-heal-float', born: now })
      } else if (e.type === 'dot' && e.value != null) {
        const p = at(e.targetId); if (!p) continue
        const tier = effTier(e.eff)
        fresh.push({ id: `dn${floatSeqRef.current++}`, pos: p, text: dmgText(e.value, tier), className: DOT_CLS[tier], anim: 'animate-dmg-arc', born: now })
      } else if (e.type === 'interrupt') {
        const p = at(e.targetId); if (!p) continue
        fresh.push({ id: `dn${floatSeqRef.current++}`, pos: p, text: 'interrupted', className: 'text-[10px] text-amber-300', anim: 'animate-dmg-float', born: now })
      }
    }
    setFloatNums((prev) => {
      const kept = prev.filter((f) => now - f.born < FLOAT_NUM_MS)
      return fresh.length === 0 ? (kept.length === prev.length ? prev : kept) : [...kept, ...fresh]
    })
  }, [battle])

  // Sweep expired numbers even if no new round arrives.
  useEffect(() => {
    if (floatNums.length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setFloatNums((prev) => (prev.some((f) => now - f.born >= FLOAT_NUM_MS) ? prev.filter((f) => now - f.born < FLOAT_NUM_MS) : prev))
    }, 300)
    return () => clearInterval(t)
  }, [floatNums.length])

  const partyPts = party.map(rpos)
  const allPts = (alive.length ? alive : battle.combatants).map(rpos)
  // Camera target, in priority: a followed hero (single-hero "Diablo cam"), a
  // free-look point (minimap tap), else the whole party (auto-fit). All read the
  // moving positions, so following is continuous frame-to-frame.
  const focusUnit = focusUnitId ? battle.combatants.find((c) => c.id === focusUnitId && c.alive) : null
  const lookPts: Vec2[] | null = focusUnit ? [rpos(focusUnit)] : manualCenter ? [manualCenter] : null
  const followPts = lookPts ?? (partyPts.length ? partyPts : allPts)
  // Auto-fit the zoom ONLY while actually following the party — not while
  // free-looking or following a single hero. Otherwise the view "breathes" in and
  // out as the party spreads even though you're looking somewhere else (free-look
  // taps a minimap point / pans the camera). Free-look and hero-follow hold a fixed
  // zoom (camSize, seeded to the current zoom when that mode is entered).
  const effSize = manualZoom ? camSize
    : focusUnit ? autoFitSize([rpos(focusUnit)], cols, rows)   // tight, fixed single-hero cam
    : manualCenter ? camSize                                    // free-look holds its zoom
    // A peaceful city is a hub you wander/shop, not a fight to track — frame the
    // WHOLE town by default (heroes cluster at the plaza, so party-fit would show
    // only a fraction of a big field). Driven by the LOCATION being a city
    // (`peacefulCity`), not the tick-set `battle.peaceful` — so it's correct on
    // the FIRST frame (a restored battle deserializes peaceful=false until the
    // next tick, which would flash the party-fit fraction). Pinch/pan/zoom-out to
    // free-look still overrides via camSize — you keep full pan across the town.
    : (peacefulCity || battle.peaceful) ? Math.min(OPEN_CAM_MAX_SIZE, cols, rows)
    : autoFitSize(partyPts.length ? partyPts : allPts, cols, rows)
  // Free-look (minimap tap / drag-pan) may overscroll past the map rim into the
  // surrounding empty space; party/hero auto-follow stays pinned to the field.
  const freeLook = !focusUnit && !!manualCenter
  // Encounters: full-arena frame by default; once the player zooms or pans, hold
  // their chosen size (frozen into camSize when either takes control) and window
  // around the pan point. Mirrors open-world's "manualCenter holds camSize" so a
  // drag doesn't spring the zoom back to auto.
  const encSize = manualZoom || manualCenter ? camSize : Math.max(cols, rows)
  const cam = isOpen
    ? followCamera(followPts, cols, rows, effSize, freeLook)
    : encounterCamera(cols, rows, encSize, manualCenter)

  // ── Camera mode (open-world): three explicit states the ⊳ toggle cycles ────────
  //   party — auto-fit + centre on the whole party (the default)
  //   hero  — follow one hero (the roster-selected one), tight fixed zoom
  //   free  — manual: hold a fixed look-point; drag to pan, pinch to zoom
  // The mode is derived from the underlying state (follow lock / free-look point).
  type CamMode = 'party' | 'hero' | 'free'
  const camMode: CamMode = focusUnit ? 'hero' : manualCenter ? 'free' : 'party'
  const camCenter = (): Vec2 => ({ x: cam.x + cam.size / 2, y: cam.y + cam.size / 2 })
  // Which hero "hero" mode would follow: the roster-selected one if it's alive in
  // this battle, else the first standing party member. null → hero mode unavailable.
  const followableHero = (): string | null => {
    const sel = selectedUnitIds[0]
    if (sel && party.some((c) => c.id === sel)) return sel
    return party[0]?.id ?? null
  }
  const applyMode = (m: CamMode) => {
    setManualZoom(false)
    if (m === 'hero') { const h = followableHero(); setBattleFollow(h); setManualCenter(null) }
    else if (m === 'free') { setCamSize(cam.size); setBattleFollow(null); setManualCenter(camCenter()) }
    else { setBattleFollow(null); setManualCenter(null) }   // party
  }
  const cycleMode = () => {
    const order: CamMode[] = followableHero() ? ['party', 'hero', 'free'] : ['party', 'free']
    applyMode(order[(order.indexOf(camMode) + 1) % order.length])
  }
  // Live drag-pan = free-look driven directly. Capture the view centre at drag
  // start; each move sets the look-point to centre + the dragged world delta,
  // CLAMPED so the window can't slide past the map edge (nothing to snap back).
  // Glide is held at 0 during the drag (panningRef, in the cadence writer) so the
  // board tracks the finger instantly rather than easing behind it.
  const beginPan = () => {
    panningRef.current = true
    panStartRef.current = camCenter()
    setManualZoom(false); setBattleFollow(null); setCamSize(cam.size); setManualCenter(camCenter())
    arenaWrapRef.current?.style.setProperty('--seg-ms', '0ms')
  }
  const panMove = (dxWorld: number, dyWorld: number) => {
    const base = panStartRef.current; if (!base) return
    // Overscroll by half a screen (matches followCamera's free-look slack), so the
    // centre can reach the map corners and the rim can be pulled to mid-screen.
    setManualCenter({
      x: Math.max(0, Math.min(cols, base.x + dxWorld)),
      y: Math.max(0, Math.min(rows, base.y + dyWorld)),
    })
  }
  const endPan = () => {
    panningRef.current = false
    panStartRef.current = null
    arenaWrapRef.current?.style.setProperty('--seg-ms', `${lastSegRef.current}ms`)
  }
  // Pinch-zoom likewise tracks the fingers instantly: hold the glide at 0 for
  // the duration (same panningRef seam the drag-pan uses), restore on release.
  const onPinch = (active: boolean) => {
    panningRef.current = active
    arenaWrapRef.current?.style.setProperty('--seg-ms', active ? '0ms' : `${lastSegRef.current}ms`)
  }

  // Party members outside the current viewport → edge bubbles point to them.
  const offscreen = isOpen ? party.filter((c) => !isOnScreen(cam, rpos(c))) : []

  // Tokens to draw. Open-world clips off-screen units (off-screen heroes show as
  // EdgeMarkers instead); encounters render everyone. LOD (drop labels/nubs) when
  // zoomed far out OR many tokens are on-screen — computed once from this list.
  const visibleTokens = isOpen ? battle.combatants.filter((c) => isOnScreen(cam, rpos(c))) : battle.combatants
  // `?lod=off` forces full detail (labels + facing nubs + attack/hit animations)
  // regardless of zoom/count — a dev lever for profiling the worst case (a dense
  // mob all animating) and A/B'ing LOD thresholds. Read once.
  const tokenDetail = (LOD_FORCED ?? (cam.size <= LOD_CAM_SIZE && visibleTokens.length <= LOD_TOKEN_COUNT))

  // Ground effects (zones / firewalls) rendered into the Arena's GROUND LAYER, in
  // map-fraction coords (% of the whole map), NOT screen-space. As children of the
  // single camera-transformed ground layer they're planted on the terrain by
  // construction — they ride the grid's exact transform, so a freshly-cast circle
  // can't drift to its spot a beat after a camera change (the old per-element screen
  // transform desynced from the grid's translate+scale). y is flipped (+y is up).
  // §terrain: portals are keep-clear boxes for the scatter decor (a crate sitting
  // on a gateway reads as blocking it). World coords; memoized so the memo'd
  // terrain layer sees a stable reference across per-round re-renders.
  const terrainAvoid = useMemo<Rect[]>(
    () => (portals ?? []).map((p) => ({ x: p.at[0] - 1.5, y: p.at[1] - 1.5, w: 3, h: 3 })),
    [portals],
  )

  // §terrain: hero-anchored light — ONE radial-gradient div gliding with the
  // party centroid on the compositor, layered under the static vignette (city
  // fields glow warmer). Size quantized in COARSE 8-cqmin steps: chipDims'
  // eighth-steps are ~2% of a token but ~0.1% of this ~107cqmin element, so the
  // auto-fit camera's breathing would re-quantize nearly every round — and each
  // step is a width/height restyle + repaint of a viewport-sized gradient
  // (measured ~5 fps on the ?perf scene). 8-cqmin steps (~7%) vanish in the
  // gradient's softness and hold the string stable for whole zoom regimes.
  const lightCq = Math.round(((HERO_LIGHT_CELLS / cam.size) * 100) / 8) * 8
  const lightAnchor: Vec2 | null = heroLight && partyPts.length
    ? { x: partyPts.reduce((a, p) => a + p.x, 0) / partyPts.length, y: partyPts.reduce((a, p) => a + p.y, 0) / partyPts.length }
    : null

  const gx = (x: number) => `${(x / cols) * 100}%`
  const gy = (y: number) => `${((rows - y) / rows) * 100}%`
  const groundFx = (
    <>
      {/* §travel: portals — a glowing gateway you walk onto to cross to another map.
          Map-fraction children of the ground layer, so they sit planted on the
          terrain at any zoom. Cosmetic; the store drives the actual crossing. */}
      {isOpen && (portals ?? []).map((p, i) => (
        <div
          key={`portal-${i}`}
          title={`Portal → ${p.to}`}
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${fx.portal} animate-pulse pointer-events-none flex items-center justify-center`}
          style={{ left: gx(p.at[0]), top: gy(p.at[1]), width: `${(2.2 / cols) * 100}%`, height: `${(2.2 / rows) * 100}%` }}
        >
          <span className="text-fuchsia-100/90 leading-none" style={{ fontSize: `clamp(8px, ${(1.4 / cols) * 100}cqw, 22px)` }}>◈</span>
        </div>
      ))}
      {battle.zones.map((z) => (
        <div
          key={z.id}
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${fx.zone} animate-pulse pointer-events-none`}
          // A static zone has constant left/top → no transition needed (the layer
          // glides it). A follow-aura (Consecration) moves with its caster, so ease
          // its in-layer position too.
          style={{ left: gx(z.pos.x), top: gy(z.pos.y), width: `${(2 * z.radius / cols) * 100}%`, height: `${(2 * z.radius / rows) * 100}%`, transition: z.follow ? `left ${SEG} linear, top ${SEG} linear` : undefined }}
        />
      ))}
      {battle.firewalls.map((w) => (
        <div
          key={w.id}
          className={`absolute rounded-sm ${fx.firewall} animate-pulse pointer-events-none`}
          style={{ left: gx(w.pos.x), top: gy(w.pos.y), width: `${(2 * w.half / cols) * 100}%`, height: `${(0.5 / rows) * 100}%`, transform: `translate(-50%,-50%) rotate(${Math.atan2(w.normal.x, w.normal.y) * 180 / Math.PI}deg)` }}
        />
      ))}
    </>
  )

  // Active (non-expired) cast labels keyed by caster id (O(1) per-token lookup in
  // the render below), each list ordered oldest → newest so the newest renders on
  // top (the chip stacks them with flex-col-reverse). Recomputed only when the
  // labels change (harvest / 300ms sweep), not per frame.
  const castLabelsBySource = useMemo(() => {
    const now = Date.now()
    const bySource = new Map<string, CastLabelEntry[]>()
    for (const l of castLabels) {
      if (now - l.born >= CAST_LABEL_MS) continue
      const arr = bySource.get(l.sourceId) ?? []
      arr.push(l); bySource.set(l.sourceId, arr)
    }
    for (const arr of bySource.values()) arr.sort((a, b) => a.seq - b.seq)
    return bySource
  }, [castLabels])

  // Open-world caps zoom-out below the whole field (you pan to look around);
  // encounters cap at the WHOLE board — zooming all the way out frames the full
  // arena, the stable default.
  const maxSize = isOpen ? Math.min(OPEN_CAM_MAX_SIZE, cols, rows) : Math.max(cols, rows)
  const zoomBy = (factor: number) => {
    const next = Math.max(OPEN_CAM_MIN_SIZE, Math.min(maxSize, cam.size * factor))
    // Encounter: zooming out to the full board drops manual control, snapping
    // back to the stable full-arena frame (also the built-in "reset zoom").
    if (!isOpen && next >= maxSize) { setManualZoom(false); setManualCenter(null); return }
    setManualZoom(true)
    setCamSize(next)
  }

  // The battle-state snapshot copy now lives in the unit debug menu
  // (UnitDetailOverlay → Debug), keeping the battlefield itself uncluttered.

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      onClickCapture={(e) => {
        // Tap empty battlefield (not a combatant chip or a control button) to
        // dismiss an open detail card — a lightweight tap-away without a backdrop
        // that would otherwise block the roster/stage.
        if (!selectedId) return
        if ((e.target as HTMLElement).closest('button, [data-chip]')) return
        closeDetail()
      }}
    >
      {/* Zoom (top-left; minimap owns the top-right). Pinch/drag the arena too.
          Open-world adds the middle camera-mode chip (party → hero → free);
          encounters just get −/+ (zoom out to the full board = reset).
          `insetTopControls` drops the cluster below a host's top-left chrome
          (the proto stage breadcrumb). */}
      <div className={`absolute ${insetTopControls ? 'top-11' : 'top-1.5'} left-1.5 z-20 flex items-center gap-1`}>
        <button
          onClick={() => zoomBy(1 / 0.8)}
          aria-label="Zoom out"
          className="w-6 h-6 flex items-center justify-center rounded-md border border-game-border bg-game-surface/90 text-game-text text-sm leading-none backdrop-blur-sm hover:bg-white/5"
        >−</button>
        {isOpen && (
          <button
            onClick={cycleMode}
            aria-label="Camera mode"
            title={
              camMode === 'hero' ? 'Camera: following hero — tap for free-look'
              : camMode === 'free' ? 'Camera: free-look (drag to pan) — tap to frame the party'
              : 'Camera: framing the party — tap to follow your hero'
            }
            className={`px-1.5 h-6 flex items-center gap-1 rounded-md border text-[10px] backdrop-blur-sm ${
              camMode === 'party'
                ? 'border-emerald-600/60 bg-emerald-950/70 text-emerald-200'
                : 'border-game-border bg-game-surface/90 text-game-text-dim hover:bg-white/5'
            }`}
          >
            {camMode === 'hero' ? '◎ Hero' : camMode === 'free' ? '⊹ Free' : '⌖ Party'}
          </button>
        )}
        <button
          onClick={() => zoomBy(0.8)}
          aria-label="Zoom in"
          className="w-6 h-6 flex items-center justify-center rounded-md border border-game-border bg-game-surface/90 text-game-text text-sm leading-none backdrop-blur-sm hover:bg-white/5"
        >+</button>
      </div>
      <div ref={arenaWrapRef} className="flex-1 min-h-0 flex justify-center items-center">
        <Arena
          sidePx={arenaSide}
          cam={cam}
          barriers={battle.barriers}
          centerY={rows / 2}
          mapCols={cols}
          mapRows={rows}
          perimeter={isOpen}
          framed={!insetTopControls}
          skin={skin}
          biome={biome}
          terrainSeed={terrainSeed}
          terrainAvoid={terrainAvoid}
          mapSpec={mapSpec}
          panEnabled
          onPanStart={beginPan}
          onPanMove={panMove}
          onPanEnd={endPan}
          onPinch={onPinch}
          zoom={{ size: cam.size, min: OPEN_CAM_MIN_SIZE, max: maxSize, set: (n) => { setManualZoom(true); setCamSize(n) } }}
          overlay={isOpen ? (
            <>
              {offscreen.map((c) => <EdgeMarker key={c.id} c={c} pos={rpos(c)} cam={cam} />)}
              <Minimap battle={battle} cam={cam} followId={focusUnitId} onPick={onMinimapPick} />
            </>
          ) : undefined}
          groundOverlay={groundFx}
        >
          {/* hero-anchored light: glides with the party on the compositor, under
              tokens/arcs; the static vignette (Arena) layers above it. */}
          {heroLight && lightAnchor && (
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                left: 0, top: 0,
                width: `${lightCq}cqmin`, height: `${lightCq}cqmin`,
                transform: `translate(calc(${fxPct(cam, lightAnchor.x)}cqw - 50%), calc(${fyPct(cam, lightAnchor.y)}cqh - 50%))`,
                transition: XFORM_TRANSITION,
                willChange: 'transform',   // hold ONE promoted layer across the per-round glides
                background: battle.peaceful ? heroLight.city : heroLight.field,
              }}
            />
          )}

          {/* attack arc lines for this round */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`${cam.x} ${rows - cam.y - cam.size} ${cam.size} ${cam.size}`} preserveAspectRatio="none">
            {hits.map((e, i) => {
              const src = byId(e.sourceId), tgt = byId(e.targetId)
              if (!src || !tgt) return null
              const sp = rpos(src), tp = rpos(tgt)
              const stroke = src.team === 'player' ? fx.arcPlayer : fx.arcEnemy
              return <line key={`l-${battle.round}-${i}`} className="animate-line-fade" x1={insetX(cam, sp.x)} y1={rows - insetY(cam, sp.y)} x2={insetX(cam, tp.x)} y2={rows - insetY(cam, tp.y)} stroke={stroke} strokeWidth={cam.size * 0.012} strokeLinecap="round" />
            })}
          </svg>

          {/* hit flashes — a quick ring on the struck unit (the numbers themselves
              come from the lingering buffer below, so they outlive the round). */}
          {hits.map((e, i) => {
            const tgt = byId(e.targetId)
            if (!tgt) return null
            const tp = rpos(tgt)
            return <div key={`h-${battle.round}-${i}`} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${fx.hitRing} animate-hit-flash`} style={{ ...chipDims(cam), left: px(cam, insetX(cam, tp.x)), top: py(cam, insetY(cam, tp.y)) }} />
          })}

          {/* lingering floating numbers (damage/heal/DoT): each plays its full
              lob+fade from where it landed, independent of the round cadence. */}
          {floatNums.map((f) => (
            <Float key={f.id} k={f.id} cam={cam} pos={f.pos} anim={f.anim} className={f.className} text={f.text} />
          ))}

          {/* (cast labels now render inside each caster's BattleChip, below.) */}
          {tacticUses.map((e, i) => {
            const src = byId(e.sourceId)
            const label = (e.extra?.label as string | undefined)
            if (!src || !label) return null
            return <Float key={`tu-${battle.round}-${i}`} k={`tu-${battle.round}-${i}`} cam={cam} pos={rpos(src)} className="text-[10px] text-violet-200" text={label} />
          })}

          {/* spawn markers: a ring + name float where a combatant just entered */}
          {spawns.map((e, i) => {
            const c = byId(e.sourceId)
            const pos = e.position ?? fxPos(e.sourceId)
            if (!pos || !isOnScreen(cam, pos)) return null   // don't flash off-screen spawns in the corner
            const isPlayer = c?.team === 'player'
            return (
              <div key={`sp-${battle.round}-${i}`}>
                <div
                  className={`absolute w-16 h-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 animate-hit-flash pointer-events-none ${isPlayer ? 'border-blue-300/70' : 'border-red-300/70'}`}
                  style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }}
                />
                <Float
                  k={`spt-${battle.round}-${i}`}
                  cam={cam}
                  pos={pos}
                  className={`text-[10px] ${isPlayer ? 'text-blue-200' : 'text-red-200'}`}
                  text={`${isPlayer ? '▲' : '⚠'} ${shortName(c?.name ?? '')}`}
                />
              </div>
            )
          })}

          {/* rally: a Pack Tactics call — a wide ring pulses out from the caller */}
          {rallies.map((e, i) => {
            const pos = e.position ?? fxPos(e.sourceId)
            if (!pos || !isOnScreen(cam, pos)) return null
            return (
              <div key={`ra-${battle.round}-${i}`}>
                <div
                  className="absolute w-24 h-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400/70 animate-hit-flash pointer-events-none"
                  style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }}
                />
                <Float k={`rat-${battle.round}-${i}`} cam={cam} pos={pos} className="text-[10px] font-bold text-amber-200" text="✦ rally!" />
              </div>
            )
          })}

          {/* aggro: a monster just turned hostile — a "!" pops over it */}
          {aggros.map((e, i) => {
            const pos = e.position ?? fxPos(e.sourceId)
            if (!pos || !isOnScreen(cam, pos)) return null
            return (
              <div key={`ag-${battle.round}-${i}`}>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/80 animate-hit-flash pointer-events-none"
                  style={{ ...chipDims(cam), left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }}
                />
                <Float k={`agt-${battle.round}-${i}`} cam={cam} pos={pos} className="text-[14px] font-black text-amber-300" text="!" />
              </div>
            )
          })}

          {/* Tokens (see visibleTokens / tokenDetail above). */}
          {visibleTokens.map((c) => (
            <BattleChip
              key={c.id}
              c={c}
              cam={cam}
              pos={rpos(c)}
              animatePos
              selected={sameWave && c.id === selectedId}
              onSelect={() => handleSelect(c)}
              appearance={getAppearance(c, classFor)}
              scale={battle.timeScale}
              detail={tokenDetail}
              skin={skin}
              castLabels={castLabelsBySource.get(c.id)}
              spawnPop={!mountIdsRef.current!.has(c.id)}
              // LOD-gated like the label/nubs: each lunge promotes the token to
              // a compositor layer for its 0.3s and drops it again — fine for a
              // handful of zoomed-in tokens, layer churn × the whole mob when
              // zoomed out (measured ~-7 fps on the ?perf scene un-gated).
              lungeDeg={tokenDetail ? lungeDegs.get(c.id) ?? null : null}
              lungeFlip={battle.round % 2 === 0}
              hitDeg={tokenDetail ? hitDegs.get(c.id) ?? null : null}
            />
          ))}

          {battle.outcome !== 'ongoing' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={[
                'px-3 py-1.5 rounded-md text-sm font-bold border backdrop-blur-sm',
                battle.outcome === 'victory' ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600/60' : 'bg-red-950/80 text-red-200 border-red-600/60',
              ].join(' ')}>
                {battle.outcome === 'victory' ? 'Victory!' : battle.outcome === 'defeat' ? 'Defeated' : 'Stalemate'}
              </span>
            </div>
          )}
        </Arena>
      </div>

      <Legend players={playersAlive} enemies={enemiesAlive} openWorld={isOpen} />
      {!onInspect && selected && <UnitDetailOverlay c={selected} battle={battle} onClose={closeDetail} onFollow={onFollow} />}
    </div>
  )
}

// ── Static preview (no live battle: between waves / not yet started) ─────────────

function PreviewChip({ cam, pos, label, name, title, isPlayer, skin, bodyShape = 'humanoid', weapon }: { cam: Cam; pos: Vec2; label: string; name: string; title: string; isPlayer: boolean; skin: BattleSkin; bodyShape?: BodyShape; weapon?: Weapon }) {
  const Body = TOKEN_SKINS[skin]
  return (
    <div title={title} style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }} className="absolute -translate-x-1/2 -translate-y-1/2">
      <div className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 ${CHIP_FLOAT_W} flex flex-col items-center gap-0.5 pointer-events-none`}>
        <span className={`text-[9px] font-semibold leading-none whitespace-nowrap drop-shadow ${isPlayer ? 'text-blue-100/85' : 'text-red-100/85'}`}>
          {shortName(name)}
        </span>
        <div className="w-full h-1 rounded-sm bg-black/50 overflow-hidden">
          <div className="h-full bg-emerald-500/90" />
        </div>
      </div>
      {/* form-up facing: teams start facing each other across the center line */}
      <Body
        glyph={label}
        tone={isPlayer ? 'player' : 'enemy'}
        bodyShape={bodyShape}
        weapon={weapon}
        alive
        selected={false}
        facingDeg={isPlayer ? -90 : 90}
        creature={!isPlayer}
        dims={chipDims(cam)}
      />
    </div>
  )
}

export function Preview({ location }: { location: Location | null }) {
  const units            = useGameStore((s) => s.units)
  const equipment        = useGameStore((s) => s.equipment)
  const skin             = useGameStore((s) => s.battleSkin)

  const party = units.filter((u) => u.locationId === location?.id)
  const foes  = location ? waveComposition(location, party.length) : []

  const enemyRank: Record<string, number> = {}
  const enemyChips = foes.map((id, i) => {
    const m = MONSTER_REGISTRY[id]
    const rank: Rank = (m?.stats.attackRange ?? 5) > 5 ? 'back' : 'front'
    const within = enemyRank[rank] ?? 0; enemyRank[rank] = within + 1
    const name = m?.name ?? id
    return { key: `${id}-${i}`, pos: startingPosition('enemy', rank, within), label: initials(name), name, title: name, bodyShape: monsterBodyShape(id) }
  })
  const partyRank: Record<string, number> = {}
  const partyChips = party.map((u) => {
    const ranged = getDerivedStats(u, equipment).attackRange > 5
    const rank: Rank = ranged ? 'back' : 'front'
    const within = partyRank[rank] ?? 0; partyRank[rank] = within + 1
    const label = (u.class && CLASS_ICON[u.class]) ? CLASS_ICON[u.class] : initials(u.name)
    return { key: u.id, pos: startingPosition('player', rank, within), label, name: u.name, title: `${u.name} — ${ranged ? 'ranged' : 'melee'}`, weapon: weaponForClass(u.class) }
  })
  const cam = arenaCamera()

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex justify-center items-start">
        <Arena cam={cam} barriers={locationBarriers(location)} skin={skin} biome={biomeForLocation(location)} terrainSeed={hashString(location?.id ?? '')}>
          {enemyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={false} skin={skin} bodyShape={c.bodyShape} />)}
          {partyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={true} skin={skin} weapon={c.weapon} />)}
          {(party.length === 0 && foes.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-game-muted italic px-6 text-center">
              {location ? 'No combatants to preview — deploy a party here.' : 'Pick a location to preview its encounter.'}
            </div>
          )}
        </Arena>
      </div>
      <Legend players={party.length} enemies={foes.length} />
    </div>
  )
}

// ── BattleView ──────────────────────────────────────────────────────────────--
// The viewer for one location's encounter: live battle if one is running,
// otherwise the static form-up preview. Fills the flex column it's dropped in.

// A request to inspect a specific combatant (open its detail card) raised from
// outside the battle view — e.g. the proto Hero lens. Nonce-driven so repeats
// re-fire. `onFollow` (when provided) surfaces a Follow action in the card.
export interface BattleInspectRequest { unitId: string; nonce: number }

export function BattleView({ locationId, onFollow, inspectRequest, closeNonce, onInspect, insetTopControls }: {
  locationId: string | null
  onFollow?: (unitId: string) => void
  inspectRequest?: BattleInspectRequest | null
  closeNonce?: number   // bump to dismiss any open detail card (e.g. roster tap)
  // When provided, a chip tap routes the combatant id OUT (e.g. proto → Hero tab)
  // instead of opening the in-view detail sheet. Used to unify the battle card
  // into the Hero lens.
  onInspect?: (unitId: string) => void
  // Push the top-LEFT camera cluster down so a host can reserve that corner (the
  // proto stage parks its World›Locale›Battle breadcrumb there).
  insetTopControls?: boolean
}) {
  const battle    = useGameStore((s) => (locationId ? s.battles[locationId] : undefined))
  const locations = useGameStore((s) => s.locations)
  const location  = locationId ? (locations.find((l) => l.id === locationId) ?? null) : null

  // Key on locationId so switching the watched battle (breadcrumb ‹ ›) REMOUNTS the
  // view: a new battle then initialises its camera + tokens fresh and renders them
  // in their real positions, instead of the old instance easing (sliding) every
  // token from the previous battle's framing into place. The key only changes on a
  // location switch — never per tick — so normal play keeps the same instance.
  // §mapgen: a generated location's baked spec for the terrain layer. The
  // adapter memoizes per (location, party kit), so this is a Map lookup on
  // every render after the first. The kit mirrors what the store used when it
  // stood the battle up (units posted at this location), so the terrain draws
  // the same gate variant the engine is running. Drift is possible if the
  // party changes AFTER stand-up (gates don't re-resolve) — acceptable while
  // no live location has gates; see mapgen CLAUDE.md phase 4 open questions.
  const units = useGameStore((s) => s.units)
  const mapSpec = location?.mapGen
    ? generateForLocationCached(location, { proficiencies: partyProficiencyTags(units.filter((u) => u.locationId === location.id)) }).spec
    : undefined
  return battle
    ? <LiveBattle key={locationId ?? 'none'} battle={battle} portals={location?.portals} biome={biomeForLocation(location)} terrainSeed={hashString(locationId ?? '')} mapSpec={mapSpec} peacefulCity={!!location?.traits.includes('city')} onFollow={onFollow} inspectRequest={inspectRequest} closeNonce={closeNonce} onInspect={onInspect} insetTopControls={insetTopControls} />
    : <Preview location={location} />
}
