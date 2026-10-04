import { useState } from 'react'
import { useGameStore, ticksToCalendar, TICKS_PER_DAY, DAYS_PER_SEASON, SEASONS_PER_YEAR, type LogCategory } from '@/stores/useGameStore'
import { exportSave, importSave, persistSave, switchProgressionMode } from '@/save'
import { CatchUpReadout, SamplingControls, OfflineSimulator, BugReports } from '@/components/SamplingDebug'

function ResetSaveButton() {
  const resetSave = useGameStore((s) => s.resetSave)
  const [confirm, setConfirm] = useState(false)

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-game-text-dim">Are you sure? This cannot be undone.</span>
        <button
          onClick={() => { resetSave(); setConfirm(false) }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Yes, reset
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs px-3 py-1.5 rounded-lg border border-game-border text-game-text-dim hover:border-game-primary/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs px-3 py-1.5 rounded-lg border border-game-border text-game-text-dim hover:border-red-500/50 hover:text-red-400 transition-colors"
    >
      Reset Save
    </button>
  )
}

// Feature-unfolding stance. Sandbox and curated have *separate saves*, so
// switching is non-destructive: it flushes the current game to its slot and loads
// the other (or starts a fresh one for it the first time). Resetting (the Reset
// Save button below) only wipes the active mode's slot. See src/lib/unlocks.ts.
function ProgressionModeControl() {
  const mode = useGameStore((s) => s.progressionMode)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-game-text-dim">Progression</span>
        <span className="text-xs font-mono text-game-text capitalize">{mode}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['sandbox', 'curated'] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchProgressionMode(m)}
            disabled={m === mode}
            title={m === mode ? `Currently in ${m}` : `Switch to your ${m} save (your ${mode} game is saved first)`}
            className={['text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors',
              m === mode
                ? 'border-game-primary bg-game-primary/15 text-game-primary cursor-default'
                : 'border-game-border text-game-text-dim hover:border-game-primary/50'].join(' ')}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-game-muted leading-snug">
        Sandbox and curated keep separate saves — switching never overwrites the other.
      </p>
    </div>
  )
}

// Battlefield skin — render-only A/B of the token/ground look (the seam for the
// graphics restyle; see src/render/skins.tsx). Also switchable via ?skin=paper
// or ?skin=circle.
function BattleSkinControl() {
  const skin = useGameStore((s) => s.battleSkin)
  const setSkin = useGameStore((s) => s.setBattleSkin)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-game-text-dim">Battle skin</span>
        <span className="text-xs font-mono text-game-text capitalize">{skin}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['circle', 'paper', 'horse'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setSkin(m)}
            className={['text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors',
              m === skin
                ? 'border-game-primary bg-game-primary/15 text-game-primary cursor-default'
                : 'border-game-border text-game-text-dim hover:border-game-primary/50'].join(' ')}
          >
            {m}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-game-muted leading-snug">
        Render-only: swaps the battlefield token bodies + ground. Same battle, different look.
      </p>
    </div>
  )
}

