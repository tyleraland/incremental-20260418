// Combat Tactic Engine — the movement↔action seam (movement-action-coupling.md
// §3.1, milestone M1). The movement layer's question is "what will I actually
// use, and from how far?" — answered here with the SAME scorer the action
// channel ranks its attacks with (estimateDamageVs), instead of the raw
// longest-range proxy (castRange) that parked units at the range of a skill
// they'd never cast.
//
// Pure and deterministic like every engine leaf: no RNG, no store imports,
// inputs never mutated. Lives above spatial/skills/damage in the import graph;
// nothing below imports it (spatial's kiteDistanceFor takes the anchor as a
// plain number so this module stays cycle-free).

import { attackReach, distance } from './grid'
import { EPS } from './constants'
import { estimateDamageVs } from './damage'
import { isCaster, castRange, visibleEnemiesOf } from './spatial'
import { isChanneledAoe } from './skills'
import { sightlineClear } from './barriers'
import type { BattleState, Combatant, EngineSkill, Vec2 } from './types'

// The offensive option `self` would prefer against `target`, ignoring current
// distance and line of sight — it is choosing WHERE to stand, so reach is the
// output, not a filter. Scored by estimateDamageVs (element matrix, magic vs
// physical mitigation, cast-cycle amortization), which is what keeps a one-off
// cooldown nuke from anchoring the hold its basic attack actually sustains.
//
// Filters mirror the proxies this replaces, so the change is only the ranking:
//   • cooldowns like castRange/maxSkillRange — casters count every attack skill
//     (they're positioning for the next cast), non-casters only ready ones;
//   • channeled AoE stays excluded (its cluster/safety gate means it can't
//     anchor a hold — the old "don't park at Lightning Storm range" rule);
//   • the basic attack competes for non-casters; casters never throw it
//     (chooseAction skips it), so it can't anchor them either.
// Returns null when nothing scores (no attack options, or the target is
// immune to all of them) — callers fall back to the utility standoff.
export interface PreferredAttack {
  skill: EngineSkill | null   // null = the basic attack
  range: number               // the range that option is used from
  score: number               // estimateDamageVs — amortized effective damage
}
export function preferredAttackVs(self: Combatant, target: Combatant): PreferredAttack | null {
  const includeAll = isCaster(self)
  let best: PreferredAttack | null = null
  const consider = (skill: EngineSkill | null, range: number) => {
    const score = estimateDamageVs(self, target, skill)
    if (score <= 0) return
    // Ties (two equal bolts) prefer the longer reach — stand as far as the
    // equally-good option allows.
    if (!best || score > best.score + EPS || (Math.abs(score - best.score) <= EPS && range > best.range)) {
      best = { skill, range, score }
    }
  }
  for (const s of self.skills) {
    if (s.type !== 'attack' || isChanneledAoe(s)) continue
    if (!includeAll && (self.skillCooldowns[s.id] ?? 0) > 0) continue
    consider(s, s.range)
  }
  if (!isCaster(self)) consider(null, attackReach(self))
  return best
}

// The range `self` should hold to fight `target`: its preferred attack's
// range, else (nothing scores — pure healer/debuffer, or a target immune to
// the whole kit) the old castRange standoff so support units keep their
// utility reach. This is the anchor the kiter, Wary Caster, and the caster
// default hold feed into kiteDistanceFor / moveToward.
export function preferredRangeVs(self: Combatant, target: Combatant): number {
  return preferredAttackVs(self, target)?.range ?? castRange(self)
}

// ── Exposure (movement-action-coupling.md §3.3, milestone M3) ────────────────

// How much punishment per round does standing at `p` invite? Sum over the
// enemies `self` can currently perceive (fog-honest — vision from its REAL
// position) that are provoked (in the fight; a milling skittish monster
// threatens nobody) and whose reach covers `p`: each contributes its own
// preferred attack against us (same scorer, other direction). Ranged/caster
// threats additionally need a wall-free sightline to `p` (cliffs don't stop
// shots). Threats are priced where they STAND — a stationary ranged ring is a
// crisp disc; pursuit is deliberately not priced (see the doc's horizon note).
export function exposureAt(state: BattleState, self: Combatant, p: Vec2): number {
  let total = 0
  for (const e of visibleEnemiesOf(state, self)) {
    if (!e.provoked) continue
    const reach = Math.max(attackReach(e), castRange(e))
    if (distance(p, e.pos) > reach + EPS) continue
    const shoots = e.rangedRange > 0 || isCaster(e)
    if (shoots && !sightlineClear(e.pos, p, state.barriers)) continue
    // Floor at 1: a landed hit always deals ≥1 (defaultCalculateDamage), so an
    // in-reach threat is never free even when mitigation eats its whole formula.
    total += Math.max(1, preferredAttackVs(e, self)?.score ?? 0)
  }
  return total
}

// Expected HP cost of WALKING the straight corridor from `self.pos` to `dest`
// at `stepLen` per round — per-round exposure sampled once per travel step and
// summed. This prices the PLOW line (the worst-case corridor): tangential
// avoidance already handles affordable detours, so the price only has to gate
// the plow-vs-clear-first decision. Samples are capped and scaled back to
// rounds so a cross-map march can't run away with the turn budget.
const CORRIDOR_MAX_SAMPLES = 40
export function corridorExposure(state: BattleState, self: Combatant, dest: Vec2, stepLen: number): number {
  const d = distance(self.pos, dest)
  if (d <= EPS) return 0
  const rounds = d / Math.max(stepLen, EPS)
  const samples = Math.min(CORRIDOR_MAX_SAMPLES, Math.max(1, Math.ceil(rounds)))
  const roundsPerSample = rounds / samples
  let sum = 0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const p = { x: self.pos.x + (dest.x - self.pos.x) * t, y: self.pos.y + (dest.y - self.pos.y) * t }
    sum += exposureAt(state, self, p) * roundsPerSample
  }
  return sum
}
