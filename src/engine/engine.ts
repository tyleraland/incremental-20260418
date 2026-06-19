// Combat Tactic Engine — round resolution (spec §9, §10, §11, §16).
//
// Deterministic, round-based, grid autobattle. `createBattle` clones the input
// roster (never mutating it, §16.5); `advanceRound` resolves exactly one round
// in place so the host can step combat "one round per N ticks"; `resolve` runs
// to completion for tests and bulk/idle resolution.

import {
  COLS, ROWS, MAX_ROUNDS, EPS, STEALTH_ATTACK_BONUS,
  WANDER_REPATH, MONSTER_WANDER_MIN, MONSTER_WANDER_MAX, MONSTER_WANDER_NEAR, MONSTER_WANDER_FAR,
  WANDER_SPEED_MULT, WANDER_MARGIN, MONSTER_EDGE_MARGIN, WARY_INTERRUPT_DECAY,
} from './constants'
import { setArenaBounds, arenaClamp } from './arena'
import { setTimeScale, timeScale, scaleRounds, onBeat, onAttackBeat } from './timescale'
import { SpatialHash, setSpatialHash } from './spatialhash'
import { startingPosition, moveToward, moveTowardPoint, attackReach, moveSpeedOf, distance, enforceSeparation, setDirectMove } from './grid'
import { defaultCalculateDamage, calculateHeal, effectiveStat, skillDamageEstimate, estimateDamageVs, effectiveArmor } from './damage'
import {
  selectTarget, chooseAction, findCombatant, livingEnemies, livingAllies, isStealthed,
} from './behavior'
import {
  resolveTactics, armoredFactor, nimblePeriod, hasTactic,
} from './tactics'
import { makeSkillTactic, isChanneledAoe } from './skills'
import { buildStatus } from './status'
import { elementMultiplier } from './elements'
import { nearestEnemyTo, isCaster, castRange, cohesionVec, visibleEnemiesOf, bumpVisionGen, clearVisionCache } from './spatial'
import { wallCrossing, firewallBlocks, snapNormal } from './firewall'

// Weight applied to the cohesion bias when a unit is moving AWAY from enemies
// (kite retreat or retreater fall-back). Kept light — the back-off direction
// still dominates, cohesion just curves it toward the party so a healer doesn't
// strand themselves behind the front line.
const COHESION_WEIGHT = 0.35
// A retreat/flee runs at the unit's own move speed with a modest panic boost —
// NOT a fixed `rows` teleport. The old fixed-distance fall-back made a retreating
// or fleeing unit visibly sprint ~4× a normal step (the "units speed up" jank);
// speed-limiting keeps motion consistent while still opening a gap on a chaser.
const RETREAT_SPEED_MULT = 1.5
import { traceMove, slideMove, sightlineClear, lineClear, steerAround, canReach, pointBlocked, escapeBarrier } from './barriers'
import type {
  BattleState, BattleResult, BattleStats, Combatant, CombatSetup,
  EngineUnitInput, Outcome, Team, BattleEvent, EngineSkill, Element,
  ResolvedTactic, TacticRef, MovementResult, ReactionResult, ActionResult, Vec2,
  TeamPlan, Planner, Barrier, TacticOutcome, BattleZone,
} from './types'

// Deterministic [0,1) hash of an integer — seeds open-world wander choices
// (lurk duration, hop direction) without an RNG, so replays stay deterministic.
function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x / 4294967296
}

function monsterDwell(seed: number): number {
  const span = MONSTER_WANDER_MAX - MONSTER_WANDER_MIN + 1
  return scaleRounds(MONSTER_WANDER_MIN + Math.floor(hash01(seed) * span))
}

function emptyStats(): BattleStats {
  return {
    totalDamageByUnit: {},
    totalHealingByUnit: {},
    killsByUnit: {},
    skillsUsedByUnit: {},
    potionsConsumed: 0,
  }
}

// Stable descending-power reorder of *attack* skills within a skill list, leaving
// every non-attack skill in its original slot (§action policy). Power is the
// target-independent damage estimate on the unit's base stats; ties break by id
// so the order is deterministic. A unit with one (or zero) attack skill is
// unchanged.
function orderAttacksByPower(input: EngineUnitInput, skills: EngineSkill[]): EngineSkill[] {
  const stub = { str: input.str, def: input.def, int: input.int, spd: input.spd, statuses: [] } as unknown as Combatant
  const attacks = skills
    .filter((s) => s.type === 'attack')
    .sort((a, b) => skillDamageEstimate(stub, b) - skillDamageEstimate(stub, a) || (a.id < b.id ? -1 : 1))
  let ai = 0
  return skills.map((s) => (s.type === 'attack' ? attacks[ai++] : s))
}

// §action policy — target-aware attack ranking. makeCombatant's static
// biggest-nuke order is target-*independent*; this re-ranks the unit's
// single-target attack skills against the *currently locked enemy* each turn
// (element matrix + magic/physical mitigation, via estimateDamageVs) so the
// action channel's first-match opens with whatever hits THIS foe hardest — a
// mage leads with Frost Bolt into a fire-armored enemy, Fire Bolt into an
// earth one. Only the single-target `attack` slots are permuted (channeled-AoE
// and every non-attack action tactic keep their position, exactly like the
// static order). Pure & deterministic (id tiebreak) so replays match; it's
// re-derived from the lock each turn, so no snapshot field is needed.
//
// Hysteresis (§exploit-weakness): switching off the static biggest-nuke leader
// requires the target-aware best to beat it by `exploitMargin` — out of the box
// a conservative 15% (clear elemental weaknesses easily clear it; near-ties
// don't thrash); the opt-in Exploit Weakness tactic drops the margin so the
// unit always picks the absolute best vs the target. Returns a short note when
// it actually switches the lead skill, for the turn trace; else null.
const DEFAULT_EXPLOIT_MARGIN = 0.15

function exploitMargin(self: Combatant): number {
  const t = self.tactics.find((t) => t.def.id === 'exploit-weakness')
  if (!t) return DEFAULT_EXPLOIT_MARGIN
  return t.rank >= 2 ? 0 : 0.05   // rank ≥2 = always the absolute best; rank 1 keeps a tiny guard
}

function reorderAttacksForTarget(self: Combatant, target: Combatant): string | null {
  const skillOf = (t: ResolvedTactic) => self.skills.find((s) => s.id === t.def.id.slice(6))
  const isAtkSkillTactic = (t: ResolvedTactic) => {
    if (!t.def.id.startsWith('skill:')) return false
    const s = skillOf(t)
    return !!s && s.type === 'attack' && !isChanneledAoe(s)
  }
  const slots = self.tactics.map((t, i) => ({ t, i })).filter((x) => isAtkSkillTactic(x.t))
  if (slots.length < 2) return null

  const byId = (a: ResolvedTactic, b: ResolvedTactic) => (skillOf(a)!.id < skillOf(b)!.id ? -1 : 1)
  const targetEst = (t: ResolvedTactic) => estimateDamageVs(self, target, skillOf(t)!)
  const byPower = [...slots].sort((a, b) => skillDamageEstimate(self, skillOf(b.t)!) - skillDamageEstimate(self, skillOf(a.t)!) || byId(a.t, b.t))
  const byTarget = [...slots].sort((a, b) => targetEst(b.t) - targetEst(a.t) || byId(a.t, b.t))

  const staticLead = byPower[0].t
  const targetLead = byTarget[0].t
  const switchLead = targetLead !== staticLead && targetEst(targetLead) > targetEst(staticLead) * (1 + exploitMargin(self))
  const finalOrder = switchLead ? byTarget : byPower
  slots.forEach((x, k) => { self.tactics[x.i] = finalOrder[k].t })
  return switchLead
    ? `${skillOf(targetLead)!.name} (${Math.round(targetEst(targetLead))}) > ${skillOf(staticLead)!.name} (${Math.round(targetEst(staticLead))})`
    : null
}

// Sentinel for "this unit has never dealt or taken damage" — far enough in the
// past that the Cloak calm-rounds gate always reads as calm at battle start.
const NEVER_DAMAGED = -1000

function makeCombatant(input: EngineUnitInput, index: number, pos: { x: number; y: number }, tactics: ResolvedTactic[]): Combatant {
  const skills = input.skills.map((s) => ({ ...s }))   // clone so the engine never mutates input
  // "Skills give you tactics": each equipped skill becomes an action-channel
  // tactic, appended below the player's explicit tactics (lower priority) so
  // behavioural tactics still steer targeting/movement around the cast (§5).
  // Long-channel AoE (Lightning Storm) is evaluated *before* single-target nukes
  // so a good area opportunity wins — its own gate (cluster + safety) makes it
  // yield back to the single-target cast when an AoE wouldn't pay off, so it
  // never wastes the long channel on a lone target.
  // §action policy: among the rest, attack skills are ordered biggest-nuke-first
  // (by target-independent damage estimate); since the action channel is
  // first-match and on-cooldown skills are skipped, this resolves at runtime to
  // "open with the hardest-hitting attack that's ready." Non-attack skills
  // (heal/buff/…) keep their slots so type priority is unchanged.
  const ordered = [...skills.filter(isChanneledAoe), ...orderAttacksByPower(input, skills.filter((s) => !isChanneledAoe(s)))]
  const skillTactics: ResolvedTactic[] = ordered.map((sk) => ({ def: makeSkillTactic(sk), rank: 1 }))
  return {
    id: input.id,
    name: input.name,
    team: input.team,
    index,
    str: input.str,
    def: input.def,
    int: input.int,
    spd: input.spd,
    magicDef: input.magicDef ?? 0,
    moveSpeed: input.moveSpeed,
    maxHp: input.maxHp,
    hp: input.hp,
    alive: input.hp > 0,
    pos: { x: pos.x, y: pos.y },
    // Face the opposing edge to start: players (bottom) look up, enemies down.
    facing: { x: 0, y: input.team === 'player' ? 1 : -1 },
    moving: false,
    preferredRank: input.preferredRank,
    meleeRange: input.meleeRange,
    rangedRange: input.rangedRange,
    attackElement: input.attackElement ?? 'neutral',
    armorElement: input.armorElement ?? 'neutral',
    skills,
    skillCooldowns: {},
    statuses: [],
    lockedTargetId: null,
    potionsLeft: input.potions ?? 0,
    // §aggression: skittish monsters start non-hostile (won't acquire targets
    // until hit/called); everyone else is hostile from the start.
    provoked: !tactics.some((t) => t.def.id === 'skittish'),
    tactics: [...tactics, ...skillTactics],
    tacticCooldowns: {},
    tacticsUsed: [],
    chargeUsed: false,
    attacksReceived: 0,
    lastHitById: null,
    lastDamageRound: NEVER_DAMAGED,
    channel: null,
    interruptedCount: 0,
    lastCastSkillId: null,
    lastCastTargetId: null,
    lastCastRound: NEVER_DAMAGED,
    visionRange: input.visionRange ?? Infinity,
    moveOrder: null,
    wanderTarget: null,
    escapeDir: null,
    // Monsters lurk a (deterministic) few rounds before their first hop; heroes
    // don't use the dwell timer (they roam toward the team waypoint).
    wanderDwell: input.team === 'enemy' ? monsterDwell(index + 1) : 0,
    threat: {},
    threatMult: input.threatMult ?? 1,
    armorReduction: input.armorReduction ?? 0,
    dodgePeriod: input.dodgePeriod ?? null,
    ownerId: input.ownerId ?? null,
    leashRange: input.leashRange ?? null,
    summonTtl: input.summonTtl ?? null,
    summonTag: input.summonTag ?? null,
    trace: [],
    lastResolution: [],
  }
}

