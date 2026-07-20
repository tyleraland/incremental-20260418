// Combat Tactic Engine — spatial queries for movement tactics (§spatial).
//
// Everything here is expressed *relative* to units and the formation (centroids,
// directions, nearest), never in absolute coordinates — so the same tactics work
// unchanged if the grid grows; a bigger board just means longer approaches.
//
// Kept dependency-light (grid + types only, no behaviour/tactics) to avoid an
// import cycle: tactics.ts → spatial.ts.

import { distance, moveSpeedOf, attackReach } from './grid'
import { spatialHashFor, SPATIAL_MARGIN } from './spatialhash'
import { EPS } from './constants'
import type { BattleState, Combatant, EngineSkill, MovementResult, Vec2 } from './types'

const isHidden = (c: Combatant) => c.statuses.some((s) => s.flags.includes('stealthed'))

export function alliesOf(state: BattleState, self: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team === self.team && c.id !== self.id)
}
// THE canonical "enemies this unit can perceive and act on": alive, on the other
// team, not stealthed (§3), and within sight (§open-world fog-of-war). This is
// the ONE predicate all targeting/movement uses — default targeting
// (selectTarget), every targeting tactic, and the spatial movement tactics
// (Guardian, Kiter) — so the fog-of-war gate lives in exactly one place and can't
// drift between them (it did: tactics once scanned the whole map and locked foes
// 40 cells out of sight, freezing the party). visionRange is Infinity in
// encounters, so this is a no-op there. Lives in this leaf module so behaviour.ts
// and tactics.ts can both share it without an import cycle.
//
// NOT to be confused with livingEnemies (behaviour.ts) — that one is deliberately
// UNFILTERED (everyone alive on the other team) for the physical questions: AoE
// splash hits whoever's in the blast, the win-check counts all survivors. Don't
// add a vision/stealth filter there.
// ---- Per-turn vision cache (pure perf, byte-identical) ---------------------
// visibleEnemiesOf is the engine's hottest read: every targeting/movement/skill
// tactic re-asks "what can I see?", so it runs 3–5× per unit per turn with
// identical inputs. We memoize the scan per combatant, keyed on a generation
// counter (`bumpVisionGen` at the top of every takeTurn) AND the querier's *live*
// position.
//
// Replay stays 1:1 because within a single takeTurn only `self` moves: the fresh
// gen drops every cross-turn entry, and the position key forces a re-scan the
// instant `self` steps (its enemy set changed) while repeated same-spot asks reuse
// one scan. Other units queried mid-turn — Guardian/Wary-Caster reading a
// *same-team* ally's nearest threat — stay valid: self isn't that ally's enemy, so
// self moving can't change the ally's visible set. (Querying an *enemy's* vision
// mid-turn would violate the invariant; nothing does.) Callers treat the result as
// read-only (they `.filter()`/iterate, never sort/splice it in place).
//
// Caching is GATED on the spatial-hash ambient being active for *this* combatants
// array (`spatialHashFor`) — the same "are we inside a live round?" signal the hash
// itself uses. That's the only place the two invariants hold (gen bumped per turn,
// stable combatants array); direct helper calls in tests have no active hash, so
// they bypass the cache and scan fresh (distinct per-call states never collide).
// The map is cleared each round in advanceRound so it can't grow across battles.
let visionGen = 0
const visionCache = new Map<string, { gen: number; x: number; y: number; result: Combatant[] }>()
export function bumpVisionGen(): void { visionGen++ }
export function clearVisionCache(): void { visionCache.clear() }

