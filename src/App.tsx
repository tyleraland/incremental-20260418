import { useGameStore } from '@/stores/useGameStore'
import { TabBar } from '@/components/TabBar'
import { Map } from '@/pages/Map'
import { Units } from '@/pages/Units'
import { Inventory } from '@/pages/Inventory'
import { Guild } from '@/pages/Guild'
import { Time } from '@/pages/Time'

function App() {
  const activeTab = useGameStore((s) => s.activeTab)

  return (
    <div className="min-h-full flex flex-col">
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
