import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useGameStore, getItemTraits, RECIPE_REGISTRY, CATEGORY_LABELS,
  type EquipmentItem, type Unit, type CraftingRecipe, type Trait, type Location,
} from '@/stores/useGameStore'
import { DROP_ITEMS } from '@/data/monsters'
import { CARD_REGISTRY, cardBonusLine, type CardFit } from '@/data/cards'
import {
  MERCHANT_REGISTRY, merchantLocation, wanderTicksLeft, sellOffer, buyPriceFor,
  type MerchantDef, type OfferTone, type MerchantStock,
} from '@/data/merchants'
import { TraitRow } from '@/components/TraitBubble'
import { ItemCodex } from '@/components/ItemCodex'
import { consumableDef, CONSUMABLE_REGISTRY } from '@/data/consumables'
import { useProtoStore } from './protoStore'
import { GOLD_ID, materialValue, equipmentValue, EQUIPMENT_DEF, itemWeight } from './economy'
import { SocketPips, CardChip, CardCodex, SocketEditor, socketsOf } from './CardBits'
import { seedProtoMocks } from './seed'

// ── Town (the GLOBAL board) ──────────────────────────────────────────────────--
//   Market — merchant shops pinned to map locations (trade only while a hero is
//            there); per-merchant pricing; a clock-driven wandering trader.
//   Cards  — the guild card collection.
//   Stash  — the in-town workbench: all equipment + its sockets (editable only
//            for gear in town), shared materials, crafting.

const BASE_NAMES: Record<string, string> = { m1: 'Wood', m2: 'Iron Ore', m3: 'Fish', m4: 'Herbs', 'm-gold': 'Gold' }
const RECIPE_BY_OUTPUT = Object.values(RECIPE_REGISTRY).reduce<Record<string, string>>((acc, r) => { acc[r.outputItemId] = r.outputName; return acc }, {})
function itemName(id: string): string {
  return BASE_NAMES[id] ?? DROP_ITEMS[id] ?? EQUIPMENT_DEF[id]?.name ?? consumableDef(id)?.name ?? RECIPE_BY_OUTPUT[id] ?? id
}
function objectiveChips(it: EquipmentItem): Trait[] {
  const chips = getItemTraits(it)
  if (it.category === 'weapon-1h' || it.category === 'weapon-2h') {
    const r = it.stats.range ?? 5
    chips.push({ id: `rng-${it.id}`, label: r > 5 ? `${r} RNG` : 'melee', category: 'stat', description: r > 5 ? `Reaches ${r} ft.` : 'Melee weapon.' })
  }
  return chips
}
const isTown = (loc: Location | undefined) => !!loc?.traits.includes('city')
function heldMaps(units: Unit[]): { name: Map<string, string>; unit: Map<string, Unit> } {
  const name = new Map<string, string>(); const unit = new Map<string, Unit>()
  for (const u of units) {
    const refs = [u.weaponSets[0].mainHand, u.weaponSets[0].offHand, u.weaponSets[1].mainHand, u.weaponSets[1].offHand, u.equipment.armor, u.equipment.accessory, u.equipment.sideboard1, u.equipment.sideboard2]
    for (const id of refs) if (id) { name.set(id, u.name); unit.set(id, u) }
  }
  return { name, unit }
}
const changeGold = (delta: number) => {
  if (delta > 0) useGameStore.getState().grantMiscItem(GOLD_ID, delta)
  else if (delta < 0) useGameStore.getState().consumeMiscItem(GOLD_ID, -delta)
}
const goldNow = () => useGameStore.getState().miscItems.find((m) => m.id === GOLD_ID)?.quantity ?? 0

function Gold({ className = '' }: { className?: string }) {
  const gold = useGameStore((s) => s.miscItems.find((m) => m.id === GOLD_ID)?.quantity ?? 0)
  return <span className={`tabular-nums text-game-gold font-semibold ${className}`}>◈ {gold.toLocaleString()}</span>
}

