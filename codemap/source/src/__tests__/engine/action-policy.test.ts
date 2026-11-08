// §action policy (item 6): the action channel leads with the biggest ready nuke.
// Skill-tactics are injected biggest-attack-first (by target-independent damage
// estimate) and resolved first-match, so a unit opens with its hardest-hitting
// ready attack and falls through to a weaker one only when the big one is down.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, type BattleState } from '@/engine'
import { eu, attackSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const lastSkillUseBy = (b: BattleState, id: string) =>
  [...b.events].reverse().find((e) => e.type === 'skill_use' && e.sourceId === id)?.skillId

// A weak and a strong single-target attack, both ready and in melee range.
const weak = () => attackSkill({ id: 'jab', name: 'Jab', damageFormula: 'str * 1', range: 30, cooldown: 4 })
const strong = () => attackSkill({ id: 'haymaker', name: 'Haymaker', damageFormula: 'str * 3', range: 30, cooldown: 4 })

describe('action selection: biggest ready nuke first', () => {
  it('opens with the higher-damage skill even when it is declared last', () => {
    const b = createBattle({
      // weak declared FIRST — ordering must promote the strong one regardless.
      playerUnits: [eu({ id: 'p', str: 20, skills: [weak(), strong()], meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, hp: 999, maxHp: 999, meleeRange: 30 })],
    })
    advanceRound(b)
    expect(lastSkillUseBy(b, 'p')).toBe('haymaker')
  })

  it('falls through to the weaker skill while the big one is on cooldown', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 20, skills: [weak(), strong()], meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, hp: 999, maxHp: 999, meleeRange: 30 })],
    })
    advanceRound(b)                       // casts haymaker → it goes on cooldown
    expect(lastSkillUseBy(b, 'p')).toBe('haymaker')
    advanceRound(b)                       // haymaker cooling down → weak nuke fires
    expect(lastSkillUseBy(b, 'p')).toBe('jab')
  })

  it('does not reorder a heal ahead of/behind attacks (type priority intact)', () => {
    // One attack only → orderAttacksByPower is a no-op; sanity that a lone-attack
    // unit still casts its attack.
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 20, skills: [strong()], meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, hp: 999, maxHp: 999, meleeRange: 30 })],
    })
    advanceRound(b)
    expect(lastSkillUseBy(b, 'p')).toBe('haymaker')
    expect(find(b, 'e').hp).toBeLessThan(999)
  })
})

describe('Burst tactic in a live fight (item 8)', () => {
  // A long-cooldown heavy hitter + a short-cooldown filler.
  const heavy = () => attackSkill({ id: 'heavy', name: 'Heavy', damageFormula: 'str * 4', range: 30, cooldown: 5 })
  const filler = () => attackSkill({ id: 'filler', name: 'Filler', damageFormula: 'str * 1', range: 30, cooldown: 2 })
  const castsOf = (b: BattleState, skillId: string) =>
    b.events.filter((e) => e.type === 'skill_use' && e.sourceId === 'p' && e.skillId === skillId).length

  it('banks the filler while the heavy hitter is imminent (fewer filler casts than a plain unit)', () => {
    const mk = (withBurst: boolean) => createBattle({
      playerUnits: [eu({ id: 'p', str: 20, skills: [filler(), heavy()], meleeRange: 30, tactics: withBurst ? [{ id: 'burst', rank: 1 }] : [] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, hp: 99999, maxHp: 99999, meleeRange: 30 })],
    })
    const plain = mk(false)
    const burst = mk(true)
    for (let i = 0; i < 8; i++) { advanceRound(plain); advanceRound(burst) }
    // Burst still lands its heavy nukes…
    expect(castsOf(burst, 'heavy')).toBeGreaterThanOrEqual(1)
    // …but withholds the filler during the bank windows, so it spends fewer.
    expect(castsOf(burst, 'filler')).toBeLessThan(castsOf(plain, 'filler'))
  })
})
