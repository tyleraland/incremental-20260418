// Combat Tactic Engine — round resolution (spec §9, §10, §11, §16).
//
// Deterministic, round-based, grid autobattle. `createBattle` clones the input
// roster (never mutating it, §16.5); `advanceRound` resolves exactly one round
// in place so the host can step combat "one round per N ticks"; `resolve` runs
// to completion for tests and bulk/idle resolution.

import { BASE_MOVE_SPEED, MAX_ROUNDS } from './constants'
import { startingPosition, moveToward, attackReach, distance, clampToGrid, enforceSeparation } from './grid'
import { defaultCalculateDamage, calculateHeal, effectiveStat } from './damage'
import {
  selectTarget, chooseAction, findCombatant, livingEnemies, livingAllies,
} from './behavior'
import {
  resolveTactics, getTactic, chargerBonus, armoredFactor, nimblePeriod,
} from './tactics'
import type {
  BattleState, BattleResult, BattleStats, Combatant, CombatSetup,
  EngineUnitInput, Outcome, Team, BattleEvent, EngineSkill,
  ResolvedTactic, TacticRef, MovementResult, ReactionResult,
} from './types'

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
  return {
    id: input.id,
    name: input.name,
    team: input.team,
    index,
    str: input.str,
    def: input.def,
    int: input.int,
    spd: input.spd,
    maxHp: input.maxHp,
    hp: input.hp,
    alive: input.hp > 0,
    pos: { x: pos.x, y: pos.y },
    preferredRank: input.preferredRank,
    meleeRange: input.meleeRange,
    rangedRange: input.rangedRange,
    skills: input.skills.map((s) => ({ ...s })),   // clone so the engine never mutates input
    skillCooldowns: {},
    statuses: [],
    lockedTargetId: null,
    potionsLeft: input.potions ?? 0,
    tactics,
    tacticCooldowns: {},
    tacticsUsed: [],
    chargeUsed: false,
    attacksReceived: 0,
    lastHitById: null,
  }
}

export function createBattle(setup: CombatSetup): BattleState {
  const combatants: Combatant[] = []
  let index = 0
  const place = (units: EngineUnitInput[], team: Team, party?: TacticRef[]) => {
    units.forEach((u, i) => {
      const pos = startingPosition(team, u.preferredRank, i)
      const tactics = resolveTactics(u.tactics, party)
      combatants.push(makeCombatant({ ...u, team }, index++, pos, tactics))
    })
  }
  place(setup.playerUnits, 'player', setup.playerPartyTactics)
  place(setup.enemyUnits, 'enemy', setup.enemyPartyTactics)

  return {
    combatants,
    round: 0,
    outcome: 'ongoing',
    events: [],
    stats: emptyStats(),
    maxRounds: setup.maxRounds ?? MAX_ROUNDS,
    collectEvents: setup.collectEvents ?? true,
    calculateDamage: setup.callbacks?.calculateDamage ?? defaultCalculateDamage,
  }
}

function emit(state: BattleState, e: BattleEvent): void {
  if (state.collectEvents) state.events.push(e)
}

function addStat(map: Record<string, number>, id: string, n: number): void {
  map[id] = (map[id] ?? 0) + n
}

// Apply damage, record stats, and handle death + lock cleanup (§9.1 f).
function applyDamageRaw(
  state: BattleState,
  attacker: Combatant,
  target: Combatant,
  amount: number,
): void {
  target.hp = Math.max(0, target.hp - amount)
  addStat(state.stats.totalDamageByUnit, attacker.id, amount)
  if (target.hp <= 0 && target.alive) {
    target.alive = false
    addStat(state.stats.killsByUnit, attacker.id, 1)
    emit(state, { round: state.round, type: 'unit_death', sourceId: attacker.id, targetId: target.id })
    // Clear any locks pointing at the now-dead unit.
    for (const c of state.combatants) {
      if (c.lockedTargetId === target.id) c.lockedTargetId = null
    }
  }
}

