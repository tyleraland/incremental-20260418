import type { ItemCategory } from '@/types'

// ── Cards (Ragnarok-style gear modifiers) ─────────────────────────────────────--
//
// Cards are rare drops named after the monster that drops them. Each fits a
// family of gear (weapon / armor / accessory) and, when socketed into an
// equipment slot, modifies its stats. Equipment already carries a `slots` count
// (src/data/equipment) and the store already persists `itemSockets`
// (instanceId → cardId[]) — this is the missing catalog + the pure math.
//
// NOTE: stat bonuses are currently DISPLAY-ONLY — the Town/hero UI previews the
// deltas, but getDerivedStats does not yet read sockets. Wiring the numbers into
// combat is a deliberate later pass.

export type CardFit = 'weapon' | 'armor' | 'accessory'
export type CardRarity = 'common' | 'rare' | 'epic'

// The four stats a card can move (mirrors EquipmentItem.stats, sans range).
export interface CardBonus {
  attack?: number; defense?: number; specialAttack?: number; specialDefense?: number
}
const STAT_KEYS = ['attack', 'defense', 'specialAttack', 'specialDefense'] as const
const STAT_LABEL: Record<(typeof STAT_KEYS)[number], string> = {
  attack: 'ATK', defense: 'DEF', specialAttack: 'M.ATK', specialDefense: 'M.DEF',
}

export interface CardDef {
  id: string
  name: string          // "Wolf Card"
  monsterId: string     // the foe it's named for / drops from
  fit: CardFit          // gear family it sockets into
  rarity: CardRarity
  bonus: CardBonus
  description: string    // flavor + effect
}

// Coarse gear family for a slot's item category — cards fit by family, not exact
// category (a weapon card fits any weapon; an armor card fits armor or shield).
export const CARD_FIT_OF: Record<ItemCategory, CardFit> = {
  'weapon-1h': 'weapon', 'weapon-2h': 'weapon',
  shield: 'armor', armor: 'armor',
  accessory: 'accessory', tool: 'accessory',
}

export const CARD_REGISTRY: Record<string, CardDef> = {
  'card-slime':    { id: 'card-slime',    name: 'Slime Card',          monsterId: 'slime',          fit: 'armor',     rarity: 'common', bonus: { specialDefense: 3 },                description: 'A gel that hardens against magic. Slight magic resistance.' },
  'card-wolf':     { id: 'card-wolf',     name: 'Wolf Card',           monsterId: 'wolf',           fit: 'weapon',    rarity: 'common', bonus: { attack: 5 },                        description: "A wolf's ferocity, bound to a blade. Raises attack." },
  'card-boar':     { id: 'card-boar',     name: 'Wild Boar Card',      monsterId: 'wild-boar',      fit: 'weapon',    rarity: 'common', bonus: { attack: 4, defense: 1 },            description: 'Reckless charging force. A touch of attack and grit.' },
  'card-crab':     { id: 'card-crab',     name: 'Rock Crab Card',      monsterId: 'rock-crab',      fit: 'armor',     rarity: 'common', bonus: { defense: 5 },                       description: 'A shell that turns blows aside. Raises defense.' },
  'card-bat':      { id: 'card-bat',      name: 'Bat Card',            monsterId: 'bat',            fit: 'accessory', rarity: 'common', bonus: { attack: 2, specialAttack: 2 },     description: 'Quick and erratic. A small all-round edge.' },
  'card-hornet':   { id: 'card-hornet',   name: 'Hornet Card',         monsterId: 'hornet',         fit: 'accessory', rarity: 'common', bonus: { attack: 3 },                        description: 'A relentless sting. Raises attack.' },
  'card-harpy':    { id: 'card-harpy',    name: 'Harpy Card',          monsterId: 'harpy',          fit: 'accessory', rarity: 'rare',   bonus: { specialAttack: 4, attack: 2 },      description: 'Screeching wind magic. Raises magic attack.' },
  'card-direwolf': { id: 'card-direwolf', name: 'Dire Wolf Card',      monsterId: 'dire-wolf',      fit: 'weapon',    rarity: 'rare',   bonus: { attack: 7 },                        description: 'A pack-leader\'s killing instinct. Strongly raises attack.' },
  'card-serpent':  { id: 'card-serpent',  name: 'River Serpent Card',  monsterId: 'river-serpent',  fit: 'weapon',    rarity: 'rare',   bonus: { attack: 5, specialAttack: 3 },      description: 'Coiled, venomous power. Raises attack and magic attack.' },
  'card-golem':    { id: 'card-golem',    name: 'Stone Golem Card',    monsterId: 'stone-golem',    fit: 'armor',     rarity: 'rare',   bonus: { defense: 8 },                       description: 'The unyielding weight of stone. Strongly raises defense.' },
  'card-armor':    { id: 'card-armor',    name: 'Animated Armor Card', monsterId: 'animated-armor', fit: 'armor',     rarity: 'epic',   bonus: { defense: 10, specialDefense: 4 },   description: 'A suit that refuses to fall. Greatly raises all defenses.' },
  'card-specter':  { id: 'card-specter',  name: 'Ruins Specter Card',  monsterId: 'ruins-specter',  fit: 'accessory', rarity: 'epic',   bonus: { specialAttack: 9 },                 description: 'A vengeful echo of arcane power. Greatly raises magic attack.' },
}

// Sum a list of (possibly empty) socket entries into a single bonus.
export function cardBonusTotal(cardIds: (string | null | undefined)[]): CardBonus {
  const t: CardBonus = {}
  for (const id of cardIds) {
    const c = id ? CARD_REGISTRY[id] : undefined
    if (!c) continue
    for (const k of STAT_KEYS) if (c.bonus[k]) t[k] = (t[k] ?? 0) + c.bonus[k]!
  }
  return t
}

// "+5 ATK · +2 DEF" — a compact stat line for a bonus (empty string if none).
export function cardBonusLine(b: CardBonus): string {
  return STAT_KEYS.filter((k) => b[k]).map((k) => `+${b[k]} ${STAT_LABEL[k]}`).join(' · ')
}

export function cardBonusEmpty(b: CardBonus): boolean {
  return STAT_KEYS.every((k) => !b[k])
}

// Rarity → tailwind classes for the card glyph / chip (border + text).
export const CARD_RARITY_CLS: Record<CardRarity, string> = {
  common: 'border-game-border text-game-text-dim',
  rare:   'border-sky-500/50 text-sky-300',
  epic:   'border-violet-500/50 text-violet-300',
}
export const CARD_RARITY_TEXT: Record<CardRarity, string> = {
  common: 'text-game-text-dim', rare: 'text-sky-300', epic: 'text-violet-300',
}
export const CARD_FIT_ICON: Record<CardFit, string> = { weapon: '🗡', armor: '🛡', accessory: '💍' }
export const CARD_FIT_LABEL: Record<CardFit, string> = { weapon: 'Weapons', armor: 'Armor & shields', accessory: 'Accessories' }
