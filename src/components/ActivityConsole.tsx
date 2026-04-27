import { useState } from 'react'
import { useGameStore, type LogCategory } from '@/stores/useGameStore'

const CATEGORY_META: Record<LogCategory, { label: string; chip: string }> = {
  defeat:  { label: 'Defeat',  chip: 'bg-game-primary/20 text-game-primary border-game-primary/30' },
  loot:    { label: 'Loot',    chip: 'bg-game-gold/20 text-game-gold border-game-gold/30' },
  ko:      { label: 'KO',      chip: 'bg-red-500/20 text-red-400 border-red-500/30' },
  levelup: { label: 'Level',   chip: 'bg-game-green/20 text-game-green border-game-green/30' },
  flee:    { label: 'Flee',    chip: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  craft:   { label: 'Craft',   chip: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  travel:  { label: 'Travel',  chip: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  offline: { label: 'Away',    chip: 'bg-white/10 text-game-muted border-white/10' },
}

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as LogCategory[]

export function ActivityConsole() {
  const eventLog = useGameStore((s) => s.eventLog)
  const [open, setOpen]       = useState(false)
  const [hidden, setHidden]   = useState<Set<LogCategory>>(new Set())

  function toggleFilter(cat: LogCategory) {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const visible = eventLog.filter((e) => !hidden.has(e.category))

  return (
    <>
      {/* Panel — slides up from handle when open */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed bottom-9 inset-x-0 z-40 bg-game-surface border-t border-game-border flex flex-col max-h-[50vh]">
            {/* Filter pills */}
            <div className="flex gap-1.5 px-3 py-2 overflow-x-auto shrink-0 border-b border-game-border/50">
              {ALL_CATEGORIES.map((cat) => {
                const { label, chip } = CATEGORY_META[cat]
                const active = !hidden.has(cat)
                return (
                  <button
                    key={cat}
                    onClick={(e) => { e.stopPropagation(); toggleFilter(cat) }}
                    className={[
                      'shrink-0 text-xs px-2 py-0.5 rounded border transition-opacity',
                      chip,
                      active ? 'opacity-100' : 'opacity-25',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Entries */}
            <div className="overflow-y-auto flex-1 divide-y divide-game-border/30">
              {visible.length === 0 ? (
                <div className="text-center text-game-muted text-xs py-8">No entries</div>
              ) : (
                visible.map((entry, i) => {
                  const { label, chip } = CATEGORY_META[entry.category]
                  return (
                    <div key={i} className="flex items-start gap-2 px-3 py-2">
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border mt-0.5 ${chip}`}>
                        {label}
                      </span>
                      <span className="text-xs text-game-text-dim flex-1 leading-relaxed">{entry.message}</span>
                      <span className="text-xs text-game-muted shrink-0 tabular-nums">t{entry.tick}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Handle — always visible at screen bottom */}
      <div className="fixed bottom-0 inset-x-0 z-40 h-9 bg-game-surface border-t border-game-border flex items-center px-3 gap-2">
        <button
          className="flex-1 flex items-center gap-2 min-w-0"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-xs font-medium text-game-text-dim">Activity Log</span>
          {eventLog.length > 0 && (
            <span className="text-xs text-game-muted">({eventLog.length})</span>
          )}
          <span className="text-game-muted text-xs ml-auto">{open ? '▼' : '▲'}</span>
        </button>
      </div>
    </>
  )
}
