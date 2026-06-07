import { useState } from 'react'
import {
  useGameStore,
  type EquipmentItem,
  type EquipSlot,
  type ItemCategory,
  type MiscItem,
  type CraftingRecipe,
  type Unit,
  SLOT_COMPATIBLE,
  SLOT_LABELS,
  CATEGORY_LABELS,
  RECIPE_REGISTRY,
  getItemTraits,
  getEquippedId,
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

// Absolute stat readout (used when no hero is selected — no comparison basis).
function AbsoluteStats({ item }: { item: EquipmentItem }) {
  const entries = STAT_KEYS.map((k) => ({ k, v: item.stats[k] ?? 0 })).filter((x) => x.v !== 0)
  if (!entries.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {entries.map(({ k, v }) => (
        <span key={k} className="text-xs font-mono text-game-text-dim">{v} {STAT_SHORT[k]}</span>
      ))}
    </div>
  )
}

// The stat-bearing slot an item competes for, for delta comparison. Tools have
// no stat slot (sideboards are stat-inactive), so they show absolute stats.
const CATEGORY_SLOT: Record<ItemCategory, EquipSlot | null> = {
  'weapon-1h': 'mainHand', 'weapon-2h': 'mainHand', shield: 'offHand',
  armor: 'armor', accessory: 'accessory', tool: null,
}

function equipRestrictionFor(item: EquipmentItem, unit: Unit): string | null {
  const cls = unit.class ?? 'Novice'
  if (item.requiredLevel && unit.level < item.requiredLevel) return `Requires Lv ${item.requiredLevel}`
  if (item.requiredClasses && !item.requiredClasses.includes(cls)) return `${item.requiredClasses.join(' / ')} only`
  return null
}

// ── Shared type filter ────────────────────────────────────────────────────────
// The chips narrow *both* what you own and what you can craft, by item type.

type InvFilter = 'all' | 'consumable' | 'weapon' | 'armor' | 'accessory' | 'misc'

const FILTER_CHIPS: { id: InvFilter; label: string; icon: string }[] = [
  { id: 'all',        label: 'All',         icon: '' },
  { id: 'consumable', label: 'Consumables', icon: '🫙' },
  { id: 'weapon',     label: 'Weapons',     icon: '🗡' },
  { id: 'armor',      label: 'Armor',       icon: '🛡' },
  { id: 'accessory',  label: 'Accessories', icon: '💍' },
  { id: 'misc',       label: 'Misc',        icon: '📦' },
]

// Equipment categories fold into the gear chips: shields sit with Armor, tools
// (utility gear) with Accessories.
const CATEGORY_FILTER: Record<ItemCategory, InvFilter> = {
  'weapon-1h': 'weapon', 'weapon-2h': 'weapon',
  shield: 'armor', armor: 'armor',
  accessory: 'accessory', tool: 'accessory',
}

const miscFilter   = (item: MiscItem): InvFilter => (item.kind === 'consumable' ? 'consumable' : 'misc')
const recipeFilter = (r: CraftingRecipe): InvFilter =>
  r.outputCategory ? CATEGORY_FILTER[r.outputCategory] : ((r.category ?? 'misc') === 'consumable' ? 'consumable' : 'misc')

const matchesFilter = (itemFilter: InvFilter, active: InvFilter) => active === 'all' || itemFilter === active

function FilterBar({ active, onChange }: { active: InvFilter; onChange: (f: InvFilter) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
      {FILTER_CHIPS.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          className={[
            'shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
            active === c.id
              ? 'border-game-primary bg-game-primary/15 text-game-primary'
              : 'border-game-border text-game-text-dim hover:text-game-text',
          ].join(' ')}
        >
          {c.icon && <span className="mr-1">{c.icon}</span>}{c.label}
        </button>
      ))}
    </div>
  )
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

  const currentId   = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
  const currentItem = equipment.find((e) => e.id === currentId) ?? null
  const mainHandId  = unit.weaponSets[unit.activeWeaponSet].mainHand
  const offHandLocked = slot === 'offHand' && equipment.find((e) => e.id === mainHandId)?.category === 'weapon-2h'

  const unitClass = unit.class ?? 'Novice'
  const unitLevel = unit.level
  function equipRestriction(item: EquipmentItem): string | null {
    if (item.requiredLevel && unitLevel < item.requiredLevel) return `Requires Lv ${item.requiredLevel}`
    if (item.requiredClasses && !item.requiredClasses.includes(unitClass)) return `${item.requiredClasses.join(' / ')} only`
    return null
  }

  const compatible: ItemCategory[] = SLOT_COMPATIBLE[slot]
  // Items reserved by another unit (sideboard, mainHand/offHand/armor/accessory)
  // are hidden from the picker. The current unit's own equipped items remain
  // visible so they can be swapped freely.
  const reservedByOthers = new Set<string>()
  for (const other of units) {
    if (other.id === unitId) continue
    const refs = [
      other.weaponSets[0].mainHand, other.weaponSets[0].offHand,
      other.weaponSets[1].mainHand, other.weaponSets[1].offHand,
      other.equipment.armor, other.equipment.accessory,
      other.equipment.sideboard1, other.equipment.sideboard2,
    ]
    for (const id of refs) if (id) reservedByOthers.add(id)
  }
  const slotItems = equipment.filter((e) => compatible.includes(e.category) && !reservedByOthers.has(e.id))
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
                  const isEquipped   = item.id === currentId
                  const restriction  = equipRestriction(item)
                  const isLocked     = !isEquipped && !!restriction
                  const isUpgrade    = !isEquipped && !isLocked && totalScore(item) > totalScore(currentItem ?? { id: '', name: '', category: 'accessory', traits: [], stats: {} })
                  const traits       = getItemTraits(item)

                  return (
                    <button
                      key={item.id}
                      disabled={isEquipped || isLocked}
                      onClick={() => !isEquipped && !isLocked && handleEquip(item.id)}
                      className={[
                        'w-full text-left px-4 py-3 rounded-xl border transition-colors',
                        isEquipped ? 'border-game-primary bg-game-primary/10 cursor-default'
                          : isLocked ? 'border-game-border/40 opacity-50 cursor-not-allowed'
                          : 'border-game-border hover:border-game-primary/50 active:bg-white/3',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-game-text flex-1">{item.name}</span>
                        {isEquipped   && <span className="text-xs text-game-primary font-semibold shrink-0">Equipped</span>}
                        {isUpgrade    && <span className="text-xs text-game-green font-semibold shrink-0">↑ Upgrade</span>}
                        {isLocked     && <span className="text-xs text-game-muted shrink-0">{restriction}</span>}
                      </div>
                      <TraitRow traits={traits} />
                      {!isEquipped && !isLocked && <StatDeltas item={item} current={currentItem} />}
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

function EquipmentSection({ filter }: { filter: InvFilter }) {
  const expanded = useGameStore((s) => s.expandedInventorySections.includes('equipment'))
  const toggleInventorySection = useGameStore((s) => s.toggleInventorySection)
  const equipment = useGameStore((s) => s.equipment)
  const units     = useGameStore((s) => s.units)
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)
  // Deltas are shown relative to the primary (1st-selected) hero; with no
  // selection we fall back to absolute stats.
  const primary = units.find((u) => u.id === selectedUnitIds[0]) ?? null

  // No equipment categories survive a consumable/misc filter — hide the section.
  if (!['all', 'weapon', 'armor', 'accessory'].includes(filter)) return null

  const categories = (['weapon-1h', 'weapon-2h', 'tool', 'shield', 'armor', 'accessory'] as ItemCategory[])
    .filter((cat) => matchesFilter(CATEGORY_FILTER[cat], filter))

  // Which hero (if any) currently holds each item — actively worn or stashed in a
  // weapon set / sideboard. Held items are sorted to the bottom of their group and
  // labelled so they read as taken, not available.
  const heldBy = new Map<string, string>()
  for (const u of units) {
    const refs = [
      u.weaponSets[0].mainHand, u.weaponSets[0].offHand,
      u.weaponSets[1].mainHand, u.weaponSets[1].offHand,
      u.equipment.armor, u.equipment.accessory,
      u.equipment.sideboard1, u.equipment.sideboard2,
    ]
    for (const id of refs) if (id) heldBy.set(id, u.name)
  }

  const grouped = categories.reduce<Record<string, EquipmentItem[]>>((acc, cat) => {
    const items = equipment.filter((e) => e.category === cat)
    // Available first, held (equipped) last — stable within each partition.
    if (items.length) acc[cat] = [...items].sort((a, b) => (heldBy.has(a.id) ? 1 : 0) - (heldBy.has(b.id) ? 1 : 0))
    return acc
  }, {})

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => toggleInventorySection('equipment')}>
        <span className="font-semibold">Equipment{primary && <span className="ml-1.5 text-xs font-normal text-game-text-dim">vs {primary.name}</span>}</span>
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
                {items.map((item) => {
                  const heldByName  = heldBy.get(item.id) ?? null
                  const isHeld      = heldByName !== null
                  const restriction = !isHeld && primary ? equipRestrictionFor(item, primary) : null
                  const locked      = !!restriction
                  const slot        = CATEGORY_SLOT[item.category]
                  const currentId   = primary && slot ? getEquippedId(primary, slot) : null
                  const currentItem = currentId ? (equipment.find((e) => e.id === currentId) ?? null) : null
                  return (
                    <div key={item.id} className={isHeld || locked ? 'opacity-50' : ''}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium text-game-text flex-1">{item.name}</span>
                        {isHeld  && <span className="text-xs text-game-primary font-semibold shrink-0">Equipped · {heldByName}</span>}
                        {locked  && <span className="text-xs text-game-muted shrink-0">{restriction}</span>}
                      </div>
                      <TraitRow traits={getItemTraits(item)} />
                      {!isHeld && (primary
                        ? (!locked && <StatDeltas item={item} current={currentItem} />)
                        : <AbsoluteStats item={item} />)}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Misc section ──────────────────────────────────────────────────────────────

function ItemsSection({ filter }: { filter: InvFilter }) {
  const expanded = useGameStore((s) => s.expandedInventorySections.includes('misc'))
  const toggleInventorySection = useGameStore((s) => s.toggleInventorySection)
  const miscItems = useGameStore((s) => s.miscItems)

  // Items live in two buckets keyed by `kind`. Show whichever the filter allows.
  if (!['all', 'consumable', 'misc'].includes(filter)) return null
  const visible = miscItems.filter((i) => matchesFilter(miscFilter(i), filter))
  const consumables = visible.filter((i) => i.kind === 'consumable')
  const materials   = visible.filter((i) => i.kind !== 'consumable')

  const rows = (items: MiscItem[]) => items.map((item) => (
    <div key={item.id} className="flex items-center gap-2 py-3">
      <span className="text-sm text-game-text flex-1">{item.name}</span>
      <span className="text-xs text-game-text-dim">{item.description}</span>
      <span className="text-sm font-mono text-game-gold font-semibold ml-2">×{item.quantity}</span>
    </div>
  ))

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => toggleInventorySection('misc')}>
        <span className="font-semibold">Items</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-game-border">
          {consumables.length > 0 && (
            <div className="px-4">
              <div className="text-xs uppercase tracking-widest text-game-text-dim pt-3">Consumables</div>
              <div className="divide-y divide-game-border/50">{rows(consumables)}</div>
            </div>
          )}
          {materials.length > 0 && (
            <div className="px-4">
              <div className="text-xs uppercase tracking-widest text-game-text-dim pt-3">Materials</div>
              <div className="divide-y divide-game-border/50">{rows(materials)}</div>
            </div>
          )}
          {visible.length === 0 && <p className="text-xs text-game-muted italic px-4 py-4">Nothing here.</p>}
        </div>
      )}
    </div>
  )
}

// ── Crafting section ──────────────────────────────────────────────────────────

function CraftingSection({ filter }: { filter: InvFilter }) {
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

  // Recipes matching the shared type filter.
  const tabRecipes = learnedRecipes.filter((id) => {
    const recipe = RECIPE_REGISTRY[id]
    return recipe && matchesFilter(recipeFilter(recipe), filter)
  })

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => toggleInventorySection('crafting')}>
        <span className="font-semibold">Crafting</span>
        <span className="text-game-muted text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-game-border">
          <div className="divide-y divide-game-border/50">
          {tabRecipes.length === 0 && (
            <p className="text-xs text-game-muted italic px-4 py-4">No recipes known.</p>
          )}
          {tabRecipes.map((recipeId) => {
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
        </div>
      )}
    </div>
  )
}

// ── Inventory page ────────────────────────────────────────────────────────────

// When exactly one hero is selected in the shared roster, surface a Report
// button (mirrors the Map action bar — Inventory has no action bar of its own).
function SelectedUnitBar() {
  const units      = useGameStore((s) => s.units)
  const selectedIds = useGameStore((s) => s.selectedUnitIds)
  const openReport = useGameStore((s) => s.openReport)
  const unit = selectedIds.length === 1 ? units.find((u) => u.id === selectedIds[0]) : null
  if (!unit) return null
  return (
    <div className="flex items-center gap-2 rounded-xl border border-game-border bg-game-surface/40 px-3 py-2">
      <span className="text-sm font-medium text-game-text">{unit.name}</span>
      <span className="text-xs text-game-text-dim">Lv.{unit.level}</span>
      <button onClick={() => openReport(unit.id)} className="ml-auto text-xs py-1 px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">
        Report
      </button>
    </div>
  )
}

export function Inventory() {
  const equipContext = useGameStore((s) => s.equipContext)
  const [filter, setFilter] = useState<InvFilter>('all')
  if (equipContext) return <EquipContextView />
  return (
    <div className="p-4 space-y-3 pb-24">
      <SelectedUnitBar />
      <FilterBar active={filter} onChange={setFilter} />
      <EquipmentSection filter={filter} />
      <ItemsSection filter={filter} />
      <CraftingSection filter={filter} />
    </div>
  )
}
