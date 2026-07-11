// Combat Tactic Engine — public surface.
// Round-based, deterministic, RNG-free spatial autobattle on a per-battle grid
// (15×15 encounters, larger for open-world). Full system: grid/movement, turn
// order, damage/heal, the tactic channels + catalog, skills, statuses, ground
// zones, snapshots, events, win/loss. See CLAUDE.md / AGENTS.md for the spec.

export * from './types'
export {
  COLS, ROWS, BASE_MOVE_SPEED, SEPARATION, MAX_ROUNDS, STEALTH_ATTACK_BONUS,
  FRONT_ROWS, MID_ROWS, PERIMETER_MARGIN, DEPLOY_FRONT, MULTI_ATTACK_MAX,
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
export { createBattle, addCombatant, relinkCombatant, issueMoveOrder, clearMoveOrder, advanceRound, resolve, finalize, defaultPlanner } from './engine'
export { unitToEngineInput, monsterToEngineInput, companionToEngineInput, COMPANION_LEASH } from './adapter'
export {
  TACTIC_REGISTRY, resolveTactics, getTactic, hasTactic,
  armoredFactor, nimblePeriod,
} from './tactics'
export { COMBAT_SKILLS, buildEngineSkill, makeSkillTactic, selectSkillTarget, SKILL_TACTICS, inheritedTacticIds, isChanneledAoe, isOffensiveAoe, skillActiveCap } from './skills'
export { preferredAttackVs, preferredRangeVs, exposureAt, corridorExposure, forecastAction, scoreCandidate } from './plan'
export type { ActionForecast, MoveCandidate, PreferredAttack } from './plan'
export { POSTURES, postureOf } from './tuning'
export type { PostureRow } from './tuning'
export { STATUS_REGISTRY, buildStatus } from './status'
export { serializeBattle, deserializeBattle } from './snapshot'
export { ALL_ELEMENTS, elementMultiplier } from './elements'
export { arenaBarriers, pointBlocked, traceMove, slideMove, steerAround, canReach, sightlineClear } from './barriers'
