// Combat Tactic Engine — the team coordination planner (tactical-coordination.md).
// sense → appraise → decide → assign → publish, filling TeamPlan v2
// (engagement / assignments / avoid list). Pure and deterministic like every
// engine leaf (same discipline as plan.ts): no RNG, no store/time imports,
// inputs never mutated.

import { attackReach, distance, moveSpeedOf } from './grid'
import { effectiveStat, skillDamageEstimate } from './damage'
import { armoredFactor, hasTactic } from './tactics'
import { isStealthed } from './behavior'
import { barrierCorners, sightlineClear } from './barriers'
import { centroid } from './spatial'
import { EPS, HUNT_RETAIN_MULT } from './constants'
import {
  PRIMARY_SWITCH_MARGIN, PRIMARY_SCORE_FLOOR, ACUMEN, ENGAGE_EXIT, postureOf,
  STANCE_KITE_REACH_EDGE, ANCHOR_BARRIER_RADIUS, FRAGILITY_OUTLIER_FRACTION,
  CAMP_RADIUS, PULL_SET_CAP,
  DIRECTIVE_PULL_STRICT, DIRECTIVE_PULL_LOOSE, DIRECTIVE_WOUNDED_WEIGHT,
  DIRECTIVE_SQUISHY_SCALE, DIRECTIVE_HEALER_MULT,
} from './tuning'
import { directiveOf, type DirectiveDef } from './directives'
import type {
  Assignment, Barrier, BattleState, Combatant, Engagement, KitCapability, Stance, Team, Vec2,
} from './types'

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
  // Status strip via prototype delegation, not spread: §intel prices a masked
  // capability by running THIS function over a knownView (itself a prototype
  // view), and a `{ ...view }` spread would drop every delegated field. Reads
  // are value-identical to the old shallow copy.
  const base = c.statuses.length ? (Object.assign(Object.create(c), { statuses: [] }) as Combatant) : c
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

// §coordination M2 no-drift rule (tactical-coordination.md §3.3/§6): pullSetOf
// must predict membership with the EXACT SAME code the real aggro rules run —
// extracted here into small predicates so rallyPack (engine.ts) and pullSetOf
// (below) call the identical logic instead of two hand-rolled copies that can
// drift apart. Two aggro channels:
//
//  1. Pack-tactics rousing (was inline in rallyPack): a caller with Pack
//     Tactics, once fighting, screams for same-named kin within ITS OWN
//     vision. `callsPack` is the caller-side gate (owns the tactic at all —
//     rallyPack's real code additionally requires `self.provoked`, which
//     pullSetOf's BFS treats as implied: every unit already IN the growing
//     pull set is, by construction, about to be fighting). `packRouses` is
//     the exact per-ally test rallyPack's loop runs.
//  2. Passive acquisition (was implicit in evalTargeting → selectTarget →
//     visibleEnemiesOf): a hostile (provoked), unstealthed, living enemy whose
//     OWN vision reaches a point will, on its own turn, acquire whatever's
//     there — no call needed. `passiveAcquires` is that test, applied to the
//     anticipated fight point `at` rather than an actual live position, since
//     it's a prediction of what WOULD happen, not a replay of what did.
export function callsPack(caller: Combatant): boolean {
  return hasTactic(caller, 'pack-tactics')
}
export function packRouses(caller: Combatant, ally: Combatant): boolean {
  return ally.id !== caller.id && ally.alive && !ally.provoked
    && ally.team === caller.team && ally.name === caller.name
    && distance(caller.pos, ally.pos) <= caller.visionRange
}
export function passiveAcquires(candidate: Combatant, at: Vec2): boolean {
  return candidate.alive && candidate.provoked && !isStealthed(candidate)
    && distance(candidate.pos, at) <= candidate.visionRange
}

const byId = (a: Combatant, b: Combatant): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// §intel (tactical-coordination.md §3.7): an ENEMY's capability as this team is
// entitled to price it — the masked `knownCapability` (computeCapability over
// knownView, derived beside `capability`) when intel is set, else the true
// capability (absent intel = omniscient/legacy). Own-team reads (partySustained,
// medians, fragility) deliberately stay on the true `capability`: a unit always
// knows itself. Every enemy-appraisal read below (camp pricing, camp reach,
// squishy kill-order) goes through this one helper — no parallel re-derivations.
const appraised = (e: Combatant): KitCapability | undefined => e.knownCapability ?? e.capability

