// Molasses (§slow): a fast (2-round) AoE puddle that slows everything inside —
// half move speed, much slower to act, no damage. A defensive kiting/peel tool:
// up to 3 puddles at once, and the slow doesn't stack.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { effectiveStat } from '@/engine/damage'
import { moveSpeedOf } from '@/engine/grid'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('molasses', () => {
  it('slows whoever stands in the puddle (move + act), without stacking or dealing damage', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'm', moveSpeed: 0 })],   // far off, can't attack — isolates the puddle's effect
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 300, hp: 300, meleeRange: 1.2 })],
    })
    find(b, 'm').pos = { x: 1, y: 1 }
    find(b, 'e').pos = { x: 8, y: 8 }
    // two overlapping Molasses puddles on the foe (non-stack check)
    const z = { id: 'z1', sourceId: 'm', team: 'enemy' as const, pos: { x: 8, y: 8 }, radius: 2.4, dotDamage: 0, roundsLeft: 99, skillId: 'molasses', statusApplied: 'slowed' }
    b.zones.push(z, { ...z, id: 'z2' })
    const hp = find(b, 'e').hp
    advanceRound(b)
    const e = find(b, 'e')
    expect(e.statuses.filter((s) => s.id === 'slowed').length).toBe(1)   // doesn't stack
    expect(effectiveStat(e, 'spd')).toBeLessThan(e.spd)                  // slower to act
    expect(moveSpeedOf(e)).toBeLessThan(e.moveSpeed)                     // slower to move
    expect(e.hp).toBe(hp)                                               // no damage
  })

  it('caps at three puddles up at once', () => {
    const mol = { ...buildEngineSkill('molasses', 1)!, channelTime: 0, cooldown: 0, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'm', int: 20, rangedRange: 6, maxHp: 999, hp: 999, moveSpeed: 0, skills: [mol] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 9999, hp: 9999, meleeRange: 1.2, moveSpeed: 0 })],
    })
    find(b, 'm').pos = { x: 4, y: 4 }
    find(b, 'e').pos = { x: 9, y: 9 }
    let maxZones = 0
    for (let i = 0; i < 20; i++) { advanceRound(b); maxZones = Math.max(maxZones, b.zones.length) }
    expect(maxZones).toBe(3)   // reaches the cap, never a fourth
  })

  it('is a defensive kiting tool: a Kiter slows a faster chaser and survives', () => {
    const mol = buildEngineSkill('molasses', 1)!
    const fb = { ...buildEngineSkill('frost-bolt', 1)!, channelTime: 0 }
    const b = createBattle({
      playerUnits: [eu({ id: 'm', int: 20, str: 2, spd: 12, rangedRange: 6, maxHp: 300, hp: 300, moveSpeed: 0.9, skills: [mol, fb], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 16, def: 8, spd: 8, maxHp: 600, hp: 600, meleeRange: 1.2, moveSpeed: 1.1 })],
    })
    find(b, 'm').pos = { x: 7.5, y: 4 }
    find(b, 'e').pos = { x: 7.5, y: 11 }   // a chaser that's FASTER than the kiter — it'd catch and kill it without the slow
    let slowed = false
    for (let i = 0; i < 25; i++) { advanceRound(b); if (find(b, 'e').statuses.some((s) => s.id === 'slowed')) slowed = true }
    expect(slowed).toBe(true)                       // the chaser ate the puddle
    expect(find(b, 'm').alive).toBe(true)           // and the kiter's still standing
    expect(find(b, 'm').hp).toBeGreaterThan(110)    // comfortably alive (exact value shifts a little with kite-escape tuning; the slow now lands at end-of-turn, so the chaser gets one un-slowed step before it bites)
  })
})
