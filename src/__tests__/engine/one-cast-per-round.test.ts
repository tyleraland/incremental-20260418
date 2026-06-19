// The action channel "owns the turn": a combatant casts at most ONE spell (or one
// attack) per turn, and gets one turn per round. So even a support unit holding a
// fistful of ready spells (heal, sanctuary, bless, agility, sight, dispel) can't
// dump them all at once — at most one goes off per round. This pins the assumption
// behind the casting-cadence answer: two rounds ⇒ two casts, never more.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const castsBy = (b: BattleState, id: string) => b.stats.skillsUsedByUnit[id]?.length ?? 0

// Every support spell off cooldown and at long range so they're ALL "ready" each
// round — the only thing limiting throughput should be the one-action-per-turn cap.
const ready = (id: string) => ({ ...buildEngineSkill(id, 3)!, cooldown: 0, range: 99, statusMaxActive: 99 })

function supportBattle(): BattleState {
  const skills = ['heal', 'aoe-heal', 'bless', 'boost-agility', 'sight', 'dispel'].map(ready)
  const b = createBattle({
    playerUnits: [
      eu({ id: 'c', int: 20, maxHp: 9999, hp: 9999, skills }),
      // A permanently-hurt ally (tiny hp vs a huge pool) guarantees Heal/Sanctuary
      // always WANT to fire, so the caster never sits a round out — the count is a
      // clean measure of the per-round cap, not of "ran out of things to do".
      eu({ id: 'a', maxHp: 100000, hp: 1 }),
    ],
    enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, meleeRange: 1.2, moveSpeed: 0 })],
  })
  // Park everyone apart so no turn is spent in melee; the support just buffs/heals.
  find(b, 'c').pos = { x: 3, y: 3 }; find(b, 'a').pos = { x: 3.6, y: 3 }; find(b, 'e').pos = { x: 28, y: 28 }
  return b
}

describe('one cast per round', () => {
  it('two rounds ⇒ exactly two spells cast, even with six spells ready', () => {
    const b = supportBattle()
    expect(castsBy(b, 'c')).toBe(0)
    advanceRound(b)
    expect(castsBy(b, 'c')).toBe(1)   // round 1: one spell, not six
    advanceRound(b)
    expect(castsBy(b, 'c')).toBe(2)   // round 2: one more — two total, never more
  })

  it('the cap holds round after round: N rounds ⇒ N casts', () => {
    const b = supportBattle()
    for (let n = 1; n <= 6; n++) {
      advanceRound(b)
      expect(castsBy(b, 'c')).toBe(n)
    }
  })
})
