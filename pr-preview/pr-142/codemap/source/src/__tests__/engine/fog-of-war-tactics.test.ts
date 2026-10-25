// Regression: open-world tactics must respect vision (fog-of-war). Captured from
// a live BSNAP where a party froze at the map edge, two units swapping the same
// two cells forever. Root cause: targeting tactics (enemiesOf) and movement
// tactics (visibleEnemiesOf) scanned the WHOLE map, ignoring visionRange. An AoE
// hero's Storm Caller locked a Nightshade cluster ~40 cells away (far beyond its
// vision of 10); that stale far lock kept it "engaged", which pinned the team
// roam waypoint to its own position at the edge, and its Guardian (also blind to
// range) body-blocked the squishy there — the two leapfrogged in place. The fix:
// enemiesOf / visibleEnemiesOf gate on visionRange like the default targeting
// does (no-op in encounters, where vision is Infinity).
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, serializeBattle, deserializeBattle, type BattleState } from '@/engine'
import { eu, attackSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

// An AoE skill so the hero qualifies for Storm Caller (which targets clusters).
const aoe = () => attackSkill({ id: 'hammer-fall', type: 'aoe', targeting: 'aoe_enemy', range: 2, aoeRadius: 1.8, cooldown: 4, damageFormula: 'str * 1' })

function edgeParty(): BattleState {
  const b = createBattle({
    playerUnits: [
      // Tanky AoE bruiser: Storm Caller (targeting) + Guardian (movement).
      eu({ id: 'tank', team: 'player', str: 40, def: 22, maxHp: 200, hp: 200, spd: 8, visionRange: 10,
        skills: [aoe()], tactics: [{ id: 'storm-caller', rank: 1 }, { id: 'guardian', rank: 1 }] }),
      // Squishy wanderer (the one Guardian protects).
      eu({ id: 'squish', team: 'player', def: 1, spd: 18, visionRange: 10 }),
    ],
    // A rooted cluster parked far away, well beyond the heroes' vision of 10.
    enemyUnits: [0, 1, 2, 3].map((i) => eu({ id: `mob${i}`, team: 'enemy', moveSpeed: 0, rangedRange: 4, maxHp: 50, hp: 50 })),
    mode: 'open', cols: 50, rows: 50,
  })
  find(b, 'tank').pos = { x: 32, y: 1.1 }
  find(b, 'squish').pos = { x: 32, y: 0 }
  find(b, 'mob0').pos = { x: 31, y: 40 }
  find(b, 'mob1').pos = { x: 33, y: 40 }
  find(b, 'mob2').pos = { x: 31, y: 42 }
  find(b, 'mob3').pos = { x: 33, y: 42 }
  return b
}

describe('open-world fog-of-war — tactics respect vision', () => {
  it('an AoE hero does not lock a cluster beyond its vision', () => {
    const b = edgeParty()
    advanceRound(b)
    // Storm Caller must stay idle while every enemy is out of sight → no lock.
    expect(find(b, 'tank').lockedTargetId).toBeNull()
  })

  it('the party leaves the edge instead of freezing/oscillating', () => {
    const b = edgeParty()
    const startTank = { ...find(b, 'tank').pos }
    let lastTank = { ...find(b, 'tank').pos }
    let tinySteps = 0
    for (let r = 0; r < 40; r++) {
      advanceRound(b)
      const p = find(b, 'tank').pos
      // a "stuck" round: it moved, but only a jittery fraction of a real step.
      const step = dist(p, lastTank)
      if (step > 0.001 && step < 0.2) tinySteps++
      lastTank = { ...p }
    }
    // Genuinely advanced toward the far cluster rather than churning in place.
    expect(dist(find(b, 'tank').pos, startTank)).toBeGreaterThan(15)
    expect(dist(find(b, 'squish').pos, startTank)).toBeGreaterThan(10)
    expect(tinySteps).toBeLessThan(5)
  })

  it('still engages once a foe is within sight', () => {
    const b = edgeParty()
    for (let r = 0; r < 80; r++) advanceRound(b)
    // Closed the distance and started killing the cluster.
    const enemyHp = b.combatants.filter((c) => c.team === 'enemy').reduce((s, c) => s + c.hp, 0)
    expect(enemyHp).toBeLessThan(200)
  })
})

describe('battle snapshot — visionRange round-trips', () => {
  // JSON has no Infinity; encounter units carry visionRange: Infinity. The codec
  // must restore it or a reloaded fight goes blind and diverges.
  it('Infinity vision survives serialize → deserialize', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: Infinity })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    const back = deserializeBattle(serializeBattle(b))
    expect(find(back, 'p').visionRange).toBe(Infinity)
  })
})
