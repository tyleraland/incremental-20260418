import type { EquipmentItem, MiscItem, EquipSlot, ItemCategory } from '@/types'

// Sideboards reserve any equippable category — they're stashes for swap-in.
const ALL_CATEGORIES: ItemCategory[] = ['weapon-1h', 'weapon-2h', 'tool', 'shield', 'armor', 'accessory']

export const SLOT_COMPATIBLE: Record<EquipSlot, ItemCategory[]> = {
  mainHand:   ['weapon-1h', 'weapon-2h'],
  offHand:    ['weapon-1h', 'shield', 'accessory'],
  sideboard1: ALL_CATEGORIES,
  sideboard2: ALL_CATEGORIES,
  armor:      ['armor'],
  accessory:  ['accessory'],
}

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand: 'Main Hand', offHand: 'Off Hand', sideboard1: 'Sideboard 1', sideboard2: 'Sideboard 2', armor: 'Armor', accessory: 'Accessory',
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  'weapon-1h': '1H Weapon', 'weapon-2h': '2H Weapon',
  tool: 'Tool', shield: 'Shield', armor: 'Armor', accessory: 'Accessory',
}

const KNIFE_CLASSES = ['Novice', 'Fighter', 'Rogue', 'Mage', 'Ranger', 'Cleric']

