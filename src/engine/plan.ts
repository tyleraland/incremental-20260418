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

import { attackReach } from './grid'
import { EPS } from './constants'
import { estimateDamageVs } from './damage'
import { isCaster, castRange } from './spatial'
import { isChanneledAoe } from './skills'
import type { Combatant, EngineSkill } from './types'

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
