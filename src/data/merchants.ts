import type { Unit } from '@/types'

// ── Merchants (prototype) ────────────────────────────────────────────────────--
//
// The Market is a set of *merchant shops*, each pinned to a map location. You can
// only trade with a merchant while one of your heroes is at that location — the
// fiction is that a hero is physically visiting the shop. Each merchant has its
// own pricing (supply & demand), so the same item is worth different gold to
// different shops:
//   • wants    — items they're hungry for: a premium price, up to a quantity (blue)
//   • market   — fair derived rate × the shop's sell multiplier (white)
//   • dislikes — they don't want it: a pittance, sometimes negative for fun (red)
// A merchant may also FAVOR a class (a small discount/bonus for that hero).
//
// Wandering traders aren't pinned: their location rotates with the game clock, so
// a player returning from AFK may find one parked at a field they're hunting.
// All mock — no save wiring.

export interface MerchantWant { itemId: string; pricePer: number; quantity: number }
export interface MerchantStock { kind: 'material' | 'card' | 'equipment'; id: string; price: number; stock?: number }

export interface MerchantDef {
  id: string
  name: string
  kind: 'shop' | 'wandering'
  icon: string
  blurb: string
  locationId: string          // home location (wandering: a fallback; see wanderLocation)
  sellMult: number            // base multiplier applied to an item's market value when selling to them
  buyMult: number             // base markup applied to an item's value when buying from them
  favorClass?: string         // this class gets a small discount (buy) + bonus (sell)
  wants: MerchantWant[]
  dislikes: string[]
  stock: MerchantStock[]
}

export const MERCHANT_REGISTRY: Record<string, MerchantDef> = {
  'prontera-general': {
    id: 'prontera-general', name: 'Prontera General Store', kind: 'shop', icon: '🏪',
    blurb: 'A well-stocked civic shop. Fair prices, broad demand.',
    locationId: 'prontera-city', sellMult: 1.0, buyMult: 1.25,
    wants: [{ itemId: 'craft-iron-ingot', pricePer: 28, quantity: 10 }, { itemId: 'm1', pricePer: 5, quantity: 40 }],
    dislikes: ['drop-slime-gel', 'drop-bat-wing'],
    stock: [
      { kind: 'material', id: 'm4', price: 6, stock: 50 },
      { kind: 'material', id: 'craft-herb-salve', price: 18, stock: 8 },
      { kind: 'equipment', id: 'eq-leather', price: 70 },
      { kind: 'equipment', id: 'eq-shield-wood', price: 30 },
    ],
  },
  'payon-lodge': {
    id: 'payon-lodge', name: 'Payon Hunting Lodge', kind: 'shop', icon: '🏹',
    blurb: 'Trappers and tanners. They pay well for fresh hides and pelts.',
    locationId: 'payon-city', sellMult: 0.95, buyMult: 1.2, favorClass: 'Ranger',
    wants: [
      { itemId: 'drop-boar-hide', pricePer: 16, quantity: 20 },
      { itemId: 'drop-wolf-pelt', pricePer: 14, quantity: 15 },
      { itemId: 'drop-tusk', pricePer: 20, quantity: 10 },
    ],
    dislikes: ['m2', 'drop-slime-gel'],
    stock: [
      { kind: 'equipment', id: 'eq-bow', price: 140 },
      { kind: 'card', id: 'card-direwolf', price: 220, stock: 1 },
      { kind: 'material', id: 'craft-preserved-fish', price: 22, stock: 12 },
    ],
  },
  'geffen-bazaar': {
    id: 'geffen-bazaar', name: 'Geffen Arcane Bazaar', kind: 'shop', icon: '✦',
    blurb: 'Esoteric goods and cards. High markup, but rare stock.',
    locationId: 'geffen-city', sellMult: 1.1, buyMult: 1.5, favorClass: 'Mage',
    wants: [
      { itemId: 'drop-spirit-dust', pricePer: 18, quantity: 12 },
      { itemId: 'drop-dark-core', pricePer: 45, quantity: 4 },
      { itemId: 'drop-ectoplasm', pricePer: 22, quantity: 8 },
    ],
    dislikes: ['m1', 'm3'],
    stock: [
      { kind: 'card', id: 'card-specter', price: 320, stock: 1 },
      { kind: 'card', id: 'card-harpy', price: 150, stock: 2 },
      { kind: 'equipment', id: 'eq-staff', price: 160 },
      { kind: 'equipment', id: 'eq-wand', price: 90 },
    ],
  },
  'hadiya-wanderer': {
    id: 'hadiya-wanderer', name: 'Hadiya the Wanderer', kind: 'wandering', icon: '🐫',
    blurb: 'A travelling trader with an odd, rotating stock. Here today…',
    locationId: 'prontera-field-1', sellMult: 1.05, buyMult: 1.35,
    wants: [
      { itemId: 'drop-golem-core', pricePer: 60, quantity: 3 },
      { itemId: 'drop-ancient-coin', pricePer: 30, quantity: 10 },
      { itemId: 'drop-elite-mark', pricePer: 80, quantity: 5 },
    ],
    dislikes: [],
    stock: [
      { kind: 'card', id: 'card-golem', price: 280, stock: 1 },
      { kind: 'material', id: 'craft-iron-ingot', price: 14, stock: 20 },
      { kind: 'equipment', id: 'eq-greatsword', price: 120 },
    ],
  },
}

