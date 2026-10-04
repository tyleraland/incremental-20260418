import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, DROP_ITEMS, formatDuration } from '@/stores/useGameStore'
import type { OfflineLocationReward } from '@/lib/offline'
import { TallyBreakdown, fmt } from './TallyBreakdown'

// "While you were away" recap, shown once after an offline catch-up (batchTick).
// Reads the summary the store produced and clears it on dismiss. Mirrors the
// CombatReport modal's visual language.
export function OfflineSummary() {
  const summary = useGameStore((s) => s.offlineSummary)
  const dismiss = useGameStore((s) => s.dismissOfflineSummary)
  if (!summary) return null

  const loot = Object.entries(summary.loot)
    .map(([id, count]) => ({ id, name: DROP_ITEMS[id] ?? id, count }))
    .sort((a, b) => b.count - a.count)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
      onClick={dismiss}
    >
      <div
        className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-game-text text-lg leading-tight">While you were away</div>
            <div className="text-xs text-game-muted mt-0.5 uppercase tracking-widest">
              {formatDuration(summary.offlineSecs)}
            </div>
          </div>
          <button className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0" onClick={dismiss}>×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className="text-xl font-bold font-mono leading-none text-game-primary">{summary.totalKills}</div>
              <div className="text-xs text-game-text-dim mt-1">Kills</div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">By location</div>
            <div className="space-y-1.5">
              {summary.locations.map((r) => <LocationRow key={r.locationId} r={r} />)}
            </div>
          </div>

          {loot.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Loot</div>
              <div className="space-y-1.5">
                {loot.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 bg-game-bg rounded-lg px-3 py-2">
                    <span className="text-sm text-game-text flex-1">{d.name}</span>
                    <span className="text-sm text-game-text-dim font-mono">×{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-game-border">
          <button
            className="w-full bg-game-primary text-white font-semibold rounded-lg py-2.5 hover:opacity-90"
            onClick={dismiss}
          >
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// One location's away-span recap — the headline numbers, plus an expandable
// per-hero combat breakdown (estimated over the absence).
function LocationRow({ r }: { r: OfflineLocationReward }) {
  const [open, setOpen] = useState(false)
  const units = useGameStore((s) => s.units)
  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? id
  const heroes = Object.entries(r.tally ?? {})
    .map(([id, tally]) => ({ id, name: nameOf(id), tally }))
    .sort((a, b) => b.tally.damageDealt - a.tally.damageDealt)
  const expandable = heroes.length > 0

  // The headline (name + kills/exp) — the whole thing is the hit target when
  // there's a per-hero breakdown to reveal.
  const head = (
    <>
      <div className="flex items-center gap-2">
        {expandable && <span className="text-game-muted text-xs w-3 shrink-0 transition-transform">{open ? '▾' : '▸'}</span>}
        <span className="text-sm text-game-text flex-1">{r.locationName}</span>
        {r.primed && (
          <span className="text-[10px] uppercase tracking-wider text-game-muted border border-game-border rounded px-1 py-0.5">
            settled
          </span>
        )}
      </div>
      <div className={`text-xs text-game-text-dim font-mono mt-1 ${expandable ? 'pl-5' : ''}`}>
        {r.kills} kills · +{Math.floor(r.exp)} exp
      </div>
    </>
  )

  return (
    <div className="bg-game-bg rounded-lg overflow-hidden">
      {expandable ? (
        <button className="w-full text-left px-3 py-2 hover:bg-white/5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {head}
        </button>
      ) : (
        <div className="px-3 py-2">{head}</div>
      )}
      {open && expandable && (
        <div className="px-3 pb-3 space-y-2 border-t border-game-border/50 pt-2">
          {heroes.map((h) => (
            <div key={h.id}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs text-game-text">{h.name}</span>
                <span className="text-[10px] text-game-muted font-mono">{fmt(h.tally.damageDealt)} dmg</span>
              </div>
              <TallyBreakdown tally={h.tally} dense />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