// §coordination M2 (tactical-coordination.md §3.3): who joins if we hit `seed`
// fighting near `at`? Transitive closure over the enemy team's OWN aggro rules
// (the no-drift predicates above), id-ordered BFS, capped at PULL_SET_CAP. Seed
// always included. Passive acquisition is a flat test against the fixed point
// `at` (not itself a chain — a unit only ever acts on what IT can see from
// where it stands, mirroring evalTargeting) so it's applied once up front over
// every living teammate; pack-rousing genuinely chains (a caller's position —
// and so its own reach — differs unit to unit), so that part runs as real BFS
// layers, id-ordered each layer for determinism.
export function pullSetOf(state: BattleState, seed: Combatant, at: Vec2): Combatant[] {
  const team = seed.team
  const pool = state.combatants.filter((c) => c.team === team && c.alive)
  const included = new Map<string, Combatant>([[seed.id, seed]])

  for (const cand of pool) {
    if (included.size >= PULL_SET_CAP) break
    if (included.has(cand.id)) continue
    if (passiveAcquires(cand, at)) included.set(cand.id, cand)
  }

  let frontier = [...included.values()].sort(byId)
  while (frontier.length && included.size < PULL_SET_CAP) {
    const next: Combatant[] = []
    for (const caller of frontier) {
      if (!callsPack(caller)) continue
      for (const cand of pool) {
        if (included.size >= PULL_SET_CAP) break
        if (included.has(cand.id)) continue
        if (packRouses(caller, cand)) { included.set(cand.id, cand); next.push(cand) }
      }
      if (included.size >= PULL_SET_CAP) break
    }
    frontier = next.sort(byId)
  }
  return [...included.values()].sort(byId)
}

// §coordination M2 assign (tactical-coordination.md §3.2/§3.3): centroid/median
// helpers + the puller pick — declared intent (equips the Puller tactic) first,
// else the capability query (longest reach at ≥ party-median move speed, id
// tiebreak). Both relative-to-the-party queries, never an absolute stat bar.
// `members` is always non-empty at every call site below (upstream
// members.length/visible-enemy checks), so the shared `centroid` (spatial.ts,
// null on empty) is asserted non-null rather than re-guarded here.
function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const n = s.length
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
function pickPuller(members: Combatant[]): Combatant | null {
  if (!members.length) return null
  const declared = members.filter((m) => hasTactic(m, 'puller')).sort(byId)
  if (declared.length) return declared[0]
  const medSpeed = median(members.map((m) => moveSpeedOf(m)))
  let best: Combatant | null = null
  let bestReach = -Infinity
  for (const m of members) {
    if (moveSpeedOf(m) < medSpeed - EPS) continue
    const reach = m.capability?.reach ?? 0
    if (!best || reach > bestReach + EPS || (Math.abs(reach - bestReach) <= EPS && m.id < best.id)) {
      best = m; bestReach = reach
    }
  }
  return best ?? members[0]
}

// §coordination M2 pull assignment (tactical-coordination.md §3.3): when the
// committed engagement is a single fringe target (its own pull set is just
// itself) standing near a bigger nearby cluster (a visible enemy within
// CAMP_RADIUS that ISN'T part of the committed set — i.e. approaching normally
// risks widening the fight into that cluster), route the party's best puller
// to tag it and drag it back to the anchor instead of the whole line closing
// in. `to` is computed once and reused every round the SAME puller/target pair
// holds (read from the previous plan) rather than re-centroiding on a moving
// party each round — anchor stability is the point (M3 gives it a real anchor;
// v0 is the party centroid at assignment time).
function pullAssignmentFor(
  members: Combatant[], targetIds: string[], camp: Combatant[], visible: Combatant[],
  prevAssignments: Record<string, Assignment> | undefined,
): Record<string, Assignment> | undefined {
  if (targetIds.length !== 1) return undefined
  const solo = camp[0]
  if (!solo) return undefined
  const nearBig = visible.some((e) => e.id !== solo.id && distance(e.pos, solo.pos) <= CAMP_RADIUS)
  if (!nearBig) return undefined
  const puller = pickPuller(members)
  if (!puller) return undefined
  const prev = prevAssignments?.[puller.id]
  const to = prev && prev.role === 'pull' && prev.targetId === solo.id ? prev.to : centroid(members)!
  return { [puller.id]: { role: 'pull', targetId: solo.id, to } }
}

