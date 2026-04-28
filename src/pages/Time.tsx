import { useGameStore, ticksToCalendar, TICKS_PER_DAY, DAYS_PER_SEASON, SEASONS_PER_YEAR } from '@/stores/useGameStore'

declare const __GIT_HASH__: string


function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className="w-full bg-game-border rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-700 ${className}`}
        style={{ width: `${Math.min(value * 100, 100)}%` }}
      />
    </div>
  )
}

export function Time() {
  const ticks       = useGameStore((s) => s.ticks)
  const units       = useGameStore((s) => s.units)
  const paused      = useGameStore((s) => s.paused)
  const togglePause = useGameStore((s) => s.togglePause)

  const { year, seasonName, dayOfSeason, tickOfDay } = ticksToCalendar(ticks)

  const dayProgress    = tickOfDay / TICKS_PER_DAY
  const seasonProgress = (dayOfSeason - 1) / DAYS_PER_SEASON

  const seasonColors: Record<string, string> = {
    Spring: 'bg-green-500',
    Summer: 'bg-yellow-500',
    Autumn: 'bg-orange-500',
    Winter: 'bg-sky-400',
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Time control */}
      <div className="border border-game-border rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-game-text">{paused ? 'Time paused' : 'Time running'}</div>
          <div className="text-xs text-game-muted mt-0.5">{paused ? 'Units and combat are frozen' : 'Ticks advance every second'}</div>
        </div>
        <button
          onClick={togglePause}
          className={[
            'text-sm font-semibold px-4 py-2 rounded-lg border transition-colors',
            paused
              ? 'bg-game-green/10 border-game-green/40 text-game-green hover:bg-game-green/20'
              : 'bg-game-border/50 border-game-border text-game-text-dim hover:border-game-primary/50 hover:text-game-text',
          ].join(' ')}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Calendar */}
      <div className="border border-game-border rounded-xl p-5 space-y-5">
        <div className="text-xs uppercase tracking-widest text-game-text-dim">Calendar</div>

        <div className="space-y-0.5">
          <div className="text-2xl font-bold text-game-text">Year {year}</div>
          <div className="text-lg text-game-accent">
            {seasonName} · Day {dayOfSeason} of {DAYS_PER_SEASON}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-game-text-dim">
              <span>Day progress</span>
              <span>{tickOfDay} / {TICKS_PER_DAY} ticks</span>
            </div>
            <ProgressBar value={dayProgress} className="bg-game-accent" />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-game-text-dim">
              <span>{seasonName} progress</span>
              <span>Day {dayOfSeason} of {DAYS_PER_SEASON}</span>
            </div>
            <ProgressBar value={seasonProgress} className={seasonColors[seasonName] ?? 'bg-game-primary'} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 pt-1">
          {(['Spring', 'Summer', 'Autumn', 'Winter'] as const).map((s) => (
            <div
              key={s}
              className={[
                'text-center text-xs py-1.5 rounded-lg border transition-colors',
                s === seasonName
                  ? 'border-game-primary bg-game-primary/20 text-white font-semibold'
                  : 'border-game-border text-game-text-dim',
              ].join(' ')}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Units roster with ages */}
      <div className="border border-game-border rounded-xl p-5 space-y-3">
        <div className="text-xs uppercase tracking-widest text-game-text-dim">Unit Ages</div>
        <div className="space-y-2">
          {units.map((u) => (
            <div key={u.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-game-text">{u.name}</span>
                {u.class && (
                  <span className="text-xs text-game-text-dim px-1.5 py-0.5 rounded border border-game-border">
                    {u.class}
                  </span>
                )}
              </div>
              <span className="text-game-text-dim">Age {u.age}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-game-muted text-center">
        {TICKS_PER_DAY} ticks/day · {DAYS_PER_SEASON} days/season · {SEASONS_PER_YEAR} seasons/year
      </div>

      {/* Debug */}
      <div className="border border-game-border rounded-xl px-4 py-3">
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Debug</div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-game-muted">Commit</span>
          <span className="font-mono text-game-text-dim">{__GIT_HASH__}</span>
        </div>
      </div>
    </div>
  )
}
