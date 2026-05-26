import { useState } from 'react'
import { useGameStore, waveComposition, locationBarriers } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
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
// Defaults to a slightly-zoomed-in window centered on the arena (combat starts
// here). When live units cluster tighter than DEFAULT_CAM_SIZE, the camera
// zooms in further so cards stay readable; when they spread past it, the
// camera zooms out (up to the whole arena) so nothing leaves the frame. Most
// of the time you're in the default, hence the wide hysteresis thresholds.

const DEFAULT_CAM_SIZE = 13   // world units shown by default
const FULL_CAM_SIZE    = COLS // whole arena (zoom-out cap)
const CLOSE_EXTENT     = 4    // bbox extent below this → zoom in on the cluster
const SPREAD_EXTENT    = 12   // bbox extent above this → zoom out to fit them all

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

  if (extent >= CLOSE_EXTENT && extent <= SPREAD_EXTENT) return defaultCamera()

  // Centered on the bbox midpoint, clamped to stay inside the arena.
  const size = extent < CLOSE_EXTENT
    ? Math.max(CLOSE_EXTENT + 2, extent + 3)   // tight cluster: zoom in close
    : FULL_CAM_SIZE                            // very spread: show everything
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  return {
    x: Math.max(0, Math.min(COLS - size, cx - size / 2)),
    y: Math.max(0, Math.min(ROWS - size, cy - size / 2)),
    size,
  }
}

const px = (cam: Cam, x: number) => `${((x - cam.x) / cam.size) * 100}%`
const py = (cam: Cam, y: number) => `${(1 - (y - cam.y) / cam.size) * 100}%`

// Half a token in world units — clamp the rendered center inward by this much so
// the card's body never clips the arena edge even when a unit is pinned to it.
const TOKEN_INSET = 0.5
const insetX = (cam: Cam, x: number) => Math.max(cam.x + TOKEN_INSET, Math.min(cam.x + cam.size - TOKEN_INSET, x))
const insetY = (cam: Cam, y: number) => Math.max(cam.y + TOKEN_INSET, Math.min(cam.y + cam.size - TOKEN_INSET, y))

function Arena({ cam, barriers, children }: { cam: Cam; barriers: Barrier[]; children: React.ReactNode }) {
  const cell = `${100 / cam.size}%`
  const centerTop = Math.max(0, Math.min(100, (1 - (CENTER_Y - cam.y) / cam.size) * 100))
  return (
    <div className="relative w-full max-w-[380px] mx-auto aspect-square rounded-lg border border-game-border bg-game-surface overflow-hidden">
      {/* team-half tints, split at the arena's center line */}
      <div className="absolute inset-x-0 top-0 bg-red-500/5" style={{ height: `${centerTop}%` }} />
      <div className="absolute inset-x-0 bottom-0 bg-blue-500/5" style={{ top: `${centerTop}%` }} />
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
      {children}
    </div>
  )
}

// ── Live battle ────────────────────────────────────────────────────────────────

// Cards are bigger now (portrait + first name + HP) so the field is more
// readable. Wider start positions (DEPLOY_FRONT bumped) keep them from
// stacking up on round 1; expect some overlap once melee converges.
const CARD = 'w-16'

// First name (or short label) for the chip header. Falls back to initials for
// single-word monster names where the first word is the whole thing.
function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.length > 8 ? first.slice(0, 7) + '…' : first
}

function CooldownMeter({ c }: { c: Combatant }) {
  if (c.skills.length === 0) return null
  return (
    <div className="flex gap-px">
      {c.skills.map((s) => {
        const left = c.skillCooldowns[s.id] ?? 0
        const ready = left <= 0
        const frac = ready ? 1 : 1 - left / Math.max(1, s.cooldown)
        return (
          <div key={s.id} title={ready ? `${s.name} — ready` : `${s.name} — ${left}`} className="flex-1 h-[3px] rounded-sm bg-black/60 overflow-hidden">
            <div className={`h-full ${ready ? 'bg-emerald-400' : 'bg-sky-500/80'}`} style={{ width: `${frac * 100}%`, transition: 'width 380ms linear' }} />
          </div>
        )
      })}
    </div>
  )
}

