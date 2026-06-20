// On-device perf probe UI (THROWAWAY / dev tool). A floating ⏱ button on the
// battlefield that opens a Start/Stop panel with live readouts and a Copy button —
// tap Copy, then paste the report into a gist. Mounted by BattleView only when the
// probe is enabled (`?probe=1` or DEV), so normal production never renders it.

import { useState, useSyncExternalStore } from 'react'
import { perfProbe, type ProbeLive } from './perfProbe'

function useProbeLive(): ProbeLive {
  return useSyncExternalStore(perfProbe.subscribe, perfProbe.getLive, perfProbe.getLive)
}

// A/B toggles: each strips one GPU-expensive effect (via an <html> class + CSS in
// index.css) so we can watch fps recover and pin the compositor hog. Order =
// likeliest-first for this GPU-bound case.
const TOGGLES: { cls: string; label: string; title: string }[] = [
  { cls: 'perf-noblur', label: 'blur', title: 'Strip backdrop-blur (re-blurs the moving battlefield every frame)' },
  { cls: 'perf-noshadow', label: 'shadow', title: 'Strip box/drop shadows' },
  { cls: 'perf-notransition', label: 'glide', title: 'Strip CSS transitions (the known ~2× fps ceiling)' },
  { cls: 'perf-flat', label: 'flat', title: 'Hide token labels/nubs — bare circles only' },
]

export function PerfPanel() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [raw, setRaw] = useState<string | null>(null)
  const [active, setActive] = useState<string[]>([])
  const live = useProbeLive()

  const toggleEffect = (cls: string) => {
    const root = document.documentElement
    root.classList.toggle(cls)
    setActive(TOGGLES.map((t) => t.cls).filter((c) => root.classList.contains(c)))
  }

  const copy = () => {
    const text = perfProbe.report()
    try {
      navigator.clipboard?.writeText(text).catch(() => setRaw(text))
    } catch {
      setRaw(text)   // clipboard blocked (insecure context / iOS) → show selectable text to long-press copy
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Battlefield performance probe"
        aria-label="Open performance probe"
        className={`absolute bottom-1.5 right-1.5 z-30 px-2 h-6 flex items-center gap-1 rounded-md border text-[10px] backdrop-blur-sm ${
          live.running
            ? 'border-rose-500/70 bg-rose-950/70 text-rose-200 animate-pulse'
            : 'border-game-border bg-game-surface/90 text-game-text-dim hover:bg-white/5'
        }`}
      >
        ⏱ {live.running ? `${live.fps.toFixed(0)}fps` : 'perf'}
      </button>
    )
  }

  const num = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—')

  return (
    <div className="absolute bottom-1.5 right-1.5 z-30 w-56 rounded-lg border border-game-border bg-game-surface/95 p-2 text-[11px] text-game-text backdrop-blur-sm shadow-xl">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-game-text-dim">⏱ perf probe</span>
        <button onClick={() => { setOpen(false); setRaw(null) }} aria-label="Close" className="text-game-text-dim hover:text-game-text px-1">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
        <Stat label="fps" value={num(live.fps, 0)} bad={live.running && live.fps < 30} />
        <Stat label="dense fps" value={live.denseFps > 0 ? num(live.denseFps, 0) : '—'} bad={live.denseFps > 0 && live.denseFps < 30} />
        <Stat label="worst frame" value={`${num(live.worstFrameMs, 0)}ms`} bad={live.worstFrameMs > 60} />
        <Stat label="render/commit" value={`${num(live.renderMsAvg, 1)}ms`} />
        <Stat label="commits" value={String(live.commits)} />
        <Stat label="engine/round" value={`${num(live.roundMsAvg, 1)}ms`} bad={live.roundMsAvg > 30} />
        <Stat label="rounds" value={String(live.rounds)} />
        <Stat label="tokens" value={String(live.tokens)} />
        <Stat label="window" value={`${num(live.elapsedMs / 1000, 0)}s`} />
      </div>

      <div className="mt-2 flex items-center gap-1">
        <button
          onClick={perfProbe.toggle}
          className={`flex-1 h-7 rounded-md border text-[11px] font-medium ${
            live.running
              ? 'border-rose-500/70 bg-rose-950/70 text-rose-200'
              : 'border-emerald-600/70 bg-emerald-950/70 text-emerald-200'
          }`}
        >
          {live.running ? '■ Stop' : '▶ Start'}
        </button>
        <button
          onClick={() => perfProbe.reset()}
          className="h-7 px-2 rounded-md border border-game-border text-game-text-dim hover:bg-white/5"
        >Reset</button>
        <button
          onClick={copy}
          className="h-7 px-2 rounded-md border border-game-border text-game-text-dim hover:bg-white/5"
        >{copied ? '✓' : '⎘ Copy'}</button>
      </div>

      <div className="mt-2 border-t border-game-border/60 pt-1.5">
        <div className="text-[9px] text-game-text-dim mb-1">A/B — strip an effect, watch fps:</div>
        <div className="flex flex-wrap gap-1">
          {TOGGLES.map((t) => {
            const on = active.includes(t.cls)
            return (
              <button
                key={t.cls}
                onClick={() => toggleEffect(t.cls)}
                title={t.title}
                className={`px-1.5 h-6 rounded border text-[10px] ${
                  on
                    ? 'border-amber-500/70 bg-amber-950/70 text-amber-200'
                    : 'border-game-border text-game-text-dim hover:bg-white/5'
                }`}
              >
                {on ? `−${t.label}` : t.label}
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-1.5 text-[9px] leading-tight text-game-text-dim">
        Start, play the crowded battle ~20s, Stop, Copy → paste into a gist.
      </p>

      {raw && (
        <textarea
          readOnly
          value={raw}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 w-full h-24 rounded border border-game-border bg-game-bg/80 p-1 text-[9px] font-mono text-game-text-dim"
        />
      )}
    </div>
  )
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <>
      <span className="text-game-text-dim">{label}</span>
      <span className={`text-right ${bad ? 'text-rose-300' : 'text-game-text'}`}>{value}</span>
    </>
  )
}
