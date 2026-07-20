// Combat Tactic Engine — status effect catalog (spec §7).
//
// Skills reference a status by id via `EngineSkill.statusApplied`; the engine
// builds a fresh StatusEffect from the spec when the skill resolves. Stat
// modifiers stack additively into `effectiveStat`; flags are read by the turn
// loop (e.g. 'stunned' skips a turn) and damage path.

import { scaleRounds } from './timescale'
import type { StatModifiers, StatusEffect, Element } from './types'

export interface StatusSpec {
  id: string
  name: string
  duration: number               // rounds; 'stunned' is consumed on the skipped turn instead
  statModifiers?: StatModifiers
  flags?: string[]
  dotDamage?: number             // damage to the bearer each round (poison etc.)
  element?: Element              // element of the DoT (runs through the matrix)
  damageTakenMult?: number       // element-agnostic incoming-damage multiplier
  armorOverride?: Element        // override effective armor element while active (§3 combos)
  removedByElement?: Element[]   // taking this element's damage clears the status
  category?: 'buff' | 'debuff' | 'control'
  icon?: string                  // glyph for the BattleView status chips
  description?: string           // one-line flavour for the tappable status detail
  perLevel?: boolean             // statModifiers are PER-LEVEL — buildStatus multiplies them by the applied level (e.g. Bless)
}

export const STATUS_REGISTRY: Record<string, StatusSpec> = {
  'stunned':   { id: 'stunned',   name: 'Stunned', duration: 2, flags: ['stunned'], category: 'control', icon: '💫', description: 'Skips its turn while stunned.' },
  'agi-up':    { id: 'agi-up',    name: 'Boosted Agility', duration: 25, statModifiers: { spd: 6 }, category: 'buff', icon: '🏃', description: 'Faster — acts earlier in the round.' },
  // Molasses slow: sluggish move + attack speed. Short duration, refreshed each
  // round a unit stands in the puddle, so it lingers a beat after it leaves.
  'slowed':    { id: 'slowed',    name: 'Slowed', duration: 3, statModifiers: { spd: -8, moveSpeedMult: 0.5 }, category: 'debuff', icon: '🐌', description: 'Sluggish — half move speed and much slower to act.' },
  // Bless: per-level offence buff (+lv attack/magic/speed, +2·lv hit), same
  // duration as Agility. statModifiers are per-level — scaled at apply time.
  'blessed':   { id: 'blessed',   name: 'Blessed', duration: 25, statModifiers: { str: 1, int: 1, spd: 1, acc: 2 }, perLevel: true, category: 'buff', icon: '✨', description: 'Empowered — more attack, magic, speed, and hit.' },
  'poisoned':  { id: 'poisoned',  name: 'Poisoned', duration: 3, dotDamage: 4, element: 'poison', category: 'debuff', icon: '☠️', description: 'Takes damage every round.' },
  'rooted':    { id: 'rooted',    name: 'Rooted', duration: 2, flags: ['rooted'], category: 'control', icon: '🪤', description: "Can't move — snared in place." },
  // §threat hard taunt (~3s at 2.5 rounds/s): forces the bearer to attack the
  // taunter (status.source), overriding its threat fallback AND its own targeting
  // tactics, for the duration. Applied by the Taunt skill, which also jumps the
  // taunter to the top of the bearer's threat table so aggro doesn't instantly slip.
  'taunted':   { id: 'taunted',   name: 'Taunted', duration: 8, flags: ['taunted'], category: 'control', icon: '🎯', description: 'Forced to attack the taunter.' },
  // §3 combo: frozen skips the turn and counts as water armor — so Lightning/Fire
  // hit for 2x via the element table, while a fire hit also melts (clears) it.
  'frozen':    { id: 'frozen',    name: 'Frozen', duration: 2, flags: ['frozen'], armorOverride: 'water', removedByElement: ['fire'], category: 'control', icon: '❄️', description: 'Skips its turn; counts as water armor (fire melts it).' },
  // Cloak: ~10s of invisibility (≈25 rounds at 2.5 rounds/s) — or until the
  // bearer deals/takes damage (breakStealth). Sneaking is slower: 75% move speed.
  'stealthed': { id: 'stealthed', name: 'Stealthed', duration: 25, flags: ['stealthed'], statModifiers: { moveSpeedMult: 0.75 }, category: 'buff', icon: '🌫️', description: 'Hidden from enemies until it strikes or is hit; moves slower.' },
  // Shield Wall (the skill): a big per-level DEF buff. The 'shielded' flag makes
  // the unit forgo its own attack while it holds — fully turtled.
  'shield-wall': { id: 'shield-wall', name: 'Shield Wall', duration: 8, statModifiers: { def: 12 }, perLevel: true, flags: ['shielded'], category: 'buff', icon: '🛡️', description: 'Turtled up — much higher defense (and not attacking).' },
  // Last Stand (the skill): a near-death surge of attack power + speed (per level).
  'last-stand': { id: 'last-stand', name: 'Last Stand', duration: 8, statModifiers: { str: 8, spd: 4 }, perLevel: true, category: 'buff', icon: '🔥', description: 'A surge of power near death — more attack and speed.' },
}

export function buildStatus(specId: string, sourceId: string, level = 1): StatusEffect | null {
  const spec = STATUS_REGISTRY[specId]
  if (!spec) return null
  // Per-level statuses (Bless) scale their modifiers by the applied skill level.
  const base = spec.statModifiers ?? {}
  const mult = spec.perLevel ? Math.max(1, level) : 1
  const statModifiers = mult === 1
    ? { ...base }
    : Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v as number) * mult]))
  return {
    id: spec.id,
    name: spec.name,
    source: sourceId,
    duration: scaleRounds(spec.duration),   // finer rounds → age out over N× rounds (same real time)
    statModifiers,
    flags: [...(spec.flags ?? [])],
    dotDamage: spec.dotDamage,
    element: spec.element,
    damageTakenMult: spec.damageTakenMult,
    armorOverride: spec.armorOverride,
    removedByElement: spec.removedByElement ? [...spec.removedByElement] : undefined,
    category: spec.category,
  }
}
