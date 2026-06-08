import type { LocationCombatReport } from './combatReport'
import { MONSTER_REGISTRY } from '@/data/monsters'

// ── Sampled Offline Progression ("Warm Catch-up") ────────────────────────────
//
// While the player is away we *extrapolate* combat rewards from each deployed
// location's realized rate instead of re-simulating the spatial engine (a naive
// fast-forward janks — ~72k rounds for an 8h heavy battle). The rate source is
// `getLocationCombatReport`, which turns the persisted per-location
// `LocationCombatStats` into a windowed report (kills / exp / gold over
// startTick→endTick). We scale that by the offline ticks.
//
// exp / gold / kill-counts are deterministic (floored EV). LOOT is rolled per
// projected kill (`rollOfflineLoot`) so rare drops can land over a long absence
// instead of being floored to zero by an EV model.

export interface OfflineProjection {
  expPerUnit: number                       // exp credited to each deployed hero
  gold: number
  killsByMonster: Record<string, number>   // monsterId → projected kills
}

// Deterministic extrapolation of a warm location's realized rate over an offline
// span. Returns zeros when there's no usable sample (no data / zero window).
export function projectOfflineRewards(
  report: LocationCombatReport,
  offlineTicks: number,
): OfflineProjection {
  const window = report.endTick - report.startTick
  if (!report.hasData || window <= 0 || offlineTicks <= 0) {
    return { expPerUnit: 0, gold: 0, killsByMonster: {} }
  }
  const scale = offlineTicks / window
  const killsByMonster: Record<string, number> = {}
  for (const [mid, count] of Object.entries(report.monstersDefeated)) {
    const k = Math.floor(count * scale)
    if (k > 0) killsByMonster[mid] = k
  }
  return {
    expPerUnit: Math.floor(report.expDistributed * scale),
    gold:       Math.floor(report.goldEarned * scale),
    killsByMonster,
  }
}

// Roll loot for a pile of projected kills, mirroring the live engine's per-kill
// drop rolls (`rewardKills` in the store). Probabilistic so rare drops can land
// over a long absence rather than being floored to zero. `rng` is injectable so
// tests can pin it (the store already accepts Math.random for live loot).
export function rollOfflineLoot(
  killsByMonster: Record<string, number>,
  rng: () => number = Math.random,
): Record<string, number> {
  const loot: Record<string, number> = {}
  for (const [mid, kills] of Object.entries(killsByMonster)) {
    const def = MONSTER_REGISTRY[mid]
    if (!def) continue
    for (let i = 0; i < kills; i++) {
      for (const d of def.drops) {
        if (rng() < d.dropRate) {
          const qty = d.quantityMin + Math.floor(rng() * (d.quantityMax - d.quantityMin + 1))
          loot[d.itemId] = (loot[d.itemId] ?? 0) + qty
        }
      }
    }
  }
  return loot
}

// ── "While you were away" summary (surfaced as a modal on next load) ──────────

export interface OfflineLocationReward {
  locationId: string
  locationName: string
  kills: number
  expPerUnit: number
  gold: number
  loot: Record<string, number>   // itemId → qty
  primed: boolean                // true if a cold location was primed (Phase 2)
}

export interface OfflineSummary {
  offlineSecs: number
  startTick: number
  endTick: number
  locations: OfflineLocationReward[]
  totalKills: number
  totalGold: number
  loot: Record<string, number>   // merged item loot across all locations (no gold)
}
