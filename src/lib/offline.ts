import type { LocationCombatReport } from './combatReport'
import type { CombatTally } from '@/types'
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
  exp: number                              // total XP pool (split among the group by level)
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
    return { exp: 0, gold: 0, killsByMonster: {} }
  }
  const scale = offlineTicks / window
  const killsByMonster: Record<string, number> = {}
  for (const [mid, count] of Object.entries(report.monstersDefeated)) {
    const k = Math.floor(count * scale)
    if (k > 0) killsByMonster[mid] = k
  }
  return {
    exp:  Math.floor(report.expDistributed * scale),
    gold: Math.floor(report.goldEarned * scale),
    killsByMonster,
  }
}

// ── Sampled-window projection (variance / clumps) ────────────────────────────--
//
// The single linear extrapolation above is smooth — it can't represent a clump of
// monsters or a lucky/unlucky stretch. Instead split a long absence into several
// INDEPENDENT sample windows: simulate a short real-combat slice for each (from a
// freshly re-stocked field), extrapolate that slice's rate over the window, and
// SUM. Because each window samples whatever composition happened to spawn, the
// total carries real variance (a varied monster pool produces clumps; rare/tough
// spawns land in some windows and not others). This file holds the pure windowing
// maths; the slice simulation + combine lives in the store (it needs the engine).

// Number of independent windows to split an offline span into — roughly one per
// `windowTicks` of real time, clamped to [1, maxWindows]. 1 = the single-slice
// path (short absence); more windows capture more variance at more compute.
export function offlineWindowCount(offlineTicks: number, windowTicks: number, maxWindows: number): number {
  if (offlineTicks <= 0 || windowTicks <= 0) return 1
  return Math.max(1, Math.min(maxWindows, Math.round(offlineTicks / windowTicks)))
}

// Floored-EV scaling of a per-monster kill tally (a window's measured slice rate →
// its full duration). Floors so it never invents a fractional kill.
export function scaleKills(killsByMonster: Record<string, number>, scale: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [mid, k] of Object.entries(killsByMonster)) {
    const v = Math.floor(k * scale)
    if (v > 0) out[mid] = v
  }
  return out
}

// Split an XP pool among a group proportional to each member's level. A level-1
// beside a level-99 gets ~1% of the pool — deliberately throttling power-leveling
// a low-level hero by parking it in a high-level party. Falls back to an even
// split only when every level is 0. Shares are fractional (exp is floored at
// display time, not at accrual, so tiny shares still slowly accumulate).
export function splitExpByLevel(
  pool: number,
  members: { id: string; level: number }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  if (pool <= 0 || members.length === 0) return out
  const totalLevel = members.reduce((sum, m) => sum + Math.max(0, m.level), 0)
  for (const m of members) {
    const share = totalLevel > 0 ? Math.max(0, m.level) / totalLevel : 1 / members.length
    if (share > 0) out[m.id] = pool * share
  }
  return out
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
  exp: number                    // total XP pool the location generated (level-split across the party)
  gold: number
  loot: Record<string, number>   // itemId → qty
  primed: boolean                // true if a cold location was primed (Phase 2)
  // Per-hero combat breakdown for the away span (battle-report AFK detail):
  // damage, hits/misses, element & effectiveness maps, etc. Estimated from the
  // simulated slices, scaled over the absence. Empty for sub-minute blips.
  tally?: Record<string, CombatTally>
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

// ── Catch-up instrumentation (debug) ─────────────────────────────────────────--
// Recorded on every offline catch-up so the report screen can show if/when it ran
// and you can weigh sampling COST (wall-ms, rounds simulated) against OUTPUT.

export interface CatchUpLocation {
  locationId: string
  locationName: string
  windows: number   // sample windows used (1 = single slice; warm-cheap path = 1, no sim)
  rounds: number    // engine rounds actually simulated (0 = pure rate extrapolation)
  kills: number
  exp: number
  gold: number
}

export interface CatchUpDebug {
  at: number         // Date.now() when the catch-up ran
  ticks: number      // ticks batched in this jump
  secs: number       // ticks / TICKS_PER_SECOND
  wallMs: number     // wall-time the batchTick sim+projection took (the cost)
  locations: CatchUpLocation[]
}
