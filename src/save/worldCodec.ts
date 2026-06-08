import { makeCodec } from '@/lib/save'
import type { TacticSlot } from '@/types'

// `savedAt` is the wall-clock time the save was written. On load it restores
// `lastTickAt` so App's catch-up computes the real elapsed gap and runs offline
// progression (batchTick) — without it, lastTickAt resets to page-load time and
// a full app restart would extrapolate ~zero offline time.
interface WorldSave { ticks: number; partyTactics: TacticSlot[]; savedAt: number }

const DEFAULT_PARTY_TACTICS: TacticSlot[] = [{ id: 'finish-them', rank: 1 }]

export const worldCodec = makeCodec<WorldSave>({
  key: 'world',
  version: 3,
  serialize:   (s) => ({ ticks: s.ticks ?? 0, partyTactics: s.partyTactics ?? [], savedAt: Date.now() }),
  deserialize: (data) => ({ ticks: data.ticks, partyTactics: data.partyTactics ?? [], lastTickAt: data.savedAt ?? Date.now() }),
  migrate: (data) => {
    const d = data as Partial<WorldSave>
    // Older saves had no savedAt — treat them as "just now" so an upgrade doesn't
    // award a huge spurious offline catch-up.
    return { ticks: d.ticks ?? 0, partyTactics: d.partyTactics ?? DEFAULT_PARTY_TACTICS, savedAt: d.savedAt ?? Date.now() }
  },
  empty:       () => ({ ticks: 0, partyTactics: [...DEFAULT_PARTY_TACTICS], savedAt: Date.now() }),
})
