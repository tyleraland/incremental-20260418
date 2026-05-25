// Combat Tactic Engine — round resolution (spec §9, §10, §11, §16).
//
// Deterministic, round-based, grid autobattle. `createBattle` clones the input
// roster (never mutating it, §16.5); `advanceRound` resolves exactly one round
// in place so the host can step combat "one round per N ticks"; `resolve` runs
// to completion for tests and bulk/idle resolution.

import { BASE_MOVE_SPEED, MAX_ROUNDS } from './constants'
import { startingPosition, moveToward, attackReach, distance } from './grid'
import { defaultCalculateDamage, calculateHeal, effectiveStat } from './damage'
import {
  selectTarget, chooseAction, findCombatant, livingEnemies, livingAllies,
} from './behavior'
import type {
  BattleState, BattleResult, BattleStats, Combatant, CombatSetup,
  EngineUnitInput, Outcome, Team, BattleEvent, EngineSkill,
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

function makeCombatant(input: EngineUnitInput, index: number, pos: { x: number; y: number }): Combatant {
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
  }
}

export function createBattle(setup: CombatSetup): BattleState {
  const combatants: Combatant[] = []
  let index = 0
  const place = (units: EngineUnitInput[], team: Team) => {
    units.forEach((u, i) => {
      const pos = startingPosition(team, u.preferredRank, i)
      combatants.push(makeCombatant({ ...u, team }, index++, pos))
    })
  }
  place(setup.playerUnits, 'player')
  place(setup.enemyUnits, 'enemy')

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
function applyDamage(
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

function recordSkillUse(state: BattleState, self: Combatant, skill: EngineSkill): void {
  if (!state.stats.skillsUsedByUnit[self.id]) state.stats.skillsUsedByUnit[self.id] = []
  state.stats.skillsUsedByUnit[self.id].push(skill.id)
  self.skillCooldowns[skill.id] = skill.cooldown
}

function takeTurn(state: BattleState, self: Combatant): void {
  // §5.3 step 3 — targeting (default: keep lock, else nearest enemy)
  const prevTarget = selectTarget(state, self)
  if (prevTarget !== null && self.lockedTargetId) {
    emit(state, {
      round: state.round, type: 'target_switch',
      sourceId: self.id, targetId: self.lockedTargetId,
      extra: { from: prevTarget },
    })
  }

  const target = findCombatant(state, self.lockedTargetId)

  // §5.3 step 2/5 — movement toward the locked target
  if (target && target.alive) {
    const moved = moveToward(self, target, BASE_MOVE_SPEED, state.combatants)
    if (moved) {
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
  }

  // §5.3 step 4/5 — action (default: naive skill logic, else basic attack)
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

  const target2 = findCombatant(state, action.targetId)
  if (!target2 || !target2.alive) return

  const skill = action.kind === 'skill' ? action.skill : null
  const dmg = state.calculateDamage(self, target2, skill, state.round)

  if (skill) {
    recordSkillUse(state, self, skill)
    emit(state, { round: state.round, type: 'skill_use', sourceId: self.id, targetId: target2.id, value: dmg, skillId: skill.id })
  } else {
    const type = self.rangedRange > 0 ? 'ranged_attack' : 'melee_attack'
    emit(state, { round: state.round, type, sourceId: self.id, targetId: target2.id, value: dmg })
  }
  applyDamage(state, self, target2, dmg)
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

  // §9.1.2 tick cooldowns
  for (const c of state.combatants) {
    for (const id of Object.keys(c.skillCooldowns)) {
      if (c.skillCooldowns[id] > 0) c.skillCooldowns[id] -= 1
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
