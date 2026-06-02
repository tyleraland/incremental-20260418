// Firewall (§firewall): a 3-wide oriented line of flame that bounces foes who
// try to cross it (knockback + burn) until they've bumped it `maxBumps` times,
// then lets them through. Allies pass freely (no friendly fire). A kiting tool —
// the skill tactic raises it between the caster and an approaching chaser.
// (Bounce + burn on contact is also covered in skills.test.ts.)
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState, type FireWall } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// A horizontal wall at y=6 that blocks the enemy team (normal points +y).
const wallAt = (y: number, over: Partial<FireWall> = {}): FireWall => ({
  id: 'w', sourceId: 'p', blockTeam: 'enemy', pos: { x: 7.5, y }, normal: { x: 0, y: 1 },
  half: 1.5, fireDamage: 12, maxBumps: 5, roundsLeft: 999, bumps: {}, ...over,
})

describe('firewall', () => {
  it('lets an ally walk through unharmed (no friendly fire)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'ally', str: 12, spd: 10, maxHp: 400, hp: 400, meleeRange: 1.2, moveSpeed: 1.0 })],
      enemyUnits: [eu({ id: 'target', team: 'enemy', def: 30, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    find(b, 'ally').pos = { x: 7.5, y: 3 }       // near side, charges the target across the wall
    find(b, 'target').pos = { x: 7.5, y: 11 }    // far side
    find(b, 'target').provoked = false            // stays put so the ally has to cross to reach it
    b.firewalls.push(wallAt(6))

    let allyMaxY = -Infinity, allyBurned = false
    for (let i = 0; i < 12; i++) {
      advanceRound(b)
      allyMaxY = Math.max(allyMaxY, find(b, 'ally').pos.y)
      if (b.events.some((e) => e.round === b.round && e.type === 'dot' && e.targetId === 'ally')) allyBurned = true
    }
    expect(allyMaxY).toBeGreaterThan(8)   // walked all the way through the flame to the far side
    expect(allyBurned).toBe(false)        // took no burn — it's the caster's own wall
  })

  it('a foe breaks through after bumping maxBumps times', () => {
    const b = createBattle({
      // A ranged kiter bait that flees south, so the foe has to chase it *across*
      // the wall instead of meeting it on the near side.
      playerUnits: [eu({ id: 'bait', int: 10, spd: 6, rangedRange: 6, maxHp: 999, hp: 999, moveSpeed: 0.6, tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 8, def: 50, spd: 8, maxHp: 999, hp: 999, meleeRange: 1.2, moveSpeed: 1.1 })],
    })
    find(b, 'bait').pos = { x: 7.5, y: 3 }
    find(b, 'foe').pos = { x: 7.5, y: 8 }
    b.firewalls.push(wallAt(6, { maxBumps: 3 }))

    let crossedRound = 0
    for (let i = 0; i < 24 && !crossedRound; i++) {
      advanceRound(b)
      if (find(b, 'foe').pos.y < 6) crossedRound = b.round   // reached the caster's side
    }
    expect(crossedRound).toBeGreaterThan(0)                          // it does eventually break through
    expect(b.firewalls[0].bumps['foe']).toBeGreaterThanOrEqual(3)    // but only after maxBumps bumps
  })

  it('a Kiter mage raises a firewall between itself and an approaching chaser', () => {
    const b = createBattle({
      playerUnits: [eu({
        id: 'mage', int: 24, str: 2, spd: 12, rangedRange: 6, maxHp: 200, hp: 200, moveSpeed: 0.95,
        skills: [buildEngineSkill('firewall', 3)!], tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 16, spd: 8, maxHp: 600, hp: 600, meleeRange: 1.2, moveSpeed: 0.7 })],
    })
    find(b, 'mage').pos = { x: 7.5, y: 4 }
    find(b, 'e').pos = { x: 7.5, y: 10 }       // charging up the board at the mage
    let raised = false
    for (let i = 0; i < 12 && !raised; i++) { advanceRound(b); raised = b.firewalls.length > 0 }
    expect(raised).toBe(true)
    // the wall sits on the caster→foe line, between them
    const w = b.firewalls[0], mage = find(b, 'mage'), e = find(b, 'e')
    expect(w.pos.y).toBeGreaterThan(Math.min(mage.pos.y, e.pos.y))
    expect(w.pos.y).toBeLessThan(Math.max(mage.pos.y, e.pos.y))
  })
})
