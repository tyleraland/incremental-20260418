// M3 of movement-action-coupling.md: priced routes. exposureAt/corridorExposure
// put a number on "how much HP does standing here / walking this corridor
// cost", and the travel-avoid escalation uses it: plow when affordable,
// CLEAR-FIRST (stop marching, fight the wall down) when it isn't.
import { describe, it, expect } from 'vitest'
import {
  exposureAt, corridorExposure, createBattle, advanceRound, issueMoveOrder,
  serializeBattle, deserializeBattle, distance,
  type BattleState, type Combatant, type Barrier,
} from '@/engine'
import { combatant, eu } from './helpers'

const stateOf = (combatants: Combatant[], barriers: Barrier[] = []) =>
  ({ combatants, barriers } as unknown as BattleState)
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('exposureAt', () => {
  const self = () => combatant({ id: 'p', pos: { x: 0.5, y: 0 }, def: 4 })

  it('prices a stationary ranged threat as a crisp reach disc', () => {
    const foe = combatant({ id: 'e', team: 'enemy', str: 20, rangedRange: 4, pos: { x: 10, y: 10 } })
    const st = stateOf([self(), foe])
    expect(exposureAt(st, st.combatants[0], { x: 10, y: 13 })).toBeGreaterThan(10)   // inside reach 4
    expect(exposureAt(st, st.combatants[0], { x: 10, y: 15 })).toBe(0)               // outside
  })

  it('a wall blocks a ranged threat; an unprovoked one never counts', () => {
    const wall: Barrier = { x: 8, y: 11, w: 4, h: 1, kind: 'wall' }
    const foe = combatant({ id: 'e', team: 'enemy', str: 20, rangedRange: 4, pos: { x: 10, y: 10 } })
    const st = stateOf([self(), foe], [wall])
    expect(exposureAt(st, st.combatants[0], { x: 10, y: 13 })).toBe(0)   // shot blocked by the wall
    const calm = combatant({ id: 'e', team: 'enemy', str: 20, rangedRange: 4, pos: { x: 10, y: 10 }, provoked: false })
    const st2 = stateOf([self(), calm])
    expect(exposureAt(st2, st2.combatants[0], { x: 10, y: 13 })).toBe(0)   // milling, not hunting
  })

  it('an in-reach threat is never free (the 1-damage floor)', () => {
    const chipper = combatant({ id: 'e', team: 'enemy', str: 1, rangedRange: 4, pos: { x: 10, y: 10 } })
    const st = stateOf([self(), chipper])
    expect(exposureAt(st, st.combatants[0], { x: 10, y: 12 })).toBeGreaterThanOrEqual(1)
  })

  it("a pure healer threatens only its melee poke, not its heal range", () => {
    // Reach must come from OFFENSIVE options — castRange's utility fallback
    // priced a healer as a threat disc the size of its heal range.
    const healer = combatant({
      id: 'h', team: 'enemy', str: 5, int: 20, rangedRange: 0, pos: { x: 10, y: 10 },
      skills: [{ id: 'mend', name: 'Mend', type: 'heal', targeting: 'single_ally', range: 5, aoeRadius: 0, cooldown: 2, channelTime: 0, damageFormula: '', healFormula: 'int * 2', slot: 'primary' }],
    })
    const st = stateOf([self(), healer])
    expect(exposureAt(st, st.combatants[0], { x: 10, y: 13 })).toBe(0)                    // inside heal range, outside melee
    expect(exposureAt(st, st.combatants[0], { x: 10, y: 11 })).toBeGreaterThanOrEqual(1)  // melee poke is real
  })
})

