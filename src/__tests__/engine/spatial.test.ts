// Spatial movement primitives (§spatial): flank to a target's weak side, kite to
// keep range, guard a squishy ally, regroup when isolated. Helpers are pure;
// the movement behaviours are checked through a real round.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { distance } from '@/engine/grid'
import { flankPoint, guardPoint, squishiestAlly, centroid } from '@/engine/spatial'
import { eu, combatant } from './helpers'

const stateOf = (cs: ReturnType<typeof combatant>[]) => ({ combatants: cs } as unknown as BattleState)
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('spatial queries', () => {
  it('flankPoint aims at the side of the target away from its allies', () => {
    const self = combatant({ id: 'p', team: 'player', pos: { x: 2.5, y: 1 } })
    const back = combatant({ id: 'back', team: 'enemy', pos: { x: 2.5, y: 9 } })   // enemy backliner
    const front = combatant({ id: 'front', team: 'enemy', pos: { x: 2.5, y: 7 } }) // its frontline ally
    const fp = flankPoint(self, back, stateOf([self, back, front]), 1)
    expect(fp.y).toBeGreaterThan(back.pos.y)   // behind the backliner, toward the enemy edge
    expect(fp.x).toBeCloseTo(2.5)
  })

  it('guardPoint sits between the ally and the threat', () => {
    const ally = combatant({ id: 'a', pos: { x: 2.5, y: 2 } })
    const threat = combatant({ id: 't', team: 'enemy', pos: { x: 2.5, y: 8 } })
    const gp = guardPoint(ally, threat, 1)
    expect(gp.y).toBeGreaterThan(ally.pos.y)
    expect(gp.y).toBeLessThan(threat.pos.y)
  })

  it('squishiestAlly picks the lowest-defense teammate (not self)', () => {
    const self = combatant({ id: 'p', def: 10 })
    const tank = combatant({ id: 'tank', def: 20 })
    const mage = combatant({ id: 'mage', def: 2 })
    expect(squishiestAlly(self, stateOf([self, tank, mage]))!.id).toBe('mage')
  })

  it('centroid averages positions', () => {
    const c = centroid([combatant({ id: 'a', pos: { x: 0, y: 0 } }), combatant({ id: 'b', pos: { x: 4, y: 2 } })])
    expect(c).toEqual({ x: 2, y: 1 })
  })
})

describe('movement behaviours', () => {
  it('Kiter backs off when the target gets too close', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'r', rangedRange: 4, maxHp: 500, hp: 500, tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 5, maxHp: 500, hp: 500 })],
    })
    find(b, 'r').pos = { x: 2.5, y: 5 }
    find(b, 'e').pos = { x: 2.5, y: 5.8 }   // well inside the kite range
    advanceRound(b)
    expect(find(b, 'r').pos.y).toBeLessThan(5)   // retreated toward its own edge
  })

  it('Flanker routes toward the locked target\'s rear', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 30, tactics: [{ id: 'flanker', rank: 1 }] })],
      enemyUnits: [eu({ id: 'front', team: 'enemy' }), eu({ id: 'back', team: 'enemy' })],
    })
    find(b, 'front').pos = { x: 2.5, y: 7 }
    find(b, 'back').pos = { x: 2.5, y: 9 }
    const p = find(b, 'p'); p.pos = { x: 2.5, y: 5 }; p.lockedTargetId = 'back'
    advanceRound(b)
    expect(find(b, 'p').pos.y).toBeGreaterThan(5)   // circling toward the backliner's far side
  })

  it('Guardian steps toward the threat side of its squishy ally', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'g', def: 20, tactics: [{ id: 'guardian', rank: 1 }] }), eu({ id: 'mage', def: 2 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    find(b, 'g').pos = { x: 1, y: 2 }
    find(b, 'mage').pos = { x: 2.5, y: 2 }
    find(b, 'e').pos = { x: 2.5, y: 8 }
    advanceRound(b)
    expect(find(b, 'g').pos.y).toBeGreaterThan(2)   // moved up to interpose
  })

  it('a Kiter pinned at the wall arcs along it instead of pinning into a corner', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'r', rangedRange: 4, maxHp: 999, hp: 999, tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 5, maxHp: 999, hp: 999 })],
    })
    find(b, 'r').pos = { x: 0.5, y: 7.5 }   // pressed against the left wall
    find(b, 'e').pos = { x: 3, y: 7.5 }     // threat to the right, well inside kite range
    const startY = find(b, 'r').pos.y
    for (let i = 0; i < 5; i++) advanceRound(b)
    const r = find(b, 'r')
    expect(Math.abs(r.pos.y - startY)).toBeGreaterThan(0.5)   // moved tangentially along the wall, didn't freeze
  })

  it('a faster Kiter ranged unit opens distance on a slower attacker', () => {
    // Mira-style: high spd + ranged + kiter. Pursuer is melee and slower.
    const fb = buildEngineSkill('fire-bolt', 1)!
    const b = createBattle({
      playerUnits: [eu({ id: 'r', spd: 18, int: 20, rangedRange: 4, maxHp: 999, hp: 999, skills: [fb], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', spd: 5, str: 10, maxHp: 999, hp: 999 })],
    })
    find(b, 'r').pos = { x: 7, y: 6 }
    find(b, 'e').pos = { x: 7, y: 8.5 }                // melee distance, threatening
    const startGap = Math.hypot(0, 8.5 - 6)
    for (let i = 0; i < 6; i++) advanceRound(b)
    const r = find(b, 'r'), e = find(b, 'e')
    const endGap = Math.hypot(r.pos.x - e.pos.x, r.pos.y - e.pos.y)
    expect(endGap).toBeGreaterThan(startGap)            // the kiter opened ground on the slower foe
    expect(b.events.some((ev) => ev.type === 'skill_use' && ev.skillId === 'fire-bolt')).toBe(true)
  })

  it('a Kiter caster holds at spell range and casts instead of closing to melee', () => {
    const fireBolt = buildEngineSkill('fire-bolt', 1)!   // range 6
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 4, maxHp: 500, hp: 500, skills: [fireBolt], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 10, maxHp: 500, hp: 500 })],
    })
    for (let i = 0; i < 8; i++) advanceRound(b)
    const mage = find(b, 'mage'), e = find(b, 'e')
    expect(Math.hypot(mage.pos.x - e.pos.x, mage.pos.y - e.pos.y)).toBeGreaterThan(3)   // never dragged into melee
    expect(b.events.some((ev) => ev.type === 'skill_use' && ev.skillId === 'fire-bolt')).toBe(true)   // it actually cast
  })

  it('Regroup pulls an isolated unit back toward its allies', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', tactics: [{ id: 'regroup', rank: 1 }] }), eu({ id: 'b1' }), eu({ id: 'b2' })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    find(b, 'a').pos = { x: 0, y: 0 }
    find(b, 'b1').pos = { x: 2.5, y: 2 }
    find(b, 'b2').pos = { x: 3, y: 2 }
    advanceRound(b)
    expect(distance(find(b, 'a').pos, { x: 2.75, y: 2 })).toBeLessThan(3)   // closed on the group's center
  })
})
