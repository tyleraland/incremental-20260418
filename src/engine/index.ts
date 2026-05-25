// Combat Tactic Engine — public surface.
// Round-based, deterministic 5v5 grid autobattle (see spec in repo history).
// v0.1: engine core only — grid, movement, turn order, damage/heal, naive
// behavior, status scaffolding, events, win/loss. Tactics and the catalog are
// future layers that plug into the channels described in the spec.

export * from './types'
export {
  COLS, ROWS, BASE_MOVE_SPEED, SEPARATION, MAX_ROUNDS,
  FRONT_ROWS, MID_ROWS, PERIMETER_LEFT, PERIMETER_RIGHT, RANK_START_Y,
} from './constants'
export {
  distance, rankOf, rowsFromEdge, isPerimeter, startingPosition, attackReach,
} from './grid'
export {
  variation, evalFormula, effectiveStat, defaultCalculateDamage, calculateHeal,
} from './damage'
export { selectTarget, chooseAction, livingEnemies, livingAllies, findCombatant } from './behavior'
export { createBattle, advanceRound, resolve, finalize } from './engine'
export { unitToEngineInput, monsterToEngineInput } from './adapter'
export {
  TACTIC_REGISTRY, resolveTactics, getTactic, hasTactic,
  chargerBonus, armoredFactor, nimblePeriod, tauntBiasOf,
} from './tactics'
export { COMBAT_SKILLS, buildEngineSkill, makeSkillTactic, selectSkillTarget } from './skills'
export { STATUS_REGISTRY, buildStatus } from './status'
