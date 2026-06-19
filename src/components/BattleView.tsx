import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, waveComposition, locationBarriers, type Location } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import {
  COLS, ROWS, startingPosition, COMBAT_SKILLS, serializeBattle, STATUS_REGISTRY, skillActiveCap,
  type Rank, type Vec2, type Barrier, type BattleState, type Combatant, type StatusEffect,
} from '@/engine'

// The sim advances ~2.5 *logical* rounds/sec (5 engine rounds/sec ÷ timeScale=2),
// so status durations (in logical rounds) read back to real seconds.
const ROUNDS_PER_SEC = 2.5

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

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

// Open-world: a fixed-size window that follows the centroid of the given points
// (alive combatants), clamped so it never shows past the map edges. The whole
// open-world field can't fit at once — the player pans to look around.
function followCamera(pts: Vec2[], cols: number, rows: number, want: number): Cam {
  const size = Math.min(want, cols, rows)
  if (pts.length === 0) return { x: (cols - size) / 2, y: (rows - size) / 2, size }
  let sx = 0, sy = 0
  for (const p of pts) { sx += p.x; sy += p.y }
  const cx = sx / pts.length, cy = sy / pts.length
  return {
    x: Math.max(0, Math.min(cols - size, cx - size / 2)),
    y: Math.max(0, Math.min(rows - size, cy - size / 2)),
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
// How much longer than the measured interval each glide runs: a hair of runway so a
// momentarily-late round retargets a token while it's still moving, never parked.
const CADENCE_RUNWAY = 1.7

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

function Arena({ cam, barriers, children, centerY = CENTER_Y, zoom, overlay, panResetKey, panEnabled = true, mapCols = cam.size, mapRows = cam.size }: { cam: Cam; barriers: Barrier[]; children: React.ReactNode; centerY?: number; zoom?: ZoomCtl; overlay?: React.ReactNode; panResetKey?: string | number; panEnabled?: boolean; mapCols?: number; mapRows?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; basePan: Vec2; moved: boolean; pointerId: number; target: Element } | null>(null)
  // Active pointers (by id) + the in-progress pinch, for two-finger zoom.
  const pointersRef = useRef<Map<number, Vec2>>(new Map())
  const pinchRef = useRef<{ startDist: number; startSize: number } | null>(null)
  const suppressClickRef = useRef(false)
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })

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
    }
    if (d.moved) setPan({ x: d.basePan.x + dx, y: d.basePan.y + dy })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (dragRef.current?.moved) suppressClickRef.current = true
    dragRef.current = null
  }

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
      className="relative w-full max-h-full aspect-square rounded-lg border border-game-border bg-game-surface overflow-hidden select-none"
      style={{ touchAction: 'none', containerType: 'size' }}
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
        {/* faint grid — world-anchored: backgroundPosition tracks the camera so
            the squares stay fixed to the ground and the party visibly moves
            across them (lines land exactly on world-integer cell boundaries).
            Sized in cqmin so it scales with the (square) size-container arena. */}
        {/* faint grid — a single FULL-MAP layer pinned to the world and slid with
            the camera via a compositor `transform` (cells stay fixed to the ground;
            the party visibly moves across them). Done this way, not by easing
            `background-position`, because animating background-position repaints the
            whole arena every frame — a major mobile cost once the camera is panning
            each round. The layer spans the whole map, so its fixed pattern always
            covers the viewport. backgroundSize is one world cell (cqmin = % of the
            square arena). */}
        <div
          className="absolute opacity-40 pointer-events-none"
          style={{
            left: 0, top: 0,
            width: `${(mapCols / cam.size) * 100}%`,
            height: `${(mapRows / cam.size) * 100}%`,
            transform: `translate(${fxPct(cam, 0)}cqw, ${fyPct(cam, mapRows)}cqh)`,
            backgroundImage:
              'linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
            backgroundSize: `${100 / cam.size}cqmin ${100 / cam.size}cqmin`,
            transition: `${XFORM_TRANSITION}, width ${SEG} linear, height ${SEG} linear`,
          }}
        />
        {/* terrain: walls solid (block movement + sight); cliffs translucent +
            dashed (block movement only — ranged attacks fire over them) */}
        {barriers.map((b, i) => {
          const isCliff = b.kind === 'cliff'
          return (
            <div
              key={i}
              className={isCliff
                ? 'absolute bg-amber-900/20 border border-dashed border-amber-600/60 rounded-sm pointer-events-none'
                : 'absolute bg-stone-700/70 border border-stone-500/60 rounded-sm pointer-events-none'}
              style={{ left: 0, top: 0, transform: `translate(${fxPct(cam, b.x)}cqw, ${fyPct(cam, b.y + b.h)}cqh)`, width: `${(b.w / cam.size) * 100}%`, height: `${(b.h / cam.size) * 100}%`, transition: `${XFORM_TRANSITION}, width ${SEG} linear, height ${SEG} linear` }}
            />
          )
        })}
        {children}
      </div>
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
function chipDims(cam: Cam): { width: string; height: string; fontSize: string } {
  const cqmin = (CHIP_CELL_FRACTION * 100) / cam.size       // one chip in cqmin units
  const size = `clamp(14px, ${cqmin}cqmin, 64px)`
  return { width: size, height: size, fontSize: `clamp(7px, ${cqmin * 0.4}cqmin, 26px)` }
}

const CLASS_ICON: Record<string, string> = {
  Fighter: '⚔',
  Ranger:  '🏹',
  Mage:    '✦',
  Cleric:  '✚',
  Rogue:   '🗡',
}

