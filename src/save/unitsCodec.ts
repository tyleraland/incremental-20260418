import { makeCodec } from '@/lib/save'
import { INITIAL_UNITS } from '@/data/units'
import type { Unit } from '@/types'

export const unitsCodec = makeCodec<Unit[]>({
  key: 'units',
  version: 5,
  serialize:   (s) => s.units ?? [],
  deserialize: (data) => ({ units: data }),
  migrate: (data, _fromVersion) => {
    const units = data as (Unit & { isResting?: boolean; tactics?: Unit['tactics'] })[]
    return units.map(u => ({
      ...u,
      isResting: u.isResting ?? (u.health === 0 && u.recoveryTicksLeft === 0),
      tactics: u.tactics ?? [],   // v3: tactics loadout; older saves start empty
      pack: u.pack ?? [],                          // v4: §consumables — carried items
      consumableRules: u.consumableRules ?? [],    // v4: §consumables — use rules
      carried: u.carried ?? [],                    // v5: §logistics — personal loot bag
    }))
  },
  empty:       () => [...INITIAL_UNITS],
})
