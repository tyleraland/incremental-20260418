// Open-world engine primitives: a persistent battle that never self-terminates
// and `addCombatant` for trickling reinforcements / returnees into a live fight.
import { describe, expect, it } from 'vitest'
import { createBattle, addCombatant, advanceRound, type BattleState } from '@/engine'
import { eu } from './helpers'

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