function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.length > 8 ? first.slice(0, 7) + '…' : first
}

function chipGlyph(c: Combatant, classFor: (id: string) => string | null): string {
  if (c.team === 'player') {
    const cls = classFor(c.id)
    if (cls && CLASS_ICON[cls]) return CLASS_ICON[cls]
  }
  return initials(c.name)
}

// Wall-clock length of one *logical* round (2 engine rounds at timeScale=2 ×
// 1000/TICKS_PER_SECOND=5 = 400ms; a raw engine round is 200ms).
const ROUND_MS = 400

// Floating label: name/HP/cast sit BELOW the circle for *every* unit (players
// and enemies alike) so health bars read consistently across the field.
function FloatingLabel({ c, isPlayer, casting, scale }: { c: Combatant; isPlayer: boolean; casting: boolean; scale: number }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
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
      <div className="w-full h-1 rounded-sm bg-black/50 overflow-hidden">
        <div className={`h-full ${hpColor(ratio)} opacity-90`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
      </div>
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
function FacingNub({ c, cam, isPlayer }: { c: Combatant; cam: Cam; isPlayer: boolean }) {
  const f = c.facing ?? { x: 0, y: isPlayer ? 1 : -1 }
  if (Math.hypot(f.x, f.y) < 1e-6) return null
  const angle = (Math.atan2(-f.y, f.x) * 180) / Math.PI   // 0° = pointing right (+x)
  const cqmin = (CHIP_CELL_FRACTION * 100) / cam.size
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
function MovingChevron({ c, cam, isPlayer }: { c: Combatant; cam: Cam; isPlayer: boolean }) {
  const f = c.facing ?? { x: 0, y: isPlayer ? 1 : -1 }
  if (Math.hypot(f.x, f.y) < 1e-6) return null
  const angle = (Math.atan2(-f.y, f.x) * 180) / Math.PI   // 0° = facing +x
  const cqmin = (CHIP_CELL_FRACTION * 100) / cam.size
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
// drop them and render just the circle. Full detail returns as you zoom/follow in.
function BattleChip({ c, cam, pos, animatePos, selected, onSelect, glyph, scale, detail, castLabels }: { c: Combatant; cam: Cam; pos: Vec2; animatePos: boolean; selected: boolean; onSelect: () => void; glyph: string; scale: number; detail: boolean; castLabels?: CastLabelEntry[] }) {
  const isPlayer = c.team === 'player'
  const casting = c.alive && !!c.channel
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
        className="absolute -translate-x-1/2 -translate-y-1/2 animate-chip-spawn cursor-pointer"
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
        {detail && c.alive && <FacingNub c={c} cam={cam} isPlayer={isPlayer} />}
        {detail && c.alive && c.moving && !casting && <MovingChevron c={c} cam={cam} isPlayer={isPlayer} />}
        <div
          title={casting ? `${c.name} — casting ${skillName(c.channel!.skillId)}` : `${c.name} — ${Math.ceil(c.hp)}/${c.maxHp}`}
          style={chipDims(cam)}
          className={[
            'rounded-full border-2 shadow-md flex items-center justify-center font-bold leading-none select-none transition-opacity',
            casting ? 'bg-blue-950 border-amber-300 ring-2 ring-amber-400/60 text-amber-100'
              : isPlayer ? 'bg-blue-900 border-blue-300/80 text-blue-50'
                         : 'bg-red-900  border-red-300/80  text-red-50',
            selected ? 'ring-2 ring-emerald-300' : '',
            c.alive ? '' : 'opacity-25 grayscale',
          ].join(' ')}
        >
          {c.alive ? glyph : '✕'}
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

// Resolve a combatant id to a display name within a battle.
function nameInBattle(battle: BattleState, id: string | null | undefined): string {
  if (!id) return '—'
  return battle.combatants.find((x) => x.id === id)?.name ?? id
}

// Name + how far the referenced target is from `c`, flagged when it sits beyond
// `c`'s vision. Surfaces the "locked onto something I can't see" case at a glance
// — a stale far lock keeps a unit "engaged", which pins the team waypoint and can
// freeze the party in place. (Infinity vision in encounters never flags.)
function targetSight(battle: BattleState, c: Combatant, id: string | null | undefined): { text: string; beyond: boolean } {
  if (!id) return { text: '—', beyond: false }
  const t = battle.combatants.find((x) => x.id === id)
  if (!t) return { text: id, beyond: false }
  const d = Math.hypot(c.pos.x - t.pos.x, c.pos.y - t.pos.y)
  const beyond = d > c.visionRange
  return { text: `${t.name} @${d.toFixed(0)}${beyond ? ' ⚠out-of-sight' : ''}`, beyond }
}

// A plain-text dump of a unit's current decision state + last 15 turns, for
// pasting into a bug report. Mirrors what the Debug tab shows.
function buildDebugText(c: Combatant, battle: BattleState): string {
  const plan = battle.plans[c.team]
  const wp = plan?.waypoint
  const L: string[] = []
  L.push(`# ${c.name} (${c.team}${c.alive ? '' : ' · KO'}) — battle round ${battle.round}`)
  L.push(`hp ${Math.ceil(c.hp)}/${c.maxHp}  pos (${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)})  vision ${c.visionRange === Infinity ? '∞' : c.visionRange}`)
  L.push(`lock: ${targetSight(battle, c, c.lockedTargetId).text}  team-focus: ${nameInBattle(battle, plan?.focusTargetId)}  hunt: ${nameInBattle(battle, plan?.huntTargetId)}  waypoint: ${wp ? `(${wp.x.toFixed(0)},${wp.y.toFixed(0)})` : '—'}`)
  L.push(`tactics: ${c.tactics.map((t) => `${t.def.channel}:${t.def.name}`).join(', ') || '(none)'}`)
  if (c.lastResolution.length) {
    L.push('-- tactic resolution (most recent turn) --')
    for (const r of c.lastResolution) L.push(`  ${r.channel}:${r.name} → ${r.outcome}`)
  }
  if (c.statuses.length) L.push(`statuses: ${c.statuses.map((s) => `${s.name}(${s.duration})`).join(', ')}`)
  if (c.channel) L.push(`channeling: ${c.channel.skillId} (${c.channel.roundsLeft} left)`)
  L.push(`-- last ${Math.min(15, c.trace.length)} turns (newest first) --`)
  for (const e of c.trace.slice().reverse().slice(0, 15)) L.push(`R${e.round}: ${e.text}`)
  return L.join('\n')
}

// Per-category chip tone for status effects (buff / control / debuff).
function statusTone(s: StatusEffect): string {
  return s.category === 'buff' ? 'border-emerald-500/50 text-emerald-200'
    : s.category === 'control' ? 'border-amber-500/50 text-amber-200'
    : 'border-red-500/50 text-red-200'
}
const statusIcon = (s: StatusEffect): string => STATUS_REGISTRY[s.id]?.icon ?? '✦'
const roundsToSecs = (rounds: number): string => `${(rounds / ROUNDS_PER_SEC).toFixed(1)}s`

// Human-readable breakdown of what a status does, derived from its own fields so
// it stays correct for any status the engine builds.
function statusEffectLines(s: StatusEffect): string[] {
  const out: string[] = []
  const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n} ${unit}`
  const m = s.statModifiers
  if (m.str) out.push(signed(m.str, 'STR'))
  if (m.def) out.push(signed(m.def, 'DEF'))
  if (m.int) out.push(signed(m.int, 'INT'))
  if (m.spd) out.push(signed(m.spd, 'SPD'))
  if (m.acc) out.push(signed(m.acc, 'hit'))
  if (m.moveSpeed) out.push(signed(m.moveSpeed, 'move'))
  if (m.moveSpeedMult != null && m.moveSpeedMult !== 1) out.push(`${Math.round(m.moveSpeedMult * 100)}% move speed`)
  if (s.dotDamage) out.push(`${s.dotDamage} damage/round`)
  if (s.damageTakenMult != null && s.damageTakenMult !== 1) out.push(`${Math.round(s.damageTakenMult * 100)}% damage taken`)
  if (s.flags.includes('stunned')) out.push('Skips its turn')
  if (s.flags.includes('rooted')) out.push("Can't move")
  if (s.flags.includes('frozen')) out.push('Skips its turn; armor counts as water')
  if (s.flags.includes('stealthed')) out.push('Hidden from enemies')
  return out
}

// Tappable status chips with a per-status detail drawer (effects + time left).
// Tapping a chip toggles its detail; tapping again (or another chip) closes it.
function StatusList({ statuses }: { statuses: StatusEffect[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const sel = open != null ? statuses[open] : null
  return (
    <div className="mt-2">
      <div className="text-[10px] text-game-text-dim mb-1">Status</div>
      <div className="flex flex-wrap gap-1">
        {statuses.map((s, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            className={`px-1.5 py-0.5 rounded bg-game-bg border text-[10px] flex items-center gap-1 ${statusTone(s)} ${open === i ? 'ring-1 ring-game-primary' : ''}`}
          >
            <span>{statusIcon(s)}</span>
            <span>{s.name}</span>
            <span className="text-game-text-dim tabular-nums">{roundsToSecs(s.duration)}</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="mt-1 rounded border border-game-border bg-game-bg/60 p-1.5 text-[10px] space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-game-text">{statusIcon(sel)} {sel.name}</span>
            <span className="text-game-text-dim capitalize">{sel.category ?? 'effect'}</span>
          </div>
          {STATUS_REGISTRY[sel.id]?.description && (
            <div className="text-game-text-dim">{STATUS_REGISTRY[sel.id]!.description}</div>
          )}
          <div className="text-game-text-dim tabular-nums">
            {sel.duration} round{sel.duration === 1 ? '' : 's'} left (~{roundsToSecs(sel.duration)})
          </div>
          {statusEffectLines(sel).length > 0 && (
            <ul className="text-game-text-dim list-disc list-inside">
              {statusEffectLines(sel).map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function StatsTab({ c, battle }: { c: Combatant; battle: BattleState }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-black/50 overflow-hidden">
          <div className={`h-full ${hpColor(ratio)}`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
        </div>
        <div className="text-game-text-dim tabular-nums">{Math.ceil(c.hp)}/{c.maxHp}</div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-game-text-dim">
        <div>STR <span className="text-game-text tabular-nums">{c.str}</span></div>
        <div>DEF <span className="text-game-text tabular-nums">{c.def}</span></div>
        <div>INT <span className="text-game-text tabular-nums">{c.int}</span></div>
        <div>SPD <span className="text-game-text tabular-nums">{c.spd}</span></div>
      </div>
      {c.skills.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-game-text-dim mb-1">Skills</div>
          <div className="space-y-0.5">
            {c.skills.map((s) => {
              const left = c.skillCooldowns[s.id] ?? 0
              const ready = left <= 0
              const frac = ready ? 1 : 1 - left / Math.max(1, s.cooldown)
              // Skills capped to N simultaneous effects (Firewall walls, Agility
              // buff) show how many are active out of the max next to the name.
              const cap = skillActiveCap(battle, c, s)
              return (
                <div key={s.id} className="flex items-center gap-2 text-[10px]">
                  <div className="flex-1 truncate">
                    {s.name}
                    {cap && <span className={`ml-1 tabular-nums ${cap.active >= cap.max ? 'text-amber-400' : 'text-game-text-dim'}`}>({cap.active}/{cap.max})</span>}
                  </div>
                  <div className="w-20 h-1 rounded-sm bg-black/50 overflow-hidden">
                    <div className={`h-full ${ready ? 'bg-emerald-400' : 'bg-sky-500/80'}`} style={{ width: `${frac * 100}%`, transition: 'width 380ms linear' }} />
                  </div>
                  <div className="w-6 text-right tabular-nums text-game-text-dim">{ready ? 'rdy' : left}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {c.statuses.length > 0 && <StatusList statuses={c.statuses} />}
      {c.channel && (
        <div className="mt-2 text-[10px] text-amber-300">
          ✦ Casting {skillName(c.channel.skillId)} — {c.channel.roundsLeft} round{c.channel.roundsLeft === 1 ? '' : 's'} left
        </div>
      )}
    </>
  )
}

// Debug tab: the team blackboard, this unit's tactic resolution (flagging
// channels with competing priorities), and the last-15-turns trace. Built so a
// developer — or you, pasting the copied block into chat — can see exactly what
// the unit was deciding and why.
// How each tactic resolved last turn → dot, colour, and a one-word reason. Drives
// the "active now" readout: green ● for what fired, muted/amber ○ for the dormant.
const OUTCOME_META: Record<string, { dot: string; cls: string; note: string }> = {
  fired:    { dot: '●', cls: 'text-game-green', note: 'active' },
  idle:     { dot: '○', cls: 'text-game-muted', note: 'condition not met' },
  starved:  { dot: '○', cls: 'text-amber-300',  note: 'lower priority' },
  cooldown: { dot: '○', cls: 'text-game-muted', note: 'on cooldown' },
}
const DEBUG_CHANNEL_ORDER = ['targeting', 'movement', 'action', 'reaction', 'passive'] as const

function DebugTab({ c, battle }: { c: Combatant; battle: BattleState }) {
  const plan = battle.plans[c.team]
  const wp = plan?.waypoint
  const lock = targetSight(battle, c, c.lockedTargetId)
  const focusName = nameInBattle(battle, plan?.focusTargetId)
  const huntName = nameInBattle(battle, plan?.huntTargetId)
  const divergent = c.lockedTargetId && plan?.focusTargetId && c.lockedTargetId !== plan.focusTargetId

  // Per-turn resolution (what fired vs why the rest were dormant), keyed by id.
  const resById = new Map(c.lastResolution.map((r) => [r.id, r.outcome]))
  const stepped = c.trace.length > 0   // has this unit taken a turn yet?
  // Group equipped tactics by channel in a fixed evaluation order.
  const groups = DEBUG_CHANNEL_ORDER
    .map((ch) => [ch, c.tactics.filter((t) => t.def.channel === ch)] as const)
    .filter(([, list]) => list.length > 0)
  const recent = c.trace.slice().reverse().slice(0, 15)

  return (
    <div className="mt-2 space-y-2 text-[10px]">
      {/* Blackboard */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">Blackboard · {c.team}</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-game-text-dim">
          <div>round <span className="text-game-text tabular-nums">{battle.round}</span></div>
          <div>mood <span className={c.provoked ? 'text-game-text' : 'text-amber-300'}>{c.provoked ? 'hostile' : 'passive (until hit/called)'}</span></div>
          <div>pos <span className="text-game-text tabular-nums">({c.pos.x.toFixed(1)},{c.pos.y.toFixed(1)})</span></div>
          <div>lock <span className={!c.lockedTargetId ? 'text-game-muted' : lock.beyond ? 'text-amber-300' : 'text-game-text'}>{lock.text}</span></div>
          <div>team-focus <span className={plan?.focusTargetId ? 'text-game-text' : 'text-game-muted'}>{focusName}</span></div>
          <div>hunt <span className={plan?.huntTargetId ? 'text-game-text' : 'text-game-muted'}>{huntName}</span></div>
          <div>waypoint <span className="text-game-text tabular-nums">{wp ? `(${wp.x.toFixed(0)},${wp.y.toFixed(0)})` : '—'}</span></div>
        </div>
        {lock.beyond && <div className="mt-1 text-amber-300">⚠ locked target is out of sight (it can't be reached/hit — a stale far lock keeps this unit "engaged")</div>}
        {divergent && <div className="mt-1 text-amber-300">⚠ this unit's lock ≠ team focus</div>}
      </div>

      {/* Tactic resolution — what's active now, and why the rest are dormant */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">
          Tactics {stepped ? `· resolved R${battle.round}` : '· priority order'}
        </div>
        {groups.length === 0 && <div className="text-game-muted">no tactics equipped</div>}
        {groups.map(([ch, list]) => (
          <div key={ch} className="flex items-start gap-1.5 leading-tight mb-0.5">
            <span className="shrink-0 w-16 text-game-text-dim">{ch}</span>
            <span className="flex-1 space-y-0.5">
              {list.map((t) => {
                const outcome = resById.get(t.def.id)
                const isPassive = t.def.channel === 'passive'
                // a channelled tactic with no fn of its own (e.g. a pure modifier) = always-on
                const isModifier = !isPassive && !(t.def as unknown as Record<string, unknown>)[t.def.channel]
                const meta = outcome ? OUTCOME_META[outcome]
                  : isPassive  ? { dot: '●', cls: 'text-violet-400', note: 'passive' }
                  : isModifier ? { dot: '●', cls: 'text-game-green', note: 'modifier' }
                  : stepped    ? { dot: '·', cls: 'text-game-muted', note: 'not evaluated' }
                  : { dot: '·', cls: 'text-game-text-dim', note: '' }
                const lit = outcome === 'fired' || isPassive || isModifier
                return (
                  <div key={t.def.id} className="flex items-center gap-1">
                    <span className={meta.cls}>{meta.dot}</span>
                    <span className={lit ? 'text-game-text' : 'text-game-text-dim'}>{t.def.name}</span>
                    <span className="text-game-muted">·r{t.rank}</span>
                    {meta.note && <span className={`ml-auto ${meta.cls}`}>{meta.note}</span>}
                  </div>
                )
              })}
            </span>
          </div>
        ))}
      </div>

      {/* Recent trace */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">Recent (last {recent.length}, newest first)</div>
        {recent.length === 0 && <div className="text-game-muted">no actions yet</div>}
        <div className="space-y-0.5 font-mono text-[9.5px] leading-tight max-h-32 overflow-y-auto">
          {recent.map((e, i) => (
            <div key={i} className="text-game-text-dim"><span className="text-game-muted">R{e.round}</span> {e.text}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Selected-unit detail as a dismissable bottom-sheet overlay. Floats over the
// arena so the board keeps its full height regardless of screen size. Two tabs:
// Stats (the card) and Debug (blackboard + tactics + trace, with copy-to-share).
function UnitDetailOverlay({ c, battle, onClose, onFollow }: { c: Combatant; battle: BattleState; onClose: () => void; onFollow?: (unitId: string) => void }) {
  const isPlayer = c.team === 'player'
  const [tab, setTab] = useState<'stats' | 'debug'>('stats')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    const text = buildDebugText(c, battle)
    try { navigator.clipboard?.writeText(text) } catch { /* clipboard unavailable */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return createPortal(
    <>
      {/* A full bottom-half panel that reads as its OWN screen — covering the lens
          tabs beneath — so it's clearly separate from those decision surfaces.
          No backdrop catcher, so the roster + stage above stay live: tapping a
          roster hero both selects them AND dismisses this card (via closeNonce). */}
      <div className="fixed inset-x-0 bottom-0 top-1/2 z-50 flex flex-col rounded-t-2xl border-t border-game-border bg-game-surface shadow-2xl">
        <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-game-border shrink-0" />
        <div className="px-4 pb-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className={`font-semibold text-base truncate ${isPlayer ? 'text-blue-200' : 'text-red-200'}`}>{c.name}</div>
            <div className="flex items-center gap-2 shrink-0">
              {isPlayer && onFollow && (
                <button
                  onClick={() => { onFollow(c.id); onClose() }}
                  title="Select this hero in the roster and lock the camera onto them"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-game-accent/60 bg-game-accent/15 text-game-accent text-[11px] font-semibold hover:bg-game-accent/25 transition-colors"
                >🎥 Follow</button>
              )}
              <div className="text-[10px] text-game-text-dim uppercase tracking-wide">{c.team}{c.alive ? '' : ' · KO'}</div>
              <button onClick={onClose} aria-label="Close unit detail" className="w-6 h-6 flex items-center justify-center rounded border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1">
            <button onClick={() => setTab('stats')} className={`px-2 py-0.5 rounded text-[10px] border ${tab === 'stats' ? 'border-game-primary bg-game-primary/20 text-game-text' : 'border-game-border text-game-text-dim hover:bg-white/5'}`}>Stats</button>
            <button onClick={() => setTab('debug')} className={`px-2 py-0.5 rounded text-[10px] border ${tab === 'debug' ? 'border-game-primary bg-game-primary/20 text-game-text' : 'border-game-border text-game-text-dim hover:bg-white/5'}`}>Debug</button>
            {tab === 'debug' && (
              <button onClick={copy} className="ml-auto px-2 py-0.5 rounded text-[10px] border border-game-border text-game-text-dim hover:bg-white/5" aria-label="Copy debug info">
                {copied ? '✓ copied' : '⧉ copy last 15'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs">
          {tab === 'stats' ? <StatsTab c={c} battle={battle} /> : <DebugTab c={c} battle={battle} />}
        </div>
      </div>
    </>,
    document.body,
  )
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
type MinimapPick = { unitId: string } | { point: Vec2 }
function Minimap({ battle, cam, followId, onPick }: { battle: BattleState; cam: Cam; followId: string | null; onPick: (hit: MinimapPick) => void }) {
  const cols = battle.cols ?? COLS
  const rows = battle.rows ?? ROWS
  const BOX = 64                                        // px on the long side
  const w = cols >= rows ? BOX : BOX * (cols / rows)
  const h = rows >= cols ? BOX : BOX * (rows / cols)
  const mx = (x: number) => (x / cols) * w
  const my = (y: number) => (1 - y / rows) * h          // +y is up on screen
  const ref = useRef<HTMLDivElement>(null)

  const handlePick = (e: React.PointerEvent) => {
    e.stopPropagation()
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const wx = ((e.clientX - box.left) / w) * cols
    const wy = (1 - (e.clientY - box.top) / h) * rows
    let best: { id: string; d: number } | null = null
    for (const c of battle.combatants) {
      if (c.team !== 'player' || !c.alive) continue
      const d = Math.hypot(c.pos.x - wx, c.pos.y - wy)
      if (!best || d < best.d) best = { id: c.id, d }
    }
    if (best && best.d <= cols * 0.09) onPick({ unitId: best.id })
    else onPick({ point: { x: wx, y: wy } })
  }

  return (
    <div
      ref={ref}
      onPointerDown={handlePick}
      title="Minimap — tap a hero to follow, elsewhere to look around"
      className="absolute top-1 right-1 rounded-md border border-game-border bg-game-surface/85 backdrop-blur-sm overflow-hidden pointer-events-auto cursor-pointer"
      style={{ width: w, height: h, touchAction: 'none' }}
    >
      {battle.barriers.map((b, i) => (
        <div key={i} className="absolute bg-stone-500/40" style={{ left: mx(b.x), top: my(b.y + b.h), width: (b.w / cols) * w, height: (b.h / rows) * h }} />
      ))}
      {/* current camera window — eases with the camera so the radar box tracks the
          smooth pan instead of stepping per round */}
      <div className="absolute border border-white/70 bg-white/5 pointer-events-none" style={{ left: 0, top: 0, transform: `translate(${mx(cam.x)}px, ${my(cam.y + cam.size)}px)`, width: (cam.size / cols) * w, height: (cam.size / rows) * h, transition: `${XFORM_TRANSITION}, width ${SEG} linear, height ${SEG} linear` }} />
      {battle.combatants.filter((c) => c.team === 'enemy' && c.alive).map((c) => (
        <div key={c.id} className="absolute w-1 h-1 rounded-full bg-red-400/90 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: mx(c.pos.x), top: my(c.pos.y) }} />
      ))}
      {battle.combatants.filter((c) => c.team === 'player' && c.alive).map((c) => (
        <div
          key={c.id}
          className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none ${c.id === followId ? 'w-2 h-2 bg-emerald-300 ring-1 ring-emerald-200' : 'w-1.5 h-1.5 bg-blue-300'}`}
          style={{ left: mx(c.pos.x), top: my(c.pos.y) }}
        />
      ))}
    </div>
  )
}

