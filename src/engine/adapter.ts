// RPG → engine boundary (spec §13.3). Maps the host game's resolved units and
// monster definitions into the engine's stat-only EngineUnitInput. The engine
// owns no stat definitions; this is where the game's stats are projected in.

import type { Unit, DerivedStats, MonsterDef } from '@/types'
import type { EngineUnitInput, Team, TacticRef } from './types'

// The engine grid is 5×10 abstract units; the game's "feet" don't map 1:1.
// We collapse to two reach bands: melee stops ~1.5 away, ranged fires from ~4.
const MELEE_GRID_RANGE = 1.5
const RANGED_GRID_RANGE = 4
const RANGED_FEET_THRESHOLD = 5   // game attackRange > this ⇒ ranged

// Placeholder loadout until the equip UI lets players pick tactics: melee units
// charge in behind their armor; ranged units pick off the wounded and stay slippery.
function defaultTactics(ranged: boolean): TacticRef[] {
  return ranged
    ? [{ id: 'opportunist', rank: 1 }, { id: 'nimble', rank: 1 }]
    : [{ id: 'charger', rank: 1 }, { id: 'armored', rank: 1 }]
}

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
    skills: [],   // active-skill mapping is a later layer; naive basic attacks for now
    tactics: defaultTactics(ranged),
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
