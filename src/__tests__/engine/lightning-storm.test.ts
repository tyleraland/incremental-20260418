// Lightning Storm (spec §2 zones, §4 channel): a wide, long-lived ground cloud
// that zaps anything inside for 1 lightning/round, behind a very long channel.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, buildStatus,
  type BattleState,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const hasEvent = (b: BattleState, pred: (e: BattleState['events'][number]) => boolean) => b.events.some(pred)

describe('Lightning Storm catalog', () => {
  it('is a long-channel, lightning ground-zone AoE', () => {
    const ls = buildEngineSkill('lightning-storm', 1)!
    expect(ls.targeting).toBe('aoe_point')
    expect(ls.element).toBe('lightning')
    expect(ls.channelTime).toBeGreaterThanOrEqual(4)   // "very long cast time"
    expect(ls.aoeRadius).toBeGreaterThan(2)            // a wide cloud
    expect(ls.zone?.dotDamage).toBe(1)                 // 1 lightning / round
    expect(ls.zone?.duration).toBeGreaterThan(0)
    expect(ls.zone?.element).toBe('lightning')
  })
})

describe('Lightning Storm zone', () => {
  it('drops a cloud that zaps enemies inside for lightning damage each round', () => {
    const ls = { ...buildEngineSkill('lightning-storm', 1)!, range: 99, channelTime: 0 }   // instant for the assertion
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [ls] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, maxHp: 200, hp: 200, meleeRange: 1.2, moveSpeed: 0 })],
    })
    advanceRound(b)                       // storm resolves → zone placed on the foe
    expect(b.zones).toHaveLength(1)
    const hp = find(b, 'e').hp
    advanceRound(b)                       // cloud ticks
    expect(hasEvent(b, (ev) => ev.type === 'dot' && ev.targetId === 'e' && ev.extra?.label === 'lightning')).toBe(true)
    expect(find(b, 'e').hp).toBeLessThan(hp)
  })

  it('disrupts a cloaked foe standing in the cloud (reveals it)', () => {
    const ls = { ...buildEngineSkill('lightning-storm', 1)!, range: 99, channelTime: 0 }
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [ls] })],
      enemyUnits: [
        eu({ id: 'e', team: 'enemy', str: 0, maxHp: 200, hp: 200, meleeRange: 1.2, moveSpeed: 0 }),
        eu({ id: 'hidden', team: 'enemy', str: 0, maxHp: 200, hp: 200, meleeRange: 1.2, moveSpeed: 0 }),
      ],
    })
    find(b, 'e').pos = { x: 7, y: 8 }
    find(b, 'hidden').pos = { x: 7.5, y: 8 }   // inside the storm centred on 'e'
    find(b, 'hidden').statuses.push(buildStatus('stealthed', 'hidden')!)
    advanceRound(b)   // storm resolves on 'e'
    advanceRound(b)   // cloud ticks both
    expect(find(b, 'hidden').statuses.some((s) => s.id === 'stealthed')).toBe(false)
    expect(find(b, 'hidden').hp).toBeLessThan(200)
  })

  it('only resolves after the long channel finishes', () => {
    const ls = buildEngineSkill('lightning-storm', 1)!
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 7, maxHp: 500, hp: 500, skills: [ls] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, maxHp: 500, hp: 500, meleeRange: 1.2, moveSpeed: 0 })],
    })
    find(b, 'mage').pos = { x: 2.5, y: 3 }; find(b, 'e').pos = { x: 2.5, y: 9 }   // in spell range, foe can't reach
    advanceRound(b)   // start the channel
    expect(hasEvent(b, (e) => e.type === 'cast_start' && e.skillId === 'lightning-storm')).toBe(true)
    expect(b.zones).toHaveLength(0)   // nothing on the ground yet
    for (let i = 0; i < ls.channelTime; i++) advanceRound(b)
    expect(b.zones).toHaveLength(1)   // cloud lands only when the channel completes
  })
})
