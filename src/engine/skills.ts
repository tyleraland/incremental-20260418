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
import { scaleRounds } from './timescale'
import { EPS } from './constants'
import { livingEnemies, livingAllies, isStealthed, findCombatant, mostInjuredAllyInRange } from './behavior'
import { visibleEnemiesOf } from './spatial'
import { sightlineClear } from './barriers'
import { firewallBlocks } from './firewall'
import type { BattleState, Combatant, EngineSkill, TacticDef, SkillTargeting } from './types'

// level-scaled coefficient as a formula literal: base at lv1, +per each level.
function coef(base: number, per: number, level: number): string {
  return (base + per * (level - 1)).toFixed(2)
}

// Cooldowns are tracked in engine rounds, but the sim runs ~2.5 rounds/sec
// (store ROUND_EVERY_TICKS=2 over TICKS_PER_SECOND=5), so author them in real
// seconds and convert once. Current tuning: bolts + Heal at 5s, everything else 10s.
const ROUNDS_PER_SEC = 2.5
const cd = (seconds: number) => Math.round(seconds * ROUNDS_PER_SEC)

function skill(s: Partial<EngineSkill> & Pick<EngineSkill, 'id' | 'name' | 'type' | 'targeting'>): EngineSkill {
  return {
    range: 6, aoeRadius: 0, cooldown: 2, channelTime: 0,
    damageFormula: '', healFormula: '', slot: 'primary',
    ...s,
  }
}

