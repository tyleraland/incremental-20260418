// Neutral NPCs (town merchants/questgivers): a third faction that is nobody's
// enemy and nobody's ally — never targeted, never splashed, never takes a turn.
import { describe, expect, it } from 'vitest'
import {
  createBattle, addCombatant, advanceRound, livingEnemies, visibleEnemiesOf,
  type BattleState, type EngineUnitInput,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// A stationary, harmless NPC input (mirrors data/npcs.ts npcToEngineInput).
const npc = (id: string): EngineUnitInput =>
  eu({ id, name: id, team: 'neutral', str: 0, def: 0, maxHp: 100, hp: 100, moveSpeed: 0, meleeRange: 0 })

describe('engine — neutral NPCs', () => {
  it('a neutral NPC is excluded from both enemy queries (player and enemy side)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', team: 'player', str: 50 })],
      enemyUnits: [eu({ id: 'monster', team: 'enemy', str: 50, maxHp: 1000, hp: 1000 })],
    })
    addCombatant(b, npc('arnold'), 'neutral', undefined, { x: 1, y: 1 })
    const hero = find(b, 'hero')
    const monster = find(b, 'monster')
    advanceRound(b)
    // The hero sees/targets the monster, never the NPC; the monster likewise.
    expect(livingEnemies(b, hero).map((c) => c.id)).toEqual(['monster'])
    expect(livingEnemies(b, monster).map((c) => c.id)).toEqual(['hero'])
    expect(visibleEnemiesOf(b, hero).some((c) => c.id === 'arnold')).toBe(false)
    expect(visibleEnemiesOf(b, monster).some((c) => c.id === 'arnold')).toBe(false)
  })

  it('a neutral NPC never takes damage or moves, even mid-melee', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', team: 'player', str: 80, maxHp: 1000, hp: 1000 })],
      enemyUnits: [eu({ id: 'monster', team: 'enemy', str: 80, maxHp: 1000, hp: 1000 })],
    })
    // NPC dropped right between the two combatants.
    addCombatant(b, npc('paul'), 'neutral', undefined, { x: 7, y: 7 })
    const before = { ...find(b, 'paul').pos }
    for (let i = 0; i < 40; i++) advanceRound(b)
    const paul = find(b, 'paul')
    expect(paul.hp).toBe(100)          // untouched by either side
    expect(paul.alive).toBe(true)
    expect(paul.pos).toEqual(before)   // stationary — never took a turn
    // Meanwhile the two real combatants did trade blows.
    expect(find(b, 'hero').hp).toBeLessThan(1000)
    expect(find(b, 'monster').hp).toBeLessThan(1000)
  })
})
