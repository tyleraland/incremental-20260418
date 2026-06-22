import { makeCodec } from '@/lib/save'
import { DEFAULT_PROGRESSION_MODE, type ProgressionMode } from '@/lib/unlocks'
import type { TacticSlot } from '@/types'

// `savedAt` is the wall-clock time the save was written. On load it restores
// `lastTickAt` so App's catch-up computes the real elapsed gap and runs offline
// progression (batchTick) — without it, lastTickAt resets to page-load time and
// a full app restart would extrapolate ~zero offline time.
// `progressionMode` is the feature-unfolding stance (sandbox/curated); persisted
// so a curated game stays curated across reloads.
interface WorldSave { ticks: number; partyTactics: TacticSlot[]; progressionMode: ProgressionMode; savedAt: number }

const DEFAULT_PARTY_TACTICS: TacticSlot[] = [{ id: 'finish-them', rank: 1 }]

export const worldCodec = makeCodec<WorldSave>({
  key: 'world',
  version: 4,
  serialize:   (s) => ({ ticks: s.ticks ?? 0, partyTactics: s.partyTactics ?? [], progressionMode: s.progressionMode ?? DEFAULT_PROGRESSION_MODE, savedAt: Date.now() }),
  deserialize: (data) => ({ ticks: data.ticks, partyTactics: data.partyTactics ?? [], progressionMode: data.progressionMode ?? DEFAULT_PROGRESSION_MODE, lastTickAt: data.savedAt ?? Date.now() }),
  migrate: (data) => {
    const d = data as Partial<WorldSave>
    // Older saves had no savedAt — treat them as "just now" so an upgrade doesn't
    // award a huge spurious offline catch-up. Pre-v4 saves had no mode → sandbox
    // (the only behaviour those saves ever knew).
    return { ticks: d.ticks ?? 0, partyTactics: d.partyTactics ?? DEFAULT_PARTY_TACTICS, progressionMode: d.progressionMode ?? DEFAULT_PROGRESSION_MODE, savedAt: d.savedAt ?? Date.now() }
  },
  empty:       () => ({ ticks: 0, partyTactics: [...DEFAULT_PARTY_TACTICS], progressionMode: DEFAULT_PROGRESSION_MODE, savedAt: Date.now() }),
})
