import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useGameStore, getItemTraits, RECIPE_REGISTRY, CATEGORY_LABELS,
  type EquipmentItem, type Unit, type CraftingRecipe, type Trait,
} from '@/stores/useGameStore'
import { DROP_ITEMS } from '@/data/monsters'
import { CARD_REGISTRY, type CardFit } from '@/data/cards'
import { TraitRow } from '@/components/TraitBubble'
import { ItemCodex } from '@/components/ItemCodex'
import { useProtoStore } from './protoStore'
import {
  GOLD_ID, materialValue, equipmentValue, EQUIPMENT_DEF,
} from './economy'
import { SocketPips, CardChip, CardCodex, socketsOf } from './CardBits'
import { seedProtoMocks } from './seed'

// ── Town ─────────────────────────────────────────────────────────────────────--
//
// The GLOBAL board (the per-hero board lives in the bottom lens). Three counters
// over live game state:
//   Market — sell loot in bulk (select stacks, sell junk) + a small buy shelf
//   Cards  — the guild's card collection: stats, source monster, what's in use
//   Stash  — shared materials + crafting (and a deposit-all for hero packs)

const BASE_NAMES: Record<string, string> = { m1: 'Wood', m2: 'Iron Ore', m3: 'Fish', m4: 'Herbs', 'm-gold': 'Gold' }
const RECIPE_BY_OUTPUT = Object.values(RECIPE_REGISTRY).reduce<Record<string, string>>((acc, r) => { acc[r.outputItemId] = r.outputName; return acc }, {})
function itemName(id: string): string {
  return BASE_NAMES[id] ?? DROP_ITEMS[id] ?? EQUIPMENT_DEF[id]?.name ?? RECIPE_BY_OUTPUT[id] ?? id
}
function objectiveChips(it: EquipmentItem): Trait[] {
  const chips = getItemTraits(it)
  if (it.category === 'weapon-1h' || it.category === 'weapon-2h') {
    const r = it.stats.range ?? 5
    chips.push({ id: `rng-${it.id}`, label: r > 5 ? `${r} RNG` : 'melee', category: 'stat', description: r > 5 ? `Reaches ${r} ft.` : 'Melee weapon.' })
  }
  return chips
}
function heldByMap(units: Unit[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const u of units) {
    const refs = [
      u.weaponSets[0].mainHand, u.weaponSets[0].offHand, u.weaponSets[1].mainHand, u.weaponSets[1].offHand,
      u.equipment.armor, u.equipment.accessory, u.equipment.sideboard1, u.equipment.sideboard2,
    ]
    for (const id of refs) if (id) m.set(id, u.name)
  }
  return m
}

function Gold({ className = '' }: { className?: string }) {
  const gold = useGameStore((s) => s.miscItems.find((m) => m.id === GOLD_ID)?.quantity ?? 0)
  return <span className={`tabular-nums text-game-gold font-semibold ${className}`}>◈ {gold.toLocaleString()}</span>
}

// ── Market (bulk-first) ────────────────────────────────────────────────────────
type MarketSort = 'value' | 'qty' | 'name'
const JUNK_MAX = 4 // unit value ≤ this reads as bulk junk

