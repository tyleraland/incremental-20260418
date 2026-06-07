import { makeCodec } from '@/lib/save'
import type { UnitCombatStats } from '@/types'

interface UnitStatsSave {
  unitStats: Record<string, UnitCombatStats>
}

// Per-unit lifetime combat tallies (damage dealt, kills, items found, fighting
// ticks). Separate slice from the per-location combatStats — different concern.
export const unitStatsCodec = makeCodec<UnitStatsSave>({
  key: 'unitStats',
  version: 1,
  serialize:   (s) => ({ unitStats: s.unitStats ?? {} }),
  deserialize: (data) => ({ unitStats: data.unitStats ?? {} }),
  empty:       () => ({ unitStats: {} }),
})
