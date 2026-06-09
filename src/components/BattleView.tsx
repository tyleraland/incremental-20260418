import { useState, useEffect, useRef } from 'react'
import { useGameStore, waveComposition, locationBarriers, type Location } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import {
  COLS, ROWS, startingPosition, COMBAT_SKILLS, serializeBattle, STATUS_REGISTRY, skillActiveCap,
  type Rank, type Vec2, type Barrier, type BattleState, type Combatant, type StatusEffect,
} from '@/engine'

// The sim advances ~2.5 rounds/sec (store ROUND_EVERY_TICKS=2 over
// TICKS_PER_SECOND=5), so status durations (in rounds) read back to real seconds.
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

const px = (cam: Cam, x: number) => `${((x - cam.x) / cam.size) * 100}%`
const py = (cam: Cam, y: number) => `${(1 - (y - cam.y) / cam.size) * 100}%`

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

function Arena({ cam, barriers, children, centerY = CENTER_Y, zoom, overlay }: { cam: Cam; barriers: Barrier[]; children: React.ReactNode; centerY?: number; zoom?: ZoomCtl; overlay?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; basePan: Vec2; moved: boolean; pointerId: number; target: Element } | null>(null)
  // Active pointers (by id) + the in-progress pinch, for two-finger zoom.
  const pointersRef = useRef<Map<number, Vec2>>(new Map())
  const pinchRef = useRef<{ startDist: number; startSize: number } | null>(null)
  const suppressClickRef = useRef(false)
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })

  const cell = `${100 / cam.size}%`
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
    } else if (pointersRef.current.size === 1) {
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
        {/* team-half tints, split at the arena's center line */}
        <div className="absolute inset-x-0 top-0 bg-red-500/5 pointer-events-none" style={{ height: `${centerTop}%` }} />
        <div className="absolute inset-x-0 bottom-0 bg-blue-500/5 pointer-events-none" style={{ top: `${centerTop}%` }} />
        {/* faint grid that scales with the camera */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
            backgroundSize: `${cell} ${cell}`,
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
              style={{ left: px(cam, b.x), top: py(cam, b.y + b.h), width: `${(b.w / cam.size) * 100}%`, height: `${(b.h / cam.size) * 100}%` }}
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

// Wall-clock length of one engine round (ROUND_EVERY_TICKS=2 × 1000/TICKS_PER_SECOND=5).
const ROUND_MS = 400

// Floating label: name/HP/cast sit BELOW the circle for *every* unit (players
// and enemies alike) so health bars read consistently across the field.
function FloatingLabel({ c, isPlayer, casting }: { c: Combatant; isPlayer: boolean; casting: boolean }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
  // Cast bar driven by the live channel (roundsLeft), NOT wall-clock: a round is
  // gated to game ticks, and under load they advance in jumps — a wall-clock
  // animation then runs ahead and fills before the spell fires. Mapping
  // roundsLeft total…1 → 0…1 keeps it locked to the real cast, so it finishes
  // exactly as the spell lands. A round-long width transition ramps each step so
  // it reads smoothly (it only ever looks "stepped" if rounds stall under load).
  const ch = casting ? c.channel : null
  const chTime = ch ? (c.skills.find((s) => s.id === ch.skillId)?.channelTime ?? 1) : 1
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

function BattleChip({ c, cam, selected, onSelect, glyph }: { c: Combatant; cam: Cam; selected: boolean; onSelect: () => void; glyph: string }) {
  const isPlayer = c.team === 'player'
  const casting = c.alive && !!c.channel
  return (
    <div
      onClick={onSelect}
      className="absolute -translate-x-1/2 -translate-y-1/2 animate-chip-spawn cursor-pointer"
      style={{ left: px(cam, insetX(cam, c.pos.x)), top: py(cam, insetY(cam, c.pos.y)), transition: 'left 380ms linear, top 380ms linear' }}
    >
      <FloatingLabel c={c} isPlayer={isPlayer} casting={casting} />
      {c.alive && <FacingNub c={c} cam={cam} isPlayer={isPlayer} />}
      {c.alive && c.moving && !casting && <MovingChevron c={c} cam={cam} isPlayer={isPlayer} />}
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
  )
}

// An edge bubble pointing at an off-camera party member: a small initials chip
// clamped to the arena rim plus an arrow rotated toward the unit. `cam` excludes
// manual pan (rare in the follow view), so it tracks the camera, not the pan.
function EdgeMarker({ c, cam }: { c: Combatant; cam: Cam }) {
  const fx = (c.pos.x - cam.x) / cam.size            // 0..1 across the view
  const fy = 1 - (c.pos.y - cam.y) / cam.size        // 0..1 top→bottom
  const dx = fx - 0.5, dy = fy - 0.5
  const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1
  const pad = 0.05
  const bx = Math.max(pad, Math.min(1 - pad, 0.5 + (dx * 0.5) / m))
  const by = Math.max(pad, Math.min(1 - pad, 0.5 + (dy * 0.5) / m))
  const ratio = Math.max(0, c.hp / c.maxHp)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5" style={{ left: `${bx * 100}%`, top: `${by * 100}%` }}>
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

function Float({ cam, pos, className, text, k }: { cam: Cam; pos: Vec2; className: string; text: string; k: string }) {
  return (
    <div key={k} className={`absolute -translate-x-1/2 -translate-y-1/2 font-bold drop-shadow animate-dmg-float whitespace-nowrap ${className}`} style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }}>
      {text}
    </div>
  )
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
                // movement channel w/o a movement fn = an always-on modifier (Charger)
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
function UnitDetailOverlay({ c, battle, onClose }: { c: Combatant; battle: BattleState; onClose: () => void }) {
  const isPlayer = c.team === 'player'
  const [tab, setTab] = useState<'stats' | 'debug'>('stats')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    const text = buildDebugText(c, battle)
    try { navigator.clipboard?.writeText(text) } catch { /* clipboard unavailable */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-2 pb-2 pointer-events-none">
      <div className="max-w-md mx-auto w-full rounded-md border border-game-border bg-game-surface/95 backdrop-blur-sm shadow-lg p-3 text-xs pointer-events-auto">
        <div className="flex items-center justify-between">
          <div className={`font-semibold text-sm ${isPlayer ? 'text-blue-200' : 'text-red-200'}`}>{c.name}</div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-game-text-dim uppercase tracking-wide">{c.team}{c.alive ? '' : ' · KO'}</div>
            <button onClick={onClose} aria-label="Close unit detail" className="w-5 h-5 flex items-center justify-center rounded border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
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

        {tab === 'stats' ? <StatsTab c={c} battle={battle} /> : <DebugTab c={c} battle={battle} />}
      </div>
    </div>
  )
}

function Legend({ players, enemies }: { players: number; enemies: number }) {
  return (
    <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim py-1.5 shrink-0">
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-900 border border-blue-300/80 inline-block" /> Party ({players})</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-900 border border-red-300/80 inline-block" /> Enemies ({enemies})</span>
    </div>
  )
}

function LiveBattle({ battle }: { battle: BattleState }) {
  const units = useGameStore((s) => s.units)
  const battleFocus = useGameStore((s) => s.battleFocus)
  const classFor = (id: string) => units.find((u) => u.id === id)?.class ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Roster double-tap in battle mode asks to centre on a specific unit
  // (battleFocus). While set, the camera frames that unit instead of the whole
  // party; cleared once the player interacts (tap a chip / zoom / pan-reset).
  const [focusUnitId, setFocusUnitId] = useState<string | null>(null)
  const byId = (id?: string) => (id ? battle.combatants.find((c) => c.id === id) : undefined)
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
  const [castLabels, setCastLabels] = useState<{ id: string; sourceId: string; skillId: string; born: number; seq: number }[]>([])
  const castSeqRef = useRef(0)
  const lastRoundRef = useRef(-1)

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

  // Roster double-tap → centre on that unit (nonce so the same unit re-fires).
  useEffect(() => {
    if (battleFocus) setFocusUnitId(battleFocus.unitId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleFocus?.nonce])

  const handleSelect = (c: Combatant) => {
    setFocusUnitId(null)   // tapping a chip ends roster-focus follow
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
  const alive = battle.combatants.filter((c) => c.alive)
  const cols = battle.cols ?? COLS
  const rows = battle.rows ?? ROWS
  const isOpen = battle.mode === 'open'
  // Open-world camera: auto-fits the party until the player pinches / uses the
  // zoom buttons (manualZoom), then holds their chosen size. Always centred on
  // the party.
  const [camSize, setCamSize] = useState(OPEN_CAM_SIZE)
  const [manualZoom, setManualZoom] = useState(false)
  const party = battle.combatants.filter((c) => c.team === 'player' && c.alive)
  const partyPts = party.map((c) => c.pos)
  const allPts = (alive.length ? alive : battle.combatants).map((c) => c.pos)
  // If a roster unit was double-tapped (focusUnitId) and it's alive on this
  // field, frame just that unit; otherwise follow the whole party.
  const focusUnit = focusUnitId ? battle.combatants.find((c) => c.id === focusUnitId && c.alive) : null
  const followPts = focusUnit ? [focusUnit.pos] : (partyPts.length ? partyPts : allPts)
  const effSize = manualZoom ? camSize : autoFitSize(focusUnit ? [focusUnit.pos] : partyPts, cols, rows)
  // Open-world follows the party; an encounter statically frames its whole arena.
  const cam = isOpen
    ? followCamera(followPts, cols, rows, effSize)
    : arenaCamera(cols, rows)

  // Party members outside the current viewport → edge bubbles point to them.
  const offscreen = isOpen ? party.filter((c) => !isOnScreen(cam, c.pos)) : []

  const roundEvents = battle.events.filter((e) => e.round === battle.round)
  const hits  = roundEvents.filter((e) => (e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use') && e.value != null)
  const heals = roundEvents.filter((e) => e.type === 'heal' && e.value != null)
  const dots  = roundEvents.filter((e) => e.type === 'dot' && e.value != null)
  const interrupts = roundEvents.filter((e) => e.type === 'interrupt')
  const tacticUses = roundEvents.filter((e) => e.type === 'tactic_use')

  // Active (non-expired) cast labels, grouped by caster and ordered oldest →
  // newest so the newest renders on top (the stack uses flex-col-reverse).
  const nowMs = Date.now()
  const castLabelGroups = (() => {
    const bySource = new Map<string, typeof castLabels>()
    for (const l of castLabels) {
      if (nowMs - l.born >= CAST_LABEL_MS) continue
      const arr = bySource.get(l.sourceId) ?? []
      arr.push(l); bySource.set(l.sourceId, arr)
    }
    return [...bySource.entries()].map(([sourceId, labels]) => ({
      sourceId,
      labels: labels.sort((a, b) => a.seq - b.seq),
    }))
  })()
  // Open-world reinforcements / returnees entering a live battle this round.
  const spawns = roundEvents.filter((e) => e.type === 'spawn')
  // §aggression feedback: a monster turned hostile (hit/called) → "!" flash; a
  // Pack Tactics call → a ring pulsing out from the caller.
  const aggros  = roundEvents.filter((e) => e.type === 'aggro')
  const rallies = roundEvents.filter((e) => e.type === 'rally')

  const playersAlive = battle.combatants.filter((c) => c.team === 'player' && c.alive).length
  const enemiesAlive = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length

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
    <div className="relative flex-1 min-h-0 flex flex-col">
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
          <div className="absolute top-1.5 left-1.5 z-20 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-emerald-600/50 bg-emerald-950/70 text-emerald-200 backdrop-blur-sm pointer-events-none">
            ⟳ Open world · persistent
          </div>
          {/* Zoom: pinch the arena, or use these (squeeze to resize the camera).
              ⊙ recentres / re-enables auto-fit on the party. */}
          <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1">
            <button
              onClick={() => zoomBy(1 / 0.8)}
              aria-label="Zoom out"
              className="w-6 h-6 flex items-center justify-center rounded-md border border-game-border bg-game-surface/90 text-game-text text-sm leading-none backdrop-blur-sm hover:bg-white/5"
            >−</button>
            <button
              onClick={() => { setManualZoom(false); setFocusUnitId(null) }}
              aria-label="Auto-fit the party"
              title="Auto-fit the party"
              className={`px-1.5 h-6 flex items-center rounded-md border text-[10px] tabular-nums backdrop-blur-sm ${(manualZoom || focusUnit) ? 'border-game-border bg-game-surface/90 text-game-text-dim hover:bg-white/5' : 'border-emerald-600/60 bg-emerald-950/70 text-emerald-200'}`}
            >
              {focusUnit ? '◎' : manualZoom ? `${Math.round(cam.size)}c` : 'auto'}
            </button>
            <button
              onClick={() => zoomBy(0.8)}
              aria-label="Zoom in"
              className="w-6 h-6 flex items-center justify-center rounded-md border border-game-border bg-game-surface/90 text-game-text text-sm leading-none backdrop-blur-sm hover:bg-white/5"
            >+</button>
          </div>
        </>
      )}
      <div className="flex-1 min-h-0 flex justify-center items-start">
        <Arena
          cam={cam}
          barriers={battle.barriers}
          centerY={rows / 2}
          zoom={isOpen ? { size: cam.size, min: OPEN_CAM_MIN_SIZE, max: maxSize, set: (n) => { setManualZoom(true); setCamSize(n) } } : undefined}
          overlay={offscreen.map((c) => <EdgeMarker key={c.id} c={c} cam={cam} />)}
        >
          {/* persistent ground hazards (Lightning Storm, etc.) */}
          {battle.zones.map((z) => (
            <div
              key={z.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/25 border border-orange-400/50 animate-pulse pointer-events-none"
              style={{ left: px(cam, z.pos.x), top: py(cam, z.pos.y), width: `${(2 * z.radius / cam.size) * 100}%`, height: `${(2 * z.radius / cam.size) * 100}%` }}
            />
          ))}

          {/* firewalls: a bar of flame along the wall's tangent (perpendicular to
              its normal). Screen-space flips y, so the bar angle is atan2(nx, ny). */}
          {battle.firewalls.map((w) => (
            <div
              key={w.id}
              className="absolute rounded-sm bg-gradient-to-b from-amber-300/70 via-orange-500/60 to-red-600/50 border border-amber-300/70 shadow-[0_0_10px_2px_rgba(251,146,60,0.6)] animate-pulse pointer-events-none"
              style={{
                left: px(cam, w.pos.x),
                top: py(cam, w.pos.y),
                width: `${(2 * w.half / cam.size) * 100}%`,
                height: `${(0.5 / cam.size) * 100}%`,
                transform: `translate(-50%,-50%) rotate(${Math.atan2(w.normal.x, w.normal.y) * 180 / Math.PI}deg)`,
              }}
            />
          ))}

          {/* attack arc lines for this round */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`${cam.x} ${rows - cam.y - cam.size} ${cam.size} ${cam.size}`} preserveAspectRatio="none">
            {hits.map((e, i) => {
              const src = byId(e.sourceId), tgt = byId(e.targetId)
              if (!src || !tgt) return null
              const stroke = src.team === 'player' ? 'rgb(96,165,250)' : 'rgb(248,113,113)'
              return <line key={`l-${battle.round}-${i}`} className="animate-line-fade" x1={insetX(cam, src.pos.x)} y1={rows - insetY(cam, src.pos.y)} x2={insetX(cam, tgt.pos.x)} y2={rows - insetY(cam, tgt.pos.y)} stroke={stroke} strokeWidth={cam.size * 0.012} strokeLinecap="round" />
            })}
          </svg>

          {/* hit flashes + floating numbers */}
          {hits.map((e, i) => {
            const tgt = byId(e.targetId)
            if (!tgt) return null
            return (
              <div key={`h-${battle.round}-${i}`}>
                <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 animate-hit-flash" style={{ ...chipDims(cam), left: px(cam, insetX(cam, tgt.pos.x)), top: py(cam, insetY(cam, tgt.pos.y)) }} />
                <Float k={`d-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[15px] text-red-300" text={`-${e.value}`} />
              </div>
            )
          })}
          {heals.map((e, i) => {
            const tgt = byId(e.targetId)
            return tgt && e.value ? <Float key={`hl-${battle.round}-${i}`} k={`hl-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[15px] text-emerald-300" text={`+${e.value}`} /> : null
          })}
          {dots.map((e, i) => {
            const tgt = byId(e.targetId)
            return tgt ? <Float key={`dt-${battle.round}-${i}`} k={`dt-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[13px] text-fuchsia-300" text={`-${e.value}`} /> : null
          })}
          {interrupts.map((e, i) => {
            const tgt = byId(e.targetId)
            return tgt ? <Float key={`in-${battle.round}-${i}`} k={`in-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[10px] text-amber-300" text="interrupted" /> : null
          })}

          {/* lingering cast labels: each cast's name stays anchored to its
              caster for ~3s; multiple casts on one caster stack, newest on top. */}
          {castLabelGroups.map(({ sourceId, labels }) => {
            const src = byId(sourceId)
            if (!src || !isOnScreen(cam, src.pos)) return null
            return (
              <div
                key={`cl-${sourceId}`}
                className="absolute -translate-x-1/2 flex flex-col-reverse items-center gap-0.5 pointer-events-none"
                style={{ left: px(cam, insetX(cam, src.pos.x)), top: py(cam, insetY(cam, src.pos.y)), transform: 'translate(-50%, -150%)' }}
              >
                {labels.map((l) => (
                  <span key={l.id} className="px-1 rounded bg-black/45 text-amber-200 text-[10px] font-semibold leading-tight whitespace-nowrap drop-shadow animate-cast-label">
                    ✦ {skillName(l.skillId)}
                  </span>
                ))}
              </div>
            )
          })}
          {tacticUses.map((e, i) => {
            const src = byId(e.sourceId)
            const label = (e.extra?.label as string | undefined)
            if (!src || !label) return null
            return <Float key={`tu-${battle.round}-${i}`} k={`tu-${battle.round}-${i}`} cam={cam} pos={src.pos} className="text-[10px] text-violet-200" text={label} />
          })}

          {/* spawn markers: a ring + name float where a combatant just entered */}
          {spawns.map((e, i) => {
            const c = byId(e.sourceId)
            const pos = e.position ?? c?.pos
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
            const pos = e.position ?? byId(e.sourceId)?.pos
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
            const pos = e.position ?? byId(e.sourceId)?.pos
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

          {/* Tokens. Open-world clips off-screen units (off-screen heroes show as
              EdgeMarkers instead); encounters render everyone (nothing is ever
              truly off the small arena). */}
          {(isOpen ? battle.combatants.filter((c) => isOnScreen(cam, c.pos)) : battle.combatants).map((c) => (
            <BattleChip
              key={c.id}
              c={c}
              cam={cam}
              selected={sameWave && c.id === selectedId}
              onSelect={() => handleSelect(c)}
              glyph={chipGlyph(c, classFor)}
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

      <Legend players={playersAlive} enemies={enemiesAlive} />
      {selected && <UnitDetailOverlay c={selected} battle={battle} onClose={closeDetail} />}
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

export function BattleView({ locationId }: { locationId: string | null }) {
  const battle    = useGameStore((s) => (locationId ? s.battles[locationId] : undefined))
  const locations = useGameStore((s) => s.locations)
  const location  = locationId ? (locations.find((l) => l.id === locationId) ?? null) : null

  return battle ? <LiveBattle battle={battle} /> : <Preview location={location} />
}