// Re-apply a unit's CURRENT loadout (stats, skills, tactics, vision) to a live
// combatant *in place*, keeping all runtime state — position, hp, cooldowns,
// statuses, threat, locks, channel. This is what lets a player's gear / skill /
// tactic edits take effect in an ongoing battle without re-spawning the unit. hp
// is preserved (capped to the possibly-new maxHp); a channel for a skill that's no
// longer equipped is dropped. Idempotent: re-applying an unchanged loadout yields
// an equivalent combatant, so calling it every tick is a no-op when nothing changed.
export function relinkCombatant(c: Combatant, input: EngineUnitInput, partyTactics: TacticRef[] = []): void {
  const fresh = makeCombatant(input, c.index, c.pos, resolveTactics(input.tactics ?? [], partyTactics))
  c.name = fresh.name
  c.str = fresh.str; c.def = fresh.def; c.int = fresh.int; c.spd = fresh.spd; c.magicDef = fresh.magicDef
  c.moveSpeed = fresh.moveSpeed; c.meleeRange = fresh.meleeRange; c.rangedRange = fresh.rangedRange
  c.attackElement = fresh.attackElement; c.armorElement = fresh.armorElement
  c.threatMult = fresh.threatMult; c.armorReduction = fresh.armorReduction; c.dodgePeriod = fresh.dodgePeriod
  c.preferredRank = fresh.preferredRank
  // NB: visionRange is a per-battle-mode property (open-world fog vs encounter
  // ∞), set at spawn — not part of the editable loadout — so it's left untouched.
  c.maxHp = fresh.maxHp
  if (c.hp > fresh.maxHp) c.hp = fresh.maxHp
  c.skills = fresh.skills
  c.tactics = fresh.tactics
  if (c.channel && !c.skills.some((s) => s.id === c.channel!.skillId)) c.channel = null
}

export function createBattle(setup: CombatSetup): BattleState {
  const cols = setup.cols ?? COLS
  const rows = setup.rows ?? ROWS
  const timeScale = Math.max(1, Math.floor(setup.timeScale ?? 1))
  const decisionInterval = Math.max(1, Math.floor(setup.decisionInterval ?? 1))
  setArenaBounds(cols, rows)   // so startingPosition/clamp use this battle's bounds
  setTimeScale(timeScale)      // so per-round helpers (move/cooldown/status) scale
  const combatants: Combatant[] = []
  let index = 0
  const place = (units: EngineUnitInput[], team: Team, party?: TacticRef[]) => {
    const perRank: Record<string, number> = {}
    units.forEach((u) => {
      const withinRank = perRank[u.preferredRank] ?? 0
      perRank[u.preferredRank] = withinRank + 1
      const pos = startingPosition(team, u.preferredRank, withinRank)
      const tactics = resolveTactics(u.tactics, party)
      combatants.push(makeCombatant({ ...u, team }, index++, pos, tactics))
    })
  }
  place(setup.playerUnits, 'player', setup.playerPartyTactics)
  place(setup.enemyUnits, 'enemy', setup.enemyPartyTactics)

  return {
    combatants,
    zones: [],
    firewalls: [],
    barriers: setup.barriers ?? [],
    cols,
    rows,
    timeScale,
    decisionInterval,
    mode: setup.mode ?? 'encounter',
    plans: {},
    planner: setup.planner ?? defaultPlanner,
    round: 0,
    outcome: 'ongoing',
    events: [],
    stats: emptyStats(),
    maxRounds: setup.maxRounds ?? MAX_ROUNDS,
    collectEvents: setup.collectEvents ?? true,
    calculateDamage: setup.callbacks?.calculateDamage ?? defaultCalculateDamage,
  }
}

// Inject a combatant into an already-running battle (§open-world). Used for
// open-world reinforcements (a monster wandering in) and heroes re-joining a
// persistent battle after recovery. Mirrors `createBattle`'s placement: a fresh
// stable index (seeds damage variation), a formation slot at the team's edge,
// and separation against whoever's already standing there. Emits a `spawn`
// event so the viewer can flash the arrival.
export function addCombatant(
  state: BattleState,
  input: EngineUnitInput,
  team: Team,
  partyTactics?: TacticRef[],
  at?: Vec2,                 // explicit spawn position (open-world scatter); else formation slot
): Combatant {
  setArenaBounds(state.cols, state.rows)
  setTimeScale(state.timeScale)
  const index = state.combatants.reduce((m, c) => Math.max(m, c.index), -1) + 1
  const sameRank = state.combatants.filter(
    (c) => c.team === team && c.preferredRank === input.preferredRank,
  ).length
  const pos = at ? arenaClamp(at) : startingPosition(team, input.preferredRank, sameRank)
  const tactics = resolveTactics(input.tactics ?? [], partyTactics)
  const c = makeCombatant({ ...input, team }, index, pos, tactics)
  enforceSeparation(c, state.combatants, state.barriers)
  state.combatants.push(c)
  emit(state, { round: state.round, type: 'spawn', sourceId: c.id, position: { ...c.pos } })
  return c
}

// ── Move orders (§move-order) ────────────────────────────────────────────────--
// An explicit "go to this point" command that overrides normal AI until the unit
// arrives or it's cleared. The game uses it to send a deployed unit somewhere;
// tests use it to force pathing (incl. impossible paths the unit can't satisfy).
// Resolution is instantaneous in grid steps each round — overworld travel
// between locations is deferred (see BACKLOG).
export function issueMoveOrder(state: BattleState, combatantId: string, to: Vec2): boolean {
  const c = findCombatant(state, combatantId)
  if (!c) return false
  c.moveOrder = arenaClamp(to)
  return true
}
export function clearMoveOrder(state: BattleState, combatantId: string): void {
  const c = findCombatant(state, combatantId)
  if (c) c.moveOrder = null
}

// How close counts as "arrived" at a move-order point.
const MOVE_ORDER_ARRIVE = 0.6

function emit(state: BattleState, e: BattleEvent): void {
  if (state.collectEvents) state.events.push(e)
}

function addStat(map: Record<string, number>, id: string, n: number): void {
  map[id] = (map[id] ?? 0) + n
}

// Apply damage, record stats, and handle death + lock cleanup (§9.1 f).
// Takes an attacker id (not a Combatant) so DoT/zone ticks can attribute damage
// to a source that may no longer be alive.
function applyDamageRaw(
  state: BattleState,
  attackerId: string,
  target: Combatant,
  amount: number,
): void {
  target.hp = Math.max(0, target.hp - amount)
  // §cloak "not engaged" gate: stamp the round on both ends of a real hit so a
  // unit must stay out of combat for a few rounds before it can re-cloak.
  if (amount > 0) {
    target.lastDamageRound = state.round
    const dealer = findCombatant(state, attackerId)
    if (dealer) dealer.lastDamageRound = state.round
    // §threat: damage builds the attacker's threat on its target, scaled by the
    // attacker's threat multiplier (a tank's high mult lets it hold aggro on
    // modest damage). This is the chokepoint for *all* damage — basic hits, skill
    // hits, DoT, and zone ticks all flow through here, so they all generate threat.
    if (dealer && dealer.team !== target.team) {
      target.threat[attackerId] = (target.threat[attackerId] ?? 0) + amount * dealer.threatMult
    }
    // §aggression: a hit from an enemy rouses a skittish monster — it turns
    // hostile and retaliates against whoever struck it.
    if (!target.provoked && dealer && dealer.team !== target.team) {
      target.provoked = true
      target.lockedTargetId = attackerId
      emit(state, { round: state.round, type: 'aggro', sourceId: target.id, position: { ...target.pos } })
    }
  }
  // §3 stealth: taking damage drops a cloak. Single-target attacks can't even
  // pick a hidden unit, so in practice this is AoE / ground-zone / DoT splash
  // "disrupting" the cloak — the hidden unit pops back into view.
  if (amount > 0 && target.statuses.length) breakStealth(state, target)
  addStat(state.stats.totalDamageByUnit, attackerId, amount)
  if (target.hp <= 0 && target.alive) {
    target.alive = false
    addStat(state.stats.killsByUnit, attackerId, 1)
    emit(state, { round: state.round, type: 'unit_death', sourceId: attackerId, targetId: target.id })
    // Clear any locks pointing at the now-dead unit.
    for (const c of state.combatants) {
      if (c.lockedTargetId === target.id) c.lockedTargetId = null
    }
  }
}

// §threat: healing generates threat on the healer's enemies (split evenly across
// them), so a dedicated healer can pull aggro the way it does in WoW. Scaled by
// the healer's own threat multiplier. HEAL_THREAT_FRAC keeps it below raw damage.
const HEAL_THREAT_FRAC = 0.5
function generateHealThreat(state: BattleState, healer: Combatant, healed: number): void {
  const foes = state.combatants.filter((c) => c.alive && c.team !== healer.team)
  if (!foes.length || healed <= 0) return
  const share = (healed * HEAL_THREAT_FRAC * healer.threatMult) / foes.length
  for (const f of foes) f.threat[healer.id] = (f.threat[healer.id] ?? 0) + share
}

// Damage-over-time / zone tick: emits a 'dot' marker then applies the hit. DoT
// runs through the element matrix vs the target's (status-aware) armor element
// just like a direct hit — so a wind storm hits a frozen (→water) foe for 1.5×,
// poison can't touch the undead, etc. (§3). `element` is the DoT's element;
// `label` is the UI tag.
function applyTickDamage(state: BattleState, sourceId: string, target: Combatant, amount: number, element: Element, label: string): void {
  if (!target.alive || amount <= 0) return
  const mult = elementMultiplier(element, effectiveArmor(target))
  if (mult === 0) return                                   // elementally immune
  const dmg = Math.max(1, Math.floor(amount * mult * vulnerableFactor(target)))
  emit(state, { round: state.round, type: 'dot', sourceId, targetId: target.id, value: dmg, eff: mult, element, extra: { label } })
  applyDamageRaw(state, sourceId, target, dmg)
}

// Push a target away from the caster (knockback) and disrupt any cast it had.
function knockbackTarget(state: BattleState, caster: Combatant, target: Combatant, rows: number): void {
  const dx = target.pos.x - caster.pos.x
  const dy = target.pos.y - caster.pos.y
  const d = Math.hypot(dx, dy) || 1
  const before = { ...target.pos }
  // §2 a barrier stops the shove: trace to the wall, never through it.
  target.pos = traceMove(target.pos, { x: target.pos.x + (dx / d) * rows, y: target.pos.y + (dy / d) * rows }, state.barriers)
  enforceSeparation(target, state.combatants, state.barriers)
  if (target.pos.x !== before.x || target.pos.y !== before.y) {
    emit(state, { round: state.round, type: 'knockback', sourceId: caster.id, targetId: target.id, position: { ...target.pos } })
  }
  if (target.channel) {
    emit(state, { round: state.round, type: 'interrupt', sourceId: caster.id, targetId: target.id, extra: { skillId: target.channel.skillId } })
    target.channel = null
    target.interruptedCount += 1
  }
}

// Step the caster back toward its own edge after a cast (Firewall, Ankle Snare).
function retreatCaster(state: BattleState, self: Combatant, rows: number): void {
  const dir = self.team === 'player' ? -1 : 1
  const before = { ...self.pos }
  self.pos = traceMove(self.pos, { x: self.pos.x, y: self.pos.y + dir * rows }, state.barriers)
  enforceSeparation(self, state.combatants, state.barriers)
  if (self.pos.x !== before.x || self.pos.y !== before.y) {
    emit(state, { round: state.round, type: 'retreat', sourceId: self.id, position: { ...self.pos } })
  }
}

