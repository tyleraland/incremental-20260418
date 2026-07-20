// Combat Tactic Engine — base behavior (spec §4.1, §5.3 defaults, §16.8).
// This is what a unit does with ZERO tactics equipped: walk toward the nearest
// enemy, keep a locked target, and use naive skill intelligence (heal the hurt,
// otherwise attack). Equipped tactics override these defaults per channel.

import { distance, attackReach } from './grid'
import { sightlineClear } from './barriers'
import { isCaster, visibleEnemiesOf } from './spatial'
import type { BattleState, Combatant, EngineSkill, Vec2 } from './types'
import { EPS } from './constants'

// ALL living foes, UNFILTERED by perception — for the physical questions only:
// AoE splash (hits whoever's in the blast), blast-count, and the win-check. For
// "who can this unit target/engage", use visibleEnemiesOf (spatial.ts), the
// single fog-of-war-gated predicate. Don't add a vision/stealth filter here.
// Neutral NPCs (town merchants/questgivers) are nobody's foe — never splashed,
// never counted — so they're excluded here too.
export function livingEnemies(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team !== self.team && c.team !== 'neutral')
}

export function isStealthed(c: Combatant): boolean {
  return c.statuses.some((s) => s.flags.includes('stealthed'))
}

export function livingAllies(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team === self.team)
}

export function findCombatant(state: BattleState, id: string | null): Combatant | null {
  if (!id) return null
  return state.combatants.find((c) => c.id === id) ?? null
}

// §threat — the default targeting fallback (below the player's/monster's
// targeting *tactics*, above nothing). It blends two optional inputs into one
// score per visible foe and locks the best, with hysteresis so aggro is sticky:
//   score = threat·THREAT_WEIGHT − distance·PROX_WEIGHT
// • Accumulated threat (damage + healing) is the primary pull — a tank holding
//   high threat keeps the mob even when the kiter is closer.
// • Proximity is the secondary input, and the *only* one early on: before anyone
//   has dealt damage every threat is 0, so the fight opens on the nearest foe
//   (the old behaviour) and only becomes threat-driven once damage flows.
// A still-valid current lock is kept unless another foe beats it by PULL_FRACTION
// of the current target's threat (WoW's "exceed by X% to pull") — so the loser of
// a close race doesn't thrash, and the kiter only steals aggro once it's clearly
// out-threated the tank. Returns the previous target id when it changed.
const THREAT_WEIGHT = 1
const PROX_WEIGHT = 1
const PULL_FRACTION = 0.25   // must beat the current target by 25% of its threat to pull
const PULL_FLOOR = 1         // ...but always allow a small absolute swing (early game)
// §coordination M1 (tactical-coordination.md §3.4): a flat bonus added to the
// score of the enemy matching the team's `engagement.primaryId`, so idle/fresh
// units (no accumulated threat yet) converge fire on the kill-order pick by
// default instead of splitting across whatever's nearest. Deliberately small
// relative to real combat threat (raw damage dealt, easily tens of points after
// one hit) — it only breaks ties/near-ties among threat-less candidates and
// nudges close calls; it must NOT be able to out-pull an already-engaged
// target through the PULL_FRACTION hysteresis below (the tank keeps aggro).
// Raised from an original 3 (tactical-coordination showcase review): at 3 the
// bonus couldn't out-score even a MODEST distance gap — a threat-less unit
// standing adjacent (dist ~1) to trash never let go of it for a genuinely
// dangerous primary just 5-8 cells farther, so "dangerous-first" convergence
// only ever looked real when the primary happened to be the closest thing
// anyway (see `focus-fire` showcase). 5 is the smallest value that reliably
// pulls idle/fresh units off adjacent trash onto a primary that far away
// (empirically ~4.2-4.4 cells farther in that scene) while staying far below
// any real accrued `self.threat` a committed tank would be holding (PULL_FRACTION's
// slack scales with that threat directly, not with this constant — see
// behavior.test's "tank keeps aggro", which holds at this value with a huge
// margin: a tank's accrued threat is easily 100+, and 5 can't touch that).
const FOCUS_WEIGHT = 5