function LiveBattle({ battle, onFollow, inspectRequest, closeNonce }: { battle: BattleState; onFollow?: (unitId: string) => void; inspectRequest?: BattleInspectRequest | null; closeNonce?: number }) {
  const units = useGameStore((s) => s.units)
  // The camera-follow lock lives in the store now (driven by the single top
  // roster — tap a hero there to lock onto them), so this view just reads it.
  const focusUnitId   = useGameStore((s) => s.battleFollowId)
  const setBattleFollow = useGameStore((s) => s.setBattleFollow)
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
  useEffect(() => {
    const el = arenaWrapRef.current
    if (!el) return
    const now = performance.now()
    const raw = lastRoundTsRef.current ? now - lastRoundTsRef.current : ROUND_MS
    lastRoundTsRef.current = now
    const ema = cadenceEmaRef.current ? cadenceEmaRef.current * 0.8 + raw * 0.2 : raw
    cadenceEmaRef.current = ema
    // Clamp: floor keeps fast/desktop motion from going twitchy; ceil stops a long
    // stall (hidden tab, GC pause) from leaving tokens crawling for seconds.
    const seg = Math.min(900, Math.max(160, ema * CADENCE_RUNWAY))
    el.style.setProperty('--seg-ms', `${seg}ms`)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnitId])

  // Drop a stale follow when the followed hero dies / leaves the field, so the
  // camera falls back to the party instead of locking onto nothing.
  useEffect(() => {
    if (focusUnitId && !battle.combatants.some((c) => c.id === focusUnitId && c.alive)) setBattleFollow(null)
  }, [battle, focusUnitId, setBattleFollow])

  // Camera target controls (shared by the roster follow + minimap).
  const followUnit = (id: string) => { setBattleFollow(id); setManualCenter(null) }
  const resetToAuto = () => { setBattleFollow(null); setManualCenter(null); setManualZoom(false) }
  const onMinimapPick = (hit: MinimapPick) => {
    if ('unitId' in hit) followUnit(hit.unitId)
    else { setManualCenter(hit.point); setBattleFollow(null) }
  }

  const handleSelect = (c: Combatant) => {
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
  }, [inspectRequest?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const { alive, party, playersAlive, enemiesAlive, hits, tacticUses, spawns, aggros, rallies } = useMemo(() => {
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
    for (const e of battle.events) {
      if (e.round !== battle.round) continue
      switch (e.type) {
        case 'melee_attack': case 'ranged_attack': case 'skill_use': if (e.value != null) hits.push(e); break
        case 'tactic_use': tacticUses.push(e); break
        case 'spawn': spawns.push(e); break
        case 'aggro': aggros.push(e); break
        case 'rally': rallies.push(e); break
      }
    }
    return { alive, party, playersAlive, enemiesAlive, hits, tacticUses, spawns, aggros, rallies }
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
  // Zoom is sized on the followed hero (single-hero "Diablo cam") or the whole
  // party — NEVER on a free-look point. A minimap tap only re-centers the camera;
  // letting it drive the zoom too collapsed the view to a tight 15-cell window on
  // the tapped (often empty) spot, leaving every unit clipped off-screen.
  const sizePts = focusUnit ? [rpos(focusUnit)] : (partyPts.length ? partyPts : allPts)
  const effSize = manualZoom ? camSize : autoFitSize(sizePts, cols, rows)
  const cam = isOpen
    ? followCamera(followPts, cols, rows, effSize)
    : arenaCamera(cols, rows)

  // Identity of the current camera target — changes when we follow a new hero,
  // free-look to a new spot, or fall back to auto-fit. The Arena zeroes its
  // finger-pan whenever this flips, so a retarget always recentres cleanly.
  const camTargetKey = focusUnitId ?? (manualCenter ? `pt:${manualCenter.x.toFixed(1)},${manualCenter.y.toFixed(1)}` : 'auto')

  // Party members outside the current viewport → edge bubbles point to them.
  const offscreen = isOpen ? party.filter((c) => !isOnScreen(cam, rpos(c))) : []

  // Tokens to draw. Open-world clips off-screen units (off-screen heroes show as
  // EdgeMarkers instead); encounters render everyone. LOD (drop labels/nubs) when
  // zoomed far out OR many tokens are on-screen — computed once from this list.
  const visibleTokens = isOpen ? battle.combatants.filter((c) => isOnScreen(cam, rpos(c))) : battle.combatants
  const tokenDetail = cam.size <= LOD_CAM_SIZE && visibleTokens.length <= LOD_TOKEN_COUNT

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

  const maxSize = Math.min(OPEN_CAM_MAX_SIZE, cols, rows)
  const zoomBy = (factor: number) => {
    setManualZoom(true)
    setCamSize(Math.max(OPEN_CAM_MIN_SIZE, Math.min(maxSize, cam.size * factor)))
  }

  // Debug: copy a 1:1 snapshot token of this battle's state. A dev can reload it
  // (deserializeBattle) to reproduce the exact scenario. Available for any live
  // battle, no unit selection required.
  const [snapCopied, setSnapCopied] = useState(false)
  const copySnapshot = () => {
    try { navigator.clipboard?.writeText(serializeBattle(battle)) } catch { /* clipboard unavailable */ }
    setSnapCopied(true)
    setTimeout(() => setSnapCopied(false), 1200)
  }

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
      <button
        onClick={copySnapshot}
        title="Copy a snapshot of this battle's state (for bug reports / reproduction)"
        aria-label="Copy battle state snapshot"
        className="absolute bottom-1.5 left-1.5 z-20 px-2 h-6 flex items-center rounded-md border border-game-border bg-game-surface/90 text-[10px] text-game-text-dim backdrop-blur-sm hover:bg-white/5"
      >
        {snapCopied ? '✓ state copied' : '⎘ state'}
      </button>
      {isOpen && (
        <>
          {/* Zoom (top-left; minimap owns the top-right). Pinch the arena too.
              ⊙ recentres / re-enables auto-fit on the party. */}
          <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
            <button
              onClick={() => zoomBy(1 / 0.8)}
              aria-label="Zoom out"
              className="w-6 h-6 flex items-center justify-center rounded-md border border-game-border bg-game-surface/90 text-game-text text-sm leading-none backdrop-blur-sm hover:bg-white/5"
            >−</button>
            <button
              onClick={resetToAuto}
              aria-label="Auto-fit the party"
              title="Auto-fit the party"
              className={`px-1.5 h-6 flex items-center rounded-md border text-[10px] tabular-nums backdrop-blur-sm ${(manualZoom || focusUnit || manualCenter) ? 'border-game-border bg-game-surface/90 text-game-text-dim hover:bg-white/5' : 'border-emerald-600/60 bg-emerald-950/70 text-emerald-200'}`}
            >
              {focusUnit ? '◎' : manualCenter ? '⊹' : manualZoom ? `${Math.round(cam.size)}c` : 'auto'}
            </button>
            <button
              onClick={() => zoomBy(0.8)}
              aria-label="Zoom in"
              className="w-6 h-6 flex items-center justify-center rounded-md border border-game-border bg-game-surface/90 text-game-text text-sm leading-none backdrop-blur-sm hover:bg-white/5"
            >+</button>
          </div>
        </>
      )}
      <div ref={arenaWrapRef} className="flex-1 min-h-0 flex justify-center items-start">
        <Arena
          cam={cam}
          barriers={battle.barriers}
          centerY={rows / 2}
          mapCols={cols}
          mapRows={rows}
          panEnabled={!isOpen}
          panResetKey={isOpen ? camTargetKey : undefined}
          zoom={isOpen ? { size: cam.size, min: OPEN_CAM_MIN_SIZE, max: maxSize, set: (n) => { setManualZoom(true); setCamSize(n) } } : undefined}
          overlay={isOpen ? (
            <>
              {offscreen.map((c) => <EdgeMarker key={c.id} c={c} pos={rpos(c)} cam={cam} />)}
              <Minimap battle={battle} cam={cam} followId={focusUnitId} onPick={onMinimapPick} />
            </>
          ) : undefined}
        >
          {/* persistent ground hazards (Lightning Storm, etc.) */}
          {battle.zones.map((z) => (
            <div
              key={z.id}
              className="absolute rounded-full bg-orange-500/25 border border-orange-400/50 animate-pulse pointer-events-none"
              style={{ left: 0, top: 0, transform: `translate(calc(${fxPct(cam, z.pos.x)}cqw - 50%), calc(${fyPct(cam, z.pos.y)}cqh - 50%))`, width: `${(2 * z.radius / cam.size) * 100}%`, height: `${(2 * z.radius / cam.size) * 100}%`, transition: `${XFORM_TRANSITION}, width ${SEG} linear, height ${SEG} linear` }}
            />
          ))}

          {/* firewalls: a bar of flame along the wall's tangent (perpendicular to
              its normal). Screen-space flips y, so the bar angle is atan2(nx, ny). */}
          {battle.firewalls.map((w) => (
            <div
              key={w.id}
              className="absolute rounded-sm bg-gradient-to-b from-amber-300/70 via-orange-500/60 to-red-600/50 border border-amber-300/70 shadow-[0_0_10px_2px_rgba(251,146,60,0.6)] animate-pulse pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: `${(2 * w.half / cam.size) * 100}%`,
                height: `${(0.5 / cam.size) * 100}%`,
                transform: `translate(calc(${fxPct(cam, w.pos.x)}cqw - 50%), calc(${fyPct(cam, w.pos.y)}cqh - 50%)) rotate(${Math.atan2(w.normal.x, w.normal.y) * 180 / Math.PI}deg)`,
                transition: XFORM_TRANSITION,
              }}
            />
          ))}

          {/* attack arc lines for this round */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`${cam.x} ${rows - cam.y - cam.size} ${cam.size} ${cam.size}`} preserveAspectRatio="none">
            {hits.map((e, i) => {
              const src = byId(e.sourceId), tgt = byId(e.targetId)
              if (!src || !tgt) return null
              const sp = rpos(src), tp = rpos(tgt)
              const stroke = src.team === 'player' ? 'rgb(96,165,250)' : 'rgb(248,113,113)'
              return <line key={`l-${battle.round}-${i}`} className="animate-line-fade" x1={insetX(cam, sp.x)} y1={rows - insetY(cam, sp.y)} x2={insetX(cam, tp.x)} y2={rows - insetY(cam, tp.y)} stroke={stroke} strokeWidth={cam.size * 0.012} strokeLinecap="round" />
            })}
          </svg>

          {/* hit flashes — a quick ring on the struck unit (the numbers themselves
              come from the lingering buffer below, so they outlive the round). */}
          {hits.map((e, i) => {
            const tgt = byId(e.targetId)
            if (!tgt) return null
            const tp = rpos(tgt)
            return <div key={`h-${battle.round}-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 animate-hit-flash" style={{ ...chipDims(cam), left: px(cam, insetX(cam, tp.x)), top: py(cam, insetY(cam, tp.y)) }} />
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
              glyph={chipGlyph(c, classFor)}
              scale={battle.timeScale}
              detail={tokenDetail}
              castLabels={castLabelsBySource.get(c.id)}
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
      {selected && <UnitDetailOverlay c={selected} battle={battle} onClose={closeDetail} onFollow={onFollow} />}
    </div>
  )
}

// ── Static preview (no live battle: between waves / not yet started) ─────────────

function PreviewChip({ cam, pos, label, name, title, isPlayer }: { cam: Cam; pos: Vec2; label: string; name: string; title: string; isPlayer: boolean }) {
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
      <div
        style={chipDims(cam)}
        className={[
          'rounded-full border-2 shadow-md flex items-center justify-center font-bold leading-none select-none',
          isPlayer ? 'bg-blue-900 border-blue-300/80 text-blue-50' : 'bg-red-900 border-red-300/80 text-red-50',
        ].join(' ')}>
        {label}
      </div>
    </div>
  )
}

export function Preview({ location }: { location: Location | null }) {
  const units            = useGameStore((s) => s.units)
  const equipment        = useGameStore((s) => s.equipment)

  const party = units.filter((u) => u.locationId === location?.id)
  const foes  = location ? waveComposition(location, party.length) : []

  const enemyRank: Record<string, number> = {}
  const enemyChips = foes.map((id, i) => {
    const m = MONSTER_REGISTRY[id]
    const rank: Rank = (m?.stats.attackRange ?? 5) > 5 ? 'back' : 'front'
    const within = enemyRank[rank] ?? 0; enemyRank[rank] = within + 1
    const name = m?.name ?? id
    return { key: `${id}-${i}`, pos: startingPosition('enemy', rank, within), label: initials(name), name, title: name }
  })
  const partyRank: Record<string, number> = {}
  const partyChips = party.map((u) => {
    const ranged = getDerivedStats(u, equipment).attackRange > 5
    const rank: Rank = ranged ? 'back' : 'front'
    const within = partyRank[rank] ?? 0; partyRank[rank] = within + 1
    const label = (u.class && CLASS_ICON[u.class]) ? CLASS_ICON[u.class] : initials(u.name)
    return { key: u.id, pos: startingPosition('player', rank, within), label, name: u.name, title: `${u.name} — ${ranged ? 'ranged' : 'melee'}` }
  })
  const cam = arenaCamera()

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex justify-center items-start">
        <Arena cam={cam} barriers={locationBarriers(location)}>
          {enemyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={false} />)}
          {partyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={true} />)}
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

export function BattleView({ locationId, onFollow, inspectRequest, closeNonce }: {
  locationId: string | null
  onFollow?: (unitId: string) => void
  inspectRequest?: BattleInspectRequest | null
  closeNonce?: number   // bump to dismiss any open detail card (e.g. roster tap)
}) {
  const battle    = useGameStore((s) => (locationId ? s.battles[locationId] : undefined))
  const locations = useGameStore((s) => s.locations)
  const location  = locationId ? (locations.find((l) => l.id === locationId) ?? null) : null

  return battle
    ? <LiveBattle battle={battle} onFollow={onFollow} inspectRequest={inspectRequest} closeNonce={closeNonce} />
    : <Preview location={location} />
}