// Ground hazards (§2) follow a D&D-style "aura turn" model so a zone can't miss a
// unit that only brushes it between position snapshots. The work is split across a
// round into three phases (all called from advanceRound):
//
//   1. seedZones    — at round start: re-center following auras onto their caster
//                     (dropping the aura if the caster fell), AGE the zone out, and
//                     seed each survivor's eligibility set with whoever is already
//                     standing in it ("begins their turn in the aura"). A zone cast
//                     *this* round isn't seeded, so it first bites next round.
//   2. trackZones   — after each unit acts: a following aura re-centers immediately
//                     onto its just-moved caster, and anyone now inside is added to
//                     the eligibility set ("enters the aura during its turn", and an
//                     aura sweeping onto a unit when its caster strides over).
//   3. applyZoneEffects — at round end: also catch whoever's standing in it now
//                     ("ends their turn in the aura"), then deal the zone's effect
//                     ONCE to every eligible unit, simultaneously (iterating in
//                     combatant order for determinism). DoT is gated to once per
//                     logical round (onBeat) so finer sub-rounds don't double-tick.
//
// Eligibility lives in a per-round Map (not on the zone) so nothing extra has to be
// snapshot-serialized — it's recomputed from positions every round, so replay is 1:1.
type ZoneElig = Map<BattleZone, Set<string>>

// Re-center a following aura (Consecration) on its caster. Returns false if the
// caster is gone — the aura ends rather than lingering as ground.
function recenterFollowZone(state: BattleState, z: BattleZone): boolean {
  if (!z.follow) return true
  const src = findCombatant(state, z.sourceId)
  if (!src || !src.alive) return false
  z.pos = { x: src.pos.x, y: src.pos.y }
  return true
}

// Affected, living members of a zone's team currently inside its radius.
function zoneMembers(state: BattleState, z: BattleZone, into: Set<string>): void {
  for (const c of state.combatants) {
    if (!c.alive || c.team !== z.team) continue
    if (distance(c.pos, z.pos) <= z.radius + EPS) into.add(c.id)
  }
}

// Phase 1 — start of round: re-center/expire auras, age zones, seed eligibility.
function seedZones(state: BattleState, elig: ZoneElig): void {
  if (state.zones.length === 0) return
  const kept: BattleZone[] = []
  for (const z of state.zones) {
    if (!recenterFollowZone(state, z)) continue   // caster fell → aura ends
    z.roundsLeft -= 1
    if (z.roundsLeft <= 0) continue               // aged out
    const ids = new Set<string>()
    zoneMembers(state, z, ids)                     // "begins their turn in the aura"
    elig.set(z, ids)
    kept.push(z)
  }
  state.zones = kept
}

// Phase 2 — after a unit acts: auras track their caster, and anyone now inside an
// active (seeded) zone becomes eligible. A zone cast this round (not in `elig`) is
// skipped, so it stays dormant until its first seed next round.
function trackZones(state: BattleState, elig: ZoneElig): void {
  if (state.zones.length === 0) return
  for (const z of state.zones) {
    const ids = elig.get(z)
    if (!ids) continue
    recenterFollowZone(state, z)
    zoneMembers(state, z, ids)
  }
}

// Phase 3 — end of round: deal each seeded zone's effect once to every eligible
// unit (incl. those standing in it now), all at once.
function applyZoneEffects(state: BattleState, elig: ZoneElig): void {
  if (state.zones.length === 0) return
  const beat = onBeat(state.round)
  for (const z of state.zones) {
    const ids = elig.get(z)
    if (!ids) continue                             // cast this round → first tick next round
    zoneMembers(state, z, ids)                     // "ends their turn in the aura"
    for (const c of state.combatants) {            // combatant order ⇒ deterministic
      if (!ids.has(c.id) || !c.alive || c.team !== z.team) continue
      if (z.dotDamage > 0 && beat) applyTickDamage(state, z.sourceId, c, z.dotDamage, z.element ?? 'neutral', z.element ?? 'zone')
      // Utility zone (Molasses): refresh a status on whoever's inside. addStatus
      // replaces by id, so it never stacks — it just tops the duration back up.
      if (z.statusApplied && c.alive) {
        const had = c.statuses.some((s) => s.id === z.statusApplied)
        const st = buildStatus(z.statusApplied, z.sourceId)
        if (st) {
          addStatus(c, st)
          if (!had) emit(state, { round: state.round, type: 'buff_apply', sourceId: z.sourceId, targetId: c.id, extra: { statusId: st.id } })
        }
      }
    }
  }
}

// Age out firewalls (§firewall). They burn on *contact* (applyFirewalls), not
// each round, so there's no per-round area damage here — just the lifetime tick.
function tickFirewalls(state: BattleState): void {
  if (state.firewalls.length === 0) return
  state.firewalls = state.firewalls.filter((w) => { w.roundsLeft -= 1; return w.roundsLeft > 0 })
}

// §firewall collision: after a unit moves this turn (from `fromPos` to its new
// pos), bounce it off any firewall it tried to cross. Only the wall's
// `blockTeam` (the caster's foes) is affected — allies walk through. A blocked
// foe is knocked a cell back to its own side, burned, and its bump tally for
// that wall ticks up; once it has bumped `maxBumps` times the wall lets it pass.
const FIREWALL_THICK = 0.35   // half the flame's collision slab, in cells
const FIREWALL_KNOCKBACK = 1  // cells shoved back on a bounce
function applyFirewalls(state: BattleState, self: Combatant, fromPos: Vec2): void {
  if (state.firewalls.length === 0 || !self.alive) return
  for (const w of state.firewalls) {
    if (self.team !== w.blockTeam) continue              // allies pass freely
    if ((w.bumps[self.id] ?? 0) >= w.maxBumps) continue  // already broken through
    const cross = wallCrossing(w, fromPos, self.pos, FIREWALL_THICK)
    if (!cross) continue
    // Block: bump tally, burn, and shove back perpendicular to the wall (along
    // its normal) to its near side — knocking the foe off its approach line.
    w.bumps[self.id] = (w.bumps[self.id] ?? 0) + 1
    const back = { x: cross.hx + w.normal.x * cross.side * (FIREWALL_THICK + FIREWALL_KNOCKBACK), y: cross.hy + w.normal.y * cross.side * (FIREWALL_THICK + FIREWALL_KNOCKBACK) }
    self.pos = traceMove(fromPos, back, state.barriers)
    enforceSeparation(self, state.combatants, state.barriers)
    emit(state, { round: state.round, type: 'knockback', sourceId: w.sourceId, targetId: self.id, position: { ...self.pos } })
    applyTickDamage(state, w.sourceId, self, w.fireDamage, 'fire', 'fire')
    return   // one wall per move
  }
}

// A single hit (basic attack or a skill's damage component): applies tactic
// modifiers (Charger on basic attacks only; Nimble dodge and Armored incoming),
// emits the hit/dodge event, deals damage, records the attacker (Counterattacker),
// and disrupts the target's channeled cast if any. Cooldown/stat bookkeeping for
// skills is the caller's job (a skill may hit many targets but costs one use).
function dealAttack(state: BattleState, attacker: Combatant, target: Combatant, baseAmount: number, skill: EngineSkill | null): void {
  const isMelee = attacker.rangedRange <= 0
  let amount = baseAmount

  const period = nimblePeriod(target)
  if (period) {
    target.attacksReceived += 1
    if (target.attacksReceived % period === 0) {
      emit(state, { round: state.round, type: 'dodge', sourceId: attacker.id, targetId: target.id })
      return
    }
  }

  const atkElement: Element = skill?.element ?? attacker.attackElement
  const elMult = elementMultiplier(atkElement, effectiveArmor(target))   // §3 element matrix
  amount *= armoredFactor(target)
  amount *= vulnerableFactor(target)            // element-agnostic vulnerability
  amount *= elMult
  amount *= stealthMult(attacker, skill)        // §3 Back Stab from stealth hits harder
  amount = elMult === 0 ? 0 : Math.max(1, Math.floor(amount))   // 0 = elementally immune

  if (skill) {
    emit(state, { round: state.round, type: 'skill_use', sourceId: attacker.id, targetId: target.id, value: amount, eff: elMult, element: atkElement, skillId: skill.id })
  } else {
    emit(state, { round: state.round, type: isMelee ? 'melee_attack' : 'ranged_attack', sourceId: attacker.id, targetId: target.id, value: amount, eff: elMult, element: atkElement })
  }
  applyDamageRaw(state, attacker.id, target, amount)
  if (target.alive) {
    target.lastHitById = attacker.id
    clearByElement(state, target, atkElement)   // §3 e.g. fire melts Frozen
    if (target.channel) {   // §4 a landed hit disrupts a channeled cast
      emit(state, { round: state.round, type: 'interrupt', sourceId: attacker.id, targetId: target.id, extra: { skillId: target.channel.skillId } })
      target.channel = null
      target.interruptedCount += 1
    }
  }
}

function recordSkillUse(state: BattleState, self: Combatant, skill: EngineSkill): void {
  if (!state.stats.skillsUsedByUnit[self.id]) state.stats.skillsUsedByUnit[self.id] = []
  state.stats.skillsUsedByUnit[self.id].push(skill.id)
  self.skillCooldowns[skill.id] = scaleRounds(skill.cooldown)
}

// ── §3 combo / stealth helpers ──────────────────────────────────────────────--

// Product of every active element-agnostic incoming-damage multiplier on the target.
function vulnerableFactor(target: Combatant): number {
  return target.statuses.reduce((m, s) => m * (s.damageTakenMult ?? 1), 1)
}

// Clear statuses that the incoming element dispels (fire melts Frozen, §3).
function clearByElement(state: BattleState, target: Combatant, element: Element): void {
  const removed = target.statuses.filter((s) => s.removedByElement?.includes(element))
  if (removed.length === 0) return
  target.statuses = target.statuses.filter((s) => !s.removedByElement?.includes(element))
  for (const s of removed) {
    emit(state, { round: state.round, type: 'status_expire', sourceId: target.id, extra: { statusId: s.id } })
  }
}

// Striking from stealth (§3): every ambush gets the base sneak-attack bonus
// (+STEALTH_ATTACK_BONUS); Back Stab's own `stealthBonus` multiplies on top.
function stealthMult(attacker: Combatant, skill: EngineSkill | null): number {
  if (!attacker.statuses.some((s) => s.flags.includes('stealthed'))) return 1
  return (1 + STEALTH_ATTACK_BONUS) * (skill?.stealthBonus ?? 1)
}

// Dealing damage drops stealth (called once per offensive action, after it lands).
function breakStealth(state: BattleState, c: Combatant): void {
  const before = c.statuses.length
  c.statuses = c.statuses.filter((s) => !s.flags.includes('stealthed'))
  if (c.statuses.length !== before) {
    emit(state, { round: state.round, type: 'status_expire', sourceId: c.id, extra: { statusId: 'stealthed' } })
  }
}

// Dispel / Sight: strip statuses from a target (by category or by specific id).
function applyStatusRemoval(state: BattleState, self: Combatant, target: Combatant, skill: EngineSkill): void {
  const toRemove = (s: { id: string; category?: string }) =>
    (skill.removesStatusId != null && s.id === skill.removesStatusId) ||
    (skill.dispelCategory != null && s.category === skill.dispelCategory)
  if (skill.removesStatusId == null && skill.dispelCategory == null) return
  const removed = target.statuses.filter(toRemove)
  if (removed.length === 0) return
  target.statuses = target.statuses.filter((s) => !toRemove(s))
  for (const s of removed) {
    emit(state, { round: state.round, type: 'status_expire', sourceId: self.id, targetId: target.id, extra: { statusId: s.id } })
  }
}

