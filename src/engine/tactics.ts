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
import { SEPARATION, EPS } from './constants'
import { effectiveStat, skillDamageEstimate } from './damage'
import {
  lockedTarget, nearestEnemyTo, isCaster, visibleEnemiesOf,
  squishiestAlly, flankPoint, guardPoint, kiteDistanceFor,
} from './spatial'
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

// §dodge: danger circles threatening `self` right now — ground hazards already
// down that hit its team, plus enemies mid-channel of an area spell (the
// telegraphed blast centre + radius). A ground-zone spell locks its point at
// cast start (`channel.targetPoint`), so you can step off the marked ground;
// other aimed AoEs centre on the targeted unit's current spot.
type Circle = { x: number; y: number; r: number }
const FIREWALL_AVOID_R = 0.5   // keep this far off an enemy firewall (plus the dodge margin)
function aoeThreatsAt(self: Combatant, state: BattleState): Circle[] {
  const out: Circle[] = []
  for (const z of state.zones) if (z.team === self.team) out.push({ x: z.pos.x, y: z.pos.y, r: z.radius })
  for (const e of visibleEnemiesOf(state, self)) {
    const ch = e.channel
    if (!ch) continue
    const sk = e.skills.find((s) => s.id === ch.skillId)
    if (!sk || sk.aoeRadius <= 0 || (sk.targeting !== 'aoe_enemy' && sk.targeting !== 'aoe_point')) continue
    const center = ch.targetPoint ?? state.combatants.find((c) => c.id === ch.targetId)?.pos
    if (center) out.push({ x: center.x, y: center.y, r: sk.aoeRadius })
  }
  // §firewall: avoid an enemy wall that would bounce + burn us. Model it as a
  // small circle on the point of the wall nearest us, so the escape steers us
  // straight off it (we never path through a flame we haven't broken).
  for (const w of state.firewalls) {
    if (w.blockTeam !== self.team || (w.bumps[self.id] ?? 0) >= w.maxBumps) continue
    const tx = -w.normal.y, ty = w.normal.x   // wall tangent
    const proj = Math.max(-w.half, Math.min(w.half, (self.pos.x - w.pos.x) * tx + (self.pos.y - w.pos.y) * ty))
    out.push({ x: w.pos.x + tx * proj, y: w.pos.y + ty * proj, r: FIREWALL_AVOID_R })
  }
  return out
}
// Fallback bail-out direction when we're standing right on a blast centre: away
// from the nearest foe, else toward our own edge.
function awayFromEnemies(self: Combatant, state: BattleState): { x: number; y: number } {
  const e = nearestEnemyTo(self, state)
  if (e) {
    const dx = self.pos.x - e.pos.x, dy = self.pos.y - e.pos.y
    const d = Math.hypot(dx, dy)
    if (d > EPS) return { x: dx / d, y: dy / d }
  }
  return { x: 0, y: self.team === 'player' ? -1 : 1 }
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

function status(id: string, name: string, source: string, duration: number, mods: StatusEffect['statModifiers'], flags: string[] = []): StatusEffect {
  return { id, name, source, duration, statModifiers: mods, flags }
}

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
    id: 'charger', name: 'Charger', scope: 'unit', channel: 'movement',
    description: 'Sprint toward the target; the first hit lands harder.',
    // No movement fn of its own: Charger is a *modifier* — its speed-up is folded
    // into whatever movement plan wins (see chargerSpeedMult + evalMovement), and
    // its first-hit damage bonus is read via chargerBonus. Producing its own plan
    // used to short-circuit the movement channel and starve flanker/kiter/guardian.
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
  'dodge-aoe': {
    id: 'dodge-aoe', name: 'Dodge AoE', scope: 'unit', channel: 'movement',
    description: 'Get out of incoming area spells: when a foe is channeling an AoE — or a hazard (storm, slow puddle, enemy firewall) is already in your way — step clear of it, routing around terrain on the way out. Put it high so survival beats positioning.',
    movement: (self, state, rank) => {
      if (self.statuses.some((s) => s.flags.includes('rooted'))) return null   // can't move anyway
      // Keep a cushion *wider than one move step* outside the blast: a unit with
      // no other movement tactic drifts back toward the foe between dodges, and a
      // narrow margin would let that drift dip into the edge for a tick. With the
      // cushion, dodge re-triggers and shoves it back out before that happens.
      const margin = 1.3 + 0.4 * (rank - 1)
      // The deepest ring we're inside (most urgent) — escape that one first.
      let worst: Circle | null = null
      let worstSlack = 0
      for (const t of aoeThreatsAt(self, state)) {
        const slack = Math.hypot(self.pos.x - t.x, self.pos.y - t.y) - (t.r + margin)
        if (slack < 0 && (worst === null || slack < worstSlack)) { worst = t; worstSlack = slack }
      }
      if (!worst) return null
      // Shortest exit: straight out from the blast centre to just past the cushion.
      let ox = self.pos.x - worst.x, oy = self.pos.y - worst.y
      const od = Math.hypot(ox, oy)
      if (od > EPS) { ox /= od; oy /= od }
      else { const a = awayFromEnemies(self, state); ox = a.x; oy = a.y }   // standing on the centre
      const out = worst.r + margin + 0.5
      return { toPoint: { x: worst.x + ox * out, y: worst.y + oy * out }, speedMult: 1.15 }
    },
  },
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
  'shield-wall': {
    id: 'shield-wall', name: 'Shield Wall', scope: 'unit', channel: 'action', cooldown: 6,
    description: 'Turtle up with a big defense buff when surrounded.',
    action: (self, state, rank) => {
      const near = enemiesOf(state, self).filter((e) => distance(self.pos, e.pos) <= 3).length
      if (near < 3) return null
      const def = 15 + 5 * (rank - 1)
      return { skipAttack: true, applyStatusToSelf: status('shield-wall', 'Shield Wall', self.id, 3, { def }, ['shielded']) }
    },
  },

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
  'last-stand': {
    id: 'last-stand', name: 'Last Stand', scope: 'unit', channel: 'reaction', oncePerCombat: true,
    description: 'Surge with power when near death.',
    reaction: (self, _state, rank) => {
      if (hpRatio(self) >= 0.2) return null
      const strBonus = Math.round(self.str * (0.5 + 0.1 * (rank - 1)))
      const spdBonus = Math.round(self.spd * 0.3)
      return { applyStatusToSelf: status('last-stand', 'Last Stand', self.id, 3, { str: strBonus, spd: spdBonus }) }
    },
  },
  'counterattacker': {
    id: 'counterattacker', name: 'Counterattacker', scope: 'unit', channel: 'reaction', cooldown: 3,
    description: 'Strike back the moment you are hit.',
    reaction: (self, state) => {
      const attacker = self.lastHitById ? state.combatants.find((c) => c.id === self.lastHitById) : null
      return attacker && attacker.alive ? { counterAttack: attacker.id } : null
    },
  },

  // Passive (effects read by damage/targeting via the helpers below) -----------
  'armored': {
    id: 'armored', name: 'Armored', scope: 'unit', channel: 'passive',
    description: 'Take less physical damage.',
  },
  'nimble': {
    id: 'nimble', name: 'Nimble', scope: 'unit', channel: 'passive',
    description: 'Periodically dodge an incoming attack.',
  },
  'threatening-presence': {
    id: 'threatening-presence', name: 'Threatening Presence', scope: 'unit', channel: 'passive',
    description: 'Enemies are drawn to attack you.',
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

// Charger first-hit bonus multiplier (0 if not equipped / already used).
export function chargerBonus(c: Combatant): number {
  const t = getTactic(c, 'charger')
  return t ? 0.3 + 0.1 * (t.rank - 1) : 0
}
// Charger movement-speed multiplier — folded into whichever movement plan wins
// (1 = not equipped). Charger has no plan of its own; this is the modifier half.
export function chargerSpeedMult(c: Combatant): number {
  return hasTactic(c, 'charger') ? 1.5 : 1
}
// Armored: outgoing→incoming multiplier (1 = no reduction).
export function armoredFactor(c: Combatant): number {
  const t = getTactic(c, 'armored')
  return t ? 1 - Math.min(0.5, 0.1 + 0.02 * (t.rank - 1)) : 1
}
// Nimble: dodge every Nth incoming attack (null = no Nimble).
export function nimblePeriod(c: Combatant): number | null {
  const t = getTactic(c, 'nimble')
  return t ? (t.rank >= 5 ? 5 : 7) : null
}
// Threatening Presence: virtual distance reduction so enemies prefer this unit.
export function tauntBiasOf(c: Combatant): number {
  const t = getTactic(c, 'threatening-presence')
  return t ? 1.5 + 0.5 * (t.rank - 1) : 0
}
