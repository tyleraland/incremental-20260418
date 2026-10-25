// Positioning: an ally-only ranged skill (Heal) must NOT make a unit hang back
// from the enemy it's locked onto. A striker who *also* carries Heal still charges
// to melee and trades blows (then heals from up close), rather than standing off at
// heal range with no way to touch the foe — the "Sera equipped Heal and just waited
// for the enemy to walk up" bug. The standoff/caster gate (`isCaster`/`castRange`)
// only counts ranged skills that can actually hit an *enemy*.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { isCaster } from '@/engine/spatial'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

describe('ally-only ranged skill does not trigger ranged standoff', () => {
  it('a mage-statted unit whose only ranged skill is Heal closes to melee', () => {
    const heal = buildEngineSkill('heal', 1)!   // single_ally, range 5
    const sera = eu({ id: 'sera', name: 'Sera', str: 6, int: 7, meleeRange: 1.1, skills: [heal] })
    const b = createBattle({
      playerUnits: [sera],
      enemyUnits: [eu({ id: 'mob', name: 'Mob', team: 'enemy', str: 8, maxHp: 45, hp: 45, moveSpeed: 0 })],
    })
    expect(isCaster(find(b, 'sera'))).toBe(false)   // heal alone ≠ ranged caster
    find(b, 'sera').pos = { x: 8, y: 7 }
    find(b, 'mob').pos = { x: 8, y: 11 }            // 4 cells away, immobile
    for (let r = 0; r < 12; r++) advanceRound(b)
    // She must have crossed the gap to melee, not parked at heal range (~5).
    expect(dist(find(b, 'sera').pos, find(b, 'mob').pos)).toBeLessThan(1.5)
    expect(find(b, 'mob').hp).toBeLessThan(45)      // and is actually hitting it
  })

  it('an offensive ranged skill still makes a unit a caster (stands off)', () => {
    const bolt = buildEngineSkill('lightning-bolt', 1)!   // single_enemy, ranged
    const mage = eu({ id: 'mage', name: 'Mage', int: 20, rangedRange: 6, skills: [bolt] })
    const b = createBattle({
      playerUnits: [mage],
      enemyUnits: [eu({ id: 'mob', name: 'Mob', team: 'enemy', moveSpeed: 0 })],
    })
    expect(isCaster(find(b, 'mage'))).toBe(true)
  })
})