// ── Skill casting (§4) ──────────────────────────────────────────────────────--

const isAllyTargeting = (sk: EngineSkill) =>
  sk.targeting === 'self' || sk.targeting === 'single_ally' || sk.targeting === 'aoe_ally'

// Who a skill's effect lands on. AoE-enemy spreads around the primary target;
// AoE-ally is centered on the caster.
function affectedTargets(state: BattleState, self: Combatant, skill: EngineSkill, primary: Combatant): Combatant[] {
  switch (skill.targeting) {
    case 'self': return [self]
    case 'single_enemy':
    case 'single_ally': return [primary]
    case 'aoe_enemy': return livingEnemies(state, self).filter((c) => distance(c.pos, primary.pos) <= skill.aoeRadius + EPS)
    case 'aoe_ally':   return livingAllies(state, self).filter((c) => distance(c.pos, self.pos) <= skill.aoeRadius + EPS)
    default: return []
  }
}

// Apply a skill's effects now (damage / heal / status to every affected unit),
// then put it on cooldown and record the single use.
// §minions: spawn a summon skill's minions around the caster — owned (ownerId),
// leashed, and time-limited (summonTtl). Low-stat melee bodies whose behaviour is
// driven entirely by the config's tactics (e.g. Guardian). Capped per skill+caster
// by summon.maxActive so re-casting at the cap is a no-op (gated in makeSkillTactic).
function spawnSummons(state: BattleState, self: Combatant, skill: EngineSkill): void {
  const cfg = skill.summon!
  const tag = skill.id
  const live = state.combatants.filter((c) => c.alive && c.ownerId === self.id && c.summonTag === tag).length
  const n = Math.min(cfg.count, Math.max(0, cfg.maxActive - live))
  for (let i = 0; i < n; i++) {
    // Fan them out just in front of the caster (toward the enemy side).
    const spread = (i - (n - 1) / 2) * 1.3
    const at = { x: self.pos.x + spread, y: self.pos.y + (self.team === 'player' ? 1.2 : -1.2) }
    const input: EngineUnitInput = {
      id: `${self.id}~${tag}~${state.round}~${i}`,
      name: cfg.name,
      team: self.team,
      str: cfg.str, def: 0, int: 0, spd: cfg.spd ?? self.spd, magicDef: 0,
      maxHp: cfg.hp, hp: cfg.hp,
      preferredRank: 'front',
      meleeRange: cfg.meleeRange ?? 1,
      rangedRange: 0,
      moveSpeed: cfg.moveSpeed ?? self.moveSpeed,
      attackElement: 'neutral', armorElement: 'neutral',
      skills: [],
      tactics: cfg.tactics,
      visionRange: self.visionRange,
      ownerId: self.id,
      leashRange: cfg.leash,
      summonTtl: scaleRounds(cfg.ttl),
      summonTag: tag,
    }
    addCombatant(state, input, self.team, undefined, at)
  }
}

// §minions: a leashed minion (ownerId + leashRange) that has strayed too far from
// its master drops its tactic's movement and returns to the owner — mirroring the
// Charger/Flanker leash, but anchored on the owner rather than the party centroid,
// so summons/companions "follow" while still free to engage within the tether.
function applyLeash(state: BattleState, self: Combatant, mv: ReturnType<typeof evalMovement>): ReturnType<typeof evalMovement> {
  if (self.ownerId == null || self.leashRange == null) return mv
  const owner = findCombatant(state, self.ownerId)
  if (!owner || !owner.alive) return mv
  if (distance(self.pos, owner.pos) > self.leashRange) return { toPoint: { ...owner.pos }, clearLock: true }
  return mv
}

function resolveSkill(state: BattleState, self: Combatant, skill: EngineSkill, targetId: string, atPoint?: Vec2): void {
  recordSkillUse(state, self, skill)
  // Remember this cast so a Chain tactic can follow up next turn on the same target.
  self.lastCastSkillId = skill.id
  self.lastCastTargetId = targetId
  self.lastCastRound = state.round
  // Non-damage skills (heal, buff, status, zone) don't go through dealAttack,
  // so they never emit a skill_use otherwise — UI floating labels would miss
  // them. Emit a source-anchored marker once per cast so "Heal", "Cloak",
  // "Poison", etc. surface above the caster. Damage skills already emit a
  // per-target skill_use via dealAttack and don't need this marker.
  if (!skill.damageFormula) {
    emit(state, { round: state.round, type: 'skill_use', sourceId: self.id, targetId, skillId: skill.id })
  }
  // §minions: a summon skill spawns owned, leashed, time-limited bodies near the
  // caster and is done (no target effects).
  if (skill.summon) { spawnSummons(state, self, skill); return }
  const primary = findCombatant(state, targetId)

  // §firewall: raise an oriented line of flame between us and the target foe.
  // Place it on the caster→foe line, set back toward the caster from the foe's
  // *current* position (which already reflects its advance through our cast
  // time), so the foe is on the far side and must cross — then bounces. Trace
  // from the caster so the wall never forms inside terrain. Allies pass; only
  // the foe team is blocked/burned (no friendly fire).
  if (skill.wall) {
    if (!primary) return
    const dx = primary.pos.x - self.pos.x, dy = primary.pos.y - self.pos.y
    const d = Math.hypot(dx, dy) || 1
    const nx = dx / d, ny = dy / d
    const wallD = Math.max(1.5, Math.min(skill.range, d - 1.5))   // a touch in front of the foe
    const desired = { x: self.pos.x + nx * wallD, y: self.pos.y + ny * wallD }
    const pos = traceMove(self.pos, desired, state.barriers)      // stop short of any real wall
    // Snap the orientation to the nearest of  _ | / \  so the wall reads cleanly
    // and bounces foes perpendicular to itself (along the snapped normal).
    const normal = snapNormal(dx, dy)
    state.firewalls.push({
      id: `fw-${skill.id}-${state.round}-${self.id}`,
      sourceId: self.id,
      blockTeam: self.team === 'player' ? 'enemy' : 'player',
      pos,
      normal,
      half: skill.wall.halfWidth,
      fireDamage: skill.wall.fireDamage,
      maxBumps: skill.wall.maxBumps,
      roundsLeft: scaleRounds(skill.wall.duration),
      bumps: {},
    })
    if (skill.retreatAfter) retreatCaster(state, self, skill.retreatAfter)
    return
  }

  // Persistent ground hazard (Lightning Storm): drop it on the telegraphed spot
  // (the locked point if this was a channel, else the target's current position).
  const zoneAt = atPoint ?? primary?.pos
  if (skill.zone && zoneAt) {
    state.zones.push({
      id: `z-${skill.id}-${state.round}-${self.id}`,
      sourceId: self.id,
      team: self.team === 'player' ? 'enemy' : 'player',
      pos: { ...zoneAt },
      radius: skill.aoeRadius || 1,
      dotDamage: skill.zone.dotDamage,
      roundsLeft: scaleRounds(skill.zone.duration),
      skillId: skill.id,
      element: skill.zone.element ?? skill.element,
      statusApplied: skill.zone.statusApplied,
      follow: skill.zone.follow,
    })
  }

  if (!primary) return   // remaining effects (damage/heal/status) need a live target
  const targets = affectedTargets(state, self, skill, primary)
  const allyEffect = isAllyTargeting(skill)

  for (const t of targets) {
    if (allyEffect) {
      if (skill.healFormula) {
        const healed = Math.min(calculateHeal(self, skill), t.maxHp - t.hp)
        if (healed > 0) {
          t.hp += healed
          addStat(state.stats.totalHealingByUnit, self.id, healed)
          emit(state, { round: state.round, type: 'heal', sourceId: self.id, targetId: t.id, value: healed, skillId: skill.id })
          generateHealThreat(state, self, healed)   // §threat: healers draw aggro
        }
      }
      applySkillStatus(state, self, t, skill)
      applyStatusRemoval(state, self, t, skill)
    } else {
      if (skill.damageFormula) dealAttack(state, self, t, state.calculateDamage(self, t, skill, state.round), skill)
      if (t.alive) applySkillStatus(state, self, t, skill)
      if (t.alive) applyStatusRemoval(state, self, t, skill)   // Dispel / Sight (§3)
      if (t.alive && skill.knockback) knockbackTarget(state, self, t, skill.knockback)
    }
  }

  if (skill.damageFormula) breakStealth(state, self)   // attacking reveals the caster (§3)
  if (skill.retreatAfter) retreatCaster(state, self, skill.retreatAfter)
}

function applySkillStatus(state: BattleState, self: Combatant, target: Combatant, skill: EngineSkill): void {
  if (!skill.statusApplied) return
  const status = buildStatus(skill.statusApplied, self.id, skill.statusLevel ?? 1)
  if (!status) return
  addStatus(target, status)
  // §threat: a landed taunt jumps the taunter to the top of the target's threat
  // table (+10%) so when the forced lock expires the tank is still the most
  // threatening — aggro doesn't snap straight back to the kiter.
  if (status.flags.includes('taunted')) {
    const top = Math.max(0, ...Object.values(target.threat))
    target.threat[self.id] = top * 1.1
  }
  emit(state, { round: state.round, type: 'buff_apply', sourceId: self.id, targetId: target.id, skillId: skill.id, extra: { statusId: status.id } })
}

// Begin or perform a cast. Channeled skills (channelTime ≥ 1) start a channel
// that resolves on a later turn and can be disrupted; instant skills resolve now.
function castSkill(state: BattleState, self: Combatant, skill: EngineSkill, targetId: string): void {
  if (skill.channelTime >= 1) {
    // A ground-zone AoE telegraphs a fixed spot, locked now so it can be dodged
    // (step off the marked ground). We lead a *moving* target: lock the spot it'll
    // reach as it advances on us through the channel, so a defensive slow/storm
    // lands in an approacher's path — and naturally misses anyone juking or
    // fleeing off the line. Capped short of the caster so it never lands behind us.
    let targetPoint: Vec2 | undefined
    const lock = skill.zone ? findCombatant(state, targetId) : null
    if (lock) {
      const dx = self.pos.x - lock.pos.x, dy = self.pos.y - lock.pos.y
      const dd = Math.hypot(dx, dy)
      const lead = Math.min(moveSpeedOf(lock) * skill.channelTime, dd * 0.8)
      targetPoint = dd > EPS ? { x: lock.pos.x + (dx / dd) * lead, y: lock.pos.y + (dy / dd) * lead } : { ...lock.pos }
    }
    self.channel = { skillId: skill.id, targetId, roundsLeft: scaleRounds(skill.channelTime), targetPoint }
    emit(state, { round: state.round, type: 'cast_start', sourceId: self.id, targetId, skillId: skill.id })
    return
  }
  resolveSkill(state, self, skill, targetId)
}

// ── Tactic evaluation (§5.3) ────────────────────────────────────────────────--
// Order: reaction → targeting → movement → action. Targeting runs before
// movement (a slight reorder of the spec's numbering) so movement can aim at the
// freshly resolved lock instead of last round's.

function onCooldown(self: Combatant, t: ResolvedTactic): boolean {
  return (self.tacticCooldowns[t.def.id] ?? 0) > 0
}
function usedUp(self: Combatant, t: ResolvedTactic): boolean {
  return !!t.def.oncePerCombat && self.tacticsUsed.includes(t.def.id)
}
function markFired(self: Combatant, t: ResolvedTactic): void {
  if (t.def.cooldown) self.tacticCooldowns[t.def.id] = scaleRounds(t.def.cooldown)
  if (t.def.oncePerCombat && !self.tacticsUsed.includes(t.def.id)) self.tacticsUsed.push(t.def.id)
}
// §debug: log how a tactic resolved this turn (drives BattleView's "active now").
function rec(self: Combatant, t: ResolvedTactic, outcome: TacticOutcome): void {
  self.lastResolution.push({ id: t.def.id, name: t.def.name, channel: t.def.channel, rank: t.rank, outcome })
}

