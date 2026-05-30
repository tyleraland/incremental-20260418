// Combat Tactic Engine — round resolution (spec §9, §10, §11, §16).
//
// Deterministic, round-based, grid autobattle. `createBattle` clones the input
// roster (never mutating it, §16.5); `advanceRound` resolves exactly one round
// in place so the host can step combat "one round per N ticks"; `resolve` runs
// to completion for tests and bulk/idle resolution.

import {
  COLS, ROWS, MAX_ROUNDS, EPS, STEALTH_ATTACK_BONUS,
  WANDER_REPATH, MONSTER_WANDER_MIN, MONSTER_WANDER_MAX, MONSTER_WANDER_NEAR, MONSTER_WANDER_FAR,
  WANDER_SPEED_MULT, WANDER_MARGIN, MONSTER_EDGE_MARGIN,
} from './constants'
import { setArenaBounds, arenaClamp } from './arena'
import { startingPosition, moveToward, moveTowardPoint, attackReach, moveSpeedOf, distance, clampToGrid, enforceSeparation } from './grid'
import { defaultCalculateDamage, calculateHeal, effectiveStat } from './damage'
import {
  selectTarget, chooseAction, findCombatant, livingEnemies, livingAllies, isStealthed,
} from './behavior'
import {
  resolveTactics, chargerBonus, armoredFactor, nimblePeriod,
} from './tactics'
import { makeSkillTactic, isChanneledAoe } from './skills'
import { buildStatus } from './status'
import { elementMultiplier } from './elements'
import { nearestEnemyTo, isCaster, kiteDistanceFor, cohesionVec } from './spatial'

// Weight applied to the cohesion bias when a unit is moving AWAY from enemies
// (kite retreat or retreater fall-back). Kept light — the back-off direction
// still dominates, cohesion just curves it toward the party so a healer doesn't
// strand themselves behind the front line.
const COHESION_WEIGHT = 0.35
import { traceMove, slideMove, sightlineClear, steerAround } from './barriers'
import type {
  BattleState, BattleResult, BattleStats, Combatant, CombatSetup,
  EngineUnitInput, Outcome, Team, BattleEvent, EngineSkill, Element,
  ResolvedTactic, TacticRef, MovementResult, ReactionResult, ActionResult, Vec2,
  TeamPlan, Planner,
} from './types'

// Deterministic [0,1) hash of an integer — seeds open-world wander choices
// (lurk duration, hop direction) without an RNG, so replays stay deterministic.
function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 4294967296
}

function monsterDwell(seed: number): number {
  const span = MONSTER_WANDER_MAX - MONSTER_WANDER_MIN + 1
  return MONSTER_WANDER_MIN + Math.floor(hash01(seed) * span)
}

function emptyStats(): BattleStats {
  return {
    totalDamageByUnit: {},
    totalHealingByUnit: {},
    killsByUnit: {},
    skillsUsedByUnit: {},
    potionsConsumed: 0,
  }
}

function makeCombatant(input: EngineUnitInput, index: number, pos: { x: number; y: number }, tactics: ResolvedTactic[]): Combatant {
  const skills = input.skills.map((s) => ({ ...s }))   // clone so the engine never mutates input
  // "Skills give you tactics": each equipped skill becomes an action-channel
  // tactic, appended below the player's explicit tactics (lower priority) so
  // behavioural tactics still steer targeting/movement around the cast (§5).
  // Long-channel AoE (Lightning Storm) is evaluated *before* single-target nukes
  // so a good area opportunity wins — its own gate (cluster + safety) makes it
  // yield back to the single-target cast when an AoE wouldn't pay off, so it
  // never wastes the long channel on a lone target.
  const ordered = [...skills.filter(isChanneledAoe), ...skills.filter((s) => !isChanneledAoe(s))]
  const skillTactics: ResolvedTactic[] = ordered.map((sk) => ({ def: makeSkillTactic(sk), rank: 1 }))
  return {
    id: input.id,
    name: input.name,
    team: input.team,
    index,
    str: input.str,
    def: input.def,
    int: input.int,
    spd: input.spd,
    moveSpeed: input.moveSpeed,
    maxHp: input.maxHp,
    hp: input.hp,
    alive: input.hp > 0,
    pos: { x: pos.x, y: pos.y },
    // Face the opposing edge to start: players (bottom) look up, enemies down.
    facing: { x: 0, y: input.team === 'player' ? 1 : -1 },
    moving: false,
    preferredRank: input.preferredRank,
    meleeRange: input.meleeRange,
    rangedRange: input.rangedRange,
    attackElement: input.attackElement ?? 'neutral',
    armorElement: input.armorElement ?? 'neutral',
    skills,
    skillCooldowns: {},
    statuses: [],
    lockedTargetId: null,
    potionsLeft: input.potions ?? 0,
    tactics: [...tactics, ...skillTactics],
    tacticCooldowns: {},
    tacticsUsed: [],
    chargeUsed: false,
    attacksReceived: 0,
    lastHitById: null,
    channel: null,
    interruptedCount: 0,
    visionRange: input.visionRange ?? Infinity,
    wanderTarget: null,
    // Monsters lurk a (deterministic) few rounds before their first hop; heroes
    // don't use the dwell timer (they roam toward the team waypoint).
    wanderDwell: input.team === 'enemy' ? monsterDwell(index + 1) : 0,
    trace: [],
  }
}

export function createBattle(setup: CombatSetup): BattleState {
  const cols = setup.cols ?? COLS
  const rows = setup.rows ?? ROWS
  setArenaBounds(cols, rows)   // so startingPosition/clamp use this battle's bounds
  const combatants: Combatant[] = []
  let index = 0
  const place = (units: EngineUnitInput[], team: Team, party?: TacticRef[]) => {
    const perRank: Record<string, number> = {}
    units.forEach((u) => {
      const withinRank = perRank[u.preferredRank] ?? 0
      perRank[u.preferredRank] = withinRank + 1
      const pos = startingPosition(team, u.preferredRank, withinRank)
      const tactics = resolveTactics(u.tactics, party)
      combatants.push(makeCombatant({ ...u, team }, index++, pos, tactics))
    })
  }
  place(setup.playerUnits, 'player', setup.playerPartyTactics)
  place(setup.enemyUnits, 'enemy', setup.enemyPartyTactics)

  return {
    combatants,
    zones: [],
    barriers: setup.barriers ?? [],
    cols,
    rows,
    mode: setup.mode ?? 'encounter',
    plans: {},
    planner: setup.planner ?? defaultPlanner,
    round: 0,
    outcome: 'ongoing',
    events: [],
    stats: emptyStats(),
    maxRounds: setup.maxRounds ?? MAX_ROUNDS,
    collectEvents: setup.collectEvents ?? true,
    calculateDamage: setup.callbacks?.calculateDamage ?? defaultCalculateDamage,
  }
}

