// Terrain / barriers (§2): collision for movement (slide along) and knockback
// (stop against, never through), plus navigation around the default arena cross.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, resolve, buildEngineSkill, arenaBarriers,
  pointBlocked, traceMove, slideMove, type BattleState,
} from '@/engine'
import { sightlineClear, lineClear } from '@/engine/barriers'
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

  it('a unit wedged INSIDE a barrier escapes instead of freezing', () => {
    // Regression (Lyra stuck on a cliff): a crowded push can leave a unit inside
    // terrain; traceMove then samples from an interior point, reads every step as
    // blocked, and returns `from` forever. slideMove must pop it back out.
    const from = { x: 12, y: 12 }                 // dead inside the wall
    expect(pointBlocked(wall, from)).toBe(true)
    const out = slideMove(from, { x: 12, y: 11 }, wall)
    expect(pointBlocked(wall, out)).toBe(false)   // popped out of the terrain
  })

  it('a combatant that ends up inside terrain walks out within a round', () => {
    const cliff = [{ x: 10, y: 10, w: 4, h: 4, kind: 'cliff' as const }]
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', visionRange: 8 })],
      mode: 'open', cols: 30, rows: 30, barriers: cliff,
    })
    find(b, 'p').pos = { x: 12, y: 12 }            // wedged inside the cliff
    expect(pointBlocked(cliff, find(b, 'p').pos)).toBe(true)
    advanceRound(b)
    expect(pointBlocked(cliff, find(b, 'p').pos)).toBe(false)   // escaped, not frozen
  })

  it('slideMove honors a tiny unobstructed step instead of a spurious cardinal hop', () => {
    // No wall in the way: a sub-0.05 intended move must land exactly on `desired`,
    // not get diverted into a fixed 0.05 cardinal "slide". Regression: that kick
    // made a moveSpeed-0 unit (0-length move) creep due east 0.05/round and made a
    // melee attacker shuffle sideways at the rim of its reach instead of stepping in.
    const from = { x: 5, y: 5 }
    const tiny = slideMove(from, { x: 5.03, y: 5.04 }, [])   // 0.05-long move, open ground
    expect(tiny.x).toBeCloseTo(5.03, 5)
    expect(tiny.y).toBeCloseTo(5.04, 5)

    const hold = slideMove(from, { ...from }, [])            // 0-length move, open ground
    expect(hold.x).toBeCloseTo(5, 5)                         // stays put — no eastward drift
    expect(hold.y).toBeCloseTo(5, 5)
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

  it('walls block ranged targeting; cliffs do not', () => {
    const wallTerrain  = [{ x: 6, y: 7, w: 3, h: 1, kind: 'wall'  as const }]
    const cliffTerrain = [{ x: 6, y: 7, w: 3, h: 1, kind: 'cliff' as const }]
    const from = { x: 7.5, y: 4 }, to = { x: 7.5, y: 10 }
    // movement (lineClear) sees both as obstacles
    expect(lineClear(from, to, wallTerrain)).toBe(false)
    expect(lineClear(from, to, cliffTerrain)).toBe(false)
    // line of sight only blocked by walls
    expect(sightlineClear(from, to, wallTerrain)).toBe(false)
    expect(sightlineClear(from, to, cliffTerrain)).toBe(true)
  })

  it('a caster cannot fire through a wall (but can over a cliff)', () => {
    const fb = { ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }   // instant for the assertion
    const mk = (kind: 'wall' | 'cliff') => {
      const b = createBattle({
        playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 6, skills: [fb] })],
        enemyUnits: [eu({ id: 'foe', team: 'enemy', def: 0, maxHp: 999, hp: 999, meleeRange: 99 })],
        barriers: [{ x: 6, y: 7, w: 3, h: 1, kind }],
      })
      b.combatants.find((c) => c.id === 'mage')!.pos = { x: 7.5, y: 4 }
      b.combatants.find((c) => c.id === 'foe')!.pos  = { x: 7.5, y: 10 }
      advanceRound(b)
      return b
    }
    const wall  = mk('wall')
    const cliff = mk('cliff')
    expect(wall.events.some((e) => e.type === 'skill_use' && e.skillId === 'fire-bolt')).toBe(false)
    expect(cliff.events.some((e) => e.type === 'skill_use' && e.skillId === 'fire-bolt')).toBe(true)
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