// A single attack: applies tactic modifiers (Charger outgoing; Nimble dodge and
// Armored incoming), emits the hit/dodge event, deals damage, and records the
// attacker so the target's Counterattacker can react next turn.
function dealAttack(state: BattleState, attacker: Combatant, target: Combatant, baseAmount: number, skill: EngineSkill | null): void {
  const isMelee = attacker.rangedRange <= 0
  let amount = baseAmount

  const cb = chargerBonus(attacker)
  if (isMelee && cb > 0 && !attacker.chargeUsed) { amount *= 1 + cb; attacker.chargeUsed = true }

  const period = nimblePeriod(target)
  if (period) {
    target.attacksReceived += 1
    if (target.attacksReceived % period === 0) {
      emit(state, { round: state.round, type: 'dodge', sourceId: attacker.id, targetId: target.id })
      return
    }
  }

  amount *= armoredFactor(target)
  amount = Math.max(1, Math.floor(amount))

  if (skill) {
    recordSkillUse(state, attacker, skill)
    emit(state, { round: state.round, type: 'skill_use', sourceId: attacker.id, targetId: target.id, value: amount, skillId: skill.id })
  } else {
    emit(state, { round: state.round, type: isMelee ? 'melee_attack' : 'ranged_attack', sourceId: attacker.id, targetId: target.id, value: amount })
  }
  applyDamageRaw(state, attacker, target, amount)
  if (target.alive) target.lastHitById = attacker.id
}

function recordSkillUse(state: BattleState, self: Combatant, skill: EngineSkill): void {
  if (!state.stats.skillsUsedByUnit[self.id]) state.stats.skillsUsedByUnit[self.id] = []
  state.stats.skillsUsedByUnit[self.id].push(skill.id)
  self.skillCooldowns[skill.id] = skill.cooldown
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
  if (plan?.hold) return
  if (plan?.awayFromNearestEnemy) {
    const dir = self.team === 'player' ? -1 : 1
    const before = { ...self.pos }
    self.pos = clampToGrid({ x: self.pos.x, y: self.pos.y + dir * (plan.rows ?? 1) })
    enforceSeparation(self, state.combatants)
    if (self.pos.x !== before.x || self.pos.y !== before.y) {
      emit(state, { round: state.round, type: 'retreat', sourceId: self.id, position: { ...self.pos } })
    }
    return
  }
  const target = findCombatant(state, self.lockedTargetId)
  if (target && target.alive) {
    const moved = moveToward(self, target, BASE_MOVE_SPEED * (plan?.speedMult ?? 1), state.combatants)
    if (moved) emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
  }
}

function evalActionTactics(state: BattleState, self: Combatant): boolean {
  for (const t of self.tactics) {
    if (t.def.channel !== 'action' || !t.def.action) continue
    if (onCooldown(self, t) || usedUp(self, t)) continue
    const res = t.def.action(self, state, t.rank)
    if (res) {
      markFired(self, t)
      if (res.applyStatusToSelf) addStatus(self, res.applyStatusToSelf)
      return true   // an action tactic fired (it owns the turn's action)
    }
  }
  return false
}

function evalReactions(state: BattleState, self: Combatant): ReactionResult | null {
  for (const t of self.tactics) {
    if (t.def.channel !== 'reaction' || !t.def.reaction) continue
    if (onCooldown(self, t) || usedUp(self, t)) continue
    const res = t.def.reaction(self, state, t.rank)
    if (res) { markFired(self, t); return res }
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
    if (target && target.alive) dealAttack(state, self, target, state.calculateDamage(self, target, null, state.round), null)
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
}

function takeTurn(state: BattleState, self: Combatant): void {
  // (1) reaction — may consume the turn
  const reaction = evalReactions(state, self)
  if (reaction && applyReaction(state, self, reaction)) { self.lastHitById = null; return }

  // (3→2) targeting, then movement aimed at the resolved lock
  evalTargeting(state, self)
  executeMovement(state, self, evalMovement(state, self))

  // (4) action — an action tactic (e.g. Shield Wall) owns the action if it fires
  if (!evalActionTactics(state, self)) executeNaiveAction(state, self)

  // consume "hit since last turn" so Counterattacker only fires on fresh hits
  self.lastHitById = null
}

function evalOutcome(state: BattleState): Outcome {
  const playersAlive = state.combatants.some((c) => c.alive && c.team === 'player')
  const enemiesAlive = state.combatants.some((c) => c.alive && c.team === 'enemy')
  if (!enemiesAlive) return 'victory'
  if (!playersAlive) return 'defeat'
  if (state.round >= state.maxRounds) return 'draw'  // §9.2 draw favors defender → loss for the player
  return 'ongoing'
}

// Resolve exactly one round in place (§9.1). No-op once the battle is decided.
export function advanceRound(state: BattleState): BattleState {
  if (state.outcome !== 'ongoing') return state
  state.round += 1

  // §9.1.1 tick status effects
  for (const c of state.combatants) {
    if (c.statuses.length === 0) continue
    const kept = []
    for (const s of c.statuses) {
      s.duration -= 1
      if (s.duration > 0) kept.push(s)
      else emit(state, { round: state.round, type: 'status_expire', sourceId: c.id, extra: { statusId: s.id } })
    }
    c.statuses = kept
  }

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
