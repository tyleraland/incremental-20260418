// Consecration (§2 zones): a radiant aura the caster *carries*. An instant
// self-cast that drops hallowed ground centered on the caster; the zone's
// `follow` flag re-centers it each round, searing enemies within 2 spaces for a
// trickle of radiant damage (and ending when the caster dies).
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const radiantDot = (b: BattleState, id: string) =>
  [...b.events].reverse().find((e) => e.type === 'dot' && e.targetId === id && e.extra?.label === 'radiant')

// A frail caster that stands still (moveSpeed 0) carrying only Consecration.
const caster = (extra = {}) => eu({ id: 'lizard', str: 0, int: 10, maxHp: 300, hp: 300, moveSpeed: 0, skills: [buildEngineSkill('consecration', 3)!], ...extra })

describe('Consecration catalog', () => {
  it('is an instant, self-centered, following radiant aura', () => {
    const c = buildEngineSkill('consecration', 3)!
    expect(c.targeting).toBe('self')
    expect(c.element).toBe('radiant')
    expect(c.channelTime).toBe(0)         // instant — no channel to interrupt
    expect(c.aoeRadius).toBe(2)           // within 2 spaces
    expect(c.zone?.follow).toBe(true)     // rides on the caster
    expect(c.zone?.dotDamage).toBe(2)     // tiny chip (1 + ⌊(lv-1)/2⌋, lv3 → 2)
    expect(c.zone?.maxActive).toBe(1)     // cast once, then it just persists
  })
})

describe('Consecration aura', () => {
  it('sears a nearby enemy for radiant damage each round (matrix applies vs neutral)', () => {
    const b = createBattle({
      playerUnits: [caster()],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, maxHp: 200, hp: 200, moveSpeed: 0 })],
    })
    find(b, 'lizard').pos = { x: 5, y: 5 }
    find(b, 'e').pos = { x: 5, y: 6.5 }   // 1.5 away: in the aura (r=2), out of melee (1.2)
    advanceRound(b)                       // cast → following zone placed on the caster
    const z = b.zones.find((z) => z.skillId === 'consecration')!
    expect(z.follow).toBe(true)
    advanceRound(b)                       // aura ticks
    expect(radiantDot(b, 'e')?.value).toBe(2)            // radiant 1× vs neutral armor
    expect(find(b, 'e').hp).toBe(198)                    // only the aura reached it
  })

  it('hits twice as hard into undead armor (radiant 2×)', () => {
    const b = createBattle({
      playerUnits: [caster()],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, maxHp: 200, hp: 200, moveSpeed: 0, armorElement: 'undead' })],
    })
    find(b, 'lizard').pos = { x: 5, y: 5 }
    find(b, 'e').pos = { x: 5, y: 6.5 }
    advanceRound(b)
    advanceRound(b)
    expect(radiantDot(b, 'e')?.value).toBe(4)            // radiant 2× vs undead
  })

  it('follows the caster — re-centers on its new position each round', () => {
    const b = createBattle({
      playerUnits: [caster({ maxHp: 500, hp: 500 })],
      enemyUnits: [
        eu({ id: 'near', team: 'enemy', str: 0, maxHp: 300, hp: 300, moveSpeed: 0 }),
        eu({ id: 'far',  team: 'enemy', str: 0, maxHp: 300, hp: 300, moveSpeed: 0 }),
      ],
    })
    find(b, 'lizard').pos = { x: 4, y: 4 }
    find(b, 'near').pos = { x: 4, y: 5.5 }    // under the aura at the start spot
    find(b, 'far').pos  = { x: 12, y: 12 }    // far across the field
    advanceRound(b)                            // cast → zone at (4,4)
    find(b, 'lizard').pos = { x: 12, y: 12.8 } // caster strides across to 'far'
    const before = { near: find(b, 'near').hp, far: find(b, 'far').hp }
    advanceRound(b)                            // zone re-centers on the caster
    expect(find(b, 'far').hp).toBeLessThan(before.far)   // now bathed in the aura
    expect(find(b, 'near').hp).toBe(before.near)         // left behind, untouched
  })

  it('ends when the caster dies (an aura, not lingering ground)', () => {
    const b = createBattle({
      playerUnits: [caster(), eu({ id: 'ally', maxHp: 50, hp: 50, moveSpeed: 0 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 0, maxHp: 200, hp: 200, moveSpeed: 0 })],
    })
    find(b, 'lizard').pos = { x: 5, y: 5 }
    find(b, 'e').pos = { x: 5, y: 6.5 }
    advanceRound(b)
    expect(b.zones.some((z) => z.skillId === 'consecration')).toBe(true)
    find(b, 'lizard').hp = 0; find(b, 'lizard').alive = false   // the bearer falls
    advanceRound(b)
    expect(b.zones.some((z) => z.skillId === 'consecration')).toBe(false)
  })
})