function addStatus(c: Combatant, s: import('./types').StatusEffect): void {
  const i = c.statuses.findIndex((x) => x.id === s.id)
  if (i >= 0) c.statuses[i] = { ...s }
  else c.statuses.push({ ...s })
}

function setLock(state: BattleState, self: Combatant, id: string): void {
  if (self.lockedTargetId === id) return
  const from = self.lockedTargetId
  self.lockedTargetId = id
  emit(state, { round: state.round, type: 'target_switch', sourceId: self.id, targetId: id, extra: { from } })
}

function evalTargeting(state: BattleState, self: Combatant): void {
  // §aggression: a non-provoked unit (a skittish monster that hasn't been hit or
  // called) ignores foes entirely — no lock, so it wanders/holds instead of
  // hunting. It flips provoked on a hit (applyDamageRaw) or a packmate's call.
  if (!self.provoked) { self.lockedTargetId = null; return }
  // §threat hard taunt: a forced taunt overrides everything — even the unit's own
  // targeting tactics — and hard-locks the taunter for the status's duration,
  // provided it's still a living enemy. This is the player's "peel" button (and a
  // monster's, symmetrically): it beats the threat fallback and any tactic.
  const taunt = self.statuses.find((s) => s.flags.includes('taunted'))
  if (taunt) {
    const taunter = findCombatant(state, taunt.source)
    if (taunter && taunter.alive && taunter.team !== self.team) {
      setLock(state, self, taunter.id)
      return
    }
  }
  let won = false
  for (const t of self.tactics) {
    if (t.def.channel !== 'targeting' || !t.def.targeting) continue
    if (won) { rec(self, t, 'starved'); continue }
    if (onCooldown(self, t) || usedUp(self, t)) { rec(self, t, 'cooldown'); continue }
    const id = t.def.targeting(self, state, t.rank)
    if (id) { setLock(state, self, id); markFired(self, t); rec(self, t, 'fired'); won = true; continue }
    rec(self, t, 'idle')
  }
  if (won) return
  // default: keep lock if alive, else threat+proximity fallback (selectTarget)
  const prev = selectTarget(state, self)
  if (prev !== null && self.lockedTargetId) {
    emit(state, { round: state.round, type: 'target_switch', sourceId: self.id, targetId: self.lockedTargetId, extra: { from: prev } })
  }
}

function evalMovement(state: BattleState, self: Combatant): MovementResult | null {
  let plan: MovementResult | null = null
  for (const t of self.tactics) {
    if (t.def.channel !== 'movement' || !t.def.movement) continue
    if (plan) { rec(self, t, 'starved'); continue }
    if (onCooldown(self, t) || usedUp(self, t)) { rec(self, t, 'cooldown'); continue }
    const p = t.def.movement(self, state, t.rank)
    if (p) { markFired(self, t); rec(self, t, 'fired'); plan = p; continue }
    rec(self, t, 'idle')
  }
  return plan
}

