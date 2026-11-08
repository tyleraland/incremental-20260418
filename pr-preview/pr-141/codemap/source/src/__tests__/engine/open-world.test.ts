// Open-world engine primitives: a persistent battle that never self-terminates
// and `addCombatant` for trickling reinforcements / returnees into a live fight.
import { describe, expect, it } from 'vitest'
import { createBattle, addCombatant, advanceRound, distance, type BattleState } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

function freshOpen(): BattleState {
  return createBattle({
    playerUnits: [eu({ id: 'p1', team: 'player', str: 100 })],
    enemyUnits: [eu({ id: 'e1', team: 'enemy', maxHp: 1, hp: 1 })],
    mode: 'open',
  })
}

describe('engine — open-world mode', () => {
  it('defaults to encounter mode and terminates on a wipe', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p1', team: 'player', str: 100 })],
      enemyUnits: [eu({ id: 'e1', team: 'enemy', maxHp: 1, hp: 1 })],
    })
    expect(b.mode).toBe('encounter')
    for (let i = 0; i < 50 && b.outcome === 'ongoing'; i++) advanceRound(b)
    expect(b.outcome).toBe('victory')
  })

  it('open-mode battles never self-terminate, even with all enemies dead', () => {
    const b = freshOpen()
    expect(b.mode).toBe('open')
    for (let i = 0; i < 50; i++) advanceRound(b)
    expect(b.combatants.filter((c) => c.team === 'enemy' && c.alive).length).toBe(0)
    expect(b.outcome).toBe('ongoing')   // stays open despite the empty field
  })

  it('addCombatant injects a fresh combatant with a unique index and a spawn event', () => {
    const b = freshOpen()
    advanceRound(b)
    const before = b.combatants.length
    const maxIndex = Math.max(...b.combatants.map((c) => c.index))

    const c = addCombatant(b, eu({ id: 'e2', team: 'enemy' }), 'enemy')
    expect(b.combatants.length).toBe(before + 1)
    expect(c.index).toBe(maxIndex + 1)
    expect(c.team).toBe('enemy')
    expect(c.alive).toBe(true)
    expect(b.events.some((e) => e.type === 'spawn' && e.sourceId === 'e2')).toBe(true)
  })

  it('a reinforcement re-engages: a dead-field open battle fights again once a monster is added', () => {
    const b = freshOpen()
    for (let i = 0; i < 10; i++) advanceRound(b)   // clear the field
    expect(b.combatants.filter((c) => c.team === 'enemy' && c.alive).length).toBe(0)

    addCombatant(b, eu({ id: 'e2', team: 'enemy', maxHp: 1, hp: 1 }), 'enemy')
    expect(b.combatants.filter((c) => c.team === 'enemy' && c.alive).length).toBe(1)
    for (let i = 0; i < 20; i++) advanceRound(b)
    expect(b.combatants.find((c) => c.id === 'e2')!.alive).toBe(false)   // killed by the player
    expect(b.outcome).toBe('ongoing')                                    // still persistent
  })
})

describe('engine — open-world map, vision & wander', () => {
  function bigBattle(playerVision = Infinity): BattleState {
    return createBattle({
      playerUnits: [eu({ id: 'p', team: 'player', visionRange: playerVision })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 1000, hp: 1000 })],
      mode: 'open', cols: 100, rows: 100,
    })
  }

  it('carries a per-battle grid size; defaults stay 15×15', () => {
    expect(createBattle({ playerUnits: [], enemyUnits: [] }).cols).toBe(15)
    const big = bigBattle()
    expect(big.cols).toBe(100)
    expect(big.rows).toBe(100)
  })

  it('movement uses the battle bounds — a chaser crosses past the old 15 edge', () => {
    const b = bigBattle()  // player has unlimited vision → it chases
    find(b, 'p').pos = { x: 50, y: 50 }
    find(b, 'e').pos = { x: 50, y: 95 }
    for (let i = 0; i < 30; i++) advanceRound(b)
    expect(find(b, 'p').pos.y).toBeGreaterThan(20)   // would clamp at 15 without per-battle bounds
  })

  it('vision gates target acquisition: out of sight → no lock; in sight → lock', () => {
    const b = bigBattle(10)
    find(b, 'p').pos = { x: 50, y: 50 }
    find(b, 'e').pos = { x: 50, y: 80 }   // 30 cells away, beyond vision 10
    advanceRound(b)
    expect(find(b, 'p').lockedTargetId).toBeNull()

    find(b, 'p').pos = { x: 50, y: 50 }
    find(b, 'e').pos = { x: 50, y: 57 }   // 7 cells — within vision
    advanceRound(b)
    expect(find(b, 'p').lockedTargetId).toBe('e')
  })

  it('a hero with nothing in sight wanders at its (constant) move pace', () => {
    const moveSpeed = 0.9
    const b = createBattle({ playerUnits: [eu({ id: 'p', team: 'player', visionRange: 10, moveSpeed })], enemyUnits: [], mode: 'open', cols: 100, rows: 100 })
    find(b, 'p').pos = { x: 50, y: 50 }
    const start = { ...find(b, 'p').pos }
    advanceRound(b)
    // Roaming uses the same speed as combat (WANDER_SPEED_MULT = 1), so one round
    // of travel covers about one move step — a steady pace, never a sprint.
    const moved = distance(find(b, 'p').pos, start)
    expect(moved).toBeGreaterThan(moveSpeed * 0.5)
    expect(moved).toBeLessThan(moveSpeed * 1.2)
  })

  it('an idle monster lurks, then hops to a new local spot', () => {
    const b = createBattle({ playerUnits: [], enemyUnits: [eu({ id: 'e', team: 'enemy', visionRange: 8 })], mode: 'open', cols: 100, rows: 100 })
    find(b, 'e').pos = { x: 50, y: 50 }
    const start = { ...find(b, 'e').pos }
    for (let i = 0; i < 20; i++) advanceRound(b)
    const moved = distance(find(b, 'e').pos, start)
    expect(moved).toBeGreaterThan(0)     // it eventually hopped
    expect(moved).toBeLessThan(20)       // but only a short local distance
  })
})
