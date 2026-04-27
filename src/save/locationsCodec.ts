import { makeCodec } from '@/lib/save'

interface LocationsSave {
  familiarity:  Record<string, number>
  monstersSeen: Record<string, string[]>
}

export const locationsCodec = makeCodec<LocationsSave>({
  key: 'locations',
  version: 1,
  serialize: (s) => ({
    familiarity:  s.locationFamiliarity   ?? {},
    monstersSeen: s.locationMonstersSeen  ?? {},
  }),
  deserialize: (data) => ({
    locationFamiliarity:  data.familiarity,
    locationMonstersSeen: data.monstersSeen,
  }),
  empty: () => ({ familiarity: {}, monstersSeen: {} }),
})
