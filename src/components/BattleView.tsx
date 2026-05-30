import { useState, useEffect, useRef } from 'react'
import { useGameStore, waveComposition, locationBarriers, type Location } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import {
  COLS, ROWS, startingPosition, COMBAT_SKILLS,
  type Rank, type Vec2, type Barrier, type BattleState, type Combatant,
} from '@/engine'

// Battle rendering for the Map tab's "drop-in" view. The arena fills the space
// it's given (square, centred) so the battle is showcased; the selected-unit
// detail surfaces as a dismissable bottom-sheet overlay so it never steals
// arena height. Combat resolves in the engine, stepped one round per N ticks in
// the store — this is purely the viewer.

const skillName = (id: string) => COMBAT_SKILLS[id]?.(1)?.name ?? 'Casting'
const CENTER_Y = ROWS / 2

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
// Sits at a slightly-zoomed-in default the whole fight. It only zooms out when
// the alive units genuinely won't fit. No zoom-in: auto-zoom on tight clusters
// snapped the camera on the last kill, reading as survivors "teleporting".

const DEFAULT_CAM_SIZE = 13   // world units shown by default
const FULL_CAM_SIZE    = COLS // whole arena (zoom-out cap)
const SPREAD_EXTENT    = 12   // bbox extent above this → zoom out to fit everyone
const OPEN_CAM_SIZE     = 15  // open-world: default cells shown (pinch to resize)
const OPEN_CAM_MIN_SIZE = 8   // most zoomed-in
const OPEN_CAM_MAX_SIZE = 60  // most zoomed-out (still less than the whole map)

interface Cam { x: number; y: number; size: number }

function defaultCamera(): Cam {
  return { x: (COLS - DEFAULT_CAM_SIZE) / 2, y: (ROWS - DEFAULT_CAM_SIZE) / 2, size: DEFAULT_CAM_SIZE }
}

// Open-world: a fixed-size window that follows the centroid of the given points
// (alive combatants), clamped so it never shows past the map edges. The whole
// 100×100 field can't fit at once — the player pans to look around.
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