function BattleChip({ c, cam, selected, onSelect }: { c: Combatant; cam: Cam; selected: boolean; onSelect: () => void }) {
  const isPlayer = c.team === 'player'
  const ratio = Math.max(0, c.hp / c.maxHp)
  const casting = c.alive && !!c.channel
  return (
    <div
      onClick={onSelect}
      className={`absolute ${CARD} -translate-x-1/2 -translate-y-1/2 animate-chip-spawn cursor-pointer`}
      style={{ left: px(cam, insetX(cam, c.pos.x)), top: py(cam, insetY(cam, c.pos.y)), transition: 'left 380ms linear, top 380ms linear' }}
    >
      {casting && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-1 py-px rounded bg-amber-500/90 text-[9px] font-bold text-amber-50 whitespace-nowrap shadow animate-pulse z-10">
          ✦ {skillName(c.channel!.skillId)}
        </div>
      )}
      <div
        title={casting ? `${c.name} — casting ${skillName(c.channel!.skillId)}` : `${c.name} — ${Math.ceil(c.hp)}/${c.maxHp}`}
        className={[
          'rounded-md border shadow flex flex-col gap-0.5 px-1 pt-0.5 pb-1 transition-opacity',
          casting ? 'bg-blue-950 border-amber-300 ring-1 ring-amber-400/60'
            : isPlayer ? 'bg-blue-950 border-blue-400/70' : 'bg-red-950 border-red-500/70',
          selected ? 'ring-2 ring-emerald-300' : '',
          c.alive ? '' : 'opacity-25 grayscale',
        ].join(' ')}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span
            aria-hidden
            className={[
              'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border',
              isPlayer ? 'bg-blue-900 border-blue-300/60 text-blue-100' : 'bg-red-900 border-red-300/60 text-red-100',
            ].join(' ')}
          >
            {c.alive ? initials(c.name) : '✕'}
          </span>
          <span className={`text-[10px] font-semibold leading-tight truncate ${isPlayer ? 'text-blue-100' : 'text-red-100'}`}>
            {shortName(c.name)}
          </span>
        </div>
        <div className="h-1 rounded-sm bg-black/50 overflow-hidden">
          <div className={`h-full ${hpColor(ratio)}`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
        </div>
        {c.alive && <CooldownMeter c={c} />}
      </div>
    </div>
  )
}

