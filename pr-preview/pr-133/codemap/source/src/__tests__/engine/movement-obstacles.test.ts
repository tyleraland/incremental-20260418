// Movement tactics vs terrain: the spatial channel (flanker / guardian /
// retreater) and basic chase routing must respect walls and cliffs — route
// around them, slide along them, never tunnel through, never pin in a corner.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, resolve, pointBlocked,
  type BattleState, type Barrier,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('Flanker vs a wall', () => {
  it('routes around a wall to reach the far-side target instead of pinning against it', () => {
    // Vertical wall x∈[5,6], y∈[0,9] with an opening above y9. Flanker on the
    // left, target (and its ally) on the right → the flank is across the wall.
    const wall: Barrier[] = [{ x: 5, y: 0, w: 1, h: 9, kind: 'wall' }]
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 30, spd: 16, moveSpeed: 1.3, maxHp: 999, hp: 999, meleeRange: 1.2, tactics: [{ id: 'flanker', rank: 1 }] })],
      enemyUnits: [
        eu({ id: 'back', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, moveSpeed: 0 }),
        eu({ id: 'front', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, moveSpeed: 0 }),
      ],
      barriers: wall,
    })
    find(b, 'p').pos = { x: 2, y: 4 }
    find(b, 'back').pos = { x: 9, y: 4 }
    find(b, 'front').pos = { x: 9, y: 2 }

    let everBlocked = false
    for (let i = 0; i < 40 && b.outcome === 'ongoing'; i++) {
      advanceRound(b)
      if (pointBlocked(wall, find(b, 'p').pos)) everBlocked = true
    }
    expect(everBlocked).toBe(false)                 // never tunneled into the wall
    expect(find(b, 'p').pos.x).toBeGreaterThan(6)   // got to the far side
    expect(Math.min(find(b, 'back').hp, find(b, 'front').hp)).toBeLessThan(999)   // reached and struck
  })
})

describe('Guardian vs a wall', () => {
  it('keeps interposing without ever standing inside a wall sitting on its guard spot', () => {
    // A wall covers the exact point between the ally and the threat; the guardian
    // must settle for a valid spot, not pin inside the wall.
    const wall: Barrier[] = [{ x: 1.5, y: 2.8, w: 2, h: 0.8, kind: 'wall' }]
    const b = createBattle({
      playerUnits: [
        eu({ id: 'g', def: 30, str: 8, maxHp: 600, hp: 600, meleeRange: 1.2, tactics: [{ id: 'guardian', rank: 1 }] }),
        eu({ id: 'ally', def: 2, str: 2, rangedRange: 6, maxHp: 100, hp: 100, moveSpeed: 0 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, str: 10, maxHp: 999, hp: 999, meleeRange: 1.2, moveSpeed: 0.9 })],
      barriers: wall,
    })
    find(b, 'g').pos = { x: 2.5, y: 5 }
    find(b, 'ally').pos = { x: 2.5, y: 2 }     // guard spot ≈ (2.5, 3.1) — inside the wall band
    find(b, 'e').pos = { x: 2.5, y: 11 }

    let everBlocked = false
    for (let i = 0; i < 16; i++) {
      advanceRound(b)
      if (pointBlocked(wall, find(b, 'g').pos)) everBlocked = true
    }
    const g = find(b, 'g')
    expect(everBlocked).toBe(false)                 // never stood in the wall
    expect(g.alive).toBe(true)
    expect(g.pos.y).toBeGreaterThan(find(b, 'ally').pos.y)   // still interposed on the threat side of its ally
  })
})

describe('Retreater vs a wall', () => {
  it('slides along the edge toward the party instead of freezing in the corner', () => {
    // Badly hurt player retreater jammed against the bottom edge (its own-edge
    // retreat direction is straight into the wall). An ally to the east gives
    // the cohesion bias a way out → it should slide east along the wall.
    const b = createBattle({
      playerUnits: [
        eu({ id: 'p', str: 5, hp: 8, maxHp: 100, meleeRange: 1.2, tactics: [{ id: 'retreater', rank: 1 }] }),
        eu({ id: 'mate', maxHp: 200, hp: 200, moveSpeed: 0 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 10, meleeRange: 1.2, moveSpeed: 0 })],
    })
    find(b, 'p').pos = { x: 5, y: 0.4 }     // pressed against the bottom edge
    find(b, 'mate').pos = { x: 10, y: 0.4 } // party is to the east
    find(b, 'e').pos = { x: 5, y: 5 }
    const start = { ...find(b, 'p').pos }
    advanceRound(b)
    const p = find(b, 'p')
    expect(p.pos.y).toBeGreaterThanOrEqual(0)              // didn't tunnel through the bottom
    expect(p.pos.x).toBeGreaterThan(start.x)               // slid east toward the party
    expect(p.tacticsUsed).toContain('retreater')           // the disengage actually fired
  })
})

describe('Cliffs block movement (like walls) even though they pass line of sight', () => {
  it('a chaser routes around a cliff block to reach its quarry', () => {
    const r = resolve({
      playerUnits: [eu({ id: 'p', str: 60, maxHp: 500, hp: 500 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 1, maxHp: 20, hp: 20, meleeRange: 99 })],
      barriers: [{ x: 3, y: 6, w: 9, h: 3, kind: 'cliff' }],   // a ravine straight across the field
    })
    expect(r.outcome).toBe('victory')                         // got around it and won
    expect(r.units.find((u) => u.id === 'e')!.alive).toBe(false)
    expect(r.rounds).toBeGreaterThan(1)                       // the detour took time
  })
})
