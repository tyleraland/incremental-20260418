// §basic-attack cadence. attackSpeed (the engine's `spd`) now paces basic attacks:
// a normal/fast attacker swings once per logical round (the historical cap), a slow
// one less often. Stateless & deterministic — a pure function of round + index +
// spd, so it adds no snapshot field and replays 1:1. Skills are unaffected (paced by
// their own cooldowns).
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, type BattleState } from '@/engine'
import { basicAttackInterval, attacksPerRound, setMultiAttackMax } from '@/engine/timescale'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// Count basic (non-skill) attacks a unit lands over N (engine) rounds. Optional
// prototype knobs: a multi-attack cap (§multi-attack) and a finer timeScale.
function countBasics(spd: number, rounds: number, opts?: { multiAttackMax?: number; timeScale?: number }): number {
  const b = createBattle({
    // Arena-spanning meleeRange so the target is ALWAYS in reach — separation
    // nudges can't drift the attacker out of range, isolating pure attack cadence.
    // Huge HP on BOTH sides so neither dies within the window — the encounter never
    // ends early (which would otherwise cut the count off at a timeScale-dependent
    // round and break the pace-invariance check).
    playerUnits: [eu({ id: 'atk', str: 12, spd, meleeRange: 100, moveSpeed: 0, maxHp: 100000000, hp: 100000000 })],
    enemyUnits: [eu({ id: 'dummy', team: 'enemy', maxHp: 100000000, hp: 100000000, moveSpeed: 0 })],
    multiAttackMax: opts?.multiAttackMax,
    timeScale: opts?.timeScale,
  })
  find(b, 'atk').pos = { x: 7, y: 7 }
  find(b, 'dummy').pos = { x: 7, y: 8 }   // already in reach
  let hits = 0
  for (let r = 0; r < rounds; r++) {
    advanceRound(b)
    hits += b.events.filter((e) => e.type === 'melee_attack' && e.sourceId === 'atk').length
    b.events.length = 0
  }
  return hits
}

describe('basicAttackInterval', () => {
  it('is 1 (every logical round) for normal/fast attackers, longer for slow ones', () => {
    expect(basicAttackInterval(10)).toBe(1)   // canonical normal
    expect(basicAttackInterval(18)).toBe(1)   // fast gives no bonus (capped at 1)
    expect(basicAttackInterval(7)).toBe(1)
    expect(basicAttackInterval(6)).toBe(2)    // slow → every other logical round
    expect(basicAttackInterval(4)).toBe(3)
    expect(basicAttackInterval(1)).toBe(4)    // clamped to MAX_ATTACK_INTERVAL
  })
})

describe('a slow attacker swings less often than a fast one', () => {
  it('fast (spd 10) lands ~3× the basics of slow (spd 4) over the same window', () => {
    const fast = countBasics(10, 36)
    const slow = countBasics(4, 36)
    expect(fast).toBeGreaterThan(slow)
    // spd 10 → interval 1, spd 4 → interval 3: roughly a 3:1 ratio.
    expect(fast).toBeGreaterThanOrEqual(slow * 2)
    expect(slow).toBeGreaterThan(0)   // it still attacks, just slowly
  })
})

// §multi-attack PROTOTYPE — agility (engine `spd`) decouples attack rate from the
// old one-basic-per-logical-round cap. Disabled by default (multiAttackMax=1), so
// these enable it per battle to demonstrate the decoupling.
describe('multi-attack: agility drives >1 basic per logical round', () => {
  it('is disabled by default — even a very fast attacker lands one basic per round', () => {
    expect(countBasics(50, 10)).toBe(10)   // no cap set → one swing/round, exactly as before
  })

  it('scales attacks/logical-round with attackSpeed, capped at the max (timeScale 1)', () => {
    // At timeScale 1 one engine round IS one logical round, so over 10 rounds the
    // basics == 10 × attacksPerRound(spd).
    expect(countBasics(10, 10, { multiAttackMax: 5 })).toBe(10)   // spd 10 → 1/round (unchanged)
    expect(countBasics(20, 10, { multiAttackMax: 5 })).toBe(20)   // spd 20 → 2/round
    expect(countBasics(30, 10, { multiAttackMax: 5 })).toBe(30)   // spd 30 → 3/round
    expect(countBasics(50, 10, { multiAttackMax: 5 })).toBe(50)   // spd 50 → 5/round
    expect(countBasics(90, 10, { multiAttackMax: 5 })).toBe(50)   // spd 90 → clamped to 5/round
  })

  it('is pace-invariant: the same swings/logical-round land at a finer timeScale', () => {
    // timeScale 6 → a logical round is 6 engine rounds. 60 engine rounds = 10 logical
    // rounds, so a spd-50 attacker still lands 10 × 5 = 50 basics — the extra swings
    // fan out across the finer sub-rounds instead of bunching, but the total matches.
    expect(countBasics(50, 60, { multiAttackMax: 5, timeScale: 6 })).toBe(50)
    expect(countBasics(20, 60, { multiAttackMax: 5, timeScale: 6 })).toBe(20)
  })
})

describe('attacksPerRound', () => {
  it('floor(spd / REF_ATTACK_SPD), clamped to [1, max]', () => {
    setMultiAttackMax(5)
    expect(attacksPerRound(5)).toBe(1)    // below REF → paced by interval, 1 here
    expect(attacksPerRound(10)).toBe(1)
    expect(attacksPerRound(25)).toBe(2)
    expect(attacksPerRound(50)).toBe(5)
    expect(attacksPerRound(100)).toBe(5)  // capped
    setMultiAttackMax(1)
    expect(attacksPerRound(50)).toBe(1)   // disabled → always 1
  })
})
