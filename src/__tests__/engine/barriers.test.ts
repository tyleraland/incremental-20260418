// Terrain / barriers (§2): collision for movement (slide along) and knockback
// (stop against, never through), plus navigation around the default arena cross.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, resolve, buildEngineSkill, arenaBarriers,
  pointBlocked, traceMove, slideMove, type BattleState,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const wall = [{ x: 10, y: 10, w: 4, h: 4 }]   // blocks x∈[10,14], y∈[10,14]

describe('barrier collision helpers', () => {
  it('pointBlocked reports interior vs open ground', () => {
    expect(pointBlocked(wall, { x: 12, y: 12 })).toBe(true)
    expect(pointBlocked(wall, { x: 2, y: 2 })).toBe(false)
  })

  it('traceMove stops up against a wall, never through it', () => {
    const end = traceMove({ x: 12, y: 5 }, { x: 12, y: 20 }, wall)   // straight up into the wall
    expect(end.y).toBeLessThan(10)            // halted before the wall
    expect(pointBlocked(wall, end)).toBe(false)
  })

  it('slideMove slides along a wall instead of stalling', () => {
    const from = { x: 12, y: 9.6 }            // pressed against the wall's lower edge
    const out = slideMove(from, { x: 12, y: 11 }, wall)   // pushing straight into it
    expect(Math.hypot(out.x - from.x, out.y - from.y)).toBeGreaterThan(0.1)   // it moved
    expect(pointBlocked(wall, out)).toBe(false)
  })
})

describe('barriers in combat', () => {
  it('knockback shoves a target up against a wall but not through it', () => {
    const as = { ...buildEngineSkill('arrow-shower', 1)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 20, skills: [as] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, maxHp: 500, hp: 500, meleeRange: 99 })],
      barriers: [{ x: 0, y: 11, w: 15, h: 1 }],   // a wall across the field at y∈[11,12]
    })
    find(b, 'p').pos = { x: 7, y: 6 }
    find(b, 'e').pos = { x: 7, y: 9.5 }
    advanceRound(b)
    const e = find(b, 'e')
    expect(e.pos.y).toBeGreaterThan(9.5)   // got shoved back
    expect(e.pos.y).toBeLessThan(11)      // stopped against the wall, not pushed through it
  })

  it('a unit routes around the central cross to reach its target', () => {
    const r = resolve({
      playerUnits: [eu({ id: 'p', str: 60, maxHp: 500, hp: 500 })],
      // enemy holds position (huge reach) so this isolates pathing, not a chase
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 1, maxHp: 20, hp: 20, meleeRange: 99 })],
      barriers: arenaBarriers(),
    })
    expect(r.outcome).toBe('victory')               // rounded the corners and got there
    expect(r.units.find((u) => u.id === 'e')!.alive).toBe(false)
    expect(r.rounds).toBeGreaterThan(1)
  })
})
