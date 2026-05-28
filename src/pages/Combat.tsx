import { useState, useEffect, useRef } from 'react'
import { useGameStore, waveComposition, locationBarriers } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { RosterCarousel } from '@/pages/Map'
import {
  COLS, ROWS, startingPosition, COMBAT_SKILLS,
  type Rank, type Vec2, type Barrier, type BattleState, type Combatant,
} from '@/engine'

const skillName = (id: string) => COMBAT_SKILLS[id]?.(1)?.name ?? 'Casting'
const CENTER_Y = ROWS / 2

// Combat resolves on a large 30×30 grid via the Combat Tactic Engine, stepped one
// round per N ticks in the store. A camera frames all combatants (bounding box +
// padding) and follows them as they spread out and converge, so the action stays
// readable on a field far bigger than the units.

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
// Sits at a slightly-zoomed-in default the whole fight. The only time it
// budges is when the alive units genuinely won't fit in that window — then
// we zoom out to the whole arena so nobody leaves the frame. No zoom-in:
// auto-zoom on tight clusters caused the camera to snap on the last kill,
// which looked like the surviving heroes "teleporting" toward the corpse.

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

// Half a token in world units — clamp the rendered center inward by this much so
// the card's body never clips the arena edge even when a unit is pinned to it.
// Floating bars are flipped toward the arena center (bar-below for enemies,
// bar-above for players) so they don't get pushed off either edge.
const TOKEN_INSET = 0.7
const insetX = (cam: Cam, x: number) => Math.max(cam.x + TOKEN_INSET, Math.min(cam.x + cam.size - TOKEN_INSET, x))
const insetY = (cam: Cam, y: number) => Math.max(cam.y + TOKEN_INSET, Math.min(cam.y + cam.size - TOKEN_INSET, y))

// Pan-aware arena. Owns a pixel-drag pan; converts it to a world-coords offset
// and exposes the resulting effective camera to children via a render prop, so
// chip / attack-line positioning sees the same panned view as terrain & tints.
function Arena({ baseCam, barriers, children }: { baseCam: Cam; barriers: Barrier[]; children: (cam: Cam) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; basePan: Vec2; moved: boolean; pointerId: number; target: Element } | null>(null)
  const suppressClickRef = useRef(false)
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })

  const cam: Cam = { x: baseCam.x + pan.x, y: baseCam.y + pan.y, size: baseCam.size }
  const cell = `${100 / cam.size}%`
  const centerTop = Math.max(0, Math.min(100, (1 - (CENTER_Y - cam.y) / cam.size) * 100))

  const onPointerDown = (e: React.PointerEvent) => {
    suppressClickRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, basePan: pan, moved: false, pointerId: e.pointerId, target: e.currentTarget }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !ref.current) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true
      try { d.target.setPointerCapture(d.pointerId) } catch { /* noop in tests */ }
    }
    if (d.moved) {
      const rect = ref.current.getBoundingClientRect()
      // drag-right → see what's to the west: cam.x decreases (so pan.x is -dx in world).
      // drag-down  → see what's to the north: cam.y increases (so pan.y is +dy in world,
      // because py is screen-down = world-up).
      const sx = baseCam.size / Math.max(1, rect.width)
      const sy = baseCam.size / Math.max(1, rect.height)
      setPan({ x: d.basePan.x - dx * sx, y: d.basePan.y + dy * sy })
    }
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
      className="relative w-full max-w-[380px] mx-auto aspect-square rounded-lg border border-game-border bg-game-surface overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
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
      {/* terrain: walls are solid (block movement + sight), cliffs are translucent
          and dashed (block movement only — ranged attacks fire over them) */}
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
      {children(cam)}
    </div>
  )
}

// ── Live battle ────────────────────────────────────────────────────────────────

// Chip = circle (icon inside) with name + HP bar floating above. Smaller
// footprint than the old card so the field reads as units on a board rather
// than name-tags drifting around.
const CHIP_SIZE = 'w-10 h-10'        // 40px circle
const CHIP_FLOAT_W = 'w-14'          // floating name/HP plate above the chip