// Inject a combatant into an already-running battle (§open-world). Used for
// open-world reinforcements (a monster wandering in) and heroes re-joining a
// persistent battle after recovery. Mirrors `createBattle`'s placement: a fresh
// stable index (seeds damage variation), a formation slot at the team's edge,
// and separation against whoever's already standing there. Emits a `spawn`
// event so the viewer can flash the arrival.
export function addCombatant(
  state: BattleState,
  input: EngineUnitInput,
  team: Team,
  partyTactics?: TacticRef[],
  at?: Vec2,                 // explicit spawn position (open-world scatter); else formation slot
): Combatant {
  setArenaBounds(state.cols, state.rows)
  const index = state.combatants.reduce((m, c) => Math.max(m, c.index), -1) + 1
  const sameRank = state.combatants.filter(
    (c) => c.team === team && c.preferredRank === input.preferredRank,
  ).length
  const pos = at ? arenaClamp(at) : startingPosition(team, input.preferredRank, sameRank)
  const tactics = resolveTactics(input.tactics ?? [], partyTactics)
  const c = makeCombatant({ ...input, team }, index, pos, tactics)
  enforceSeparation(c, state.combatants, state.barriers)
  state.combatants.push(c)
  emit(state, { round: state.round, type: 'spawn', sourceId: c.id, position: { ...c.pos } })
  return c
}

function emit(state: BattleState, e: BattleEvent): void {
  if (state.collectEvents) state.events.push(e)
}

function addStat(map: Record<string, number>, id: string, n: number): void {
  map[id] = (map[id] ?? 0) + n
}

// Apply damage, record stats, and handle death + lock cleanup (§9.1 f).
// Takes an attacker id (not a Combatant) so DoT/zone ticks can attribute damage
// to a source that may no longer be alive.
function applyDamageRaw(
  state: BattleState,
  attackerId: string,
  target: Combatant,
  amount: number,
): void {
  target.hp = Math.max(0, target.hp - amount)
  // §3 stealth: taking damage drops a cloak. Single-target attacks can't even
  // pick a hidden unit, so in practice this is AoE / ground-zone / DoT splash
  // "disrupting" the cloak — the hidden unit pops back into view.
  if (amount > 0 && target.statuses.length) breakStealth(state, target)
  addStat(state.stats.totalDamageByUnit, attackerId, amount)
  if (target.hp <= 0 && target.alive) {
    target.alive = false
    addStat(state.stats.killsByUnit, attackerId, 1)
    emit(state, { round: state.round, type: 'unit_death', sourceId: attackerId, targetId: target.id })
    // Clear any locks pointing at the now-dead unit.
    for (const c of state.combatants) {
      if (c.lockedTargetId === target.id) c.lockedTargetId = null
    }
  }
}

// Damage-over-time / zone tick: emits a 'dot' marker then applies the hit.
function applyTickDamage(state: BattleState, sourceId: string, target: Combatant, amount: number, label: string): void {
  if (!target.alive || amount <= 0) return
  const dmg = Math.max(1, Math.floor(amount))
  emit(state, { round: state.round, type: 'dot', sourceId, targetId: target.id, value: dmg, extra: { label } })
  applyDamageRaw(state, sourceId, target, dmg)
}

// Push a target away from the caster (knockback) and disrupt any cast it had.
function knockbackTarget(state: BattleState, caster: Combatant, target: Combatant, rows: number): void {
  const dx = target.pos.x - caster.pos.x
  const dy = target.pos.y - caster.pos.y
  const d = Math.hypot(dx, dy) || 1
  const before = { ...target.pos }
  // §2 a barrier stops the shove: trace to the wall, never through it.
  target.pos = traceMove(target.pos, { x: target.pos.x + (dx / d) * rows, y: target.pos.y + (dy / d) * rows }, state.barriers)
  enforceSeparation(target, state.combatants, state.barriers)
  if (target.pos.x !== before.x || target.pos.y !== before.y) {
    emit(state, { round: state.round, type: 'knockback', sourceId: caster.id, targetId: target.id, position: { ...target.pos } })
  }
  if (target.channel) {
    emit(state, { round: state.round, type: 'interrupt', sourceId: caster.id, targetId: target.id, extra: { skillId: target.channel.skillId } })
    target.channel = null
    target.interruptedCount += 1
  }
}

// Step the caster back toward its own edge after a cast (Firewall, Ankle Snare).
function retreatCaster(state: BattleState, self: Combatant, rows: number): void {
  const dir = self.team === 'player' ? -1 : 1
  const before = { ...self.pos }
  self.pos = traceMove(self.pos, { x: self.pos.x, y: self.pos.y + dir * rows }, state.barriers)
  enforceSeparation(self, state.combatants, state.barriers)
  if (self.pos.x !== before.x || self.pos.y !== before.y) {
    emit(state, { round: state.round, type: 'retreat', sourceId: self.id, position: { ...self.pos } })
  }
}

// Tick ground hazards (§2): damage affected units inside, then age out.
function tickZones(state: BattleState): void {
  if (state.zones.length === 0) return
  const kept = []
  for (const z of state.zones) {
    for (const c of state.combatants) {
      if (!c.alive || c.team !== z.team) continue
      if (distance(c.pos, z.pos) <= z.radius + EPS) applyTickDamage(state, z.sourceId, c, z.dotDamage, z.element ?? 'fire')
    }
    z.roundsLeft -= 1
    if (z.roundsLeft > 0) kept.push(z)
  }
  state.zones = kept
}

