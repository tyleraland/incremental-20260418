// LoS-aware kiting (BACKLOG: "LoS-aware positioning"):
// a kiter shouldn't sit "in range" while a wall blocks the shot — it has to
// relocate around terrain to re-open line of sight, then fire.
//
// Map: a 15×15 arena with a solid 9×9 block in the centre — four narrow halls
// (~3-wide corridors) form a square ring around the perimeter. A fast archer
// kites a very slow, very defensive monster. The monster is effectively
// unkillable for the test window, so a stalled archer would eventually be
// caught and slowly chewed down; only a kiter that routes around the wall
// keeps a clear shot AND keeps its distance.

import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill,
  type BattleState, type Barrier,
} from '@/engine'
import { sightlineClear } from '@/engine/barriers'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const HALL_BARRIERS: Barrier[] = [{ x: 3, y: 3, w: 9, h: 9, kind: 'wall' }]

describe('kiter: LoS-aware positioning', () => {
  it('relocates to gain line of sight when a wall blocks the shot', () => {
    // Archer in the top hall; monster across the centre block in the right
    // hall. d ≈ 8.5 (well within ranged range) but LoS is broken. A
    // LoS-blind kiter would stand still; the LoS-aware one routes to a
    // corner that re-opens the shot.
    const bow = buildEngineSkill('fire-bolt', 1)!
    const b = createBattle({
      playerUnits: [eu({
        id: 'archer', spd: 20, str: 30, int: 20, def: 1, maxHp: 100, hp: 100,
        preferredRank: 'back', meleeRange: 1.2, rangedRange: 6, moveSpeed: 1.3,
        skills: [{ ...bow, range: 6 }],
        tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [eu({
        id: 'monster', team: 'enemy', spd: 1, str: 1, def: 200, int: 200,
        maxHp: 500, hp: 500, meleeRange: 1.2, rangedRange: 0, moveSpeed: 0.58,
      })],
      barriers: HALL_BARRIERS,
      maxRounds: 100,
    })
    find(b, 'archer').pos = { x: 7.5, y: 1.5 }    // top hall, middle
    find(b, 'monster').pos = { x: 13.5, y: 7.5 }  // right hall, middle

    // sanity: LoS really is broken from the start.
    expect(sightlineClear({ x: 7.5, y: 1.5 }, { x: 13.5, y: 7.5 }, b.barriers)).toBe(false)

    const archerStart = { ...find(b, 'archer').pos }
    for (let i = 0; i < 30 && b.outcome === 'ongoing'; i++) advanceRound(b)

    const archer = find(b, 'archer')
    // moved off its starting tile (didn't just sit there blocked)
    const moved = Math.hypot(archer.pos.x - archerStart.x, archer.pos.y - archerStart.y)
    expect(moved).toBeGreaterThan(2)
    // and found LoS, fired the bow, and chipped the monster.
    expect(b.events.some((e) => e.type === 'skill_use' && e.sourceId === 'archer')).toBe(true)
    expect(find(b, 'monster').hp).toBeLessThan(500)
  })

  it('a fast archer kites a slow defensive chaser around the perimeter without being caught', () => {
    // Diagonal corners, monster effectively unkillable for the test window
    // (high DEF blocks basic attacks, high INT blocks fire-bolt). A working
    // kiter has to lap the ring; a broken one stalls at a wall and gets
    // chewed down.
    const bow = buildEngineSkill('fire-bolt', 1)!
    const b = createBattle({
      playerUnits: [eu({
        id: 'archer', spd: 20, str: 30, int: 20, def: 1, maxHp: 100, hp: 100,
        preferredRank: 'back', meleeRange: 1.2, rangedRange: 6, moveSpeed: 1.3,
        skills: [{ ...bow, range: 6 }],
        tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [eu({
        id: 'monster', team: 'enemy', spd: 1, str: 4, def: 200, int: 200,
        maxHp: 500, hp: 500, meleeRange: 1.2, rangedRange: 0, moveSpeed: 0.58,
      })],
      barriers: HALL_BARRIERS,
      // generous cap so the test terminates even if the chase goes long
      maxRounds: 300,
    })
    find(b, 'archer').pos = { x: 1.5, y: 1.5 }      // top-left corner
    find(b, 'monster').pos = { x: 13.5, y: 13.5 }   // bottom-right (diagonal)

    let closestApproach = Infinity
    let firedShots = 0
    for (let i = 0; i < 250 && b.outcome === 'ongoing'; i++) {
      advanceRound(b)
      const a = find(b, 'archer'), m = find(b, 'monster')
      if (!a.alive) break
      const d = Math.hypot(a.pos.x - m.pos.x, a.pos.y - m.pos.y)
      if (d < closestApproach) closestApproach = d
      firedShots += b.events.filter((e) => e.round === b.round && e.type === 'skill_use' && e.sourceId === 'archer').length
    }

    const archer = find(b, 'archer')
    const monster = find(b, 'monster')
    expect(archer.alive).toBe(true)                       // survived the chase
    expect(firedShots).toBeGreaterThan(5)                 // kept finding LoS to fire
    expect(monster.hp).toBeLessThan(500)                  // dinged the monster
    expect(closestApproach).toBeGreaterThan(archer.meleeRange + 1)  // never let it close to melee
  })

  it('cornered against the central wall, routes around it instead of pinning', () => {
    // Archer pinned at the left wall in the top hall; threat approaches along
    // the same hall from the east. The "back further west" direction is dead
    // (outer wall), so a naive kiter just sits there. A perimeter-aware kiter
    // recognises the inner wall is blocking real retreat and routes south
    // through the left hall (around the central block) to keep distance.
    const bow = buildEngineSkill('fire-bolt', 1)!
    const b = createBattle({
      playerUnits: [eu({
        id: 'archer', spd: 20, str: 30, int: 20, def: 1, maxHp: 200, hp: 200,
        preferredRank: 'back', meleeRange: 1.2, rangedRange: 6, moveSpeed: 1.3,
        skills: [{ ...bow, range: 6 }],
        tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [eu({
        id: 'monster', team: 'enemy', spd: 5, str: 50, def: 1, int: 1,
        maxHp: 999, hp: 999, meleeRange: 1.2, rangedRange: 0, moveSpeed: 0.8,
      })],
      barriers: HALL_BARRIERS,
      maxRounds: 60,
    })
    find(b, 'archer').pos = { x: 0.4, y: 1.5 }     // top-left corner of top hall, jammed at the wall
    find(b, 'monster').pos = { x: 5.5, y: 1.5 }    // approaching from the east along the top hall

    const startPos = { ...find(b, 'archer').pos }
    let closestApproach = Infinity
    let maxDisplacement = 0
    for (let i = 0; i < 40 && b.outcome === 'ongoing'; i++) {
      advanceRound(b)
      const a = find(b, 'archer'), m = find(b, 'monster')
      closestApproach = Math.min(closestApproach, Math.hypot(a.pos.x - m.pos.x, a.pos.y - m.pos.y))
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(a.pos.x - startPos.x, a.pos.y - startPos.y))
    }

    const archer = find(b, 'archer')
    // The archer left the corner (perimeter-routed at least several grid units
    // from its starting tile — exact endpoint depends on how far it laps).
    expect(maxDisplacement).toBeGreaterThan(5)
    // And survived: didn't just sit there getting chewed down.
    expect(archer.alive).toBe(true)
    expect(archer.hp).toBeGreaterThan(50)
    // Threat never reached melee (would happen if the archer was pinned).
    expect(closestApproach).toBeGreaterThan(archer.meleeRange + 0.5)
  })
})
