// Combat Tactic Engine — tactic catalog & helpers (spec §5, §6, §15).
//
// Tactics are the player's lever: equip a few named tactics and behaviour
// changes. Each tactic lives on exactly one channel (movement, targeting,
// action, reaction, passive). The engine evaluates them in priority order per
// channel (§5.3). Passives carry no function — their effect is read here by the
// damage/targeting code via the exported helpers.
//
// This is the v0.1 catalog: tactics that need no skills or consumables, chosen
// to exercise all five channels plus a party tactic. Numeric parameters scale
// with rank (§15).

import { distance } from './grid'
import { timeScale } from './timescale'
import { SEPARATION, EPS, CHARGER_DIVE_RADIUS, CHARGER_LEASH, CHARGER_LEASH_PER_RANK } from './constants'
import { effectiveStat, skillDamageEstimate } from './damage'
import {
  lockedTarget, nearestEnemyTo, isCaster, visibleEnemiesOf, alliesOf, centroid,
  squishiestAlly, flankPoint, guardPoint, kiteDistanceFor,
} from './spatial'
import { selectSkillTarget, skillActiveCap } from './skills'
import type {
  BattleState, Combatant, ResolvedTactic, StatusEffect, TacticDef, TacticRef,
} from './types'

// ── small local helpers (kept here to avoid import cycles) ──────────────────────

// Targeting tactics pick from the foes a unit can actually perceive — the shared
// fog-of-war-gated set (visibleEnemiesOf). Using the whole roster here is what let
// an AoE caster's Storm Caller lock a cluster 40 cells out of sight.
const enemiesOf = visibleEnemiesOf
// §coordination read-side: the team's shared focus target (lowest-HP visible enemy)
// computed once per round by the planner (defaultPlanner). Targeting tactics read
// this instead of each re-scanning for "who's hurt" — so the party concentrates on
// one foe and vision/stealth filtering lives in exactly one place. Returns the
// live combatant (alive) or null when there's no focus / the blackboard is unset.
function teamFocus(self: Combatant, state: BattleState): Combatant | null {
  const id = state.plans?.[self.team]?.focusTargetId
  if (!id) return null
  const c = state.combatants.find((x) => x.id === id)
  return c && c.alive ? c : null
}
function defOf(c: Combatant): number { return effectiveStat(c, 'def') }
function hpRatio(c: Combatant): number { return c.hp / c.maxHp }
function isCloaked(c: Combatant): boolean { return c.statuses.some((s) => s.flags.includes('stealthed')) }

// §chain: is the previous cast's target still a good pick for the follow-up
// skill `to`? (alive, in range, right side, and — for a buff/debuff — not already
// carrying its status). If so the chain lands the follow-up on the SAME target.
function chainTargetOk(self: Combatant, state: BattleState, to: import('./types').EngineSkill, id: string | null): boolean {
  if (!id) return false
  const t = state.combatants.find((c) => c.id === id)
  if (!t || !t.alive) return false
  if (distance(self.pos, t.pos) > (to.range || Infinity) + EPS) return false
  const allyAimed = to.targeting === 'self' || to.targeting === 'single_ally' || to.targeting === 'aoe_ally'
  if (allyAimed !== (t.team === self.team)) return false
  if (to.statusApplied && t.statuses.some((s) => s.id === to.statusApplied)) return false
  return true
}
// A Chain tactic: right after the unit casts the skill in slot `from`, follow up
// with the skill in slot `to` (the next slot) on the same target if it's ready.
// "slot" = position among the unit's equipped skills (in action-bar order). The
// follow-up only fires the turn immediately after, so the two read as a combo;
// equipping several chains (1-2, 2-3, …) links a longer sequence.
const CHAIN_WINDOW = 1   // rounds after the source cast that the follow-up may fire
function chainTactic(fromIdx: number, toIdx: number): TacticDef {
  return {
    id: `chain-${fromIdx + 1}-${toIdx + 1}`,
    name: `Chain ${fromIdx + 1}–${toIdx + 1}`,
    description: `After casting skill #${fromIdx + 1}, immediately follow up with skill #${toIdx + 1} on the same target (if it's off cooldown) — chains the two together.`,
    scope: 'unit', channel: 'action',
    action: (self, state) => {
      const from = self.skills[fromIdx], to = self.skills[toIdx]
      if (!from || !to) return null
      if (self.lastCastSkillId !== from.id || state.round - self.lastCastRound > CHAIN_WINDOW) return null
      if ((self.skillCooldowns[to.id] ?? 0) > 0) return null
      const cap = skillActiveCap(state, self, to)
      if (cap && cap.active >= cap.max) return null
      const targetId = chainTargetOk(self, state, to, self.lastCastTargetId) ? self.lastCastTargetId! : selectSkillTarget(self, state, to)
      if (!targetId) return null
      return { castSkill: to, skillTarget: targetId }
    },
  }
}

