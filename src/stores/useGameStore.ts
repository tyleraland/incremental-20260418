import { create } from 'zustand'

export type EquipSlot = 'mainHand' | 'offHand' | 'armor' | 'accessory'
export type ItemCategory = 'weapon-1h' | 'weapon-2h' | 'tool' | 'shield' | 'armor' | 'accessory'
export type TabId = 'map' | 'units' | 'inventory'

export interface Unit {
  id: string
  name: string
  level: number
  exp: number
  expToNext: number
  age: number
  health: number // 0–100
  class: string | null
  proficiencies: string[]
  stats: {
    attack: number
    defense: number
    specialAttack: number
    specialDefense: number
  }
  locationId: string | null
  equipment: Record<EquipSlot, string | null>
}

export interface Location {
  id: string
  name: string
  description: string
}

export interface EquipmentItem {
  id: string
  name: string
  category: ItemCategory
  stats: {
    attack?: number
    defense?: number
    specialAttack?: number
    specialDefense?: number
  }
  description?: string
}

export interface MiscItem {
  id: string
  name: string
  quantity: number
  description?: string
}

// Categories that are compatible with each slot
export const SLOT_COMPATIBLE: Record<EquipSlot, ItemCategory[]> = {
  mainHand: ['weapon-1h', 'weapon-2h', 'tool'],
  offHand: ['weapon-1h', 'shield', 'accessory'],
  armor: ['armor'],
  accessory: ['accessory'],
}

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand: 'Main Hand',
  offHand: 'Off Hand',
  armor: 'Armor',
  accessory: 'Accessory',
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  'weapon-1h': '1H Weapon',
  'weapon-2h': '2H Weapon',
  tool: 'Tool',
  shield: 'Shield',
  armor: 'Armor',
  accessory: 'Accessory',
}

const LOCATIONS: Location[] = [
  { id: 'kings-forest', name: "King's Forest", description: 'A dense royal forest rich with timber and game.' },
  { id: 'duskwood', name: 'Duskwood Forest', description: 'A shadowed wood where the trees grow unnaturally tall.' },
  { id: 'lake-arawok', name: 'Lake Arawok', description: 'A vast freshwater lake, calm on the surface.' },
  { id: 'gray-hills', name: 'Gray Hills', description: 'Rocky highlands rich with ore and ancient ruins.' },
]

const UNITS: Unit[] = [
  {
    id: 'u1', name: 'Aldric', level: 3, exp: 245, expToNext: 312,
    age: 24, health: 95, class: 'Warrior', proficiencies: ['Swords', 'Heavy Armor'],
    stats: { attack: 5, defense: 4, specialAttack: 1, specialDefense: 2 },
    locationId: null,
    equipment: { mainHand: 'eq-sword-1h', offHand: 'eq-shield-wood', armor: 'eq-leather', accessory: null },
  },
  {
    id: 'u2', name: 'Mira', level: 2, exp: 80, expToNext: 180,
    age: 19, health: 100, class: null, proficiencies: ['Tools'],
    stats: { attack: 2, defense: 2, specialAttack: 2, specialDefense: 2 },
    locationId: 'kings-forest',
    equipment: { mainHand: 'eq-handaxe', offHand: null, armor: null, accessory: null },
  },
  {
    id: 'u3', name: 'Theron', level: 4, exp: 420, expToNext: 520,
    age: 31, health: 82, class: 'Mage', proficiencies: ['Staves', 'Wands'],
    stats: { attack: 2, defense: 1, specialAttack: 8, specialDefense: 5 },
    locationId: 'gray-hills',
    equipment: { mainHand: 'eq-staff', offHand: null, armor: null, accessory: null },
  },
  {
    id: 'u4', name: 'Sera', level: 1, exp: 20, expToNext: 100,
    age: 16, health: 100, class: null, proficiencies: [],
    stats: { attack: 2, defense: 1, specialAttack: 1, specialDefense: 1 },
    locationId: null,
    equipment: { mainHand: null, offHand: null, armor: null, accessory: null },
  },
  {
    id: 'u5', name: 'Davan', level: 2, exp: 120, expToNext: 180,
    age: 28, health: 67, class: null, proficiencies: ['Tools', 'Mining'],
    stats: { attack: 3, defense: 2, specialAttack: 1, specialDefense: 2 },
    locationId: null,
    equipment: { mainHand: 'eq-pickaxe', offHand: null, armor: null, accessory: null },
  },
  {
    id: 'u6', name: 'Lyra', level: 5, exp: 750, expToNext: 800,
    age: 35, health: 90, class: 'Rogue', proficiencies: ['Daggers', 'Lockpicks'],
    stats: { attack: 7, defense: 3, specialAttack: 4, specialDefense: 3 },
    locationId: 'lake-arawok',
    equipment: { mainHand: 'eq-shortsword', offHand: null, armor: 'eq-leather', accessory: null },
  },
]

