import { useState } from 'react'
import {
  useGameStore,
  type EquipmentItem,
  type EquipSlot,
  type ItemCategory,
  SLOT_COMPATIBLE,
  SLOT_LABELS,
  CATEGORY_LABELS,
} from '@/stores/useGameStore'

// ── Stat delta helpers ────────────────────────────────────────────────────────

const STAT_KEYS = ['attack', 'defense', 'specialAttack', 'specialDefense'] as const
const STAT_SHORT: Record<(typeof STAT_KEYS)[number], string> = {
  attack: 'ATK',
  defense: 'DEF',
  specialAttack: 'SP.ATK',
  specialDefense: 'SP.DEF',
}

function StatDeltas({ item, current }: { item: EquipmentItem; current: EquipmentItem | null }) {
  const deltas = STAT_KEYS.map((k) => ({
    key: k,
    d: (item.stats[k] ?? 0) - (current?.stats[k] ?? 0),
  })).filter((x) => x.d !== 0)

  if (deltas.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {deltas.map(({ key, d }) => (
        <span key={key} className={`text-xs font-mono ${d > 0 ? 'text-game-green' : 'text-red-400'}`}>
          {d > 0 ? '+' : ''}{d} {STAT_SHORT[key]}
        </span>
      ))}
    </div>
  )
}

function totalStatScore(item: EquipmentItem) {
  return STAT_KEYS.reduce((sum, k) => sum + (item.stats[k] ?? 0), 0)
}

// ── Equip Context View ────────────────────────────────────────────────────────

function EquipContextView() {
  const { units, equipment, equipContext, equipItem, closeEquipContext, setActiveTab } = useGameStore(
    (s) => ({
      units: s.units,
      equipment: s.equipment,
      equipContext: s.equipContext,
      equipItem: s.equipItem,
      closeEquipContext: s.closeEquipContext,
      setActiveTab: s.setActiveTab,
    })
  )

  if (!equipContext) return null
  const { unitId, slot } = equipContext
  const unit = units.find((u) => u.id === unitId)
  if (!unit) return null

  const currentId = unit.equipment[slot]
  const currentItem = equipment.find((e) => e.id === currentId) ?? null

  const mainHandItem = equipment.find((e) => e.id === unit.equipment.mainHand)
  const offHandLocked = slot === 'offHand' && mainHandItem?.category === 'weapon-2h'

  const compatible: ItemCategory[] = SLOT_COMPATIBLE[slot]
  const slotItems = equipment.filter((e) => compatible.includes(e.category))

  // Group by category
  const grouped = compatible.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = slotItems.filter((e) => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  function handleBack() {
    closeEquipContext()
    setActiveTab('units')
  }

  function handleEquip(itemId: string | null) {
    equipItem(unitId, slot, itemId)
    handleBack()
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button className="text-game-primary text-sm font-medium" onClick={handleBack}>
          ← Back
        </button>
        <span className="text-game-muted">·</span>
        <span className="text-game-text-dim text-sm">
          {SLOT_LABELS[slot]} — <span className="text-game-text font-semibold">{unit.name}</span>
        </span>
      </div>

      {/* Locked state */}
      {offHandLocked && (
        <div className="rounded-xl border border-game-border bg-game-surface px-4 py-5 text-center">
          <div className="text-game-text-dim text-sm">Off hand locked</div>
          <div className="text-xs text-game-muted mt-1">Equip a 1H weapon or tool in the main hand first</div>
        </div>
      )}

      {!offHandLocked && (
        <>
          {/* Unequip */}
          {currentId && (
            <button
              className="w-full text-left px-4 py-3 rounded-xl border border-game-border hover:border-game-primary/50 transition-colors"
              onClick={() => handleEquip(null)}
            >
              <div className="text-sm text-game-text-dim">Remove — {currentItem?.name}</div>
            </button>
          )}

          {/* Items by category group */}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">
                {CATEGORY_LABELS[cat as ItemCategory]}
              </div>
              <div className="space-y-2">
                {items.map((item) => {
                  const isEquipped = item.id === currentId
                  const score = totalStatScore(item) - totalStatScore(currentItem ?? { id: '', name: '', category: 'accessory', stats: {} })
                  const isUpgrade = !isEquipped && score > 0

                  return (
                    <button
                      key={item.id}
                      disabled={isEquipped}
                      onClick={() => !isEquipped && handleEquip(item.id)}
                      className={[
                        'w-full text-left px-4 py-3 rounded-xl border transition-colors',
                        isEquipped
                          ? 'border-game-primary bg-game-primary/10 cursor-default'
                          : 'border-game-border hover:border-game-primary/50 active:bg-white/3',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-game-text flex-1">{item.name}</span>
                        {isEquipped && <span className="text-xs text-game-primary font-semibold">Equipped</span>}
                        {isUpgrade && <span className="text-xs text-game-green font-semibold">↑ Upgrade</span>}
                      </div>
                      {item.description && (
                        <div className="text-xs text-game-text-dim mt-0.5">{item.description}</div>
                      )}
                      <StatDeltas item={item} current={currentItem} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {slotItems.length === 0 && (
            <div className="text-center text-game-muted text-sm py-8">
              No {SLOT_LABELS[slot].toLowerCase()} items in inventory
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Equipment section ─────────────────────────────────────────────────────────

function EquipmentSection() {
  const [expanded, setExpanded] = useState(true)
  const equipment = useGameStore((s) => s.equipment)

  const categories: ItemCategory[] = ['weapon-1h', 'weapon-2h', 'tool', 'shield', 'armor', 'accessory']
  const grouped = categories.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = equipment.filter((e) => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-semibold">Equipment</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-game-border divide-y divide-game-border/50">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">
                {CATEGORY_LABELS[cat as ItemCategory]}
              </div>
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <span className="text-sm text-game-text flex-1">{item.name}</span>
                    <div className="flex gap-2">
                      {STAT_KEYS.filter((k) => item.stats[k]).map((k) => (
                        <span key={k} className="text-xs text-game-gold">
                          +{item.stats[k]} {STAT_SHORT[k]}
                        </span>
                      ))}
                    </div>
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

// ── Misc section ──────────────────────────────────────────────────────────────

function MiscSection() {
  const [expanded, setExpanded] = useState(true)
  const miscItems = useGameStore((s) => s.miscItems)

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-4"
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

// ── Inventory page ────────────────────────────────────────────────────────────

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