// Class-specific glyphs for player heroes. Class-less units (Novices, test
// fixtures) and monsters fall back to initials inside the circle.
const CLASS_ICON: Record<string, string> = {
  Fighter: '⚔',
  Ranger:  '🏹',
  Mage:    '✦',
  Cleric:  '✚',
  Rogue:   '🗡',
}

// First name (or short label) for the chip header. Falls back to initials for
// single-word monster names where the first word is the whole thing.
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

// Floating label position: enemies (top of arena) get their name/HP/cast line
// BELOW the circle so it stays inside the arena even when the chip is jammed
// against the top edge. Players (bottom of arena) keep it above. Either way the
// label always points toward the arena's centre, where there's room.
function FloatingLabel({ c, isPlayer, casting }: { c: Combatant; isPlayer: boolean; casting: boolean }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
  const side = isPlayer
    ? (casting ? '-top-7' : '-top-5')           // sits ABOVE the circle
    : (casting ? 'top-full mt-1' : 'top-full mt-1') // sits BELOW the circle
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

function UnitDetailCard({ c }: { c: Combatant }) {
  const isPlayer = c.team === 'player'
  const ratio = Math.max(0, c.hp / c.maxHp)
  return (
    <div className="max-w-md mx-auto w-full rounded-md border border-game-border bg-game-surface p-3 mt-3 text-xs">
      <div className="flex items-center justify-between">
        <div className={`font-semibold text-sm ${isPlayer ? 'text-blue-200' : 'text-red-200'}`}>{c.name}</div>
        <div className="text-[10px] text-game-text-dim uppercase tracking-wide">{c.team}{c.alive ? '' : ' · KO'}</div>
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
  )
}

function LiveBattle({ name, battle }: { name: string; battle: BattleState }) {
  const units = useGameStore((s) => s.units)
  const classFor = (id: string) => units.find((u) => u.id === id)?.class ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const byId = (id?: string) => (id ? battle.combatants.find((c) => c.id === id) : undefined)
  // Frozen-able snapshot of the selected combatant. We refresh it from live
  // each round AS LONG AS we're in the same wave (same combatants array
  // reference). When a new wave starts, the snapshot freezes — even if the
  // new wave has a same-id monster (slime#0 → slime#0), we keep showing the
  // dead one so the player doesn't confuse a respawned same-id slot for the
  // entity they just killed. Cleared by tapping the unit again or selecting
  // a different combatant.
  const [snapshot, setSnapshot] = useState<Combatant | null>(null)
  const snapshotWaveRef = useRef<Combatant[] | null>(null)

  // Round-by-round snapshot refresh. Same-wave only — once `battle.combatants`
  // gets a fresh reference (new wave), this no-ops and the snapshot is what
  // the unit looked like at the moment the previous wave ended.
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
      // Capture snapshot + wave synchronously so the detail card shows
      // immediately on tap, without waiting a tick for the effect to fire.
      setSelectedId(c.id)
      setSnapshot(c)
      snapshotWaveRef.current = battle.combatants
    }
  }

  // Same wave as when we picked? Drives both the chip highlight and whether
  // the detail card reads live vs the frozen snapshot.
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
  // Hold the default camera once the fight is decided — otherwise the bbox
  // collapses around the surviving team and the auto-zoom snaps, which reads
  // as the winners "teleporting" toward the corpse.
  const baseCam = battle.outcome !== 'ongoing'
    ? defaultCamera()
    : computeCamera((alive.length ? alive : battle.combatants).map((c) => c.pos))

  const roundEvents = battle.events.filter((e) => e.round === battle.round)
  const hits  = roundEvents.filter((e) => (e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use') && e.value != null)
  const heals = roundEvents.filter((e) => e.type === 'heal' && e.value != null)
  const dots  = roundEvents.filter((e) => e.type === 'dot' && e.value != null)
  const interrupts = roundEvents.filter((e) => e.type === 'interrupt')
  // Source-anchored labels: spell starts, skill resolutions, and non-skill
  // tactic fires (Counter, Shield Wall…). Dedupe skill_use per (source,
  // skill) so AoE multi-target casts surface a single label instead of N.
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
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-game-text">Combat</h1>
        <p className="text-xs text-game-text-dim mt-0.5">{name} · round {battle.round}</p>
      </div>

      <Arena baseCam={baseCam} barriers={battle.barriers}>
        {(cam) => <>
          {/* persistent ground hazards (Firewall, etc.) */}
          {battle.zones.map((z) => (
            <div
              key={z.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/25 border border-orange-400/50 animate-pulse pointer-events-none"
              style={{ left: px(cam, z.pos.x), top: py(cam, z.pos.y), width: `${(2 * z.radius / cam.size) * 100}%`, height: `${(2 * z.radius / cam.size) * 100}%` }}
            />
          ))}

          {/* attack arc lines for this round — endpoints use the same inset as
              the chips so the line runs token-center to token-center even when
              a combatant is pinned against the arena edge. */}
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

          {/* source-anchored ability labels: spell cast starts, skill resolutions,
              non-skill tactics (Counter, Shield Wall…). Floats above the caster
              so the player can read what each unit just did. */}
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
              // Only highlight in the wave the selection was made on — otherwise
              // a new-wave same-id monster would appear "still selected".
              selected={sameWave && c.id === selectedId}
              onSelect={() => handleSelect(c)}
              glyph={chipGlyph(c, classFor)}
            />
          ))}

          {battle.outcome !== 'ongoing' && (
            // pointer-events-none on the overlay so the player can still tap/
            // un-tap chips behind the banner — useful for reading a KO'd
            // monster's final stats post-fight.
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={[
                'px-3 py-1.5 rounded-md text-sm font-bold border backdrop-blur-sm',
                battle.outcome === 'victory' ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600/60' : 'bg-red-950/80 text-red-200 border-red-600/60',
              ].join(' ')}>
                {battle.outcome === 'victory' ? 'Victory!' : battle.outcome === 'defeat' ? 'Defeated' : 'Stalemate'}
              </span>
            </div>
          )}
        </>}
      </Arena>

      <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-900 border border-blue-300/80 inline-block" /> Party ({playersAlive})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-900 border border-red-300/80 inline-block" /> Enemies ({enemiesAlive})</span>
      </div>

      {selected && <UnitDetailCard c={selected} />}
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