// M4 Pull to Camp (tactical-coordination.md §3.5): puller mandatory — when
// the ambush-anchor directive actually ACHIEVED its ambush, every held
// engagement staffs a pull: the party's designated puller (declared Puller
// intent first, else the capability pick) tags the current primary and drags
// it back to the anchor, not just M2's fringe-solo case. `to` reuses the
// previous plan's point while the same puller/target pair holds (anchor
// stability), like pullAssignmentFor above.
//
// The achieved-ambush gate (review fix): a party below ACUMEN.ambush (or on
// ground with no blind corner) never gets the ambush branch in
// decideStanceAnchor — mandating the pull anyway would drag the primary to
// the party's own centroid or to a SEEING chokepoint, purposeless disruption
// below the gate ("gates only ever add intelligence"). "Achieved" is
// re-derived from the engagement's serialized fields — a `hold` line on a
// LoS-BLOCKED anchor, exactly the ambush branch's signature — so the
// committed fast path (which carries stance/anchor forward without
// recomputing) gets the identical answer with no new plan state.
function directivePullAssignment(
  state: BattleState, directive: DirectiveDef | null, members: Combatant[],
  primary: Combatant | undefined, stance: Stance, anchor: Vec2 | null,
  prevAssignments: Record<string, Assignment> | undefined,
): Record<string, Assignment> | undefined {
  if (directive?.anchorPolicy !== 'ambush' || !primary || !members.length) return undefined
  if (!anchor || stance !== 'hold' || sightlineClear(anchor, primary.pos, state.barriers)) return undefined
  const puller = pickPuller(members)
  if (!puller) return undefined
  const prev = prevAssignments?.[puller.id]
  const to = prev && prev.role === 'pull' && prev.targetId === primary.id ? prev.to : anchor
  return { [puller.id]: { role: 'pull', targetId: primary.id, to } }
}

// §coordination pricing (tactical-coordination.md §3.3): the mutual-TTK race.
// RTK (rounds-to-kill the camp) = campHp / partySustained; RTD (rounds-to-die)
// = partyHp / campSustained. Both sides are plain sums over precomputed
// KitCapability.sustainedDamage — no per-matchup scoring, matching the M1
// killScore shape so M2's pricing is "a few adds," not a new scoring pass.
function priceOf(camp: Combatant[]): { hp: number; sustained: number } {
  let hp = 0, sustained = 0
  // §intel: camp damage output is priced through `appraised` — an unknown kit
  // reads as a bare basic attacker, so a first contact can honestly over-pull.
  for (const e of camp) { hp += e.hp; sustained += appraised(e)?.sustainedDamage ?? 0 }
  return { hp, sustained }
}

