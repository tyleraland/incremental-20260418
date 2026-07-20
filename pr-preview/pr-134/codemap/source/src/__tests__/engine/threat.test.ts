// §threat — the WoW-style threat model that drives the default targeting
// fallback (below the player's/monster's targeting tactics, above nothing):
//   • damage and healing build the actor's threat on its foes (× threatMult)
//   • a foe attacks its highest-threat target, blended with proximity, sticky via
//     hysteresis (the "aggro wobble")
//   • Taunt hard-forces the bearer onto the taunter for the status duration
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, selectTarget, buildEngineSkill, buildStatus,
  type BattleState, type Combatant,
} from '@/engine'
import { eu, combatant } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const stateOf = (combatants: Combatant[]) => ({ combatants } as unknown as BattleState)

describe('threat: generation', () => {
  it('damage builds the attacker\'s threat on its target, scaled by threatMult', () => {
    const b = createBattle({
      // identical hitters, but the tank generates 4× threat per point of damage
      playerUnits: [
        eu({ id: 'dps',  str: 10, meleeRange: 30 }),
        eu({ id: 'tank', str: 10, meleeRange: 30, threatMult: 4 }),
      ],
      enemyUnits: [eu({ id: 'mob', team: 'enemy', def: 0, maxHp: 9999, hp: 9999, meleeRange: 30, moveSpeed: 0 })],
    })
    advanceRound(b)
    const mob = find(b, 'mob')
    // ~4× (±deterministic damage variation), so assert a clear multiple, not exact.
    expect(mob.threat['tank']).toBeGreaterThan(mob.threat['dps'] * 3)
  })

  it('healing generates threat on the healer\'s enemies (a healer can pull aggro)', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'healer', int: 20, rangedRange: 4, skills: [buildEngineSkill('heal', 2)!], moveSpeed: 0 }),
        eu({ id: 'ally', maxHp: 200, hp: 50, moveSpeed: 0 }),
      ],
      enemyUnits: [eu({ id: 'mob', team: 'enemy', str: 0, moveSpeed: 0, maxHp: 200, hp: 200 })],
    })
    find(b, 'healer').pos = { x: 5, y: 5 }
    find(b, 'ally').pos = { x: 6, y: 5 }   // hurt ally in heal range
    find(b, 'mob').pos = { x: 5, y: 12 }   // far — generates no threat itself
    advanceRound(b)
    expect(find(b, 'mob').threat['healer']).toBeGreaterThan(0)
  })
})

describe('threat: targeting fallback', () => {
  const mob = (over = {}) => combatant({ id: 'mob', team: 'enemy', pos: { x: 5, y: 5 }, ...over })
  const near = combatant({ id: 'tank', pos: { x: 5, y: 6 } })   // 1 away
  const far = combatant({ id: 'kiter', pos: { x: 5, y: 12 } })  // 7 away

  it('attacks the highest-threat foe even when another is closer', () => {
    const m = mob({ threat: { tank: 5, kiter: 50 } })
    selectTarget(stateOf([m, near, far]), m)
    expect(m.lockedTargetId).toBe('kiter')   // threat beats proximity
  })

  it('with no threat yet, opens on the nearest foe', () => {
    const m = mob({ threat: {} })
    selectTarget(stateOf([m, near, far]), m)
    expect(m.lockedTargetId).toBe('tank')    // distance decides the opener
  })

  it('hysteresis keeps the current target through a slim threat lead, flips on a clear one', () => {
    // tank and kiter equidistant so only threat matters; mob already on the tank.
    const t = combatant({ id: 'tank', pos: { x: 5, y: 6 } })
    const k = combatant({ id: 'kiter', pos: { x: 5, y: 4 } })
    const slim = mob({ threat: { tank: 50, kiter: 55 }, lockedTargetId: 'tank' })   // +10% < 25% margin
    selectTarget(stateOf([slim, t, k]), slim)
    expect(slim.lockedTargetId).toBe('tank')   // sticky

    const clear = mob({ threat: { tank: 50, kiter: 80 }, lockedTargetId: 'tank' })  // +60% > margin
    selectTarget(stateOf([clear, t, k]), clear)
    expect(clear.lockedTargetId).toBe('kiter')  // pulled
  })
})

describe('threat: hard taunt', () => {
  // mob is angriest at the kiter, but a Taunt forces it onto the tank regardless,
  // then releases to the highest-threat foe when the status expires.
  const setup = () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'tank', moveSpeed: 0 }), eu({ id: 'kiter', rangedRange: 6, moveSpeed: 0 })],
      enemyUnits: [eu({ id: 'mob', team: 'enemy', str: 0, moveSpeed: 0, maxHp: 999, hp: 999 })],
    })
    find(b, 'tank').pos = { x: 1, y: 1 }       // far from the mob
    find(b, 'kiter').pos = { x: 10, y: 10 }    // far from the mob (no live damage either way)
    find(b, 'mob').pos = { x: 5, y: 5 }
    find(b, 'mob').threat = { kiter: 100 }     // kiter holds aggro
    return b
  }

  it('forces the bearer onto the taunter, overriding higher threat', () => {
    const b = setup()
    find(b, 'mob').statuses.push(buildStatus('taunted', 'tank')!)
    advanceRound(b)
    expect(find(b, 'mob').lockedTargetId).toBe('tank')   // taunt beats the kiter's threat
  })

  it('releases to the highest-threat foe once the taunt ends', () => {
    const b = setup()
    find(b, 'mob').statuses.push(buildStatus('taunted', 'tank')!)
    advanceRound(b)
    find(b, 'mob').statuses = []                          // taunt expired
    advanceRound(b)
    expect(find(b, 'mob').lockedTargetId).toBe('kiter')   // back to threat
  })

  it('the Taunt skill jumps the caster to the top of the target\'s threat table', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'tank', skills: [buildEngineSkill('taunt', 1)!], meleeRange: 30, moveSpeed: 0 })],
      enemyUnits: [eu({ id: 'mob', team: 'enemy', str: 0, meleeRange: 30, moveSpeed: 0, maxHp: 999, hp: 999 })],
    })
    find(b, 'tank').pos = { x: 5, y: 5 }
    find(b, 'mob').pos = { x: 5, y: 7 }         // within Taunt's range (6)
    const mob = find(b, 'mob')
    mob.threat = { kiter: 100 }                 // someone else is way ahead
    mob.lockedTargetId = 'kiter'                // ...and the mob is on them (peel target)
    advanceRound(b)                             // tank taunts (mob is on an ally → peel)
    expect(mob.threat['tank']).toBeGreaterThan(100)   // vaulted to the top (+10%)
    expect(mob.statuses.some((s) => s.flags.includes('taunted'))).toBe(true)
  })
})
