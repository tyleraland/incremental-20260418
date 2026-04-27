import { makeCodec } from '@/lib/save'

interface WorldSave { ticks: number }

export const worldCodec = makeCodec<WorldSave>({
  key: 'world',
  version: 1,
  serialize:   (s) => ({ ticks: s.ticks ?? 0 }),
  deserialize: (data) => ({ ticks: data.ticks }),
  empty:       () => ({ ticks: 0 }),
})
