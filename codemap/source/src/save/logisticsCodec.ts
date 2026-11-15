import { makeCodec } from '@/lib/save'
import { freshHero, planOf, type ExpPlan, type ReturnModeId } from '@/proto/expedition'
import type { Pack } from '@/proto/economy'

// §logistics: per-hero carry packs + expedition plans. Graduated from the interim
// `protoPacks`/`protoExpeditions` localStorage keys into a real save slice so they
// round-trip through exportSave/importSave and are advanced by offline catch-up.
//
// Only the DURABLE expedition plan is persisted (loadout, loot filter, return
// rules, sharing, return town) — the per-tick runtime (suppliesLeft / status /
// locationId / resupplyUntil) is re-established by the expedition driver on load,
// so saving it would only bloat the file and churn on every tick.
interface LogisticsSave {
  packs: Record<string, Pack>
  packsSeeded: boolean
  expeditions: Record<string, ExpPlan>
  expeditionReturnMode: ReturnModeId
}

export const logisticsCodec = makeCodec<LogisticsSave>({
  key: 'logistics',
  version: 1,
  serialize: (s) => ({
    packs:       s.packs ?? {},
    packsSeeded: s.packsSeeded ?? false,
    expeditions: Object.fromEntries(Object.entries(s.expeditions ?? {}).map(([id, h]) => [id, planOf(h)])),
    expeditionReturnMode: s.expeditionReturnMode ?? 'individual',
  }),
  deserialize: (data) => ({
    packs:       data.packs ?? {},
    packsSeeded: data.packsSeeded ?? false,
    // Rebuild each hero with a fresh runtime around its saved plan.
    expeditions: Object.fromEntries(Object.entries(data.expeditions ?? {}).map(([id, plan]) => [id, freshHero(plan)])),
    expeditionReturnMode: data.expeditionReturnMode ?? 'individual',
  }),
  empty: () => ({ packs: {}, packsSeeded: false, expeditions: {}, expeditionReturnMode: 'individual' }),
})
