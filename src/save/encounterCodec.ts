import { makeCodec } from '@/lib/save'

interface EncounterSave {
  monsterCooldowns: Record<string, Record<string, number[]>>
}

export const encounterCodec = makeCodec<EncounterSave>({
  key: 'encounter',
  version: 1,
  serialize:   (s) => ({ monsterCooldowns: s.monsterCooldowns ?? {} }),
  deserialize: (data) => ({ monsterCooldowns: data.monsterCooldowns }),
  empty:       () => ({ monsterCooldowns: {} }),
})
