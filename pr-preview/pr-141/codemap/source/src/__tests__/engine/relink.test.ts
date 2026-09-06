// relinkCombatant: a player's gear / skill / tactic edits take effect on a unit
// already in an ongoing fight, without re-spawning it — runtime state (position,
// hp, cooldowns, statuses, locks) is preserved.
import { describe, it, expect } from 'vitest'
import { createBattle, relinkCombatant, type BattleState } from '@/engine'
import { eu, attackSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('relinkCombatant', () => {
  it('re-applies stats / skills / tactics in place, preserving runtime state', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 10, tactics: [{ id: 'kiter', rank: 1 }], skills: [] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    const c = find(b, 'p')
    c.pos = { x: 3, y: 4 }; c.hp = 17; c.lockedTargetId = 'e'; c.skillCooldowns = { keep: 2 }

    // Edit the loadout: stronger, swap tactic, add a skill.
    relinkCombatant(c, eu({ id: 'p', str: 25, tactics: [{ id: 'charger', rank: 1 }], skills: [attackSkill({ id: 'bash' })] }))

    expect(c.str).toBe(25)                                            // stat updated
    expect(c.tactics.some((t) => t.def.id === 'charger')).toBe(true) // new tactic
    expect(c.tactics.some((t) => t.def.id === 'kiter')).toBe(false)  // old tactic gone
    expect(c.skills.some((s) => s.id === 'bash')).toBe(true)         // new skill
    expect(c.tactics.some((t) => t.def.id === 'skill:bash')).toBe(true) // injected as an action tactic
    // runtime preserved
    expect(c.pos).toEqual({ x: 3, y: 4 })
    expect(c.hp).toBe(17)
    expect(c.lockedTargetId).toBe('e')
    expect(c.skillCooldowns).toEqual({ keep: 2 })
  })

  it('caps current hp to a reduced maxHp', () => {
    const b = createBattle({ playerUnits: [eu({ id: 'p', maxHp: 100, hp: 100 })], enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    const c = find(b, 'p')
    c.hp = 90
    relinkCombatant(c, eu({ id: 'p', maxHp: 50, hp: 50 }))
    expect(c.maxHp).toBe(50)
    expect(c.hp).toBe(50)
  })
})
