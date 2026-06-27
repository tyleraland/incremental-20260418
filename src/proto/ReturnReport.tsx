import { createPortal } from 'react-dom'
import type { ReturnReport as Report } from './expeditionStore'

// §expedition — the return-to-town report. Explains WHY the party came home, what
// they gained, what they spent, what was auto-processed, and one tuning tip.
export function ReturnReport({ report, locationName, onClose }: { report: Report; locationName: string; onClose: () => void }) {
  const r = report
  const pct = Math.round(r.capacityAt * 100)
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-game-border bg-game-surface p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Why they came home */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Returned from {locationName}</div>
          <div className="text-lg font-semibold text-game-text">{r.reason}</div>
          <div className="text-[11px] text-game-text-dim">{r.party} hero{r.party === 1 ? '' : 'es'} · {r.durationSec}s out · pack {pct}% full</div>
        </div>

        {/* Gains */}
        <div className="rounded-lg border border-game-border bg-game-bg/50 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Brought home</span>
            <span className="text-sm font-mono text-game-gold tabular-nums">+{r.gains.gold.toLocaleString()}g</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.gains.notable.map((n, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full border border-game-border text-game-text-dim">
                {n.label} <span className="text-game-muted">· {n.category}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Spend + auto-processed */}
        <div className="rounded-lg border border-game-border bg-game-bg/50 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim">Handled automatically</div>
          <ul className="space-y-0.5">
            {r.processed.map((p, i) => (
              <li key={i} className="text-[11px] text-game-text-dim flex items-center gap-1.5"><span className="text-game-green">✓</span>{p}</li>
            ))}
          </ul>
          <div className="text-[11px] text-game-text-dim pt-1 border-t border-game-border/60">
            Supplies spent: <span className="text-game-text">{r.spend.suppliesUsedPct}%</span> · restocked for <span className="text-game-text">{r.spend.restockGold}g</span>
          </div>
        </div>

        {/* One tuning suggestion */}
        <div className="rounded-lg border border-game-primary/40 bg-game-primary/10 p-3">
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-0.5">Tip</div>
          <div className="text-[12px] text-game-text leading-snug">{r.tuning}</div>
        </div>

        <button onClick={onClose} className="w-full py-2 rounded-lg border border-game-border text-sm text-game-text hover:bg-white/5">
          Send back out ▸
        </button>
      </div>
    </div>,
    document.body,
  )
}