// §coordination M3 stance/anchor (tactical-coordination.md §3.1/§3.2): decided
// once at COMMIT time (a fresh camp, or an existing commitment's camp actually
// changing shape — the "re-anchor" cases in decideEngagement below) and held
// for the life of the engagement; callers that are merely re-pricing an
// unchanged commitment reuse `prevEngagement.stance`/`.anchor` instead of
// calling this again. `camp`/`primary` are the commitment being formed.
//   kite  — the party out-reaches AND outruns the whole camp: deterministic
//     medians (capability.reach / moveSpeedOf) clear the camp's worst case
//     by STANCE_KITE_REACH_EDGE — win the poke war.
//   hold  — not kite-eligible, but a barrier sits within ANCHOR_BARRIER_RADIUS
//     of the party's commit centroid (v0's crude "a chokepoint exists here"
//     test): snap the anchor to the nearest vis-graph corner (barriers.ts —
//     already cached per battle, so this is no new pathfinding) that keeps a
//     clear line to the primary; no qualifying corner → the centroid itself.
//   collapse — no barrier nearby, so there's nothing worth standing on
//     (today's behavior; anchor stays null).
//
// M4 (tactical-coordination.md §3.5): the team's directive REQUESTS a stance/
// anchor emphasis ahead of the default preference order; acumen still bounds
// execution (below ACUMEN.stance nothing here runs at all; the ambush anchor
// additionally gates on ACUMEN.ambush). No directive ⇒ the shipped M3 order
// exactly (kite → hold-at-choke → collapse).
//   anchorPolicy 'choke'  + stanceBias 'hold' — prefer standing the line on a
//     nearby chokepoint even when the comp could kite (Hold the Line).
//   anchorPolicy 'ambush' — anchor behind a LoS break: the nearest vis-graph
//     corner whose sightline to the primary is BLOCKED, so the line waits out
//     of sight and pulled targets are dragged around the corner (Pull to Camp).
//     No qualifying blind corner ⇒ fall through to the default order.
//   anchorPolicy 'ground' — stand where the fight was committed (the centroid).
//   anchorPolicy 'none'   — never anchor: kite when viable, else collapse.
//   stanceBias 'collapse' — always close (Assassinate's divers).
function decideStanceAnchor(
  state: BattleState, team: Team, members: Combatant[], camp: Combatant[], primary: Combatant,
): { stance: Stance; anchor: Vec2 | null } {
  const acumen = teamAcumen(state, team)
  if (acumen < ACUMEN.stance) return { stance: 'collapse', anchor: null }
  const directive = directiveOf(state, team)
  const c = centroid(members)!
  let campMaxReach = 0, campMaxSpeed = 0
  for (const e of camp) {
    campMaxReach = Math.max(campMaxReach, appraised(e)?.reach ?? 0)   // §intel: known reach only
    campMaxSpeed = Math.max(campMaxSpeed, moveSpeedOf(e))
  }
  const medReach = median(members.map((m) => m.capability?.reach ?? 0))
  const medSpeed = median(members.map((m) => moveSpeedOf(m)))
  const kiteable = medReach >= campMaxReach + STANCE_KITE_REACH_EDGE - EPS && medSpeed >= campMaxSpeed - EPS
  const nearBarrier = state.barriers.some((b) => distToBarrier(c, b) <= ANCHOR_BARRIER_RADIUS)

  // Anchor candidates off the cached vis-graph corners: the nearest with a
  // CLEAR line to the primary (a chokepoint to stand ON) and the nearest with
  // the line BLOCKED (a sight break to hide BEHIND — the ambush spot).
  let chokeAnchor: Vec2 | null = null
  let ambushAnchor: Vec2 | null = null
  if (nearBarrier) {
    let bestChoke = Infinity, bestAmbush = Infinity
    for (const corner of barrierCorners(state.barriers)) {
      const d = distance(c, corner)
      if (sightlineClear(corner, primary.pos, state.barriers)) {
        if (d < bestChoke - EPS) { bestChoke = d; chokeAnchor = corner }
      } else if (d < bestAmbush - EPS) {
        bestAmbush = d; ambushAnchor = corner
      }
    }
  }

  // Directive requests, in their own precedence, each falling through to the
  // default order when the ground can't honor them.
  if (directive?.anchorPolicy === 'ambush' && acumen >= ACUMEN.ambush && ambushAnchor) {
    return { stance: directive.stanceBias ?? 'hold', anchor: ambushAnchor }
  }
  if (directive?.anchorPolicy === 'ground') return { stance: directive.stanceBias ?? 'hold', anchor: c }
  if (directive?.anchorPolicy === 'none') {
    return kiteable ? { stance: 'kite', anchor: c } : { stance: 'collapse', anchor: null }
  }
  if (directive?.stanceBias === 'hold' && nearBarrier) return { stance: 'hold', anchor: chokeAnchor ?? c }
  if (directive?.stanceBias === 'collapse') return { stance: 'collapse', anchor: null }

  // Shipped default order (M3): kite → hold at the choke → collapse.
  if (kiteable) return { stance: 'kite', anchor: c }
  if (!nearBarrier) return { stance: 'collapse', anchor: null }
  return { stance: 'hold', anchor: chokeAnchor ?? c }
}

function distToBarrier(p: Vec2, b: Barrier): number {
  const nx = Math.max(b.x, Math.min(p.x, b.x + b.w))
  const ny = Math.max(b.y, Math.min(p.y, b.y + b.h))
  return distance(p, { x: nx, y: ny })
}

// §coordination standing guard (tactical-coordination.md §3.2/§4): the
// party's fragility outlier — a *relative* query (top/median/outlier, never
// an absolute stat bar) so "one member much squishier than the rest" is
// detected on any comp. Parties of ≥3 only (below that, "the outlier" isn't a
// meaningful notion). NO acumen gate — protecting the squishy is baseline
// (§3.2's "assign issues a standing guard by default"). Exported so
// engine.ts's formation-slot execution can seat the SAME outlier rearmost
// without a second definition.
export function fragilityOutlier(members: Combatant[]): Combatant | null {
  if (members.length < 3) return null
  const med = median(members.map((m) => m.capability?.toughness ?? 0))
  const threshold = FRAGILITY_OUTLIER_FRACTION * med
  let worst: Combatant | null = null
  let worstT = Infinity
  for (const m of members) {
    const t = m.capability?.toughness ?? 0
    if (t >= threshold - EPS) continue
    if (t < worstT - EPS || (Math.abs(t - worstT) <= EPS && (!worst || m.id < worst.id))) { worst = m; worstT = t }
  }
  return worst
}

// Guard pick (§3.2): declared intent (equips Guardian) first, else the
// highest-toughness member excluding the outlier itself (can't guard itself)
// and the puller (already has a job) — id tiebreak.
function pickGuard(members: Combatant[], outlierId: string, pullerId: string | null): Combatant | null {
  const declared = members.filter((m) => m.id !== outlierId && m.id !== pullerId && hasTactic(m, 'guardian')).sort(byId)
  if (declared.length) return declared[0]
  let best: Combatant | null = null
  let bestT = -Infinity
  for (const m of members) {
    if (m.id === outlierId || m.id === pullerId) continue
    const t = m.capability?.toughness ?? 0
    if (t > bestT + EPS || (Math.abs(t - bestT) <= EPS && (!best || m.id < best.id))) { best = m; bestT = t }
  }
  return best
}

