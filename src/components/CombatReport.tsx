import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, MONSTER_REGISTRY, formatDuration, getLocationCombatReport, TICKS_PER_SECOND } from '@/stores/useGameStore'
import { TallyBreakdown, fmt } from './TallyBreakdown'
import type { CombatTally } from '@/types'

export function CombatReport({ locationId, locationName, onClose }: {
  locationId: string
  locationName: string
  onClose: () => void
}) {
  const stats       = useGameStore((s) => s.locationStats[locationId])
  const currentTick = useGameStore((s) => s.ticks)
  const units       = useGameStore((s) => s.units)

  const report = getLocationCombatReport(stats, currentTick)
  const elapsedSecs = Math.max(0, Math.round((report.endTick - report.startTick) / TICKS_PER_SECOND))

  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? id
  const heroes = Object.entries(stats?.byUnit ?? {})
    .map(([id, tally]) => ({ id, name: nameOf(id), tally }))
    .sort((a, b) => b.tally.damageDealt - a.tally.damageDealt)

  const defeats = Object.entries(report.monstersDefeated)
    .map(([id, count]) => ({ id, name: MONSTER_REGISTRY[id]?.name ?? id, count }))
    .sort((a, b) => b.count - a.count)
  const totalKills = defeats.reduce((s, d) => s + d.count, 0)

  const drops = Object.entries(report.itemsDropped)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-game-text text-lg leading-tight">{locationName}</div>
            <div className="text-xs text-game-muted mt-0.5 uppercase tracking-widest">Combat Report</div>
          </div>
          <button className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div className="text-xs text-game-text-dim">
            Since first hunt here · {formatDuration(elapsedSecs)}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className="text-xl font-bold font-mono leading-none text-game-primary">{totalKills}</div>
              <div className="text-xs text-game-text-dim mt-1">Kills</div>
            </div>
            <div className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className="text-xl font-bold font-mono leading-none text-game-green">{report.expDistributed}</div>
              <div className="text-xs text-game-text-dim mt-1">EXP</div>
            </div>
            <div className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className="text-xl font-bold font-mono leading-none text-game-gold">{report.goldEarned}</div>
              <div className="text-xs text-game-text-dim mt-1">Gold</div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Monsters Defeated</div>
            {defeats.length === 0 ? (
              <p className="text-xs text-game-muted italic">No monsters defeated yet.</p>
            ) : (
              <div className="space-y-1.5">
                {defeats.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 bg-game-bg rounded-lg px-3 py-2">
                    <span className="text-sm text-game-text flex-1">{d.name}</span>
                    <span className="text-sm text-game-text-dim font-mono">×{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {drops.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Items Dropped</div>
              <div className="space-y-1.5">
                {drops.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 bg-game-bg rounded-lg px-3 py-2">
                    <span className="text-sm text-game-text flex-1">{d.id}</span>
                    <span className="text-sm text-game-text-dim font-mono">×{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {heroes.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">By Hero</div>
              <div className="space-y-1.5">
                {heroes.map((h) => <HeroRow key={h.id} name={h.name} tally={h.tally} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// One collapsible hero row in a location's "By Hero" breakdown.
function HeroRow({ name, tally }: { name: string; tally: CombatTally }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-game-bg rounded-lg overflow-hidden">
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5" onClick={() => setOpen((o) => !o)}>
        <span className="text-game-muted text-xs w-3 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="text-sm text-game-text flex-1">{name}</span>
        <span className="text-xs text-game-text-dim font-mono">{fmt(tally.monstersDefeated)} K · {fmt(tally.damageDealt)} dmg</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1"><TallyBreakdown tally={tally} dense /></div>}
    </div>
  )
}