// The widest blast radius among a unit's skills (0 if it has no AoE skill).
function maxAoeRadius(c: Combatant): number {
  let r = 0
  for (const s of c.skills) if (s.aoeRadius > r) r = s.aoeRadius
  return r
}

// Deterministic min-by with id tiebreak.
function pickBy(list: Combatant[], score: (c: Combatant) => number, prefer: 'min' | 'max'): Combatant | null {
  let best: Combatant | null = null
  let bestScore = 0
  for (const c of list) {
    const s = score(c)
    if (best === null) { best = c; bestScore = s; continue }
    const better = prefer === 'min' ? s < bestScore : s > bestScore
    const tie = s === bestScore && c.id < best.id
    if (better || tie) { best = c; bestScore = s }
  }
  return best
}

// §swoop (hit-and-run flyer). The dive/hover cycle is derived from the round
// counter (no per-unit memory), staggered per unit by `index` so a swarm doesn't
// dive in lockstep — deterministic, so it replays 1:1 like the rest of the engine.
const SWOOP_PERIOD = 5        // rounds per dive→hover cycle at rank 1
const SWOOP_PERIOD_MIN = 3    // floor on the cycle length (dives can't get more frequent than this)
const SWOOP_DIVE_ROUNDS = 2   // rounds at the start of each cycle spent diving in (the rest is hover)
const SWOOP_STANDOFF = 3.5    // gap (cells) to hover at between dives

// ── catalog ─────────────────────────────────────────────────────────────────--

