// Combat Tactic Engine — status effect catalog (spec §7).
//
// Skills reference a status by id via `EngineSkill.statusApplied`; the engine
// builds a fresh StatusEffect from the spec when the skill resolves. Stat
// modifiers stack additively into `effectiveStat`; flags are read by the turn
// loop (e.g. 'stunned' skips a turn) and damage path.

import type { StatModifiers, StatusEffect, Element } from './types'

export interface StatusSpec {
  id: string
  name: string
  duration: number               // rounds; 'stunned' is consumed on the skipped turn instead
  statModifiers?: StatModifiers
  flags?: string[]
  dotDamage?: number             // damage to the bearer each round (poison etc.)
  damageTakenMult?: number       // element-agnostic incoming-damage multiplier
  armorOverride?: Element        // override effective armor element while active (§3 combos)
  removedByElement?: Element[]   // taking this element's damage clears the status
  category?: 'buff' | 'debuff' | 'control'
}

export const STATUS_REGISTRY: Record<string, StatusSpec> = {
  'stunned':   { id: 'stunned',   name: 'Stunned', duration: 2, flags: ['stunned'], category: 'control' },
  'agi-up':    { id: 'agi-up',    name: 'Boosted Agility', duration: 4, statModifiers: { spd: 6 }, category: 'buff' },
  'poisoned':  { id: 'poisoned',  name: 'Poisoned', duration: 3, dotDamage: 4, category: 'debuff' },
  'rooted':    { id: 'rooted',    name: 'Rooted', duration: 2, flags: ['rooted'], category: 'control' },
  // §3 combo: frozen skips the turn and counts as water armor — so Lightning/Fire
  // hit for 2x via the element table, while a fire hit also melts (clears) it.
  'frozen':    { id: 'frozen',    name: 'Frozen', duration: 2, flags: ['frozen'], armorOverride: 'water', removedByElement: ['fire'], category: 'control' },
  'stealthed': { id: 'stealthed', name: 'Stealthed', duration: 4, flags: ['stealthed'], category: 'buff' },
}

export function buildStatus(specId: string, sourceId: string): StatusEffect | null {
  const spec = STATUS_REGISTRY[specId]
  if (!spec) return null
  return {
    id: spec.id,
    name: spec.name,
    source: sourceId,
    duration: spec.duration,
    statModifiers: { ...(spec.statModifiers ?? {}) },
    flags: [...(spec.flags ?? [])],
    dotDamage: spec.dotDamage,
    damageTakenMult: spec.damageTakenMult,
    armorOverride: spec.armorOverride,
    removedByElement: spec.removedByElement ? [...spec.removedByElement] : undefined,
    category: spec.category,
  }
}