// A single hit (basic attack or a skill's damage component): applies tactic
// modifiers (Charger on basic attacks only; Nimble dodge and Armored incoming),
// emits the hit/dodge event, deals damage, records the attacker (Counterattacker),
// and disrupts the target's channeled cast if any. Cooldown/stat bookkeeping for
// skills is the caller's job (a skill may hit many targets but costs one use).
function dealAttack(state: BattleState, attacker: Combatant, target: Combatant, baseAmount: number, skill: EngineSkill | null): void {
  const isMelee = attacker.rangedRange <= 0
  let amount = baseAmount

  if (!skill) {
    const cb = chargerBonus(attacker)
    if (isMelee && cb > 0 && !attacker.chargeUsed) { amount *= 1 + cb; attacker.chargeUsed = true }
  }

  const period = nimblePeriod(target)
  if (period) {
    target.attacksReceived += 1
    if (target.attacksReceived % period === 0) {
      emit(state, { round: state.round, type: 'dodge', sourceId: attacker.id, targetId: target.id })
      return
    }
  }

  const atkElement: Element = skill?.element ?? attacker.attackElement
  const elMult = elementMultiplier(atkElement, effectiveArmor(target))   // §3 element matrix
  amount *= armoredFactor(target)
  amount *= vulnerableFactor(target)            // element-agnostic vulnerability
  amount *= elMult
  amount *= stealthMult(attacker, skill)        // §3 Back Stab from stealth hits harder
  amount = elMult === 0 ? 0 : Math.max(1, Math.floor(amount))   // 0 = elementally immune

  if (skill) {
    emit(state, { round: state.round, type: 'skill_use', sourceId: attacker.id, targetId: target.id, value: amount, skillId: skill.id })
  } else {
    emit(state, { round: state.round, type: isMelee ? 'melee_attack' : 'ranged_attack', sourceId: attacker.id, targetId: target.id, value: amount })
  }
  applyDamageRaw(state, attacker.id, target, amount)
  if (target.alive) {
    target.lastHitById = attacker.id
    clearByElement(state, target, atkElement)   // §3 e.g. fire melts Frozen
    if (target.channel) {   // §4 a landed hit disrupts a channeled cast
      emit(state, { round: state.round, type: 'interrupt', sourceId: attacker.id, targetId: target.id, extra: { skillId: target.channel.skillId } })
      target.channel = null
      target.interruptedCount += 1
    }
  }
}

function recordSkillUse(state: BattleState, self: Combatant, skill: EngineSkill): void {
  if (!state.stats.skillsUsedByUnit[self.id]) state.stats.skillsUsedByUnit[self.id] = []
  state.stats.skillsUsedByUnit[self.id].push(skill.id)
  self.skillCooldowns[skill.id] = skill.cooldown
}

// ── §3 combo / stealth helpers ──────────────────────────────────────────────--

// Product of every active element-agnostic incoming-damage multiplier on the target.
function vulnerableFactor(target: Combatant): number {
  return target.statuses.reduce((m, s) => m * (s.damageTakenMult ?? 1), 1)
}

// Effective armor element: a status may override it (Frozen → water), else base.
function effectiveArmor(target: Combatant): Element {
  const ov = target.statuses.find((s) => s.armorOverride)
  return ov?.armorOverride ?? target.armorElement
}

// Clear statuses that the incoming element dispels (fire melts Frozen, §3).
function clearByElement(state: BattleState, target: Combatant, element: Element): void {
  const removed = target.statuses.filter((s) => s.removedByElement?.includes(element))
  if (removed.length === 0) return
  target.statuses = target.statuses.filter((s) => !s.removedByElement?.includes(element))
  for (const s of removed) {
    emit(state, { round: state.round, type: 'status_expire', sourceId: target.id, extra: { statusId: s.id } })
  }
}

// Striking from stealth (§3): every ambush gets the base sneak-attack bonus
// (+STEALTH_ATTACK_BONUS); Back Stab's own `stealthBonus` multiplies on top.
function stealthMult(attacker: Combatant, skill: EngineSkill | null): number {
  if (!attacker.statuses.some((s) => s.flags.includes('stealthed'))) return 1
  return (1 + STEALTH_ATTACK_BONUS) * (skill?.stealthBonus ?? 1)
}

// Dealing damage drops stealth (called once per offensive action, after it lands).
function breakStealth(state: BattleState, c: Combatant): void {
  const before = c.statuses.length
  c.statuses = c.statuses.filter((s) => !s.flags.includes('stealthed'))
  if (c.statuses.length !== before) {
    emit(state, { round: state.round, type: 'status_expire', sourceId: c.id, extra: { statusId: 'stealthed' } })
  }
}

// Dispel / Sight: strip statuses from a target (by category or by specific id).
function applyStatusRemoval(state: BattleState, self: Combatant, target: Combatant, skill: EngineSkill): void {
  const toRemove = (s: { id: string; category?: string }) =>
    (skill.removesStatusId != null && s.id === skill.removesStatusId) ||
    (skill.dispelCategory != null && s.category === skill.dispelCategory)
  if (skill.removesStatusId == null && skill.dispelCategory == null) return
  const removed = target.statuses.filter(toRemove)
  if (removed.length === 0) return
  target.statuses = target.statuses.filter((s) => !toRemove(s))
  for (const s of removed) {
    emit(state, { round: state.round, type: 'status_expire', sourceId: self.id, targetId: target.id, extra: { statusId: s.id } })
  }
}

// ── Skill casting (§4) ──────────────────────────────────────────────────────--

const isAllyTargeting = (sk: EngineSkill) =>
  sk.targeting === 'self' || sk.targeting === 'single_ally' || sk.targeting === 'aoe_ally'

// Who a skill's effect lands on. AoE-enemy spreads around the primary target;
// AoE-ally is centered on the caster.
function affectedTargets(state: BattleState, self: Combatant, skill: EngineSkill, primary: Combatant): Combatant[] {
  switch (skill.targeting) {
    case 'self': return [self]
    case 'single_enemy':
    case 'single_ally': return [primary]
    case 'aoe_enemy': return livingEnemies(state, self).filter((c) => distance(c.pos, primary.pos) <= skill.aoeRadius + EPS)
    case 'aoe_ally':   return livingAllies(state, self).filter((c) => distance(c.pos, self.pos) <= skill.aoeRadius + EPS)
    default: return []
  }
}