export const TACTIC_REGISTRY: Record<string, TacticDef> = {
  // Targeting ------------------------------------------------------------------
  'tank-buster': {
    id: 'tank-buster', name: 'Tank Buster', scope: 'unit', channel: 'targeting', kind: 'floor',
    description: 'Lock onto the enemy with the highest defense.',
    targeting: (self, state) => pickBy(enemiesOf(state, self), defOf, 'max')?.id ?? null,
  },
  'opportunist': {
    id: 'opportunist', name: 'Opportunist', scope: 'unit', channel: 'targeting',
    description: 'Lock onto the team\'s wounded focus to finish it off.',
    // Reads the shared blackboard focus (the planner already picked the most
    // wounded visible enemy) and commits only when it's actually low — rank
    // loosens the bar. The "who's hurt" scan lives in the planner now.
    targeting: (self, state, rank) => {
      const threshold = 0.4 + 0.05 * (rank - 1)
      const focus = teamFocus(self, state)
      return focus && hpRatio(focus) < threshold ? focus.id : null
    },
  },
  'interrupt': {
    id: 'interrupt', name: 'Interrupt', scope: 'unit', channel: 'targeting',
    description: 'Hunt the nearest enemy mid-cast to break their spell.',
    targeting: (self, state) => {
      const casting = enemiesOf(state, self).filter((e) => e.channel != null)
      return casting.length ? pickBy(casting, (e) => distance(self.pos, e.pos), 'min')!.id : null
    },
  },
  'focus-casters': {
    id: 'focus-casters', name: 'Focus Casters', scope: 'unit', channel: 'targeting',
    description: 'Go after the squishy spellcasters first.',
    targeting: (self, state) => {
      const casters = enemiesOf(state, self).filter((e) => effectiveStat(e, 'int') > effectiveStat(e, 'str'))
      return casters.length ? pickBy(casters, (e) => effectiveStat(e, 'int'), 'max')!.id : null
    },
  },
  'storm-caller': {
    id: 'storm-caller', name: 'Storm Caller', scope: 'unit', channel: 'targeting',
    description: 'AoE casters: drop the blast on the densest enemy cluster to catch the most foes — but only settle for a thin (2-foe) cluster when you can hit it from a safe distance, since the long cast is wasted on a single target.',
    targeting: (self, state, rank) => {
      const aoeR = maxAoeRadius(self)
      if (aoeR <= 0) return null   // no AoE skill → let other targeting tactics decide
      const foes = enemiesOf(state, self)
      if (foes.length === 0) return null
      // Cluster value of a candidate epicentre = foes within one blast radius.
      const clusterSize = (c: Combatant) => foes.filter((e) => distance(c.pos, e.pos) <= aoeR + EPS).length
      const center = pickBy(foes, clusterSize, 'max')
      if (!center) return null
      // How many foes justify committing the long channel. We want a fat cluster
      // (3+), but it's fine to nuke just 2 when we're safely out of reach (can
      // channel uninterrupted). Higher rank lowers the bar (more trigger-happy).
      const threat = nearestEnemyTo(self, state)
      const safe = !threat || distance(self.pos, threat.pos) >= kiteDistanceFor(self, threat)
      const want = Math.max(2, (safe ? 2 : 3) - (rank - 1))
      return clusterSize(center) >= want ? center.id : null
    },
  },

  'assassinate': {
    id: 'assassinate', name: 'Assassinate', scope: 'unit', channel: 'targeting',
    description: "Hunt the enemy's healer/support and blow it up first.",
    // Role-based target pick (pairs with Burst for an alpha strike on the
    // backline): a healer if the enemy has one, else their strongest caster.
    targeting: (self, state) => {
      const foes = enemiesOf(state, self)
      const healers = foes.filter((e) => e.skills.some((s) => s.type === 'heal'))
      if (healers.length) return pickBy(healers, (e) => effectiveStat(e, 'int'), 'max')!.id
      const casters = foes.filter((e) => effectiveStat(e, 'int') > effectiveStat(e, 'str'))
      return casters.length ? pickBy(casters, (e) => effectiveStat(e, 'int'), 'max')!.id : null
    },
  },

  // Movement -------------------------------------------------------------------
  'charger': {
    id: 'charger', name: 'Charger', scope: 'unit', channel: 'movement', kind: 'floor',
    description: 'Dive into melee on the target — crash into the thick of the pack (pairs with a melee AoE). Breaks off to regroup if a fleeing foe drags it too far from the party.',
    // A pure positioning behaviour: no speed-up, no damage bonus. With a target it
    // aims at the centroid of the enemy cluster around that target (so it ends up
    // *inside* the group, not poking the nearest edge), and leashes back to the
    // party when a runaway target pulls it past CHARGER_LEASH from the team centre.
    movement: (self, state, rank) => {
      const t = lockedTarget(self, state)
      if (!t) return null   // nothing locked → fall through to default/wander
      // Leash: party cohesion over chasing forever. If we've been dragged past the
      // leash radius from the party centre, break off, drop the runaway lock, and
      // head home instead of following a fleeing foe across the map.
      const mates = alliesOf(state, self)
      const home = centroid(mates)
      const leash = CHARGER_LEASH + CHARGER_LEASH_PER_RANK * (rank - 1)
      if (home && distance(self.pos, home) > leash) return { toPoint: home, clearLock: true }
      // Dive point: melee contact with the locked target, on the side facing the
      // enemy pack's centre of mass (within CHARGER_DIVE_RADIUS) — so the charger
      // ends up *inside* the cluster (a following melee AoE catches several) yet
      // always closes to striking range of its target. Aiming at the raw centroid
      // stranded it on an empty centre-of-mass between spread-out foes, micro-stepping
      // in range of no one (the "creep, never hit" bug). No pack / a centroid sitting
      // on the target ⇒ just charge the target directly.
      const pack = visibleEnemiesOf(state, self).filter((e) => distance(e.pos, t.pos) <= CHARGER_DIVE_RADIUS)
      const c = centroid(pack)
      if (!c) return { toPoint: { x: t.pos.x, y: t.pos.y } }
      const dx = c.x - t.pos.x, dy = c.y - t.pos.y
      const len = Math.hypot(dx, dy)
      if (len <= EPS) return { toPoint: { x: t.pos.x, y: t.pos.y } }
      const reach = self.meleeRange * 0.9
      return { toPoint: { x: t.pos.x + (dx / len) * reach, y: t.pos.y + (dy / len) * reach } }
    },
  },
  'retreater': {
    id: 'retreater', name: 'Retreater', scope: 'unit', channel: 'movement', oncePerCombat: true,
    description: 'Fall back and disengage when badly hurt.',
    movement: (self, _state, rank) => {
      const threshold = 0.4 - 0.05 * (rank - 1)
      return hpRatio(self) < threshold ? { awayFromNearestEnemy: true, rows: 3, clearLock: true } : null
    },
  },
  'flanker': {
    id: 'flanker', name: 'Flanker', scope: 'unit', channel: 'movement', kind: 'floor',
    description: "Circle to the locked target's least-guarded side before striking.",
    movement: (self, state) => {
      const t = lockedTarget(self, state)
      if (!t) return null
      return { toPoint: flankPoint(self, t, state, Math.max(self.meleeRange, SEPARATION)) }
    },
  },
  'kiter': {
    id: 'kiter', name: 'Kiter', scope: 'unit', channel: 'movement', kind: 'floor',
    description: 'Ranged: hold at spell/attack range from the nearest foe; back off further if a fast chaser or a long-channel spell would catch you mid-cast.',
    movement: (self, state) => {
      if (self.rangedRange <= 0 || !lockedTarget(self, state)) return null
      const threat = nearestEnemyTo(self, state)
      if (!threat) return null
      return { desiredRange: kiteDistanceFor(self, threat) }
    },
  },
  'swoop': {
    id: 'swoop', name: 'Swoop', scope: 'unit', channel: 'movement',
    description: 'Hit-and-run flyer: hover at range, then dive in to strike and peel straight back out of melee.',
    // Pure positioning (no speed modifier). Dive phase: `toPoint` at the target
    // (no reach-stop) so it closes into melee and lands a basic hit. Hover phase:
    // `desiredRange` (the kiter mechanism) backs it out past attack range again.
    // The cycle is stateless — see SWOOP_* above — so a swarm staggers and the run
    // replays deterministically.
    movement: (self, state, rank) => {
      const t = lockedTarget(self, state)
      if (!t) return null
      const ts = timeScale()   // keep the dive/hover cadence the same in real seconds
      const period = Math.max(SWOOP_PERIOD_MIN, SWOOP_PERIOD - (rank - 1)) * ts   // dives more often at higher rank
      const phase = (state.round + self.index) % period
      if (phase < SWOOP_DIVE_ROUNDS * ts) return { toPoint: { x: t.pos.x, y: t.pos.y } }
      return { desiredRange: SWOOP_STANDOFF }
    },
  },
  'chain-1-2': chainTactic(0, 1),
  'chain-2-3': chainTactic(1, 2),
  'chain-3-4': chainTactic(2, 3),
  'guardian': {
    id: 'guardian', name: 'Guardian', scope: 'unit', channel: 'movement', kind: 'floor',
    description: 'Body-block: stand between your squishiest ally and the nearest threat.',
    movement: (self, state) => {
      const ally = squishiestAlly(self, state)
      if (!ally) return null
      const threat = nearestEnemyTo(ally, state)
      if (!threat) return null
      return { toPoint: guardPoint(ally, threat, SEPARATION * 1.6) }
    },
  },
  'ambusher': {
    id: 'ambusher', name: 'Ambusher', scope: 'unit', channel: 'movement',
    description: "While cloaked, stalk to your target's blind side to line up the opening strike before you're seen. Pairs with Cloak + Back Stab as a pre-ambush.",
    movement: (self, state) => {
      if (!isCloaked(self)) return null   // only steers the approach while hidden; once revealed, normal movement
      const t = lockedTarget(self, state)
      if (!t) return null
      return { toPoint: flankPoint(self, t, state, Math.max(self.meleeRange, SEPARATION)) }
    },
  },
  'wary-caster': {
    id: 'wary-caster', name: 'Wary Caster', scope: 'unit', channel: 'movement',
    description: "A caster who keeps getting their spell interrupted assumes the enemy is hunting the cast — backs off further from assailants after each disruption so they can channel from a safer distance.",
    movement: (self, state, rank) => {
      if (self.rangedRange <= 0 && !isCaster(self)) return null   // melee can't kite-cast
      if (self.interruptedCount <= 0) return null                 // unbothered → leave positioning to the default caster kite
      const threat = nearestEnemyTo(self, state)
      if (!threat) return null
      // Widen the kite gap the more we've been denied (capped) so a chaser can't
      // keep clipping the cast; rank steepens the back-off.
      const extra = Math.min(self.interruptedCount, 4) * (0.8 + 0.4 * (rank - 1))
      return { desiredRange: kiteDistanceFor(self, threat) + extra }
    },
  },
  // Regroup retired: cohesion is now a light default bias inside back-off
  // movements (kite retreat, retreater fall-back). The old standalone tactic
  // fought kiter for priority and produced visible oscillation when a healer's
  // tank advanced — see `cohesionVec` in spatial.ts.

  // Action ---------------------------------------------------------------------
  // (Shield Wall moved to a skill — only skills modify stats. Equipping the skill
  // grants its own gated cast tactic via makeSkillTactic; see canShieldWall.)
  'burst': {
    id: 'burst', name: 'Burst', scope: 'unit', channel: 'action',
    description: 'Bank a small skill while your heavy hitter is about to come off cooldown, then chain big → small.',
    // Front-load combo. With item 6 the action channel already opens with the
    // biggest ready nuke; Burst adds the anticipation: when the heavy hitter is
    // *imminent* (on cooldown but ≤ window rounds out) and a smaller skill is
    // ready, hold the small one so it chains right after the big one lands —
    // rather than spending it now and having nothing to follow up with. It does
    // NOT bank basic attacks (no other skill ready → returns null → attack
    // normally), so a lull only costs a skill, not all tempo. Stateless: reads
    // skillCooldowns (cooldown-lookahead) — no per-unit combo memory (item 7).
    action: (self, _state, rank) => {
      const attacks = self.skills.filter((s) => s.type === 'attack')
      if (attacks.length < 2) return null   // nothing to chain
      let biggest = attacks[0]
      for (const s of attacks) if (skillDamageEstimate(self, s) > skillDamageEstimate(self, biggest)) biggest = s
      const window = 2 + (rank - 1)
      // The chain only ever happens in the rounds where the heavy hitter is on
      // cooldown but *outside* the bank window. With cooldowns ticking before turns
      // that range is non-empty only when its cooldown ≥ window + 2 — on a faster
      // recharge we'd bank the filler every ready round and never chain (strictly
      // worse than not equipping Burst), so don't bank at all.
      if (biggest.cooldown <= window + 1) return null
      const cd = self.skillCooldowns[biggest.id] ?? 0
      if (cd <= 0) return null               // heavy hitter ready → let it fire (front-load)
      if (cd > window) return null            // not imminent (just cast / far off) → attack normally, small skills chain freely
      const otherReady = attacks.some((s) => s.id !== biggest.id && (self.skillCooldowns[s.id] ?? 0) <= 0)
      return otherReady ? { skipAttack: true } : null   // hold the small skill for the chain
    },
  },

  // Reaction -------------------------------------------------------------------
  // (Last Stand moved to a skill — only skills modify stats. Equipping the skill
  // grants its own gated cast tactic via makeSkillTactic; see canLastStand.)
  'counterattacker': {
    id: 'counterattacker', name: 'Counterattacker', scope: 'unit', channel: 'reaction', cooldown: 3,
    description: 'Strike back the moment you are hit.',
    reaction: (self, state) => {
      const attacker = self.lastHitById ? state.combatants.find((c) => c.id === self.lastHitById) : null
      return attacker && attacker.alive ? { counterAttack: attacker.id } : null
    },
  },

  // Passive (effects read by damage/targeting via the helpers below) -----------
  // Armored / Nimble / Threatening Presence used to live here; they're now
  // skill-granted passives (Toughness / Evasion / Defensive Stance) that set
  // combatant fields via the adapter — see armoredFactor/nimblePeriod and the
  // §threat model. Removing them here drops them from the player's tactic picker.
  'exploit-weakness': {
    // Passive marker (no fn): the engine reads it in reorderAttacksForTarget to
    // drop the attack-switch hysteresis. Every unit already prefers the harder-
    // hitting attack vs its target by a conservative margin; this makes the unit
    // always pick the absolute best — chasing every elemental weakness and soft
    // defense, even small edges. Rank ≥2 = zero margin; rank 1 keeps a tiny guard.
    id: 'exploit-weakness', name: 'Exploit Weakness', scope: 'unit', channel: 'passive',
    description: 'Always strike with the attack that hits the current target hardest — exploiting elemental weaknesses and soft defenses, not just the biggest nuke. Higher rank reacts to even slim advantages.',
  },

  // Party ----------------------------------------------------------------------
  'finish-them': {
    id: 'finish-them', name: 'Finish Them', scope: 'party', channel: 'targeting',
    description: 'The team piles onto the badly wounded focus.',
    // Same shared focus as Opportunist, with a harsher "nearly dead" gate — the
    // whole party converges on the one foe closest to dying.
    targeting: (self, state) => {
      const focus = teamFocus(self, state)
      return focus && hpRatio(focus) < 0.25 ? focus.id : null
    },
  },
  'focus-fire': {
    id: 'focus-fire', name: 'Focus Fire', scope: 'party', channel: 'targeting', kind: 'floor',
    description: 'The whole team concentrates fire on one shared target.',
    // The blackboard's first party-scope consumer: lock the planner's focus
    // (lowest-HP visible enemy) unconditionally — no HP gate, so the team
    // coordinates from full HP. A floor (fires whenever a focus exists), and a
    // party-default, so it sits at the bottom and only steers units that haven't
    // locked something more specific.
    targeting: (self, state) => teamFocus(self, state)?.id ?? null,
  },

  // Monster dispositions (§aggression) -----------------------------------------
  // These shape how a monster engages. They're `monsterOnly` (hidden from the
  // player's tactic picker) but otherwise ordinary tactics. skittish / pack-tactics
  // / pack-hunter are passive *markers* — they carry no fn; the engine reads them
  // directly (evalTargeting's provoked gate, rallyPack, executeWander). flee is a
  // real movement tactic.
  'skittish': {
    id: 'skittish', name: 'Skittish', scope: 'unit', channel: 'passive', monsterOnly: true,
    description: 'Non-aggressive: ignores heroes (just wanders/holds) until it takes a hit or a packmate calls it — then it fights back.',
  },
  'pack-tactics': {
    id: 'pack-tactics', name: 'Pack Tactics', scope: 'unit', channel: 'passive', monsterOnly: true,
    description: 'Once roused, screams for kin: same-named allies in sight turn aggressive on its target. A herd aggros together; a cornered one calls for help.',
  },
  'pack-hunter': {
    id: 'pack-hunter', name: 'Pack Hunter', scope: 'unit', channel: 'passive', monsterOnly: true,
    description: 'Roams as a group toward the pack’s shared waypoint (like the hero party) instead of lurking alone — so the pack travels, and converges, together.',
  },
  'flee': {
    id: 'flee', name: 'Flee', scope: 'unit', channel: 'movement', monsterOnly: true,
    description: 'Badly wounded: break off and run for its own edge (and toward the pack), still calling for help. Rank raises the bail-out HP.',
    movement: (self, _state, rank) => {
      const threshold = 0.3 + 0.05 * (rank - 1)
      return hpRatio(self) < threshold ? { awayFromNearestEnemy: true, rows: 3 } : null
    },
  },
}

