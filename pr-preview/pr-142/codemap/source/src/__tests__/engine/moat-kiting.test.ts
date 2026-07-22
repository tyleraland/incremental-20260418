// "The Moat" regression: a kiting archer separated from a short-range enemy by
// a CLIFF (blocks movement, not sight) should NOT flee from a threat that can't
// reach it across the gap (the old "flee into the wall and panic" bug), and
// should close straight to firing range and snipe over the cliff — rather than
// trying to path around an unreachable far side.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState, type Barrier } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

// A wide cliff band across mid-field — leaves only narrow, impassable gaps at
// the arena ends (so the far side is unreachable on foot), but cliffs don't
// block line of sight.
const MOAT: Barrier[] = [{ x: 1.5, y: 7, w: 12, h: 1.6, kind: 'cliff' }]

function moatBattle(): BattleState {
  // Instant, range 6. Moderate cooldown so the foe survives the test window —
  // this is a positioning test, not a DPS one (bolts now have a 1-round cooldown).
  const bow = { ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0, range: 6, cooldown: 8 }
  const b = createBattle({
    playerUnits: [eu({
      id: 'archer', spd: 18, str: 25, int: 5, def: 3, maxHp: 100, hp: 100,
      preferredRank: 'back', meleeRange: 1.2, rangedRange: 6, moveSpeed: 1.1,
      skills: [bow], tactics: [{ id: 'kiter', rank: 1 }],
    })],
    enemyUnits: [eu({
      id: 'p1', team: 'enemy', spd: 10, str: 14, def: 5, maxHp: 60, hp: 60,
      meleeRange: 1.2, rangedRange: 4, moveSpeed: 0.45,   // shorter range than the archer
    })],
    barriers: MOAT, maxRounds: 200,
  })
  find(b, 'archer').pos = { x: 7.5, y: 4 }    // player side of the cliff
  find(b, 'p1').pos = { x: 7.5, y: 11 }       // enemy side, directly across
  return b
}

describe('kiter across a cliff (The Moat)', () => {
  it('does not flee from a threat it is separated from; closes to firing range', () => {
    const b = moatBattle()
    const archer = find(b, 'archer')
    let maxRetreatY = 4   // fleeing would push the archer's y DOWN... no: away from enemy is up (toward y=0)
    let minY = 4
    for (let r = 0; r < 30; r++) {
      advanceRound(b)
      minY = Math.min(minY, archer.pos.y)
      maxRetreatY = Math.max(maxRetreatY, archer.pos.y)
    }
    // It advanced toward the cliff (y increased toward the enemy), never fled
    // back toward its own edge in a panic.
    expect(archer.pos.y).toBeGreaterThan(4)          // moved toward the enemy, not away
    expect(minY).toBeGreaterThanOrEqual(4 - 0.5)     // never retreated meaningfully
    expect(archer.pos.x).toBeCloseTo(7.5, 0)         // didn't flail to the side into the cliff
  })

  it('snipes the enemy across the cliff while taking no damage', () => {
    const b = moatBattle()
    for (let r = 0; r < 40; r++) advanceRound(b)
    expect(find(b, 'p1').hp).toBeLessThan(60)        // shots landed over the cliff
    expect(find(b, 'archer').hp).toBe(100)           // enemy never reached the archer
  })

  it('holds at kite range against the cliff, not jammed into it', () => {
    const b = moatBattle()
    for (let r = 0; r < 40; r++) advanceRound(b)
    const gap = dist(find(b, 'archer').pos, find(b, 'p1').pos)
    expect(gap).toBeLessThanOrEqual(6.5)             // within firing range
    expect(gap).toBeGreaterThan(3)                   // but holding a kite gap, not crammed at the edge
  })
})

// Regression (bsnap a159065…): a kiting archer LOCKED on a low-HP foe that is just
// past firing range stalled forever — the Kiter anchors on the NEAREST enemy, so
// it parked at kite distance from a different, nearer foe and never closed the last
// step onto the target it was committed to (skills sat idle, out of range). It must
// close on its locked target until it can actually fire.
describe('kiter locked on a foe past firing range (≠ the nearest)', () => {
  function stalledBattle(): BattleState {
    const bow = { ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0, range: 6, cooldown: 4 }
    const b = createBattle({
      playerUnits: [eu({
        id: 'archer', spd: 18, str: 25, int: 5, def: 3, maxHp: 100, hp: 100,
        preferredRank: 'back', meleeRange: 1.2, rangedRange: 6, moveSpeed: 1.1,
        skills: [bow], tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [
        // Lowest HP → the team focus / lock, but parked 7.4 away (out of range 6).
        eu({ id: 'prey', team: 'enemy', spd: 10, str: 10, def: 3, maxHp: 50, hp: 18, meleeRange: 1.2, rangedRange: 3, moveSpeed: 0 }),
        // Healthier, but at a comfortable kite distance (in range) — the Kiter's anchor.
        eu({ id: 'near', team: 'enemy', spd: 10, str: 10, def: 3, maxHp: 60, hp: 60, meleeRange: 1.2, rangedRange: 3, moveSpeed: 0 }),
      ],
      cols: 60, rows: 60,   // roomy field so the test positions aren't arena-clamped
      maxRounds: 200,
    })
    find(b, 'archer').pos = { x: 30, y: 30 }
    find(b, 'prey').pos   = { x: 30, y: 22.6 }   // 7.4 north — out of firing range
    find(b, 'near').pos   = { x: 35.5, y: 30 }   // 5.5 east  — within range, the nearest foe
    // Aggro committed to 'prey' (threat·1 − distance·1): even 7.4 away it out-scores
    // the nearer 'near', so the lock lands on the OUT-OF-RANGE foe — the stall setup.
    find(b, 'archer').threat = { prey: 50 }
    return b
  }

  it('closes onto the out-of-range locked target and opens fire (does not stall)', () => {
    const b = stalledBattle()
    const startPrey = find(b, 'prey').hp
    for (let r = 0; r < 30; r++) advanceRound(b)
    // It fired on SOMETHING (was idle/stuck before the fix) and specifically chipped
    // the low-HP prey it had committed to by closing into range.
    const enemyHp = find(b, 'prey').hp + find(b, 'near').hp
    expect(enemyHp).toBeLessThan(18 + 60)
    expect(find(b, 'prey').hp).toBeLessThan(startPrey)
  })
})