const TONE_CLS: Record<OfferTone, string> = { want: 'text-sky-300', market: 'text-game-text', dislike: 'text-red-400' }

// ── A merchant's shop (buy with a cart + tone-sorted selling) ─────────────────--
const TONE_LABEL: Record<OfferTone, string> = { want: 'Wanted', market: 'Market', dislike: 'Unwanted' }
const TONE_NEXT: Record<OfferTone, OfferTone> = { want: 'market', market: 'dislike', dislike: 'want' }
const TONE_DOT: Record<OfferTone, string> = { want: 'bg-sky-400', market: 'bg-game-text-dim', dislike: 'bg-red-400' }
type SellRow = { id: string; name: string; qty: number; offer: ReturnType<typeof sellOffer>; gear?: EquipmentItem }

function Shop({ m, visiting }: { m: MerchantDef; visiting: Unit | null }) {
  const miscItems = useGameStore((s) => s.miscItems)
  const equipment = useGameStore((s) => s.equipment)
  const units     = useGameStore((s) => s.units)
  const consumeMiscItem = useGameStore((s) => s.consumeMiscItem)
  const grantMiscItem   = useGameStore((s) => s.grantMiscItem)
  const grantEquipment  = useGameStore((s) => s.grantEquipment)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [tone, setTone] = useState<OfferTone>('want')
  const [soldWant, setSoldWant] = useState<Record<string, number>>({})
  const [bought, setBought] = useState<Record<string, number>>({})
  const [inspectGear, setInspectGear] = useState<EquipmentItem | null>(null)
  const [inspectCard, setInspectCard] = useState<string | null>(null)

  const held = heldMaps(units).name
  const stockLeft = (s: MerchantStock) => s.stock != null ? s.stock - (bought[s.id] ?? 0) : Infinity
  const priceOf = (s: MerchantStock) => buyPriceFor(m, s.price, visiting)

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartTotal = Object.entries(cart).reduce((sum, [id, q]) => { const s = m.stock.find((x) => x.id === id); return sum + (s ? priceOf(s) * q : 0) }, 0)
  const addCart = (s: MerchantStock, d: number) => setCart((c) => {
    const next = Math.max(0, Math.min((c[s.id] ?? 0) + d, stockLeft(s)))
    const nc = { ...c }; if (next <= 0) delete nc[s.id]; else nc[s.id] = next; return nc
  })
  function checkout() {
    if (goldNow() < cartTotal || cartCount <= 0) return
    for (const [id, q] of Object.entries(cart)) {
      const s = m.stock.find((x) => x.id === id); if (!s) continue
      for (let i = 0; i < q; i++) {
        changeGold(-priceOf(s))
        if (s.kind === 'material' || s.kind === 'consumable') grantMiscItem(s.id, 1)
        else if (s.kind === 'equipment') grantEquipment(s.id)
        else useProtoStore.setState((st) => ({ ownedCards: { ...st.ownedCards, [s.id]: (st.ownedCards[s.id] ?? 0) + 1 } }))
      }
      setBought((b) => ({ ...b, [id]: (b[id] ?? 0) + q }))
    }
    setCart({})
  }

  // Unified sell list (materials + spare gear), priced by this merchant, filtered
  // to the toggled tone and sorted by gold value.
  const sellRows: SellRow[] = [
    ...miscItems.filter((i) => i.id !== GOLD_ID && i.quantity > 0).map((i) => ({ id: i.id, name: i.name, qty: i.quantity, offer: sellOffer(m, i.id, materialValue(i.id), visiting) })),
    ...equipment.filter((e) => !held.has(e.id)).map((e) => ({ id: e.id, name: e.name, qty: 1, offer: sellOffer(m, e.id, equipmentValue(e), visiting), gear: e })),
  ].filter((r) => r.offer.tone === tone).sort((a, b) => b.offer.price * b.qty - a.offer.price * a.qty)

  function sellRow(r: SellRow) {
    if (r.gear) { useGameStore.setState((s) => ({ equipment: s.equipment.filter((e) => e.id !== r.gear!.id) })); changeGold(r.offer.price) }
    else {
      const capLeft = r.offer.cap != null ? Math.max(0, r.offer.cap - (soldWant[r.id] ?? 0)) : Infinity
      const count = r.offer.tone === 'want' ? Math.min(r.qty, capLeft) : r.qty
      if (count <= 0) return
      consumeMiscItem(r.id, count); changeGold(r.offer.price * count)
      if (r.offer.tone === 'want') setSoldWant((s) => ({ ...s, [r.id]: (s[r.id] ?? 0) + count }))
    }
  }

  return (
    <div className="px-2.5 pb-3 pt-1 space-y-3 border-t border-game-border/50">
      {visiting && <div className="text-[10px] text-game-text-dim">Visiting: <span className="text-game-text">{visiting.name}</span>{m.favorClass && (visiting.class ?? 'Novice') === m.favorClass && <span className="text-game-green"> · favored ({m.favorClass})</span>}</div>}

      {/* BUY — whole row inspects; +/- builds a cart; checkout at the bottom */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">For sale</div>
        <div className="space-y-1.5">
          {m.stock.map((s) => {
            const left = stockLeft(s); const sold = left <= 0
            const card = s.kind === 'card' ? CARD_REGISTRY[s.id] : null
            const eq = s.kind === 'equipment' ? EQUIPMENT_DEF[s.id] : null
            const inspectable = !!(card || eq)
            const qty = cart[s.id] ?? 0
            return (
              <div key={s.id} className={['flex items-center gap-2 rounded-lg border border-game-border bg-game-bg px-2.5 py-2', sold ? 'opacity-50' : ''].join(' ')}>
                <button disabled={!inspectable} onClick={() => card ? setInspectCard(s.id) : setInspectGear(eq!)} className={['flex items-center gap-2 min-w-0 flex-1 text-left', inspectable ? '' : 'cursor-default'].join(' ')}>
                  <span className="text-sm leading-none shrink-0">{s.kind === 'card' ? '◆' : s.kind === 'equipment' ? '⚔' : s.kind === 'consumable' ? (consumableDef(s.id)?.icon ?? '🧪') : '📦'}</span>
                  <span className="min-w-0">
                    <span className="text-sm text-game-text font-medium truncate block">{itemName(s.id)} {inspectable && <span className="text-[9px] text-game-text-dim">· inspect</span>}</span>
                    <span className="text-[10px] text-game-text-dim truncate block">{card ? (cardBonusLine(card.bonus) || 'card') : eq ? `${CATEGORY_LABELS[eq.category]}${eq.slots ? ` · ${eq.slots} sockets` : ''}` : s.kind === 'consumable' ? 'consumable' : 'material'}{s.stock != null && <span className="text-game-muted"> · {sold ? 'sold out' : `${left} left`}</span>}</span>
                  </span>
                </button>
                <span className="text-[11px] text-game-gold font-semibold tabular-nums shrink-0">{priceOf(s)}g</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button disabled={qty <= 0} onClick={() => addCart(s, -1)} className={['w-7 h-7 rounded-md border text-sm', qty > 0 ? 'border-game-border text-game-text hover:bg-white/5' : 'border-game-border/50 text-game-muted cursor-not-allowed'].join(' ')}>−</button>
                  <span className="w-5 text-center text-xs tabular-nums">{qty}</span>
                  <button disabled={sold || qty >= left} onClick={() => addCart(s, 1)} className={['w-7 h-7 rounded-md border text-sm', !sold && qty < left ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border/50 text-game-muted cursor-not-allowed'].join(' ')}>＋</button>
                </div>
              </div>
            )
          })}
        </div>
        {cartCount > 0 && (
          <button disabled={goldNow() < cartTotal} onClick={checkout} className={['w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium', goldNow() >= cartTotal ? 'bg-game-primary text-white hover:bg-game-primary/80' : 'bg-game-border/40 text-game-muted cursor-not-allowed'].join(' ')}>
            Buy {cartCount} item{cartCount === 1 ? '' : 's'} <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs tabular-nums">{cartTotal.toLocaleString()}g</span>{goldNow() < cartTotal && <span className="text-[10px]">· not enough gold</span>}
          </button>
        )}
      </div>

      {/* SELL — tone tri-toggle (blue → white → red); whole row inspects gear */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Your goods</span>
          <button onClick={() => setTone(TONE_NEXT[tone])} title="Cycle: Wanted → Market → Unwanted" className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-game-border text-[11px] text-game-text hover:bg-white/5">
            <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} /><span className={TONE_CLS[tone]}>{TONE_LABEL[tone]}</span><span className="text-game-muted">⇄</span>
          </button>
        </div>
        <div className="space-y-1">
          {sellRows.length === 0 && <div className="text-xs text-game-muted italic">Nothing {TONE_LABEL[tone].toLowerCase()} to sell here.</div>}
          {sellRows.map((r) => {
            const capLeft = r.offer.cap != null ? Math.max(0, r.offer.cap - (soldWant[r.id] ?? 0)) : Infinity
            const blocked = r.offer.tone === 'want' && capLeft <= 0
            return (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-game-border/60 bg-game-bg">
                <button disabled={!r.gear} onClick={() => r.gear && setInspectGear(r.gear)} className={['flex items-center gap-2 min-w-0 flex-1 text-left', r.gear ? '' : 'cursor-default'].join(' ')}>
                  <span className="text-sm text-game-text truncate">{r.name}{r.gear && <span className="text-[9px] text-game-text-dim"> · inspect</span>}</span>
                  {r.gear && <SocketPips slots={socketsOf(useProtoStore.getState().sockets, r.gear)} />}
                </button>
                {r.offer.tone === 'want' && <span className="text-[9px] text-sky-300/80 shrink-0">wants {capLeft}</span>}
                {!r.gear && <span className="text-[11px] text-game-text-dim tabular-nums shrink-0">×{r.qty.toLocaleString()}</span>}
                <span className={`text-[11px] tabular-nums shrink-0 ${TONE_CLS[r.offer.tone]}`}>{r.offer.price}g</span>
                <button disabled={blocked} onClick={() => sellRow(r)} className={['text-xs px-3 py-1 rounded-md border shrink-0 font-medium', blocked ? 'border-game-border text-game-muted cursor-not-allowed' : 'border-game-gold/50 text-game-text hover:bg-game-gold/10'].join(' ')}>Sell</button>
              </div>
            )
          })}
        </div>
        <div className="text-[9px] text-game-muted mt-1">Tone: <span className="text-sky-300">wanted</span> (premium) · <span className="text-game-text">market</span> · <span className="text-red-400">unwanted</span> (low/negative)</div>
      </div>

      {inspectGear && <ItemCodex item={inspectGear} onClose={() => setInspectGear(null)} />}
      {inspectCard && <CardCodex cardId={inspectCard} onClose={() => setInspectCard(null)} />}
    </div>
  )
}

// ── A merchant section (expandable shop) ───────────────────────────────────────--
function MerchantSection({ m, locId, present, visiting, open, onToggle }: { m: MerchantDef; locId: string; present: boolean; visiting: Unit | null; open: boolean; onToggle: () => void }) {
  const ticks = useGameStore((s) => s.ticks)
  const leavesMin = m.kind === 'wandering' ? Math.ceil(wanderTicksLeft(ticks) / 5 / 60) : null
  return (
    <div className={['rounded-lg border bg-game-bg', open ? 'border-game-primary/50' : 'border-game-border', !present ? 'opacity-60' : ''].join(' ')}>
      <button onClick={() => present && onToggle()} disabled={!present} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
        <span className="text-lg leading-none shrink-0">{m.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-game-text truncate">{m.name}</span>
            {m.kind === 'wandering' && <span className="text-[8px] uppercase tracking-wide text-amber-300/90 border border-amber-400/40 rounded px-1">wandering{leavesMin != null ? ` · ~${leavesMin}m` : ''}</span>}
          </div>
          <div className="text-[10px] text-game-text-dim truncate">{present ? m.blurb : 'No hero here — send someone to trade.'}</div>
        </div>
        {present ? <span className="text-game-muted text-xs shrink-0">{open ? '▲' : '▼'}</span> : <span className="text-[10px] text-game-muted shrink-0">🔒</span>}
      </button>
      {open && present && <Shop m={m} visiting={visiting} />}
    </div>
  )
}

function Market() {
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const ticks     = useGameStore((s) => s.ticks)
  const selectedIds = useGameStore((s) => s.selectedUnitIds)
  const [openId, setOpenId] = useState<string | null>(null)

  // Merchants at their current location (wanderers move with the clock), grouped
  // by location. A group is "open for business" when a hero is standing there.
  const groups = useMemo(() => {
    const byLoc = new Map<string, MerchantDef[]>()
    for (const m of Object.values(MERCHANT_REGISTRY)) {
      const loc = merchantLocation(m, ticks)
      const arr = byLoc.get(loc); if (arr) arr.push(m); else byLoc.set(loc, [m])
    }
    const present = (loc: string) => units.filter((u) => u.locationId === loc)
    const out = [...byLoc.entries()].map(([loc, ms]) => ({ loc, name: locations.find((l) => l.id === loc)?.name ?? loc, ms, heroes: present(loc) }))
    // open-for-business first, then by name
    return out.sort((a, b) => (b.heroes.length > 0 ? 1 : 0) - (a.heroes.length > 0 ? 1 : 0) || a.name.localeCompare(b.name))
  }, [units, locations, ticks])

  const visitingAt = (heroes: Unit[]) => heroes.find((h) => selectedIds.includes(h.id)) ?? heroes[0] ?? null

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-game-text-dim">Shops live on the map. Trade with a merchant only while one of your heroes is standing at their location.</p>
      {groups.map((g) => (
        <section key={g.loc}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">⌖ {g.name}</span>
            {g.heroes.length > 0
              ? <span className="text-[9px] text-game-green">· {g.heroes.length} hero{g.heroes.length === 1 ? '' : 'es'} here</span>
              : <span className="text-[9px] text-game-muted">· no hero present</span>}
          </div>
          <div className="space-y-1.5">
            {g.ms.map((m) => (
              <MerchantSection key={m.id} m={m} locId={g.loc} present={g.heroes.length > 0} visiting={visitingAt(g.heroes)} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />
            ))}
          </div>
        </section>
      ))}
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
          <button key={t.id} onClick={() => setTab(t.id)} className={['px-2.5 py-1 rounded-full text-[11px] border', tab === t.id ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}>{t.label}</button>
        ))}
        <span className="ml-auto text-[11px] text-game-text-dim self-center">{discovered.length}/{all.length} collected</span>
      </div>
      {discovered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {discovered.map((c) => (
            <div key={c.id} className="relative">
              <CardChip cardId={c.id} count={ownedCards[c.id] ?? 0} onClick={() => setInspect(c.id)} />
              {socketed[c.id] ? <span className="absolute top-1 right-1.5 text-[8px] text-game-accent">{socketed[c.id]} in use</span> : null}
            </div>
          ))}
        </div>
      ) : <div className="text-xs text-game-muted italic">No cards in this family yet.</div>}
      {undiscovered.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5 mt-1">Undiscovered ({undiscovered.length})</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">{undiscovered.map((c) => <CardChip key={c.id} cardId={c.id} count={0} dimmed onClick={() => setInspect(c.id)} />)}</div>
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
    const n = Math.min(batch, maxBatch(r)); if (n <= 0) return
    if (r.outputCategory) { for (const ing of r.ingredients) consumeMiscItem(ing.itemId, ing.quantity * n); for (let i = 0; i < r.outputQuantity * n; i++) grantEquipment(r.outputItemId) }
    else for (let i = 0; i < n; i++) craftStore(r.id)
  }
  const ql = q.trim().toLowerCase()
  const recipes = useMemo(() => Object.values(RECIPE_REGISTRY)
    .filter((r) => recipeMatchesFilter(r, filter))
    .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.outputName.toLowerCase().includes(ql))
    .sort((a, b) => (maxBatch(a) > 0 ? 0 : 1) - (maxBatch(b) > 0 ? 0 : 1) || a.name.localeCompare(b.name)),
  [filter, ql, miscItems]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…" className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-1.5 text-sm text-game-text placeholder:text-game-muted focus:border-game-primary/50 outline-none" />
      <div className="flex flex-wrap gap-1.5">
        {CRAFT_FILTERS.map((f) => <button key={f.id} onClick={() => setFilter(f.id)} className={['px-2.5 py-1 rounded-full text-[11px] border', filter === f.id ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}>{f.icon} {f.label}</button>)}
      </div>
      <div className="space-y-1.5">
        {recipes.map((r) => {
          const batch = maxBatch(r); const craftable = batch > 0; const open = openId === r.id
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
                    <div className="space-y-1">{r.ingredients.map((ing) => { const h = have(ing.itemId); const ok = h >= ing.quantity; return <div key={ing.itemId} className="flex items-center gap-2 text-xs"><span className="flex-1 text-game-text truncate">{itemName(ing.itemId)}</span><span className={`font-mono text-[11px] ${ok ? 'text-game-green' : 'text-red-400'}`}>{h} / {ing.quantity}</span></div> })}</div>
                  </div>
                  <div className="rounded-md border border-game-border/70 bg-game-surface/40 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-widest text-game-text-dim mb-1">Yields</div>
                    <div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium text-game-text">{r.outputName}</span><span className="text-[10px] text-game-text-dim">×{r.outputQuantity}</span>{eqDef && <span className="text-[9px] text-game-muted ml-auto">{CATEGORY_LABELS[eqDef.category]}</span>}</div>
                    {eqDef ? (<><TraitRow traits={objectiveChips(eqDef)} />{eqDef.description && <p className="text-[10px] text-game-text-dim mt-1">{eqDef.description}</p>}</>) : (<div className="text-[10px] text-game-text-dim">Sells for <span className="text-game-gold">{materialValue(r.outputItemId)}g</span> each</div>)}
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

// ── Stash (the in-town workbench: equipment + sockets, materials, consumables) ──--
type WhereFilter = 'all' | 'town' | 'hero'
type EquipFilter = 'all' | 'equipped' | 'unequipped'
const FILTER_CHIP = (on: boolean) =>
  `text-[10px] px-2 py-0.5 rounded-full border transition-colors ${on ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'}`

function Stash() {
  const equipment = useGameStore((s) => s.equipment)
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const miscItems = useGameStore((s) => s.miscItems)
  const sockets   = useProtoStore((s) => s.sockets)
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<'gear' | 'cards' | 'mats' | 'consumables' | 'craft'>('gear')
  const [equipFilter, setEquipFilter] = useState<EquipFilter>('all')
  const [where, setWhere] = useState<WhereFilter>('all')

  const { unit: holderUnit } = heldMaps(units)
  const stored = miscItems.filter((m) => m.id !== GOLD_ID && m.quantity > 0)
  const socketable = equipment.filter((e) => (e.slots ?? 0) > 0)

  // Modifiable when in town: gear in the stash (unheld) is in town; gear a hero
  // carries can only be reworked while that hero is at a city.
  const modInfo = (it: EquipmentItem): { ok: boolean; reason: string; holder?: string } => {
    const u = holderUnit.get(it.id)
    if (!u) return { ok: true, reason: 'in stash' }
    const loc = u.locationId ? locations.find((l) => l.id === u.locationId) : undefined
    if (isTown(loc)) return { ok: true, reason: `${u.name.split(' ')[0]} in ${loc!.name}`, holder: u.name }
    return { ok: false, reason: `${u.name.split(' ')[0]} is away — equipped/in use`, holder: u.name }
  }

  // Equipped = held in a hero's slots; in town = sitting in the stash (no holder).
  const visibleGear = socketable.filter((it) => {
    const held = holderUnit.has(it.id)
    if (equipFilter === 'equipped' && !held) return false
    if (equipFilter === 'unequipped' && held) return false
    if (where === 'town' && held) return false
    if (where === 'hero' && !held) return false
    return true
  })

  // ── Consumables: in town (guild stash) + on hero (carried in Unit.pack) ──
  const consumableIds = [...new Set([
    ...Object.keys(CONSUMABLE_REGISTRY),
    ...miscItems.filter((m) => m.kind === 'consumable' && m.quantity > 0).map((m) => m.id),
    ...units.flatMap((u) => (u.pack ?? []).filter((p) => p.count > 0).map((p) => p.itemId)),
  ])]
  const stashQty = (id: string) => miscItems.find((m) => m.id === id)?.quantity ?? 0
  const carriers = (id: string) => units
    .map((u) => ({ u, n: u.pack?.find((p) => p.itemId === id)?.count ?? 0 }))
    .filter((x) => x.n > 0)
  const cName = (id: string) => consumableDef(id)?.name ?? miscItems.find((m) => m.id === id)?.name ?? id
  const cIcon = (id: string) => consumableDef(id)?.icon ?? '🫙'
  const consumableRows = consumableIds.map((id) => ({ id, inTown: stashQty(id), onHero: carriers(id) }))
    .filter((r) => {
      const heroTotal = r.onHero.reduce((a, b) => a + b.n, 0)
      if (where === 'town') return r.inTown > 0
      if (where === 'hero') return heroTotal > 0
      return r.inTown > 0 || heroTotal > 0
    })

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border border-game-border overflow-hidden text-xs">
        {([['gear', 'Equipment'], ['cards', 'Cards'], ['mats', 'Materials'], ['consumables', 'Consumables'], ['craft', 'Craft']] as const).map(([id, label], i) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 px-2 py-1.5 ${tab === id ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text'} ${i > 0 ? 'border-l border-game-border' : ''}`}>{label}</button>
        ))}
      </div>

      {/* Filters — where an item is, and (for gear) whether it's equipped */}
      {(tab === 'gear' || tab === 'consumables') && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-game-muted mr-0.5">Where</span>
          {(['all', 'town', 'hero'] as const).map((w) => (
            <button key={w} onClick={() => setWhere(w)} className={FILTER_CHIP(where === w)}>{w === 'all' ? 'All' : w === 'town' ? 'In town' : 'On hero'}</button>
          ))}
          {tab === 'gear' && <>
            <span className="text-[9px] uppercase tracking-wider text-game-muted ml-2 mr-0.5">Status</span>
            {(['all', 'equipped', 'unequipped'] as const).map((e) => (
              <button key={e} onClick={() => setEquipFilter(e)} className={FILTER_CHIP(equipFilter === e)}>{e === 'all' ? 'All' : e === 'equipped' ? 'Equipped' : 'Unequipped'}</button>
            ))}
          </>}
        </div>
      )}

      {tab === 'cards' && <CardsTab />}

      {tab === 'gear' && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-game-text-dim">Socket cards into any equipment. Gear in the stash (or carried by a hero in town) can be reworked; gear in the field is locked.</p>
          {visibleGear.map((it) => {
            const mod = modInfo(it)
            const isOpen = open === it.id
            const slots = socketsOf(sockets, it)
            return (
              <div key={it.id} className={['rounded-lg border bg-game-bg', isOpen ? 'border-game-primary/50' : 'border-game-border'].join(' ')}>
                <button onClick={() => setOpen(isOpen ? null : it.id)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
                  <span className="text-sm text-game-text font-medium truncate">{it.name}</span>
                  <SocketPips slots={slots} showCount />
                  <span className={['text-[9px] ml-auto shrink-0', mod.ok ? 'text-game-text-dim' : 'text-game-muted'].join(' ')}>{mod.holder ? mod.reason : 'stash'}</span>
                  {!mod.ok && <span className="text-[10px] shrink-0">🔒</span>}
                  <span className="text-game-muted text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && <div className="px-2.5 pb-2.5 pt-1 border-t border-game-border/50"><SocketEditor item={it} modifiable={mod.ok} lockReason={mod.reason} /></div>}
              </div>
            )
          })}
          {visibleGear.length === 0 && <div className="text-xs text-game-muted italic">{socketable.length === 0 ? 'No socketed equipment yet — craft or buy gear with sockets.' : 'No equipment matches the filter.'}</div>}
        </div>
      )}

      {tab === 'mats' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Shared storage ({stored.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {stored.map((m) => <div key={m.id} className="flex items-center gap-1.5 rounded border border-game-border bg-game-bg px-2 py-1" title={m.description}><span className="text-xs text-game-text truncate flex-1">{m.name}</span><span className="text-[10px] text-game-text-dim tabular-nums">×{m.quantity.toLocaleString()}</span></div>)}
            {stored.length === 0 && <div className="col-span-2 text-xs text-game-muted italic">Storage is empty.</div>}
          </div>
        </div>
      )}

      {tab === 'consumables' && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-game-text-dim">Healing potions &amp; other consumables — in the guild stash and carried by heroes. Heroes withdraw toward their logistics loadout when in town.</p>
          {consumableRows.map((r) => (
            <div key={r.id} className="rounded-lg border border-game-border bg-game-bg px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{cIcon(r.id)}</span>
                <span className="text-xs text-game-text font-medium flex-1 truncate">{cName(r.id)}</span>
                <span className="text-[10px] text-game-text-dim tabular-nums">{itemWeight(r.id)}w</span>
                <span className="text-[11px] text-game-text-dim tabular-nums">in town <span className="text-game-text font-mono">{r.inTown.toLocaleString()}</span></span>
              </div>
              {r.onHero.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-game-border/50">
                  {r.onHero.map(({ u, n }) => (
                    <span key={u.id} className="text-[10px] px-1.5 py-0.5 rounded border border-game-secondary/30 bg-game-secondary/5 text-game-text-dim">
                      {u.name.split(' ')[0]} <span className="font-mono text-game-text">{n}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {consumableRows.length === 0 && <div className="text-xs text-game-muted italic">No consumables {where === 'hero' ? 'carried by any hero' : where === 'town' ? 'in the stash' : 'anywhere'} yet.</div>}
        </div>
      )}

      {tab === 'craft' && <Craft />}
    </div>
  )
}

// ── Town shell ─────────────────────────────────────────────────────────────────
type TownTab = 'market' | 'stash'
const TOWN_TABS: { id: TownTab; label: string; icon: string }[] = [
  { id: 'market', label: 'Market', icon: '🏪' }, { id: 'stash', label: 'Stash', icon: '📦' },
]
export function Town({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TownTab>('market')
  useEffect(() => { seedProtoMocks() }, [])
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">🏪 Town</span>
        <span className="text-[10px] text-game-muted hidden sm:inline">— merchants, cards & workbench</span>
        <Gold className="ml-auto text-sm" />
        <button onClick={onClose} className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
      </header>
      <div className="shrink-0 flex border-b border-game-border bg-game-surface/60">
        {TOWN_TABS.map((t) => (
          <button key={t.id} aria-label={t.label} onClick={() => setTab(t.id)} className={['flex-1 flex items-center justify-center gap-1.5 py-2.5 relative', tab === t.id ? 'text-game-primary' : 'text-game-muted hover:text-game-text-dim'].join(' ')}>
            <span className="text-base leading-none">{t.icon}</span><span className="text-xs font-medium">{t.label}</span>
            {tab === t.id && <span className="absolute bottom-0 inset-x-6 h-0.5 rounded-full bg-game-primary" />}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 max-w-2xl w-full mx-auto" style={{ zoom: 1.12 }}>
          {tab === 'market' && <Market />}
          {tab === 'stash' && <Stash />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
