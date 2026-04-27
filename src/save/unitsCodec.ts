import { makeCodec } from '@/lib/save'
import { INITIAL_UNITS } from '@/data/units'
import type { Unit } from '@/types'

export const unitsCodec = makeCodec<Unit[]>({
  key: 'units',
  version: 1,
  serialize:   (s) => s.units ?? [],
  deserialize: (data) => ({ units: data }),
  empty:       () => [...INITIAL_UNITS],
})
