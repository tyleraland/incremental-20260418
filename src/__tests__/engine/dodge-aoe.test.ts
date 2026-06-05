// Dodge AoE (movement tactic): step out of incoming area spells. A ground-zone
// spell (Lightning Storm) telegraphs a fixed spot — a unit with this tactic
// leaves the marked ground before it lands; one without it eats the blast.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('dodge-aoe tactic', () => {
  it('steps out of a telegraphed Lightning Storm before it lands; a unit without it gets zapped', () => {
    const storm = buildEngineSkill('lightning-storm', 1)!
    const b = createBattle({
      playerUnits: [
        eu({ id: 'dodger', maxHp: 300, hp: 300, moveSpeed: 1.0, rangedRange: 6, tactics: [{ id: 'dodge-aoe', rank: 1 }] }),
        eu({ id: 'sitter', maxHp: 300, hp: 300, moveSpeed: 0 }),   // can't move → stays in the blast
      ],
      enemyUnits: [eu({ id: 'caster', team: 'enemy', skills: [storm], maxHp: 200, hp: 200 })],
    })
    const center = { x: 7.5, y: 7.5 }
    find(b, 'dodger').pos = { ...center }
    find(b, 'sitter').pos = { x: 7.2, y: 7.5 }
    find(b, 'caster').pos = { x: 7.5, y: 13 }
    // Telegraph the storm: a channel locked to the centre spot (as castSkill does).
    find(b, 'caster').channel = { skillId: 'lightning-storm', targetId: 'dodger', roundsLeft: storm.channelTime, targetPoint: { ...center } }

    for (let i = 0; i < storm.channelTime + 5; i++) advanceRound(b)

    const z = b.zones[0]
    expect(z).toBeTruthy()                                                              // landed on its marked ground
    const dodger = find(b, 'dodger'), sitter = find(b, 'sitter')
    expect(Math.hypot(dodger.pos.x - z.pos.x, dodger.pos.y - z.pos.y)).toBeGreaterThan(z.radius)  // cleared the blast
    expect(dodger.hp).toBe(300)                                                          // took no storm damage
    expect(sitter.hp).toBeLessThan(300)                                                  // the one that couldn't leave got zapped
  })

  it('does nothing when no area spell threatens it (yields to other movement)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', rangedRange: 6, tactics: [{ id: 'dodge-aoe', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', meleeRange: 1.2 })],
    })
    const start = { ...find(b, 'p').pos }
    advanceRound(b)
    const p = find(b, 'p')
    // No AoE in play → the tactic returns null and the unit isn't yanked anywhere
    // odd by it (it just behaves normally).
    expect(p.lastResolution.find((r) => r.id === 'dodge-aoe')?.outcome).not.toBe('fired')
    expect(Math.hypot(p.pos.x - start.x, p.pos.y - start.y)).toBeLessThan(2)
  })
})