export function selectTarget(state: BattleState, self: Combatant): string | null {
  const enemies = visibleEnemiesOf(state, self)
  if (enemies.length === 0) {
    const prev = self.lockedTargetId
    self.lockedTargetId = null
    return prev
  }

  // §coordination M1/M2: read the team plan (absent ⇒ today's scoring exactly —
  // no plan, no engagement, no avoid list). Avoid-listed foes are excluded from
  // the CANDIDATE pool; hard taunt is handled entirely upstream in
  // evalTargeting and never reaches this function.
  const plan = state.plans?.[self.team]
  const avoid = plan?.avoidTargetIds
  const filtered = avoid && avoid.length ? enemies.filter((e) => !avoid.includes(e.id)) : enemies
  // §coordination M2 (tactical-coordination.md §3.3): when EVERY visible foe is
  // avoid-listed — the whole visible set priced unaffordable, so there's no
  // engagement to fight at all — give up the lock rather than falling back to
  // attacking one of them anyway. That fallback predates M2: under the old M1
  // shape the avoid list only ever held bystanders OUTSIDE an existing camp, so
  // a real (non-avoided) primary/camp target was always present too and
  // `filtered` could never actually empty out this way. Under M2 an empty
  // `filtered` means "the party correctly decided this fight isn't worth it" —
  // picking a target here is exactly the over-pull the avoid list exists to
  // prevent (the "kills the stray, then walks into the pack it was supposed to
  // leave alone" bug). No plan/avoid list at all ⇒ `filtered === enemies`,
  // never empty, so this never fires pre-M1 or with an absent plan.
  if (avoid && avoid.length && filtered.length === 0) {
    const prev = self.lockedTargetId
    self.lockedTargetId = null
    return prev
  }
  const candidates = filtered
  const isAvoided = (id: string) => !!avoid && avoid.includes(id)

  // §coordination M2 (tactical-coordination.md §3.3/§3.7): a unit carrying a
  // `pull` assignment fights its OWN tagged target, not the team's shared
  // primary — the FOCUS bonus below applies to the assignment target instead
  // of `engagement.primaryId` for exactly this unit. Minimal by design: same
  // bonus, same hysteresis, just a different id when a pull assignment exists.
  const assignment = plan?.assignments?.[self.id]
  const pullTargetId = assignment?.role === 'pull' ? assignment.targetId : null
  const primaryId = pullTargetId ?? plan?.engagement?.primaryId ?? null
  const score = (e: Combatant) =>
    (self.threat[e.id] ?? 0) * THREAT_WEIGHT - distance(self.pos, e.pos) * PROX_WEIGHT + (e.id === primaryId ? FOCUS_WEIGHT : 0)
  let best = candidates[0]
  let bestS = score(best)
  for (const e of candidates) {
    const s = score(e)
    if (s > bestS + EPS || (Math.abs(s - bestS) <= EPS && e.id < best.id)) {
      best = e
      bestS = s
    }
  }

  // Hysteresis: keep a still-valid current lock unless `best` clears the pull
  // margin (scaled by how much threat the current target holds). A cloaked target
  // is lost (can't be seen), so it falls through to a fresh pick. An avoided
  // current lock doesn't get this protection (when a real alternative exists) —
  // it's still excluded the same as it would be from a fresh pick.
  const cur = findCombatant(state, self.lockedTargetId)
  if (cur && cur.alive && !isStealthed(cur) && cur !== best && !isAvoided(cur.id)) {
    const slack = PULL_FRACTION * Math.max(PULL_FLOOR, self.threat[cur.id] ?? 0)
    if (bestS <= score(cur) + slack) best = cur
  }

  const prev = self.lockedTargetId
  self.lockedTargetId = best.id
  return prev !== best.id ? prev : null
}

export type Action =
  | { kind: 'heal'; skill: EngineSkill; targetId: string }
  | { kind: 'skill'; skill: EngineSkill; targetId: string }
  | { kind: 'basic'; targetId: string }

function ready(self: Combatant, skill: EngineSkill): boolean {
  return (self.skillCooldowns[skill.id] ?? 0) <= 0
}

// §4.1 naive skill usage for the skill types the core supports (attack, heal).
// Other types fall through to a basic attack; equipped tactics/skills override this.
export function chooseAction(state: BattleState, self: Combatant): Action | null {
  // Turtling (Shield Wall): hold attacks while the shield status is active.
  if (self.statuses.some((s) => s.flags.includes('shielded'))) return null

  // heal: most-injured ally below full HP, within range, heal off cooldown
  const healSkill = self.skills.find((s) => s.type === 'heal' && ready(self, s))
  if (healSkill) {
    const ally = mostInjuredAllyInRange(state, self, healSkill.range)
    if (ally) return { kind: 'heal', skill: healSkill, targetId: ally.id }
  }

  const target = findCombatant(state, self.lockedTargetId)
  if (!target || !target.alive) return null

  const d = distance(self.pos, target.pos)
  if (d > attackReach(self) + EPS) return null   // moved this turn but not yet in range
  // Walls block ranged sight; melee adjacency implies line of sight.
  const isRanged = self.rangedRange > 0
  if (isRanged && !sightlineClear(self.pos, target.pos, state.barriers)) return null

  const atkSkill = self.skills.find(
    (s) => s.type === 'attack' && ready(self, s) && d <= s.range + EPS,
  )
  if (atkSkill) return { kind: 'skill', skill: atkSkill, targetId: target.id }
  // Casters don't have a basic-ranged attack — spells only. If none are ready
  // or in range, they wait (and their kite logic backs them off, see
  // `kiteDistanceFor`). Generalised via `isCaster` so monster casters get the
  // same treatment without per-unit configuration.
  if (isCaster(self)) return null
  return { kind: 'basic', targetId: target.id }
}

// `at` = the position the heal's reach is measured from (defaults to where the
// unit stands); the movement-planning forecast passes a hypothetical position.
export function mostInjuredAllyInRange(
  state: BattleState,
  self: Combatant,
  range: number,
  at: Vec2 = self.pos,
): Combatant | null {
  let best: Combatant | null = null
  let bestRatio = 1
  for (const a of livingAllies(state, self)) {
    if (a.hp >= a.maxHp) continue
    if (distance(at, a.pos) > range + EPS) continue
    const ratio = a.hp / a.maxHp
    if (best === null || ratio < bestRatio - EPS || (Math.abs(ratio - bestRatio) <= EPS && a.id < best.id)) {
      best = a
      bestRatio = ratio
    }
  }
  return best
}
