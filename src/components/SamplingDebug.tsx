import { useState } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { SAMPLING, SAMPLING_DEFAULTS, type SamplingConfig } from '@/lib/sampling'

// Compact number: 1234 → "1.2k", 2_500_000 → "2.5M".
function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(n).toString()
}

function relAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`
}

// Debug readout: if/when the last OFFLINE catch-up (batchTick) ran, its size, the
// sim cost (wall-ms / rounds), and the per-location cost/output — so you can see
// catch-up happening and weigh sampling cost vs. fidelity. Catch-up fires whenever
// ≥2s of real time elapses between ticks: returning to the tab, a reload, or a
// throttled background interval (live ticks ≤2s don't count as catch-up).
export function CatchUpReadout() {
  const cu = useGameStore((s) => s.lastCatchUp)
  return (
    <div className="text-[10px] leading-snug">
      <div className="uppercase tracking-widest text-game-muted">Offline catch-up</div>
      {!cu ? (
        <div className="mt-1 text-game-muted">
          None this session. Runs on tab-return, reload, or background throttle (≥2s between ticks).
        </div>
      ) : (
        <>
          <div className="mt-1 font-mono text-game-text-dim">
            {relAgo(Date.now() - cu.at)} · batched {fmt(cu.secs)}s ({fmt(cu.ticks)} ticks) · sim {cu.wallMs}ms · {fmt(cu.locations.reduce((a, l) => a + l.rounds, 0))} rounds
          </div>
          {cu.locations.length > 0 && (
            <div className="mt-1 space-y-0.5 font-mono text-game-text-dim">
              {cu.locations.map((l) => (
                <div key={l.locationId} className="flex justify-between gap-2">
                  <span className="truncate">{l.locationName}{l.stalled ? ' ⚠' : ''}</span>
                  <span className="text-game-muted shrink-0">
                    {l.windows}w · {l.rounds}r · {fmt(l.kills)}k · {fmt(l.gold)}g{l.cycles ? ` · ${l.cycles} trips` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Editable sampling / sim-budget knobs. Mutates the SAMPLING singleton in place —
// the runtime tuning seam — so changes take effect on the next catch-up. Not saved;
// reset restores the shipped defaults. (For cost-vs-fidelity sweeps.)
const KNOBS: { key: keyof SamplingConfig; label: string; hint: string; step: number }[] = [
  { key: 'windowTicks',         label: 'Window ticks',    hint: '~real time / sample window', step: 1500 },
  { key: 'maxWindows',          label: 'Max windows',     hint: 'cap on sample windows',      step: 1 },
  { key: 'windowRoundCap',      label: 'Window rounds',   hint: 'rounds / window slice',      step: 10 },
  { key: 'windowMsBudget',      label: 'Window ms',       hint: 'wall-ms / window slice',     step: 5 },
  { key: 'primeRoundCap',       label: 'Prime rounds',    hint: 'cold-prime rounds',          step: 50 },
  { key: 'primeMsBudget',       label: 'Prime ms',        hint: 'cold-prime wall-ms',         step: 10 },
  { key: 'offscreenCreditTicks', label: 'Off-screen ticks', hint: 'unwatched credit interval', step: 5 },
  { key: 'cycleTownDwellTicks',   label: 'Town dwell',      hint: 'offline: ticks in town / trip',    step: 10 },
  { key: 'cycleTravelPerHopTicks', label: 'Travel / hop',   hint: 'offline: one-way travel per hop',   step: 5 },
]

export function SamplingControls() {
  const [, bump] = useState(0)
  const set = (key: keyof SamplingConfig, v: number) => { SAMPLING[key] = Math.max(1, Math.round(v)); bump((x) => x + 1) }
  const StepBtn = ({ onClick, children }: { onClick: () => void; children: string }) => (
    <button onClick={onClick} className="w-6 h-6 rounded flex items-center justify-center text-sm bg-game-border/60 text-game-text hover:bg-game-border">{children}</button>
  )
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-widest text-game-muted">Sampling budgets (runtime, not saved)</div>
      {KNOBS.map((k) => (
        <div key={k.key} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-game-text-dim truncate" title={k.hint}>{k.label}</span>
          <StepBtn onClick={() => set(k.key, SAMPLING[k.key] - k.step)}>−</StepBtn>
          <span className="w-14 text-center font-mono text-game-text tabular-nums">{fmt(SAMPLING[k.key])}</span>
          <StepBtn onClick={() => set(k.key, SAMPLING[k.key] + k.step)}>+</StepBtn>
          <span className="text-[10px] text-game-muted truncate min-w-0">{k.hint}</span>
        </div>
      ))}
      <button
        onClick={() => { Object.assign(SAMPLING, SAMPLING_DEFAULTS); bump((x) => x + 1) }}
        className="text-[11px] px-2 py-1 rounded border border-game-border text-game-text-dim hover:bg-white/5"
      >
        Reset to defaults
      </button>
    </div>
  )
}

// On-demand offline fast-forward: advance the game clock by a chosen span and run
// the offline catch-up now (the same batchTick a real absence triggers), so you can
// watch/tune the return-to-town loop without actually going AFK. Deploy heroes with
// a supplies loadout first to exercise the cycle model + supply stalls.
const SIM_STEPS: { label: string; secs: number }[] = [
  { label: '1m', secs: 60 }, { label: '5m', secs: 300 }, { label: '15m', secs: 900 },
  { label: '1h', secs: 3600 }, { label: '4h', secs: 14400 }, { label: '8h', secs: 28800 },
]

export function OfflineSimulator() {
  const [note, setNote] = useState<string | null>(null)
  const run = (secs: number) => {
    const before = Date.now()
    useGameStore.getState().batchTick(Math.round(secs * TICKS_PER_SECOND))
    const cu = useGameStore.getState().lastCatchUp
    const trips = cu?.locations.reduce((a, l) => a + (l.cycles ?? 0), 0) ?? 0
    const kills = cu?.locations.reduce((a, l) => a + l.kills, 0) ?? 0
    const stalled = cu?.locations.some((l) => l.stalled) ?? false
    setNote(`+${fmt(secs)}s in ${Date.now() - before}ms · ${fmt(kills)} kills · ${trips} town trips${stalled ? ' · ⚠ a hero ran out of supplies' : ''}`)
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-widest text-game-muted">Offline simulator (fast-forward + catch-up)</div>
      <div className="flex flex-wrap gap-1.5">
        {SIM_STEPS.map((s) => (
          <button key={s.label} onClick={() => run(s.secs)}
            className="text-xs px-2.5 py-1 rounded border border-game-border text-game-text-dim hover:border-game-primary/50 transition-colors">
            {s.label}
          </button>
        ))}
      </div>
      {note && <div className="text-[10px] text-game-text-dim font-mono">{note}</div>}
      <div className="text-[10px] text-game-muted">Jumps the clock and runs offline catch-up now. Deploy heroes with a loadout to exercise the return-to-town loop.</div>
    </div>
  )
}
