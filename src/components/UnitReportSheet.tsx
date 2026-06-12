import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { CatchUpReadout } from './SamplingDebug'

// Compact number: 1234 → "1.2k", 2_500_000 → "2.5M".
function fmt(n: number): string {
  if (!isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (abs >= 100)       return Math.round(n).toString()
  if (abs >= 10)        return n.toFixed(1).replace(/\.0$/, '')
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function Rate({ label, perS, perM, perH }: { label: string; perS?: string; perM: string; perH: string }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="text-xs text-game-text-dim w-16 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-sm text-game-text">
        {perS !== undefined && <span>{perS}<span className="text-game-muted text-xs">/s</span></span>}
        <span>{perM}<span className="text-game-muted text-xs">/m</span></span>
        <span>{perH}<span className="text-game-muted text-xs">/h</span></span>
      </div>
    </div>
  )
}

// Per-unit lifetime combat Report (bottom-sheet). Opened from the roster-selected
// unit on the Map / Inventory tabs. Rates use the unit's accumulated fighting
// time (combatTicks) as the denominator.
export function UnitReportSheet() {
  const reportUnitId = useGameStore((s) => s.reportUnitId)
  const closeReport  = useGameStore((s) => s.closeReport)
  const unit  = useGameStore((s) => s.units.find((u) => u.id === s.reportUnitId) ?? null)
  const stats = useGameStore((s) => (s.reportUnitId ? s.unitStats[s.reportUnitId] : undefined))

  if (!reportUnitId || !unit) return null

  const s = stats ?? { damageDealt: 0, monstersDefeated: 0, itemsFound: 0, combatTicks: 0 }
  const seconds = s.combatTicks / TICKS_PER_SECOND
  const perSec  = (n: number) => (seconds > 0 ? n / seconds : 0)
  const dps   = perSec(s.damageDealt)
  const ipsec = perSec(s.itemsFound)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end" onClick={closeReport}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-game-border bg-game-surface p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="font-semibold text-game-text">{unit.name}</span>
          <span className="text-xs text-game-text-dim">Lv.{unit.level}</span>
          <span className="text-xs text-game-muted">· Combat report</span>
          <button onClick={closeReport} aria-label="Close report" className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
        </div>

        {s.combatTicks === 0 ? (
          <div className="text-sm text-game-text-dim py-6 text-center">No combat recorded yet. Deploy this hero to a fight.</div>
        ) : (
          <>
            <Rate label="Damage"  perS={fmt(dps)} perM={fmt(dps * 60)} perH={fmt(dps * 3600)} />
            <Rate label="Items"   perM={fmt(ipsec * 60)} perH={fmt(ipsec * 3600)} />
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-game-border/50">
              <Stat label="Total damage"    value={fmt(s.damageDealt)} />
              <Stat label="Monsters"        value={fmt(s.monstersDefeated)} />
              <Stat label="Items found"     value={fmt(s.itemsFound)} />
            </div>
            <div className="text-[10px] text-game-muted mt-3">
              over {fmt(seconds)}s of fighting
            </div>
          </>
        )}

        <div className="mt-4 pt-3 border-t border-game-border/50">
          <CatchUpReadout />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-game-border bg-game-bg/40 px-2 py-2 text-center">
      <div className="font-mono text-base text-game-text">{value}</div>
      <div className="text-[10px] text-game-text-dim mt-0.5">{label}</div>
    </div>
  )
}
