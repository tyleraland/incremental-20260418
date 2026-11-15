import { makeCodec } from '@/lib/save'
import { serializeBattle, deserializeBattle } from '@/engine'
import type { BattleState } from '@/engine'

// Persists in-progress battles so a fight survives a reload — most importantly
// the *persistent open-world* ones, whose scattered monsters and accumulated
// positions would otherwise reset to formation each session. Each battle is
// stored as the same `BSNAP.<base64>` token the engine's snapshot uses
// (`serializeBattle`), so battle serialization lives in ONE place and the
// whole-game save simply *composes* it. That also means a single location's
// battlefield-repro token is literally `s.battles[locationId]` run through the
// same serializer the ⎘-state button uses.
interface BattlesSave {
  battles: Record<string, string>            // locationId → BSNAP token
  battleCooldown: Record<string, number>     // locationId → ticks until the next wave
  monsterSpawnTimers: Record<string, number> // locationId → ticks until next open-world spawn
}

export const battlesCodec = makeCodec<BattlesSave>({
  key: 'battles',
  version: 1,
  serialize: (s) => ({
    battles: Object.fromEntries(
      Object.entries(s.battles ?? {}).map(([id, b]) => [id, serializeBattle(b)]),
    ),
    battleCooldown:     s.battleCooldown ?? {},
    monsterSpawnTimers: s.monsterSpawnTimers ?? {},
  }),
  deserialize: (data) => {
    const battles: Record<string, BattleState> = {}
    for (const [id, token] of Object.entries(data.battles ?? {})) {
      // A token that fails to parse (format drift, corruption) is skipped, not
      // fatal — the location just respawns its battle fresh on the next tick.
      try { battles[id] = deserializeBattle(token) } catch { /* drop this battle */ }
    }
    return {
      battles,
      battleCooldown:     data.battleCooldown ?? {},
      monsterSpawnTimers: data.monsterSpawnTimers ?? {},
    }
  },
  empty: () => ({ battles: {}, battleCooldown: {}, monsterSpawnTimers: {} }),
})
