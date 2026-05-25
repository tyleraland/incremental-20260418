// Combat Tactic Engine — status effect catalog (spec §7).
//
// Skills reference a status by id via `EngineSkill.statusApplied`; the engine
// builds a fresh StatusEffect from the spec when the skill resolves. Stat
// modifiers stack additively into `effectiveStat`; flags are read by the turn
// loop (e.g. 'stunned' skips a turn) and damage path.

import type { StatModifiers, StatusEffect } from './types'

export interface StatusSpec {
  id: string
  name: string
  duration: number               // rounds; 'stunned' is consumed on the skipped turn instead
  statModifiers?: StatModifiers
  flags?: string[]
  dotDamage?: number             // damage to the bearer each round (poison etc.)
}

export const STATUS_REGISTRY: Record<string, StatusSpec> = {
  'stunned':  { id: 'stunned',  name: 'Stunned', duration: 2, flags: ['stunned'] },
  'agi-up':   { id: 'agi-up',   name: 'Boosted Agility', duration: 4, statModifiers: { spd: 6 } },
  'poisoned': { id: 'poisoned', name: 'Poisoned', duration: 3, dotDamage: 4 },
  'rooted':   { id: 'rooted',   name: 'Rooted', duration: 2, flags: ['rooted'] },
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
  }
}
