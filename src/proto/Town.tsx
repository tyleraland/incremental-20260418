import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useGameStore, getInitials, getItemTraits, RECIPE_REGISTRY, CATEGORY_LABELS,
  type EquipmentItem, type MiscItem, type Unit, type CraftingRecipe, type Trait, type ItemCategory,
} from '@/stores/useGameStore'
import { DROP_ITEMS, MONSTER_REGISTRY } from '@/data/monsters'
import { TraitRow } from '@/components/TraitBubble'
import { useProtoStore } from './protoStore'
import {
  GOLD_ID, CARRY_CAPACITY, materialValue, equipmentValue, packCount, packValue,
  packFull, EQUIPMENT_DEF, type Pack,
} from './economy'

// ── Town ─────────────────────────────────────────────────────────────────────--
//
// A prototype "you must be in town to trade" surface. Three counters, all over
// the same live game state:
//   Market  — sell loot & spare gear for gold (×1 / ×10 / ×100 with a price preview)
//   Craft   — search/filter recipes; reagent- & equipment-aware with item previews
//   Storage — each hero's personal pack (the carry exploration) ⇄ shared storage
// Selling/crafting mutate the real store; the per-hero packs are mock proto state
// (protoStore) so we can feel the "carry → deposit in town" flow before wiring it
// into combat.

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const BASE_NAMES: Record<string, string> = { m1: 'Wood', m2: 'Iron Ore', m3: 'Fish', m4: 'Herbs', 'm-gold': 'Gold' }

// Resolve a display name for any item id (materials, drops, crafted, equipment).
const RECIPE_BY_OUTPUT = Object.values(RECIPE_REGISTRY).reduce<Record<string, string>>((acc, r) => {
  acc[r.outputItemId] = r.outputName; return acc
}, {})
function itemName(id: string): string {
  return BASE_NAMES[id] ?? DROP_ITEMS[id] ?? EQUIPMENT_DEF[id]?.name ?? RECIPE_BY_OUTPUT[id] ?? id
}

// Objective stat/trait chips for an equipment item, + a reach chip for weapons.
function objectiveChips(it: EquipmentItem): Trait[] {
  const chips = getItemTraits(it)
  if (it.category === 'weapon-1h' || it.category === 'weapon-2h') {
    const r = it.stats.range ?? 5
    chips.push({ id: `rng-${it.id}`, label: r > 5 ? `${r} RNG` : 'melee', category: 'stat', description: r > 5 ? `Reaches ${r} ft.` : 'Melee weapon.' })
  }
  return chips
}

