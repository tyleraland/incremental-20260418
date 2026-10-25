// ── Live bug watchdog ────────────────────────────────────────────────────────
//
// A cheap, purely-observational pass the live tick runs to catch REAL bugs as they
// happen — a hero walled off / oscillating in place instead of fighting, or a state
// invariant that should never hold (negative stock, HP over max, an over-capacity
// pack). When one fires we BANK a report: a description + a token to reproduce it
// later (a BSNAP of the battle for combat bugs, a small JSON blob for state ones).
// Reports persist to their own localStorage key and surface in Time→Debug.
//
// It never mutates the engine, the RNG, or the battle — so it can't perturb combat
// or break snapshot replays. It only READS the freshly-stepped state each tick.
import { serializeBattle, type BattleState } from '@/engine'
import { getDerivedStats } from '@/lib/stats'
import { packWeight, WEIGHT_LIMIT } from '@/proto/economy'
import type { Unit, MiscItem, EquipmentItem } from '@/types'

// Rounds a hero can sit outside a town — not moving AND not fighting, with enemies
// on the field — before we flag it as stuck. Matches the `bsnap --reach` use case.
export const STUCK_ROUNDS = 10
// Keep the most recent N reports (newest first); a BSNAP token is a few KB.
export const MAX_BUG_REPORTS = 25
// Invariant checks don't need per-tick granularity; run them every N ticks.
export const INVARIANT_EVERY_TICKS = 10

export interface BugReport {
  id: string
  at: number                    // Date.now() when banked
  tick: number                  // game tick when banked
  kind: string                  // 'stuck' | 'negative-item' | 'hp-over-max' | 'overweight-pack' | …
  description: string
  locationId?: string
  tokenKind?: 'bsnap' | 'json'  // how to interpret `token`
  token?: string                // BSNAP token (combat) or a small JSON blob (state)
}

// A candidate bug, before the store stamps id/at/tick.
export interface BankedBug {
  kind: string
  description: string
  locationId?: string
  tokenKind?: 'bsnap' | 'json'
  token?: string
}

// Runtime (NOT persisted, NOT in the save) detector memory.
export interface StuckEntry { pos: string; since: number; banked: boolean; round: number }
export interface BugWatchState {
  stuck: Record<string, StuckEntry>   // key `${locationId}:${combatantId}`
  active: string[]                    // invariant signatures currently violating (bank once per incident)
}
export const emptyBugWatch = (): BugWatchState => ({ stuck: {}, active: [] })

// Detect stuck heroes across every live battle. A hero is stuck when: it's alive, the
// battle isn't a peaceful town, there's a living enemy on the field, and it has neither
// changed position NOR dealt/taken damage for STUCK_ROUNDS *advancing* rounds. We key
// idle time to the battle ROUND and skip a battle whose round didn't move this tick
// (an off-screen battle isn't stepped — its frozen positions must NOT read as idle).
export function detectStuck(
  battles: Record<string, BattleState>,
  prev: Record<string, StuckEntry>,
  snapshot: (b: BattleState) => string = serializeBattle,   // injectable so tests can stub the token
): { bugs: BankedBug[]; next: Record<string, StuckEntry> } {
  const next: Record<string, StuckEntry> = {}
  const bugs: BankedBug[] = []
  for (const [locId, battle] of Object.entries(battles)) {
    if (battle.peaceful) continue
    const enemiesAlive = battle.combatants.some((c) => c.team === 'enemy' && c.alive)
    for (const c of battle.combatants) {
      if (c.team !== 'player' || !c.alive) continue
      const key = `${locId}:${c.id}`
      const e = prev[key]
      if (e && e.round === battle.round) { next[key] = e; continue }   // battle didn't step → carry as-is
      const posKey = `${c.pos.x},${c.pos.y}`
      const moved = !e || e.pos !== posKey
      const since = moved ? battle.round : e.since
      let banked = moved ? false : e.banked
      const idle = battle.round - since
      const engagedRecently = battle.round - c.lastDamageRound <= STUCK_ROUNDS
      if (enemiesAlive && !engagedRecently && idle >= STUCK_ROUNDS && !banked) {
        banked = true
        bugs.push({
          kind: 'stuck',
          description: `${c.name} idle ${idle} rounds at (${c.pos.x},${c.pos.y}) with enemies present — not moving or fighting${c.moveOrder ? ' (holding an unreachable move order)' : ''}.`,
          locationId: locId,
          tokenKind: 'bsnap',
          token: snapshot(battle),
        })
      }
      next[key] = { pos: posKey, since, banked, round: battle.round }
    }
  }
  return { bugs, next }
}

const jsonToken = (label: string, data: unknown) => JSON.stringify({ label, data }, null, 0)

// State invariants that should NEVER hold. Returns each CURRENTLY-violating signature
// + its bug; the caller banks a signature only when it first appears and forgets it
// once it clears (so a persistent bad state banks once, not every tick).
export function detectInvariants(
  units: Unit[], equipment: EquipmentItem[], miscItems: MiscItem[], packs: Record<string, Record<string, number>>,
): { signature: string; bug: BankedBug }[] {
  const out: { signature: string; bug: BankedBug }[] = []
  for (const m of miscItems) {
    if (m.quantity < 0) out.push({ signature: `neg-item:${m.id}`, bug: {
      kind: 'negative-item', description: `Stash item "${m.id}" has negative quantity ${m.quantity}.`,
      tokenKind: 'json', token: jsonToken('miscItem', m) } })
  }
  for (const u of units) {
    const maxHp = getDerivedStats(u, equipment).maxHp
    if (Number.isFinite(u.health) && u.health > maxHp + 1) out.push({ signature: `hp-over:${u.id}`, bug: {
      kind: 'hp-over-max', description: `${u.name} has ${u.health} HP, over maxHp ${maxHp}.`,
      tokenKind: 'json', token: jsonToken('unit', { id: u.id, health: u.health, maxHp }) } })
    if (!Number.isFinite(u.health) || u.health < 0) out.push({ signature: `hp-bad:${u.id}`, bug: {
      kind: 'bad-hp', description: `${u.name} has invalid health ${u.health}.`,
      tokenKind: 'json', token: jsonToken('unit', { id: u.id, health: u.health }) } })
  }
  for (const [uid, pack] of Object.entries(packs)) {
    const w = packWeight(pack)
    if (w > WEIGHT_LIMIT + 0.5) out.push({ signature: `overweight:${uid}`, bug: {
      kind: 'overweight-pack', description: `Hero "${uid}" carries pack weight ${Math.round(w)} over the ${WEIGHT_LIMIT} limit.`,
      tokenKind: 'json', token: jsonToken('pack', { uid, pack, weight: w }) } })
    for (const [id, q] of Object.entries(pack)) {
      if (q < 0) out.push({ signature: `neg-pack:${uid}:${id}`, bug: {
        kind: 'negative-pack', description: `Hero "${uid}" pack holds negative "${id}" (${q}).`,
        tokenKind: 'json', token: jsonToken('pack', { uid, id, q }) } })
    }
  }
  return out
}
