// Combat Tactic Engine — combat skill catalog & usage tactics (spec §4, §5).
//
// The "skills give you tactics" merge: every equipped skill becomes an
// action-channel tactic that decides when/where to cast it (`makeSkillTactic`).
// The engine appends these to a unit's tactic list, so behavioural tactics
// (which run on other channels) still steer targeting/movement around the skill.
//
// Skills are keyed by the SAME ids the game uses for active skills, so equipping
// one in the action bar (adapter) both grants the ability and its behaviour.
// Numeric power scales with the unit's learned level.

import { distance } from './grid'
import { EPS } from './constants'
import { livingEnemies, livingAllies, findCombatant, mostInjuredAllyInRange } from './behavior'
import type { BattleState, Combatant, EngineSkill, TacticDef, SkillTargeting } from './types'

// level-scaled coefficient as a formula literal: base at lv1, +per each level.
function coef(base: number, per: number, level: number): string {
  return (base + per * (level - 1)).toFixed(2)
}

function skill(s: Partial<EngineSkill> & Pick<EngineSkill, 'id' | 'name' | 'type' | 'targeting'>): EngineSkill {
  return {
    range: 6, aoeRadius: 0, cooldown: 2, channelTime: 0,
    damageFormula: '', healFormula: '', slot: 'primary',
    ...s,
  }
}

// id → builder(level). Keep ids aligned with the game's SKILL_REGISTRY actives.
export const COMBAT_SKILLS: Record<string, (level: number) => EngineSkill> = {
  'fire-bolt':     (lv) => skill({ id: 'fire-bolt', name: 'Fire Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 2, damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  'frost-bolt':    (lv) => skill({ id: 'frost-bolt', name: 'Frost Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 2, damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  'lightning-bolt':(lv) => skill({ id: 'lightning-bolt', name: 'Lightning Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 3, channelTime: 1, damageFormula: `int * ${coef(1.6, 0.3, lv)}` }),
  'bash':          (lv) => skill({ id: 'bash', name: 'Bash', type: 'attack', targeting: 'single_enemy', range: 1.6, cooldown: 2, damageFormula: `str * ${coef(1.2, 0.3, lv)}` }),
  'heal':          (lv) => skill({ id: 'heal', name: 'Heal', type: 'heal', targeting: 'single_ally', range: 5, cooldown: 2, healFormula: `int * ${coef(1.5, 0.5, lv)}` }),
  'aoe-heal':      (lv) => skill({ id: 'aoe-heal', name: 'Sanctuary', type: 'heal', targeting: 'aoe_ally', range: 0, aoeRadius: 2.5, cooldown: 4, healFormula: `int * ${coef(1.0, 0.3, lv)}` }),
  'boost-agility': () =>   skill({ id: 'boost-agility', name: 'Boost Agility', type: 'buff', targeting: 'single_ally', range: 5, cooldown: 5, statusApplied: 'agi-up' }),
  'hammer-fall':   (lv) => skill({ id: 'hammer-fall', name: 'Hammer Fall', type: 'aoe', targeting: 'aoe_enemy', range: 2, aoeRadius: 1.8, cooldown: 4, damageFormula: `str * ${coef(0.8, 0.2, lv)}`, statusApplied: 'stunned' }),

  // Phase 2 — spatial: DoT, knockback, ground zones, root + retreat.
  'poison':        () =>   skill({ id: 'poison', name: 'Poison', type: 'debuff', targeting: 'single_enemy', range: 5, cooldown: 4, statusApplied: 'poisoned' }),
  'arrow-shower':  (lv) => skill({ id: 'arrow-shower', name: 'Arrow Shower', type: 'aoe', targeting: 'aoe_enemy', range: 6, aoeRadius: 1.8, cooldown: 4, damageFormula: `str * ${coef(0.7, 0.15, lv)}`, knockback: 2 }),
  'firewall':      (lv) => skill({ id: 'firewall', name: 'Firewall', type: 'aoe', targeting: 'aoe_point', range: 5, aoeRadius: 1.6, cooldown: 6, retreatAfter: 1.5, zone: { dotDamage: 3 + lv, duration: 3 } }),
  'ankle-snare':   () =>   skill({ id: 'ankle-snare', name: 'Ankle Snare', type: 'debuff', targeting: 'single_enemy', range: 5, cooldown: 5, statusApplied: 'rooted', retreatAfter: 1.5 }),
}

export function buildEngineSkill(id: string, level: number): EngineSkill | null {
  const make = COMBAT_SKILLS[id]
  return make ? make(Math.max(1, level)) : null
}

const isAllyTargeting = (t: SkillTargeting) => t === 'self' || t === 'single_ally' || t === 'aoe_ally'

function inRange(self: Combatant, c: Combatant, range: number): boolean {
  return distance(self.pos, c.pos) <= range + EPS
}
function nearest(self: Combatant, list: Combatant[]): Combatant {
  return list.reduce((a, b) => {
    const da = distance(self.pos, a.pos), db = distance(self.pos, b.pos)
    return db < da - EPS || (Math.abs(db - da) <= EPS && b.id < a.id) ? b : a
  })
}

// Decide the primary target id for a skill, or null if it shouldn't fire now.
export function selectSkillTarget(self: Combatant, state: BattleState, sk: EngineSkill): string | null {
  if (sk.targeting === 'self') return self.id

  if (isAllyTargeting(sk.targeting)) {
    if (sk.type === 'heal') {
      // AoE heal centers on self; fire only if a nearby ally is hurt.
      if (sk.targeting === 'aoe_ally') {
        const hurt = livingAllies(state, self).some((a) => a.hp < a.maxHp && inRange({ ...self }, a, sk.aoeRadius))
        return hurt ? self.id : null
      }
      const ally = mostInjuredAllyInRange(state, self, sk.range || Infinity)
      return ally ? ally.id : null
    }
    // buff: an ally (preferring self) in range that lacks the status
    const cands = livingAllies(state, self).filter(
      (a) => inRange(self, a, sk.range || Infinity) && (!sk.statusApplied || !a.statuses.some((s) => s.id === sk.statusApplied)),
    )
    if (cands.length === 0) return null
    return (cands.find((c) => c.id === self.id) ?? nearest(self, cands)).id
  }

  // enemy targeting: prefer the locked target if it's a valid in-range enemy
  const locked = findCombatant(state, self.lockedTargetId)
  if (locked && locked.alive && locked.team !== self.team && inRange(self, locked, sk.range)) return locked.id
  const enemies = livingEnemies(state, self).filter((e) => inRange(self, e, sk.range))
  return enemies.length ? nearest(self, enemies).id : null
}

// The action-channel tactic that a skill brings with it (the merge). Fires when
// the skill is off cooldown and a valid target exists; otherwise yields to the
// next tactic / basic attack.
export function makeSkillTactic(sk: EngineSkill): TacticDef {
  return {
    id: `skill:${sk.id}`,
    name: sk.name,
    description: `Use ${sk.name} when ready.`,
    scope: 'unit',
    channel: 'action',
    action: (self, state) => {
      if ((self.skillCooldowns[sk.id] ?? 0) > 0) return null
      const targetId = selectSkillTarget(self, state, sk)
      return targetId ? { castSkill: sk, skillTarget: targetId } : null
    },
  }
}