function executeMovement(state: BattleState, self: Combatant, plan: MovementResult | null): void {
  if (plan?.clearLock) self.lockedTargetId = null
  // Wedged inside terrain (a crowded separation push or corner case can leave a
  // unit there)? Pop it out first — otherwise every trace starts blocked and the
  // unit freezes inside the barrier no matter what its plan says.
  if (pointBlocked(state.barriers, self.pos)) {
    const freed = escapeBarrier(self.pos, state.barriers)
    if (freed.x !== self.pos.x || freed.y !== self.pos.y) {
      self.pos = freed
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
      return
    }
  }
  if (self.statuses.some((s) => s.flags.includes('rooted'))) return   // §2 rooted: can act, can't move
  if (plan?.hold) return
  if (plan?.awayFromNearestEnemy) {
    const dir = self.team === 'player' ? -1 : 1
    const coh = cohesionVec(self, state)
    // Direction: toward our own edge, with a cohesion sideways curve so a
    // retreater drifts back toward the surviving party instead of into a corner.
    const dx = coh.x * COHESION_WEIGHT
    const dy = dir + coh.y * COHESION_WEIGHT
    const len = Math.hypot(dx, dy) || 1
    // Magnitude: (scaled) move speed × a panic boost — a consistent run, not a
    // fixed multi-cell hop. `plan.rows` is now just the disengage intent.
    const speed = moveSpeedOf(self) * RETREAT_SPEED_MULT
    const before = { ...self.pos }
    self.pos = slideMove(self.pos, { x: self.pos.x + (dx / len) * speed, y: self.pos.y + (dy / len) * speed }, state.barriers)
    enforceSeparation(self, state.combatants, state.barriers)
    if (self.pos.x !== before.x || self.pos.y !== before.y) {
      emit(state, { round: state.round, type: 'retreat', sourceId: self.id, position: { ...self.pos } })
    }
    return
  }
  // Kite: hold a desired gap to the locked target (back off if too close, close in if too far).
  if (plan?.desiredRange != null) { kiteToward(state, self, plan.desiredRange); return }
  // Move to a computed spot (flank / guard / regroup).
  if (plan?.toPoint) {
    if (moveTowardPoint(self, plan.toPoint, moveSpeedOf(self) * (plan.speedMult ?? 1), state.combatants, state.barriers)) {
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
    return
  }
  const target = findCombatant(state, self.lockedTargetId)
  if (target && target.alive) {
    // Default positioning: close to attack range and HOLD — stand and fire, letting
    // the enemy approach (trust the front line to peel). A caster stops at its *cast*
    // range (castRange) rather than its basic-attack reach, so a mage with a melee
    // weapon but ranged spells doesn't march into melee mid-channel — but it does
    // NOT back off. Active **kiting** (keeping a gap by retreating) is deliberately
    // opt-in via the Kiter / Wary Caster tactics (the `desiredRange` path above), not
    // a caster default, while we tune what the right default is.
    const reach = isCaster(self) ? castRange(self) : undefined
    const moved = moveToward(self, target, moveSpeedOf(self) * (plan?.speedMult ?? 1), state.combatants, state.barriers, reach)
    if (moved) emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    return
  }
  // Nothing to do this turn (no target): wander. In open world everyone roams;
  // in an encounter only a *non-provoked* unit wanders — i.e. a skittish monster
  // milling about on its own (it never made the first move). Provoked/aggressive
  // units that reach here (no foe in sight) just hold, so encounter tuning for
  // ordinary fights is untouched.
  if (state.mode === 'open' || !self.provoked) executeWander(state, self)
}

// ── Team blackboard (§coordination) ─────────────────────────────────────────--

function centroidOf(cs: Combatant[]): Vec2 {
  let x = 0, y = 0
  for (const c of cs) { x += c.pos.x; y += c.pos.y }
  return { x: x / cs.length, y: y / cs.length }
}

// The built-in blackboard producer. Computes, per team:
//   • waypoint — the party's shared roam target. If anyone's engaged it's the
//     centroid of the fight (roamers regroup on it); else, in open world, the
//     position of the committed hunt target (the party marches to known prey); else
//     a fresh far interior point, re-picked once the party arrives (deterministic
//     hash, so replays match). Heroes read this in executeWander; that's how
//     "wander together" stops being coincidence and becomes shared state.
//   • huntTargetId — the foe the party is routing toward (see §hunt below).
//   • focusTargetId — lowest-HP enemy the team can see. Read by the focus-fire
//     targeting tactics (Opportunist, Finish Them) via teamFocus so the party
//     converges on one foe and the "who's hurt" scan lives only here.
//   • threat — per-enemy danger score (advisory; exposed for debugging).
export function defaultPlanner(state: BattleState, team: Team): TeamPlan {
  const members = state.combatants.filter((c) => c.alive && c.team === team)
  const enemies = state.combatants.filter((c) => c.alive && c.team !== team)

  const threat: Record<string, number> = {}
  for (const e of enemies) threat[e.id] = Math.round(effectiveStat(e, 'str') + effectiveStat(e, 'int'))

  let focus: Combatant | null = null
  for (const e of enemies) {
    if (isStealthed(e)) continue
    if (!members.some((m) => distance(m.pos, e.pos) <= m.visionRange)) continue   // unseen
    if (!focus || e.hp < focus.hp || (e.hp === focus.hp && e.id < focus.id)) focus = e
  }

  let waypoint = state.plans[team]?.waypoint ?? null
  let huntTargetId: string | null = state.plans[team]?.huntTargetId ?? null
  const engaged = members.filter((m) => {
    const t = findCombatant(state, m.lockedTargetId)
    return !!(t && t.alive)
  })
  if (engaged.length) {
    waypoint = centroidOf(engaged)
    huntTargetId = null   // already in the fight; the engaged centroid is the rally point
  } else if (members.length) {
    const c = centroidOf(members)
    // §hunt: in open world, route the whole party to the nearest enemy a member
    // can currently *see* (fog-of-war) and march there together; commit until it's
    // dead/out of sight, then re-pick. Nothing in sight → fall back to roaming a
    // far point to explore and find prey. (Per-unit target *acquisition* still
    // gates on vision — this only steers the group toward known prey.)
    const hunt = state.mode === 'open' ? pickHuntTarget(state, members, enemies, c, huntTargetId) : null
    if (hunt) {
      huntTargetId = hunt.id
      waypoint = { x: hunt.pos.x, y: hunt.pos.y }
    } else {
      huntTargetId = null
      // Only re-pick once the party has actually arrived. A fresh waypoint is
      // chosen FAR from the party (pickRoamPoint) so they commit to a long
      // traverse instead of re-picking a nearby point each round — the latter
      // caused the corner "tiny step" left-right-left jitter.
      if (!waypoint || distance(c, waypoint) <= WANDER_REPATH) {
        waypoint = pickRoamPoint(state, c, team === 'player' ? 1 : 7)
      }
    }
  }
  return { waypoint, focusTargetId: focus?.id ?? null, threat, huntTargetId }
}

// §hunt target pick (open world). The nearest enemy to the party centroid that
// ANY living member can see (fog-of-war) and that's reachable through known
// terrain. Sticks with the previous commitment while it stays seen + reachable
// (no jitter from re-picking a marginally-closer foe each round); returns null
// when nothing's in sight so the caller roams to explore instead.
function pickHuntTarget(
  state: BattleState, members: Combatant[], enemies: Combatant[], center: Vec2, prevId: string | null,
): Combatant | null {
  const reachable = (p: Vec2) => state.barriers.length === 0 || canReach(center, p, state.barriers)
  const seen = enemies.filter(
    (e) => !isStealthed(e) && members.some((m) => distance(m.pos, e.pos) <= m.visionRange),
  )
  const held = prevId ? seen.find((e) => e.id === prevId) : undefined
  if (held && reachable(held.pos)) return held
  let best: Combatant | null = null
  for (const e of seen) {
    if (!reachable(e.pos)) continue
    if (!best || distance(center, e.pos) < distance(center, best.pos)
      || (distance(center, e.pos) === distance(center, best.pos) && e.id < best.id)) best = e
  }
  return best
}

// Pick a fresh roam target well away from `from`. Samples a handful of
// deterministic interior points and keeps the farthest that clears `roamMin`
// (and at least the farthest sampled), so the party always heads somewhere
// across the field rather than re-picking on top of itself. Interior margin is
// proportional to the map so it never collapses on big maps. Deterministic
// (hash of round), so replays match.
function pickRoamPoint(state: BattleState, from: Vec2, seed: number): Vec2 {
  const mx = Math.min(WANDER_MARGIN, state.cols * 0.15)
  const my = Math.min(WANDER_MARGIN, state.rows * 0.15)
  const iw = Math.max(1, state.cols - 2 * mx)
  const ih = Math.max(1, state.rows - 2 * my)
  const roamMin = 0.45 * Math.min(iw, ih)
  // Sample several interior points; keep the FARTHEST *reachable* one (and at
  // least the farthest sampled as a fallback). Reachability uses the known
  // terrain, so the party never commits to roaming at a walled-off region it
  // can't actually get to — it just picks somewhere it can.
  let best = from
  let bestD = -1
  let bestReachable: Vec2 | null = null
  let bestReachableD = -1
  const samples = state.barriers.length ? 14 : 8
  for (let k = 0; k < samples; k++) {
    const px = mx + hash01(state.round * 11 + seed + k * 131) * iw
    const py = my + hash01(state.round * 11 + seed + k * 131 + 61) * ih
    const p = { x: px, y: py }
    const d = Math.hypot(px - from.x, py - from.y)
    if (d > bestD) { bestD = d; best = p }
    if (d > bestReachableD && (state.barriers.length === 0 || canReach(from, p, state.barriers))) {
      bestReachableD = d; bestReachable = p
      if (d >= roamMin) break
    }
  }
  return bestReachable ?? best
}

// Recompute every team's blackboard once per round (start of advanceRound).
function runPlanners(state: BattleState): void {
  for (const team of ['player', 'enemy'] as Team[]) {
    state.plans[team] = state.planner(state, team)
  }
}

// ── Open-world wander (only reached when a unit has no target, mode === 'open') ─

// Fan the shared waypoint out per unit (a small 3-wide grid offset by index) so
// the party walks as a loose cluster instead of all aiming at the exact same
// cell — which separation would otherwise grind into edge jitter. But the
// per-unit offset can shove the point inside a wall or into an unroutable pocket
// (the shared waypoint itself is always reachable — see pickRoamPoint); when it
// does, fall back to the unoffset shared point so a wanderer never freezes
// against terrain (the "stuck wanderer" bug).
function offsetWaypoint(self: Combatant, wp: Vec2 | null | undefined, barriers: Barrier[]): Vec2 | null {
  if (!wp) return null
  const ox = ((self.index % 3) - 1) * 2.5
  const oy = ((Math.floor(self.index / 3) % 3) - 1) * 2.5
  // Keep the fanned-out target INSIDE the arena. When the shared waypoint sits
  // near an edge, the per-unit shove can push the offset off the map; aiming
  // off-arena, moveTowardPoint can't make straight progress into the rim and
  // slides sideways along it instead — two units then ping-pong left/right in
  // lockstep and cancel each other's movement out (the rim-jitter bug). Clamping
  // to bounds gives each unit a real, reachable spot it can actually arrive at
  // and hold.
  const offset = arenaClamp({ x: wp.x + ox, y: wp.y + oy })
  if (pointBlocked(barriers, offset) || !canReach(self.pos, offset, barriers)) return wp
  return offset
}

// Roam toward the team blackboard's shared waypoint (regroups on a fight, else
// roams a far point), fanned out per unit so the group travels as a loose
// cluster. Used by the hero party and by pack-hunter monsters alike — that's how
// a pack travels (and converges) together. Travel speed: crossing the big map is
// movement *between* fights, so it's brisk.
function roamTowardWaypoint(state: BattleState, self: Combatant): void {
  const speed = moveSpeedOf(self) * WANDER_SPEED_MULT
  const point = offsetWaypoint(self, state.plans[self.team]?.waypoint, state.barriers)
  if (!point) return
  if (moveTowardPoint(self, point, speed, state.combatants, state.barriers)) {
    emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
  }
}

function executeWander(state: BattleState, self: Combatant): void {
  if (self.statuses.some((s) => s.flags.includes('rooted'))) return

  // Heroes always roam as a party; pack-hunter monsters do the same (§pack wander)
  // so they travel as a group instead of each lurking alone.
  if (self.team === 'player' || hasTactic(self, 'pack-hunter')) { roamTowardWaypoint(state, self); return }

  // Other monsters: lurk, then hop a short distance to a new local spot.
  if (self.wanderTarget) {
    if (moveTowardPoint(self, self.wanderTarget, moveSpeedOf(self), state.combatants, state.barriers)) {
      emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
    if (distance(self.pos, self.wanderTarget) < 0.6) {
      self.wanderTarget = null
      self.wanderDwell = monsterDwell(state.round + self.index)
    }
    return
  }
  if (self.wanderDwell > 0) { self.wanderDwell -= 1; return }
  // Pick a hop: a deterministic direction + a 5–8 cell distance, kept a few
  // cells off the edges so monsters don't lurk jammed in a corner.
  const ang = hash01(state.round * 3 + self.index) * Math.PI * 2
  const dist = MONSTER_WANDER_NEAR + hash01(state.round * 3 + self.index + 7) * (MONSTER_WANDER_FAR - MONSTER_WANDER_NEAR)
  const m = Math.min(MONSTER_EDGE_MARGIN, state.cols / 2 - 0.5, state.rows / 2 - 0.5)
  self.wanderTarget = {
    x: Math.max(m, Math.min(state.cols - m, self.pos.x + Math.cos(ang) * dist)),
    y: Math.max(m, Math.min(state.rows - m, self.pos.y + Math.sin(ang) * dist)),
  }
}

// Pick a retreat heading for a kiter that's been closed on. We score sampled
// directions around the circle on the space each actually buys, so the kiter
// reasons about *where* to flee instead of just "directly away from the nearest
// foe" (which walks it into walls and into other enemies). For each candidate:
//   • trace how far we can travel that way before a wall/edge stops us (`reach`)
//     and step to the reachable landing spot — backing into a wall yields reach≈0
//     so the landing barely moves and earns no clearance, ruling it out;
//   • score the landing by its distance to the NEAREST of the surrounding
//     threats *at their predicted next positions* (a straight one-step chase) —
//     so a kiter hemmed in by several advancing foes is steered toward the gap
//     between them, anticipating the swarm rather than reacting a step late.
// A reach term favours roomy lanes over dead-ends, a mild away-from-nearest bias
// keeps an open-field retreat straight (and damps left/right tangent jitter via
// a deterministic tiebreak), and a light cohesion term keeps a kiting healer
// near its pack. Deterministic: a fixed sample set, no RNG.
//
// The away-bias is *gated on whether straight-away is actually open* (awayOpen):
// when a kiter is cornered, "away from the foe" points into the corner, so an
// ungated bias both rewards backing deeper into the dead-end and penalises the
// real escape — pinning the kiter there taking hits. Damping it when the away
// lane is walled lets clearance + reach drive the breakout, while open-field
// retreats (awayOpen≈1) keep the bias and its tuned behaviour untouched.
const ESCAPE_SAMPLES = 16
const ESCAPE_REACH_W = 0.25
const ESCAPE_DEADEND_W = 2.5   // penalty for a heading we can't even take a full step down (a near-wall) so a cornered kiter doesn't dither into the wall instead of fleeing the open lane
const ESCAPE_STICKY_W = 0.5    // bonus for continuing last turn's flee heading — kills the up/down flip-flop of a kiter pinned against a wall
const ESCAPE_AWAY_W = 0.3
const ESCAPE_THREAT_BUBBLE = 11   // cells: only foes this close shape the escape
const ESCAPE_MAX_THREATS = 6      // cap the cluster we score against (perf + signal)

function escapeHeading(state: BattleState, self: Combatant, nearest: Combatant, step: number): Vec2 {
  const probe = step * 2.5
  // The cluster to dodge: visible foes in a bubble, nearest first, capped. Each
  // is predicted one step closer (straight chase) so we read where it's headed.
  const threats = visibleEnemiesOf(state, self)
    .filter((e) => distance(self.pos, e.pos) <= ESCAPE_THREAT_BUBBLE)
    .sort((a, b) => distance(self.pos, a.pos) - distance(self.pos, b.pos))
    .slice(0, ESCAPE_MAX_THREATS)
  if (threats.length === 0) threats.push(nearest)
  const pred = threats.map((e) => {
    const vx = self.pos.x - e.pos.x, vy = self.pos.y - e.pos.y
    const vd = Math.hypot(vx, vy) || 1
    const s = moveSpeedOf(e)
    return { x: e.pos.x + (vx / vd) * s, y: e.pos.y + (vy / vd) * s }
  })
  const nd = distance(self.pos, nearest.pos) || 1
  const ax = (self.pos.x - nearest.pos.x) / nd, ay = (self.pos.y - nearest.pos.y) / nd
  // How open the straight-away lane is (0 = walled/cornered, 1 = clear): scales
  // the away-bias down when fleeing directly from the foe would just back us
  // into terrain, so a cornered kiter isn't pulled deeper into its own corner.
  // Sharp gate — it only bites a *genuine* dead-end (away lane under ~a cell),
  // not a merely-tight perimeter turn where straight-away still has room.
  const awayReach = distance(self.pos, traceMove(self.pos, { x: self.pos.x + ax * probe, y: self.pos.y + ay * probe }, state.barriers))
  const awayOpen = Math.max(0, Math.min(1, (awayReach - 0.4) / 1.0))
  const coh = cohesionVec(self, state)
  const prev = self.escapeDir   // last turn's committed heading (null when not fleeing)

  let best: Vec2 = { x: ax, y: ay }
  let bestScore = -Infinity
  for (let i = 0; i < ESCAPE_SAMPLES; i++) {
    const ang = (i / ESCAPE_SAMPLES) * Math.PI * 2
    const dx = Math.cos(ang), dy = Math.sin(ang)
    const reach = distance(self.pos, traceMove(self.pos, { x: self.pos.x + dx * probe, y: self.pos.y + dy * probe }, state.barriers))
    const travel = Math.min(step, reach)
    const lpx = self.pos.x + dx * travel, lpy = self.pos.y + dy * travel
    let clearance = Infinity
    for (const p of pred) clearance = Math.min(clearance, Math.hypot(lpx - p.x, lpy - p.y))
    const score = clearance
      + ESCAPE_REACH_W * reach
      - ESCAPE_DEADEND_W * Math.max(0, step - reach)   // shun near-walls (can't even step a full move that way)
      + ESCAPE_AWAY_W * awayOpen * (dx * ax + dy * ay)
      + COHESION_WEIGHT * (dx * coh.x + dy * coh.y)
      + (prev ? ESCAPE_STICKY_W * (dx * prev.x + dy * prev.y) : 0)   // commit to last turn's heading (anti flip-flop)
    if (score > bestScore + EPS) { bestScore = score; best = { x: dx, y: dy } }
  }
  self.escapeDir = best   // remember for next turn's hysteresis
  return best
}

// Hold `want` gap from the NEAREST enemy, AND maintain a clear shot. We only
// flee a threat that can actually close on us *directly* — if a movement barrier
// (wall/cliff) lies between us it can't reach without a long detour, so fleeing
// just wastes turns and panics into the wall (the Moat bug); instead we hold and
// shoot. When too close (and the threat can reach), back off along a tangential
// arc so the kiter circles instead of pinning itself in a corner. When too far:
// if we have a clear shot (incl. over a cliff) we close straight to firing
// range; only when a WALL blocks the shot do we route the visibility graph to
// round the corner. Small dead-band to avoid jitter; also peek one round ahead
// at the threat's approach so a chaser doesn't get a free tick of closing.
function kiteToward(state: BattleState, self: Combatant, want: number): void {
  const threat = nearestEnemyTo(self, state)
  if (!threat) return
  const d = distance(self.pos, threat.pos)
  const losClear = sightlineClear(self.pos, threat.pos, state.barriers)
  const band = 0.4

  // Only retreat from a threat that can actually close on us *directly*. If a
  // movement barrier (wall or cliff) — or one of our own firewalls the threat
  // hasn't broken through — sits on the straight line between us, the threat
  // can't reach without going around it. Fleeing then just opens the gap past
  // our own range and wastes turns (and, with a finite firewall, running
  // laterally walks us out from behind it so the chaser flanks the end). When
  // separated like this we HOLD and blast (keeping the wall between us), only
  // closing in if we're actually out of firing range.
  const canCloseDirectly = lineClear(self.pos, threat.pos, state.barriers)
    && !firewallBlocks(state.firewalls, threat.team, threat.id, threat.pos, self.pos)

  // Predict where this threat will be after its turn this round, assuming a
  // straight chase. If standing still would let it close past the kite line,
  // we retreat NOW instead of waiting for next round.
  const threatStep = moveSpeedOf(threat)
  const predictedD = d - threatStep
  const tooClose = canCloseDirectly && (d < want - band || predictedD < want - band)

  // Sweet spot: right gap, clear shot, AND the threat can't close past the
  // line next turn → stand and fire.
  if (losClear && !tooClose && d <= want + band) return

  const before = { ...self.pos }
  const step = moveSpeedOf(self)
  let retreating = false

  if (tooClose) {
    // Too close: back off along the heading that actually opens up the most
    // space (escapeHeading samples directions and reads the whole threat
    // cluster + terrain), so we flee through the gap between chasers instead
    // of straight into a wall or another enemy.
    retreating = true
    const { x: dx, y: dy } = escapeHeading(state, self, threat, step)
    self.pos = slideMove(self.pos, { x: self.pos.x + dx * step, y: self.pos.y + dy * step }, state.barriers)
  } else if (losClear) {
    // We have a clear shot but we're too far — close the gap *straight* toward
    // the threat until in firing range. If a movement-only barrier (a cliff)
    // sits between us, slideMove stops us at its edge; we keep LoS and shoot
    // over it (the Moat). Don't path AROUND here: the far side may be
    // unreachable on foot, yet perfectly shootable across the gap.
    const ux = (threat.pos.x - self.pos.x) / (d || 1)
    const uy = (threat.pos.y - self.pos.y) / (d || 1)
    const cap = Math.min(step, Math.max(0, d - want))
    if (cap > EPS) {
      self.pos = slideMove(self.pos, { x: self.pos.x + ux * cap, y: self.pos.y + uy * cap }, state.barriers)
    }
  } else {
    // In range but a WALL blocks the shot: route toward the threat via the
    // visibility graph so we round the corner that re-opens line of sight.
    const { point } = steerAround(self.pos, threat.pos, state.barriers)
    const gd = distance(self.pos, point)
    if (gd > EPS) {
      const ux = (point.x - self.pos.x) / gd
      const uy = (point.y - self.pos.y) / gd
      const cap = Math.min(step, gd)
      if (cap > EPS) {
        self.pos = slideMove(self.pos, { x: self.pos.x + ux * cap, y: self.pos.y + uy * cap }, state.barriers)
      }
    }
  }

  enforceSeparation(self, state.combatants, state.barriers)
  if (self.pos.x !== before.x || self.pos.y !== before.y) {
    emit(state, { round: state.round, type: retreating ? 'retreat' : 'move', sourceId: self.id, position: { ...self.pos } })
  }
}

function evalActionTactics(state: BattleState, self: Combatant): ActionResult | null {
  let result: ActionResult | null = null
  for (const t of self.tactics) {
    if (t.def.channel !== 'action' || !t.def.action) continue
    if (result) { rec(self, t, 'starved'); continue }
    if (onCooldown(self, t) || usedUp(self, t)) { rec(self, t, 'cooldown'); continue }
    const res = t.def.action(self, state, t.rank)
    if (res) {
      markFired(self, t)
      rec(self, t, 'fired')
      // Skill tactics already emit `skill_use` when their cast lands — only
      // surface non-skill action tactics (Burst, Chain, …) here.
      if (!t.def.id.startsWith('skill:')) {
        emit(state, { round: state.round, type: 'tactic_use', sourceId: self.id, tacticId: t.def.id, extra: { label: t.def.name } })
      }
      result = res   // first action tactic owns the turn's action
      continue
    }
    rec(self, t, 'idle')
  }
  return result
}

function evalReactions(state: BattleState, self: Combatant): ReactionResult | null {
  let result: ReactionResult | null = null
  for (const t of self.tactics) {
    if (t.def.channel !== 'reaction' || !t.def.reaction) continue
    if (result) { rec(self, t, 'starved'); continue }
    if (onCooldown(self, t) || usedUp(self, t)) { rec(self, t, 'cooldown'); continue }
    const res = t.def.reaction(self, state, t.rank)
    if (res) {
      markFired(self, t)
      rec(self, t, 'fired')
      emit(state, { round: state.round, type: 'tactic_use', sourceId: self.id, tacticId: t.def.id, extra: { label: t.def.name } })
      result = res
      continue
    }
    rec(self, t, 'idle')
  }
  return result
}

function applyReaction(state: BattleState, self: Combatant, res: ReactionResult): boolean {
  if (res.applyStatusToSelf) {
    addStatus(self, res.applyStatusToSelf)
    emit(state, { round: state.round, type: 'buff_apply', sourceId: self.id, targetId: self.id, extra: { statusId: res.applyStatusToSelf.id } })
  }
  if (res.counterAttack) {
    const target = findCombatant(state, res.counterAttack)
    if (target && target.alive) {
      dealAttack(state, self, target, state.calculateDamage(self, target, null, state.round), null)
      breakStealth(state, self)
    }
  }
  return !!res.consumesTurn
}

function executeNaiveAction(state: BattleState, self: Combatant): void {
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
  const target = findCombatant(state, action.targetId)
  if (!target || !target.alive) return
  const skill = action.kind === 'skill' ? action.skill : null
  // Basic attacks have no cooldown — they'd otherwise fire every round, so at a
  // finer time scale they'd hit N× too often. Pace them by the unit's attackSpeed
  // (§basic-attack cadence): a normal/fast attacker swings once per logical round
  // (staggered by index so the party doesn't all swing on the same finer-round), a
  // slow one less often. Skill casts are paced by their own scaled cooldowns, so
  // they're never gated.
  if (!skill && !onAttackBeat(state.round, self.index, self.spd)) return
  dealAttack(state, self, target, state.calculateDamage(self, target, skill, state.round), skill)
  if (skill) recordSkillUse(state, self, skill)   // dealAttack no longer records skill use
  breakStealth(state, self)                        // a basic attack also reveals (§3)
}

// Resolve / continue a channeled cast at the start of the caster's turn. Returns
// true if the channel consumed the turn (still casting or just resolved).
function tickChannel(state: BattleState, self: Combatant): boolean {
  if (!self.channel) return false
  self.channel.roundsLeft -= 1
  if (self.channel.roundsLeft <= 0) {
    const { skillId, targetId, targetPoint } = self.channel
    self.channel = null
    const skill = self.skills.find((s) => s.id === skillId)
    if (skill) {
      const tgt = findCombatant(state, targetId)
      // A locked-point AoE lands on its marked ground regardless; everything else
      // fizzles onto cooldown if its target is gone.
      if (targetPoint) resolveSkill(state, self, skill, targetId, targetPoint)
      else if (tgt && tgt.alive) resolveSkill(state, self, skill, targetId)
      else self.skillCooldowns[skill.id] = scaleRounds(skill.cooldown)   // fizzle: scale like a successful cast (recordSkillUse)
    }
  }
  return true   // a channel always consumes the turn (rooted while casting)
}

// ── Per-unit debug trace (§debug) ────────────────────────────────────────────--
const TRACE_CAP = 20
function pushTrace(c: Combatant, round: number, text: string): void {
  c.trace.push({ round, text })
  if (c.trace.length > TRACE_CAP) c.trace.splice(0, c.trace.length - TRACE_CAP)
}
function traceName(state: BattleState, id: string | null | undefined): string {
  if (!id) return '—'
  return findCombatant(state, id)?.name ?? id
}

// Point the token where the unit is heading: its actual move delta if it moved
// this turn, else toward whatever it's locked onto (so a stationary attacker
// still faces its foe). Keeps the last facing when neither applies. Normalised.
// Also records `moving` (did the position change) for the UI "tail".
function updateFacing(state: BattleState, self: Combatant, from: Vec2, moved: boolean): void {
  self.moving = moved
  let dx = 0, dy = 0
  if (moved) {
    dx = self.pos.x - from.x; dy = self.pos.y - from.y
  } else {
    const tgt = findCombatant(state, self.lockedTargetId)
    if (tgt && tgt.alive) { dx = tgt.pos.x - self.pos.x; dy = tgt.pos.y - self.pos.y }
  }
  const len = Math.hypot(dx, dy)
  if (len > EPS) self.facing = { x: dx / len, y: dy / len }
}

// §pack tactics: a provoked unit with Pack Tactics screams for kin — every
// same-NAME ally within its sight that isn't already fighting is roused and
// pointed at the caller's current target. This is what makes a herd aggro
// together and a cornered straggler call for help; ones already engaged keep
// their own quarry. Cheap to run each turn (the future "longer range / louder
// call" knobs are just this, gated or scaled). Threat-based retargeting onto
// other heroes is a later extension — for now newcomers adopt the caller's foe.
function rallyPack(state: BattleState, self: Combatant): void {
  if (!self.provoked || !hasTactic(self, 'pack-tactics')) return
  let called = 0
  for (const ally of state.combatants) {
    if (ally === self || !ally.alive || ally.provoked) continue
    if (ally.team !== self.team || ally.name !== self.name) continue
    if (distance(self.pos, ally.pos) > self.visionRange) continue
    ally.provoked = true
    if (self.lockedTargetId) ally.lockedTargetId = self.lockedTargetId
    emit(state, { round: state.round, type: 'aggro', sourceId: ally.id, position: { ...ally.pos } })
    called++
  }
  // One "call ring" from the caller when it actually rouses kin.
  if (called) emit(state, { round: state.round, type: 'rally', sourceId: self.id, position: { ...self.pos } })
}

function takeTurn(state: BattleState, self: Combatant): void {
  const round = state.round
  bumpVisionGen()   // start a fresh per-turn vision-cache generation (only `self` moves this turn)
  self.moving = false   // set true only if this turn produces a position change
  self.lastResolution = []   // §debug: rebuilt by the eval loops below (see rec)
  // (0) hard control — lose the turn. Stun is consumed on the skipped turn;
  // Freeze ages out normally (so its damage amplification persists, §3).
  const control = self.statuses.find((s) => s.flags.includes('stunned') || s.flags.includes('frozen'))
  if (control) {
    if (control.flags.includes('stunned')) self.statuses = self.statuses.filter((s) => s !== control)
    pushTrace(self, round, control.flags.includes('frozen') ? 'frozen — skip turn' : 'stunned — skip turn')
    self.lastHitById = null
    return
  }

  // (0) channeled cast in progress — continue or resolve it
  if (self.channel) {
    const sk = self.channel.skillId
    tickChannel(state, self)
    pushTrace(self, round, self.channel ? `channeling ${sk} (${self.channel.roundsLeft} left)` : `cast ${sk} resolved`)
    self.lastHitById = null
    return
  }

  // (1) reaction — may consume the turn
  const reaction = evalReactions(state, self)
  if (reaction && applyReaction(state, self, reaction)) {
    pushTrace(self, round, `reaction${reaction.counterAttack ? ` · counter ${traceName(state, reaction.counterAttack)}` : ''}`)
    self.lastHitById = null
    return
  }

  // (1.5) move order — an explicit "go here" overrides targeting/wander. Path
  // toward it (routing around known terrain); clear on arrival; hold if it's
  // unreachable. Consumes the turn's movement+action (the unit is marching).
  if (self.moveOrder) {
    if (self.statuses.some((s) => s.flags.includes('rooted'))) { pushTrace(self, round, 'order: rooted — hold'); self.lastHitById = null; return }
    const dest = self.moveOrder
    const posBefore = { ...self.pos }
    let moved = false
    if (distance(self.pos, dest) > MOVE_ORDER_ARRIVE) {
      moved = moveTowardPoint(self, dest, moveSpeedOf(self) * WANDER_SPEED_MULT, state.combatants, state.barriers)
      applyFirewalls(state, self, posBefore)   // §firewall: a marching foe bounces too
      updateFacing(state, self, posBefore, moved)
      if (moved) emit(state, { round: state.round, type: 'move', sourceId: self.id, position: { ...self.pos } })
    }
    // Arrived (this turn's step landed us there, or we were already close) →
    // clear the order in the same turn so control returns immediately.
    const arrived = distance(self.pos, dest) <= MOVE_ORDER_ARRIVE
    if (arrived) self.moveOrder = null
    pushTrace(self, round,
      arrived ? `order: arrived (${dest.x.toFixed(1)},${dest.y.toFixed(1)})`
      : moved ? `order → (${dest.x.toFixed(1)},${dest.y.toFixed(1)})  move (${posBefore.x.toFixed(1)},${posBefore.y.toFixed(1)})→(${self.pos.x.toFixed(1)},${self.pos.y.toFixed(1)})`
      : `order → (${dest.x.toFixed(1)},${dest.y.toFixed(1)})  blocked/unreachable — hold`)
    self.lastHitById = null
    return
  }

  // (3→2) targeting, then movement aimed at the resolved lock. On a non-decision
  // round we SKIP the expensive re-target (vision/threat/tactics) and keep the
  // committed lock — just drop it cheaply if the target died, so movement stays
  // valid (the unit holds/wanders until the next decision round re-aims).
  const decideNow = isDecisionRound(state)
  const lockBefore = self.lockedTargetId
  if (decideNow) {
    evalTargeting(state, self)
  } else if (self.lockedTargetId) {
    const lt = findCombatant(state, self.lockedTargetId)
    if (!lt || !lt.alive) self.lockedTargetId = null
  }
  if (decideNow) rallyPack(state, self)   // §pack tactics: call kin (a decision)
  const tgtText = self.lockedTargetId
    ? `→ ${traceName(state, self.lockedTargetId)}${self.lockedTargetId !== lockBefore ? ' (new)' : ''}`
    : (state.mode === 'open' || !self.provoked ? 'no target · wander' : 'no target')

  const posBefore = { ...self.pos }
  // Between decisions, execute committed movement without the steerAround Dijkstra
  // (slide straight; re-route at the next decision round). No-op when decideNow.
  if (!decideNow) setDirectMove(true)
  executeMovement(state, self, applyLeash(state, self, evalMovement(state, self)))
  setDirectMove(false)
  applyFirewalls(state, self, posBefore)   // §firewall: bounce a foe that tried to cross
  const moved = self.pos.x !== posBefore.x || self.pos.y !== posBefore.y
  updateFacing(state, self, posBefore, moved)
  const moveText = moved
    ? `move (${posBefore.x.toFixed(1)},${posBefore.y.toFixed(1)})→(${self.pos.x.toFixed(1)},${self.pos.y.toFixed(1)})`
    : 'hold'

  // (3.5) target-aware attack ranking — promote the hardest-hitting attack vs
  // the locked enemy (element matrix + magic/physical mitigation) so the action
  // channel's first-match opens with it. See reorderAttacksForTarget.
  const lockedTarget = self.lockedTargetId ? findCombatant(state, self.lockedTargetId) : null
  const exploitNote = lockedTarget ? reorderAttacksForTarget(self, lockedTarget) : null

  // (4) action — an action tactic owns the turn if it fires: a skill cast (skills
  // are action tactics) or a Burst/Chain. Else fall back to a basic attack.
  let actionText: string
  const act = evalActionTactics(state, self)
  if (act) {
    if (act.applyStatusToSelf) addStatus(self, act.applyStatusToSelf)
    if (act.castSkill && act.skillTarget) castSkill(state, self, act.castSkill, act.skillTarget)
    actionText = act.castSkill ? `cast ${act.castSkill.name} @ ${traceName(state, act.skillTarget)}`
      : act.applyStatusToSelf ? `self-buff ${act.applyStatusToSelf.name ?? act.applyStatusToSelf.id}`
      : act.skipAttack ? 'hold (banking)'
      : 'act'
  } else {
    const peek = chooseAction(state, self)   // pure read; executeNaiveAction re-derives it
    actionText = peek
      ? (peek.kind === 'heal' ? `heal ${traceName(state, peek.targetId)}`
        : peek.kind === 'skill' ? `cast ${peek.skill.name} @ ${traceName(state, peek.targetId)}`
        : `attack ${traceName(state, peek.targetId)}`)
      : 'idle'
    executeNaiveAction(state, self)
  }

  pushTrace(self, round, `${tgtText} · ${moveText} · ${actionText}${exploitNote ? ` · ⚡${exploitNote}` : ''}`)
  // consume "hit since last turn" so Counterattacker only fires on fresh hits
  self.lastHitById = null
}

function evalOutcome(state: BattleState): Outcome {
  // Open-world battles are persistent — they never self-terminate on a wipe.
  // The host trickles reinforcements in and decides when to tear the battle
  // down (e.g. no eligible heroes remain at the location).
  if (state.mode === 'open') return 'ongoing'
  const playersAlive = state.combatants.some((c) => c.alive && c.team === 'player')
  const enemiesAlive = state.combatants.some((c) => c.alive && c.team === 'enemy')
  if (!enemiesAlive) return 'victory'
  if (!playersAlive) return 'defeat'
  if (state.round >= scaleRounds(state.maxRounds)) return 'draw'  // §9.2 draw favors defender → loss for the player
  return 'ongoing'
}

// Resolve exactly one round in place (§9.1). No-op once the battle is decided.
const EVENT_CAP = 600   // open battles never reset; keep the event log bounded

// True on rounds where units re-decide (re-target, refresh the team plan). With
// decisionInterval 1 (default) this is every round — byte-identical to before.
function isDecisionRound(state: BattleState): boolean {
  return state.round % Math.max(1, state.decisionInterval) === 0
}

export function advanceRound(state: BattleState): BattleState {
  if (state.outcome !== 'ongoing') return state
  setArenaBounds(state.cols, state.rows)   // movement/clamp use this battle's bounds
  setTimeScale(state.timeScale)            // per-round helpers scale to finer rounds
  // Bucket combatants once (round-start positions) so separation / target-acquisition
  // do O(local) neighbour queries this round instead of O(N²). Cleared at the end so
  // between-round work (spawns) and other call paths fall back to a brute scan.
  setSpatialHash(new SpatialHash(state.combatants))
  clearVisionCache()   // drop last round's per-turn vision memos (bounds memory across battles)
  // Open battles run forever — trim the event log so it can't grow unbounded
  // (only the current round's events are ever read for rendering).
  if (state.mode === 'open' && state.collectEvents && state.events.length > EVENT_CAP) {
    state.events.splice(0, state.events.length - EVENT_CAP)
  }
  state.round += 1

  // §coordination: refresh every team's blackboard (shared waypoint, focus,
  // threat) before any unit acts; tactics/wander read it this round. Throttled to
  // decision rounds (default every round) — between them teams hold their plan.
  if (isDecisionRound(state)) runPlanners(state)

  // §9.1.1 tick status effects (apply DoT, then age out)
  for (const c of state.combatants) {
    if (c.statuses.length === 0) continue
    const kept = []
    for (const s of c.statuses) {
      if (s.dotDamage && c.alive && onBeat(state.round)) applyTickDamage(state, s.source, c, s.dotDamage, s.element ?? 'neutral', s.id)
      s.duration -= 1
      if (s.duration > 0) kept.push(s)
      else emit(state, { round: state.round, type: 'status_expire', sourceId: c.id, extra: { statusId: s.id } })
    }
    c.statuses = kept
  }

  // §minions: age summoned lifetimes and crumble minions whose master is gone.
  // A timed summon (summonTtl) counts down once per engine round and dies at 0; a
  // minion whose owner is dead/absent (a slain caster, a recalled companion's
  // hero) crumbles too. Emits unit_death so the UI clears the token.
  let crumbled: Set<string> | null = null
  for (const c of state.combatants) {
    if (!c.alive || c.ownerId == null) continue
    const owner = findCombatant(state, c.ownerId)
    const ownerGone = !owner || !owner.alive
    if (c.summonTtl != null && !ownerGone) c.summonTtl -= 1
    if (ownerGone || (c.summonTtl != null && c.summonTtl <= 0)) {
      c.alive = false
      ;(crumbled ??= new Set()).add(c.id)
      emit(state, { round: state.round, type: 'unit_death', sourceId: c.ownerId, targetId: c.id })
    }
  }
  // Clear locks pointing at a crumbled minion in ONE pass over the roster rather
  // than one pass per crumble (was O(minions × N)). Lock-clears are commutative and
  // nothing in the crumble loop above reads lockedTargetId, so deferring them here
  // is byte-identical. (Non-spatial — keyed on lockedTargetId, so the hash can't help.)
  if (crumbled) {
    for (const o of state.combatants) if (o.lockedTargetId && crumbled.has(o.lockedTargetId)) o.lockedTargetId = null
  }

  // §2 ground hazards (Lightning Storm / Consecration zones): re-center auras, age
  // them out, and seed eligibility (begins-turn-in-aura). Effects land at round end
  // (applyZoneEffects) after units have moved. Firewalls just age here.
  const zoneElig: ZoneElig = new Map()
  seedZones(state, zoneElig)
  tickFirewalls(state)

  // §9.1.2 tick cooldowns (skills + tactics)
  for (const c of state.combatants) {
    for (const id of Object.keys(c.skillCooldowns)) {
      if (c.skillCooldowns[id] > 0) c.skillCooldowns[id] -= 1
    }
    for (const id of Object.keys(c.tacticCooldowns)) {
      if (c.tacticCooldowns[id] > 0) c.tacticCooldowns[id] -= 1
    }
    // §wary-caster: a caster's "wariness" fades when it's left alone — decay
    // interruptedCount on a cadence so a couple of old disruptions don't make a
    // mage kite for the rest of the fight. A fresh interrupt (applyDamageRaw /
    // channel break) re-arms it. Deterministic (round-driven), so replay is 1:1.
    if (c.interruptedCount > 0 && state.round % scaleRounds(WARY_INTERRUPT_DECAY) === 0) c.interruptedCount -= 1
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

  // §9.1.4 each living unit acts once (dead-mid-round units are skipped). After
  // each turn, auras track their just-moved caster and pick up anyone who stepped
  // into a zone (enters-during-turn).
  for (const c of order) {
    if (!c.alive) continue
    takeTurn(state, c)
    trackZones(state, zoneElig)
  }

  // §2 zone effects land now, once, on everyone who began/entered/ends inside.
  applyZoneEffects(state, zoneElig)

  // §9.1.5 win condition
  state.outcome = evalOutcome(state)
  setSpatialHash(null)   // live only during the round; between rounds → brute scan
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