// ── resolution & passive readers ────────────────────────────────────────────--

export function resolveTactics(unit: TacticRef[] = [], party: TacticRef[] = []): ResolvedTactic[] {
  const toResolved = (refs: TacticRef[]) =>
    refs.map((r) => ({ def: TACTIC_REGISTRY[r.id], rank: r.rank })).filter((t): t is ResolvedTactic => !!t.def)
  const unitT = toResolved(unit)
  const partyT = toResolved(party)
  const top = partyT.filter((t) => t.def.override)        // §5.5 override → top
  const bottom = partyT.filter((t) => !t.def.override)    // default → bottom (lowest priority)
  return demoteFloors([...top, ...unitT, ...bottom])
}

// 'floor' tactics fire whenever a basic precondition holds, so they'd starve any
// trigger sitting below them in the same channel. Stable-sort floors to the
// bottom of *their own* channel (triggers keep their relative order, floors keep
// theirs), leaving each channel's slot positions — and the cross-channel
// interleave — otherwise untouched. Channels are evaluated independently, so this
// only ever changes who-beats-whom within a channel.
function demoteFloors(tactics: ResolvedTactic[]): ResolvedTactic[] {
  const reordered = new Map<string, ResolvedTactic[]>()
  for (const t of tactics) (reordered.get(t.def.channel) ?? reordered.set(t.def.channel, []).get(t.def.channel)!).push(t)
  for (const [ch, arr] of reordered) {
    reordered.set(ch, [
      ...arr.filter((t) => t.def.kind !== 'floor'),
      ...arr.filter((t) => t.def.kind === 'floor'),
    ])
  }
  const cursor = new Map<string, number>()
  return tactics.map((t) => {
    const ch = t.def.channel
    const i = cursor.get(ch) ?? 0
    cursor.set(ch, i + 1)
    return reordered.get(ch)![i]
  })
}

export function getTactic(c: Combatant, id: string): ResolvedTactic | undefined {
  return c.tactics.find((t) => t.def.id === id)
}
export function hasTactic(c: Combatant, id: string): boolean {
  return c.tactics.some((t) => t.def.id === id)
}

// Armored (skill-granted passive, was a tactic): incoming-damage multiplier from
// the combatant's `armorReduction` fraction (1 = no reduction, capped at 0.5).
export function armoredFactor(c: Combatant): number {
  return c.armorReduction ? 1 - Math.min(0.5, c.armorReduction) : 1
}
// Nimble (skill-granted passive, was a tactic): dodge every Nth incoming attack
// from the combatant's `dodgePeriod` (null = never dodge).
export function nimblePeriod(c: Combatant): number | null {
  return c.dodgePeriod ?? null
}
