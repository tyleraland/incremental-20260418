// Combat Tactic Engine — active time scale (finer rounds).
//
// "Per-round" quantities (move distance, cooldowns, channel/zone durations,
// status durations, basic-attack cadence, DoT ticks, draw timeout) are authored
// at a logical 1× rate. Running the sim at a *finer* round rate — more, smaller
// rounds per real second — makes motion smoother and spreads combat events out,
// but must not change the real-time pace: a unit should still cross the same
// ground per second, skills recharge in the same seconds, etc.
//
// `timeScale = N` means "N engine rounds == one logical round": move 1/N as far
// per round, recharge cooldowns over N× as many rounds, basic-attack every N
// rounds, age statuses over N× rounds, tick DoT every N rounds. The net real-time
// behaviour is unchanged; only the granularity is finer.
//
// Like the arena bounds, the engine runs one battle at a time, so each entry
// point sets the active scale up front and the per-round helpers read it here.
// Defaults to 1 (no scaling) so any path that forgets to set it behaves exactly
// as before — keeping the whole engine suite and snapshot replays unaffected.

import { REF_ATTACK_SPD, MAX_ATTACK_INTERVAL } from './constants'

let activeScale = 1
// §multi-attack ambient — the max basic swings a unit may take per logical round
// (agility-driven). 1 = disabled (single-swing cadence, byte-identical to before).
// Set per battle from CombatSetup, re-asserted each round like activeScale.
let activeMultiAttackMax = 1

export function setTimeScale(scale: number): void {
  activeScale = Math.max(1, Math.floor(scale))
}

export function timeScale(): number {
  return activeScale
}

export function setMultiAttackMax(max: number): void {
  activeMultiAttackMax = Math.max(1, Math.floor(max))
}

export function multiAttackMax(): number {
  return activeMultiAttackMax
}

// Scale a per-logical-round duration (cooldown, channel, status, dwell) to rounds.
export function scaleRounds(rounds: number): number {
  return rounds * activeScale
}

// True on the round where a per-logical-round *discrete* event should fire (a DoT
// tick, a zone pulse), spread by `phase` so staggered actors don't all fire on the
// same finer-round. At scale 1 this is every round (unchanged).
export function onBeat(round: number, phase = 0): boolean {
  return ((round + phase) % activeScale) === 0
}

// How many *logical* rounds between a unit's basic attacks, from its attackSpeed
// (engine `spd`). REF_ATTACK_SPD swings every logical round (the once-per-round
// cap); slower attackers wait proportionally longer. See constants.ts.
export function basicAttackInterval(spd: number): number {
  const i = Math.round(REF_ATTACK_SPD / Math.max(1, spd))
  return Math.min(MAX_ATTACK_INTERVAL, Math.max(1, i))
}

// True on the round where a unit may throw a basic attack, given its attackSpeed.
// Generalises onBeat: an interval-1 (normal/fast) unit swings once per logical
// round exactly as before; a slower unit swings every `interval` logical rounds.
// Stateless & deterministic (no per-unit cooldown to serialize), and preserves the
// timeScale equivalence (the period scales with activeScale just like onBeat).
export function onAttackBeat(round: number, phase: number, spd: number): boolean {
  return ((round + phase) % (basicAttackInterval(spd) * activeScale)) === 0
}

// §multi-attack. Basic swings a unit gets per LOGICAL round from its attackSpeed
// (agility). Below REF_ATTACK_SPD a unit swings ≤ once/round (paced by the interval
// in onAttackBeat) → 1 here; at/above REF, `floor(spd/REF)` swings, capped at the
// active multi-attack max. When that cap is 1 (default/disabled) this is always 1
// for spd ≥ REF and the cadence is byte-identical to onAttackBeat.
export function attacksPerRound(spd: number): number {
  if (spd < REF_ATTACK_SPD) return 1
  return Math.min(activeMultiAttackMax, Math.max(1, Math.floor(spd / REF_ATTACK_SPD)))
}

// How many basic attacks a unit lands on THIS engine (sub-)round. Generalises
// onAttackBeat to multiple swings per logical round:
//   • perRound === 1  → exactly onAttackBeat (0 or 1), including the slow-attacker
//     interval — so with multiAttackMax=1 nothing changes and replays stay 1:1.
//   • perRound > 1    → spread `perRound` swings across the logical round's
//     activeScale engine sub-rounds (staggered by `phase` so a party doesn't all
//     bunch on the same sub-round). The per-logical-round total is exactly
//     `perRound` at ANY timeScale — at scale 1 the swings bunch onto the one engine
//     round; at scale N they fan out — keeping the real-time pace invariant.
// Stateless & deterministic, so it adds no snapshot field and replays byte-identical.
export function attacksThisEngineRound(round: number, phase: number, spd: number): number {
  const perRound = attacksPerRound(spd)
  if (perRound <= 1) return onAttackBeat(round, phase, spd) ? perRound : 0
  const sub = (((round + phase) % activeScale) + activeScale) % activeScale
  const upto = (k: number) => Math.floor((k * perRound) / activeScale)
  return upto(sub + 1) - upto(sub)
}
