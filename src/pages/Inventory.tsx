import { useState } from 'react'
import {
  useGameStore,
  type EquipmentItem,
  type EquipSlot,
  type ItemCategory,
  SLOT_COMPATIBLE,
  SLOT_LABELS,
  CATEGORY_LABELS,
  RECIPE_REGISTRY,
  getItemTraits,
} from '@/stores/useGameStore'
import { TraitRow } from '@/components/TraitBubble'

// ── Stat delta helpers ────────────────────────────────────────────────────────

const STAT_KEYS = ['attack', 'defense', 'specialAttack', 'specialDefense'] as const
const STAT_SHORT: Record<(typeof STAT_KEYS)[number], string> = {
  attack: 'ATK', defense: 'DEF', specialAttack: 'SP.ATK', specialDefense: 'SP.DEF',
}

function StatDeltas({ item, current }: { item: EquipmentItem; current: EquipmentItem | null }) {
  const deltas = STAT_KEYS
    .map((k) => ({ k, d: (item.stats[k] ?? 0) - (current?.stats[k] ?? 0) }))
    .filter((x) => x.d !== 0)
  if (!deltas.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {deltas.map(({ k, d }) => (
        <span key={k} className={`text-xs font-mono ${d > 0 ? 'text-game-green' : 'text-red-400'}`}>
          {d > 0 ? '+' : ''}{d} {STAT_SHORT[k]}
        </span>
      ))}
    </div>
  )
}

function totalScore(item: EquipmentItem) {
  return STAT_KEYS.reduce((s, k) => s + (item.stats[k] ?? 0), 0)
}

// ── Equip context view ────────────────────────────────────────────────────────