export function visibleEnemiesOf(state: BattleState, self: Combatant): Combatant[] {
  const hash = spatialHashFor(state.combatants)   // non-null ⇒ inside a live round for this state
  if (hash) {
    const hit = visionCache.get(self.id)
    if (hit && hit.gen === visionGen && hit.x === self.pos.x && hit.y === self.pos.y) return hit.result
  }
  const r = self.visionRange
  // Finite vision (open-world fog): query the spatial hash for nearby buckets and
  // re-filter by live distance — same set/order as the scan, but O(local). ∞ vision
  // (encounters) scans the whole roster (small N) — and so does the fallback when no
  // hash is active (tests, between-round spawns). All three are byte-identical.
  const grid = r === Infinity ? null : hash
  const pool = grid ? grid.near(self.pos, r + SPATIAL_MARGIN) : state.combatants
  const result = pool.filter((c) => c.alive && c.team !== self.team && c.team !== 'neutral' && !isHidden(c) && distance(self.pos, c.pos) <= r)
  if (hash) visionCache.set(self.id, { gen: visionGen, x: self.pos.x, y: self.pos.y, result })
  return result
}
export function lockedTarget(self: Combatant, state: BattleState): Combatant | null {
  if (!self.lockedTargetId) return null
  return state.combatants.find((c) => c.id === self.lockedTargetId && c.alive) ?? null
}

export function centroid(units: Combatant[]): Vec2 | null {
  if (units.length === 0) return null
  let x = 0, y = 0
  for (const u of units) { x += u.pos.x; y += u.pos.y }
  return { x: x / units.length, y: y / units.length }
}

// Nearest unit to a point, deterministic id tiebreak.
export function nearestTo(pos: Vec2, units: Combatant[]): Combatant | null {
  let best: Combatant | null = null
  let bd = Infinity
  for (const u of units) {
    const d = distance(pos, u.pos)
    if (d < bd - EPS || (Math.abs(d - bd) <= EPS && best !== null && u.id < best.id)) { best = u; bd = d }
  }
  return best
}
export function nearestEnemyTo(unit: Combatant, state: BattleState): Combatant | null {
  return nearestTo(unit.pos, visibleEnemiesOf(state, unit))
}

// Nearest visible enemy that is actually *hostile* — provoked (in combat). A
// skittish monster still milling about (provoked === false) isn't chasing
// anyone, so a kiter shouldn't back away from it. Returns null when no visible
// enemy is provoked yet (the caster should just close to cast range and open
// fire, which is what provokes them).
export function nearestProvokedEnemyTo(unit: Combatant, state: BattleState): Combatant | null {
  return nearestTo(unit.pos, visibleEnemiesOf(state, unit).filter((e) => e.provoked))
}

// The unit worth protecting: the squishiest living ally (lowest defense), id tiebreak.
export function squishiestAlly(self: Combatant, state: BattleState): Combatant | null {
  let best: Combatant | null = null
  for (const a of alliesOf(state, self)) {
    if (best === null || a.def < best.def || (a.def === best.def && a.id < best.id)) best = a
  }
  return best
}

// The farthest a unit can act from: the longest range among its skills (falls
// back to basic-attack reach). Casters use this to stand off at spell range —
// they always need positioning for the next cast since they have no basic
// ranged attack, so we count ALL skills regardless of cooldown. Non-casters
// (hybrid archers like the Ranger) only count READY skills so that once their
// skills are all on cooldown they close to basic attack range and fire the bow
// instead of idling at skill range with nothing to cast.
export function maxSkillRange(self: Combatant): number {
  let r = self.rangedRange
  const includeAll = isCaster(self)
  for (const s of self.skills) {
    if (!includeAll && (self.skillCooldowns[s.id] ?? 0) > 0) continue
    if (s.range > r) r = s.range
  }
  return r
}

// A spot just off `target` on the side *away from its allies* — i.e. the target's
// least-defended flank (the rear for a backliner). `offset` is how far past the
// target to stand (≈ attack reach so the move lands you in range).
export function flankPoint(self: Combatant, target: Combatant, state: BattleState, offset: number): Vec2 {
  const mates = state.combatants.filter((c) => c.alive && c.team === target.team && c.id !== target.id)
  const c = centroid(mates)
  let ux: number | undefined, uy = 0
  if (c) {
    const dx = target.pos.x - c.x, dy = target.pos.y - c.y
    const d = Math.hypot(dx, dy)
    if (d > EPS) { ux = dx / d; uy = dy / d }
  }
  if (ux === undefined) {
    // lone target: just approach from where we already are, stopping `offset` short
    const dx = target.pos.x - self.pos.x, dy = target.pos.y - self.pos.y
    const d = Math.hypot(dx, dy) || 1
    return { x: target.pos.x - (dx / d) * offset, y: target.pos.y - (dy / d) * offset }
  }
  return { x: target.pos.x + ux * offset, y: target.pos.y + uy * offset }
}

