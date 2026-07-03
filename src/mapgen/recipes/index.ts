// Recipe registry — the plain-exported-object pattern (like TRAIT/MONSTER/…).
// Three map types = three recipes over ONE pipeline (catalog closing note):
// overworld = field-first (here), dungeon = graph-first, city = road-first —
// the latter two are reserved ids; they share the bake/validate tail when they land.

import type { RecipeDef } from '../pipeline'
import { FIELD_RECIPE } from './field'

export const RECIPE_REGISTRY: Record<string, RecipeDef> = {
  field: FIELD_RECIPE,
}
