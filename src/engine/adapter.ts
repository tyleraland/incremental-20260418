// RPG → engine boundary (spec §13.3). Maps the host game's resolved units and
// monster definitions into the engine's stat-only EngineUnitInput. The engine
// owns no stat definitions; this is where the game's stats are projected in.

import type { Unit, DerivedStats, MonsterDef } from '@/types'
import type { EngineUnitInput, EngineSkill, Team, TacticRef } from './types'
import { buildEngineSkill, inheritedTacticIds } from './skills'

// "Skills give you tactics" (behavioural flavour): append the tactics a unit's
// equipped skills bring along, deduped against what it already runs explicitly
// and minus any it has chosen to decouple. Inherited tactics sit *after* the
// explicit ones (lower priority) and don't count against the manual slot cap —
// they're free with the skill, just like the per-skill cast tactic already is.
function withInheritedTactics(explicit: TacticRef[], skills: EngineSkill[], suppressed: readonly string[] = []): TacticRef[] {
  const have = new Set(explicit.map((t) => t.id))
  const inherited = inheritedTacticIds(skills.map((s) => s.id))
    .filter((id) => !have.has(id) && !suppressed.includes(id))
    .map((id) => ({ id, rank: 1 }))
  return inherited.length ? [...explicit, ...inherited] : explicit
}

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
// Melee stops ~1.1 away (just shy of contact). Ranged is tiered: long-range
// weapons (bows, staves) reach 6 cells; medium-range (rods, wands, monster
// spitters like Living Nightshade or Giant Frog) reach 4. Melee reach must
// stay above SEPARATION (0.7) so an attacker isn't pushed back out of range
// by the spacing rule.
const MELEE_GRID_RANGE = 1.1
const RANGED_FEET_THRESHOLD = 5   // game attackRange > this ⇒ ranged

// Map a game-feet attack range to an engine grid range. The threshold at 25 ft
// separates "true bowman / mage" (35 ft bow, 28 ft staff) from "medium ranged"
// (20 ft rod/nightshade, 18 ft wand, 15 ft poacher). Returning 0 means melee.
function gridRangeFromFeet(feet: number): number {
  if (feet <= RANGED_FEET_THRESHOLD) return 0   // melee
  if (feet >= 25) return 6                       // long-range (bow, staff, skeleton archer, ruins specter)
  return 4                                       // medium-range
}

// game moveSpeed (ft/s) → engine moveSpeed (grid units/round).
// 10 ft/s maps to 0.9 grid/round — the baseline for heroes and medium-speed
// monsters. 0 ft/s stays 0 so stationary monsters never drift from their spawn.
const MOVE_SCALE = 0.09
// Heroes move a flat multiple faster than their raw stat — a uniform party-speed
// dial (monsters are unaffected). Bump this to make the whole party brisker.
const HERO_MOVE_MULT = 1.5

export function unitToEngineInput(unit: Unit, derived: DerivedStats, team: Team): EngineUnitInput {
  const rangedRange = gridRangeFromFeet(derived.attackRange)
  const ranged = rangedRange > 0
  const skills = equippedCombatSkills(unit)
  return {
    id: unit.id,
    name: unit.name,
    team,
    str: derived.attack,
    def: derived.defense,
    int: derived.magicAttack,
    spd: derived.attackSpeed,
    magicDef: derived.magicDefense,
    maxHp: derived.maxHp,
    hp: Math.max(0, Math.min(unit.health, derived.maxHp)),
    preferredRank: ranged ? 'back' : 'front',
    meleeRange: MELEE_GRID_RANGE,
    rangedRange,
    moveSpeed: derived.moveSpeed * MOVE_SCALE * HERO_MOVE_MULT,
    attackElement: derived.attackElement,   // §3 weapon-imbued attack element
    armorElement: derived.armorElement,     // §3 armor-imbued defensive element
    skills,                               // action-bar skills → casts (each injects its usage tactic)
    tactics: withInheritedTactics(unit.tactics ?? [], skills, unit.suppressedTactics),  // explicit + skill-inherited (§5)
    // §threat / §passive — defensive passives the skills granted (see getDerivedStats)
    threatMult: derived.threatMult,
    armorReduction: derived.armorReduction,
    dodgePeriod: derived.dodgePeriod || undefined,
  }
}

export function monsterToEngineInput(def: MonsterDef, instanceId: string, team: Team): EngineUnitInput {
  const rangedRange = gridRangeFromFeet(def.stats.attackRange ?? RANGED_FEET_THRESHOLD)
  const ranged = rangedRange > 0
  const defense = def.stats.defense[0] + def.stats.defense[1]   // ability + armor
  const magicDefense = def.stats.magicDefense[0] + def.stats.magicDefense[1]
  // Optional skill kit — same merge as heroes: each becomes an action-channel
  // tactic via makeSkillTactic, so a monster with `skills` gets sensible
  // when-to-cast behavior for free.
  const skills: EngineSkill[] = []
  for (const { id, level } of def.skills ?? []) {
    const built = buildEngineSkill(id, level)
    if (built) skills.push(built)
  }
  return {
    id: instanceId,
    name: def.name,
    team,
    str: def.stats.attack,
    def: defense,
    int: def.stats.magicAttack,
    spd: def.stats.attackSpeed,
    magicDef: magicDefense,
    maxHp: def.health,
    hp: def.health,
    preferredRank: ranged ? 'back' : 'front',
    meleeRange: MELEE_GRID_RANGE,
    rangedRange,
    moveSpeed: (def.stats.moveSpeed ?? 10) * MOVE_SCALE,
    attackElement: 'neutral',   // §3 monsters attack neutral; def.element is defensive
    armorElement: def.element,
    skills,
    tactics: withInheritedTactics(def.tactics ?? [], skills),   // explicit + skill-inherited (§5)
    // §threat / §passive — optional per-monster combat mechanics (a Stone Sentinel
    // is armored; a future boss could carry a high threatMult).
    threatMult: def.threatMult,
    armorReduction: def.armorReduction,
    dodgePeriod: def.dodgePeriod,
  }
}