function EquipContextView() {
  const { units, equipment, equipContext, equipItem, closeEquipContext, setActiveTab } = useGameStore((s) => ({
    units: s.units, equipment: s.equipment, equipContext: s.equipContext,
    equipItem: s.equipItem, closeEquipContext: s.closeEquipContext, setActiveTab: s.setActiveTab,
  }))

  if (!equipContext) return null
  const { unitId, slot } = equipContext
  const unit = units.find((u) => u.id === unitId)
  if (!unit) return null

  const currentId   = unit.equipment[slot]
  const currentItem = equipment.find((e) => e.id === currentId) ?? null
  const mainHandItem = equipment.find((e) => e.id === unit.equipment.mainHand)
  const offHandLocked = slot === 'offHand' && mainHandItem?.category === 'weapon-2h'

  const compatible: ItemCategory[] = SLOT_COMPATIBLE[slot]
  const slotItems = equipment.filter((e) => compatible.includes(e.category))
  const grouped = compatible.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = slotItems.filter((e) => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  function handleBack() { closeEquipContext(); setActiveTab('units') }
  function handleEquip(itemId: string | null) { equipItem(unitId, slot, itemId); handleBack() }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button className="text-game-primary text-sm font-medium" onClick={handleBack}>← Back</button>
        <span className="text-game-muted">·</span>
        <span className="text-game-text-dim text-sm">
          {SLOT_LABELS[slot]} — <span className="text-game-text font-semibold">{unit.name}</span>
        </span>
      </div>

      {offHandLocked ? (
        <div className="rounded-xl border border-game-border px-4 py-5 text-center">
          <div className="text-game-text-dim text-sm">Off hand locked</div>
          <div className="text-xs text-game-muted mt-1">Equip a 1H weapon in the main hand first</div>
        </div>
      ) : (
        <>
          {currentId && (
            <button
              className="w-full text-left px-4 py-3 rounded-xl border border-game-border hover:border-game-primary/50 transition-colors"
              onClick={() => handleEquip(null)}
            >
              <div className="text-sm text-game-text-dim">Remove — {currentItem?.name}</div>
            </button>
          )}

          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">
                {CATEGORY_LABELS[cat as ItemCategory]}
              </div>
              <div className="space-y-2">
                {items.map((item) => {
                  const isEquipped = item.id === currentId
                  const isUpgrade  = !isEquipped && totalScore(item) > totalScore(currentItem ?? { id: '', name: '', category: 'accessory', traits: [], stats: {} })
                  const traits     = getItemTraits(item)

                  return (
                    <button
                      key={item.id}
                      disabled={isEquipped}
                      onClick={() => !isEquipped && handleEquip(item.id)}
                      className={[
                        'w-full text-left px-4 py-3 rounded-xl border transition-colors',
                        isEquipped ? 'border-game-primary bg-game-primary/10 cursor-default'
                                   : 'border-game-border hover:border-game-primary/50 active:bg-white/3',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-game-text flex-1">{item.name}</span>
                        {isEquipped && <span className="text-xs text-game-primary font-semibold shrink-0">Equipped</span>}
                        {isUpgrade  && <span className="text-xs text-game-green font-semibold shrink-0">↑ Upgrade</span>}
                      </div>
                      <TraitRow traits={traits} />
                      {!isEquipped && <StatDeltas item={item} current={currentItem} />}
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
  const expanded = useGameStore((s) => s.expandedInventorySections.includes('equipment'))
  const toggleInventorySection = useGameStore((s) => s.toggleInventorySection)
  const equipment = useGameStore((s) => s.equipment)

  const categories: ItemCategory[] = ['weapon-1h', 'weapon-2h', 'tool', 'shield', 'armor', 'accessory']
  const grouped = categories.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = equipment.filter((e) => e.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => toggleInventorySection('equipment')}>
        <span className="font-semibold">Equipment</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-game-border divide-y divide-game-border/50">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-game-text-dim mb-3">
                {CATEGORY_LABELS[cat as ItemCategory]}
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id}>
                    <div className="text-sm font-medium text-game-text mb-1.5">{item.name}</div>
                    <TraitRow traits={getItemTraits(item)} />
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
  const expanded = useGameStore((s) => s.expandedInventorySections.includes('misc'))
  const toggleInventorySection = useGameStore((s) => s.toggleInventorySection)
  const miscItems = useGameStore((s) => s.miscItems)

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => toggleInventorySection('misc')}>
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

// ── Crafting section ──────────────────────────────────────────────────────────

function CraftingSection() {
  const expanded = useGameStore((s) => s.expandedInventorySections.includes('crafting'))
  const toggleInventorySection = useGameStore((s) => s.toggleInventorySection)
  const [expandedRecipes, setExpandedRecipes] = useState<string[]>([])
  const { miscItems, learnedRecipes, craft } = useGameStore((s) => ({
    miscItems: s.miscItems,
    learnedRecipes: s.learnedRecipes,
    craft: s.craft,
  }))

  function toggleRecipe(id: string) {
    setExpandedRecipes((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function canCraft(recipeId: string) {
    const recipe = RECIPE_REGISTRY[recipeId]
    if (!recipe) return false
    return recipe.ingredients.every((ing) => {
      const item = miscItems.find((i) => i.id === ing.itemId)
      return item && item.quantity >= ing.quantity
    })
  }

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => toggleInventorySection('crafting')}>
        <span className="font-semibold">Crafting</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-game-border divide-y divide-game-border/50">
          {learnedRecipes.map((recipeId) => {
            const recipe = RECIPE_REGISTRY[recipeId]
            if (!recipe) return null
            const affordable  = canCraft(recipeId)
            const isExpanded  = expandedRecipes.includes(recipeId)

            return (
              <div key={recipeId} className={affordable ? '' : 'opacity-50'}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => toggleRecipe(recipeId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-game-text">{recipe.name}</span>
                      <span className="text-xs text-game-text-dim">×{recipe.outputQuantity}</span>
                    </div>
                    {!affordable && (
                      <div className="text-xs text-game-muted mt-0.5">Missing resources</div>
                    )}
                  </div>
                  <span className="text-game-muted text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-game-text-dim">{recipe.description}</p>

                    <div>
                      <div className="text-xs uppercase tracking-widest text-game-text-dim mb-1.5">Ingredients</div>
                      <div className="space-y-1">
                        {recipe.ingredients.map((ing) => {
                          const have = miscItems.find((i) => i.id === ing.itemId)?.quantity ?? 0
                          const ok   = have >= ing.quantity
                          return (
                            <div key={ing.itemId} className="flex items-center gap-2 text-sm">
                              <span className="flex-1 text-game-text">
                                {miscItems.find((i) => i.id === ing.itemId)?.name ?? ing.itemId}
                              </span>
                              <span className={`font-mono text-xs ${ok ? 'text-game-green' : 'text-red-400'}`}>
                                {have} / {ing.quantity}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-game-text-dim">
                        Produces: <span className="text-game-text font-medium">{recipe.outputName} ×{recipe.outputQuantity}</span>
                      </div>
                      <button
                        disabled={!affordable}
                        onClick={() => craft(recipeId)}
                        className={[
                          'text-sm py-1.5 px-4 rounded-lg font-medium transition-colors',
                          affordable
                            ? 'bg-game-primary text-white hover:bg-game-primary/80'
                            : 'bg-game-border text-game-muted cursor-not-allowed',
                        ].join(' ')}
                      >
                        Craft
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
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
      <CraftingSection />
      <EquipmentSection />
      <MiscSection />
    </div>
  )
}
