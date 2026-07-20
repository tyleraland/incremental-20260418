import { createPortal } from 'react-dom'
import type { EquipmentItem } from '@/types'
import { CATEGORY_LABELS } from '@/data/equipment'

// A lightweight item detail, mirroring MonsterCodex: stats, requirements,
// sockets and traits for one piece of equipment. Used to inspect quest rewards
// (and reusable anywhere an item needs a closer look) before committing.

const STAT_ROWS: { key: keyof EquipmentItem['stats']; label: string; color: string }[] = [
  { key: 'attack',         label: 'ATK',   color: 'text-game-gold'   },
  { key: 'defense',        label: 'DEF',   color: 'text-sky-400'     },
  { key: 'specialAttack',  label: 'M.ATK', color: 'text-game-accent' },
  { key: 'specialDefense', label: 'M.DEF', color: 'text-violet-400'  },
  { key: 'range',          label: 'RNG',   color: 'text-game-green'  },
]

export function ItemCodex({ item, onClose }: { item: EquipmentItem; onClose: () => void }) {
  const stats = STAT_ROWS.filter(({ key }) => item.stats[key] != null)
  const hasReqs = !!item.requiredLevel || !!item.requiredClasses
  const sockets = item.slots ?? 0

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-game-text text-lg leading-tight">{item.name}</span>
              <span className="text-xs text-game-text-dim bg-game-border rounded-full px-2 py-0.5">{CATEGORY_LABELS[item.category]}</span>
              {item.element && (
                <span className="text-xs text-game-accent bg-game-accent/10 rounded-full px-2 py-0.5 capitalize">{item.element}</span>
              )}
            </div>
            <div className="text-xs text-game-muted mt-0.5 uppercase tracking-widest">Item Detail</div>
          </div>
          <button className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {item.description && <p className="text-sm text-game-text-dim italic leading-snug">{item.description}</p>}

          {/* Stats */}
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Stats</div>
            {stats.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {stats.map(({ key, label, color }) => (
                  <div key={key} className="bg-game-bg rounded-lg py-2.5 text-center">
                    <div className={`text-xl font-bold font-mono leading-none ${color}`}>{item.stats[key]}</div>
                    <div className="text-xs text-game-text-dim mt-1">{label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-game-muted italic">No combat stats — a utility item.</p>
            )}
          </div>

          {/* Requirements */}
          {hasReqs && (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Requirements</div>
              <div className="space-y-1.5">
                {item.requiredLevel ? (
                  <div className="flex items-center gap-2 bg-game-bg rounded-lg px-3 py-2 text-xs text-game-text-dim">
                    <span className="leading-none">⬆</span><span className="flex-1">Level {item.requiredLevel}</span>
                  </div>
                ) : null}
                {item.requiredClasses ? (
                  <div className="flex items-center gap-2 bg-game-bg rounded-lg px-3 py-2 text-xs text-game-text-dim">
                    <span className="leading-none">◆</span><span className="flex-1">{item.requiredClasses.join(', ')}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Sockets + traits */}
          {(sockets > 0 || item.traits.length > 0) && (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Properties</div>
              <div className="flex flex-wrap gap-1">
                {sockets > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-game-accent/10 text-game-accent border border-game-accent/40">
                    {sockets} card socket{sockets !== 1 ? 's' : ''}
                  </span>
                )}
                {item.traits.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60 capitalize">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