// M4 Protect (tactical-coordination.md §3.5): the directive FORCES the
// standing guard and aims it — 'carry' = the party's top sustained damage
// (the §3.2 protectee capability query), 'weakest' = lowest effective
// toughness, no outlier threshold required. Both relative queries, id
// tiebreak. Without a protect directive the shipped fragility-outlier rule
// decides (and may decide nothing).
function protecteeOf(members: Combatant[], directive: DirectiveDef | null): Combatant | null {
  if (!directive?.protect) return fragilityOutlier(members)
  if (members.length < 2) return null   // nobody left to do the guarding
  const wantMax = directive.protect === 'carry'
  const score = (m: Combatant) => (wantMax ? m.capability?.sustainedDamage ?? 0 : m.capability?.toughness ?? 0)
  let best: Combatant | null = null
  let bestS = wantMax ? -Infinity : Infinity
  for (const m of members) {
    const s = score(m)
    const better = wantMax ? s > bestS + EPS : s < bestS - EPS
    if (!best || better || (Math.abs(s - bestS) <= EPS && m.id < best.id)) { best = m; bestS = s }
  }
  return best
}

// Layer a standing-guard assignment on top of whatever pull assignment
// already exists (§3.3) — the one place both jobs combine before publish.
function withGuardAssignment(
  members: Combatant[], assignments: Record<string, Assignment> | undefined,
  directive: DirectiveDef | null = null,
): Record<string, Assignment> | undefined {
  const outlier = protecteeOf(members, directive)
  if (!outlier) return assignments
  const pullerId = assignments
    ? Object.keys(assignments).find((id) => assignments[id].role === 'pull') ?? null
    : null
  const guard = pickGuard(members, outlier.id, pullerId)
  if (!guard) return assignments
  return { ...(assignments ?? {}), [guard.id]: { role: 'guard', allyId: outlier.id } }
}

export interface EngagementDecision {
  engagement: Engagement | null
  avoidTargetIds: string[]
  assignments?: Record<string, Assignment>
}

