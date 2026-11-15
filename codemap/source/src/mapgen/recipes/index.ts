// Recipe registry — the plain-exported-object pattern (like TRAIT/MONSTER/…).
// Three map types = three recipes over ONE pipeline (catalog closing note):
// overworld = field-first, dungeon = graph-first, city = road-first. All share
// the bake/validate tail and the §M premise pass.

import type { RecipeDef } from '../pipeline'
import { FIELD_RECIPE } from './field'
import { DUNGEON_RECIPE } from './dungeon'
import { CITY_RECIPE } from './city'

export const RECIPE_REGISTRY: Record<string, RecipeDef> = {
  field: FIELD_RECIPE,
  dungeon: DUNGEON_RECIPE,
  city: CITY_RECIPE,
}
