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
import { SEPARATION } from './constants'
import { effectiveStat } from './damage'
import {
  alliesOf, nearestTo, lockedTarget, centroid, nearestEnemyTo,
  squishiestAlly, flankPoint, guardPoint,
} from './spatial'
import type {
  BattleState, Combatant, ResolvedTactic, StatusEffect, TacticDef, TacticRef,
} from './types'

// ── small local helpers (kept here to avoid import cycles) ──────────────────────

function enemiesOf(state: BattleState, self: Combatant): Combatant[] {
  // hidden enemies (§3 stealth) can't be picked until revealed or they attack
  return state.combatants.filter((c) => c.alive && c.team !== self.team && !c.statuses.some((s) => s.flags.includes('stealthed')))
}
function defOf(c: Combatant): number { return effectiveStat(c, 'def') }
function hpRatio(c: Combatant): number { return c.hp / c.maxHp }

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
    id: 'tank-buster', name: 'Tank Buster', scope: 'unit', channel: 'targeting',
    description: 'Lock onto the enemy with the highest defense.',
    targeting: (self, state) => pickBy(enemiesOf(state, self), defOf, 'max')?.id ?? null,
  },
  'opportunist': {
    id: 'opportunist', name: 'Opportunist', scope: 'unit', channel: 'targeting',
    description: 'Lock onto a wounded enemy to finish it off.',
    targeting: (self, state, rank) => {
      const threshold = 0.4 + 0.05 * (rank - 1)
      const wounded = enemiesOf(state, self).filter((e) => hpRatio(e) < threshold)
      return wounded.length ? pickBy(wounded, hpRatio, 'min')!.id : null
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

  // Movement -------------------------------------------------------------------
  'charger': {
    id: 'charger', name: 'Charger', scope: 'unit', channel: 'movement',
    description: 'Sprint toward the target; the first hit lands harder.',
    movement: () => ({ speedMult: 1.5 }),
  },
  'retreater': {
    id: 'retreater', name: 'Retreater', scope: 'unit', channel: 'movement', oncePerCombat: true,
    description: 'Fall back and disengage when badly hurt.',
    movement: (self, _state, rank) => {
      const threshold = 0.4 - 0.05 * (rank - 1)
      return hpRatio(self) < threshold ? { awayFromNearestEnemy: true, rows: 2, clearLock: true } : null
    },
  },
  'flanker': {
    id: 'flanker', name: 'Flanker', scope: 'unit', channel: 'movement',
    description: "Circle to the locked target's least-guarded side before striking.",
    movement: (self, state) => {
      const t = lockedTarget(self, state)
      if (!t) return null
      return { toPoint: flankPoint(self, t, state, Math.max(self.meleeRange, SEPARATION)) }
    },
  },
  'kiter': {
    id: 'kiter', name: 'Kiter', scope: 'unit', channel: 'movement',
    description: 'Ranged: keep distance from the target, back off if it closes in.',
    movement: (self, state, rank) => {
      if (self.rangedRange <= 0 || !lockedTarget(self, state)) return null
      return { desiredRange: self.rangedRange * (0.95 - 0.03 * (rank - 1)) }
    },
  },
  'guardian': {
    id: 'guardian', name: 'Guardian', scope: 'unit', channel: 'movement',
    description: 'Body-block: stand between your squishiest ally and the nearest threat.',
    movement: (self, state) => {
      const ally = squishiestAlly(self, state)
      if (!ally) return null
      const threat = nearestEnemyTo(ally, state)
      if (!threat) return null
      return { toPoint: guardPoint(ally, threat, SEPARATION * 1.6) }
    },
  },
  'regroup': {
    id: 'regroup', name: 'Regroup', scope: 'unit', channel: 'movement',
    description: 'Fall back to the group when you get isolated from allies.',
    movement: (self, state, rank) => {
      const mates = alliesOf(state, self)
      if (mates.length === 0) return null
      const near = nearestTo(self.pos, mates)
      const isolation = 3 + 0.5 * (rank - 1)
      if (near && distance(self.pos, near.pos) <= isolation) return null
      const c = centroid(mates)
      return c ? { toPoint: c } : null
    },
  },

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
    description: 'The team piles onto badly wounded enemies.',
    targeting: (self, state) => {
      const wounded = enemiesOf(state, self).filter((e) => hpRatio(e) < 0.25)
      return wounded.length ? pickBy(wounded, hpRatio, 'min')!.id : null
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
  return [...top, ...unitT, ...bottom]
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
