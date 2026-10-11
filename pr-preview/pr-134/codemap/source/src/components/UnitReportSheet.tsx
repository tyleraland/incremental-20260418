import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import { emptyTally, sumWindow } from '@/lib/combatTally'
import { TallyBreakdown } from './TallyBreakdown'
import { CatchUpReadout } from './SamplingDebug'

type Window = '5m' | '1h' | 'life'
const WINDOWS: { id: Window; label: string }[] = [
  { id: '5m',   label: 'Last 5m' },
  { id: '1h',   label: 'Last 1h' },
  { id: 'life', label: 'Lifetime' },
]

// Per-unit combat report (bottom-sheet). Opened from the roster-selected unit on
// the Map / Inventory tabs. The 5m / 1h windows sum the rolling minute-buckets;
// Lifetime is the persisted running tally.
export function UnitReportSheet() {
  const reportUnitId = useGameStore((s) => s.reportUnitId)
  const closeReport  = useGameStore((s) => s.closeReport)
  const unit    = useGameStore((s) => s.units.find((u) => u.id === s.reportUnitId) ?? null)
  const lifetime = useGameStore((s) => (s.reportUnitId ? s.unitStats[s.reportUnitId] : undefined))
  const buckets  = useGameStore((s) => (s.reportUnitId ? s.unitStatHistory[s.reportUnitId] : undefined))
  const ticks    = useGameStore((s) => s.ticks)
  const [win, setWin] = useState<Window>('1h')

  if (!reportUnitId || !unit) return null

  const tally =
    win === 'life' ? (lifetime ?? emptyTally()) :
    sumWindow(buckets, ticks, win === '5m' ? 5 : 60)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end" onClick={closeReport}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-game-border bg-game-surface p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="font-semibold text-game-text">{unit.name}</span>
          <span className="text-xs text-game-text-dim">Lv.{unit.level}</span>
          <span className="text-xs text-game-muted">· Battle report</span>
          <button onClick={closeReport} aria-label="Close report" className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
        </div>

        {/* Window selector */}
        <div className="flex gap-1 mb-4 bg-game-bg rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWin(w.id)}
              className={[
                'flex-1 text-xs font-medium rounded-md py-1.5 transition-colors',
                win === w.id ? 'bg-game-primary text-white' : 'text-game-text-dim hover:text-game-text',
              ].join(' ')}
            >
              {w.label}
            </button>
          ))}
        </div>

        <TallyBreakdown tally={tally} />

        <div className="mt-4 pt-3 border-t border-game-border/50">
          <CatchUpReadout />
        </div>
      </div>
    </div>,
    document.body,
  )
}
