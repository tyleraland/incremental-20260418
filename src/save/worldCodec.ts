import { makeCodec } from '@/lib/save'
import type { TacticSlot } from '@/types'

interface WorldSave { ticks: number; partyTactics: TacticSlot[] }

const DEFAULT_PARTY_TACTICS: TacticSlot[] = [{ id: 'finish-them', rank: 1 }]

export const worldCodec = makeCodec<WorldSave>({
  key: 'world',
  version: 2,
  serialize:   (s) => ({ ticks: s.ticks ?? 0, partyTactics: s.partyTactics ?? [] }),
  deserialize: (data) => ({ ticks: data.ticks, partyTactics: data.partyTactics ?? [] }),
  migrate: (data) => {
    const d = data as Partial<WorldSave>
    return { ticks: d.ticks ?? 0, partyTactics: d.partyTactics ?? DEFAULT_PARTY_TACTICS }
  },
  empty:       () => ({ ticks: 0, partyTactics: [...DEFAULT_PARTY_TACTICS] }),
})
