import type { CraftingRecipe } from '@/types'

export const RECIPE_REGISTRY: Record<string, CraftingRecipe> = {
  'recipe-plank':           { id: 'recipe-plank',           name: 'Wooden Plank',   description: 'Processed timber for construction.',            ingredients: [{ itemId: 'm1', quantity: 2  }],                                outputItemId: 'craft-plank',          outputName: 'Wooden Plank',   outputQuantity: 3 },
  'recipe-iron-ingot':      { id: 'recipe-iron-ingot',      name: 'Iron Ingot',     description: 'Smelted iron bar ready for smithing.',           ingredients: [{ itemId: 'm2', quantity: 3  }],                                outputItemId: 'craft-iron-ingot',     outputName: 'Iron Ingot',     outputQuantity: 1 },
  'recipe-fish-stew':       { id: 'recipe-fish-stew',       name: 'Fish Stew',      description: 'Hearty meal. Restores health in the field.',     ingredients: [{ itemId: 'm3', quantity: 2  }, { itemId: 'm4', quantity: 1 }], outputItemId: 'craft-fish-stew',      outputName: 'Fish Stew',      outputQuantity: 2 },
  'recipe-herb-salve':      { id: 'recipe-herb-salve',      name: 'Herb Salve',     description: 'Soothing ointment for minor wounds.',           ingredients: [{ itemId: 'm4', quantity: 3  }],                                outputItemId: 'craft-herb-salve',     outputName: 'Herb Salve',     outputQuantity: 1 },
  'recipe-preserved-fish':  { id: 'recipe-preserved-fish',  name: 'Preserved Fish', description: 'Salted fish that keeps for long journeys.',      ingredients: [{ itemId: 'm3', quantity: 10 }],                                outputItemId: 'craft-preserved-fish', outputName: 'Preserved Fish', outputQuantity: 5 },
}
