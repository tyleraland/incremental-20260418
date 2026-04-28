import { createPortal } from 'react-dom'
import { useGameStore, MONSTER_REGISTRY, type Location } from '@/stores/useGameStore'

const ELEMENT_COLORS: Record<string, string> = {
  fire:      'text-orange-400 bg-orange-950/40 border-orange-800/50',
  lightning: 'text-yellow-300 bg-yellow-950/40 border-yellow-700/50',
  ice:       'text-sky-300 bg-sky-950/40 border-sky-700/50',
  earth:     'text-amber-600 bg-amber-950/40 border-amber-700/50',
  wind:      'text-green-400 bg-green-950/40 border-green-800/50',
  water:     'text-blue-400 bg-blue-950/40 border-blue-800/50',
  neutral:   'text-game-text-dim bg-game-border/20 border-game-border/50',
}

export function LocationCodex({ location, onClose }: { location: Location; onClose: () => void }) {
  const familiarity = useGameStore((s) => s.locationFamiliarity[location.id] ?? 0)
  const savedSeen   = useGameStore((s) => {
    const saved   = (s.locationMonstersSeen[location.id] ?? []).filter((id) => location.monsterIds.includes(id))
    const inSlots = (s.encounters[location.id] ?? []).map((sl) => sl.monsterId).filter((id) => location.monsterIds.includes(id))
    return [...new Set([...saved, ...inSlots])]
  })

  const famPct       = Math.round((familiarity / location.familiarityMax) * 100)
  const unknownCount = location.monsterIds.length - savedSeen.length

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-game-text text-lg leading-tight">{location.name}</div>
            <div className="text-xs text-game-muted uppercase tracking-widest mt-0.5">
              {location.region} · Location Codex
            </div>
          </div>
          <button className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <p className="text-sm text-game-text-dim leading-relaxed">{location.description}</p>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="uppercase tracking-widest text-game-text-dim">Familiarity</span>
              <span className="text-game-accent">{famPct}%</span>
            </div>
            <div className="w-full bg-game-border rounded-full h-1.5">
              <div className="bg-game-accent h-1.5 rounded-full transition-all" style={{ width: `${famPct}%` }} />
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Encounters</div>
            <div className="space-y-1.5">
              {savedSeen.map((id) => {
                const m = MONSTER_REGISTRY[id]
                if (!m) return null
                return (
                  <div key={id} className="flex items-center gap-2 bg-game-bg rounded-lg px-3 py-2">
                    <span className="text-sm text-game-text flex-1">{m.name}</span>
                    <span className="text-xs text-game-text-dim">Lv.{m.level}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${ELEMENT_COLORS[m.element] ?? ELEMENT_COLORS.neutral}`}>
                      {m.element}
                    </span>
                  </div>
                )
              })}
              {unknownCount > 0 && (
                <div className="flex items-center gap-2 bg-game-bg rounded-lg px-3 py-2 opacity-50">
                  <span className="text-sm text-game-muted flex-1">+{unknownCount} unknown</span>
                  <span className="text-xs text-game-muted">explore to discover</span>
                </div>
              )}
              {savedSeen.length === 0 && unknownCount === 0 && (
                <p className="text-xs text-game-muted italic">No encounters recorded.</p>
              )}
            </div>
          </div>

          {location.traits.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Traits</div>
              <div className="flex flex-wrap gap-1.5">
                {location.traits.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60 capitalize">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
