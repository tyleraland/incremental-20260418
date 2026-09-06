import { useGameStore, type TabId } from '@/stores/useGameStore'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'map',       label: 'Map',    icon: '🗺' },
  { id: 'units',     label: 'Heroes', icon: '👤' },
  { id: 'inventory', label: 'Inv',    icon: '🎒' },
  { id: 'guild',     label: 'Guild',  icon: '⚜' },
  { id: 'reports',   label: 'Reports', icon: '📊' },
  { id: 'time',      label: 'Time',   icon: '⏳' },
]

export function TabBar() {
  const { activeTab, setActiveTab, closeEquipContext } = useGameStore((s) => ({
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    closeEquipContext: s.closeEquipContext,
  }))

  function handleTab(id: TabId) {
    if (id !== 'inventory') closeEquipContext()
    setActiveTab(id)
  }

  // Leave the classic tab-bar UI for the default "Tactician" shell — classic is
  // opt-in via `?classic=1`, so drop the flag and reload into the default render.
  function exitClassic() {
    const url = new URL(window.location.href)
    url.searchParams.delete('classic')
    window.location.href = url.toString()
  }

  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-game-surface border-b border-game-border">
      <div className="flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={[
              'flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors',
              activeTab === tab.id
                ? 'text-game-primary'
                : 'text-game-muted hover:text-game-text-dim',
            ].join(' ')}
            onClick={() => handleTab(tab.id)}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
        {/* Settings — leave the classic UI for the default shell. */}
        <button
          onClick={exitClassic}
          title="Settings — switch to the default UI"
          aria-label="Settings — switch to the default UI"
          className="flex flex-col items-center gap-0.5 py-2 px-4 text-game-muted hover:text-game-text-dim transition-colors"
        >
          <span className="text-lg leading-none">⚙</span>
          <span className="text-xs font-medium">Settings</span>
        </button>
      </div>
    </nav>
  )
}
