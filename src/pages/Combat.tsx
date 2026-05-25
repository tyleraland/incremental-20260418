import { useGameStore } from '@/stores/useGameStore'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { ELEMENT_COLORS } from '@/lib/elements'
import { COLS, ROWS, startingPosition, type Rank } from '@/engine'

// The 1D ranged combat has been retired. The new Combat Tactic Engine resolves
// 5v5 battles on a vertical 5×10 grid — enemies advance from the top, the party
// from the bottom. The engine core (deterministic round resolution) is in
// `src/engine`; this tab is a static preview of the spatial model until the
// engine is wired into the tick loop.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// engine x ∈ [0,COLS], y ∈ [0,ROWS] with y=0 at a team's own edge. Players sit
// near y=0 (rendered at the bottom), enemies near y=ROWS (rendered at the top).
function toPct(pos: { x: number; y: number }) {
  return { left: `${(pos.x / COLS) * 100}%`, top: `${(1 - pos.y / ROWS) * 100}%` }
}

function Chip({ pos, label, title, className }: {
  pos: { x: number; y: number }; label: string; title: string; className: string
}) {
  const { left, top } = toPct(pos)
  return (
    <div
      title={title}
      style={{ left, top }}
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

export function Combat() {
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
            ? <>Engaging at <span className="text-game-text">{location.name}</span>. Rebuilding combat on the 5×10 tactic grid — enemies advance from the top, your party from the bottom.</>
            : 'Pick a location on the Map and tap "Go to Combat" to preview an engagement.'}
        </p>
      </div>

      <div className="relative w-full max-w-[280px] mx-auto aspect-[1/2] rounded-lg border border-game-border bg-game-surface overflow-hidden">
        {/* enemy / player half tint */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-red-500/5" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-blue-500/5" />

        {/* cell grid backdrop */}
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
        >
          {Array.from({ length: COLS * ROWS }).map((_, i) => (
            <div key={i} className="border border-game-border/30" />
          ))}
        </div>

        {/* enemy chips (top) */}
        {foes.map((id, i) => {
          const m = MONSTER_REGISTRY[id]
          const rank: Rank = i < COLS ? 'front' : i < COLS * 2 ? 'mid' : 'back'
          return (
            <Chip
              key={`${id}-${i}`}
              pos={startingPosition('enemy', rank, i)}
              label={initials(m?.name ?? id)}
              title={m?.name ?? id}
              className={m ? ELEMENT_COLORS[m.element] : 'bg-red-950 text-red-300 border-red-700/50'}
            />
          )
        })}

        {/* party chips (bottom) */}
        {party.map((u, i) => {
          const ranged = getDerivedStats(u, equipment).attackRange > 5
          const rank: Rank = ranged ? 'back' : 'front'
          return (
            <Chip
              key={u.id}
              pos={startingPosition('player', rank, i)}
              label={initials(u.name)}
              title={`${u.name} — ${ranged ? 'ranged' : 'melee'}`}
              className="bg-blue-950 text-blue-200 border-blue-600/60"
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
          <span className="w-3 h-3 rounded-full bg-blue-950 border border-blue-600/60 inline-block" /> Party ({party.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-950 border border-red-700/50 inline-block" /> Enemies ({foes.length})
        </span>
      </div>
    </div>
  )
}
