import { useState } from 'react'
import { useGameStore, MONSTER_REGISTRY, type Location } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'

// ── Familiarity bar ───────────────────────────────────────────────────────────

function FamiliarityBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-game-green' : pct >= 50 ? 'bg-game-accent' : pct > 0 ? 'bg-game-gold' : 'bg-game-border'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-game-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-game-text-dim w-8 text-right tabular-nums">{pct}%</span>
    </div>
  )
}

// ── Monster card in codex (tappable) ─────────────────────────────────────────

function CodexMonsterCard({ monsterId }: { monsterId: string }) {
  const [open, setOpen] = useState(false)
  const seenCount = useGameStore((s) => s.monsterSeen[monsterId] ?? 0)
  const monster   = MONSTER_REGISTRY[monsterId]
  if (!monster) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-lg border border-game-border bg-game-bg text-center min-w-[72px] hover:border-game-accent/60 hover:bg-game-accent/5 transition-colors"
      >
        <div className="text-sm font-semibold text-game-text">{monster.name}</div>
        <div className="text-xs text-game-accent">Lv.{monster.level}</div>
        <div className="text-xs text-game-text-dim mt-0.5">{seenCount}×</div>
      </button>
      {open && <MonsterCodex monster={monster} seenCount={seenCount} onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Location codex entry ──────────────────────────────────────────────────────

function LocationEntry({ location }: { location: Location }) {
  const [expanded, setExpanded]  = useState(false)
  const familiarity              = useGameStore((s) => s.locationFamiliarity[location.id] ?? 0)
  const locationMonstersSeen     = useGameStore((s) => (s.locationMonstersSeen[location.id] ?? []).filter(id => location.monsterIds.includes(id)))
  const famPct                   = Math.round((familiarity / location.familiarityMax) * 100)
  const unknownCount             = location.monsterIds.length - locationMonstersSeen.length

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 space-y-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-game-text">{location.name}</span>
          <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
        <FamiliarityBar pct={famPct} />
      </button>

      {expanded && (
        <div className="border-t border-game-border px-4 py-4 space-y-3">
          <p className="text-sm text-game-text-dim">{location.description}</p>

          {famPct === 0 ? (
            <p className="text-sm text-game-muted italic">
              {location.monsterIds.length} monsters inhabit this area. Send units to explore.
            </p>
          ) : (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Monsters</div>
              <div className="flex flex-wrap gap-2">
                {locationMonstersSeen.map((id) => (
                  <CodexMonsterCard key={id} monsterId={id} />
                ))}
                {unknownCount > 0 && (
                  <div className="px-3 py-2 rounded-lg border border-dashed border-game-border bg-game-bg text-center min-w-[72px] opacity-50">
                    <div className="text-sm text-game-muted">+{unknownCount}</div>
                    <div className="text-xs text-game-muted">unknown</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Codex page ────────────────────────────────────────────────────────────────

export function Codex() {
  const locations = useGameStore((s) => s.locations)

  return (
    <div className="p-4 space-y-3 pb-24">
      <div className="text-xs uppercase tracking-widest text-game-text-dim">Locations</div>
      {locations.map((loc) => (
        <LocationEntry key={loc.id} location={loc} />
      ))}
    </div>
  )
}
