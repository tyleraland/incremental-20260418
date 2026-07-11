// Combat Tactic Engine — the team coordination planner (tactical-coordination.md).
// Future home of the sense → appraise → decide → assign → publish pipeline that
// fills TeamPlan v2 (engagement / assignments / avoid list / corridor). M0 ships
// only the substrate: the team acumen score and the per-combatant kit-capability
// precompute — read by nothing in the sim yet.
//
// Pure and deterministic like every engine leaf (same discipline as plan.ts):
// no RNG, no store/time imports, inputs never mutated.

import { attackReach, distance } from './grid'
import { effectiveStat, skillDamageEstimate } from './damage'
import { armoredFactor } from './tactics'
import { isStealthed } from './behavior'
import { EPS, CAMP_RADIUS, HUNT_RETAIN_MULT } from './constants'
import { PRIMARY_SWITCH_MARGIN } from './tuning'
import type { BattleState, Combatant, Engagement, KitCapability, Team } from './types'

// §acumen (tactical-coordination.md §3.2): smart members make a smart party.
// Additive over LIVING members' effective INT — every scholar contributes,
// buffs/debuffs move it, and deaths are felt immediately (kill the shaman and
// the pack's coordination collapses). Planner features gate on it through the
// ACUMEN thresholds table (tuning.ts); recomputed from live state, no memory.
export function teamAcumen(state: BattleState, team: Team): number {
  let sum = 0
  for (const c of state.combatants) {
    if (c.alive && c.team === team) sum += effectiveStat(c, 'int')
  }
  return sum
}

// §capability (tactical-coordination.md §3.2/§5): the target-independent v0
// answers, precomputed once per combatant (makeCombatant + snapshot deserialize
// — derived, never serialized). Computed on the BASE kit (statuses stripped) so
// a mid-fight snapshot rebuilds the same numbers spawn produced. All v0 ⏱:
//   sustainedDamage — best raw formula damage/round over basic + attack skills,
//     amortized by cast cycle (channel + cooldown) like estimateDamageVs, but
//     with no target mitigation/element (that's the matchup scorers' job).
//   toughness — maxHp × armoredFactor (1 − capped armorReduction).
//   reach — max offensive range: attackReach + damage-skill ranges (mirrors
//     threatProfile's reach logic in plan.ts).
//   hasHeal — any heal skill in the kit.
export function computeCapability(c: Combatant): KitCapability {
  const base = c.statuses.length ? { ...c, statuses: [] } : c
  let sustainedDamage = effectiveStat(base, 'str')   // basic attack: str * 1, cycle 1
  let reach = attackReach(c)
  for (const s of c.skills) {
    if (s.damageFormula && s.range > reach) reach = s.range
    if (s.type !== 'attack') continue
    const cycle = Math.max(1, s.channelTime + s.cooldown)
    const d = skillDamageEstimate(base, s) / cycle
    if (d > sustainedDamage) sustainedDamage = d
  }
  return {
    sustainedDamage,
    toughness: c.maxHp * armoredFactor(c),
    reach,
    hasHeal: c.skills.some((s) => s.type === 'heal'),
  }
}

