import { makeCodec } from '@/lib/save'
import type { StatBucket } from '@/types'

interface UnitHistorySave {
  unitStatHistory: Record<string, StatBucket[]>
}

// Per-unit rolling-window history: bounded minute-buckets of the combat tally,
// powering the "last 5m / 1h" per-hero breakdowns. Bounded (≈64 buckets/hero) so
// it survives a reload without unbounded save growth.
export const unitHistoryCodec = makeCodec<UnitHistorySave>({
  key: 'unitHistory',
  version: 1,
  serialize:   (s) => ({ unitStatHistory: s.unitStatHistory ?? {} }),
  deserialize: (data) => ({ unitStatHistory: data.unitStatHistory ?? {} }),
  empty:       () => ({ unitStatHistory: {} }),
})
