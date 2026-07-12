// Disengage — wiring abandon-for-losing into a real break-off retreat
// (tactical-coordination.md §3.1/§3.4; BACKLOG §AI & coordination M1–M3
// follow-up). When the mutual-TTK re-price crosses ENGAGE_EXIT the plan drops
// the engagement AND publishes a `rout` (TeamPlan.rout); executeMovement's
// default layer reads it, runs the shared Retreater back-off, and drops the
// sticky lock — so the party visibly folds instead of "deciding to fold, then
// dying anyway". Dropping an engagement for "everything's dead" or "target
// unseen" must NOT rout. See teamplan.ts decideEngagement's tail + engine.ts
// executeMovement's rout branch / breakOff.
import { describe, it, expect } from 'vitest'
import { unzlibSync, strFromU8 } from 'fflate'
import {
  createBattle, advanceRound, addCombatant, serializeBattle, deserializeBattle,
  type BattleState,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const tokenJson = (token: string): string => {
  const body = token.split('.')[1]
  const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  return strFromU8(unzlibSync(bytes))
}
const PARTY = ['p1', 'p2', 'p3']
const centroidY = (b: BattleState, ids: string[]) => ids.reduce((s, id) => s + find(b, id).pos.y, 0) / ids.length

// A scholar party (clears ACUMEN.pull via p1's INT) that can actually run.
const scholars = (moveSpeed = 0.9) => [
  eu({ id: 'p1', str: 10, hp: 50, maxHp: 50, int: 60, moveSpeed }),
  eu({ id: 'p2', str: 10, hp: 50, maxHp: 50, moveSpeed }),
  eu({ id: 'p3', str: 10, hp: 50, maxHp: 50, moveSpeed }),
]

// Commit to a lone weak target sitting BELOW the party (so a break-off toward
// the player edge, -y, is unambiguously away from the camp).
function commitScenario(playerUnits = scholars()): BattleState {
  const b = createBattle({
    playerUnits,
    enemyUnits: [eu({ id: 'target', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 12 })],
    mode: 'encounter', cols: 60, rows: 60,
  })
  find(b, 'p1').pos = { x: 10, y: 18 }
  find(b, 'p2').pos = { x: 11, y: 18 }
  find(b, 'p3').pos = { x: 9, y: 18 }
  find(b, 'target').pos = { x: 10, y: 20 }
  advanceRound(b)   // commit round
  return b
}

// Flip the fight to a losing trade: six tanky grunts teleport in on the primary,
// already fighting a member (threat = a landed hit — the uninvited-join signal
// M2's re-anchor reads). The re-priced camp loses past ENGAGE_EXIT → abandon.
function reinforceToLosing(b: BattleState): void {
  for (let i = 0; i < 6; i++) {
    const g = addCombatant(
      b,
      { ...eu({ id: `g${i}`, name: 'Grunt', team: 'enemy', str: 10, hp: 400, maxHp: 400, moveSpeed: 0, visionRange: 12 }), team: 'enemy' },
      'enemy', undefined, { x: 10 + i * 0.3, y: 20.5 },
    )
    g.provoked = true
    find(b, 'p1').threat[g.id] = 5
  }
}

describe('disengage — losing the race breaks the line off', () => {
  it('publishes a rout, moves the party away from the camp, and drops locks', () => {
    const b = commitScenario()
    expect(b.plans.player!.engagement!.targetIds).toContain('target')

    reinforceToLosing(b)
    advanceRound(b)   // re-price loses → abandon → rout published + first flee step

    // A distinct, observable plan state — not merely engagement === null.
    expect(b.plans.player!.rout).toBeTruthy()
    expect('engagement' in b.plans.player!).toBe(false)

    const startY = centroidY(b, PARTY)
    const campY = centroidY(b, ['target', 'g0', 'g1', 'g2', 'g3', 'g4', 'g5'])
    const startDist = Math.abs(campY - startY)

    // Every member has dropped its sticky lock on the camp it's fleeing.
    for (const id of PARTY) expect(find(b, id).lockedTargetId).toBeNull()

    // Break off toward the party edge (-y) over the next few rounds.
    for (let r = 0; r < 4; r++) advanceRound(b)
    const endY = centroidY(b, PARTY)
    expect(endY).toBeLessThan(startY - 2)                 // moved toward its own edge
    expect(Math.abs(campY - endY)).toBeGreaterThan(startDist)   // ...away from the camp
    for (const id of PARTY) expect(find(b, id).lockedTargetId).toBeNull()
  })
})

describe('disengage — winning / unseen must NOT rout', () => {
  it('dropping the engagement because the camp is all dead re-engages, never routs', () => {
    const b = createBattle({
      playerUnits: scholars(),
      // 'near' is committed and killed; 'far' is a separate, still-affordable camp.
      enemyUnits: [
        eu({ id: 'near', team: 'enemy', str: 5, hp: 8, maxHp: 8, moveSpeed: 0, visionRange: 12 }),
        eu({ id: 'far', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 12 }),
      ],
      mode: 'encounter', cols: 60, rows: 60,
    })
    find(b, 'p1').pos = { x: 10, y: 19 }
    find(b, 'p2').pos = { x: 11, y: 19 }
    find(b, 'p3').pos = { x: 9, y: 19 }
    find(b, 'near').pos = { x: 10, y: 20 }
    find(b, 'far').pos = { x: 30, y: 20 }

    let sawRout = false
    let engagedFar = false
    for (let r = 0; r < 10; r++) {
      advanceRound(b)
      if (b.plans.player!.rout) sawRout = true
      if (b.plans.player!.engagement?.targetIds.includes('far')) engagedFar = true
    }
    expect(find(b, 'near').alive).toBe(false)   // we won that trade
    expect(sawRout).toBe(false)                 // ...so we never broke off
    expect(engagedFar).toBe(true)               // and pivoted to the next camp
    // The party advanced into the field, it did not flee toward its own edge.
    expect(centroidY(b, PARTY)).toBeGreaterThan(18)
  })
})

describe('disengage — hysteresis: no engage↔rout thrash', () => {
  it('once routing, the fled camp is not re-committed on the next decision rounds', () => {
    const b = commitScenario()
    reinforceToLosing(b)

    const hadEngagement: boolean[] = []
    const hadRout: boolean[] = []
    for (let r = 0; r < 10; r++) {
      advanceRound(b)
      hadEngagement.push('engagement' in b.plans.player!)
      hadRout.push(!!b.plans.player!.rout)
    }

    const firstRout = hadRout.indexOf(true)
    expect(firstRout).toBeGreaterThanOrEqual(0)
    // No round re-commits an engagement to the camp we just fled (the entry bar
    // is stricter than the exit bar it failed): engagement stays absent for the
    // rout window, so there is no rout→engagement flap.
    for (let r = firstRout; r < hadEngagement.length; r++) {
      expect(hadEngagement[r], `round idx ${r}`).toBe(false)
    }
  })
})

describe('disengage — snapshot fidelity', () => {
  it('a non-routing battle serializes with no rout field (legacy-absent ⇒ shipped)', () => {
    const b = commitScenario()
    expect(b.plans.player!.rout).toBeUndefined()
    const token = serializeBattle(b)
    expect(tokenJson(token)).not.toContain('"rout"')
    const reloaded = deserializeBattle(token)
    expect(reloaded.plans.player).toEqual(b.plans.player)
  })

  it('a mid-rout snapshot replays 1:1', () => {
    const b = commitScenario()
    reinforceToLosing(b)
    advanceRound(b)   // rout begins
    advanceRound(b)   // ...mid-flight
    expect(b.plans.player!.rout).toBeTruthy()   // sanity: we captured an active rout
    expect(tokenJson(serializeBattle(b))).toContain('"rout"')

    const token = serializeBattle(b)
    const reloaded = deserializeBattle(token)
    expect(reloaded.plans.player).toEqual(b.plans.player)

    for (let r = 0; r < 15; r++) { advanceRound(b); advanceRound(reloaded) }
    expect(reloaded.round).toBe(b.round)
    for (const c of b.combatants) {
      const rc = reloaded.combatants.find((x) => x.id === c.id)!
      expect(rc.pos).toEqual(c.pos)
      expect(rc.hp).toBe(c.hp)
      expect(rc.alive).toBe(c.alive)
      expect(rc.lockedTargetId).toBe(c.lockedTargetId)
    }
    expect(reloaded.plans.player).toEqual(b.plans.player)
  })
})

describe('disengage — the player lever still wins', () => {
  it('an equipped aggressive tactic closes on the camp while the default layer routs', () => {
    // p1 keeps an aggressive targeting lock (Tank Buster fires in evalTargeting,
    // above the avoid list) and dives on it (Charger) — the DEFAULT rout layer is
    // never reached for p1. p2/p3 have no lever and break off.
    const party = scholars()
    party[0].tactics = [{ id: 'tank-buster', rank: 1 }, { id: 'charger', rank: 1 }]
    const b = commitScenario(party)
    reinforceToLosing(b)
    advanceRound(b)   // rout published
    expect(b.plans.player!.rout).toBeTruthy()

    const p1Start = find(b, 'p1').pos.y
    const p2Start = find(b, 'p2').pos.y
    for (let r = 0; r < 3; r++) advanceRound(b)

    // p1 charged toward the camp (below, +y); p2 fled toward its own edge (-y).
    expect(find(b, 'p1').pos.y).toBeGreaterThan(p1Start)
    expect(find(b, 'p2').pos.y).toBeLessThan(p2Start)
    expect(find(b, 'p1').lockedTargetId).not.toBeNull()   // lever kept its lock
    expect(find(b, 'p2').lockedTargetId).toBeNull()        // default dropped it
  })
})