function Preview() {
  const combatLocationId = useGameStore((s) => s.combatLocationId)
  const locations        = useGameStore((s) => s.locations)
  const units            = useGameStore((s) => s.units)
  const equipment        = useGameStore((s) => s.equipment)

  const location = combatLocationId ? locations.find((l) => l.id === combatLocationId) ?? null : null
  const party    = units.filter((u) => u.locationId === combatLocationId)
  const foes     = location ? waveComposition(location, party.length) : []

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
  const baseCam = computeCamera([...enemyChips, ...partyChips].map((c) => c.pos))

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-game-text">Combat</h1>
        <p className="text-xs text-game-text-dim leading-snug mt-1">
          {location
            ? <>Engaging at <span className="text-game-text">{location.name}</span> — enemies form up across the field; your party from below. The next wave forms shortly.</>
            : 'Pick a location on the Map and tap "Go to Combat" to deploy your party.'}
        </p>
      </div>

      <Arena baseCam={baseCam} barriers={locationBarriers(location)}>
        {(cam) => <>
          {enemyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={false} />)}
          {partyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={true} />)}
          {(party.length === 0 && foes.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-game-muted italic px-6 text-center">No combatants to preview.</div>
          )}
        </>}
      </Arena>

      <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-900 border border-blue-300/80 inline-block" /> Party ({party.length})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-900 border border-red-300/80 inline-block" /> Enemies ({foes.length})</span>
      </div>
    </div>
  )
}

export function Combat() {
  const combatLocationId = useGameStore((s) => s.combatLocationId)
  const battle    = useGameStore((s) => (combatLocationId ? s.battles[combatLocationId] : undefined))
  const locations = useGameStore((s) => s.locations)
  const units     = useGameStore((s) => s.units)
  const name = combatLocationId ? (locations.find((l) => l.id === combatLocationId)?.name ?? 'Combat') : 'Combat'

  return (
    <div className="h-full flex flex-col pt-4 min-h-0">
      <RosterCarousel units={units} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {battle ? <LiveBattle name={name} battle={battle} /> : <Preview />}
      </div>
    </div>
  )
}
