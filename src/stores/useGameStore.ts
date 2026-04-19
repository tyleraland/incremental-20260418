import { create } from 'zustand'

export type EquipSlot = 'weapon' | 'tool' | 'armor' | 'accessory'
export type TabId = 'map' | 'units' | 'inventory'

export interface Unit {
  id: string
  name: string
  level: number
  stats: { attack: number }
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
  slot: EquipSlot
  stats: { attack?: number }
  description?: string
}

export interface MiscItem {
  id: string
  name: string
  quantity: number
  description?: string
}

const LOCATIONS: Location[] = [
  { id: 'kings-forest', name: "King's Forest", description: 'A dense royal forest rich with timber and game.' },
  { id: 'duskwood', name: 'Duskwood Forest', description: 'A shadowed wood where the trees grow unnaturally tall.' },
  { id: 'lake-arawok', name: 'Lake Arawok', description: 'A vast freshwater lake, calm on the surface.' },
  { id: 'gray-hills', name: 'Gray Hills', description: 'Rocky highlands rich with ore and ancient ruins.' },
]

const UNITS: Unit[] = [
  { id: 'u1', name: 'Aldric', level: 3, stats: { attack: 5 }, locationId: null, equipment: { weapon: 'eq1', tool: null, armor: 'eq5', accessory: null } },
  { id: 'u2', name: 'Mira', level: 2, stats: { attack: 3 }, locationId: 'kings-forest', equipment: { weapon: null, tool: 'eq3', armor: null, accessory: null } },
  { id: 'u3', name: 'Theron', level: 4, stats: { attack: 7 }, locationId: 'gray-hills', equipment: { weapon: 'eq2', tool: null, armor: null, accessory: 'eq6' } },
  { id: 'u4', name: 'Sera', level: 1, stats: { attack: 2 }, locationId: null, equipment: { weapon: null, tool: null, armor: null, accessory: null } },
  { id: 'u5', name: 'Davan', level: 2, stats: { attack: 4 }, locationId: null, equipment: { weapon: null, tool: 'eq4', armor: null, accessory: null } },
  { id: 'u6', name: 'Lyra', level: 5, stats: { attack: 8 }, locationId: 'lake-arawok', equipment: { weapon: null, tool: null, armor: 'eq5', accessory: null } },
]

const EQUIPMENT: EquipmentItem[] = [
  { id: 'eq1', name: 'Iron Sword', slot: 'weapon', stats: { attack: 4 }, description: 'A reliable iron blade.' },
  { id: 'eq2', name: 'Short Bow', slot: 'weapon', stats: { attack: 3 }, description: 'Light and quick to draw.' },
  { id: 'eq3', name: "Woodcutter's Axe", slot: 'tool', stats: {}, description: 'Efficient for harvesting timber.' },
  { id: 'eq4', name: 'Fishing Rod', slot: 'tool', stats: {}, description: 'For catching fish at water sources.' },
  { id: 'eq5', name: 'Leather Armor', slot: 'armor', stats: {}, description: 'Light but sturdy protection.' },
  { id: 'eq6', name: 'Lucky Charm', slot: 'accessory', stats: {}, description: 'Said to bring fortune to its bearer.' },
]

const MISC: MiscItem[] = [
  { id: 'm1', name: 'Wood', quantity: 42, description: 'Raw timber, useful for construction.' },
  { id: 'm2', name: 'Iron Ore', quantity: 18, description: 'Unrefined ore from the Gray Hills.' },
  { id: 'm3', name: 'Fish', quantity: 7, description: 'Fresh catch from Lake Arawok.' },
  { id: 'm4', name: 'Herbs', quantity: 23, description: 'Medicinal herbs from the forests.' },
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
  selectUnit: (id: string) => void
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

  selectUnit: (id) =>
    set((s) => ({
      selectedUnitIds: s.selectedUnitIds.includes(id)
        ? s.selectedUnitIds
        : [...s.selectedUnitIds, id],
    })),

  clearSelection: () => set({ selectedUnitIds: [] }),

  assignUnits: (unitIds, locationId) =>
    set((s) => ({
      units: s.units.map((u) =>
        unitIds.includes(u.id) ? { ...u, locationId } : u
      ),
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
