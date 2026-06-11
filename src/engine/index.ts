// Combat Tactic Engine — public surface.
// Round-based, deterministic 5v5 grid autobattle (see spec in repo history).
// v0.1: engine core only — grid, movement, turn order, damage/heal, naive
// behavior, status scaffolding, events, win/loss. Tactics and the catalog are
// future layers that plug into the channels described in the spec.

export * from './types'
export {
  COLS, ROWS, BASE_MOVE_SPEED, SEPARATION, MAX_ROUNDS, STEALTH_ATTACK_BONUS,
  FRONT_ROWS, MID_ROWS, PERIMETER_LEFT, PERIMETER_RIGHT, DEPLOY_FRONT,
} from './constants'
export {
  distance, rankOf, rowsFromEdge, isPerimeter, startingPosition, attackReach, moveTowardPoint, moveSpeedOf,
} from './grid'
export {
  alliesOf, visibleEnemiesOf, lockedTarget, centroid, nearestTo,
  nearestEnemyTo, squishiestAlly, flankPoint, guardPoint, kiteDistanceFor, isCaster,
} from './spatial'
export {
  variation, evalFormula, effectiveStat, defaultCalculateDamage, calculateHeal,
  skillDamageEstimate, estimateDamageVs, effectiveArmor,
} from './damage'
export { selectTarget, chooseAction, livingEnemies, livingAllies, findCombatant } from './behavior'
export { createBattle, addCombatant, issueMoveOrder, clearMoveOrder, advanceRound, resolve, finalize, defaultPlanner } from './engine'
export { unitToEngineInput, monsterToEngineInput } from './adapter'
export {
  TACTIC_REGISTRY, resolveTactics, getTactic, hasTactic,
  armoredFactor, nimblePeriod,
} from './tactics'
export { COMBAT_SKILLS, buildEngineSkill, makeSkillTactic, selectSkillTarget, SKILL_TACTICS, inheritedTacticIds, isChanneledAoe, isOffensiveAoe, skillActiveCap } from './skills'
export { STATUS_REGISTRY, buildStatus } from './status'
export { serializeBattle, deserializeBattle } from './snapshot'
export { ALL_ELEMENTS, elementMultiplier } from './elements'
export { arenaBarriers, pointBlocked, traceMove, slideMove, steerAround, canReach } from './barriers'
