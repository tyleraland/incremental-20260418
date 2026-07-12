// Combat Tactic Engine — damage & healing (spec §8).
// No randomness anywhere (invariant §16.1); all variation is modulo arithmetic
// seeded by round number and attacker index.

import type { Combatant, EngineSkill, IntelMask, StatModifiers } from './types'
import { elementMultiplier, type Element } from './elements'

// ── §intel: the knowledge choke point (tactical-coordination.md §3.7) ─────────
// `knownView(c)` is THE one wrapper through which estimation reads a combatant
// the estimator may not fully know. It returns `c` itself when there is nothing
// to mask (intel absent = fully known — the legacy/omniscient fast path, and
// what guarantees a fully-revealed codex scores byte-identical to omniscience),
// else a prototype-delegating view of `c` whose UNREVEALED fields are shadowed
// by priors:
//   armor  unrevealed → armorElement 'neutral'
//   dodge  unrevealed → dodgePeriod null (never dodges)
//   kit    unrevealed → skills [] (a bare basic attacker)
// Everything else (stats, statuses, cooldowns, hp, reach) reads live through
// the prototype chain, so the view is built ONCE per (combatant, intel) pair —
// cheap field-fallback, not a copy per call — and can never go stale. The cache
// keys on the intel object's identity: setCombatantIntel installs a fresh
// object, which self-invalidates the cached view. Pure and deterministic (a
// cache hit returns exactly what a recompute would), so replays stay
// byte-identical. Damage RESOLUTION never comes through here.
const KNOWN_VIEW_CACHE = new WeakMap<Combatant, { intel: IntelMask; view: Combatant }>()
export function knownView(c: Combatant): Combatant {
  const intel = c.intel
  if (!intel) return c                                     // absent ⇒ fully known
  if (intel.armor && intel.dodge && intel.kit) return c    // fully revealed ⇒ the real thing
  const hit = KNOWN_VIEW_CACHE.get(c)
  if (hit && hit.intel === intel) return hit.view
  const priors: PropertyDescriptorMap = {}
  if (!intel.armor) priors.armorElement = { value: 'neutral' }
  if (!intel.dodge) priors.dodgePeriod = { value: null }
  if (!intel.kit) priors.skills = { value: [] }
  const view = Object.create(c, priors) as Combatant
  KNOWN_VIEW_CACHE.set(c, { intel, view })
  return view
}

// Stats the formula grammar understands (str/def/int/spd). `magicDef` is a real
// stat too but never appears in a damage formula — it's read directly for spell
// mitigation — so it's effectiveStat-able but not part of the grammar.
const STAT_KEYS = ['str', 'def', 'int', 'spd'] as const
type StatKey = (typeof STAT_KEYS)[number] | 'magicDef'

// Effective stat = base + sum of active status modifiers (§7).
export function effectiveStat(c: Combatant, stat: StatKey): number {
  let v = c[stat]
  for (const s of c.statuses) {
    const mod = s.statModifiers[stat as keyof StatModifiers]
    if (mod) v += mod
  }
  return v
}

// Deterministic offset in [-2, +2] (§8.1).
export function variation(round: number, attackerIndex: number): number {
  return ((round * 7 + attackerIndex * 13) % 5) - 2
}

// Tiny safe evaluator for the spec's formula grammar: a product of terms, where
// each term is a stat name (str/def/int/spd) or a numeric literal.
// Examples: "str * 1.5", "int * 2.0", "str". No eval(), no operators but `*`.
export function evalFormula(formula: string, c: Combatant): number {
  let product = 1
  for (const rawTerm of formula.split('*')) {
    const term = rawTerm.trim()
    if (!term) continue
    if ((STAT_KEYS as readonly string[]).includes(term)) {
      product *= effectiveStat(c, term as StatKey)
    } else {
      const n = Number(term)
      product *= Number.isFinite(n) ? n : 0
    }
  }
  return product
}

