import { makeCodec } from '@/lib/save'
import { DEFAULT_PROGRESSION_MODE, type ProgressionMode } from '@/lib/unlocks'
import { DEFAULT_DIRECTIVE_ID } from '@/engine'
import type { TacticSlot } from '@/types'

// `savedAt` is the wall-clock time the save was written. On load it restores
// `lastTickAt` so App's catch-up computes the real elapsed gap and runs offline
// progression (batchTick) — without it, lastTickAt resets to page-load time and
// a full app restart would extrapolate ~zero offline time.
// `progressionMode` is the feature-unfolding stance (sandbox/curated); persisted
// so a curated game stays curated across reloads.
// `partyDirective` is the party's one active directive (tactical-coordination.md
// §3.5) — the slot beside partyTactics, persisted the same way. Absent on older
// saves ⇒ the default (Skirmish = shipped behavior).
interface WorldSave { ticks: number; partyTactics: TacticSlot[]; partyDirective?: string; progressionMode: ProgressionMode; savedAt: number }

export const DEFAULT_PARTY_TACTICS: TacticSlot[] = [{ id: 'finish-them', rank: 1 }]

export const worldCodec = makeCodec<WorldSave>({
  key: 'world',
  version: 4,
  serialize:   (s) => ({ ticks: s.ticks ?? 0, partyTactics: s.partyTactics ?? [], partyDirective: s.partyDirective ?? DEFAULT_DIRECTIVE_ID, progressionMode: s.progressionMode ?? DEFAULT_PROGRESSION_MODE, savedAt: Date.now() }),
  deserialize: (data) => ({ ticks: data.ticks, partyTactics: data.partyTactics ?? DEFAULT_PARTY_TACTICS, partyDirective: data.partyDirective ?? DEFAULT_DIRECTIVE_ID, progressionMode: data.progressionMode ?? DEFAULT_PROGRESSION_MODE, lastTickAt: data.savedAt ?? Date.now() }),
  migrate: (data) => {
    const d = data as Partial<WorldSave>
    // Older saves had no savedAt — treat them as "just now" so an upgrade doesn't
    // award a huge spurious offline catch-up. Pre-v4 saves had no mode → sandbox
    // (the only behaviour those saves ever knew). Pre-directive saves → Skirmish.
    return { ticks: d.ticks ?? 0, partyTactics: d.partyTactics ?? DEFAULT_PARTY_TACTICS, partyDirective: d.partyDirective ?? DEFAULT_DIRECTIVE_ID, progressionMode: d.progressionMode ?? DEFAULT_PROGRESSION_MODE, savedAt: d.savedAt ?? Date.now() }
  },
  empty:       () => ({ ticks: 0, partyTactics: [...DEFAULT_PARTY_TACTICS], partyDirective: DEFAULT_DIRECTIVE_ID, progressionMode: DEFAULT_PROGRESSION_MODE, savedAt: Date.now() }),
})
