import { useGameStore } from '@/stores/useGameStore'
import { TabBar } from '@/components/TabBar'
import { Map } from '@/pages/Map'
import { Units } from '@/pages/Units'
import { Inventory } from '@/pages/Inventory'

function App() {
  const activeTab = useGameStore((s) => s.activeTab)

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 overflow-y-auto pb-16">
        {activeTab === 'map' && <Map />}
        {activeTab === 'units' && <Units />}
        {activeTab === 'inventory' && <Inventory />}
      </main>
      <TabBar />
    </div>
  )
}

export default App