// §logistics — deploy mode toggle. 'instant' keeps the teleport-on-deploy; in
// 'open-world' a hero deployed to a directly portal-linked neighbour of their
// current map WALKS there (marching to the portal, then hopping across) instead.
function DeployModeControl() {
  const mode = useGameStore((s) => s.deployMode)
  const setMode = useGameStore((s) => s.setDeployMode)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-game-text-dim">Deploy</span>
        <span className="text-xs font-mono text-game-text">{mode === 'instant' ? 'Instant' : 'Open world'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['instant', 'open-world'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={['text-xs px-3 py-1.5 rounded-lg border transition-colors',
              m === mode
                ? 'border-game-primary bg-game-primary/15 text-game-primary cursor-default'
                : 'border-game-border text-game-text-dim hover:border-game-primary/50'].join(' ')}
          >
            {m === 'instant' ? 'Instant deploy' : 'Open-world travel'}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-game-muted leading-snug">
        Placeholder — will toggle teleport-on-deploy vs overworld travel once that lands.
      </p>
    </div>
  )
}

// Copy the whole-game save string out / paste one in. A player backup, and the
// highest-fidelity bug-repro handoff (it includes live battles via battlesCodec,
// so a pasted save reproduces the exact in-progress fights too).
function SaveTransfer() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const doExport = () => {
    const str = exportSave()
    setText(str)
    try { navigator.clipboard?.writeText(str) } catch { /* clipboard unavailable */ }
    setStatus('Copied save to clipboard')
  }
  const doImport = () => {
    if (!importSave(text)) { setStatus('Could not read that save string'); return }
    persistSave()   // write the imported state straight to localStorage
    setStatus('Save imported')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg border border-game-border text-game-text-dim hover:border-game-primary/50 transition-colors"
      >
        Export / Import Save
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={doExport} className="text-xs px-3 py-1.5 rounded-lg border border-game-border text-game-text-dim hover:border-game-primary/50 transition-colors">Export (copy)</button>
        <button onClick={doImport} disabled={!text.trim()} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${text.trim() ? 'border-game-border text-game-text-dim hover:border-game-primary/50' : 'border-game-border/40 text-game-muted cursor-not-allowed'}`}>Import (paste below)</button>
        <button onClick={() => { setOpen(false); setStatus(null) }} className="text-xs px-3 py-1.5 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors ml-auto">Close</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a save string here to import, or hit Export to copy this game's save."
        spellCheck={false}
        className="w-full h-24 text-[10px] font-mono p-2 rounded-lg border border-game-border bg-game-bg text-game-text-dim resize-none"
      />
      {status && <div className="text-xs text-game-accent">{status}</div>}
    </div>
  )
}

// __GIT_HASH__ / __GIT_LOG__ are Vite `define` globals — declared in src/vite-env.d.ts.

const LOG_META: Record<LogCategory, { label: string; chip: string }> = {
  victory: { label: 'Victory', chip: 'bg-game-green/20 text-game-green border-game-green/30' },
  defeat:  { label: 'Defeat',  chip: 'bg-game-primary/20 text-game-primary border-game-primary/30' },
  loot:    { label: 'Loot',    chip: 'bg-game-gold/20 text-game-gold border-game-gold/30' },
  ko:      { label: 'KO',      chip: 'bg-red-500/20 text-red-400 border-red-500/30' },
  levelup: { label: 'Level',   chip: 'bg-game-green/20 text-game-green border-game-green/30' },
  craft:   { label: 'Craft',   chip: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  travel:  { label: 'Travel',  chip: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  offline: { label: 'Away',    chip: 'bg-white/10 text-game-muted border-white/10' },
}
const ALL_CATEGORIES = Object.keys(LOG_META) as LogCategory[]

function ActivityLog() {
  const eventLog = useGameStore((s) => s.eventLog)
  const [hidden, setHidden] = useState<Set<LogCategory>>(new Set())

  function toggleFilter(cat: LogCategory) {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const visible = eventLog.filter((e) => !hidden.has(e.category))

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-game-border/50">
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Activity Log</div>
        <div className="flex gap-1.5 flex-wrap">
          {ALL_CATEGORIES.map((cat) => {
            const { label, chip } = LOG_META[cat]
            return (
              <button
                key={cat}
                onClick={() => toggleFilter(cat)}
                className={[
                  'text-xs px-2 py-0.5 rounded border transition-opacity',
                  chip,
                  !hidden.has(cat) ? 'opacity-100' : 'opacity-25',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-game-border/30">
        {visible.length === 0 ? (
          <div className="text-center text-game-muted text-xs py-8">No entries</div>
        ) : (
          visible.map((entry, i) => {
            const { label, chip } = LOG_META[entry.category]
            return (
              <div key={i} className="flex items-start gap-2 px-4 py-2">
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border mt-0.5 ${chip}`}>{label}</span>
                <span className="text-xs text-game-text-dim flex-1 leading-relaxed">{entry.message}</span>
                <span className="text-xs text-game-muted shrink-0 tabular-nums">t{entry.tick}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}


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

      <ActivityLog />

      {/* Debug */}
      <div className="border border-game-border/40 rounded-xl px-4 py-3 space-y-3">
        <div className="text-xs uppercase tracking-widest text-game-text-dim">Debug</div>
        <div className="text-xs text-game-muted">Build: <span className="font-mono text-game-text-dim">{__GIT_HASH__}</span></div>
        {__GIT_LOG__.length > 0 && (
          <ul className="text-xs space-y-1">
            {__GIT_LOG__.map((c, i) => (
              <li key={c.hash} className="flex gap-2 items-baseline leading-snug">
                <span className={`font-mono shrink-0 ${i === 0 ? 'text-game-accent' : 'text-game-muted'}`}>{c.hash}</span>
                <span className={i === 0 ? 'text-game-text' : 'text-game-text-dim'}>{c.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-2 border-t border-game-border/40">
          <BugReports />
        </div>
        <div className="pt-2 border-t border-game-border/40">
          <CatchUpReadout />
        </div>
        <div className="pt-2 border-t border-game-border/40">
          <OfflineSimulator />
        </div>
        <div className="pt-2 border-t border-game-border/40">
          <SamplingControls />
        </div>
        <div className="pt-2 border-t border-game-border/40">
          <ProgressionModeControl />
        </div>
        <div className="pt-2 border-t border-game-border/40">
          <DeployModeControl />
        </div>
        <div className="pt-2 border-t border-game-border/40">
          <BattleSkinControl />
        </div>
        <SaveTransfer />
        <ResetSaveButton />
      </div>
    </div>
  )
}
