import type { ConsumableEffect } from '@/engine/types'

// §consumables: data registry for usable items a hero can carry in their pack and
// use mid-combat (governed by the player's per-hero use rules). The `effect`
// descriptor is what the adapter hands to the engine — the engine itself never
// imports this registry (it stays pure / data-free). Iteration 1 ships a single
// heal-to-max potion; richer effects (cures, buffs, fixed-heal) slot in here.
export interface ConsumableDef {
  id: string
  name: string
  icon: string
  effect: ConsumableEffect
  description: string
}

export const CONSUMABLE_REGISTRY: Record<string, ConsumableDef> = {
  'potion-hp': {
    id: 'potion-hp',
    name: 'Health Potion',
    icon: '🧪',
    effect: 'heal-max',
    description: 'Restores the drinker to full health.',
  },
}

export const isConsumable = (itemId: string): boolean => itemId in CONSUMABLE_REGISTRY
export const consumableDef = (itemId: string): ConsumableDef | undefined => CONSUMABLE_REGISTRY[itemId]
