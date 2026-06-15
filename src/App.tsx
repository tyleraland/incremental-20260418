import { useEffect } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { persistSave, loadPersistedSave } from '@/save'
import { TabBar } from '@/components/TabBar'
import { RosterCarousel } from '@/components/RosterCarousel'
import { UnitReportSheet } from '@/components/UnitReportSheet'
import { OfflineSummary } from '@/components/OfflineSummary'
import { Map } from '@/pages/Map'
import { Units } from '@/pages/Units'
import { Inventory } from '@/pages/Inventory'
import { Guild } from '@/pages/Guild'
import { Reports } from '@/pages/Reports'
import { Time } from '@/pages/Time'
import { ProtoApp } from '@/proto/ProtoApp'

// Dev-only: expose the store on `window.__game` so a Playwright (or devtools)
// session can read and drive live game state — `page.evaluate(() => __game.getState())`
// to assert on it, or `__game.getState().enterBattleView(id)` to poke it. The DEV
// gate dead-code-strips this from production bundles.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __game?: typeof useGameStore }).__game = useGameStore
}

// Reads elapsed time since lastTickAt and applies the right number of ticks.
// Called both by the interval (background throttle catch-up) and visibilitychange.
const TICK_MS = 1000 / TICKS_PER_SECOND  // 200 ms per tick

function catchUp() {
  const { lastTickAt, tick, batchTick, paused } = useGameStore.getState()
  if (paused) return
  const n = Math.floor((Date.now() - lastTickAt) / TICK_MS)
  if (n <= 0) return
  if (n <= 10) { for (let i = 0; i < n; i++) tick() }
  else batchTick(n)
}

function App() {
  const activeTab = useGameStore((s) => s.activeTab)
  const units     = useGameStore((s) => s.units)
  // The hero roster stays pinned across the gameplay tabs so unit selection
  // carries between Map, Heroes, and Inventory.
  const showRoster = activeTab === 'map' || activeTab === 'units' || activeTab === 'inventory'

  // Dev-only perf harness: `?perf` deterministically drops into a heavy
  // open-world battle for a Playwright/profiler run (see src/dev/perfSeed.ts).
  // The import.meta.env.DEV gate dead-code-strips it from production bundles.
  const perfMode = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf')

  // ?proto=1 → the split-screen "Tactician" UI-overhaul prototype. Shares the
  // live tick loop + persisted save (the effects below still run); it just swaps
  // the whole render. Experimental / not wired into the tab bar or save format.
  const protoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('proto')

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

  // Load persisted save once on mount — unless the perf harness is seeding a
  // synthetic scene, in which case start from its clean roster instead.
  useEffect(() => {
    if (perfMode) { import('@/dev/perfSeed').then((m) => m.seedPerfBattle()) }
    else { loadPersistedSave() }
  }, [perfMode])

  // Auto-save every 60 s, foreground only. Skipped in perf mode so the synthetic
  // scene never overwrites a real save.
  useEffect(() => {
    if (perfMode) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') persistSave()
    }, 60_000)
    return () => clearInterval(id)
  }, [perfMode])

  if (protoMode) {
    return (
      <>
        <ProtoApp />
        <UnitReportSheet />
        <OfflineSummary />
      </>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <TabBar />
      {/* pt-16 clears the fixed TabBar; the roster sits below it, pinned (it
          doesn't scroll with the page) on the gameplay tabs. */}
      {showRoster && (
        <div className="shrink-0 pt-16">
          <RosterCarousel units={units} />
        </div>
      )}
      <main className={['flex-1 overflow-y-auto min-h-0', showRoster ? '' : 'pt-16'].join(' ')}>
        {activeTab === 'map'       && <Map />}
        {activeTab === 'units'     && <Units />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'guild'     && <Guild />}
        {activeTab === 'reports'   && <Reports />}
        {activeTab === 'time'      && <Time />}
      </main>
      <UnitReportSheet />
      <OfflineSummary />
    </div>
  )
}

export default App