export const INITIAL_EQUIPMENT: EquipmentItem[] = [
  // ── Elemental test knives (no slots; one per element) ────────────────────────
  { id: 'eq-knife-neutral',   name: 'Knife',          category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'A plain dagger. Neutral damage.',           element: 'neutral',   requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-fire',      name: 'Ember Knife',    category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Glows with heat.',                           element: 'fire',      requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-water',     name: 'Tide Knife',     category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'A dagger of seawater and frost.',           element: 'water',     requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-earth',     name: 'Stone Knife',    category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Chipped from heavy stone.',                  element: 'earth',     requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-lightning', name: 'Spark Knife',    category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Crackling with current.',                    element: 'wind',      requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-poison',    name: 'Venom Knife',    category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Coated in a clinging toxin.',                element: 'poison',    requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-radiant',      name: 'Radiant Knife',     category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Radiant light pulses along the edge.',          element: 'radiant',      requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-undead',    name: 'Bone Knife',     category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Carved from a thing that should rest.',      element: 'undead',    requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  { id: 'eq-knife-ghost',     name: 'Phantom Knife',  category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 12 }, slots: 0, description: 'Cuts through what should not be cut.',       element: 'ghost',     requiredLevel: 1, requiredClasses: KNIFE_CLASSES },
  // ── Starter weapons ──────────────────────────────────────────────────────────
  { id: 'eq-knife',     name: 'Knife',  category: 'weapon-1h', traits: ['1h', 'slashing', 'dagger'], stats: { attack: 17 }, slots: 3, description: 'A short, fast dagger. Widely usable.',           requiredLevel: 1, requiredClasses: ['Novice', 'Fighter', 'Rogue', 'Mage', 'Ranger'] },
  { id: 'eq-rod',       name: 'Rod',   category: 'weapon-1h', traits: ['1h', 'bludgeoning', 'staff'], stats: { attack: 15, range: 5 }, slots: 3, description: 'A one-handed magical focus, swung in melee.',             requiredLevel: 1, requiredClasses: ['Novice', 'Cleric', 'Mage'] },
  { id: 'eq-bow',       name: 'Bow',   category: 'weapon-2h', traits: ['2h', 'piercing', 'bow'],              stats: { attack: 15, range: 35 }, slots: 3, description: 'A two-handed ranged weapon. Locks off-hand.', requiredLevel: 4, requiredClasses: ['Fighter', 'Rogue', 'Ranger'] },
  { id: 'eq-sword',     name: 'Sword', category: 'weapon-1h', traits: ['1h', 'slashing', 'sword'],            stats: { attack: 25 }, slots: 3, description: 'A balanced blade with solid damage output.',     requiredLevel: 2, requiredClasses: ['Novice', 'Fighter', 'Rogue'] },
  // ── Tools ────────────────────────────────────────────────────────────────────
  { id: 'eq-handaxe',        name: 'Handaxe',        category: 'tool',      traits: ['tool', 'slashing'],       stats: {},               slots: 0, description: 'Good for gathering wood.' },
  { id: 'eq-pickaxe',        name: 'Pickaxe',        category: 'tool',      traits: ['tool', 'piercing'],                stats: {},               slots: 0, description: 'Essential for mining ore.' },
  { id: 'eq-skinning-knife', name: 'Skinning Knife', category: 'tool',      traits: ['tool', 'slashing'],       stats: { attack: 1 },    slots: 0, description: 'Sharp blade for preparing game.' },
  { id: 'eq-lockpick',       name: 'Lockpick',       category: 'tool',      traits: ['tool'],                   stats: {},               slots: 0, description: 'Opens locks without a key.' },
  { id: 'eq-sword-1h',       name: 'Iron Sword',     category: 'weapon-1h', traits: ['1h', 'slashing'],                  stats: { attack: 4 },    slots: 1, description: 'A reliable iron blade.' },
  { id: 'eq-shortsword',     name: 'Shortsword',     category: 'weapon-1h', traits: ['1h', 'slashing'],         stats: { attack: 3 },    slots: 1, description: 'Light and fast.' },
  { id: 'eq-wand',           name: 'Wand',           category: 'weapon-1h', traits: ['1h'],                     stats: { specialAttack: 4, range: 18 }, slots: 1, description: 'Channels magical energy.' },
  { id: 'eq-greatsword',     name: 'Greatsword',     category: 'weapon-2h', traits: ['2h', 'slashing', 'heavy'],         stats: { attack: 9 },    slots: 2, description: 'Massive two-handed blade. Locks off-hand.' },
  { id: 'eq-staff',          name: 'Staff',          category: 'weapon-2h', traits: ['2h', 'bludgeoning'],               stats: { specialAttack: 6, range: 28 }, slots: 2, description: 'Two-handed magical focus. Locks off-hand.' },
  { id: 'eq-shield-wood',    name: 'Wooden Shield',  category: 'shield',    traits: ['shield', 'bludgeoning'],  stats: { defense: 2 },   slots: 0, description: 'Basic wooden protection.' },
  { id: 'eq-shield-iron',    name: 'Iron Shield',    category: 'shield',    traits: ['shield', 'bludgeoning', 'heavy'],  stats: { defense: 5 },   slots: 1, description: 'Solid iron shield.' },
  { id: 'eq-leather',        name: 'Leather Armor',  category: 'armor',     traits: [],                           stats: { defense: 2 },   slots: 1, description: 'Light but sturdy protection.' },
  { id: 'eq-chainmail',      name: 'Chain Mail',     category: 'armor',     traits: ['heavy'],                           stats: { defense: 5 },   slots: 2, description: 'Linked iron rings.' },
]

export const INITIAL_MISC: MiscItem[] = [
  { id: 'm1',     name: 'Wood',     quantity: 42, description: 'Raw timber.' },
  { id: 'm2',     name: 'Iron Ore', quantity: 18, description: 'Unrefined ore.' },
  { id: 'm3',     name: 'Fish',     quantity:  7, description: 'Fresh catch.' },
  { id: 'm4',     name: 'Herbs',    quantity: 23, description: 'Medicinal herbs.' },
  { id: 'm-gold', name: 'Gold',     quantity:  0, description: 'Currency.' },
  // §consumables: starter stash stock so a hero can load potions into their pack.
  // (Loot / merchant sourcing arrives with the restock phase.)
  { id: 'potion-hp', name: 'Health Potion', quantity: 250, description: 'Restores the drinker to full health.', kind: 'consumable' },
]
