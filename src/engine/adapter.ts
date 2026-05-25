// RPG → engine boundary (spec §13.3). Maps the host game's resolved units and
// monster definitions into the engine's stat-only EngineUnitInput. The engine
// owns no stat definitions; this is where the game's stats are projected in.

import type { Unit, DerivedStats, MonsterDef } from '@/types'
import type { EngineUnitInput, EngineSkill, Team } from './types'
import { buildEngineSkill } from './skills'

// Active skills the unit has slotted on its action bar (kind === 'skill') and
// that exist in the combat catalog become usable in combat — equipping is how
// you "learn to use" them (each brings its own usage tactic, see engine §5).
function equippedCombatSkills(unit: Unit): EngineSkill[] {
  const out: EngineSkill[] = []
  const seen = new Set<string>()
  for (const slot of unit.actionSlots ?? []) {
    if (!slot || slot.kind !== 'skill' || seen.has(slot.id)) continue
    const built = buildEngineSkill(slot.id, unit.learnedSkills?.[slot.id] ?? 1)
    if (built) { out.push(built); seen.add(slot.id) }
  }
  return out
}

// The engine grid is 5×10 abstract units; the game's "feet" don't map 1:1.
// We collapse to two reach bands: melee stops ~1.1 away (just shy of contact),
// ranged fires from ~4. Melee reach must stay above SEPARATION (0.7) so an
// attacker isn't pushed back out of range by the spacing rule.
const MELEE_GRID_RANGE = 1.1
const RANGED_GRID_RANGE = 4
const RANGED_FEET_THRESHOLD = 5   // game attackRange > this ⇒ ranged

export function unitToEngineInput(unit: Unit, derived: DerivedStats, team: Team): EngineUnitInput {
  const ranged = derived.attackRange > RANGED_FEET_THRESHOLD
  return {
    id: unit.id,
    name: unit.name,
    team,
    str: derived.attack,
    def: derived.defense,
    int: derived.magicAttack,
    spd: derived.attackSpeed,
    maxHp: derived.maxHp,
    hp: Math.max(0, Math.min(unit.health, derived.maxHp)),
    preferredRank: ranged ? 'back' : 'front',
    meleeRange: MELEE_GRID_RANGE,
    rangedRange: ranged ? RANGED_GRID_RANGE : 0,
    skills: equippedCombatSkills(unit),   // action-bar skills → casts (each injects its usage tactic)
    tactics: unit.tactics ?? [],          // player-equipped tactics drive engine behavior (§5)
  }
}

export function monsterToEngineInput(def: MonsterDef, instanceId: string, team: Team): EngineUnitInput {
  const ranged = (def.stats.attackRange ?? RANGED_FEET_THRESHOLD) > RANGED_FEET_THRESHOLD
  const defense = def.stats.defense[0] + def.stats.defense[1]   // ability + armor
  return {
    id: instanceId,
    name: def.name,
    team,
    str: def.stats.attack,
    def: defense,
    int: def.stats.magicAttack,
    spd: def.stats.attackSpeed,
    maxHp: def.health,
    hp: def.health,
    preferredRank: ranged ? 'back' : 'front',
    meleeRange: MELEE_GRID_RANGE,
    rangedRange: ranged ? RANGED_GRID_RANGE : 0,
    skills: [],
  }
}