// Default damage. Physical unless the formula scales on INT, in which case it's
// treated as magic (§8.1/§8.2). Basic attack (skill === null) is "str * 1".
export function defaultCalculateDamage(
  attacker: Combatant,
  defender: Combatant,
  skill: EngineSkill | null,
  round: number,
): number {
  const formula = skill ? skill.damageFormula : 'str * 1'
  // INT-scaling ⇒ a spell (mitigated by magic defense); otherwise physical (a
  // basic attack or STR-scaling skill, mitigated by physical defense). §8.1/§8.2.
  const isMagic = /\bint\b/.test(formula)
  const raw = evalFormula(formula, attacker)
  const mitigation = isMagic
    ? effectiveStat(defender, 'magicDef') * 0.5
    : effectiveStat(defender, 'def') * 0.5
  return Math.max(1, Math.floor(raw - mitigation + variation(round, attacker.index)))
}

// Healing has no variation — it's predictable (§8.3).
export function calculateHeal(caster: Combatant, skill: EngineSkill): number {
  return Math.floor(evalFormula(skill.healFormula, caster))
}

// Target-independent damage estimate for an attack skill (raw formula on the
// caster's current stats, before the defender's mitigation/variation). Used to
// order the action channel "biggest ready nuke first" (§action policy) and by
// burst tactics to pick a cast. Non-attack skills score 0.
export function skillDamageEstimate(caster: Combatant, skill: EngineSkill): number {
  return skill.type === 'attack' ? evalFormula(skill.damageFormula, caster) : 0
}

// Effective armor element: a status may override it (Frozen → water), else base.
export function effectiveArmor(target: Combatant): Element {
  const ov = target.statuses.find((s) => s.armorOverride)
  return ov?.armorOverride ?? target.armorElement
}

// Target-AWARE effective-damage estimate (§action policy): what `skill`
// (null ⇒ basic attack) would land on `target` right now, after the right
// mitigation (magic vs physical, mirroring defaultCalculateDamage) and the
// element matrix (skill element, else the caster's attack element, vs the
// target's effective armor). This is the single hook the AI scores its
// offensive options through — a mage compares Fire Bolt vs Frost Bolt against
// *this* enemy and leads with whichever exploits its weakness/soft defense.
//
// It deliberately omits the ±2 round variation and the armored/vulnerable
// multipliers: those are the same constant for every candidate skill against a
// given target on a given round, so they can't change which option is best.
// Stealth bonus is likewise left out of the ranking (a minor edge); the real
// hit still applies all of them in dealAttack. Non-attack skills score 0;
// future scorers (AoE spread value, sideboard weapon swaps, status synergy)
// extend this one function. See BACKLOG.md.
//
// §throughput: the result is per-cast effective damage **amortized over the cast
// cycle** (channel rounds + cooldown). Without this a slow, big-channel nuke
// (Lightning Bolt: int×1.6, 3-round channel) out-scores a faster instant that
// actually exploits the target's weakness (Frost Bolt: int×1.0 ×1.5 vs fire,
// instant) — even though the instant lands sooner and can't be interrupted.
// Dividing by the cycle keeps element exploitation intact (a big elemental gap
// still wins) while breaking near-ties toward the faster spell. Basic attack
// (skill null) has no channel/cooldown ⇒ cost 1.
// §intel: the target is read through knownView — an unrevealed armor element
// prices as neutral, so the first fight against a new species genuinely
// misjudges its matchups (and sharpens as the store's codex fills). Absent
// intel ⇒ knownView returns the target itself: omniscient, the shipped math.
export function estimateDamageVs(caster: Combatant, target: Combatant, skill: EngineSkill | null): number {
  if (skill && skill.type !== 'attack') return 0
  const known = knownView(target)
  const formula = skill ? skill.damageFormula : 'str * 1'
  const isMagic = /\bint\b/.test(formula)
  const raw = evalFormula(formula, caster)
  const mitigation = isMagic ? effectiveStat(known, 'magicDef') * 0.5 : effectiveStat(known, 'def') * 0.5
  const element = skill?.element ?? caster.attackElement
  const eff = Math.max(0, raw - mitigation) * elementMultiplier(element, effectiveArmor(known))
  const cycle = skill ? Math.max(1, skill.channelTime + skill.cooldown) : 1
  return eff / cycle
}