function Float({ cam, pos, className, text, k }: { cam: Cam; pos: Vec2; className: string; text: string; k: string }) {
  return (
    <div key={k} className={`absolute -translate-x-1/2 -translate-y-1/2 font-bold drop-shadow animate-dmg-float whitespace-nowrap ${className}`} style={{ left: px(cam, pos.x), top: py(cam, pos.y) }}>
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const byId = (id?: string) => (id ? battle.combatants.find((c) => c.id === id) : undefined)
  const selected = selectedId ? byId(selectedId) : undefined
  const alive = battle.combatants.filter((c) => c.alive)
  const cam = computeCamera((alive.length ? alive : battle.combatants).map((c) => c.pos))

  const roundEvents = battle.events.filter((e) => e.round === battle.round)
  const hits  = roundEvents.filter((e) => (e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use') && e.value != null)
  const heals = roundEvents.filter((e) => e.type === 'heal' && e.value != null)
  const dots  = roundEvents.filter((e) => e.type === 'dot' && e.value != null)
  const interrupts = roundEvents.filter((e) => e.type === 'interrupt')

  const playersAlive = battle.combatants.filter((c) => c.team === 'player' && c.alive).length
  const enemiesAlive = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-game-text">Combat</h1>
        <p className="text-xs text-game-text-dim mt-0.5">{name} · round {battle.round}</p>
      </div>

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
            return <line key={`l-${battle.round}-${i}`} className="animate-line-fade" x1={src.pos.x} y1={ROWS - src.pos.y} x2={tgt.pos.x} y2={ROWS - tgt.pos.y} stroke={stroke} strokeWidth={cam.size * 0.012} strokeLinecap="round" />
          })}
        </svg>

        {/* hit flashes + floating numbers */}
        {hits.map((e, i) => {
          const tgt = byId(e.targetId)
          if (!tgt) return null
          return (
            <div key={`h-${battle.round}-${i}`}>
              <div className={`absolute ${CARD} aspect-square -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white/70 animate-hit-flash`} style={{ left: px(cam, tgt.pos.x), top: py(cam, tgt.pos.y) }} />
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

        {battle.combatants.map((c) => (
          <BattleChip
            key={c.id}
            c={c}
            cam={cam}
            selected={c.id === selectedId}
            onSelect={() => setSelectedId(selectedId === c.id ? null : c.id)}
          />
        ))}

        {battle.outcome !== 'ongoing' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={[
              'px-3 py-1.5 rounded-md text-sm font-bold border backdrop-blur-sm',
              battle.outcome === 'victory' ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600/60' : 'bg-red-950/80 text-red-200 border-red-600/60',
            ].join(' ')}>
              {battle.outcome === 'victory' ? 'Victory!' : battle.outcome === 'defeat' ? 'Defeated' : 'Stalemate'}
            </span>
          </div>
        )}
      </Arena>

      <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-950 border border-blue-400/70 inline-block" /> Party ({playersAlive})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-950 border border-red-500/70 inline-block" /> Enemies ({enemiesAlive})</span>
      </div>

      {selected && <UnitDetailCard c={selected} />}
    </div>
  )
}

// ── Static preview (no live battle: between waves / not yet started) ─────────────

function PreviewChip({ cam, pos, label, name, title, isPlayer }: { cam: Cam; pos: Vec2; label: string; name: string; title: string; isPlayer: boolean }) {
  return (
    <div title={title} style={{ left: px(cam, insetX(cam, pos.x)), top: py(cam, insetY(cam, pos.y)) }} className={`absolute ${CARD} -translate-x-1/2 -translate-y-1/2`}>
      <div className={['rounded-md border shadow flex flex-col gap-0.5 px-1 pt-0.5 pb-1', isPlayer ? 'bg-blue-950 border-blue-400/70' : 'bg-red-950 border-red-500/70'].join(' ')}>
        <div className="flex items-center gap-1 min-w-0">
          <span
            aria-hidden
            className={[
              'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border',
              isPlayer ? 'bg-blue-900 border-blue-300/60 text-blue-100' : 'bg-red-900 border-red-300/60 text-red-100',
            ].join(' ')}
          >
            {label}
          </span>
          <span className={`text-[10px] font-semibold leading-tight truncate ${isPlayer ? 'text-blue-100' : 'text-red-100'}`}>
            {shortName(name)}
          </span>
        </div>
        <div className="h-1 rounded-sm bg-emerald-500/80" />
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
    return { key: u.id, pos: startingPosition('player', rank, within), label: initials(u.name), name: u.name, title: `${u.name} — ${ranged ? 'ranged' : 'melee'}` }
  })
  const cam = computeCamera([...enemyChips, ...partyChips].map((c) => c.pos))

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

      <Arena cam={cam} barriers={locationBarriers(location)}>
        {enemyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={false} />)}
        {partyChips.map((c) => <PreviewChip key={c.key} cam={cam} pos={c.pos} label={c.label} name={c.name} title={c.title} isPlayer={true} />)}
        {(party.length === 0 && foes.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-game-muted italic px-6 text-center">No combatants to preview.</div>
        )}
      </Arena>

      <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-950 border border-blue-400/70 inline-block" /> Party ({party.length})</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-950 border border-red-500/70 inline-block" /> Enemies ({foes.length})</span>
      </div>
    </div>
  )
}

export function Combat() {
  const combatLocationId = useGameStore((s) => s.combatLocationId)
  const battle   = useGameStore((s) => (combatLocationId ? s.battles[combatLocationId] : undefined))
  const locations = useGameStore((s) => s.locations)
  const name = combatLocationId ? (locations.find((l) => l.id === combatLocationId)?.name ?? 'Combat') : 'Combat'

  if (battle) return <LiveBattle name={name} battle={battle} />
  return <Preview />
}
