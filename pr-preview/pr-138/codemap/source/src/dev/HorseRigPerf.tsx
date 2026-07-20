import { TOKEN_SKINS } from '@/render/skins'
import { HorsePaperAsset } from '@/render/paperRig/HorsePaperAsset'

type Mode = 'current' | 'detail' | 'animated' | 'far'
const VALID_MODES = new Set<Mode>(['current', 'detail', 'animated', 'far'])
const dims = { width: '54px', height: '54px', fontSize: '20px' }

function initialMode(): Mode {
  const value = new URLSearchParams(window.location.search).get('mode') as Mode
  return VALID_MODES.has(value) ? value : 'detail'
}

function initialCount() {
  const value = Number(new URLSearchParams(window.location.search).get('count') ?? 80)
  return Number.isFinite(value) ? Math.max(8, Math.min(160, Math.round(value))) : 80
}

function setMode(mode: Mode) {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', mode)
  window.location.href = url.toString()
}

export default function HorseRigPerf() {
  const mode = initialMode()
  const count = initialCount()
  const CurrentPaper = TOKEN_SKINS.paper
  const tokens = Array.from({ length: count }, (_, index) => ({
    id: index,
    heading: (index % 8) * 45,
    delay: -((index * 0.137) % 2.4),
    duration: 1.35 + (index % 7) * 0.11,
  }))
  return (
    <main data-horse-rig-perf={mode} className="min-h-screen bg-game-bg text-game-text p-3 pt-12 overflow-hidden">
      <style>{`
        @keyframes horse-rig-drift { from { transform: translate3d(-3px,-2px,0) rotate(-1.2deg) } to { transform: translate3d(4px,3px,0) rotate(1.2deg) } }
        @keyframes horse-rig-bob { 0%,100% { transform: translate(0,0) } 50% { transform: translate(1.8px,-1.2px) } }
        @keyframes horse-rig-sway { 0%,100% { transform: rotate(-5deg) } 50% { transform: rotate(6deg) } }
        [data-rig-token] { animation: horse-rig-drift var(--rig-duration) ease-in-out var(--rig-delay) infinite alternate; will-change: transform }
        [data-rig-animate="horse-rig-bob"] { animation: horse-rig-bob 720ms ease-in-out var(--rig-delay) infinite; transform-box: fill-box; transform-origin: center; will-change: transform }
        [data-rig-animate="horse-rig-sway"] { animation: horse-rig-sway 840ms ease-in-out var(--rig-delay) infinite; transform-box: fill-box; transform-origin: center; will-change: transform }
      `}</style>
      <header className="max-w-4xl mx-auto mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-game-primary">paper-rig/1 · horse · 60° · eight headings</p>
          <h1 className="text-xl font-semibold">Compiled horse density probe</h1>
          <p className="text-[11px] text-game-muted">{count} moving tokens · mode {mode}</p>
        </div>
        <nav className="flex flex-wrap justify-end gap-1">
          {([...VALID_MODES] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={`px-2 py-1 rounded border text-[10px] ${item === mode ? 'border-game-primary bg-game-primary/20' : 'border-game-border text-game-muted'}`}>{item}</button>)}
        </nav>
      </header>
      <section
        data-rig-perf-arena
        className="max-w-4xl mx-auto h-[calc(100vh-118px)] min-h-[560px] grid grid-cols-8 grid-rows-10 place-items-center rounded-xl border border-game-border bg-game-surface/50 overflow-hidden"
      >
        {tokens.map((token) => (
          <div
            key={token.id}
            data-rig-token
            style={{
              '--rig-delay': `${token.delay.toFixed(2)}s`,
              '--rig-duration': `${token.duration.toFixed(2)}s`,
            } as React.CSSProperties}
          >
            {mode === 'current' ? (
              <CurrentPaper glyph="HO" tone="enemy" bodyShape="beast" alive selected={false} creature facingDeg={token.heading} moving dims={dims} />
            ) : (
              <HorsePaperAsset headingDeg={token.heading} lod={mode === 'far' ? 'far' : 'detail'} animateParts={mode === 'animated'} />
            )}
          </div>
        ))}
      </section>
    </main>
  )
}