// Apply a skill's effects now (damage / heal / status to every affected unit),
// then put it on cooldown and record the single use.
function resolveSkill(state: BattleState, self: Combatant, skill: EngineSkill, targetId: string): void {
  recordSkillUse(state, self, skill)
  // Non-damage skills (heal, buff, status, zone) don't go through dealAttack,
  // so they never emit a skill_use otherwise — UI floating labels would miss
  // them. Emit a source-anchored marker once per cast so "Heal", "Cloak",
  // "Poison", etc. surface above the caster. Damage skills already emit a
  // per-target skill_use via dealAttack and don't need this marker.
  if (!skill.damageFormula) {
    emit(state, { round: state.round, type: 'skill_use', sourceId: self.id, targetId, skillId: skill.id })
  }
  const primary = findCombatant(state, targetId)
  if (!primary) return

  // Persistent ground hazard (Firewall): drop it on the target's position.
  if (skill.zone) {
    state.zones.push({
      id: `z-${skill.id}-${state.round}-${self.id}`,
      sourceId: self.id,
      team: self.team === 'player' ? 'enemy' : 'player',
      pos: { ...primary.pos },
      radius: skill.aoeRadius || 1,
      dotDamage: skill.zone.dotDamage,
      roundsLeft: skill.zone.duration,
      skillId: skill.id,
      element: skill.zone.element ?? skill.element,
    })
  }

  const targets = affectedTargets(state, self, skill, primary)
  const allyEffect = isAllyTargeting(skill)

  for (const t of targets) {
    if (allyEffect) {
      if (skill.healFormula) {
        const healed = Math.min(calculateHeal(self, skill), t.maxHp - t.hp)
        if (healed > 0) {
          t.hp += healed
          addStat(state.stats.totalHealingByUnit, self.id, healed)
          emit(state, { round: state.round, type: 'heal', sourceId: self.id, targetId: t.id, value: healed, skillId: skill.id })
        }
      }
      applySkillStatus(state, self, t, skill)
      applyStatusRemoval(state, self, t, skill)
    } else {
      if (skill.damageFormula) dealAttack(state, self, t, state.calculateDamage(self, t, skill, state.round), skill)
      if (t.alive) applySkillStatus(state, self, t, skill)
      if (t.alive) applyStatusRemoval(state, self, t, skill)   // Dispel / Sight (§3)
      if (t.alive && skill.knockback) knockbackTarget(state, self, t, skill.knockback)
    }
  }

  if (skill.damageFormula) breakStealth(state, self)   // attacking reveals the caster (§3)
  if (skill.retreatAfter) retreatCaster(state, self, skill.retreatAfter)
}

function applySkillStatus(state: BattleState, self: Combatant, target: Combatant, skill: EngineSkill): void {
  if (!skill.statusApplied) return
  const status = buildStatus(skill.statusApplied, self.id)
  if (!status) return
  addStatus(target, status)
  emit(state, { round: state.round, type: 'buff_apply', sourceId: self.id, targetId: target.id, skillId: skill.id, extra: { statusId: status.id } })
}

// Begin or perform a cast. Channeled skills (channelTime ≥ 1) start a channel
// that resolves on a later turn and can be disrupted; instant skills resolve now.
function castSkill(state: BattleState, self: Combatant, skill: EngineSkill, targetId: string): void {
  if (skill.channelTime >= 1) {
    self.channel = { skillId: skill.id, targetId, roundsLeft: skill.channelTime }
    emit(state, { round: state.round, type: 'cast_start', sourceId: self.id, targetId, skillId: skill.id })
    return
  }
  resolveSkill(state, self, skill, targetId)
}

// ── Tactic evaluation (§5.3) ────────────────────────────────────────────────--
// Order: reaction → targeting → movement → action. Targeting runs before
// movement (a slight reorder of the spec's numbering) so movement can aim at the
// freshly resolved lock instead of last round's.

function onCooldown(self: Combatant, t: ResolvedTactic): boolean {
  return (self.tacticCooldowns[t.def.id] ?? 0) > 0
}
function usedUp(self: Combatant, t: ResolvedTactic): boolean {
  return !!t.def.oncePerCombat && self.tacticsUsed.includes(t.def.id)
}
function markFired(self: Combatant, t: ResolvedTactic): void {
  if (t.def.cooldown) self.tacticCooldowns[t.def.id] = t.def.cooldown
  if (t.def.oncePerCombat && !self.tacticsUsed.includes(t.def.id)) self.tacticsUsed.push(t.def.id)
}

function addStatus(c: Combatant, s: import('./types').StatusEffect): void {
  const i = c.statuses.findIndex((x) => x.id === s.id)
  if (i >= 0) c.statuses[i] = { ...s }
  else c.statuses.push({ ...s })
}

function setLock(state: BattleState, self: Combatant, id: string): void {
  if (self.lockedTargetId === id) return
  const from = self.lockedTargetId
  self.lockedTargetId = id
  emit(state, { round: state.round, type: 'target_switch', sourceId: self.id, targetId: id, extra: { from } })
}

function evalTargeting(state: BattleState, self: Combatant): void {
  for (const t of self.tactics) {
    if (t.def.channel !== 'targeting' || !t.def.targeting) continue
    if (onCooldown(self, t) || usedUp(self, t)) continue
    const id = t.def.targeting(self, state, t.rank)
    if (id) { setLock(state, self, id); markFired(self, t); return }
  }
  // default: keep lock if alive, else nearest enemy (with taunt bias)
  const prev = selectTarget(state, self)
  if (prev !== null && self.lockedTargetId) {
    emit(state, { round: state.round, type: 'target_switch', sourceId: self.id, targetId: self.lockedTargetId, extra: { from: prev } })
  }
}

function evalMovement(state: BattleState, self: Combatant): MovementResult | null {
  for (const t of self.tactics) {
    if (t.def.channel !== 'movement' || !t.def.movement) continue
    if (onCooldown(self, t) || usedUp(self, t)) continue
    const plan = t.def.movement(self, state, t.rank)
    if (plan) { markFired(self, t); return plan }
  }
  return null
}

