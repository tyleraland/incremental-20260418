// Recipe registry — the plain-exported-object pattern (like TRAIT/MONSTER/…).
// Three map types = three recipes over ONE pipeline (catalog closing note):
// overworld = field-first, dungeon = graph-first (both live), city = road-first
// (reserved id; it shares the bake/validate tail when it lands).

import type { RecipeDef } from '../pipeline'
import { FIELD_RECIPE } from './field'
import { DUNGEON_RECIPE } from './dungeon'

export const RECIPE_REGISTRY: Record<string, RecipeDef> = {
  field: FIELD_RECIPE,
  dungeon: DUNGEON_RECIPE,
}