// §coordination M1 (tactical-coordination.md §3.1/§3.3): the planner's `decide`
// stage for the engagement — kill-order pick, commitment hysteresis, the v0
// camp, and the avoid list. `members` are this team's living combatants;
// `enemies` is ALL living opposing combatants, unfiltered by vision — this
// function applies the SAME stealth/vision rule the focus pick in
// defaultPlanner uses (not shared code yet; M2's pullSetOf is what unifies the
// membership tests with rallyPack). `threat` is the plan's per-enemy danger
// score, already computed by the caller ("however danger is identified" per
// the doc — one field, upgradeable in place).
//
// Kill order: maximize threat[e] / max(EPS, ttk(e)), where
// ttk(e) = e.hp / partySustained and partySustained = Σ living members'
// capability.sustainedDamage — dangerous AND killable beats merely dangerous
// (a monstrous-HP threat) or merely squishy (harmless trash). Implemented as
// the literal ratio, not algebraically reduced to threat/hp, so M2's pull
// pricing can reuse the exact shape.
//
// Commitment hysteresis: the previous primary is kept while it's alive,
// retained in sight out to HUNT_RETAIN_MULT× vision (the same grace
// pickHuntTarget gives the open-world hunt commitment), and NOT beaten by a
// challenger scoring ≥ (1+PRIMARY_SWITCH_MARGIN)× its own score — the team's
// analogue of selectTarget's PULL_FRACTION aggro hysteresis, one level up.
// `sinceRound` is the round the current primary was committed; it only resets
// when the primary actually changes.
//
// Camp (v0 — superseded by M2's pullSetOf): visible enemies within
// CAMP_RADIUS of the primary. Simple and deliberately not a real aggro-chain
// prediction; documented here rather than derived.
//
// Avoid list: visible enemies outside the camp that have NOT engaged us on
// their own initiative — no live lock on one of our members, and zero threat
// built against any member (Combatant.threat is keyed by attacker id, so a
// nonzero entry means that enemy has already hit/healed against us). Derived
// fresh from live state every call, so a bystander that attacks drops off the
// list automatically the next decision round — no separate "provoked" bookkeeping.
export interface EngagementDecision {
  engagement: Engagement | null
  avoidTargetIds: string[]
}

export function decideEngagement(
  state: BattleState,
  members: Combatant[],
  enemies: Combatant[],
  threat: Record<string, number>,
  prevEngagement: Engagement | null,
): EngagementDecision {
  const sees = (e: Combatant, mult: number) =>
    members.some((m) => distance(m.pos, e.pos) <= m.visionRange * mult)
  const visible = enemies.filter((e) => !isStealthed(e) && sees(e, 1))
  if (visible.length === 0) return { engagement: null, avoidTargetIds: [] }

  const partySustained = members.reduce((sum, m) => sum + (m.capability?.sustainedDamage ?? 0), 0)
  const killScore = (e: Combatant): number => {
    const ttk = e.hp / Math.max(EPS, partySustained)
    return (threat[e.id] ?? 0) / Math.max(EPS, ttk)
  }

  let challenger = visible[0]
  let challengerScore = killScore(challenger)
  for (const e of visible) {
    const s = killScore(e)
    if (s > challengerScore + EPS || (Math.abs(s - challengerScore) <= EPS && e.id < challenger.id)) {
      challenger = e
      challengerScore = s
    }
  }

  let primary = challenger
  let sinceRound = state.round
  const incumbent = prevEngagement?.primaryId
    ? enemies.find((e) => e.id === prevEngagement!.primaryId)
    : undefined
  if (incumbent && incumbent.alive && !isStealthed(incumbent) && sees(incumbent, HUNT_RETAIN_MULT)) {
    const incumbentScore = killScore(incumbent)
    const beaten = challengerScore >= (1 + PRIMARY_SWITCH_MARGIN) * incumbentScore - EPS
    if (!beaten) {
      primary = incumbent
      sinceRound = prevEngagement!.sinceRound
    }
  }

  // Camp: visible enemies near the primary. Guard-add the primary itself in
  // case commitment hysteresis retained it just outside tight vision this
  // round (still absent from `visible`) — the pull set always includes its
  // own kill target.
  const campSet = new Set(visible.filter((e) => distance(e.pos, primary.pos) <= CAMP_RADIUS).map((e) => e.id))
  campSet.add(primary.id)
  const targetIds = [...campSet].sort()

  const memberIds = new Set(members.map((m) => m.id))
  const alreadyFighting = (e: Combatant): boolean => {
    if (e.provoked && e.lockedTargetId && memberIds.has(e.lockedTargetId)) return true
    return members.some((m) => (m.threat[e.id] ?? 0) > EPS)
  }
  const avoidTargetIds = visible
    .filter((e) => !campSet.has(e.id) && !alreadyFighting(e))
    .map((e) => e.id)
    .sort()

  return {
    engagement: { targetIds, primaryId: primary.id, anchor: null, stance: 'collapse', sinceRound },
    avoidTargetIds,
  }
}