// id → builder(level). Keep ids aligned with the game's SKILL_REGISTRY actives.
export const COMBAT_SKILLS: Record<string, (level: number) => EngineSkill> = {
  'fire-bolt':     (lv) => skill({ id: 'fire-bolt', name: 'Fire Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 1, channelTime: 3, element: 'fire', damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  // Fireball: an instant fire burst — it hits a foe and splashes everyone near
  // it for damage RIGHT NOW (no lingering zone, no cast to telegraph), so it
  // can't be side-stepped the way a ground hazard can. Instant ⇒ skips the
  // channeled-AoE cluster gate, so it fires on even a single target.
  'fireball':      (lv) => skill({ id: 'fireball', name: 'Fireball', type: 'aoe', targeting: 'aoe_enemy', range: 6, aoeRadius: 2.0, cooldown: cd(10), channelTime: 0, element: 'fire', damageFormula: `int * ${coef(1.1, 0.25, lv)}` }),
  'frost-bolt':    (lv) => skill({ id: 'frost-bolt', name: 'Frost Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 1, channelTime: 3, element: 'water', damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  // Earth Bolt completes the four-element bolt set (fire/water/wind/earth) — the
  // four are identical (range 6, 3-round channel, 1-round cooldown, int×coef)
  // apart from element, so the AI picks among them purely by matchup.
  'earth-bolt':    (lv) => skill({ id: 'earth-bolt', name: 'Earth Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 1, channelTime: 3, element: 'earth', damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  'lightning-bolt':(lv) => skill({ id: 'lightning-bolt', name: 'Lightning Bolt', type: 'attack', targeting: 'single_enemy', range: 6, cooldown: 1, channelTime: 3, element: 'wind', damageFormula: `int * ${coef(1.0, 0.2, lv)}` }),
  'bash':          (lv) => skill({ id: 'bash', name: 'Bash', type: 'attack', targeting: 'single_enemy', range: 1.2, cooldown: cd(10), damageFormula: `str * ${coef(1.2, 0.3, lv)}` }),
  // Shield Wall: a self-cast defensive cooldown — a big per-level DEF buff (and
  // the unit stops attacking while it holds). The usage gate (canShieldWall, in
  // makeSkillTactic) only fires it when actually under attack, never while roaming.
  'shield-wall':   (lv) => skill({ id: 'shield-wall', name: 'Shield Wall', type: 'buff', targeting: 'self', cooldown: cd(8), statusApplied: 'shield-wall', statusLevel: lv }),
  // Last Stand: a self-cast near-death surge (per-level STR + SPD). Gated to only
  // fire below 20% HP with a foe still up (canLastStand), ~once a fight (long cd).
  'last-stand':    (lv) => skill({ id: 'last-stand', name: 'Last Stand', type: 'buff', targeting: 'self', cooldown: cd(20), statusApplied: 'last-stand', statusLevel: lv }),
  'heal':          (lv) => skill({ id: 'heal', name: 'Heal', type: 'heal', targeting: 'single_ally', range: 5, cooldown: cd(5), healFormula: `int * ${coef(1.5, 0.5, lv)}` }),
  'aoe-heal':      (lv) => skill({ id: 'aoe-heal', name: 'Sanctuary', type: 'heal', targeting: 'aoe_ally', range: 0, aoeRadius: 2.5, cooldown: cd(10), healFormula: `int * ${coef(1.0, 0.3, lv)}` }),
  'boost-agility': () =>   skill({ id: 'boost-agility', name: 'Boost Agility', type: 'buff', targeting: 'single_ally', range: 5, cooldown: 5, statusApplied: 'agi-up', statusMaxActive: 1 }),
  // Bless: per-level offence buff (+lv attack/magic/speed, +2·lv hit), same
  // duration as Agility. Up to 2 active on the team (statusMaxActive). Buffs
  // prefer the caster first, then allies (selectSkillTarget).
  'bless':         (lv) => skill({ id: 'bless', name: 'Bless', type: 'buff', targeting: 'single_ally', range: 5, cooldown: 5, statusApplied: 'blessed', statusLevel: lv, statusMaxActive: 2 }),
  'hammer-fall':   (lv) => skill({ id: 'hammer-fall', name: 'Hammer Fall', type: 'aoe', targeting: 'aoe_enemy', range: 2, aoeRadius: 1.8, cooldown: cd(10), damageFormula: `str * ${coef(0.8, 0.2, lv)}`, statusApplied: 'stunned' }),

  // Phase 2 — spatial: DoT, knockback, ground zones, root + retreat.
  'poison':        () =>   skill({ id: 'poison', name: 'Poison', type: 'debuff', targeting: 'single_enemy', range: 1.2, cooldown: cd(10), statusApplied: 'poisoned' }),
  'arrow-shower':  (lv) => skill({ id: 'arrow-shower', name: 'Arrow Shower', type: 'aoe', targeting: 'aoe_enemy', range: 6, aoeRadius: 1.8, cooldown: cd(10), damageFormula: `str * ${coef(0.7, 0.15, lv)}`, knockback: 3 }),
  // Firewall is a movement tool, not a hazard zone: it raises a 3-wide line of
  // flame (snapped to _ | / \) between the caster and a foe. Foes that try to
  // cross are knocked back perpendicular to it and burned; only after bumping it
  // `maxBumps` times do they break through — so a kiter holds behind it, blasts,
  // and re-walls. Allies pass freely. A FAST cast + short cooldown so you can
  // keep a wall up; capped at maxActive=2 simultaneous walls (at the cap the
  // skill reads as not-ready until one expires). Cooldown/channel/duration here
  // are in engine ROUNDS (not the cd()-seconds the other skills use).
  'firewall':      (lv) => skill({ id: 'firewall', name: 'Firewall', type: 'aoe', targeting: 'aoe_point', range: 6, aoeRadius: 0, cooldown: 10, channelTime: 1, element: 'fire', retreatAfter: 2.5, wall: { fireDamage: 4 + lv, maxBumps: 5, duration: 15, halfWidth: 1.5, maxActive: 2 } }),
  // Lightning Storm: a wide, long-lived cloud that zaps anything inside it for 1
  // lightning/round (§2 zones). The catch is a *very* long channel — easy to
  // interrupt — so it's a high-risk pre-positioned nuke, not a panic button.
  // ~10 real-seconds of storm at ~2.5 rounds/sec ⇒ ~24 rounds of duration.
  // Range 8 — a touch beyond the bolts (all 6) so a kiting mage can drop the cloud
  // from where it holds rather than hanging back with it just out of reach.
  'lightning-storm':() => skill({ id: 'lightning-storm', name: 'Lightning Storm', type: 'aoe', targeting: 'aoe_point', range: 8, aoeRadius: 2.6, cooldown: cd(10), channelTime: 5, element: 'wind', zone: { dotDamage: 1, duration: 24, element: 'wind', maxActive: 1 } }),
  // Molasses: a fast (2-round) AoE *slow* puddle — no damage, but everything
  // standing in it crawls (½ move, much slower to act). A defensive kiting/peel
  // tool: drop it on the chaser to open distance, or on the melee mauling your
  // backline. Up to 3 puddles at once (zone.maxActive); the slow doesn't stack.
  'molasses':      () =>   skill({ id: 'molasses', name: 'Molasses', type: 'aoe', targeting: 'aoe_point', range: 6, aoeRadius: 2.4, cooldown: 4, channelTime: 2, element: 'earth', zone: { dotDamage: 0, duration: 10, element: 'earth', statusApplied: 'slowed', maxActive: 3 } }),
  'ankle-snare':   () =>   skill({ id: 'ankle-snare', name: 'Ankle Snare', type: 'debuff', targeting: 'single_enemy', range: 5, cooldown: cd(10), statusApplied: 'rooted' }),
  // Taunt: the tank's peel. Instant, short range, ~8s cooldown. Forces the target
  // to attack the caster for the Taunted duration (~3s) and jumps the caster to
  // the top of the target's §threat table so aggro doesn't snap back the instant
  // it expires. Targets a foe that's on an ally (see selectSkillTarget peel).
  'taunt':         () =>   skill({ id: 'taunt', name: 'Taunt', type: 'debuff', targeting: 'single_enemy', range: 6, cooldown: cd(8), statusApplied: 'taunted' }),
  // Consecration: a radiant aura the caster *carries*. An instant self-cast that
  // drops hallowed ground centered on the caster; the zone's `follow` flag
  // re-centers it on the caster every round, searing every enemy within 2 spaces
  // for a trickle of radiant damage (devastating to undead/ghost/poison via the
  // §3 matrix). maxActive 1 + a long duration ⇒ cast once, then it just rides
  // along until the caster falls.
  'consecration':  (lv) => skill({ id: 'consecration', name: 'Consecration', type: 'aoe', targeting: 'self', range: 0, aoeRadius: 2, cooldown: cd(8), element: 'radiant', zone: { dotDamage: 1 + Math.floor((lv - 1) / 2), duration: 999, element: 'radiant', maxActive: 1, follow: true } }),

  // Phase 3 — behavioural & combos: freeze→amplify, stealth, dispel/reveal.
  'freeze':        (lv) => skill({ id: 'freeze', name: 'Freeze', type: 'debuff', targeting: 'single_enemy', range: 6, cooldown: cd(10), channelTime: 2, element: 'water', damageFormula: `int * ${coef(0.5, 0.1, lv)}`, statusApplied: 'frozen' }),
  'cloak':         () =>   skill({ id: 'cloak', name: 'Cloak', type: 'buff', targeting: 'self', cooldown: cd(10), statusApplied: 'stealthed' }),
  'back-stab':     (lv) => skill({ id: 'back-stab', name: 'Back Stab', type: 'attack', targeting: 'single_enemy', range: 1.6, cooldown: cd(10), damageFormula: `str * ${coef(1.0, 0.2, lv)}`, stealthBonus: 2.5 }),
  'sight':         () =>   skill({ id: 'sight', name: 'Sight', type: 'debuff', targeting: 'aoe_enemy', range: 6, aoeRadius: 2.5, cooldown: cd(10), removesStatusId: 'stealthed' }),
  'dispel':        () =>   skill({ id: 'dispel', name: 'Dispel', type: 'debuff', targeting: 'single_enemy', range: 6, cooldown: cd(10), dispelCategory: 'buff' }),
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
  'lightning-storm': ['storm-caller'],
  'cloak':           ['ambusher'],
  // Firewall brings no extra tactic — its placement logic is baked into the
  // skill tactic itself (makeSkillTactic → firewallAction), not a cluster-aim.
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
  // §threat: a taunt is a *peel*, not a nuke — prefer pulling a foe that's
  // currently hitting an ally (locked onto someone other than the caster) so the
  // tank yanks it off the back line; only fall back to nearest when all in-range
  // foes are already on the tank (or untaunted-but-idle).
  if (sk.statusApplied === 'taunted') {
    const cands = (canSeeStealth ? livingEnemies(state, self) : visibleEnemiesOf(state, self))
      .filter((e) => visible(e) && inRange(self, e, sk.range) && !redundant(e))
    if (!cands.length) return null
    const offMe = cands.filter((e) => e.lockedTargetId && e.lockedTargetId !== self.id)
    return nearest(self, offMe.length ? offMe : cands).id
  }
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
  return canFinishChannel(self, state, sk)
}

// Can we finish this channel before an enemy reaches us and interrupts it? An
// enemy walled off by one of our firewalls (that it hasn't broken through) can't
// reach, so it doesn't count — which is exactly what lets a kiter stand behind
// its flame and cast. Used to stop a kiter from feeding interrupted channels
// (the "ran but couldn't cast before it caught me" death): if no cast is safe it
// falls through to a faster option (e.g. raising a firewall) or keeps running.
function canFinishChannel(self: Combatant, state: BattleState, sk: EngineSkill): boolean {
  const turns = sk.channelTime + 1   // cast-start round + each channel round the threat can keep closing
  return !livingEnemies(state, self).some((e) => {
    if (firewallBlocks(state.firewalls ?? [], e.team, e.id, e.pos, self.pos)) return false
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
  if (state.round - self.lastDamageRound < scaleRounds(CLOAK_CALM_ROUNDS)) return false   // recently in combat → engaged (finer-rounds aware)
  const foes = livingEnemies(state, self)
  if (foes.some((e) => distance(self.pos, e.pos) <= CLOAK_MIN_GAP)) return false   // someone's right on top of us
  return foes.some((e) => distance(self.pos, e.pos) <= self.visionRange)            // a foe in sight worth ambushing
}

// §shield-wall (defensive cooldown) gate. Only worth blowing when actually under
// pressure — never while strolling: fire when 2+ hostile foes are in melee reach,
// or a single one that's locked onto us (a real attacker, possibly a dangerous one).
const SHIELD_WALL_RADIUS = 3
const isShieldWall = (sk: EngineSkill): boolean => sk.targeting === 'self' && sk.statusApplied === 'shield-wall'
function canShieldWall(self: Combatant, state: BattleState): boolean {
  const near = visibleEnemiesOf(state, self).filter((e) => e.provoked && distance(self.pos, e.pos) <= SHIELD_WALL_RADIUS)
  return near.length >= 2 || near.some((e) => e.lockedTargetId === self.id)
}

// §last-stand (near-death surge) gate. Only when actually near death AND a foe is
// still up (no point surging on an empty field).
const isLastStand = (sk: EngineSkill): boolean => sk.targeting === 'self' && sk.statusApplied === 'last-stand'
function canLastStand(self: Combatant, state: BattleState): boolean {
  return self.hp / self.maxHp < 0.2 && visibleEnemiesOf(state, self).length > 0
}

// The action-channel tactic that a skill brings with it (the merge). Fires when
// the skill is off cooldown and a valid target exists; otherwise yields to the
// next tactic / basic attack. A long AoE channel additionally yields unless it'd
// hit a cluster from safety, so the caster falls through to its single-target
// nuke when an area cast wouldn't pay off (§4 cluster/safety gate). A self-cast
// cloak only fires from the ambush window (canCloak).
// How many of a caster's ground zones from a given skill are currently live.
function activeZoneCount(state: BattleState, casterId: string, skillId: string): number {
  let n = 0
  for (const z of state.zones ?? []) if (z.sourceId === casterId && z.skillId === skillId) n++
  return n
}
function activeWallCount(state: BattleState, casterId: string): number {
  let n = 0
  for (const w of state.firewalls ?? []) if (w.sourceId === casterId) n++
  return n
}

// Active-instance cap for a skill limited to N simultaneous effects, or null if
// uncapped. Two flavours: Firewall counts this caster's live walls; a capped buff
// (Agility) counts how many of the caster's team currently bear its status. The
// engine gates on it (at the cap the skill reads as not-ready) and the battle
// card shows it as (active/max) next to the skill.
export function skillActiveCap(state: BattleState, self: Combatant, sk: EngineSkill): { active: number; max: number } | null {
  if (sk.wall) return { active: activeWallCount(state, self.id), max: sk.wall.maxActive }
  if (sk.statusApplied && sk.statusMaxActive != null) {
    let active = 0
    for (const c of state.combatants) {
      if (c.alive && c.team === self.team && c.statuses.some((s) => s.id === sk.statusApplied)) active++
    }
    return { active, max: sk.statusMaxActive }
  }
  return null
}
// Does this unit have a firewall it could raise right now (off cooldown, under
// its simultaneous cap)? If so it has a defensive option besides a risky cast.
function hasReadyFirewall(self: Combatant, state: BattleState): boolean {
  return self.skills.some((s) => s.wall != null && (self.skillCooldowns[s.id] ?? 0) <= 0 && activeWallCount(state, self.id) < s.wall.maxActive)
}

// §firewall placement: the foe to wall off — the nearest visible enemy that's
// far enough away to leave room for the wall (and to finish the channel before
// it arrives) yet within cast range, with a clear line so the wall sits between
// us with no terrain in the way. Targeting it; the wall itself is dropped on the
// caster→foe line at resolve time (resolveSkill), set back toward the caster so
// the foe — having advanced through our cast time — lands on the far side and
// bounces. Aimed at the imminent chaser, so it reads as a kiting tool.
const FIREWALL_MIN_GAP = 2.5
function firewallThreat(self: Combatant, state: BattleState, sk: EngineSkill): Combatant | null {
  let best: Combatant | null = null
  let bd = Infinity
  for (const e of visibleEnemiesOf(state, self)) {
    const d = distance(self.pos, e.pos)
    if (d < FIREWALL_MIN_GAP || d > sk.range + EPS) continue
    if (!sightlineClear(self.pos, e.pos, state.barriers)) continue
    if (d < bd - EPS || (Math.abs(d - bd) <= EPS && best !== null && e.id < best.id)) { bd = d; best = e }
  }
  return best
}

export function makeSkillTactic(sk: EngineSkill): TacticDef {
  // The injected action tactic doubles as the skill's "when to use it" guidance —
  // gated skills carry a usage note so the player sees why it holds fire.
  const usageNote = isShieldWall(sk)
    ? 'Turtle up only when under attack — 2+ foes on you (or one locked onto you). Never while just roaming.'
    : isLastStand(sk)
      ? 'Trigger the surge only when near death (below 20% HP) with a foe still up.'
      : `Use ${sk.name} when ready.`
  const base = { id: `skill:${sk.id}`, name: sk.name, description: usageNote, scope: 'unit' as const, channel: 'action' as const }

  // Firewall is a placement tool, not a target nuke: raise it between us and the
  // nearest approaching foe (resolveSkill computes the exact spot). Soft-capped
  // at maxActive simultaneous walls per caster (reads as not-ready at the cap).
  if (sk.wall) {
    return {
      ...base,
      action: (self, state) => {
        if ((self.skillCooldowns[sk.id] ?? 0) > 0) return null
        const cap = skillActiveCap(state, self, sk)
        if (cap && cap.active >= cap.max) return null   // at the simultaneous-wall cap
        const foe = firewallThreat(self, state, sk)
        return foe ? { castSkill: sk, skillTarget: foe.id } : null
      },
    }
  }

  // A long *damage* AoE channel is cluster-gated (only worth it on 2+ from safety).
  // A utility-zone channel (Molasses slow) isn't — it's a fast defensive cast you
  // want on even one approaching foe, so it fires on the nearest target in range.
  const gated = isChanneledAoe(sk) && !sk.zone?.statusApplied
  const cloak = isStealthSkill(sk)
  const shieldWall = isShieldWall(sk)
  const lastStand = isLastStand(sk)
  return {
    ...base,
    action: (self, state) => {
      if ((self.skillCooldowns[sk.id] ?? 0) > 0) return null
      // Soft cap: a ground-zone AoE that already has `maxActive` of this caster's
      // hazards live reads as not off cooldown — its zones stack until then.
      if (sk.zone?.maxActive != null && activeZoneCount(state, self.id, sk.id) >= sk.zone.maxActive) return null
      // Capped buff (Agility = 1 up at a time): don't recast while the team's at
      // the cap of active instances of its status.
      const cap = skillActiveCap(state, self, sk)
      if (cap && cap.active >= cap.max) return null
      if (cloak && !canCloak(self, state)) return null
      if (shieldWall && !canShieldWall(self, state)) return null
      if (lastStand && !canLastStand(self, state)) return null
      const targetId = selectSkillTarget(self, state, sk)
      if (!targetId) return null
      if (gated) {
        const primary = findCombatant(state, targetId)
        if (!primary || !channeledAoeWorthIt(self, state, sk, primary)) return null
      } else if (sk.channelTime >= 1 && sk.damageFormula && !isOffensiveAoe(sk) && hasReadyFirewall(self, state) && !canFinishChannel(self, state, sk)) {
        // A single-target channel a threat would interrupt isn't worth starting
        // when we could raise a firewall instead — yield so the wall tactic fires
        // and we hold behind it. (No firewall ready ⇒ cast anyway, as before.)
        return null
      }
      return { castSkill: sk, skillTarget: targetId }
    },
  }
}
