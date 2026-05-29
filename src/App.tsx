import { useEffect } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { persistSave, loadPersistedSave } from '@/save'
import { TabBar } from '@/components/TabBar'
import { Map } from '@/pages/Map'
import { Units } from '@/pages/Units'
import { Inventory } from '@/pages/Inventory'
import { Guild } from '@/pages/Guild'
import { Time } from '@/pages/Time'

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
    <div className="h-full flex flex-col">
      <main className="flex-1 overflow-y-auto pt-16">
        {activeTab === 'map'       && <Map />}
        {activeTab === 'units'     && <Units />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'guild'     && <Guild />}
        {activeTab === 'time'      && <Time />}
      </main>
      <TabBar />
    </div>
  )
}

export default App
