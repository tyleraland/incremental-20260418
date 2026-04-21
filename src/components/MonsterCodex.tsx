import { createPortal } from 'react-dom'
import { type MonsterDef, DROP_ITEMS, FAMILIARITY_THRESHOLDS } from '@/stores/useGameStore'

const STAT_ROWS = [
  { key: 'attack'       as const, label: 'ATK',   color: 'text-game-gold'   },
  { key: 'defense'      as const, label: 'DEF',   color: 'text-sky-400'     },
  { key: 'magicAttack'  as const, label: 'M.ATK', color: 'text-game-accent' },
  { key: 'magicDefense' as const, label: 'M.DEF', color: 'text-violet-400'  },
  { key: 'attackSpeed'  as const, label: 'SPD',   color: 'text-game-green'  },
  { key: 'accuracy'     as const, label: 'ACC',   color: 'text-orange-400'  },
  { key: 'dodge'        as const, label: 'DOD',   color: 'text-pink-400'    },
]

export function MonsterCodex({ monster, seenCount, onClose }: {
  monster: MonsterDef
  seenCount: number
  onClose: () => void
}) {
  const canSeeStats     = seenCount >= FAMILIARITY_THRESHOLDS.stats
  const canSeeDropNames = seenCount >= FAMILIARITY_THRESHOLDS.dropNames
  const canSeeDropRates = seenCount >= FAMILIARITY_THRESHOLDS.dropRates

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-game-text text-lg leading-tight">{monster.name}</span>
              <span className="text-xs text-game-text-dim bg-game-border rounded-full px-2 py-0.5">Lv.{monster.level}</span>
              <span className="text-xs text-game-accent bg-game-accent/10 rounded-full px-2 py-0.5">
                {seenCount} sighting{seenCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-xs text-game-muted mt-0.5 uppercase tracking-widest">Codex Entry</div>
          </div>
          <button className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Stats */}
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Combat Stats</div>
            {canSeeStats ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {STAT_ROWS.slice(0, 4).map(({ key, label, color }) => (
                    <div key={key} className="bg-game-bg rounded-lg py-2.5 text-center">
                      <div className={`text-xl font-bold font-mono leading-none ${color}`}>{monster.stats[key]}</div>
                      <div className="text-xs text-game-text-dim mt-1">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {STAT_ROWS.slice(4).map(({ key, label, color }) => (
                    <div key={key} className="bg-game-bg rounded-lg py-2.5 text-center">
                      <div className={`text-xl font-bold font-mono leading-none ${color}`}>{monster.stats[key]}</div>
                      <div className="text-xs text-game-text-dim mt-1">{label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-game-muted italic">
                Not enough sightings to assess combat capability.
                {seenCount < FAMILIARITY_THRESHOLDS.stats && ` (${FAMILIARITY_THRESHOLDS.stats - seenCount} more needed)`}
              </p>
            )}
          </div>

          {/* Drops */}
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">
              Drops · {monster.drops.length}
            </div>
            {!canSeeDropNames ? (
              <p className="text-xs text-game-muted italic">
                Drop information unavailable.
                {` (${FAMILIARITY_THRESHOLDS.dropNames - seenCount} more sightings needed)`}
              </p>
            ) : (
              <div className="space-y-2">
                {monster.drops.map((drop, i) => {
                  const name = DROP_ITEMS[drop.itemId] ?? drop.itemId
                  const pct  = Math.round(drop.dropRate * 100)
                  const qty  = drop.quantityMin === drop.quantityMax
                    ? `×${drop.quantityMin}`
                    : `×${drop.quantityMin}–${drop.quantityMax}`
                  return (
                    <div key={i} className="flex items-center gap-3 bg-game-bg rounded-lg px-3 py-2.5">
                      <span className="text-sm text-game-text flex-1">{name}</span>
                      {canSeeDropRates ? (
                        <>
                          <span className="text-xs text-game-text-dim font-mono">{pct}%</span>
                          <span className="text-xs text-game-text-dim font-mono">{qty}</span>
                        </>
                      ) : (
                        <span className="text-xs text-game-muted italic">rate unknown</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