// §coordination M1/M2 (tactical-coordination.md §3.1/§3.2/§3.3): the planner's
// `decide` stage for the engagement. `members` are this team's living
// combatants; `enemies` is ALL living opposing combatants, unfiltered by
// vision (this function applies its own stealth/vision rule via `sees`, the
// same one the focus pick in defaultPlanner uses). `threat` is the plan's
// per-enemy danger score. `prevAssignments` is last round's published
// assignments (read-only; only `pull` entries are consulted, for `to` reuse).
//
// Below ACUMEN.pull: exactly the M1 v0 behavior — CAMP_RADIUS proximity camp,
// no affordability test, no assignments (an unintelligent party over-pulls,
// diegetically). At/above the gate: pullSetOf-priced camps and the mutual-TTK
// race decide engage-or-not, and §5's fast path — while committed, only cheap
// abandon checks run; the wide appraise (ranking candidates, running
// pullSetOf per candidate) is skipped entirely. The gate is read fresh every
// call (teamAcumen has no memory), so a mid-fight death can drop a party (or a
// monster pack) back under the gate immediately.
export function decideEngagement(
  state: BattleState,
  team: Team,
  members: Combatant[],
  enemies: Combatant[],
  threat: Record<string, number>,
  prevEngagement: Engagement | null,
  prevAssignments?: Record<string, Assignment>,
): EngagementDecision {
  const sees = (e: Combatant, mult: number) =>
    members.some((m) => distance(m.pos, e.pos) <= m.visionRange * mult)
  const visible = enemies.filter((e) => !isStealthed(e) && sees(e, 1))
  // M4 (tactical-coordination.md §3.5): the team's active directive — plain
  // data biasing the decisions below. null (the usual case) ⇒ shipped behavior.
  const directive = directiveOf(state, team)

  // The incumbent gets the SAME retention grace pickHuntTarget gives (out to
  // HUNT_RETAIN_MULT× vision) checked independently of the plain-vision `visible`
  // set — otherwise a primary that has drifted just past 1× vision with nothing
  // else around (visible.length === 0) would hit the "nothing visible" bail below
  // before this check ever ran, dropping the commitment the grace period exists
  // to preserve.
  const incumbent = prevEngagement?.primaryId
    ? enemies.find((e) => e.id === prevEngagement!.primaryId)
    : undefined
  const incumbentRetainable = !!(
    incumbent && incumbent.alive && !isStealthed(incumbent) && sees(incumbent, HUNT_RETAIN_MULT)
  )

  if (visible.length === 0) {
    if (!incumbentRetainable) return { engagement: null, avoidTargetIds: [] }
    // Nothing at plain vision, but the incumbent is still within the grace
    // radius — hold the commitment with no challenger to weigh it against.
    // Pure continuation (no re-anchor): carry the stance/anchor forward
    // unchanged rather than recomputing (§3.1 — stance is decided at commit
    // and held for the engagement's life).
    const heldAssignments = withGuardAssignment(members, undefined, directive)
    return {
      engagement: {
        targetIds: [incumbent!.id], primaryId: incumbent!.id,
        anchor: prevEngagement!.anchor ?? null, stance: prevEngagement!.stance ?? 'collapse',
        sinceRound: prevEngagement!.sinceRound,
      },
      avoidTargetIds: [],
      ...(heldAssignments ? { assignments: heldAssignments } : {}),
    }
  }

  const partySustained = members.reduce((sum, m) => sum + (m.capability?.sustainedDamage ?? 0), 0)
  // Kill-order score. Default policy 'dangerous' = the shipped M1 shape
  // (threat ÷ time-to-kill). M4 directives flip the policy (§3.3/§3.5) —
  // ungated like the M1 baseline (same cost, and the hysteresis machinery
  // below is policy-agnostic since it only ever compares scores):
  //   'wounded' — the dangerous score bent toward whatever is bleeding
  //     (× (1 + w·(1 − hpFrac)); identical ordering at full HP).
  //   'squishy' — how fast can the party delete it: sustained ÷ effective
  //     toughness, healers first (the existing Assassinate pick, §3.5), threat
  //     deliberately ignored. Scaled onto the killScore range so the
  //     PRIMARY_SCORE_FLOOR / SWITCH_MARGIN hysteresis behaves unchanged.
  const policy = directive?.targetPolicy ?? 'dangerous'
  const killScore = (e: Combatant): number => {
    if (policy === 'squishy') {
      // §intel: healer-flag and toughness read what we KNOW about the target.
      const known = appraised(e)
      const toughness = Math.max(EPS, known?.toughness ?? e.maxHp)
      return (known?.hasHeal ? DIRECTIVE_HEALER_MULT : 1) * DIRECTIVE_SQUISHY_SCALE * partySustained / toughness
    }
    const ttk = e.hp / Math.max(EPS, partySustained)
    const base = (threat[e.id] ?? 0) / Math.max(EPS, ttk)
    if (policy === 'wounded') return base * (1 + DIRECTIVE_WOUNDED_WEIGHT * (1 - e.hp / Math.max(EPS, e.maxHp)))
    return base
  }
  const memberIds = new Set(members.map((m) => m.id))
  const alreadyFighting = (e: Combatant): boolean => {
    if (e.provoked && e.lockedTargetId && memberIds.has(e.lockedTargetId)) return true
    return members.some((m) => (m.threat[e.id] ?? 0) > EPS)
  }

  if (teamAcumen(state, team) < ACUMEN.pull) {
    // ── v0 (M1, unchanged): kill-order pick with hysteresis, CAMP_RADIUS camp.
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
    if (incumbentRetainable) {
      const incumbentScore = killScore(incumbent!)
      const beaten = challengerScore >= (1 + PRIMARY_SWITCH_MARGIN) * Math.max(PRIMARY_SCORE_FLOOR, incumbentScore) - EPS
      if (!beaten) primary = incumbent!
    }
    const sinceRound = prevEngagement && primary.id === prevEngagement.primaryId
      ? prevEngagement.sinceRound
      : state.round

    const campSet = new Set(visible.filter((e) => distance(e.pos, primary.pos) <= CAMP_RADIUS).map((e) => e.id))
    campSet.add(primary.id)
    const targetIds = [...campSet].sort()
    const avoidTargetIds = visible
      .filter((e) => !campSet.has(e.id) && !alreadyFighting(e))
      .map((e) => e.id)
      .sort()

    // Standing guard is NOT gated on acumen (§3.2 — "protecting the squishy
    // is baseline"), so it applies even to a v0 (below ACUMEN.pull) party;
    // stance/anchor stay 'collapse'/null here regardless — ACUMEN.stance(90)
    // is strictly above ACUMEN.pull(50), so a party that hasn't cleared the
    // lower gate can't have cleared the higher one either.
    const v0Assignments = withGuardAssignment(members, undefined, directive)
    return {
      engagement: { targetIds, primaryId: primary.id, anchor: null, stance: 'collapse', sinceRound },
      avoidTargetIds,
      ...(v0Assignments ? { assignments: v0Assignments } : {}),
    }
  }

  // ── M2 (gated on ACUMEN.pull): pullSetOf camps + the mutual-TTK race.
  const partyHp = members.reduce((sum, m) => sum + m.hp, 0)
  // M4 (tactical-coordination.md §3.5): pullDiscipline scales the posture-
  // blended margin — strict demands a more comfortable win, loose takes nearer
  // coin-flips. No directive ⇒ ×1, the shipped margin exactly.
  const discipline = directive?.pullDiscipline === 'strict' ? DIRECTIVE_PULL_STRICT
    : directive?.pullDiscipline === 'loose' ? DIRECTIVE_PULL_LOOSE : 1
  const pullMargin = discipline * members.reduce((sum, m) => sum + postureOf(m).pullMargin, 0) / Math.max(1, members.length)
  const affordable = (camp: Combatant[]): boolean => {
    // A camp that filled the prediction cap is a TRUNCATED prediction — the
    // real pull (reality doesn't cap) is at least this big and probably
    // bigger, so the price is an undercount. Refuse rather than trust it
    // (review finding: the undercounted-over-pull hole).
    if (camp.length >= PULL_SET_CAP) return false
    const { hp, sustained } = priceOf(camp)
    const rtk = hp / Math.max(EPS, partySustained)
    const rtd = partyHp / Math.max(EPS, sustained)
    return rtk + EPS < rtd * pullMargin
  }

  // §5 commitment fast path: while an engagement is held, run ONLY the cheap
  // abandon checks (a stored-id sum + a linear over-pull scan) — the wide
  // appraise (ranking every visible candidate, running pullSetOf per one) is
  // skipped entirely unless a break condition actually fires.
  if (prevEngagement) {
    const campNow = prevEngagement.targetIds
      .map((id) => enemies.find((e) => e.id === id))
      .filter((e): e is Combatant => !!e)
    const primaryAlive = !!prevEngagement.primaryId && enemies.some((e) => e.id === prevEngagement!.primaryId)

    // (a) primary dead AND the whole committed set is dead: nothing left to
    // hold — drop and fall straight into the full appraise below (same round).
    if (!(campNow.length === 0)) {
      // (c) over-pull materialized: a visible foe outside targetIds already has
      // threat/a lock on a member (it joined uninvited) — re-anchor once from
      // the primary (or any surviving camp member) and re-price the fresh set.
      const targetSet = new Set(prevEngagement.targetIds)
      const uninvited = visible.find((e) => !targetSet.has(e.id) && alreadyFighting(e))
      let ids = prevEngagement.targetIds
      let camp = campNow
      if (uninvited) {
        const seedFrom = campNow.find((e) => e.id === prevEngagement!.primaryId) ?? campNow[0]
        camp = pullSetOf(state, seedFrom, seedFrom.pos)
        ids = camp.map((e) => e.id).sort()
      }

      // (b) live re-price loses by more than the exit hysteresis → abandon. A
      // re-anchored set that filled the cap is a truncated undercount (see
      // `affordable`) — the real fight is at least that big, so it counts as
      // losing too.
      const { hp, sustained } = priceOf(camp)
      const rtk = hp / Math.max(EPS, partySustained)
      const rtd = partyHp / Math.max(EPS, sustained)
      const losing = camp.length >= PULL_SET_CAP || rtk > rtd * pullMargin * ENGAGE_EXIT + EPS

      if (!losing) {
        let primaryId = primaryAlive ? prevEngagement.primaryId! : null
        if (!primaryId) {
          let best: Combatant | null = null
          let bestS = -Infinity
          for (const e of camp) {
            const s = killScore(e)
            if (!best || s > bestS + EPS || (Math.abs(s - bestS) <= EPS && e.id < best.id)) { best = e; bestS = s }
          }
          primaryId = best ? best.id : ids[0]
        }
        const sinceRound = primaryId === prevEngagement.primaryId ? prevEngagement.sinceRound : state.round
        const avoidTargetIds = visible.filter((e) => !ids.includes(e.id) && !alreadyFighting(e)).map((e) => e.id).sort()
        // §3.1 stance/anchor: an `uninvited` join actually changed the camp's
        // shape — that's the "engagement itself re-anchors" case, so recompute.
        // A pure re-price (same camp, same primary) carries the prior
        // commitment's stance/anchor forward unchanged.
        const primaryCombatant = camp.find((e) => e.id === primaryId)
        const { stance, anchor } = uninvited && primaryCombatant
          ? decideStanceAnchor(state, team, members, camp, primaryCombatant)
          : { stance: prevEngagement.stance ?? 'collapse', anchor: prevEngagement.anchor ?? null }
        const pull = directivePullAssignment(state, directive, members, primaryCombatant, stance, anchor, prevAssignments)
          ?? pullAssignmentFor(members, ids, camp, visible, prevAssignments)
        const assignments = withGuardAssignment(members, pull, directive)
        return {
          engagement: { targetIds: ids, primaryId, anchor, stance, sinceRound },
          avoidTargetIds,
          ...(assignments ? { assignments } : {}),
        }
      }
      // losing the race → commitment broken, fall through to the full appraise.
    }
  }

  // Full appraise: rank visible candidates by kill-order score (best/most
  // killable first, id tiebreak), take the first whose pullSetOf camp is
  // affordable. Because `ranked` already enumerates every visible enemy —
  // including any fringe straggler whose own pull set is just itself — this
  // ONE pass also covers the "cheapest affordable solo target" case with no
  // second loop: a straggler's camp is `[straggler]`, so it's tried (and, if
  // affordable, wins) like any other candidate, just at its own kill-order
  // rank. Nothing affordable at all → no engagement, but avoid every visible
  // foe not already fighting us.
  const ranked = [...visible].sort((a, b) => {
    const d = killScore(b) - killScore(a)
    return Math.abs(d) > EPS ? d : (a.id < b.id ? -1 : 1)
  })

  let chosenCamp: Combatant[] | null = null
  let chosenPrimary: Combatant | null = null
  for (const cand of ranked) {
    const camp = pullSetOf(state, cand, cand.pos)
    if (affordable(camp)) { chosenCamp = camp; chosenPrimary = cand; break }
  }

  if (!chosenCamp || !chosenPrimary) {
    const avoidTargetIds = visible.filter((e) => !alreadyFighting(e)).map((e) => e.id).sort()
    return { engagement: null, avoidTargetIds }
  }

  const targetIds = chosenCamp.map((e) => e.id).sort()
  const sinceRound = prevEngagement && chosenPrimary.id === prevEngagement.primaryId ? prevEngagement.sinceRound : state.round
  const avoidTargetIds = visible.filter((e) => !targetIds.includes(e.id) && !alreadyFighting(e)).map((e) => e.id).sort()
  // Fresh commit: decide stance + anchor for real (tactical-coordination.md §3.1/§3.2).
  const { stance, anchor } = decideStanceAnchor(state, team, members, chosenCamp, chosenPrimary)
  const freshPull = directivePullAssignment(state, directive, members, chosenPrimary, stance, anchor, prevAssignments)
    ?? pullAssignmentFor(members, targetIds, chosenCamp, visible, prevAssignments)
  const assignments = withGuardAssignment(members, freshPull, directive)

  return {
    engagement: { targetIds, primaryId: chosenPrimary.id, anchor, stance, sinceRound },
    avoidTargetIds,
    ...(assignments ? { assignments } : {}),
  }
}

