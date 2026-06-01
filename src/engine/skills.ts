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

import { distance, moveSpeedOf } from './grid'
import { EPS } from './constants'
import { livingEnemies, livingAllies, isStealthed, findCombatant, mostInjuredAllyInRange } from './behavior'
import { visibleEnemiesOf } from './spatial'
import { sightlineClear } from './barriers'
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
  'fire-bolt':     (lv) => skill({ id: 'fire-bolt', name: 'Fire Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 2, channelTime: 2, element: 'fire', damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  'frost-bolt':    (lv) => skill({ id: 'frost-bolt', name: 'Frost Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 2, element: 'water', damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  'lightning-bolt':(lv) => skill({ id: 'lightning-bolt', name: 'Lightning Bolt', type: 'attack', targeting: 'single_enemy', range: 8, cooldown: 3, channelTime: 3, element: 'lightning', damageFormula: `int * ${coef(1.6, 0.3, lv)}` }),
  'bash':          (lv) => skill({ id: 'bash', name: 'Bash', type: 'attack', targeting: 'single_enemy', range: 1.2, cooldown: 2, damageFormula: `str * ${coef(1.2, 0.3, lv)}` }),
  'heal':          (lv) => skill({ id: 'heal', name: 'Heal', type: 'heal', targeting: 'single_ally', range: 5, cooldown: 2, healFormula: `int * ${coef(1.5, 0.5, lv)}` }),
  'aoe-heal':      (lv) => skill({ id: 'aoe-heal', name: 'Sanctuary', type: 'heal', targeting: 'aoe_ally', range: 0, aoeRadius: 2.5, cooldown: 4, healFormula: `int * ${coef(1.0, 0.3, lv)}` }),
  'boost-agility': () =>   skill({ id: 'boost-agility', name: 'Boost Agility', type: 'buff', targeting: 'single_ally', range: 5, cooldown: 5, statusApplied: 'agi-up' }),
  'hammer-fall':   (lv) => skill({ id: 'hammer-fall', name: 'Hammer Fall', type: 'aoe', targeting: 'aoe_enemy', range: 2, aoeRadius: 1.8, cooldown: 4, damageFormula: `str * ${coef(0.8, 0.2, lv)}`, statusApplied: 'stunned' }),

  // Phase 2 — spatial: DoT, knockback, ground zones, root + retreat.
  'poison':        () =>   skill({ id: 'poison', name: 'Poison', type: 'debuff', targeting: 'single_enemy', range: 1.2, cooldown: 4, statusApplied: 'poisoned' }),
  'arrow-shower':  (lv) => skill({ id: 'arrow-shower', name: 'Arrow Shower', type: 'aoe', targeting: 'aoe_enemy', range: 6, aoeRadius: 1.8, cooldown: 4, damageFormula: `str * ${coef(0.7, 0.15, lv)}`, knockback: 3 }),
  'firewall':      (lv) => skill({ id: 'firewall', name: 'Firewall', type: 'aoe', targeting: 'aoe_point', range: 5, aoeRadius: 1.6, cooldown: 6, channelTime: 2, element: 'fire', retreatAfter: 2.5, zone: { dotDamage: 3 + lv, duration: 3 } }),
  // Lightning Storm: a wide, long-lived cloud that zaps anything inside it for 1
  // lightning/round (§2 zones). The catch is a *very* long channel — easy to
  // interrupt — so it's a high-risk pre-positioned nuke, not a panic button.
  // ~10 real-seconds of storm at ~2.5 rounds/sec ⇒ ~24 rounds of duration.
  // Range matches Lightning Bolt's so a kiting mage (which holds its longest
  // skill range) can actually land the storm from where it stands, instead of
  // hanging back at bolt range with the cloud just out of reach.
  'lightning-storm':() => skill({ id: 'lightning-storm', name: 'Lightning Storm', type: 'aoe', targeting: 'aoe_point', range: 8, aoeRadius: 2.6, cooldown: 10, channelTime: 5, element: 'lightning', zone: { dotDamage: 1, duration: 24, element: 'lightning' } }),
  'ankle-snare':   () =>   skill({ id: 'ankle-snare', name: 'Ankle Snare', type: 'debuff', targeting: 'single_enemy', range: 5, cooldown: 5, statusApplied: 'rooted' }),

  // Phase 3 — behavioural & combos: freeze→amplify, stealth, dispel/reveal.
  'freeze':        (lv) => skill({ id: 'freeze', name: 'Freeze', type: 'debuff', targeting: 'single_enemy', range: 6, cooldown: 5, channelTime: 2, element: 'water', damageFormula: `int * ${coef(0.5, 0.1, lv)}`, statusApplied: 'frozen' }),
  'cloak':         () =>   skill({ id: 'cloak', name: 'Cloak', type: 'buff', targeting: 'self', cooldown: 6, statusApplied: 'stealthed' }),
  'back-stab':     (lv) => skill({ id: 'back-stab', name: 'Back Stab', type: 'attack', targeting: 'single_enemy', range: 1.6, cooldown: 3, damageFormula: `str * ${coef(1.0, 0.2, lv)}`, stealthBonus: 2.5 }),
  'sight':         () =>   skill({ id: 'sight', name: 'Sight', type: 'debuff', targeting: 'aoe_enemy', range: 6, aoeRadius: 2.5, cooldown: 4, removesStatusId: 'stealthed' }),
  'dispel':        () =>   skill({ id: 'dispel', name: 'Dispel', type: 'debuff', targeting: 'single_enemy', range: 6, cooldown: 4, dispelCategory: 'buff' }),
}

export function buildEngineSkill(id: string, level: number): EngineSkill | null {
  const make = COMBAT_SKILLS[id]
  return make ? make(Math.max(1, level)) : null
}

// Behavioural tactics a skill "brings along": equip the skill and you inherit
// the tactic that makes it shine, *without* spending a manual tactic slot — the
// adapter injects these (deduped against what you've equipped explicitly). The
// pairing is intentional coupling: an AoE nuke wants to aim at clusters
// (Storm Caller); a cloak wants to stalk the flank before it strikes (Ambusher).
// A unit can opt out per-tactic via `suppressedTactics` (the UI's "decouple").
export const SKILL_TACTICS: Record<string, string[]> = {
  'hammer-fall':     ['storm-caller'],
  'arrow-shower':    ['storm-caller'],
  'firewall':        ['storm-caller'],
  'lightning-storm': ['storm-caller'],
  'cloak':           ['ambusher'],
}

// Distinct tactic ids inherited from a set of equipped skill ids, in first-seen
// order. Pure lookup over SKILL_TACTICS — the adapter handles dedupe/suppression.
export function inheritedTacticIds(skillIds: Iterable<string>): string[] {
  const out: string[] = []
  for (const id of skillIds) {
    for (const t of SKILL_TACTICS[id] ?? []) if (!out.includes(t)) out.push(t)
  }
  return out
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
  if (sk.targeting === 'self') {
    // don't re-cast a self-buff that's already active (Cloak, etc.)
    if (sk.statusApplied && self.statuses.some((s) => s.id === sk.statusApplied)) return null
    return self.id
  }

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

  // enemy targeting: respect stealth (except reveal skills) AND walls (no firing
  // through them — cliffs let line of sight through, walls don't). A pure debuff
  // (no damage formula) skips targets already bearing the status — no point
  // re-rooting a rooted enemy. Skills with both damage AND a status (freeze)
  // still re-cast for the damage.
  const canSeeStealth = sk.removesStatusId === 'stealthed'
  const visible = (e: Combatant) =>
    (canSeeStealth || !isStealthed(e)) && sightlineClear(self.pos, e.pos, state.barriers)
  const redundant = (e: Combatant) =>
    !!sk.statusApplied && !sk.damageFormula && e.statuses.some((s) => s.id === sk.statusApplied)
  const locked = findCombatant(state, self.lockedTargetId)
  if (locked && locked.alive && locked.team !== self.team && visible(locked) && inRange(self, locked, sk.range) && !redundant(locked)) return locked.id
  const pool = (canSeeStealth ? livingEnemies(state, self) : visibleEnemiesOf(state, self))
    .filter((e) => inRange(self, e, sk.range) && sightlineClear(self.pos, e.pos, state.barriers) && !redundant(e))
  return pool.length ? nearest(self, pool).id : null
}

// Minimum enemies in the blast to justify committing a long AoE *channel* over
// just nuking the primary target single-target.
const MIN_AOE_CHANNEL_TARGETS = 2

export const isOffensiveAoe = (sk: EngineSkill): boolean =>
  sk.targeting === 'aoe_enemy' || sk.targeting === 'aoe_point'
// A long-channel AoE (Lightning Storm) is the one cast where "which skill" is a
// real choice — it ties the caster up for several rounds, so it should only win
// out over a quick single-target nuke when it actually pays off. Instant AoE
// (Hammer Fall, Arrow Shower) has no channel to lose and is unaffected.
export const isChanneledAoe = (sk: EngineSkill): boolean => sk.channelTime >= 1 && isOffensiveAoe(sk)

// Is firing this channeled AoE *now* worth it? Two gates, matching the player's
// own reasoning: (1) it must catch a cluster, not a lone target, and (2) we must
// be able to finish the channel — no enemy close enough to reach us and break it
// before it lands (a tank soaking out front is exactly what makes this safe).
function channeledAoeWorthIt(self: Combatant, state: BattleState, sk: EngineSkill, primary: Combatant): boolean {
  const enemies = livingEnemies(state, self)
  const inBlast = enemies.filter((e) => distance(e.pos, primary.pos) <= sk.aoeRadius + EPS).length
  if (inBlast < MIN_AOE_CHANNEL_TARGETS) return false
  const turns = sk.channelTime + 1   // cast-start round + each channel round the threat can keep closing
  return !enemies.some((e) => {
    const reach = e.rangedRange > 0 ? e.rangedRange : e.meleeRange
    return distance(self.pos, e.pos) - moveSpeedOf(e) * turns <= reach + EPS
  })
}

// §cloak (ambush-only) gate. A self-cast stealth skill is only worth using when
// the unit can slip away and set up a strike — never mid-melee and never with
// nothing to ambush:
//   • not engaged — no damage dealt/taken for CLOAK_CALM_ROUNDS rounds, and
//   • room to vanish — no enemy within CLOAK_MIN_GAP cells, and
//   • a reason to — at least one enemy in sight to stalk (so it's pointless on an
//     empty field; in encounters vision is ∞ so any living foe counts).
const CLOAK_MIN_GAP = 6
const CLOAK_CALM_ROUNDS = 5
const isStealthSkill = (sk: EngineSkill): boolean => sk.targeting === 'self' && sk.statusApplied === 'stealthed'
function canCloak(self: Combatant, state: BattleState): boolean {
  if (state.round - self.lastDamageRound < CLOAK_CALM_ROUNDS) return false   // recently in combat → engaged
  const foes = livingEnemies(state, self)
  if (foes.some((e) => distance(self.pos, e.pos) <= CLOAK_MIN_GAP)) return false   // someone's right on top of us
  return foes.some((e) => distance(self.pos, e.pos) <= self.visionRange)            // a foe in sight worth ambushing
}

// The action-channel tactic that a skill brings with it (the merge). Fires when
// the skill is off cooldown and a valid target exists; otherwise yields to the
// next tactic / basic attack. A long AoE channel additionally yields unless it'd
// hit a cluster from safety, so the caster falls through to its single-target
// nuke when an area cast wouldn't pay off (§4 cluster/safety gate). A self-cast
// cloak only fires from the ambush window (canCloak).
export function makeSkillTactic(sk: EngineSkill): TacticDef {
  const gated = isChanneledAoe(sk)
  const cloak = isStealthSkill(sk)
  return {
    id: `skill:${sk.id}`,
    name: sk.name,
    description: `Use ${sk.name} when ready.`,
    scope: 'unit',
    channel: 'action',
    action: (self, state) => {
      if ((self.skillCooldowns[sk.id] ?? 0) > 0) return null
      if (cloak && !canCloak(self, state)) return null
      const targetId = selectSkillTarget(self, state, sk)
      if (!targetId) return null
      if (gated) {
        const primary = findCombatant(state, targetId)
        if (!primary || !channeledAoeWorthIt(self, state, sk, primary)) return null
      }
      return { castSkill: sk, skillTarget: targetId }
    },
  }
}
