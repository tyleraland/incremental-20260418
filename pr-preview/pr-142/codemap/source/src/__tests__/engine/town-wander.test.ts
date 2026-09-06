// §town wander: in a peaceful field (a city) heroes mill about with short hops
// and long pauses, individually — NOT marching across the map toward a shared
// team waypoint the way they roam an ordinary open-world field.
import { describe, expect, it } from 'vitest'
import { createBattle, advanceRound, distance, type BattleState, type Vec2 } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// A lone hero in a big open field, no enemies — pure wander. Returns the hero's
// max displacement from its start over `rounds` (how far it ranged).
function wanderRange(peaceful: boolean, rounds: number): { start: Vec2; max: number; end: Vec2 } {
  const b = createBattle({ playerUnits: [eu({ id: 'hero', team: 'player' })], enemyUnits: [], mode: 'open', peaceful, cols: 50, rows: 50 })
  const hero = find(b, 'hero')
  hero.pos = { x: 25, y: 25 }
  const start = { ...hero.pos }
  let max = 0
  for (let i = 0; i < rounds; i++) { advanceRound(b); max = Math.max(max, distance(start, hero.pos)) }
  return { start, max, end: { ...hero.pos } }
}

describe('engine — town wander', () => {
  it('a peaceful hero mills nearby (short hops), not across the whole field', () => {
    const town = wanderRange(true, 80)
    // It does move (mills), but stays close to its stall — well within a few hops.
    expect(town.max).toBeGreaterThan(0)
    expect(town.max).toBeLessThan(8)
  })

  it('an ordinary open-world hero roams far toward the team waypoint', () => {
    const field = wanderRange(false, 80)
    // Party-roam heads to a far interior point — much farther than town milling.
    expect(field.max).toBeGreaterThan(10)
  })
})