function executeMovement(state: BattleState, self: Combatant, plan: MovementResult | null): void {
  if (plan?.clearLock) self.lockedTargetId = null
  if (self.statuses.some((s) => s.flags.includes('rooted'))) return   // §2 rooted: can act, can't move
  if (plan?.hold) return
  if (plan?.awayFromNearestEnemy) {
    const dir = self.team === 'player' ? -1 : 1
    const rows = plan.rows ?? 1
    const coh = cohesionVec(self, state)
    // Pull-toward-team-edge as the dominant move; cohesion gives a sideways
    // curve so a retreater drifts toward the surviving party instead of
    // straight back into a corner.
    const dx = coh.x * COHESION_WEIGHT * rows
    const dy = dir * rows + coh.y * COHESION_WEIGHT * rows
    const before = { ...self.pos }
    self.pos = slideMove(self.pos, { x: self.pos.x + dx, y: self.pos.y + dy }, state.barriers)
    enforceSeparation(self, state.combatants, state.barriers)
    if (self.pos.x !== before.x || self.pos.y !== before.y) {
      emit(state, { round: state.round, type: 'retreat', sourceId: self.id, position: { ...self.pos } })
    }
    return
  }
  // Kite: hold a desired gap to the locked target (back off if too close, close in if too far).
  if (plan?.desiredRange != null) { kiteToward(state, self, plan.desiredRange); return }
  // Move to a computed spot (flank / guard / regroup).
  if (plan?.toPoint) {
    if (moveTowardPoint(self, plan.toPoint, moveSpeedOf(self) * (plan.speedMult ?? 1), state.combatants, state.barriers)) {
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
    return
  }
  const target = findCombatant(state, self.lockedTargetId)
  if (target && target.alive) {
    // Casters without an explicit movement tactic still need cast-aware
    // positioning — otherwise they walk into melee while their spell is
    // mid-channel. Treat them as kiters by default; this also makes monster
    // casters work without any per-unit configuration.
    if (isCaster(self)) {
      const threat = nearestEnemyTo(self, state) ?? target
      kiteToward(state, self, kiteDistanceFor(self, threat))
      return
    }
    const moved = moveToward(self, target, moveSpeedOf(self) * (plan?.speedMult ?? 1), state.combatants, state.barriers)
    if (moved) emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    return
  }
  // §open-world: nothing in sight → roam (heroes) / lurk-and-hop (monsters).
  if (state.mode === 'open') executeWander(state, self)
}

// ── Team blackboard (§coordination) ─────────────────────────────────────────--

function centroidOf(cs: Combatant[]): Vec2 {
  let x = 0, y = 0
  for (const c of cs) { x += c.pos.x; y += c.pos.y }
  return { x: x / cs.length, y: y / cs.length }
}

// The built-in blackboard producer. Computes, per team:
//   • waypoint — the party's shared roam target. If anyone's engaged, it's the
//     centroid of the fight (roamers regroup on it); otherwise a fresh interior
//     point, re-picked once the party arrives (deterministic hash, so replays
//     match). Heroes read this in executeWander; that's how "wander together"
//     stops being coincidence and becomes shared state.
//   • focusTargetId — lowest-HP enemy the team can see (advisory; exposed for
//     debugging and available to a future focus-fire tactic).
//   • threat — per-enemy danger score.
export function defaultPlanner(state: BattleState, team: Team): TeamPlan {
  const members = state.combatants.filter((c) => c.alive && c.team === team)
  const enemies = state.combatants.filter((c) => c.alive && c.team !== team)

  const threat: Record<string, number> = {}
  for (const e of enemies) threat[e.id] = Math.round(effectiveStat(e, 'str') + effectiveStat(e, 'int'))

  let focus: Combatant | null = null
  for (const e of enemies) {
    if (isStealthed(e)) continue
    if (!members.some((m) => distance(m.pos, e.pos) <= m.visionRange)) continue   // unseen
    if (!focus || e.hp < focus.hp || (e.hp === focus.hp && e.id < focus.id)) focus = e
  }

  let waypoint = state.plans[team]?.waypoint ?? null
  const engaged = members.filter((m) => {
    const t = findCombatant(state, m.lockedTargetId)
    return !!(t && t.alive)
  })
  if (engaged.length) {
    waypoint = centroidOf(engaged)
  } else if (members.length) {
    const c = centroidOf(members)
    if (!waypoint || distance(c, waypoint) <= WANDER_REPATH) {
      // Interior point so the party roams the field, not the perimeter (margin
      // shrinks on tiny maps so it never inverts).
      const mx = Math.min(WANDER_MARGIN, state.cols / 2 - 0.5)
      const my = Math.min(WANDER_MARGIN, state.rows / 2 - 0.5)
      const seed = team === 'player' ? 1 : 7
      waypoint = {
        x: mx + hash01(state.round * 2 + seed) * (state.cols - 2 * mx),
        y: my + hash01(state.round * 2 + seed + 1) * (state.rows - 2 * my),
      }
    }
  }
  return { waypoint, focusTargetId: focus?.id ?? null, threat }
}

// Recompute every team's blackboard once per round (start of advanceRound).
function runPlanners(state: BattleState): void {
  for (const team of ['player', 'enemy'] as Team[]) {
    state.plans[team] = state.planner(state, team)
  }
}

// ── Open-world wander (only reached when a unit has no target, mode === 'open') ─

// Fan the shared waypoint out per unit (a small 3-wide grid offset by index) so
// the party walks as a loose cluster instead of all aiming at the exact same
// cell — which separation would otherwise grind into edge jitter.
function offsetWaypoint(wp: Vec2 | null | undefined, index: number): Vec2 | null {
  if (!wp) return null
  const ox = ((index % 3) - 1) * 2.5
  const oy = ((Math.floor(index / 3) % 3) - 1) * 2.5
  return { x: wp.x + ox, y: wp.y + oy }
}

function executeWander(state: BattleState, self: Combatant): void {
  if (self.statuses.some((s) => s.flags.includes('rooted'))) return

  if (self.team === 'player') {
    // Travel speed: roaming the big map is movement *between* fights, so heroes
    // cross it briskly. (Combat movement, once a target is locked, isn't here.)
    const speed = moveSpeedOf(self) * WANDER_SPEED_MULT
    // Read the team blackboard's shared waypoint (regroups on a fight, else
    // roams), fanned out per unit so the party travels as a loose cluster.
    const point = offsetWaypoint(state.plans[self.team]?.waypoint, self.index)
    if (!point) return
    if (moveTowardPoint(self, point, speed, state.combatants, state.barriers)) {
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
    return
  }

  // Monsters: lurk, then hop a short distance to a new local spot.
  if (self.wanderTarget) {
    if (moveTowardPoint(self, self.wanderTarget, moveSpeedOf(self), state.combatants, state.barriers)) {
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
    if (distance(self.pos, self.wanderTarget) < 0.6) {
      self.wanderTarget = null
      self.wanderDwell = monsterDwell(state.round + self.index)
    }
    return
  }
  if (self.wanderDwell > 0) { self.wanderDwell -= 1; return }
  // Pick a hop: a deterministic direction + a 5–8 cell distance, kept a few
  // cells off the edges so monsters don't lurk jammed in a corner.
  const ang = hash01(state.round * 3 + self.index) * Math.PI * 2
  const dist = MONSTER_WANDER_NEAR + hash01(state.round * 3 + self.index + 7) * (MONSTER_WANDER_FAR - MONSTER_WANDER_NEAR)
  const m = Math.min(MONSTER_EDGE_MARGIN, state.cols / 2 - 0.5, state.rows / 2 - 0.5)
  self.wanderTarget = {
    x: Math.max(m, Math.min(state.cols - m, self.pos.x + Math.cos(ang) * dist)),
    y: Math.max(m, Math.min(state.rows - m, self.pos.y + Math.sin(ang) * dist)),
  }
}

// Hold `want` gap from the NEAREST enemy, AND maintain a clear shot. When too
// close, back off along a tangential arc (toward whichever side has more arena
// to run into) so the kiter circles instead of pinning itself in a corner. When
// in range but a wall sits between us and the threat, relocate along the
// visibility-graph path to gain LoS — a kiter that can't shoot isn't kiting.
// Small dead-band to avoid jitter; also peek one round ahead at the threat's
// approach so a chaser doesn't get a free tick of closing before we react.
function kiteToward(state: BattleState, self: Combatant, want: number): void {
  const threat = nearestEnemyTo(self, state)
  if (!threat) return
  const d = distance(self.pos, threat.pos)
  const losClear = sightlineClear(self.pos, threat.pos, state.barriers)
  const band = 0.4

  // Predict where this threat will be after its turn this round, assuming a
  // straight chase. If standing still would let it close past the kite line,
  // we retreat NOW instead of waiting for next round.
  const threatStep = moveSpeedOf(threat)
  const predictedD = d - threatStep
  const tooClose = d < want - band || predictedD < want - band

  // Sweet spot: right gap, clear shot, AND the threat can't close past the
  // line next turn → stand and fire.
  if (losClear && !tooClose && d <= want + band) return

  const before = { ...self.pos }
  const step = moveSpeedOf(self)
  let retreating = false

  if (tooClose) {
    // Too close: back off. With open arena behind, go straight (so a faster
    // kiter gains ground on a slower foe). When pinned against a wall — outer
    // OR inner — arc tangentially toward whichever side actually has room to
    // travel, so the kiter perimeter-routes around obstacles instead of
    // freezing in a corner.
    retreating = true
    const ax = (self.pos.x - threat.pos.x) / (d || 1)
    const ay = (self.pos.y - threat.pos.y) / (d || 1)
    const probe = step * 2.5
    // How far we'd actually travel in a unit direction (walls AND outer
    // bounds), measured by tracing the probe to the nearest blocker.
    const probeReach = (dxN: number, dyN: number): number => {
      const target = { x: self.pos.x + dxN * probe, y: self.pos.y + dyN * probe }
      return distance(self.pos, traceMove(self.pos, target, state.barriers))
    }
    let dx = ax, dy = ay
    const awayReach = probeReach(ax, ay)
    if (awayReach < probe * 0.4) {
      const tLx = -ay, tLy = ax
      const tRx = ay,  tRy = -ax
      const lReach = probeReach(tLx, tLy)
      const rReach = probeReach(tRx, tRy)
      const tx = lReach >= rReach ? tLx : tRx
      const ty = lReach >= rReach ? tLy : tRy
      const bx = ax + tx, by = ay + ty       // 50/50 blend: hard arc when wall is behind
      const blen = Math.hypot(bx, by) || 1
      dx = bx / blen; dy = by / blen
    }
    // Light cohesion bias: nudge the back-off direction toward the party
    // centroid so a kiting healer doesn't strand itself behind the front
    // line. The away-from-threat vector still dominates; cohesion just curves
    // the path slightly toward where the allies are.
    const coh = cohesionVec(self, state)
    if (coh.x !== 0 || coh.y !== 0) {
      const bx = dx + coh.x * COHESION_WEIGHT, by = dy + coh.y * COHESION_WEIGHT
      const blen = Math.hypot(bx, by) || 1
      dx = bx / blen; dy = by / blen
    }
    self.pos = slideMove(self.pos, { x: self.pos.x + dx * step, y: self.pos.y + dy * step }, state.barriers)
  } else {
    // Too far, OR in range but a wall blocks the shot: route toward the threat
    // via the visibility graph so we'll round the corner that re-opens line of
    // sight. With a clear line, cap the step so we don't overshoot `want`.
    const { point } = steerAround(self.pos, threat.pos, state.barriers)
    const gd = distance(self.pos, point)
    if (gd > EPS) {
      const ux = (point.x - self.pos.x) / gd
      const uy = (point.y - self.pos.y) / gd
      const cap = losClear ? Math.min(step, gd, Math.max(0, d - want)) : Math.min(step, gd)
      if (cap > EPS) {
        self.pos = slideMove(self.pos, { x: self.pos.x + ux * cap, y: self.pos.y + uy * cap }, state.barriers)
      }
    }
  }

  enforceSeparation(self, state.combatants, state.barriers)
  if (self.pos.x !== before.x || self.pos.y !== before.y) {
    emit(state, { round: state.round, type: retreating ? 'retreat' : 'move', sourceId: self.id, position: { ...self.pos } })
  }
}

function evalActionTactics(state: BattleState, self: Combatant): ActionResult | null {
  for (const t of self.tactics) {
    if (t.def.channel !== 'action' || !t.def.action) continue
    if (onCooldown(self, t) || usedUp(self, t)) continue
    const res = t.def.action(self, state, t.rank)
    if (res) {
      markFired(self, t)
      // Skill tactics already emit `skill_use` when their cast lands — only
      // surface non-skill action tactics (Shield Wall, etc.) here.
      if (!t.def.id.startsWith('skill:')) {
        emit(state, { round: state.round, type: 'tactic_use', sourceId: self.id, tacticId: t.def.id, extra: { label: t.def.name } })
      }
      return res   // first action tactic owns the turn's action
    }
  }
  return null
}

function evalReactions(state: BattleState, self: Combatant): ReactionResult | null {
  for (const t of self.tactics) {
    if (t.def.channel !== 'reaction' || !t.def.reaction) continue
    if (onCooldown(self, t) || usedUp(self, t)) continue
    const res = t.def.reaction(self, state, t.rank)
    if (res) {
      markFired(self, t)
      emit(state, { round: state.round, type: 'tactic_use', sourceId: self.id, tacticId: t.def.id, extra: { label: t.def.name } })
      return res
    }
  }
  return null
}

function applyReaction(state: BattleState, self: Combatant, res: ReactionResult): boolean {
  if (res.applyStatusToSelf) {
    addStatus(self, res.applyStatusToSelf)
    emit(state, { round: state.round, type: 'buff_apply', sourceId: self.id, targetId: self.id, extra: { statusId: res.applyStatusToSelf.id } })
  }
  if (res.counterAttack) {
    const target = findCombatant(state, res.counterAttack)
    if (target && target.alive) {
      dealAttack(state, self, target, state.calculateDamage(self, target, null, state.round), null)
      breakStealth(state, self)
    }
  }
  return !!res.consumesTurn
}

function executeNaiveAction(state: BattleState, self: Combatant): void {
  const action = chooseAction(state, self)
  if (!action) return
  if (action.kind === 'heal') {
    const ally = findCombatant(state, action.targetId)
    if (!ally || !ally.alive) return
    const raw = calculateHeal(self, action.skill)
    const healed = Math.min(raw, ally.maxHp - ally.hp)
    ally.hp += healed
    addStat(state.stats.totalHealingByUnit, self.id, healed)
    recordSkillUse(state, self, action.skill)
    emit(state, { round: state.round, type: 'skill_use', sourceId: self.id, targetId: ally.id, skillId: action.skill.id })
    emit(state, { round: state.round, type: 'heal', sourceId: self.id, targetId: ally.id, value: healed, skillId: action.skill.id })
    return
  }
  const target = findCombatant(state, action.targetId)
  if (!target || !target.alive) return
  const skill = action.kind === 'skill' ? action.skill : null
  dealAttack(state, self, target, state.calculateDamage(self, target, skill, state.round), skill)
  if (skill) recordSkillUse(state, self, skill)   // dealAttack no longer records skill use
  breakStealth(state, self)                        // a basic attack also reveals (§3)
}

// Resolve / continue a channeled cast at the start of the caster's turn. Returns
// true if the channel consumed the turn (still casting or just resolved).
function tickChannel(state: BattleState, self: Combatant): boolean {
  if (!self.channel) return false
  self.channel.roundsLeft -= 1
  if (self.channel.roundsLeft <= 0) {
    const { skillId, targetId } = self.channel
    self.channel = null
    const skill = self.skills.find((s) => s.id === skillId)
    if (skill) {
      const tgt = findCombatant(state, targetId)
      if (tgt && tgt.alive) resolveSkill(state, self, skill, targetId)
      else self.skillCooldowns[skill.id] = skill.cooldown   // target gone: fizzle onto cooldown
    }
  }
  return true   // a channel always consumes the turn (rooted while casting)
}

// ── Per-unit debug trace (§debug) ────────────────────────────────────────────--
const TRACE_CAP = 20
function pushTrace(c: Combatant, round: number, text: string): void {
  c.trace.push({ round, text })
  if (c.trace.length > TRACE_CAP) c.trace.splice(0, c.trace.length - TRACE_CAP)
}
function traceName(state: BattleState, id: string | null | undefined): string {
  if (!id) return '—'
  return findCombatant(state, id)?.name ?? id
}

// Point the token where the unit is heading: its actual move delta if it moved
// this turn, else toward whatever it's locked onto (so a stationary attacker
// still faces its foe). Keeps the last facing when neither applies. Normalised.
// Also records `moving` (did the position change) for the UI "tail".
function updateFacing(state: BattleState, self: Combatant, from: Vec2, moved: boolean): void {
  self.moving = moved
  let dx = 0, dy = 0
  if (moved) {
    dx = self.pos.x - from.x; dy = self.pos.y - from.y
  } else {
    const tgt = findCombatant(state, self.lockedTargetId)
    if (tgt && tgt.alive) { dx = tgt.pos.x - self.pos.x; dy = tgt.pos.y - self.pos.y }
  }
  const len = Math.hypot(dx, dy)
  if (len > EPS) self.facing = { x: dx / len, y: dy / len }
}

function takeTurn(state: BattleState, self: Combatant): void {
  const round = state.round
  self.moving = false   // set true only if this turn produces a position change
  // (0) hard control — lose the turn. Stun is consumed on the skipped turn;
  // Freeze ages out normally (so its damage amplification persists, §3).
  const control = self.statuses.find((s) => s.flags.includes('stunned') || s.flags.includes('frozen'))
  if (control) {
    if (control.flags.includes('stunned')) self.statuses = self.statuses.filter((s) => s !== control)
    pushTrace(self, round, control.flags.includes('frozen') ? 'frozen — skip turn' : 'stunned — skip turn')
    self.lastHitById = null
    return
  }

  // (0) channeled cast in progress — continue or resolve it
  if (self.channel) {
    const sk = self.channel.skillId
    tickChannel(state, self)
    pushTrace(self, round, self.channel ? `channeling ${sk} (${self.channel.roundsLeft} left)` : `cast ${sk} resolved`)
    self.lastHitById = null
    return
  }

  // (1) reaction — may consume the turn
  const reaction = evalReactions(state, self)
  if (reaction && applyReaction(state, self, reaction)) {
    pushTrace(self, round, `reaction${reaction.counterAttack ? ` · counter ${traceName(state, reaction.counterAttack)}` : ''}`)
    self.lastHitById = null
    return
  }

  // (3→2) targeting, then movement aimed at the resolved lock
  const lockBefore = self.lockedTargetId
  evalTargeting(state, self)
  const tgtText = self.lockedTargetId
    ? `→ ${traceName(state, self.lockedTargetId)}${self.lockedTargetId !== lockBefore ? ' (new)' : ''}`
    : (state.mode === 'open' ? 'no target · wander' : 'no target')

  const posBefore = { ...self.pos }
  executeMovement(state, self, evalMovement(state, self))
  const moved = self.pos.x !== posBefore.x || self.pos.y !== posBefore.y
  updateFacing(state, self, posBefore, moved)
  const moveText = moved
    ? `move (${posBefore.x.toFixed(1)},${posBefore.y.toFixed(1)})→(${self.pos.x.toFixed(1)},${self.pos.y.toFixed(1)})`
    : 'hold'

  // (4) action — an action tactic owns the turn if it fires: Shield Wall (status)
  // or a skill cast (skills are action tactics). Else fall back to a basic attack.
  let actionText: string
  const act = evalActionTactics(state, self)
  if (act) {
    if (act.applyStatusToSelf) addStatus(self, act.applyStatusToSelf)
    if (act.castSkill && act.skillTarget) castSkill(state, self, act.castSkill, act.skillTarget)
    actionText = act.castSkill ? `cast ${act.castSkill.name} @ ${traceName(state, act.skillTarget)}`
      : act.applyStatusToSelf ? `self-buff ${act.applyStatusToSelf.name ?? act.applyStatusToSelf.id}`
      : 'act'
  } else {
    const peek = chooseAction(state, self)   // pure read; executeNaiveAction re-derives it
    actionText = peek
      ? (peek.kind === 'heal' ? `heal ${traceName(state, peek.targetId)}`
        : peek.kind === 'skill' ? `cast ${peek.skill.name} @ ${traceName(state, peek.targetId)}`
        : `attack ${traceName(state, peek.targetId)}`)
      : 'idle'
    executeNaiveAction(state, self)
  }

  pushTrace(self, round, `${tgtText} · ${moveText} · ${actionText}`)
  // consume "hit since last turn" so Counterattacker only fires on fresh hits
  self.lastHitById = null
}

function evalOutcome(state: BattleState): Outcome {
  // Open-world battles are persistent — they never self-terminate on a wipe.
  // The host trickles reinforcements in and decides when to tear the battle
  // down (e.g. no eligible heroes remain at the location).
  if (state.mode === 'open') return 'ongoing'
  const playersAlive = state.combatants.some((c) => c.alive && c.team === 'player')
  const enemiesAlive = state.combatants.some((c) => c.alive && c.team === 'enemy')
  if (!enemiesAlive) return 'victory'
  if (!playersAlive) return 'defeat'
  if (state.round >= state.maxRounds) return 'draw'  // §9.2 draw favors defender → loss for the player
  return 'ongoing'
}

// Resolve exactly one round in place (§9.1). No-op once the battle is decided.
const EVENT_CAP = 600   // open battles never reset; keep the event log bounded

export function advanceRound(state: BattleState): BattleState {
  if (state.outcome !== 'ongoing') return state
  setArenaBounds(state.cols, state.rows)   // movement/clamp use this battle's bounds
  // Open battles run forever — trim the event log so it can't grow unbounded
  // (only the current round's events are ever read for rendering).
  if (state.mode === 'open' && state.collectEvents && state.events.length > EVENT_CAP) {
    state.events.splice(0, state.events.length - EVENT_CAP)
  }
  state.round += 1

  // §coordination: refresh every team's blackboard (shared waypoint, focus,
  // threat) before any unit acts; tactics/wander read it this round.
  runPlanners(state)

  // §9.1.1 tick status effects (apply DoT, then age out)
  for (const c of state.combatants) {
    if (c.statuses.length === 0) continue
    const kept = []
    for (const s of c.statuses) {
      if (s.dotDamage && c.alive) applyTickDamage(state, s.source, c, s.dotDamage, s.id)
      s.duration -= 1
      if (s.duration > 0) kept.push(s)
      else emit(state, { round: state.round, type: 'status_expire', sourceId: c.id, extra: { statusId: s.id } })
    }
    c.statuses = kept
  }

  // §2 tick ground hazards (Firewall etc.)
  tickZones(state)

  // §9.1.2 tick cooldowns (skills + tactics)
  for (const c of state.combatants) {
    for (const id of Object.keys(c.skillCooldowns)) {
      if (c.skillCooldowns[id] > 0) c.skillCooldowns[id] -= 1
    }
    for (const id of Object.keys(c.tacticCooldowns)) {
      if (c.tacticCooldowns[id] > 0) c.tacticCooldowns[id] -= 1
    }
  }

  // §9.1.3 turn order: SPD desc, tiebreak by id (§10, §16)
  const order = state.combatants
    .filter((c) => c.alive)
    .sort((a, b) => {
      const sa = effectiveStat(a, 'spd')
      const sb = effectiveStat(b, 'spd')
      if (sb !== sa) return sb - sa
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  // §9.1.4 each living unit acts once (dead-mid-round units are skipped)
  for (const c of order) {
    if (!c.alive) continue
    takeTurn(state, c)
  }

  // §9.1.5 win condition
  state.outcome = evalOutcome(state)
  return state
}

function snapshot(state: BattleState): BattleResult['units'] {
  return state.combatants.map((c) => ({
    id: c.id, name: c.name, team: c.team,
    hp: c.hp, maxHp: c.maxHp, alive: c.alive, pos: { ...c.pos },
  }))
}

// Run to completion (§11.1). For idle/bulk this is the building block.
export function resolve(setup: CombatSetup): BattleResult {
  const state = createBattle(setup)
  while (state.outcome === 'ongoing') advanceRound(state)
  return finalize(state)
}

export function finalize(state: BattleState): BattleResult {
  return {
    outcome: state.outcome === 'ongoing' ? 'draw' : state.outcome,
    rounds: state.round,
    units: snapshot(state),
    events: state.events,
    stats: state.stats,
  }
}

// Re-exported helpers the host/UI may want without reaching into submodules.
export { distance, attackReach, livingEnemies, livingAllies, findCombatant }