const EQUIPMENT: EquipmentItem[] = [
  // Tools
  { id: 'eq-handaxe', name: 'Handaxe', category: 'tool', stats: {}, description: 'Good for gathering wood.' },
  { id: 'eq-pickaxe', name: 'Pickaxe', category: 'tool', stats: {}, description: 'Essential for mining ore.' },
  { id: 'eq-skinning-knife', name: 'Skinning Knife', category: 'tool', stats: { attack: 1 }, description: 'Sharp blade for preparing game.' },
  { id: 'eq-lockpick', name: 'Lockpick', category: 'tool', stats: {}, description: 'Opens locks without a key.' },
  // 1H Weapons
  { id: 'eq-sword-1h', name: 'Iron Sword', category: 'weapon-1h', stats: { attack: 4 }, description: 'A reliable iron blade.' },
  { id: 'eq-shortsword', name: 'Shortsword', category: 'weapon-1h', stats: { attack: 3 }, description: 'Light and fast.' },
  { id: 'eq-wand', name: 'Wand', category: 'weapon-1h', stats: { specialAttack: 4 }, description: 'Channels magical energy.' },
  // 2H Weapons
  { id: 'eq-greatsword', name: 'Greatsword', category: 'weapon-2h', stats: { attack: 9 }, description: 'Massive two-handed blade. Locks off-hand.' },
  { id: 'eq-staff', name: 'Staff', category: 'weapon-2h', stats: { specialAttack: 6 }, description: 'Two-handed magical focus. Locks off-hand.' },
  // Shields
  { id: 'eq-shield-wood', name: 'Wooden Shield', category: 'shield', stats: { defense: 2 }, description: 'Basic wooden protection.' },
  { id: 'eq-shield-iron', name: 'Iron Shield', category: 'shield', stats: { defense: 5 }, description: 'Solid iron shield.' },
  // Armor
  { id: 'eq-leather', name: 'Leather Armor', category: 'armor', stats: { defense: 2 }, description: 'Light but sturdy protection.' },
  { id: 'eq-chainmail', name: 'Chain Mail', category: 'armor', stats: { defense: 5 }, description: 'Linked iron rings.' },
]

const MISC: MiscItem[] = [
  { id: 'm1', name: 'Wood', quantity: 42, description: 'Raw timber.' },
  { id: 'm2', name: 'Iron Ore', quantity: 18, description: 'Unrefined ore.' },
  { id: 'm3', name: 'Fish', quantity: 7, description: 'Fresh catch.' },
  { id: 'm4', name: 'Herbs', quantity: 23, description: 'Medicinal herbs.' },
]

interface GameState {
  units: Unit[]
  locations: Location[]
  equipment: EquipmentItem[]
  miscItems: MiscItem[]
  activeTab: TabId
  selectedUnitIds: string[]
  expandedLocationIds: string[]
  expandedUnitIds: string[]
  equipContext: { unitId: string; slot: EquipSlot } | null

  setActiveTab: (tab: TabId) => void
  toggleLocation: (id: string) => void
  toggleUnit: (id: string) => void
  toggleSelectUnit: (id: string) => void
  clearSelection: () => void
  assignUnits: (unitIds: string[], locationId: string | null) => void
  equipItem: (unitId: string, slot: EquipSlot, itemId: string | null) => void
  openEquipFor: (unitId: string, slot: EquipSlot) => void
  closeEquipContext: () => void
}

export const useGameStore = create<GameState>((set) => ({
  units: UNITS,
  locations: LOCATIONS,
  equipment: EQUIPMENT,
  miscItems: MISC,
  activeTab: 'map',
  selectedUnitIds: [],
  expandedLocationIds: [],
  expandedUnitIds: [],
  equipContext: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleLocation: (id) =>
    set((s) => ({
      expandedLocationIds: s.expandedLocationIds.includes(id)
        ? s.expandedLocationIds.filter((x) => x !== id)
        : [...s.expandedLocationIds, id],
    })),

  toggleUnit: (id) =>
    set((s) => ({
      expandedUnitIds: s.expandedUnitIds.includes(id)
        ? s.expandedUnitIds.filter((x) => x !== id)
        : [...s.expandedUnitIds, id],
    })),

  toggleSelectUnit: (id) =>
    set((s) => ({
      selectedUnitIds: s.selectedUnitIds.includes(id)
        ? s.selectedUnitIds.filter((x) => x !== id)
        : [...s.selectedUnitIds, id],
    })),

  clearSelection: () => set({ selectedUnitIds: [] }),

  assignUnits: (unitIds, locationId) =>
    set((s) => ({
      units: s.units.map((u) => (unitIds.includes(u.id) ? { ...u, locationId } : u)),
      selectedUnitIds: [],
    })),

  equipItem: (unitId, slot, itemId) =>
    set((s) => ({
      units: s.units.map((u) =>
        u.id === unitId ? { ...u, equipment: { ...u.equipment, [slot]: itemId } } : u
      ),
    })),

  openEquipFor: (unitId, slot) =>
    set({ equipContext: { unitId, slot }, activeTab: 'inventory' }),

  closeEquipContext: () => set({ equipContext: null }),
}))