// A spot between `ally` and the `threat`, just in front of the ally — body-block.
export function guardPoint(ally: Combatant, threat: Combatant, gap: number): Vec2 {
  const dx = threat.pos.x - ally.pos.x, dy = threat.pos.y - ally.pos.y
  const d = Math.hypot(dx, dy) || 1
  return { x: ally.pos.x + (dx / d) * gap, y: ally.pos.y + (dy / d) * gap }
}

// §pull (tactical-coordination.md §3.3/§3.4, M2): the tag-and-drag two-phase
// movement shared by the Puller tactic (TACTIC_REGISTRY, evalMovement's
// tactic loop) AND executeMovement's default-path fallback (a capability-
// picked puller that never equipped the tactic) — ONE implementation so
// declared-intent and capability-picked pullers behave identically.
//   Phase 1 (not yet tagged): close on `target`, stopping just inside this
//     unit's own attack reach (mirrors Charger's dive-point geometry) so the
//     action channel can land the tagging hit on its own turn.
//   Phase 2 (tagged): walk `to` — everyone else's engage behavior handles the
//     dragged target arriving as it gives chase.
// The tag test reads live `threat`: `Combatant.threat` is threat OTHERS built
// AGAINST this unit, so `target.threat[self.id] > 0` means self has actually
// hit target — no new serialized state, derived fresh each call.
export function pullMovement(self: Combatant, target: Combatant | null, to: Vec2): MovementResult | null {
  if (!target || !target.alive) return null
  const tagged = (target.threat[self.id] ?? 0) > EPS
  if (tagged) return { toPoint: { x: to.x, y: to.y } }
  const dx = target.pos.x - self.pos.x, dy = target.pos.y - self.pos.y
  const d = Math.hypot(dx, dy)
  if (d <= EPS) return { toPoint: { x: target.pos.x, y: target.pos.y } }
  const stopD = Math.max(0, d - attackReach(self) * 0.9)
  return { toPoint: { x: self.pos.x + (dx / d) * stopD, y: self.pos.y + (dy / d) * stopD } }
}

// Unit vector from `self` toward the centroid of its living allies — used as
// a light "stay with the pack" bias in back-off movements (kite retreats,
// `awayFromNearestEnemy` retreats). Returns (0, 0) when already at the
// centroid or the unit is alone, so callers can blend it in unconditionally.
export function cohesionVec(self: Combatant, state: BattleState): Vec2 {
  const mates = state.combatants.filter((c) => c.alive && c.team === self.team && c.id !== self.id)
  const c = centroid(mates)
  if (!c) return { x: 0, y: 0 }
  const dx = c.x - self.pos.x, dy = c.y - self.pos.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return { x: 0, y: 0 }   // already with the pack — no nudge
  return { x: dx / d, y: dy / d }
}

