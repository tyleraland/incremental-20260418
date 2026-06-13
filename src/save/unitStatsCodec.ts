import { makeCodec } from '@/lib/save'
import type { UnitCombatStats } from '@/types'
import { emptyTally, addInto } from '@/lib/combatTally'

interface UnitStatsSave {
  unitStats: Record<string, UnitCombatStats>
}

// Bring a possibly-partial (old-save) tally up to the full shape, filling missing
// analytics fields with zeros.
function fill(partial: Partial<UnitCombatStats>): UnitCombatStats {
  const t = emptyTally()
  addInto(t, partial)
  return t
}

// Per-unit lifetime combat tallies. v2 widened the tally from {damage, kills,
// items, ticks} to the full battle-report breakdown (taken / hits / element &
// effectiveness maps); v1 saves migrate by zero-filling the new fields.
export const unitStatsCodec = makeCodec<UnitStatsSave>({
  key: 'unitStats',
  version: 2,
  serialize:   (s) => ({ unitStats: s.unitStats ?? {} }),
  deserialize: (data) => ({ unitStats: data.unitStats ?? {} }),
  empty:       () => ({ unitStats: {} }),
  migrate: (data) => {
    const d = data as { unitStats?: Record<string, Partial<UnitCombatStats>> }
    const out: Record<string, UnitCombatStats> = {}
    for (const [id, t] of Object.entries(d.unitStats ?? {})) out[id] = fill(t)
    return { unitStats: out }
  },
})