function Market() {
  const miscItems = useGameStore((s) => s.miscItems)
  const equipment = useGameStore((s) => s.equipment)
  const units     = useGameStore((s) => s.units)
  const sockets   = useProtoStore((s) => s.sockets)
  const consumeMiscItem = useGameStore((s) => s.consumeMiscItem)
  const grantMiscItem   = useGameStore((s) => s.grantMiscItem)
  const grantEquipment  = useGameStore((s) => s.grantEquipment)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<MarketSort>('value')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [gearOpen, setGearOpen] = useState(true)
  const [waresOpen, setWaresOpen] = useState(false)
  const [inspectGear, setInspectGear] = useState<EquipmentItem | null>(null)
  const [inspectCard, setInspectCard] = useState<string | null>(null)

  const ql = q.trim().toLowerCase()
  const matchName = (name: string) => !ql || name.toLowerCase().includes(ql)
  const held = heldByMap(units)

  const materials = useMemo(() => {
    const list = miscItems.filter((m) => m.id !== GOLD_ID && m.quantity > 0 && matchName(m.name))
    const v = (id: string, qty: number) => materialValue(id) * qty
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'qty') return b.quantity - a.quantity || a.name.localeCompare(b.name)
      return v(b.id, b.quantity) - v(a.id, a.quantity) || a.name.localeCompare(b.name)
    })
  }, [miscItems, ql, sort])

  const gear = equipment.filter((e) => !held.has(e.id) && matchName(e.name))
  const visibleIds = materials.map((m) => m.id)
  const selValue = materials.filter((m) => sel.has(m.id)).reduce((n, m) => n + materialValue(m.id) * m.quantity, 0)

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll = () => setSel(new Set(visibleIds))
  const selectJunk = () => setSel(new Set(visibleIds.filter((id) => materialValue(id) <= JUNK_MAX)))
  const clearSel = () => setSel(new Set())

  function sellStack(id: string, qty: number) {
    if (qty <= 0) return
    consumeMiscItem(id, qty)
    grantMiscItem(GOLD_ID, materialValue(id) * qty)
  }
  function sellSelected() {
    for (const m of materials) if (sel.has(m.id)) sellStack(m.id, m.quantity)
    clearSel()
  }
  function sellGear(it: EquipmentItem) {
    useGameStore.setState((s) => ({ equipment: s.equipment.filter((e) => e.id !== it.id) }))
    grantMiscItem(GOLD_ID, equipmentValue(it))
  }
  function buy(price: number, grant: () => void) {
    const gold = useGameStore.getState().miscItems.find((m) => m.id === GOLD_ID)?.quantity ?? 0
    if (gold < price) return
    consumeMiscItem(GOLD_ID, price)
    grant()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search loot…"
          className="flex-1 min-w-0 bg-game-bg border border-game-border rounded-lg px-3 py-1.5 text-sm text-game-text placeholder:text-game-muted focus:border-game-primary/50 outline-none" />
        <div className="flex rounded-lg border border-game-border overflow-hidden text-xs shrink-0">
          {(['value', 'qty', 'name'] as MarketSort[]).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={`px-2.5 py-1.5 capitalize ${sort === s ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text'} ${s !== 'value' ? 'border-l border-game-border' : ''}`}>{s === 'value' ? 'Value' : s === 'qty' ? 'Qty' : 'A–Z'}</button>
          ))}
        </div>
      </div>

      {/* bulk select controls */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <button onClick={selectAll} className="px-2 py-1 rounded-md border border-game-border text-game-text-dim hover:text-game-text">Select all</button>
        <button onClick={selectJunk} className="px-2 py-1 rounded-md border border-game-border text-game-text-dim hover:text-game-text" title={`Select stacks worth ≤ ${JUNK_MAX}g each`}>Select junk</button>
        {sel.size > 0 && <button onClick={clearSel} className="px-2 py-1 rounded-md border border-game-border text-game-text-dim hover:text-game-text">Clear</button>}
        <span className="ml-auto text-game-muted">{materials.length} stacks</span>
      </div>

      {/* materials — dense, selectable */}
      <div className="rounded-lg border border-game-border divide-y divide-game-border/60 overflow-hidden">
        {materials.length === 0 && <div className="px-3 py-3 text-xs text-game-muted italic">No loot to sell.</div>}
        {materials.map((m) => {
          const on = sel.has(m.id)
          const junk = materialValue(m.id) <= JUNK_MAX
          return (
            <div key={m.id} className={['flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors', on ? 'bg-game-primary/10' : 'hover:bg-white/[0.03]'].join(' ')} onClick={() => toggle(m.id)}>
              <span className={['text-xs leading-none w-3.5 text-center', on ? 'text-game-primary' : 'text-game-muted'].join(' ')}>{on ? '▣' : '☐'}</span>
              <span className="text-sm text-game-text truncate flex-1">{m.name}{junk && <span className="ml-1.5 text-[9px] text-game-muted uppercase tracking-wide">bulk</span>}</span>
              <span className="text-[11px] text-game-text-dim tabular-nums w-16 text-right">×{m.quantity.toLocaleString()}</span>
              <span className="text-[10px] text-game-muted tabular-nums w-12 text-right">{materialValue(m.id)}g ea</span>
              <span className="text-xs text-game-gold tabular-nums w-16 text-right font-medium">{(materialValue(m.id) * m.quantity).toLocaleString()}g</span>
              <button onClick={(e) => { e.stopPropagation(); sellStack(m.id, m.quantity) }} className="text-[10px] px-1.5 py-0.5 rounded border border-game-gold/40 text-game-text-dim hover:text-game-text hover:bg-game-gold/10 shrink-0">sell</button>
            </div>
          )
        })}
      </div>

      {/* sell-selected action bar */}
      {sel.size > 0 && (
        <button onClick={sellSelected} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-game-primary text-white text-sm font-medium hover:bg-game-primary/80">
          Sell {sel.size} stack{sel.size === 1 ? '' : 's'} <span className="text-game-bg/90 bg-white/20 rounded px-1.5 py-0.5 text-xs tabular-nums">{selValue.toLocaleString()}g</span>
        </button>
      )}

      {/* spare gear */}
      <section>
        <button onClick={() => setGearOpen((v) => !v)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-game-text-dim hover:text-game-text py-1">
          <span className="w-3 text-center">{gearOpen ? '▾' : '▸'}</span><span>Spare gear</span>
          <span className="text-game-muted normal-case tracking-normal">({gear.length})</span>
        </button>
        {gearOpen && (
          <div className="space-y-1.5">
            {gear.length === 0 && <div className="text-xs text-game-muted italic">No spare gear — everything's equipped or reserved.</div>}
            {gear.map((it) => {
              const slots = socketsOf(sockets, it)
              return (
                <div key={it.id} className="rounded-lg border border-game-border bg-game-bg px-2.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-game-text font-medium truncate">{it.name}</span>
                    <SocketPips slots={slots} showCount />
                    <span className="text-[9px] text-game-muted ml-auto">{CATEGORY_LABELS[it.category]}</span>
                    <button onClick={() => setInspectGear(it)} className="text-[10px] px-1.5 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text shrink-0">inspect</button>
                    <button onClick={() => sellGear(it)} className="text-[10px] px-2 py-0.5 rounded border border-game-gold/50 text-game-text hover:bg-game-gold/10 shrink-0">sell <span className="text-game-gold font-semibold">{equipmentValue(it)}g</span></button>
                  </div>
                  <TraitRow traits={objectiveChips(it)} />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* buy shelf — odd wares, inspect before buying (low emphasis) */}
      <section>
        <button onClick={() => setWaresOpen((v) => !v)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-game-text-dim hover:text-game-text py-1">
          <span className="w-3 text-center">{waresOpen ? '▾' : '▸'}</span><span>Wares for sale</span>
          <span className="text-game-muted normal-case tracking-normal">(buy)</span>
        </button>
        {waresOpen && (
          <div className="space-y-1.5">
            {/* a card ware */}
            <div className="flex items-center gap-2 rounded-lg border border-game-border bg-game-bg px-2.5 py-2">
              <span className="text-violet-300 text-sm">◆</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-game-text font-medium truncate">{CARD_REGISTRY['card-specter'].name}</div>
                <div className="text-[10px] text-game-text-dim truncate">Rare card · inspect for stats</div>
              </div>
              <button onClick={() => setInspectCard('card-specter')} className="text-[10px] px-1.5 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text">inspect</button>
              <button onClick={() => buy(180, () => useProtoStore.setState((s) => ({ ownedCards: { ...s.ownedCards, 'card-specter': (s.ownedCards['card-specter'] ?? 0) + 1 } })))} className="text-[10px] px-2 py-0.5 rounded border border-game-primary/50 text-game-text hover:bg-game-primary/10">buy <span className="text-game-gold font-semibold">180g</span></button>
            </div>
            {/* a gear ware */}
            <div className="flex items-center gap-2 rounded-lg border border-game-border bg-game-bg px-2.5 py-2">
              <span className="text-game-text-dim text-sm">⚔</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-game-text font-medium truncate">{EQUIPMENT_DEF['eq-staff'].name}</div>
                <div className="text-[10px] text-game-text-dim truncate">2H staff · {EQUIPMENT_DEF['eq-staff'].slots} sockets</div>
              </div>
              <button onClick={() => setInspectGear(EQUIPMENT_DEF['eq-staff'])} className="text-[10px] px-1.5 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text">inspect</button>
              <button onClick={() => buy(equipmentValue(EQUIPMENT_DEF['eq-staff']), () => grantEquipment('eq-staff'))} className="text-[10px] px-2 py-0.5 rounded border border-game-primary/50 text-game-text hover:bg-game-primary/10">buy <span className="text-game-gold font-semibold">{equipmentValue(EQUIPMENT_DEF['eq-staff'])}g</span></button>
            </div>
          </div>
        )}
      </section>

      {inspectGear && <ItemCodex item={inspectGear} onClose={() => setInspectGear(null)} />}
      {inspectCard && <CardCodex cardId={inspectCard} onClose={() => setInspectCard(null)} />}
    </div>
  )
}

// ── Cards (collection) ─────────────────────────────────────────────────────────
type CardTab = 'all' | CardFit
const CARD_TABS: { id: CardTab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'weapon', label: '🗡 Weapon' }, { id: 'armor', label: '🛡 Armor' }, { id: 'accessory', label: '💍 Accessory' },
]

function CardsTab() {
  const ownedCards = useProtoStore((s) => s.ownedCards)
  const sockets    = useProtoStore((s) => s.sockets)
  const [tab, setTab] = useState<CardTab>('all')
  const [inspect, setInspect] = useState<string | null>(null)

  // How many of each card are socketed across all gear (in-use, beyond stock).
  const socketed = useMemo(() => {
    const m: Record<string, number> = {}
    for (const arr of Object.values(sockets)) for (const id of arr) if (id) m[id] = (m[id] ?? 0) + 1
    return m
  }, [sockets])

  const all = Object.values(CARD_REGISTRY)
  const held = (id: string) => (ownedCards[id] ?? 0) + (socketed[id] ?? 0)
  const inFit = (fit: CardFit) => tab === 'all' || tab === fit

  const discovered = all.filter((c) => held(c.id) > 0 && inFit(c.fit))
  const undiscovered = all.filter((c) => held(c.id) === 0 && inFit(c.fit))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CARD_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={['px-2.5 py-1 rounded-full text-[11px] border transition-colors',
            tab === t.id ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}>{t.label}</button>
        ))}
        <span className="ml-auto text-[11px] text-game-text-dim self-center">{discovered.length}/{all.length} collected</span>
      </div>

      {discovered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {discovered.map((c) => (
            <div key={c.id} className="relative">
              <CardChip cardId={c.id} count={ownedCards[c.id] ?? 0} onClick={() => setInspect(c.id)} />
              {socketed[c.id] ? <span className="absolute top-1 right-1.5 text-[8px] text-game-accent" title={`${socketed[c.id]} socketed`}>{socketed[c.id]} in use</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-game-muted italic">No cards in this family yet — they drop, rarely, from the monsters they're named for.</div>
      )}

      {undiscovered.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5 mt-1">Undiscovered ({undiscovered.length})</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {undiscovered.map((c) => (
              <CardChip key={c.id} cardId={c.id} count={0} dimmed onClick={() => setInspect(c.id)} />
            ))}
          </div>
        </div>
      )}

      {inspect && <CardCodex cardId={inspect} onClose={() => setInspect(null)} />}
    </div>
  )
}

// ── Craft ──────────────────────────────────────────────────────────────────────
type CraftFilter = 'all' | 'material' | 'consumable' | 'weapon' | 'armor' | 'accessory'
const CRAFT_FILTERS: { id: CraftFilter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✦' }, { id: 'material', label: 'Materials', icon: '📦' }, { id: 'consumable', label: 'Consumables', icon: '🫙' },
  { id: 'weapon', label: 'Weapons', icon: '🗡' }, { id: 'armor', label: 'Armor', icon: '🛡' }, { id: 'accessory', label: 'Accessories', icon: '💍' },
]
function recipeMatchesFilter(r: CraftingRecipe, f: CraftFilter): boolean {
  if (f === 'all') return true
  if (r.outputCategory) {
    const c = r.outputCategory
    if (f === 'weapon') return c === 'weapon-1h' || c === 'weapon-2h'
    if (f === 'armor') return c === 'shield' || c === 'armor'
    if (f === 'accessory') return c === 'accessory' || c === 'tool'
    return false
  }
  const cat = r.category ?? 'misc'
  if (f === 'consumable') return cat === 'consumable'
  if (f === 'material') return cat === 'misc'
  return false
}

function Craft() {
  const miscItems = useGameStore((s) => s.miscItems)
  const consumeMiscItem = useGameStore((s) => s.consumeMiscItem)
  const grantEquipment  = useGameStore((s) => s.grantEquipment)
  const craftStore      = useGameStore((s) => s.craft)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<CraftFilter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const have = (id: string) => miscItems.find((m) => m.id === id)?.quantity ?? 0
  const maxBatch = (r: CraftingRecipe) => r.ingredients.reduce((min, ing) => Math.min(min, Math.floor(have(ing.itemId) / ing.quantity)), Infinity)

  function doCraft(r: CraftingRecipe, batch: number) {
    const n = Math.min(batch, maxBatch(r))
    if (n <= 0) return
    if (r.outputCategory) {
      for (const ing of r.ingredients) consumeMiscItem(ing.itemId, ing.quantity * n)
      for (let i = 0; i < r.outputQuantity * n; i++) grantEquipment(r.outputItemId)
    } else {
      for (let i = 0; i < n; i++) craftStore(r.id)
    }
  }

  const ql = q.trim().toLowerCase()
  const recipes = useMemo(() => Object.values(RECIPE_REGISTRY)
    .filter((r) => recipeMatchesFilter(r, filter))
    .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.outputName.toLowerCase().includes(ql))
    .sort((a, b) => (maxBatch(a) > 0 ? 0 : 1) - (maxBatch(b) > 0 ? 0 : 1) || a.name.localeCompare(b.name)),
  [filter, ql, miscItems]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…"
        className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-1.5 text-sm text-game-text placeholder:text-game-muted focus:border-game-primary/50 outline-none" />
      <div className="flex flex-wrap gap-1.5">
        {CRAFT_FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={['px-2.5 py-1 rounded-full text-[11px] border transition-colors',
            filter === f.id ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}>{f.icon} {f.label}</button>
        ))}
      </div>
      <div className="space-y-1.5">
        {recipes.map((r) => {
          const batch = maxBatch(r)
          const craftable = batch > 0
          const open = openId === r.id
          const eqDef = r.outputCategory ? EQUIPMENT_DEF[r.outputItemId] : undefined
          return (
            <div key={r.id} className={['rounded-lg border bg-game-bg', open ? 'border-game-primary/50' : craftable ? 'border-game-border' : 'border-game-border opacity-60'].join(' ')}>
              <button onClick={() => setOpenId(open ? null : r.id)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
                <span className="text-base leading-none shrink-0">{eqDef ? '⚒' : (r.category === 'consumable' ? '🫙' : '📦')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><span className="text-sm font-medium text-game-text truncate">{r.outputName}</span><span className="text-[10px] text-game-text-dim shrink-0">×{r.outputQuantity}</span></div>
                  <div className="text-[10px] text-game-text-dim truncate">{r.ingredients.map((ing) => `${itemName(ing.itemId)} ×${ing.quantity}`).join(' · ')}</div>
                </div>
                <span className={['text-[10px] shrink-0 tabular-nums', craftable ? 'text-game-green' : 'text-game-muted'].join(' ')}>{craftable ? `can make ${batch === Infinity ? '∞' : batch}` : 'missing'}</span>
                <span className="text-game-muted text-xs shrink-0">{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-game-border/60 pt-2">
                  <p className="text-[11px] text-game-text-dim">{r.description}</p>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-game-text-dim mb-1">Reagents</div>
                    <div className="space-y-1">
                      {r.ingredients.map((ing) => {
                        const h = have(ing.itemId); const ok = h >= ing.quantity
                        return <div key={ing.itemId} className="flex items-center gap-2 text-xs"><span className="flex-1 text-game-text truncate">{itemName(ing.itemId)}</span><span className={`font-mono text-[11px] ${ok ? 'text-game-green' : 'text-red-400'}`}>{h} / {ing.quantity}</span></div>
                      })}
                    </div>
                  </div>
                  <div className="rounded-md border border-game-border/70 bg-game-surface/40 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-widest text-game-text-dim mb-1">Yields</div>
                    <div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium text-game-text">{r.outputName}</span><span className="text-[10px] text-game-text-dim">×{r.outputQuantity}</span>{eqDef && <span className="text-[9px] text-game-muted ml-auto">{CATEGORY_LABELS[eqDef.category]}</span>}</div>
                    {eqDef ? (<><TraitRow traits={objectiveChips(eqDef)} />{eqDef.description && <p className="text-[10px] text-game-text-dim mt-1">{eqDef.description}</p>}<div className="text-[10px] text-game-text-dim mt-1">Sells for <span className="text-game-gold">{equipmentValue(eqDef)}g</span></div></>) : (<div className="text-[10px] text-game-text-dim">Sells for <span className="text-game-gold">{materialValue(r.outputItemId)}g</span> each</div>)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[1, 10].map((n) => <button key={n} disabled={batch < n} onClick={() => doCraft(r, n)} className={['flex-1 py-1.5 rounded-lg text-xs font-medium', batch >= n ? 'bg-game-border/60 text-game-text hover:bg-game-border' : 'bg-game-border/30 text-game-muted cursor-not-allowed'].join(' ')}>Craft ×{n}</button>)}
                    <button disabled={!craftable || batch === Infinity} onClick={() => doCraft(r, batch === Infinity ? 1 : batch)} className={['flex-1 py-1.5 rounded-lg text-xs font-medium', craftable && batch !== Infinity ? 'bg-game-primary text-white hover:bg-game-primary/80' : 'bg-game-border/30 text-game-muted cursor-not-allowed'].join(' ')}>Max{craftable && batch !== Infinity ? ` ×${batch}` : ''}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {recipes.length === 0 && <div className="text-xs text-game-muted italic py-4 text-center">No recipes match.</div>}
      </div>
    </div>
  )
}

// ── Stash (shared materials + craft) ──────────────────────────────────────────--
function Stash() {
  const miscItems = useGameStore((s) => s.miscItems)
  const packs     = useProtoStore((s) => s.packs)
  const depositAllPacks = useProtoStore((s) => s.depositAllPacks)
  const carried = Object.values(packs).reduce((n, p) => n + Object.values(p).reduce((a, b) => a + b, 0), 0)
  const stored = miscItems.filter((m) => m.id !== GOLD_ID && m.quantity > 0)

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Shared storage <span className="text-game-muted normal-case tracking-normal">({stored.length})</span></span>
          <button onClick={depositAllPacks} disabled={carried <= 0} className={['text-[11px] px-2 py-1 rounded-md border', carried > 0 ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}>⇩ Deposit hero packs ({carried})</button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {stored.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5 rounded border border-game-border bg-game-bg px-2 py-1" title={m.description}>
              <span className="text-xs text-game-text truncate flex-1">{m.name}</span>
              <span className="text-[10px] text-game-text-dim tabular-nums">×{m.quantity.toLocaleString()}</span>
            </div>
          ))}
          {stored.length === 0 && <div className="col-span-2 text-xs text-game-muted italic">Storage is empty.</div>}
        </div>
      </section>
      <section>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Crafting</div>
        <Craft />
      </section>
    </div>
  )
}

// ── Town shell ─────────────────────────────────────────────────────────────────
type TownTab = 'market' | 'cards' | 'stash'
const TOWN_TABS: { id: TownTab; label: string; icon: string }[] = [
  { id: 'market', label: 'Market', icon: '🏪' }, { id: 'cards', label: 'Cards', icon: '◆' }, { id: 'stash', label: 'Stash', icon: '📦' },
]

export function Town({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TownTab>('market')
  useEffect(() => { seedProtoMocks() }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">🏪 Town</span>
        <span className="text-[10px] text-game-muted hidden sm:inline">— sell, collect & craft</span>
        <Gold className="ml-auto text-sm" />
        <button onClick={onClose} className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
      </header>
      <div className="shrink-0 flex border-b border-game-border bg-game-surface/60">
        {TOWN_TABS.map((t) => (
          <button key={t.id} aria-label={t.label} onClick={() => setTab(t.id)} className={['flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-colors relative', tab === t.id ? 'text-game-primary' : 'text-game-muted hover:text-game-text-dim'].join(' ')}>
            <span className="text-base leading-none">{t.icon}</span><span className="text-xs font-medium">{t.label}</span>
            {tab === t.id && <span className="absolute bottom-0 inset-x-6 h-0.5 rounded-full bg-game-primary" />}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 max-w-2xl w-full mx-auto">
        {tab === 'market' && <Market />}
        {tab === 'cards' && <CardsTab />}
        {tab === 'stash' && <Stash />}
      </div>
    </div>,
    document.body,
  )
}
