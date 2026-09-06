// ── Combat tally: the battle-report analytics aggregation layer ───────────────-
//
// The engine emits per-hit `BattleEvent`s each round (damage / heal / dodge, with
// the attacking `element` and effectiveness `eff`) but those are ephemeral. This
// module folds them into a persistable `CombatTally` — the one shape used for
// per-unit lifetime stats, per-location per-hero breakdowns, AND the rolling
// time-window history buckets. Folding is pure given a round's events + which
// combatants are players, so the live tick and the offline-sim slices share it.

import type { BattleEvent } from '@/engine'
import type { CombatTally, StatBucket } from '@/types'
import { TICKS_PER_SECOND } from '@/lib/time'

// One history bucket spans a minute; we keep ~64 (a touch over an hour) so the
// "last 5m / 1h" windows resolve after a reload without unbounded save growth.
export const HISTORY_BUCKET_TICKS = TICKS_PER_SECOND * 60   // 300 ticks = 1 min
export const HISTORY_MAX_BUCKETS  = 64

export function bucketIndexOf(tick: number): number {
  return Math.floor(tick / HISTORY_BUCKET_TICKS)
}

export function emptyTally(): CombatTally {
  return {
    damageDealt: 0, monstersDefeated: 0, killsByMonster: {}, itemsFound: 0, combatTicks: 0,
    spellDamageDealt: 0, hits: 0, misses: 0, damageTaken: 0, dodges: 0, healingDone: 0,
    expGained: 0, levelsGained: 0,
    dmgDealtByElement: {}, dmgTakenByElement: {}, effDealt: { effective: 0, neutral: 0, resisted: 0, immune: 0 },
  }
}

// Map an element multiplier to its effectiveness bucket (§3): >1 super-effective,
// 1 neutral, 0<x<1 resisted, 0 immune (no damage). `undefined` ⇒ neutral.
export function effKindOf(eff: number | undefined): keyof CombatTally['effDealt'] {
  if (eff === undefined || eff === 1) return 'neutral'
  if (eff === 0) return 'immune'
  return eff > 1 ? 'effective' : 'resisted'
}

function addMap(dst: Record<string, number>, src: Record<string, number>): void {
  for (const k in src) dst[k] = (dst[k] ?? 0) + src[k]
}

// dst += src (mutates dst). Tolerates partially-shaped `src` from old saves.
export function addInto(dst: CombatTally, src: Partial<CombatTally>): void {
  dst.damageDealt      += src.damageDealt ?? 0
  dst.monstersDefeated += src.monstersDefeated ?? 0
  if (src.killsByMonster) addMap(dst.killsByMonster, src.killsByMonster)
  dst.itemsFound       += src.itemsFound ?? 0
  dst.combatTicks      += src.combatTicks ?? 0
  dst.spellDamageDealt += src.spellDamageDealt ?? 0
  dst.hits             += src.hits ?? 0
  dst.misses           += src.misses ?? 0
  dst.damageTaken      += src.damageTaken ?? 0
  dst.dodges           += src.dodges ?? 0
  dst.healingDone      += src.healingDone ?? 0
  dst.expGained        += src.expGained ?? 0
  dst.levelsGained     += src.levelsGained ?? 0
  if (src.dmgDealtByElement) addMap(dst.dmgDealtByElement, src.dmgDealtByElement)
  if (src.dmgTakenByElement) addMap(dst.dmgTakenByElement, src.dmgTakenByElement)
  if (src.effDealt) {
    dst.effDealt.effective += src.effDealt.effective ?? 0
    dst.effDealt.neutral   += src.effDealt.neutral ?? 0
    dst.effDealt.resisted  += src.effDealt.resisted ?? 0
    dst.effDealt.immune    += src.effDealt.immune ?? 0
  }
}

// Pure sum of two tallies.
export function addTally(a: CombatTally, b: CombatTally): CombatTally {
  const out = emptyTally()
  addInto(out, a)
  addInto(out, b)
  return out
}

// Scale a tally by a factor (offline extrapolation: a measured slice → its full
// window). Counts are rounded; element/effectiveness breakdowns scale in kind so
// their *ratios* survive even though the absolute numbers are estimates.
export function scaleTally(t: CombatTally, factor: number): CombatTally {
  const s = (n: number) => Math.round(n * factor)
  const sm = (m: Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const k in m) out[k] = s(m[k])
    return out
  }
  return {
    damageDealt: s(t.damageDealt), monstersDefeated: s(t.monstersDefeated),
    killsByMonster: sm(t.killsByMonster), itemsFound: s(t.itemsFound), combatTicks: s(t.combatTicks),
    spellDamageDealt: s(t.spellDamageDealt), hits: s(t.hits), misses: s(t.misses),
    damageTaken: s(t.damageTaken), dodges: s(t.dodges), healingDone: s(t.healingDone),
    expGained: s(t.expGained), levelsGained: s(t.levelsGained),
    dmgDealtByElement: sm(t.dmgDealtByElement), dmgTakenByElement: sm(t.dmgTakenByElement),
    effDealt: {
      effective: s(t.effDealt.effective), neutral: s(t.effDealt.neutral),
      resisted: s(t.effDealt.resisted), immune: s(t.effDealt.immune),
    },
  }
}

