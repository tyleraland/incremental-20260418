import { useEffect, lazy, Suspense, type ReactNode } from 'react'
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

// Developer tool pages, reached from the ☰ Menu (Developer section) or by URL.
// They now ship in PRODUCTION too so `main`/Pages carries the debug kit — but
// only in sandbox (the dev progression mode); curated stays the clean onramp.
// See `devToolsEnabled` below. Lazy so each stays a separate chunk out of the
// main bundle.
//   ?gallery=1  — pure-render contact sheet of the whole visual language.
//   ?workshop=1 — live paper-prop authoring (edit a PropDef, see + copy it).
//   ?mapgen=1   — seed contact sheet + layer inspector for the map generator.
const SkinGallery  = lazy(() => import('@/dev/SkinGallery'))
const AssetWorkshop = lazy(() => import('@/dev/AssetWorkshop'))
const MapgenLab    = lazy(() => import('@/dev/MapgenLab'))

// The dev tool pages and perf harness are gated to sandbox mode (or a real DEV
// build). Sandbox is the dev/everything-open mode; curated is the new-player
// build and stays free of debug surfaces. Read once at render (a full reload
// mounts the page fresh, so the bootstrapped mode is current).
const DEV_TOOL_PARAMS = ['gallery', 'workshop', 'mapgen'] as const
function devToolsEnabled() {
  return import.meta.env.DEV || useGameStore.getState().progressionMode === 'sandbox'
}

// The dev pages have no chrome of their own, so wrap them with a fixed "← Game"
// button that drops the query param and reloads back into the app — otherwise a
// menu-reached page is a dead end (you'd have to hand-edit the URL).
function DevPage({ children }: { children: ReactNode }) {
  const back = () => {
    const q = new URLSearchParams(window.location.search)
    DEV_TOOL_PARAMS.forEach((k) => q.delete(k))
    const s = q.toString()
    window.location.search = s
  }
  return (
    <Suspense fallback={null}>
      {children}
      <button
        onClick={back}
        className="fixed top-2 left-2 z-[100] px-3 py-1.5 rounded-lg border border-game-border bg-game-surface/90 text-game-text text-sm shadow-lg hover:bg-game-surface"
      >← Game</button>
    </Suspense>
  )
}

// Reads elapsed time since lastTickAt and applies the right number of ticks.
// Called both by the interval (background throttle catch-up) and visibilitychange.
const TICK_MS = 1000 / TICKS_PER_SECOND  // 200 ms per tick

// On a real catch-up we EXTRAPOLATE the bulk of the absence (batchTick — cheap, no
// spatial sim) but then PLAY OUT the final minute for real, tick by tick. The live
// path runs sparse open-world combat (trickle spawns, vision gating, wandering), so
// the rolling "recent stats" (Hero tab dmg/m, dmg/s) reflect realized play instead
// of the saturated priming estimate batchTick produces. One minute of real ticks is
// bounded (~300 rounds) and one-time on return. See the offline notes in AGENTS.md.
const REALIZED_TAIL_TICKS = TICKS_PER_SECOND * 60  // 300 ticks = the realized last minute

function catchUp() {
  const { lastTickAt, tick, batchTick, paused } = useGameStore.getState()
  if (paused) return
  const n = Math.floor((Date.now() - lastTickAt) / TICK_MS)
  if (n <= 0) return
  if (n <= 10) { for (let i = 0; i < n; i++) tick(); return }   // steady state: fixed-step cadence
  // Extrapolate everything older than the realized tail (no-op when the whole jump
  // fits in the tail), then live-sim the tail so recent stats are real.
  const tail = Math.min(n, REALIZED_TAIL_TICKS)
  batchTick(n - tail)
  for (let i = 0; i < tail; i++) tick()
  // Those live ticks ran in a tight loop (not wall time), each advancing lastTickAt
  // by a fixed step — so it now sits ~tail ticks ahead of now. Resync to the clock,
  // exactly as a bare batchTick does, so the next catch-up measures from now.
  useGameStore.setState({ lastTickAt: Date.now() })
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

  // The split-screen "Tactician" shell (src/proto) is now the DEFAULT UI. The
  // legacy tab-bar UI is kept as a fallback behind `?classic=1` (and the perf
  // harness, which expects the old single-screen BattleView). Both share the same
  // live tick loop + persisted save — only the render differs.
  const classicMode = perfMode || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('classic'))

  // Interval fires every second. catchUp() computes how many real seconds
  // have elapsed and applies them all at once, so throttled background tabs
  // and returning from sleep both catch up correctly. Perf mode instead steps
  // ticks on a FIXED cadence (perfSeed.ts) — wall-clock batching would let a
  // throttled run's sim state diverge from an unthrottled one's.
  useEffect(() => {
    if (perfMode) return
    const id = setInterval(catchUp, TICK_MS)
    return () => clearInterval(id)
  }, [perfMode])

  // Immediate catch-up when tab becomes visible again.
  useEffect(() => {
    if (perfMode) return
    const onVisible = () => { if (document.visibilityState === 'visible') catchUp() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [perfMode])

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

  if (typeof window !== 'undefined' && devToolsEnabled()) {
    const params = new URLSearchParams(window.location.search)
    if (params.has('gallery'))  return <DevPage><SkinGallery /></DevPage>
    if (params.has('workshop')) return <DevPage><AssetWorkshop /></DevPage>
    if (params.has('mapgen'))   return <DevPage><MapgenLab /></DevPage>
  }

  if (!classicMode) {
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