// ── Wandering presence (clock-driven) ─────────────────────────────────────────--
// The wanderer's current stop cycles deterministically with the game tick, so it
// "moves" on its own and a returning player may find it somewhere new.
const WANDER_STOPS = ['prontera-field-1', 'geffen-field-1', 'boar-meadow', 'beach-1', 'prontera-field-2']
const WANDER_WINDOW = 900 // ticks per stop (~3 min at 5 ticks/s)
export function wanderLocation(ticks: number): string {
  return WANDER_STOPS[Math.floor(ticks / WANDER_WINDOW) % WANDER_STOPS.length]
}
// Ticks until the wanderer moves on (for a "leaves in ~Nm" countdown).
export function wanderTicksLeft(ticks: number): number {
  return WANDER_WINDOW - (ticks % WANDER_WINDOW)
}

// Effective location for a merchant right now (wanderers move; shops are fixed).
export function merchantLocation(m: MerchantDef, ticks: number): string {
  return m.kind === 'wandering' ? wanderLocation(ticks) : m.locationId
}

// ── Pricing ──────────────────────────────────────────────────────────────────--
export type OfferTone = 'want' | 'market' | 'dislike'
export interface SellOffer { price: number; tone: OfferTone; cap?: number }

const favorBonus = (m: MerchantDef, hero: Unit | null) => (hero && m.favorClass && (hero.class ?? 'Novice') === m.favorClass ? 1 : 0)

// What a merchant offers PER UNIT to buy `itemId` off you, given its market value.
export function sellOffer(m: MerchantDef, itemId: string, baseValue: number, hero: Unit | null): SellOffer {
  const want = m.wants.find((w) => w.itemId === itemId)
  if (want) {
    const bonus = favorBonus(m, hero) ? Math.ceil(want.pricePer * 0.1) : 0
    return { price: want.pricePer + bonus, tone: 'want', cap: want.quantity }
  }
  if (m.dislikes.includes(itemId)) {
    // They don't want it: a pittance, and negative for true junk (for fun).
    return { price: baseValue <= 4 ? -1 : Math.round(baseValue * 0.2), tone: 'dislike' }
  }
  const mult = m.sellMult * (favorBonus(m, hero) ? 1.1 : 1)
  return { price: Math.max(1, Math.round(baseValue * mult)), tone: 'market' }
}

// What a merchant charges you to buy one of their wares (favored class gets ~15% off).
export function buyPriceFor(m: MerchantDef, listed: number, hero: Unit | null): number {
  const off = favorBonus(m, hero) ? 0.85 : 1
  return Math.max(1, Math.round(listed * off))
}
