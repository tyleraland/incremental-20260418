// §basic-attack cadence. attackSpeed (the engine's `spd`) now paces basic attacks:
// a normal/fast attacker swings once per logical round (the historical cap), a slow
// one less often. Stateless & deterministic — a pure function of round + index +
// spd, so it adds no snapshot field and replays 1:1. Skills are unaffected (paced by
// their own cooldowns).
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, type BattleState } from '@/engine'
import { basicAttackInterval } from '@/engine/timescale'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// Count basic (non-skill) attacks a unit lands over N rounds.
function countBasics(spd: number, rounds: number): number {
  const b = createBattle({
    playerUnits: [eu({ id: 'atk', str: 12, spd, meleeRange: 2, moveSpeed: 0 })],
    enemyUnits: [eu({ id: 'dummy', team: 'enemy', maxHp: 100000, hp: 100000, moveSpeed: 0 })],
  })
  find(b, 'atk').pos = { x: 7, y: 7 }
  find(b, 'dummy').pos = { x: 7, y: 8 }   // already in melee reach
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
