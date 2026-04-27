import { makeCodec } from '@/lib/save'
import { INITIAL_EQUIPMENT, INITIAL_MISC } from '@/data/equipment'
import type { EquipmentItem, MiscItem } from '@/types'

interface InventorySave {
  equipment:     EquipmentItem[]
  miscItems:     MiscItem[]
  learnedRecipes: string[]
}

export const inventoryCodec = makeCodec<InventorySave>({
  key: 'inventory',
  version: 1,
  serialize: (s) => ({
    equipment:      s.equipment      ?? [],
    miscItems:      s.miscItems      ?? [],
    learnedRecipes: s.learnedRecipes ?? [],
  }),
  deserialize: (data) => ({
    equipment:      data.equipment,
    miscItems:      data.miscItems,
    learnedRecipes: data.learnedRecipes,
  }),
  empty: () => ({
    equipment:      [...INITIAL_EQUIPMENT],
    miscItems:      [...INITIAL_MISC],
    learnedRecipes: [],
  }),
})
