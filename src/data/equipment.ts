import type { EquipmentItem, MiscItem, EquipSlot, ItemCategory } from '@/types'

export const SLOT_COMPATIBLE: Record<EquipSlot, ItemCategory[]> = {
  mainHand:  ['weapon-1h', 'weapon-2h'],
  offHand:   ['weapon-1h', 'shield', 'accessory'],
  tool:      ['tool'],
  armor:     ['armor'],
  accessory: ['accessory'],
}

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand: 'Main Hand', offHand: 'Off Hand', tool: 'Tool', armor: 'Armor', accessory: 'Accessory',
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  'weapon-1h': '1H Weapon', 'weapon-2h': '2H Weapon',
  tool: 'Tool', shield: 'Shield', armor: 'Armor', accessory: 'Accessory',
}

export const INITIAL_EQUIPMENT: EquipmentItem[] = [
  { id: 'eq-handaxe',        name: 'Handaxe',        category: 'tool',      traits: ['tool', 'slashing', 'light'],       stats: {},               slots: 0, description: 'Good for gathering wood.' },
  { id: 'eq-pickaxe',        name: 'Pickaxe',        category: 'tool',      traits: ['tool', 'piercing'],                stats: {},               slots: 0, description: 'Essential for mining ore.' },
  { id: 'eq-skinning-knife', name: 'Skinning Knife', category: 'tool',      traits: ['tool', 'slashing', 'light'],       stats: { attack: 1 },    slots: 0, description: 'Sharp blade for preparing game.' },
  { id: 'eq-lockpick',       name: 'Lockpick',       category: 'tool',      traits: ['tool', 'light'],                   stats: {},               slots: 0, description: 'Opens locks without a key.' },
  { id: 'eq-sword-1h',       name: 'Iron Sword',     category: 'weapon-1h', traits: ['1h', 'slashing'],                  stats: { attack: 4 },    slots: 1, description: 'A reliable iron blade.' },
  { id: 'eq-shortsword',     name: 'Shortsword',     category: 'weapon-1h', traits: ['1h', 'slashing', 'light'],         stats: { attack: 3 },    slots: 1, description: 'Light and fast.' },
  { id: 'eq-wand',           name: 'Wand',           category: 'weapon-1h', traits: ['1h', 'light'],                     stats: { specialAttack: 4 }, slots: 1, description: 'Channels magical energy.' },
  { id: 'eq-greatsword',     name: 'Greatsword',     category: 'weapon-2h', traits: ['2h', 'slashing', 'heavy'],         stats: { attack: 9 },    slots: 2, description: 'Massive two-handed blade. Locks off-hand.' },
  { id: 'eq-staff',          name: 'Staff',          category: 'weapon-2h', traits: ['2h', 'bludgeoning'],               stats: { specialAttack: 6 }, slots: 2, description: 'Two-handed magical focus. Locks off-hand.' },
  { id: 'eq-shield-wood',    name: 'Wooden Shield',  category: 'shield',    traits: ['shield', 'bludgeoning', 'light'],  stats: { defense: 2 },   slots: 0, description: 'Basic wooden protection.' },
  { id: 'eq-shield-iron',    name: 'Iron Shield',    category: 'shield',    traits: ['shield', 'bludgeoning', 'heavy'],  stats: { defense: 5 },   slots: 1, description: 'Solid iron shield.' },
  { id: 'eq-leather',        name: 'Leather Armor',  category: 'armor',     traits: ['light'],                           stats: { defense: 2 },   slots: 1, description: 'Light but sturdy protection.' },
  { id: 'eq-chainmail',      name: 'Chain Mail',     category: 'armor',     traits: ['heavy'],                           stats: { defense: 5 },   slots: 2, description: 'Linked iron rings.' },
]

export const INITIAL_MISC: MiscItem[] = [
  { id: 'm1',     name: 'Wood',     quantity: 42, description: 'Raw timber.' },
  { id: 'm2',     name: 'Iron Ore', quantity: 18, description: 'Unrefined ore.' },
  { id: 'm3',     name: 'Fish',     quantity:  7, description: 'Fresh catch.' },
  { id: 'm4',     name: 'Herbs',    quantity: 23, description: 'Medicinal herbs.' },
  { id: 'm-gold', name: 'Gold',     quantity:  0, description: 'Currency.' },
]
