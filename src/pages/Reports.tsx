import { useState } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { emptyTally, addInto, sumWindow } from '@/lib/combatTally'
import type { CombatTally, Unit, LocationCombatStats } from '@/types'
import { TallyBreakdown, fmt } from '@/components/TallyBreakdown'

type Window = '5m' | '1h' | 'life'
const WINDOWS: { id: Window; label: string }[] = [
  { id: '5m',   label: 'Last 5m' },
  { id: '1h',   label: 'Last 1h' },
  { id: 'life', label: 'Lifetime' },
]

// Battle Report analytics tab: every hero and every location's combat breakdown
// in one place. Heroes are scoped to a shared time-window (5m / 1h / lifetime);
// locations show their cumulative per-hero tables.
export function Reports() {
  const units        = useGameStore((s) => s.units)
  const unitStats    = useGameStore((s) => s.unitStats)
  const history      = useGameStore((s) => s.unitStatHistory)
  const locations    = useGameStore((s) => s.locations)
  const locationStats = useGameStore((s) => s.locationStats)
  const ticks        = useGameStore((s) => s.ticks)
  const [win, setWin] = useState<Window>('1h')

  const tallyFor = (u: Unit): CombatTally =>
    win === 'life' ? (unitStats[u.id] ?? emptyTally()) : sumWindow(history[u.id], ticks, win === '5m' ? 5 : 60)

  const heroes = units
    .map((u) => ({ unit: u, tally: tallyFor(u) }))
    .filter((h) => h.tally.damageDealt > 0 || h.tally.monstersDefeated > 0 || h.tally.damageTaken > 0)
    .sort((a, b) => b.tally.damageDealt - a.tally.damageDealt)

  const locs = locations
    .map((l) => ({ loc: l, stats: locationStats[l.id] }))
    .filter((l) => l.stats && Object.keys(l.stats.byUnit ?? {}).length > 0)

  return (
    <div className="px-4 py-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <div className="font-bold text-game-text text-lg">Battle Reports</div>
        <div className="text-xs text-game-muted mt-0.5">Per-hero and per-location combat analytics.</div>
      </div>

      {/* ── Heroes ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <div className="text-xs uppercase tracking-widest text-game-text-dim">Heroes</div>
          <div className="flex gap-1 ml-auto bg-game-bg rounded-lg p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWin(w.id)}
                className={[
                  'text-[11px] font-medium rounded-md px-2.5 py-1 transition-colors',
                  win === w.id ? 'bg-game-primary text-white' : 'text-game-text-dim hover:text-game-text',
                ].join(' ')}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        {heroes.length === 0 ? (
          <p className="text-xs text-game-muted italic">No combat in this window. Deploy heroes to a location.</p>
        ) : (
          <div className="space-y-1.5">
            {heroes.map((h) => (
              <Collapsible
                key={h.unit.id}
                title={<><span className="text-sm text-game-text">{h.unit.name}</span><span className="text-xs text-game-text-dim ml-2">Lv.{h.unit.level}</span></>}
                meta={`${fmt(h.tally.monstersDefeated)} K · ${fmt(h.tally.damageDealt)} dmg`}
              >
                <TallyBreakdown tally={h.tally} />
              </Collapsible>
            ))}
          </div>
        )}
      </section>

      {/* ── Locations ──────────────────────────────────────────────────────── */}
      <section>
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Locations</div>
        {locs.length === 0 ? (
          <p className="text-xs text-game-muted italic">No location combat recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {locs.map(({ loc, stats }) => <LocationCard key={loc.id} name={loc.name} stats={stats!} units={units} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function LocationCard({ name, stats, units }: { name: string; stats: LocationCombatStats; units: Unit[] }) {
  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? id
  const byUnit = stats.byUnit ?? {}
  const total = emptyTally()
  for (const t of Object.values(byUnit)) addInto(total, t)
  // Location's lifetime kill/exp/gold headline still comes from the aggregate.
  total.monstersDefeated = Object.values(stats.monstersDefeated).reduce((a, b) => a + b, 0)
  total.expGained = stats.expDistributed
  const heroes = Object.entries(byUnit)
    .map(([id, tally]) => ({ id, name: nameOf(id), tally }))
    .sort((a, b) => b.tally.damageDealt - a.tally.damageDealt)
  const topMobs = Object.entries(stats.monstersDefeated)
    .map(([id, n]) => ({ name: MONSTER_REGISTRY[id]?.name ?? id, n }))
    .sort((a, b) => b.n - a.n)

  return (
    <Collapsible
      title={<span className="text-sm text-game-text">{name}</span>}
      meta={`${fmt(total.monstersDefeated)} kills · ${stats.goldEarned} gold`}
    >
      <div className="space-y-3">
        <TallyBreakdown tally={total} />
        {topMobs.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Monsters defeated</div>
            <div className="flex flex-wrap gap-1.5">
              {topMobs.map((m) => (
                <span key={m.name} className="text-xs bg-game-bg rounded px-2 py-0.5 text-game-text-dim">
                  {m.name} <span className="font-mono text-game-text">×{m.n}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {heroes.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">By hero</div>
            <div className="space-y-1.5">
              {heroes.map((h) => (
                <Collapsible key={h.id} title={<span className="text-sm text-game-text">{h.name}</span>} meta={`${fmt(h.tally.damageDealt)} dmg`} nested>
                  <TallyBreakdown tally={h.tally} dense />
                </Collapsible>
              ))}
            </div>
          </div>
        )}
      </div>
    </Collapsible>
  )
}

function Collapsible({ title, meta, children, nested = false }: {
  title: React.ReactNode
  meta?: string
  children: React.ReactNode
  nested?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-lg overflow-hidden ${nested ? 'bg-game-bg/60' : 'bg-game-bg border border-game-border/40'}`}>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5" onClick={() => setOpen((o) => !o)}>
        <span className="text-game-muted text-xs w-3 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="flex-1 min-w-0 flex items-baseline">{title}</span>
        {meta && <span className="text-xs text-game-text-dim font-mono shrink-0">{meta}</span>}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  )
}