// §coordination M4 — the ambush-combo orchestrator (tactical-coordination.md
// §3.5): under a directive with `ambushTiming` (Assassinate), a CLOAKED unit
// carrying a ready stealth-opener (an attack with a stealthBonus — Back Stab)
// is timed by the PLAN: it stalks the engagement's primary and holds every
// action (nothing may break the cloak — no basic shots, no other casts) until
// the opener is in range, then the normal action channel fires the opener from
// stealth. Closes the backlog's "Ambush combo needs an orchestrator" gap.
//
// Gated on ACUMEN.ambush (a directive requests; acumen bounds — a dim party
// carrying Assassinate reveals early exactly like today). Read by engine.ts's
// takeTurn each turn (cheap: bails on the first check for every non-cloaked /
// non-directive unit). Deterministic pure read — the opener pick is the first
// qualifying skill in kit order.
export interface CloakStalk {
  targetId: string     // the plan's primary — the stalker aims its lock here
  holdFire: boolean    // true while the opener is still out of range
}
export function cloakStalk(state: BattleState, self: Combatant): CloakStalk | null {
  const directive = directiveOf(state, self.team)
  if (!directive?.ambushTiming) return null
  if (!isStealthed(self)) return null
  const opener = self.skills.find((s) =>
    s.type === 'attack' && (s.stealthBonus ?? 1) > 1 && (self.skillCooldowns[s.id] ?? 0) <= 0)
  if (!opener) return null
  const primaryId = state.plans[self.team]?.engagement?.primaryId
  if (!primaryId) return null
  const primary = state.combatants.find((c) => c.id === primaryId && c.alive)
  if (!primary) return null
  if (teamAcumen(state, self.team) < ACUMEN.ambush) return null
  return { targetId: primary.id, holdFire: distance(self.pos, primary.pos) > opener.range + EPS }
}
