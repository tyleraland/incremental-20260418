import { makeCodec } from '@/lib/save'
import { INITIAL_UNITS } from '@/data/units'
import type { Unit } from '@/types'

export const unitsCodec = makeCodec<Unit[]>({
  key: 'units',
  version: 2,
  serialize:   (s) => s.units ?? [],
  deserialize: (data) => ({ units: data }),
  migrate: (data, _fromVersion) => {
    const units = data as Unit[]
    return units.map(u => ({
      ...u,
      isResting: (u as Unit & { isResting?: boolean }).isResting ??
        (u.health === 0 && u.recoveryTicksLeft === 0),
    }))
  },
  empty:       () => [...INITIAL_UNITS],
})