// A "caster" is any combatant whose offence is spells, not a basic attack —
// they have at least one ready skill or are magic-statted with skills. Used
// by chooseAction (skip the basic-ranged fallback) and by kite math (need
// safe distance to finish a channeled cast). Applies to monsters too.
export function isCaster(c: Combatant): boolean {
  // A "caster" wants to operate from range: hang back, kite, and not throw weak
  // basic attacks. That only makes sense if it actually has a skill it uses *at
  // range against the enemy* — a melee kit, a pure self-cast like Consecration
  // (range 0), or an ally-only ranged skill (Heal, Bless) does NOT make a unit
  // hang back from a foe it's locked onto. So gate on "owns a ranged skill that
  // can hit an enemy"; without one the unit is a melee/bruiser even if its magic
  // stat is high (the Mutant Lizard: a self-aura caster that should stand and
  // bite, not kite — and a melee striker who *also* carries Heal: it still charges
  // in, then heals from up close, rather than standing off at heal range with no
  // way to touch the enemy).
  const isOffensiveRanged = (s: EngineSkill) =>
    s.targeting !== 'self' && s.targeting !== 'single_ally' && s.targeting !== 'aoe_ally' &&
    s.range > c.meleeRange + EPS
  const hasRangedSkill = c.skills.some(isOffensiveRanged)
  if (!hasRangedSkill) return false
  // A unit with a channel-time ranged spell is definitionally a caster.
  if (c.skills.some((s) => s.channelTime >= 1 && isOffensiveRanged(s))) return true
  // Otherwise: magic-leaning stats with a ranged skill (Theron, Sera). Mostly
  // catches instant-spell mages — they still don't want to throw weak basic shots.
  return c.int > c.str
}

// Distance to hold from `threat` while we expect to cast. Accounts for:
//   * our longest-channel spell (the threat closes at full speed while we're
//     rooted in the channel + the round the cast starts on),
//   * the threat's actual move speed (a fast chaser pushes the kite wider),
//   * the threat's melee reach + a safety buffer,
//   * our longest skill range (the cast still has to land).
// If `minSafe` exceeds our range, we keep the safe distance and just don't
// The range a unit can actually fire on a SINGLE target from — the longest range
// among its single-target `attack` skills (+ its basic ranged attack), respecting
// the caster/cooldown filter. A pure-AoE/debuff caster (no single-target poke)
// falls back to its longest skill range. This is the "stand here and you can shoot"
// distance: used to position a caster at cast range (default) and to anchor the
// kite hold. NOT a longer *gated* AoE range (a Lightning Storm won't fire on a lone
// foe, so anchoring on it strands the caster out of reach of its bolts).
export function castRange(self: Combatant): number {
  const includeAll = isCaster(self)
  let shootRange = self.rangedRange
  let hasAttack = self.rangedRange > self.meleeRange + EPS
  for (const s of self.skills) {
    if (s.type !== 'attack' || s.range <= self.meleeRange + EPS) continue
    if (!includeAll && (self.skillCooldowns[s.id] ?? 0) > 0) continue
    hasAttack = true
    if (s.range > shootRange) shootRange = s.range
  }
  return hasAttack ? shootRange : maxSkillRange(self)
}

// `maxRange` is the range the kite anchors on — the distance the unit wants to
// fight from. Defaults to castRange (longest single-target shot) so direct
// callers/tests keep the old anchor; the kiter/Wary Caster pass the plan
// layer's target-aware preferredRangeVs instead (movement-action-coupling.md
// M1) so the hold sits at the range of the attack they'll actually use.
export function kiteDistanceFor(self: Combatant, threat: Combatant, maxRange = castRange(self)): number {
  // Match maxSkillRange's filter: casters consider all skills (positioning for
  // next cast); non-casters only need cast room for skills currently ready.
  const includeAll = isCaster(self)
  const maxChannel = self.skills.reduce(
    (m, s) => (!includeAll && (self.skillCooldowns[s.id] ?? 0) > 0 ? m : Math.max(m, s.channelTime)),
    0,
  )
  // `channelTime + 1`: the threat moves once on the cast-start round AND once
  // per channeled-resolution round before the spell lands.
  const threatClose = moveSpeedOf(threat) * (maxChannel + 1)
  // Cap threat melee at a realistic polearm reach. Some tests use absurd
  // meleeRange values (30, 99) as a "doesn't matter, it's already in reach"
  // sentinel; we don't want those to push the caster to retreat off the map.
  const effectiveMelee = Math.min(threat.meleeRange, 3)
  const minSafe = effectiveMelee + threatClose + 0.5
  // Prefer just inside shooting range so the cast comfortably lands, but never
  // below minSafe.
  return Math.max(minSafe, maxRange - 0.5)
}
