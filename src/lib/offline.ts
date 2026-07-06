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

// ── Offline return-to-town loop (§logistics) ─────────────────────────────────--
//
// Live, a hero hunts until their pack fills (or supplies run dry), walks to town,
// deposits loot into the stash, restocks supplies, and heads back — over and over.
// Offline we can't run that per-round, so we EXTRAPOLATE the cycle: from the
// realized kill/loot rate we know how fast a pack fills; each completed fill is one
// return trip (deposit + restock + travel overhead) that doesn't hunt. Supplies are
// a finite budget (carried + stash + what gold can buy), drained at the slice-
// measured burn rate; when they run dry and the hero returns on 'supplies-out', the
// run STALLS. The result feeds back into batchTick: effective hunt time (< absence
// when travel/stalls eat into it), how much loot deposits to the stash vs. stays in
// the carried pack, and supplies consumed. Pure arithmetic — this is how we model
// "lots of combat + many town trips" cheaply, without simulating every round.

export interface OfflineCycleParams {
  offlineTicks: number          // the absence span for this party/location
  lootWeightPerTick: number     // realized loot-weight accrual (party aggregate)
  packCapacityWeight: number    // combined loot room across the hunting party
  fillFraction: number          // return at this fraction of capacity (PACK_FULL_FRACTION)
  overheadTicks: number         // travel + town dwell per completed return trip
  supplyBurnPerTick: number     // slice-measured potion burn (0 → supplies never gate)
  supplyBudget: number          // potions the party can field before running dry (stash + gold-buyable)
  stallOnDry: boolean           // hero returns on 'supplies-out' → a dry run stops hunting
}

export interface OfflineCycleResult {
  huntTicks: number             // effective ticks actually hunting (≤ offlineTicks)
  cycles: number                // completed return trips (each deposits a full pack-load)
  depositWeight: number         // loot weight deposited to the stash across all trips
  residualWeight: number        // loot weight still carried (the last, partial fill)
  supplyUsed: number            // potions consumed over the absence
  stalled: boolean              // ran dry on supplies and couldn't continue
}

// Extrapolate the hunt→town→hunt loop over an absence. Deterministic; no RNG.
export function projectOfflineCycles(p: OfflineCycleParams): OfflineCycleResult {
  const N = p.offlineTicks
  const empty: OfflineCycleResult = { huntTicks: 0, cycles: 0, depositWeight: 0, residualWeight: 0, supplyUsed: 0, stalled: false }
  if (N <= 0) return empty

  const fillWeight = Math.max(0, p.fillFraction * p.packCapacityWeight)
  // Ticks to fill one pack-load; Infinity when there's no loot pressure or no room
  // (the hero just hunts the whole time and never triggers a return).
  const tFill = (p.lootWeightPerTick > 0 && fillWeight > 0) ? fillWeight / p.lootWeightPerTick : Infinity
  const overhead = Math.max(0, p.overheadTicks)
  const burn = Math.max(0, p.supplyBurnPerTick)

  let remaining = N, hunt = 0, cycles = 0, supply = Math.max(0, p.supplyBudget), stalled = false
  let guard = 0
  while (remaining > 1e-9 && guard++ < 100_000) {
    // Already dry at the start of a leg → stall if the hero returns on 'supplies-out',
    // else fight on without potions (burn no longer bites).
    if (burn > 0 && supply <= 1e-9 && p.stallOnDry) { stalled = true; break }
    // A hunting leg runs until the pack fills, time runs out, or supplies dry.
    const supplyTicks = (burn > 0 && supply > 1e-9) ? supply / burn : Infinity
    const leg = Math.min(tFill, remaining, supplyTicks)
    if (leg <= 1e-9) break
    const rBefore = remaining
    hunt += leg
    remaining -= leg
    supply = Math.max(0, supply - leg * burn)
    if (leg >= tFill - 1e-9) {
      // Filled a pack → a return trip. Even if the trip runs past the end of the
      // absence, the hero still made it home and deposited (no idling in the field).
      cycles++
      remaining -= overhead
    } else if (leg >= rBefore - 1e-9) {
      break   // ran out of clock mid-fill → partial pack, done
    } else {
      // Cut short by supplies: stall if configured, else fight on with no potions.
      if (p.stallOnDry) { stalled = true; break }
      supply = 0
    }
  }

  const totalWeight = hunt * p.lootWeightPerTick
  const depositWeight = Math.min(totalWeight, cycles * fillWeight)
  const residualWeight = Math.max(0, totalWeight - depositWeight)
  return { huntTicks: hunt, cycles, depositWeight, residualWeight, supplyUsed: Math.max(0, p.supplyBudget - supply), stalled }
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
  // §logistics return-to-town loop (when the party runs the cycle model offline):
  cycles?: number                // completed hunt→town trips (loot deposited to stash)
  stalled?: boolean              // a hero ran out of supplies and couldn't resupply
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
  cycles?: number   // §logistics return-to-town trips modelled this catch-up
  stalled?: boolean // a hero ran dry on supplies
}

export interface CatchUpDebug {
  at: number         // Date.now() when the catch-up ran
  ticks: number      // ticks batched in this jump
  secs: number       // ticks / TICKS_PER_SECOND
  wallMs: number     // wall-time the batchTick sim+projection took (the cost)
  locations: CatchUpLocation[]
}
