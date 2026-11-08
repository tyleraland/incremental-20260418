import { makeCodec } from '@/lib/save'
import type { LocationCombatStats } from '@/types'

interface CombatStatsSave {
  locationStats: Record<string, LocationCombatStats>
}

export const combatStatsCodec = makeCodec<CombatStatsSave>({
  key: 'combatStats',
  version: 1,
  serialize:   (s) => ({ locationStats: s.locationStats ?? {} }),
  deserialize: (data) => ({ locationStats: data.locationStats ?? {} }),
  empty:       () => ({ locationStats: {} }),
})