function computeCamera(pts: Vec2[]): Cam {
  if (pts.length === 0) return defaultCamera()
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const extent = Math.max(maxX - minX, maxY - minY)
  if (extent <= SPREAD_EXTENT) return defaultCamera()
  return { x: 0, y: 0, size: FULL_CAM_SIZE }   // very spread: show everything
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
      style={{ touchAction: 'none' }}
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

const CHIP_SIZE = 'w-10 h-10'        // 40px circle
const CHIP_FLOAT_W = 'w-14'          // floating name/HP plate above the chip

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

// Floating label: enemies (top) get name/HP/cast BELOW the circle; players
// (bottom) keep it above. Either way it points toward the arena centre.
function FloatingLabel({ c, isPlayer, casting }: { c: Combatant; isPlayer: boolean; casting: boolean }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
  const side = isPlayer
    ? (casting ? '-top-7' : '-top-5')
    : 'top-full mt-1'
  return (
    <div className={`absolute ${side} left-1/2 -translate-x-1/2 ${CHIP_FLOAT_W} flex flex-col items-center gap-0.5 pointer-events-none`}>
      <span className={`text-[9px] font-semibold leading-none whitespace-nowrap drop-shadow ${isPlayer ? 'text-blue-100/85' : 'text-red-100/85'}`}>
        {shortName(c.name)}
      </span>
      <div className="w-full h-1 rounded-sm bg-black/50 overflow-hidden">
        <div className={`h-full ${hpColor(ratio)} opacity-90`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
      </div>
      {casting && (
        <span className="text-[8px] leading-none whitespace-nowrap text-amber-200/90 drop-shadow animate-pulse">
          ✦ {skillName(c.channel!.skillId)}
        </span>
      )}
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
      <div
        title={casting ? `${c.name} — casting ${skillName(c.channel!.skillId)}` : `${c.name} — ${Math.ceil(c.hp)}/${c.maxHp}`}
        className={[
          CHIP_SIZE,
          'rounded-full border-2 shadow-md flex items-center justify-center text-[15px] font-bold leading-none select-none transition-opacity',
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

// A plain-text dump of a unit's current decision state + last 15 turns, for
// pasting into a bug report. Mirrors what the Debug tab shows.
function buildDebugText(c: Combatant, battle: BattleState): string {
  const plan = battle.plans[c.team]
  const wp = plan?.waypoint
  const L: string[] = []
  L.push(`# ${c.name} (${c.team}${c.alive ? '' : ' · KO'}) — battle round ${battle.round}`)
  L.push(`hp ${Math.ceil(c.hp)}/${c.maxHp}  pos (${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)})  vision ${c.visionRange === Infinity ? '∞' : c.visionRange}`)
  L.push(`lock: ${nameInBattle(battle, c.lockedTargetId)}  team-focus: ${nameInBattle(battle, plan?.focusTargetId)}  waypoint: ${wp ? `(${wp.x.toFixed(0)},${wp.y.toFixed(0)})` : '—'}`)
  L.push(`tactics: ${c.tactics.map((t) => `${t.def.channel}:${t.def.name}`).join(', ') || '(none)'}`)
  if (c.statuses.length) L.push(`statuses: ${c.statuses.map((s) => `${s.name}(${s.duration})`).join(', ')}`)
  if (c.channel) L.push(`channeling: ${c.channel.skillId} (${c.channel.roundsLeft} left)`)
  L.push(`-- last ${Math.min(15, c.trace.length)} turns (newest first) --`)
  for (const e of c.trace.slice().reverse().slice(0, 15)) L.push(`R${e.round}: ${e.text}`)
  return L.join('\n')
}

function StatsTab({ c }: { c: Combatant }) {
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
              return (
                <div key={s.id} className="flex items-center gap-2 text-[10px]">
                  <div className="flex-1 truncate">{s.name}</div>
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
      {c.statuses.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.statuses.map((s, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-game-bg border border-game-border text-[10px]">
              {s.name} <span className="text-game-text-dim tabular-nums">({s.duration})</span>
            </span>
          ))}
        </div>
      )}
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
function DebugTab({ c, battle }: { c: Combatant; battle: BattleState }) {
  const plan = battle.plans[c.team]
  const wp = plan?.waypoint
  const lockName = nameInBattle(battle, c.lockedTargetId)
  const focusName = nameInBattle(battle, plan?.focusTargetId)
  const divergent = c.lockedTargetId && plan?.focusTargetId && c.lockedTargetId !== plan.focusTargetId

  // Group tactics by channel to surface competing priorities (1st wins).
  const channels = new Map<string, typeof c.tactics>()
  for (const t of c.tactics) {
    const arr = channels.get(t.def.channel) ?? []
    arr.push(t); channels.set(t.def.channel, arr)
  }
  const recent = c.trace.slice().reverse().slice(0, 15)

  return (
    <div className="mt-2 space-y-2 text-[10px]">
      {/* Blackboard */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">Blackboard · {c.team}</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-game-text-dim">
          <div>round <span className="text-game-text tabular-nums">{battle.round}</span></div>
          <div>pos <span className="text-game-text tabular-nums">({c.pos.x.toFixed(1)},{c.pos.y.toFixed(1)})</span></div>
          <div>lock <span className={c.lockedTargetId ? 'text-game-text' : 'text-game-muted'}>{lockName}</span></div>
          <div>team-focus <span className={plan?.focusTargetId ? 'text-game-text' : 'text-game-muted'}>{focusName}</span></div>
          <div className="col-span-2">waypoint <span className="text-game-text tabular-nums">{wp ? `(${wp.x.toFixed(0)},${wp.y.toFixed(0)})` : '—'}</span></div>
        </div>
        {divergent && <div className="mt-1 text-amber-300">⚠ this unit's lock ≠ team focus</div>}
      </div>

      {/* Tactic resolution */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">Tactics (priority order)</div>
        {channels.size === 0 && <div className="text-game-muted">no tactics equipped</div>}
        {[...channels.entries()].map(([ch, list]) => (
          <div key={ch} className="flex items-start gap-1.5 leading-tight">
            <span className={`shrink-0 w-16 ${list.length > 1 ? 'text-amber-300' : 'text-game-text-dim'}`}>{ch}{list.length > 1 ? ' ⚠' : ''}</span>
            <span className="flex-1">
              {list.map((t, i) => (
                <span key={t.def.id} className={i === 0 ? 'text-game-text' : 'text-game-muted line-through'}>
                  {i > 0 && ' › '}{t.def.name}<span className="text-game-muted">·r{t.rank}</span>
                </span>
              ))}
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

        {tab === 'stats' ? <StatsTab c={c} /> : <DebugTab c={c} battle={battle} />}
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
  const classFor = (id: string) => units.find((u) => u.id === id)?.class ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const byId = (id?: string) => (id ? battle.combatants.find((c) => c.id === id) : undefined)
  // Frozen-able snapshot of the selected combatant — refreshed each round while
  // we're in the same wave (same combatants array reference). When a new wave
  // starts the snapshot freezes, so a respawned same-id monster isn't confused
  // for the entity the player just killed. Cleared by re-tapping / re-selecting.
  const [snapshot, setSnapshot] = useState<Combatant | null>(null)
  const snapshotWaveRef = useRef<Combatant[] | null>(null)

  useEffect(() => {
    if (!selectedId) return
    if (snapshotWaveRef.current !== battle.combatants) return   // frozen
    const live = battle.combatants.find((c) => c.id === selectedId)
    if (live) setSnapshot(live)
  }, [battle, selectedId])

  const handleSelect = (c: Combatant) => {
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
  const effSize = manualZoom ? camSize : autoFitSize(partyPts, cols, rows)
  // Encounter: hold the default camera once decided — otherwise the bbox
  // collapses around the survivors and the auto-zoom snaps, reading as the
  // winners teleporting.
  const cam = isOpen
    ? followCamera(partyPts.length ? partyPts : allPts, cols, rows, effSize)
    : battle.outcome !== 'ongoing'
      ? defaultCamera()
      : computeCamera(allPts)

  // Party members outside the current viewport → edge bubbles point to them.
  const offscreen = isOpen ? party.filter((c) => !isOnScreen(cam, c.pos)) : []

  const roundEvents = battle.events.filter((e) => e.round === battle.round)
  const hits  = roundEvents.filter((e) => (e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use') && e.value != null)
  const heals = roundEvents.filter((e) => e.type === 'heal' && e.value != null)
  const dots  = roundEvents.filter((e) => e.type === 'dot' && e.value != null)
  const interrupts = roundEvents.filter((e) => e.type === 'interrupt')
  const seenSkills = new Set<string>()
  const skillLabels = roundEvents.filter((e) => {
    if (e.type !== 'skill_use' || !e.skillId) return false
    const k = `${e.sourceId}:${e.skillId}`
    if (seenSkills.has(k)) return false
    seenSkills.add(k); return true
  })
  const castStarts = roundEvents.filter((e) => e.type === 'cast_start')
  const tacticUses = roundEvents.filter((e) => e.type === 'tactic_use')
  // Open-world reinforcements / returnees entering a live battle this round.
  const spawns = roundEvents.filter((e) => e.type === 'spawn')

  const playersAlive = battle.combatants.filter((c) => c.team === 'player' && c.alive).length
  const enemiesAlive = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length

  const maxSize = Math.min(OPEN_CAM_MAX_SIZE, cols, rows)
  const zoomBy = (factor: number) => {
    setManualZoom(true)
    setCamSize(Math.max(OPEN_CAM_MIN_SIZE, Math.min(maxSize, cam.size * factor)))
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
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
              onClick={() => setManualZoom(false)}
              aria-label="Auto-fit the party"
              title="Auto-fit the party"
              className={`px-1.5 h-6 flex items-center rounded-md border text-[10px] tabular-nums backdrop-blur-sm ${manualZoom ? 'border-game-border bg-game-surface/90 text-game-text-dim hover:bg-white/5' : 'border-emerald-600/60 bg-emerald-950/70 text-emerald-200'}`}
            >
              {manualZoom ? `${Math.round(cam.size)}c` : 'auto'}
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
          {/* persistent ground hazards (Firewall, etc.) */}
          {battle.zones.map((z) => (
            <div
              key={z.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/25 border border-orange-400/50 animate-pulse pointer-events-none"
              style={{ left: px(cam, z.pos.x), top: py(cam, z.pos.y), width: `${(2 * z.radius / cam.size) * 100}%`, height: `${(2 * z.radius / cam.size) * 100}%` }}
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
                <div className={`absolute ${CHIP_SIZE} -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 animate-hit-flash`} style={{ left: px(cam, insetX(cam, tgt.pos.x)), top: py(cam, insetY(cam, tgt.pos.y)) }} />
                <Float k={`d-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[12px] text-red-300" text={`-${e.value}`} />
              </div>
            )
          })}
          {heals.map((e, i) => {
            const tgt = byId(e.targetId)
            return tgt && e.value ? <Float key={`hl-${battle.round}-${i}`} k={`hl-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[12px] text-emerald-300" text={`+${e.value}`} /> : null
          })}
          {dots.map((e, i) => {
            const tgt = byId(e.targetId)
            return tgt ? <Float key={`dt-${battle.round}-${i}`} k={`dt-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[11px] text-fuchsia-300" text={`-${e.value}`} /> : null
          })}
          {interrupts.map((e, i) => {
            const tgt = byId(e.targetId)
            return tgt ? <Float key={`in-${battle.round}-${i}`} k={`in-${battle.round}-${i}`} cam={cam} pos={tgt.pos} className="text-[10px] text-amber-300" text="interrupted" /> : null
          })}

          {/* source-anchored ability labels */}
          {castStarts.map((e, i) => {
            const src = byId(e.sourceId)
            if (!src || !e.skillId) return null
            return <Float key={`cs-${battle.round}-${i}`} k={`cs-${battle.round}-${i}`} cam={cam} pos={src.pos} className="text-[10px] text-amber-200" text={`✦ ${skillName(e.skillId)}`} />
          })}
          {skillLabels.map((e, i) => {
            const src = byId(e.sourceId)
            if (!src || !e.skillId) return null
            return <Float key={`sl-${battle.round}-${i}`} k={`sl-${battle.round}-${i}`} cam={cam} pos={src.pos} className="text-[10px] text-sky-200" text={skillName(e.skillId)} />
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
  const labelSide = isPlayer ? '-top-5' : 'top-full mt-1'
  return (
    <div title={title} style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }} className="absolute -translate-x-1/2 -translate-y-1/2">
      <div className={`absolute ${labelSide} left-1/2 -translate-x-1/2 ${CHIP_FLOAT_W} flex flex-col items-center gap-0.5 pointer-events-none`}>
        <span className={`text-[9px] font-semibold leading-none whitespace-nowrap drop-shadow ${isPlayer ? 'text-blue-100/85' : 'text-red-100/85'}`}>
          {shortName(name)}
        </span>
        <div className="w-full h-1 rounded-sm bg-black/50 overflow-hidden">
          <div className="h-full bg-emerald-500/90" />
        </div>
      </div>
      <div className={[
        CHIP_SIZE,
        'rounded-full border-2 shadow-md flex items-center justify-center text-[15px] font-bold leading-none select-none',
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
  const cam = computeCamera([...enemyChips, ...partyChips].map((c) => c.pos))

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