// Who holds each gear id (worn or reserved) — held gear isn't sellable here.
function heldByMap(units: Unit[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const u of units) {
    const refs = [
      u.weaponSets[0].mainHand, u.weaponSets[0].offHand,
      u.weaponSets[1].mainHand, u.weaponSets[1].offHand,
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

// ── Sell stepper (×1 / ×10 / ×100 / All, each with a gold preview) ─────────────
function SellStepper({ unitValue, available, onSell }: { unitValue: number; available: number; onSell: (n: number) => void }) {
  const steps = [1, 10, 100]
  return (
    <div className="flex flex-wrap gap-1">
      {steps.map((n) => {
        const ok = available >= n
        return (
          <button
            key={n}
            disabled={!ok}
            onClick={() => onSell(n)}
            className={['flex flex-col items-center px-2 py-1 rounded-md border text-[10px] leading-tight transition-colors',
              ok ? 'border-game-gold/50 text-game-text hover:bg-game-gold/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
          >
            <span className="font-semibold">×{n}</span>
            <span className={ok ? 'text-game-gold' : ''}>{(unitValue * n).toLocaleString()}g</span>
          </button>
        )
      })}
      <button
        disabled={available <= 0}
        onClick={() => onSell(available)}
        title={`Sell all ${available}`}
        className={['flex flex-col items-center px-2 py-1 rounded-md border text-[10px] leading-tight transition-colors',
          available > 0 ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
      >
        <span className="font-semibold">All {available}</span>
        <span className={available > 0 ? 'text-game-gold' : ''}>{(unitValue * available).toLocaleString()}g</span>
      </button>
    </div>
  )
}

// ── Market (sell) ──────────────────────────────────────────────────────────────
type MarketTab = 'all' | 'materials' | 'gear'
function Market() {
  const miscItems = useGameStore((s) => s.miscItems)
  const equipment = useGameStore((s) => s.equipment)
  const units     = useGameStore((s) => s.units)
  const consumeMiscItem = useGameStore((s) => s.consumeMiscItem)
  const grantMiscItem   = useGameStore((s) => s.grantMiscItem)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<MarketTab>('all')

  const held = heldByMap(units)
  const ql = q.trim().toLowerCase()
  const matchName = (name: string) => !ql || name.toLowerCase().includes(ql)

  const materials = miscItems.filter((m) => m.id !== GOLD_ID && m.quantity > 0 && matchName(m.name))
  const gear = equipment.filter((e) => !held.has(e.id) && matchName(e.name))

  const matWorth = materials.reduce((n, m) => n + materialValue(m.id) * m.quantity, 0)
  const gearWorth = gear.reduce((n, e) => n + equipmentValue(e), 0)

  function sellMaterial(m: MiscItem, n: number) {
    const count = Math.min(n, m.quantity)
    if (count <= 0) return
    consumeMiscItem(m.id, count)
    grantMiscItem(GOLD_ID, materialValue(m.id) * count)
  }
  function sellGear(it: EquipmentItem) {
    useGameStore.setState((s) => ({ equipment: s.equipment.filter((e) => e.id !== it.id) }))
    grantMiscItem(GOLD_ID, equipmentValue(it))
  }

  const showMats = tab === 'all' || tab === 'materials'
  const showGear = tab === 'all' || tab === 'gear'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…"
          className="flex-1 min-w-0 bg-game-bg border border-game-border rounded-lg px-3 py-1.5 text-sm text-game-text placeholder:text-game-muted focus:border-game-primary/50 outline-none"
        />
        <div className="flex rounded-lg border border-game-border overflow-hidden text-xs shrink-0">
          {(['all', 'materials', 'gear'] as MarketTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1.5 capitalize ${tab === t ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text'} ${t !== 'all' ? 'border-l border-game-border' : ''}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="text-[11px] text-game-text-dim">
        Stash value: <span className="text-game-gold">{(matWorth + gearWorth).toLocaleString()}g</span>
        <span className="text-game-muted"> · {materials.length} stacks · {gear.length} gear</span>
      </div>

      {showMats && (
        <section>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Materials & consumables</div>
          <div className="space-y-1.5">
            {materials.length === 0 && <div className="text-xs text-game-muted italic">Nothing to sell.</div>}
            {materials.map((m) => (
              <div key={m.id} className="rounded-lg border border-game-border bg-game-bg px-2.5 py-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm text-game-text font-medium truncate flex-1">{m.name}</span>
                  <span className="text-[10px] text-game-text-dim">{materialValue(m.id)}g ea</span>
                  <span className="text-xs text-game-text-dim tabular-nums">×{m.quantity}</span>
                </div>
                <SellStepper unitValue={materialValue(m.id)} available={m.quantity} onSell={(n) => sellMaterial(m, n)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {showGear && (
        <section>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5 mt-1">Spare gear <span className="text-game-muted normal-case tracking-normal">(equipped/reserved gear is hidden)</span></div>
          <div className="space-y-1.5">
            {gear.length === 0 && <div className="text-xs text-game-muted italic">No spare gear — everything's in use.</div>}
            {gear.map((it) => (
              <div key={it.id} className="rounded-lg border border-game-border bg-game-bg px-2.5 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-game-text font-medium truncate flex-1">{it.name}</span>
                  <span className="text-[9px] text-game-muted">{CATEGORY_LABELS[it.category]}</span>
                  <button
                    onClick={() => sellGear(it)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-game-gold/50 text-game-text hover:bg-game-gold/10 text-[11px] shrink-0"
                  >Sell <span className="text-game-gold font-semibold">{equipmentValue(it)}g</span></button>
                </div>
                <TraitRow traits={objectiveChips(it)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Craft ──────────────────────────────────────────────────────────────────────
type CraftFilter = 'all' | 'material' | 'consumable' | 'weapon' | 'armor' | 'accessory'
const CRAFT_FILTERS: { id: CraftFilter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✦' },
  { id: 'material', label: 'Materials', icon: '📦' },
  { id: 'consumable', label: 'Consumables', icon: '🫙' },
  { id: 'weapon', label: 'Weapons', icon: '🗡' },
  { id: 'armor', label: 'Armor', icon: '🛡' },
  { id: 'accessory', label: 'Accessories', icon: '💍' },
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
  const maxBatch = (r: CraftingRecipe) =>
    r.ingredients.reduce((min, ing) => Math.min(min, Math.floor(have(ing.itemId) / ing.quantity)), Infinity)

  function doCraft(r: CraftingRecipe, batch: number) {
    const n = Math.min(batch, maxBatch(r))
    if (n <= 0) return
    if (r.outputCategory) {
      // Equipment output — consume reagents, mint owned instances.
      for (const ing of r.ingredients) consumeMiscItem(ing.itemId, ing.quantity * n)
      for (let i = 0; i < r.outputQuantity * n; i++) grantEquipment(r.outputItemId)
    } else {
      // Material/consumable — reuse the store's craft (it names the output stack).
      for (let i = 0; i < n; i++) craftStore(r.id)
    }
  }

  const ql = q.trim().toLowerCase()
  const recipes = useMemo(() => {
    return Object.values(RECIPE_REGISTRY)
      .filter((r) => recipeMatchesFilter(r, filter))
      .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.outputName.toLowerCase().includes(ql))
      .sort((a, b) => {
        const ca = maxBatch(a) > 0 ? 0 : 1, cb = maxBatch(b) > 0 ? 0 : 1
        return ca - cb || a.name.localeCompare(b.name)
      })
  // recompute when stock changes (affordability sort) or filter/search change
  }, [filter, ql, miscItems])

  return (
    <div className="space-y-3">
      <input
        value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…"
        className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-1.5 text-sm text-game-text placeholder:text-game-muted focus:border-game-primary/50 outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {CRAFT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={['px-2.5 py-1 rounded-full text-[11px] border transition-colors',
              filter === f.id ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}
          >{f.icon} {f.label}</button>
        ))}
      </div>
      <div className="text-[11px] text-game-text-dim">{recipes.length} recipe{recipes.length === 1 ? '' : 's'}</div>

      <div className="space-y-1.5">
        {recipes.map((r) => {
          const batch = maxBatch(r)
          const craftable = batch > 0
          const open = openId === r.id
          const eqDef = r.outputCategory ? EQUIPMENT_DEF[r.outputItemId] : undefined
          return (
            <div key={r.id} className={['rounded-lg border bg-game-bg transition-colors',
              open ? 'border-game-primary/50' : craftable ? 'border-game-border' : 'border-game-border opacity-60'].join(' ')}>
              <button onClick={() => setOpenId(open ? null : r.id)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
                <span className="text-base leading-none shrink-0">{eqDef ? '⚒' : (r.category === 'consumable' ? '🫙' : '📦')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-game-text truncate">{r.outputName}</span>
                    <span className="text-[10px] text-game-text-dim shrink-0">×{r.outputQuantity}</span>
                  </div>
                  <div className="text-[10px] text-game-text-dim truncate">
                    {r.ingredients.map((ing) => `${itemName(ing.itemId)} ×${ing.quantity}`).join(' · ')}
                  </div>
                </div>
                <span className={['text-[10px] shrink-0 tabular-nums', craftable ? 'text-game-green' : 'text-game-muted'].join(' ')}>
                  {craftable ? `can make ${batch === Infinity ? '∞' : batch}` : 'missing'}
                </span>
                <span className="text-game-muted text-xs shrink-0">{open ? '▲' : '▼'}</span>
              </button>

              {open && (
                <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-game-border/60 pt-2">
                  <p className="text-[11px] text-game-text-dim">{r.description}</p>

                  {/* Reagents — have / need */}
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-game-text-dim mb-1">Reagents</div>
                    <div className="space-y-1">
                      {r.ingredients.map((ing) => {
                        const h = have(ing.itemId)
                        const ok = h >= ing.quantity
                        return (
                          <div key={ing.itemId} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-game-text truncate">{itemName(ing.itemId)}</span>
                            <span className={`font-mono text-[11px] ${ok ? 'text-game-green' : 'text-red-400'}`}>{h} / {ing.quantity}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Output preview */}
                  <div className="rounded-md border border-game-border/70 bg-game-surface/40 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-widest text-game-text-dim mb-1">Yields</div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-game-text">{r.outputName}</span>
                      <span className="text-[10px] text-game-text-dim">×{r.outputQuantity}</span>
                      {eqDef && <span className="text-[9px] text-game-muted ml-auto">{CATEGORY_LABELS[eqDef.category]}</span>}
                    </div>
                    {eqDef ? (
                      <>
                        <TraitRow traits={objectiveChips(eqDef)} />
                        {eqDef.description && <p className="text-[10px] text-game-text-dim mt-1">{eqDef.description}</p>}
                        <div className="text-[10px] text-game-text-dim mt-1">Sells for <span className="text-game-gold">{equipmentValue(eqDef)}g</span></div>
                      </>
                    ) : (
                      <div className="text-[10px] text-game-text-dim">Sells for <span className="text-game-gold">{materialValue(r.outputItemId)}g</span> each</div>
                    )}
                  </div>

                  {/* Batch craft */}
                  <div className="flex items-center gap-1.5">
                    {[1, 10].map((n) => (
                      <button
                        key={n}
                        disabled={batch < n}
                        onClick={() => doCraft(r, n)}
                        className={['flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          batch >= n ? 'bg-game-border/60 text-game-text hover:bg-game-border' : 'bg-game-border/30 text-game-muted cursor-not-allowed'].join(' ')}
                      >Craft ×{n}</button>
                    ))}
                    <button
                      disabled={!craftable || batch === Infinity}
                      onClick={() => doCraft(r, batch === Infinity ? 1 : batch)}
                      title={batch === Infinity ? 'No reagents required' : `Craft the most you can (${batch})`}
                      className={['flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        craftable && batch !== Infinity ? 'bg-game-primary text-white hover:bg-game-primary/80' : 'bg-game-border/30 text-game-muted cursor-not-allowed'].join(' ')}
                    >Max{craftable && batch !== Infinity ? ` ×${batch}` : ''}</button>
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

// ── Storage (per-hero packs ⇄ shared storage) ─────────────────────────────────--

// Build a one-time mock seed: deployed heroes have partially-full packs rolled
// from the monsters at their location, so Storage has something to show.
function buildSeed(units: Unit[], locations: { id: string; monsterIds: string[] }[]): Record<string, Pack> {
  const seed: Record<string, Pack> = {}
  for (const u of units) {
    if (!u.locationId) continue
    const loc = locations.find((l) => l.id === u.locationId)
    if (!loc || loc.monsterIds.length === 0) continue
    const cap = Math.floor(CARRY_CAPACITY * (0.3 + Math.random() * 0.55))
    const pack: Pack = {}
    let filled = 0
    const drops = loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
    for (const d of drops) {
      if (filled >= cap) break
      if (Math.random() < d.dropRate) {
        const want = d.quantityMin + Math.floor(Math.random() * (d.quantityMax - d.quantityMin + 1))
        const q = Math.min(want, cap - filled)
        if (q > 0) { pack[d.itemId] = (pack[d.itemId] ?? 0) + q; filled += q }
      }
    }
    if (filled > 0) seed[u.id] = pack
  }
  return seed
}

// Roll a small fresh batch of drops for a "simulate a hunt" tap.
function huntDrops(u: Unit, locations: { id: string; monsterIds: string[] }[]): { itemId: string; qty: number }[] {
  const loc = u.locationId ? locations.find((l) => l.id === u.locationId) : null
  const pool = loc && loc.monsterIds.length
    ? loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
    : [{ itemId: 'drop-slime-gel', dropRate: 1, quantityMin: 1, quantityMax: 3 }]
  const out: { itemId: string; qty: number }[] = []
  for (const d of pool) {
    if (Math.random() < d.dropRate) out.push({ itemId: d.itemId, qty: d.quantityMin + Math.floor(Math.random() * (d.quantityMax - d.quantityMin + 1)) })
  }
  if (out.length === 0) out.push({ itemId: pool[0]?.itemId ?? 'drop-slime-gel', qty: 1 })
  return out
}

function PackCard({ unit }: { unit: Unit }) {
  const locations = useGameStore((s) => s.locations)
  const pack = useProtoStore((s) => s.packs[unit.id])
  const depositPack  = useProtoStore((s) => s.depositPack)
  const simulateHunt = useProtoStore((s) => s.simulateHunt)
  const count = packCount(pack)
  const pct = Math.min(100, (count / CARRY_CAPACITY) * 100)
  const full = packFull(pack)
  const entries = pack ? Object.entries(pack).filter(([, q]) => q > 0) : []
  const loc = unit.locationId ? locations.find((l) => l.id === unit.locationId) : null

  return (
    <div className="rounded-lg border border-game-border bg-game-bg p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-game-surface border border-game-border flex items-center justify-center text-sm shrink-0">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-game-text truncate">{unit.name}</div>
          <div className="text-[10px] text-game-text-dim truncate">{loc ? loc.name : 'At the guild'}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[11px] tabular-nums ${full ? 'text-red-400 font-semibold' : 'text-game-text-dim'}`}>{count}/{CARRY_CAPACITY}</div>
          {packValue(pack) > 0 && <div className="text-[9px] text-game-gold tabular-nums">{packValue(pack).toLocaleString()}g</div>}
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-game-border overflow-hidden mb-2">
        <div className={`h-full rounded-full ${full ? 'bg-red-500' : pct > 70 ? 'bg-game-gold' : 'bg-game-green'}`} style={{ width: `${pct}%` }} />
      </div>

      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-2">
          {entries.map(([id, q]) => (
            <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-game-border/40 text-game-text-dim" title={itemName(id)}>
              {itemName(id)} <span className="text-game-text tabular-nums">×{q}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-game-muted italic mb-2">Pack empty.</div>
      )}

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => simulateHunt(unit.id, huntDrops(unit, locations))}
          disabled={full}
          title={full ? 'Pack full — deposit before hunting more' : 'Simulate a hunt (mock drops into this pack)'}
          className={['text-[11px] px-2 py-1 rounded-md border transition-colors',
            full ? 'border-game-border text-game-muted cursor-not-allowed' : 'border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5'].join(' ')}
        >⚔ Hunt</button>
        <button
          onClick={() => depositPack(unit.id)}
          disabled={count <= 0}
          className={['flex-1 text-[11px] px-2 py-1 rounded-md border transition-colors',
            count > 0 ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
        >⇩ Deposit to storage</button>
      </div>
      {full && <div className="text-[10px] text-red-400 mt-1.5">Pack full — this hero can't pick up more loot. Return to town to deposit.</div>}
    </div>
  )
}

function Storage() {
  const units     = useGameStore((s) => s.units)
  const miscItems = useGameStore((s) => s.miscItems)
  const packs     = useProtoStore((s) => s.packs)
  const depositAllPacks = useProtoStore((s) => s.depositAllPacks)

  // Carriers = anyone with something in their pack, or anyone deployed.
  const carriers = units.filter((u) => (packs[u.id] && packCount(packs[u.id]) > 0) || u.locationId)
  const totalCarried = Object.values(packs).reduce((n, p) => n + packCount(p), 0)
  const stored = miscItems.filter((m) => m.id !== GOLD_ID && m.quantity > 0)

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-game-text-dim leading-snug">
        Each hero carries their own kills until they reach town. Capacity is {CARRY_CAPACITY} items — once a pack is full they can't pick up more.
        <span className="text-game-muted"> Drops here are mocked (⚔ Hunt) so the carry → deposit flow can be felt before it's wired into combat.</span>
      </p>

      <section>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Hero packs</span>
          <button
            onClick={depositAllPacks}
            disabled={totalCarried <= 0}
            className={['text-[11px] px-2 py-1 rounded-md border transition-colors',
              totalCarried > 0 ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
        >⇩ Deposit all ({totalCarried})</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {carriers.map((u) => <PackCard key={u.id} unit={u} />)}
        </div>
        {carriers.length === 0 && <div className="text-xs text-game-muted italic">No heroes deployed — packs fill in the field.</div>}
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Town storage <span className="text-game-muted normal-case tracking-normal">(shared)</span></div>
        <div className="grid grid-cols-2 gap-1">
          {stored.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5 rounded border border-game-border bg-game-bg px-2 py-1" title={m.description}>
              <span className="text-xs text-game-text truncate flex-1">{m.name}</span>
              <span className="text-[10px] text-game-text-dim tabular-nums">×{m.quantity}</span>
            </div>
          ))}
          {stored.length === 0 && <div className="col-span-2 text-xs text-game-muted italic">Storage is empty.</div>}
        </div>
      </section>
    </div>
  )
}

// ── Town shell ─────────────────────────────────────────────────────────────────
type TownTab = 'market' | 'craft' | 'storage'
const TOWN_TABS: { id: TownTab; label: string; icon: string }[] = [
  { id: 'market', label: 'Market', icon: '🏪' },
  { id: 'craft', label: 'Craft', icon: '⚒' },
  { id: 'storage', label: 'Storage', icon: '📦' },
]

export function Town({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TownTab>('market')
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const packsSeeded = useProtoStore((s) => s.packsSeeded)
  const seedPacks   = useProtoStore((s) => s.seedPacks)

  // One-time mock seed so Storage isn't empty on first open.
  useEffect(() => {
    if (!packsSeeded) seedPacks(buildSeed(units, locations))
  // run once on mount
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">🏪 Town</span>
        <span className="text-[10px] text-game-muted hidden sm:inline">— trade, craft & stow loot</span>
        <Gold className="ml-auto text-sm" />
        <button onClick={onClose} className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
      </header>

      <div className="shrink-0 flex border-b border-game-border bg-game-surface/60">
        {TOWN_TABS.map((t) => (
          <button
            key={t.id}
            aria-label={t.label}
            onClick={() => setTab(t.id)}
            className={['flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-colors relative',
              tab === t.id ? 'text-game-primary' : 'text-game-muted hover:text-game-text-dim'].join(' ')}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-xs font-medium">{t.label}</span>
            {tab === t.id && <span className="absolute bottom-0 inset-x-6 h-0.5 rounded-full bg-game-primary" />}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 max-w-2xl w-full mx-auto">
        {tab === 'market' && <Market />}
        {tab === 'craft' && <Craft />}
        {tab === 'storage' && <Storage />}
      </div>
    </div>,
    document.body,
  )
}
