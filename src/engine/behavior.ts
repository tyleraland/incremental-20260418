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

export function selectTarget(state: BattleState, self: Combatant): string | null {
  const enemies = visibleEnemiesOf(state, self)
  if (enemies.length === 0) {
    const prev = self.lockedTargetId
    self.lockedTargetId = null
    return prev
  }

  const score = (e: Combatant) => (self.threat[e.id] ?? 0) * THREAT_WEIGHT - distance(self.pos, e.pos) * PROX_WEIGHT
  let best = enemies[0]
  let bestS = score(best)
  for (const e of enemies) {
    const s = score(e)
    if (s > bestS + EPS || (Math.abs(s - bestS) <= EPS && e.id < best.id)) {
      best = e
      bestS = s
    }
  }

  // Hysteresis: keep a still-valid current lock unless `best` clears the pull
  // margin (scaled by how much threat the current target holds). A cloaked target
  // is lost (can't be seen), so it falls through to a fresh pick.
  const cur = findCombatant(state, self.lockedTargetId)
  if (cur && cur.alive && !isStealthed(cur) && cur !== best) {
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