describe('corridorExposure', () => {
  it('a corridor through a ring costs; the open field is free', () => {
    const me = combatant({ id: 'p', pos: { x: 2, y: 10 }, def: 4 })
    const ring = [8, 10, 12].map((y, i) =>
      combatant({ id: `e${i}`, team: 'enemy', str: 20, rangedRange: 4, moveSpeed: 0, pos: { x: 10, y } }))
    const st = stateOf([me, ...ring])
    const through = corridorExposure(st, me, { x: 18, y: 10 }, 0.9)   // straight through the ring
    expect(through).toBeGreaterThan(20)
    const meSouth = combatant({ id: 'p', pos: { x: 2, y: 25 }, def: 4 })
    const st2 = stateOf([meSouth, ...ring])
    expect(corridorExposure(st2, meSouth, { x: 18, y: 25 }, 0.9)).toBe(0)   // parallel, out of reach
  })
})

describe("travel-defend 'avoid' — the priced plow (clear-first)", () => {
  // A ring of stationary ranged shooters around the destination. Cheap ring →
  // the old plow. Deadly ring → the unit stops marching, fights the ring down,
  // and only then walks in.
  const gauntlet = (foeStr: number, foeHp: number, heroHp: number, decisionInterval = 1) => {
    const dest = { x: 22, y: 20 }
    const ringAngles = [110, 140, 170, 200, 230]
    const foes = ringAngles.map((deg) => {
      const a = (deg * Math.PI) / 180
      return { x: dest.x + 5 * Math.cos(a), y: dest.y + 5 * Math.sin(a) }
    })
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 20, moveSpeed: 0.9, str: 30, maxHp: heroHp, hp: heroHp })],
      enemyUnits: foes.map((_, i) => eu({ id: `e${i}`, team: 'enemy', moveSpeed: 0, str: foeStr, rangedRange: 4, maxHp: foeHp, hp: foeHp })),
      mode: 'open', cols: 40, rows: 40,
    })
    b.decisionInterval = decisionInterval
    find(b, 'a').pos = { x: 4, y: 20 }
    foes.forEach((p, i) => { find(b, `e${i}`).pos = p })
    issueMoveOrder(b, 'a', dest, 'avoid')
    let arrived = false, sawClearing = false
    for (let r = 0; r < 400 && !arrived; r++) {
      advanceRound(b)
      if (find(b, 'a').travelClearing) sawClearing = true
      if (distance(find(b, 'a').pos, dest) < 0.8) arrived = true
    }
    const ringDead = b.combatants.filter((c) => c.team === 'enemy' && !c.alive).length
    return { arrived, sawClearing, ringDead, hero: find(b, 'a') }
  }

  it('a cheap ring is still plowed straight through (old behavior)', () => {
    const r = gauntlet(1, 9999, 9999)
    expect(r.arrived).toBe(true)
    expect(r.sawClearing).toBe(false)   // budget covers the corridor — no fight
  })

  it('a deadly ring flips to clear-first: fight the wall down, then walk in', () => {
    const r = gauntlet(12, 30, 250)
    expect(r.sawClearing).toBe(true)         // the corridor was over budget
    expect(r.ringDead).toBeGreaterThan(0)    // it actually cleared shooters
    expect(r.hero.alive).toBe(true)          // instead of feeding itself to the ring
    expect(r.arrived).toBe(true)             // and still completed the order
  })

  it('pricing is decision-round-gated: the load-shed interval still clears and arrives', () => {
    // Under decisionInterval=5 (the heavy-field throttle) the corridor is only
    // re-priced on decision rounds; the committed mode carries between them.
    // (More HP than the interval-1 variant: slower re-targeting means slower
    // kills against the same ring — inherent to the throttle, not the pricing.)
    const r = gauntlet(12, 30, 400, 5)
    expect(r.sawClearing).toBe(true)
    expect(r.hero.alive).toBe(true)
    expect(r.arrived).toBe(true)
  })
})

describe('travelClearing snapshot fidelity', () => {
  it('rides the BSNAP round-trip', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a' })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 20, rows: 20,
    })
    find(b, 'a').travelClearing = true
    const clone = deserializeBattle(serializeBattle(b))
    expect(find(clone, 'a').travelClearing).toBe(true)
  })
})
