// The action channel owns the turn: a combatant casts at most one spell (or
// makes one attack) per turn, and gets one turn per round. Even a support unit
// with several ready spells therefore cannot cast more than once per round.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (battle: BattleState, id: string) => battle.combatants.find((c) => c.id === id)!
const castsBy = (battle: BattleState, id: string) => battle.stats.skillsUsedByUnit[id]?.length ?? 0

// Keep every support spell off cooldown and in range so action ownership—not
// readiness or positioning—is the only limit on casting throughput.
const ready = (id: string) => ({ ...buildEngineSkill(id, 3)!, cooldown: 0, range: 99, statusMaxActive: 99 })

function supportBattle(): BattleState {
  const skills = ['heal', 'aoe-heal', 'bless', 'boost-agility', 'sight', 'dispel'].map(ready)
  const battle = createBattle({
    playerUnits: [
      eu({ id: 'caster', int: 20, maxHp: 9999, hp: 9999, skills }),
      // A permanently hurt ally keeps healing actions useful every round.
      eu({ id: 'ally', maxHp: 100000, hp: 1 }),
    ],
    enemyUnits: [eu({ id: 'enemy', team: 'enemy', maxHp: 9999, hp: 9999, meleeRange: 1.2, moveSpeed: 0 })],
  })
  find(battle, 'caster').pos = { x: 3, y: 3 }
  find(battle, 'ally').pos = { x: 3.6, y: 3 }
  find(battle, 'enemy').pos = { x: 28, y: 28 }
  return battle
}

describe('one cast per round', () => {
  it('casts exactly once each round when several spells are ready', () => {
    const battle = supportBattle()
    expect(castsBy(battle, 'caster')).toBe(0)

    for (let round = 1; round <= 6; round++) {
      advanceRound(battle)
      expect(castsBy(battle, 'caster')).toBe(round)
    }
  })
})
