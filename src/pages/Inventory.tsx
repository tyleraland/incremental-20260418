import { useState } from 'react'
import { useGameStore, type EquipmentItem, type EquipSlot } from '@/stores/useGameStore'

const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  tool: 'Tool',
  armor: 'Armor',
  accessory: 'Accessory',
}

// ── Equip Context View ────────────────────────────────────────────────────────

function EquipContextView() {
  const { units, equipment, equipContext, equipItem, closeEquipContext, setActiveTab } =
    useGameStore((s) => ({
      units: s.units,
      equipment: s.equipment,
      equipContext: s.equipContext,
      equipItem: s.equipItem,
      closeEquipContext: s.closeEquipContext,
      setActiveTab: s.setActiveTab,
    }))

  if (!equipContext) return null

  const { unitId, slot } = equipContext
  const unit = units.find((u) => u.id === unitId)
  if (!unit) return null

  const currentItemId = unit.equipment[slot]
  const currentItem = equipment.find((e) => e.id === currentItemId)
  const slotItems = equipment.filter((e) => e.slot === slot)

  function isUpgrade(item: EquipmentItem): boolean {
    if (!currentItem) return false
    return (item.stats.attack ?? 0) > (currentItem.stats.attack ?? 0)
  }

  function handleBack() {
    closeEquipContext()
    setActiveTab('units')
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-1.5 text-game-primary text-sm font-medium"
          onClick={handleBack}
        >
          ← Back
        </button>
        <span className="text-game-muted text-sm">·</span>
        <span className="text-game-text-dim text-sm">
          {SLOT_LABELS[slot]} for <span className="text-game-text font-semibold">{unit.name}</span>
        </span>
      </div>

      {/* Unequip option */}
      {currentItemId && (
        <button
          className="w-full text-left px-4 py-3 rounded-xl border border-game-border hover:border-game-primary/50 hover:bg-white/3 transition-colors"
          onClick={() => { equipItem(unitId, slot, null); handleBack() }}
        >
          <div className="text-sm text-game-text-dim">Remove equipment</div>
          <div className="text-xs text-game-muted mt-0.5">Unequip {currentItem?.name}</div>
        </button>
      )}

      <div className="space-y-2">
        {slotItems.map((item) => {
          const isEquipped = item.id === currentItemId
          const upgrade = isUpgrade(item)
          const neutral = !upgrade && !isEquipped

          return (
            <button
              key={item.id}
              disabled={isEquipped}
              className={[
                'w-full text-left px-4 py-3 rounded-xl border transition-colors',
                isEquipped
                  ? 'border-game-primary bg-game-primary/10 cursor-default'
                  : 'border-game-border hover:border-game-primary/50 hover:bg-white/3',
              ].join(' ')}
              onClick={() => { if (!isEquipped) { equipItem(unitId, slot, item.id); handleBack() } }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-game-text flex-1">{item.name}</span>
                {isEquipped && (
                  <span className="text-xs text-game-primary font-semibold">Equipped</span>
                )}
                {upgrade && (
                  <span className="text-xs text-game-green font-semibold">↑ Upgrade</span>
                )}
                {neutral && !isEquipped && currentItem && (
                  <span className="text-xs text-game-muted">Swap</span>
                )}
                {!currentItem && !isEquipped && (
                  <span className="text-xs text-game-text-dim">Equip</span>
                )}
              </div>
              {item.description && (
                <div className="text-xs text-game-text-dim mt-0.5">{item.description}</div>
              )}
              {(item.stats.attack ?? 0) > 0 && (
                <div className="text-xs text-game-gold mt-1">ATK +{item.stats.attack}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Equipment Section ─────────────────────────────────────────────────────────

function EquipmentSection() {
  const [expanded, setExpanded] = useState(true)
  const equipment = useGameStore((s) => s.equipment)

  const bySlot: Record<EquipSlot, typeof equipment> = {
    weapon: equipment.filter((e) => e.slot === 'weapon'),
    tool: equipment.filter((e) => e.slot === 'tool'),
    armor: equipment.filter((e) => e.slot === 'armor'),
    accessory: equipment.filter((e) => e.slot === 'accessory'),
  }

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-semibold">Equipment</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-game-border divide-y divide-game-border/50">
          {(Object.entries(bySlot) as [EquipSlot, typeof equipment][]).map(([slot, items]) => (
            <div key={slot} className="px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">
                {SLOT_LABELS[slot]}
              </div>
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <span className="text-sm text-game-text flex-1">{item.name}</span>
                    {(item.stats.attack ?? 0) > 0 && (
                      <span className="text-xs text-game-gold">ATK +{item.stats.attack}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Misc Section ──────────────────────────────────────────────────────────────

function MiscSection() {
  const [expanded, setExpanded] = useState(true)
  const miscItems = useGameStore((s) => s.miscItems)

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-semibold">Misc</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-game-border divide-y divide-game-border/50 px-4">
          {miscItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-3">
              <span className="text-sm text-game-text flex-1">{item.name}</span>
              <span className="text-xs text-game-text-dim">{item.description}</span>
              <span className="text-sm font-mono text-game-gold font-semibold ml-2">×{item.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export function Inventory() {
  const equipContext = useGameStore((s) => s.equipContext)

  if (equipContext) return <EquipContextView />

  return (
    <div className="p-4 space-y-3 pb-24">
      <EquipmentSection />
      <MiscSection />
    </div>
  )
}
