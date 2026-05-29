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

interface Cam { x: number; y: number; size: number }

function defaultCamera(): Cam {
  return { x: (COLS - DEFAULT_CAM_SIZE) / 2, y: (ROWS - DEFAULT_CAM_SIZE) / 2, size: DEFAULT_CAM_SIZE }
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

// Half a token in world units — clamp the rendered center inward so the card's
// body never clips the arena edge even when a unit is pinned to it.
const TOKEN_INSET = 0.7
const insetX = (cam: Cam, x: number) => Math.max(cam.x + TOKEN_INSET, Math.min(cam.x + cam.size - TOKEN_INSET, x))
const insetY = (cam: Cam, y: number) => Math.max(cam.y + TOKEN_INSET, Math.min(cam.y + cam.size - TOKEN_INSET, y))

// Pan-aware arena. Owns a pixel-drag pan applied as a CSS transform on the inner
// world layer; chips/barriers/lines move with the wrapper instantly so the
// drag tracks the finger. Sizes itself to a square that fits the space it's
// given (`grid place-items-center` parent), so it grows on the drop-in view.
function Arena({ cam, barriers, children }: { cam: Cam; barriers: Barrier[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; basePan: Vec2; moved: boolean; pointerId: number; target: Element } | null>(null)
  const suppressClickRef = useRef(false)
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })

  const cell = `${100 / cam.size}%`
  const centerTop = Math.max(0, Math.min(100, (1 - (CENTER_Y - cam.y) / cam.size) * 100))

  const onPointerDown = (e: React.PointerEvent) => {
    suppressClickRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, basePan: pan, moved: false, pointerId: e.pointerId, target: e.currentTarget }
  }
  const onPointerMove = (e: React.PointerEvent) => {
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
  const onPointerUp = () => {
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
      className="relative h-full max-h-full max-w-full aspect-square rounded-lg border border-game-border bg-game-surface overflow-hidden select-none"
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

function Float({ cam, pos, className, text, k }: { cam: Cam; pos: Vec2; className: string; text: string; k: string }) {
  return (
    <div key={k} className={`absolute -translate-x-1/2 -translate-y-1/2 font-bold drop-shadow animate-dmg-float whitespace-nowrap ${className}`} style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }}>
      {text}
    </div>
  )
}

// Selected-unit detail as a dismissable bottom-sheet overlay. Floats over the
// arena so the board keeps its full height regardless of screen size.
function UnitDetailOverlay({ c, onClose }: { c: Combatant; onClose: () => void }) {
  const isPlayer = c.team === 'player'
  const ratio = Math.max(0, c.hp / c.maxHp)
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
        <div className="mt-1.5 flex items-center gap-2">
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
  // Hold the default camera once decided — otherwise the bbox collapses around
  // the survivors and the auto-zoom snaps, reading as the winners teleporting.
  const cam = battle.outcome !== 'ongoing'
    ? defaultCamera()
    : computeCamera((alive.length ? alive : battle.combatants).map((c) => c.pos))

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

  const playersAlive = battle.combatants.filter((c) => c.team === 'player' && c.alive).length
  const enemiesAlive = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 grid place-items-center p-2">
        <Arena cam={cam} barriers={battle.barriers}>
          {/* persistent ground hazards (Firewall, etc.) */}
          {battle.zones.map((z) => (
            <div
              key={z.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/25 border border-orange-400/50 animate-pulse pointer-events-none"
              style={{ left: px(cam, z.pos.x), top: py(cam, z.pos.y), width: `${(2 * z.radius / cam.size) * 100}%`, height: `${(2 * z.radius / cam.size) * 100}%` }}
            />
          ))}

          {/* attack arc lines for this round */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`${cam.x} ${ROWS - cam.y - cam.size} ${cam.size} ${cam.size}`} preserveAspectRatio="none">
            {hits.map((e, i) => {
              const src = byId(e.sourceId), tgt = byId(e.targetId)
              if (!src || !tgt) return null
              const stroke = src.team === 'player' ? 'rgb(96,165,250)' : 'rgb(248,113,113)'
              return <line key={`l-${battle.round}-${i}`} className="animate-line-fade" x1={insetX(cam, src.pos.x)} y1={ROWS - insetY(cam, src.pos.y)} x2={insetX(cam, tgt.pos.x)} y2={ROWS - insetY(cam, tgt.pos.y)} stroke={stroke} strokeWidth={cam.size * 0.012} strokeLinecap="round" />
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

          {battle.combatants.map((c) => (
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
      {selected && <UnitDetailOverlay c={selected} onClose={closeDetail} />}
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
      <div className="flex-1 min-h-0 grid place-items-center p-2">
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
