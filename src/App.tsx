import { useEffect, useState } from 'react'
import { useGameStore, formatDuration } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { persistSave, loadPersistedSave } from '@/save'
import { TabBar } from '@/components/TabBar'
import { Map } from '@/pages/Map'
import { Units } from '@/pages/Units'
import { Inventory } from '@/pages/Inventory'
import { Guild } from '@/pages/Guild'
import { Time } from '@/pages/Time'
import { Codex } from '@/pages/Codex'

// Reads elapsed time since lastTickAt and applies the right number of ticks.
// Called both by the interval (background throttle catch-up) and visibilitychange.
const TICK_MS = 1000 / TICKS_PER_SECOND  // 200 ms per tick

function catchUp() {
  const { lastTickAt, tick, batchTick, paused } = useGameStore.getState()
  if (paused) return
  const n = Math.floor((Date.now() - lastTickAt) / TICK_MS)
  if (n <= 0) return
  if (n === 1) tick()
  else batchTick(n)
}

function OfflineBanner() {
  const summary = useGameStore((s) => s.offlineSummary)
  const dismiss = useGameStore((s) => s.dismissOfflineSummary)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!summary) { setFading(false); return }
    const fadeTimer   = setTimeout(() => setFading(true),  3000)
    const dismissTimer = setTimeout(() => dismiss(),        3300)
    return () => { clearTimeout(fadeTimer); clearTimeout(dismissTimer) }
  }, [summary, dismiss])

  if (!summary) return null

  return (
    <div className={`fixed top-0 inset-x-0 z-50 p-3 pointer-events-none transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      <div className="pointer-events-auto bg-game-surface border border-game-primary/60 rounded-xl p-4 shadow-2xl shadow-game-primary/20 max-w-sm mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-game-text mb-1.5">
              Away for {formatDuration(summary.seconds)}
            </div>
            <div className="space-y-0.5 text-xs text-game-text-dim">
              {summary.monstersDefeated > 0 && (
                <div>⚔ {summary.monstersDefeated} monster{summary.monstersDefeated !== 1 ? 's' : ''} defeated</div>
              )}
              {summary.goldEarned > 0 && (
                <div>✦ {summary.goldEarned} Gold earned</div>
              )}
              {summary.expEarned > 0 && (
                <div>▲ {summary.expEarned} EXP distributed</div>
              )}
              {summary.monstersDefeated === 0 && (
                <div className="text-game-muted italic">No active combat while away.</div>
              )}
            </div>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-game-text-dim hover:text-game-text hover:bg-white/5 transition-colors text-sm"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const activeTab = useGameStore((s) => s.activeTab)

  // Interval fires every second. catchUp() computes how many real seconds
  // have elapsed and applies them all at once, so throttled background tabs
  // and returning from sleep both catch up correctly.
  useEffect(() => {
    const id = setInterval(catchUp, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Immediate catch-up when tab becomes visible again.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') catchUp() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Load persisted save once on mount.
  useEffect(() => { loadPersistedSave() }, [])

  // Auto-save every 60 s, foreground only.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') persistSave()
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-full flex flex-col">
      <OfflineBanner />
      <main className="flex-1 overflow-y-auto pt-16">
        {activeTab === 'map'       && <Map />}
        {activeTab === 'units'     && <Units />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'guild'     && <Guild />}
        {activeTab === 'codex'     && <Codex />}
        {activeTab === 'time'      && <Time />}
      </main>
      <TabBar />
    </div>
  )
}

export default App