const DAMAGE_TYPES = new Set<BattleEvent['type']>(['melee_attack', 'ranged_attack', 'dot', 'skill_use'])

// Get-or-create a unit's delta in the accumulator.
function cell(acc: Record<string, CombatTally>, id: string): CombatTally {
  return (acc[id] ??= emptyTally())
}

// Fold one round's events into per-unit (player-only) tally deltas. Mutates `acc`.
// Source side = damage/heal a hero dealt; target side = damage/dodge a hero took.
// (monstersDefeated / itemsFound / combatTicks / exp / levels are credited by the
// store, not derivable from the raw event stream alone.)
export function foldRoundEvents(
  acc: Record<string, CombatTally>,
  events: BattleEvent[],
  round: number,
  playerIds: Set<string>,
): void {
  for (const e of events) {
    if (e.round !== round) continue
    const srcPlayer = playerIds.has(e.sourceId)
    const tgtPlayer = !!e.targetId && playerIds.has(e.targetId)

    if (e.type === 'dodge') {
      // sourceId = attacker, targetId = the dodger.
      if (tgtPlayer) cell(acc, e.targetId!).dodges += 1
      if (srcPlayer) cell(acc, e.sourceId).misses += 1
      continue
    }

    if (e.type === 'heal') {
      if (srcPlayer && e.value && e.value > 0) cell(acc, e.sourceId).healingDone += e.value
      continue
    }

    if (DAMAGE_TYPES.has(e.type)) {
      const val = e.value ?? 0
      const kind = effKindOf(e.eff)
      if (srcPlayer) {
        const t = cell(acc, e.sourceId)
        t.effDealt[kind] += 1
        if (val > 0) {
          t.damageDealt += val
          t.hits += 1
          if (e.type === 'skill_use') t.spellDamageDealt += val
          if (e.element) t.dmgDealtByElement[e.element] = (t.dmgDealtByElement[e.element] ?? 0) + val
        }
      }
      if (tgtPlayer && val > 0) {
        const t = cell(acc, e.targetId!)
        t.damageTaken += val
        if (e.element) t.dmgTakenByElement[e.element] = (t.dmgTakenByElement[e.element] ?? 0) + val
      }
    }
  }
}

// ── Rolling history buckets ──────────────────────────────────────────────────-

// Fold a tick's per-unit deltas into the rolling-minute history, returning a new
// map. Each unit's delta lands in the bucket for `tick`; buckets older than the
// retention window are pruned. Empty deltas are skipped so idle heroes don't grow
// the history.
export function foldHistory(
  prev: Record<string, StatBucket[]>,
  delta: Record<string, CombatTally>,
  tick: number,
): Record<string, StatBucket[]> {
  const ids = Object.keys(delta)
  if (ids.length === 0) return prev
  const bucket = bucketIndexOf(tick)
  const minBucket = bucket - HISTORY_MAX_BUCKETS + 1
  const out = { ...prev }
  for (const id of ids) {
    const buckets = (out[id] ?? []).filter((b) => b.bucket >= minBucket)
    let cur = buckets[buckets.length - 1]
    if (!cur || cur.bucket !== bucket) {
      cur = { bucket, tally: emptyTally() }
      buckets.push(cur)
    } else {
      // copy-on-write the tally we're about to mutate
      cur = { bucket, tally: addTally(cur.tally, emptyTally()) }
      buckets[buckets.length - 1] = cur
    }
    addInto(cur.tally, delta[id])
    out[id] = buckets
  }
  return out
}

// Sum the buckets covering the last `minutes` (inclusive of the current bucket).
// Bounded on BOTH sides of the current bucket: a bucket NEWER than `currentTick`
// (index > current) is excluded too — you can't have dealt damage in a future
// minute. Without the upper bound, history left over from a higher tick count reads
// as "current" forever and the rate never decays: a save reset drops `ticks` to 0
// while stale buckets sit at high indices, so every one of them counts as the
// current minute (the "44k on a brand-new hero" bug).
export function sumWindow(buckets: StatBucket[] | undefined, currentTick: number, minutes: number): CombatTally {
  const total = emptyTally()
  if (!buckets) return total
  const to = bucketIndexOf(currentTick)
  const from = to - minutes + 1
  for (const b of buckets) if (b.bucket >= from && b.bucket <= to) addInto(total, b.tally)
  return total
}

// Sum every retained bucket (≈ last hour of live play) — the history total.
export function sumAll(buckets: StatBucket[] | undefined): CombatTally {
  const total = emptyTally()
  if (buckets) for (const b of buckets) addInto(total, b.tally)
  return total
}
