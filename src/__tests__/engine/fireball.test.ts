// Fireball: an instant fire AoE burst — hits a foe and splashes everyone near it
// for damage right now. No lingering zone (unlike Lightning Storm / Firewall), so
// nothing to side-step the way the Dodge AoE tactic leaves a ground hazard.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('fireball', () => {
  it('bursts instant fire AoE on the target and nearby foes, leaving no zone', () => {
    const fb = { ...buildEngineSkill('fireball', 2)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'm', int: 40, str: 1, skills: [fb] })],
      enemyUnits: [
        eu({ id: 'e0', team: 'enemy', maxHp: 400, hp: 400, meleeRange: 1.2, moveSpeed: 0 }),
        eu({ id: 'e1', team: 'enemy', maxHp: 400, hp: 400, meleeRange: 1.2, moveSpeed: 0 }),
        eu({ id: 'far', team: 'enemy', maxHp: 400, hp: 400, meleeRange: 1.2, moveSpeed: 0 }),
      ],
    })
    find(b, 'm').pos = { x: 2, y: 7 }
    find(b, 'e0').pos = { x: 8, y: 7 }       // the target the mage aims at
    find(b, 'e1').pos = { x: 8.9, y: 7 }     // within the blast radius of e0
    find(b, 'far').pos = { x: 13, y: 13 }    // well outside the blast
    advanceRound(b)                          // instant cast → bursts this round
    expect(b.zones).toHaveLength(0)          // no lingering cloud
    expect(find(b, 'e0').hp).toBeLessThan(400)   // direct hit
    expect(find(b, 'e1').hp).toBeLessThan(400)   // caught in the splash
    expect(find(b, 'far').hp).toBe(400)          // out of range → untouched
  })

  it('is an instant, undodgeable AoE: no channel telegraph for Dodge AoE to read', () => {
    const fb = buildEngineSkill('fireball', 1)!
    expect(fb.channelTime).toBe(0)        // instant — nothing to dodge mid-cast
    expect(fb.zone).toBeUndefined()       // and no ground hazard to step out of
    expect(fb.targeting).toBe('aoe_enemy')
  })
})
