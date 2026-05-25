import { useGameStore } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { ELEMENT_COLORS } from '@/lib/elements'
import {
  COLS, ROWS, startingPosition, type Rank, type BattleState, type Combatant,
} from '@/engine'

// The 1D ranged combat has been retired. Combat now resolves on a vertical 5×10
// grid (enemies advance from the top, the party from the bottom) via the Combat
// Tactic Engine, stepped one round per N ticks in the store. This tab renders
// the live battle for the focused location; with no live battle it falls back to
// a static starting-position preview.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// engine y=0 is a team's own edge. Players sit near y=0 (rendered bottom),
// enemies near y=ROWS (rendered top).
function leftPct(x: number) { return `${(x / COLS) * 100}%` }
function topPct(y: number)  { return `${(1 - y / ROWS) * 100}%` }

function hpColor(ratio: number): string {
  if (ratio >= 0.75) return 'bg-emerald-500'
  if (ratio >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

function GridBackdrop() {
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-1/2 bg-red-500/5" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-blue-500/5" />
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
      >
        {Array.from({ length: COLS * ROWS }).map((_, i) => (
          <div key={i} className="border border-game-border/30" />
        ))}
      </div>
    </>
  )
}

// ── Live battle ────────────────────────────────────────────────────────────────

function BattleChip({ c }: { c: Combatant }) {
  const isPlayer = c.team === 'player'
  const ratio = Math.max(0, c.hp / c.maxHp)
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 animate-chip-spawn"
      style={{ left: leftPct(c.pos.x), top: topPct(c.pos.y), transition: 'left 380ms linear, top 380ms linear' }}
    >
      <div
        title={`${c.name} — ${Math.ceil(c.hp)}/${c.maxHp}`}
        className={[
          'w-9 h-9 rounded-full border flex items-center justify-center text-[11px] font-semibold shadow transition-opacity',
          isPlayer ? 'bg-blue-900 text-blue-100 border-blue-400/70' : 'bg-red-950 text-red-200 border-red-500/70',
          c.alive ? '' : 'opacity-25 grayscale',
        ].join(' ')}
      >
        {c.alive ? initials(c.name) : '✕'}
      </div>
      {c.alive && (
        <div className="w-9 h-1 rounded-full bg-black/50 overflow-hidden">
          <div className={`h-full ${hpColor(ratio)}`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
        </div>
      )}
    </div>
  )
}

function LiveBattle({ name, battle }: { name: string; battle: BattleState }) {
  const byId = (id?: string) => (id ? battle.combatants.find((c) => c.id === id) : undefined)
  const roundEvents = battle.events.filter((e) => e.round === battle.round)
  const hits  = roundEvents.filter((e) =>
    (e.type === 'melee_attack' || e.type === 'ranged_attack' || (e.type === 'skill_use' && e.value != null)) && e.value != null,
  )
  const heals = roundEvents.filter((e) => e.type === 'heal' && e.value != null)

  const playersAlive = battle.combatants.filter((c) => c.team === 'player' && c.alive).length
  const enemiesAlive = battle.combatants.filter((c) => c.team === 'enemy' && c.alive).length

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-game-text">Combat</h1>
        <p className="text-xs text-game-text-dim mt-0.5">
          {name} · round {battle.round}
        </p>
      </div>

      <div className="relative w-full max-w-[300px] mx-auto aspect-[1/2] rounded-lg border border-game-border bg-game-surface overflow-hidden">
        <GridBackdrop />

        {/* attack arc lines for this round */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none">
          {hits.map((e, i) => {
            const src = byId(e.sourceId)
            const tgt = byId(e.targetId)
            if (!src || !tgt) return null
            const stroke = src.team === 'player' ? 'rgb(96,165,250)' : 'rgb(248,113,113)'
            return (
              <line
                key={`l-${battle.round}-${i}`}
                className="animate-line-fade"
                x1={src.pos.x} y1={ROWS - src.pos.y} x2={tgt.pos.x} y2={ROWS - tgt.pos.y}
                stroke={stroke} strokeWidth={0.06} strokeLinecap="round"
              />
            )
          })}
        </svg>

        {/* hit flashes + floating damage */}
        {hits.map((e, i) => {
          const tgt = byId(e.targetId)
          if (!tgt) return null
          return (
            <div key={`h-${battle.round}-${i}`}>
              <div
                className="absolute w-9 h-9 rounded-full border-2 border-white/70 animate-hit-flash"
                style={{ left: leftPct(tgt.pos.x), top: topPct(tgt.pos.y) }}
              />
              <div
                className="absolute text-[13px] font-bold text-red-300 drop-shadow animate-dmg-float"
                style={{ left: leftPct(tgt.pos.x), top: topPct(tgt.pos.y) }}
              >
                -{e.value}
              </div>
            </div>
          )
        })}

        {/* floating heals */}
        {heals.map((e, i) => {
          const tgt = byId(e.targetId)
          if (!tgt || !e.value) return null
          return (
            <div
              key={`heal-${battle.round}-${i}`}
              className="absolute text-[13px] font-bold text-emerald-300 drop-shadow animate-dmg-float"
              style={{ left: leftPct(tgt.pos.x), top: topPct(tgt.pos.y) }}
            >
              +{e.value}
            </div>
          )
        })}

        {/* combatants */}
        {battle.combatants.map((c) => <BattleChip key={c.id} c={c} />)}

        {battle.outcome !== 'ongoing' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={[
              'px-3 py-1.5 rounded-md text-sm font-bold border backdrop-blur-sm',
              battle.outcome === 'victory'
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600/60'
                : 'bg-red-950/80 text-red-200 border-red-600/60',
            ].join(' ')}>
              {battle.outcome === 'victory' ? 'Victory!' : battle.outcome === 'defeat' ? 'Defeated' : 'Stalemate'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-900 border border-blue-400/70 inline-block" /> Party ({playersAlive})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-950 border border-red-500/70 inline-block" /> Enemies ({enemiesAlive})
        </span>
      </div>
    </div>
  )
}

// ── Static preview (no live battle: between waves / not yet started) ─────────────

function PreviewChip({ pos, label, title, className }: {
  pos: { x: number; y: number }; label: string; title: string; className: string
}) {
  return (
    <div
      title={title}
      style={{ left: leftPct(pos.x), top: topPct(pos.y) }}
      className={[
        'absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border',
        'flex items-center justify-center text-[11px] font-semibold shadow',
        className,
      ].join(' ')}
    >
      {label}
    </div>
  )
}

function Preview() {
  const combatLocationId = useGameStore((s) => s.combatLocationId)
  const locations        = useGameStore((s) => s.locations)
  const units            = useGameStore((s) => s.units)
  const equipment        = useGameStore((s) => s.equipment)

  const location = combatLocationId ? locations.find((l) => l.id === combatLocationId) ?? null : null
  const party    = units.filter((u) => u.locationId === combatLocationId).slice(0, 5)
  const foes     = (location?.monsterIds ?? []).slice(0, 5)

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-game-text">Combat</h1>
        <p className="text-xs text-game-text-dim leading-snug mt-1">
          {location
            ? <>Engaging at <span className="text-game-text">{location.name}</span> — enemies advance from the top, your party from the bottom. The next wave forms shortly.</>
            : 'Pick a location on the Map and tap "Go to Combat" to deploy your party.'}
        </p>
      </div>

      <div className="relative w-full max-w-[300px] mx-auto aspect-[1/2] rounded-lg border border-game-border bg-game-surface overflow-hidden">
        <GridBackdrop />
        {foes.map((id, i) => {
          const m = MONSTER_REGISTRY[id]
          const rank: Rank = i < COLS ? 'front' : i < COLS * 2 ? 'mid' : 'back'
          return (
            <PreviewChip
              key={`${id}-${i}`}
              pos={startingPosition('enemy', rank, i)}
              label={initials(m?.name ?? id)}
              title={m?.name ?? id}
              className="bg-red-950 text-red-200 border-red-500/70"
            />
          )
        })}
        {party.map((u, i) => {
          const ranged = getDerivedStats(u, equipment).attackRange > 5
          const rank: Rank = ranged ? 'back' : 'front'
          return (
            <PreviewChip
              key={u.id}
              pos={startingPosition('player', rank, i)}
              label={initials(u.name)}
              title={`${u.name} — ${ranged ? 'ranged' : 'melee'}`}
              className="bg-blue-900 text-blue-100 border-blue-400/70"
            />
          )
        })}
        {(party.length === 0 && foes.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-game-muted italic px-6 text-center">
            No combatants to preview.
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 text-[11px] text-game-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-900 border border-blue-400/70 inline-block" /> Party ({party.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-950 border border-red-500/70 inline-block" /> Enemies ({foes.length})
        </span>
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
