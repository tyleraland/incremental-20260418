// AoE skill selection (the mage's "Lightning Bolt vs Lightning Storm" choice):
// a long AoE channel should win when it'll catch a cluster from safety, and
// yield back to the single-target nuke otherwise. Includes the happy-path
// party scenario — tank soaks, healer heals, mage drops the storm.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, makeSkillTactic,
  type BattleState,
} from '@/engine'
import { eu, combatant } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const stateOf = (combatants: ReturnType<typeof combatant>[]) =>
  ({ combatants, barriers: [] } as unknown as BattleState)

// First skill the mage commits this fight (cast_start for a channel, or an
// instant skill_use) — tells us which option it actually preferred.
function firstMageCast(b: BattleState): string | undefined {
  return b.events.find(
    (e) => e.sourceId === 'mage' && (e.type === 'cast_start' || e.type === 'skill_use') && !!e.skillId,
  )?.skillId
}

describe('Lightning Storm vs Lightning Bolt — the action gate', () => {
  const action = makeSkillTactic(buildEngineSkill('lightning-storm', 1)!).action!
  const mage = () => combatant({ id: 'm', pos: { x: 2.5, y: 2 }, rangedRange: 8, int: 20, skills: [buildEngineSkill('lightning-storm', 1)!] })
  const slime = (id: string, x: number, y: number, moveSpeed = 0) =>
    combatant({ id, team: 'enemy', pos: { x, y }, moveSpeed, meleeRange: 1.2 })

  it('commits the storm on a safe cluster', () => {
    const res = action(mage(), stateOf([mage(), slime('e0', 2.5, 8), slime('e1', 3.0, 8)]), 1)
    expect(res?.castSkill?.id).toBe('lightning-storm')
  })

  it('declines the long channel on a lone target (no cluster to justify it)', () => {
    expect(action(mage(), stateOf([mage(), slime('e0', 2.5, 8)]), 1)).toBeNull()
  })

  it('declines a cluster it would get interrupted on (not safe to channel)', () => {
    // Two clustered foes, but fast and right on top of the caster → they'd reach
    // it and break the channel before it lands, so it holds off.
    const fast = [slime('e0', 2.5, 5, 0.9), slime('e1', 3.0, 5, 0.9)]
    expect(action(mage(), stateOf([mage(), ...fast]), 1)).toBeNull()
    // …but if those same foes are immobile, the channel is safe → commit.
    const still = [slime('e0', 2.5, 5, 0), slime('e1', 3.0, 5, 0)]
    expect(action(mage(), stateOf([mage(), ...still]), 1)?.castSkill?.id).toBe('lightning-storm')
  })
})

describe('happy path: tank soaks, healer heals, mage AoEs', () => {
  const bolt = () => buildEngineSkill('lightning-bolt', 1)!
  const storm = () => buildEngineSkill('lightning-storm', 1)!
  const heal = () => buildEngineSkill('heal', 1)!

  function setup(): BattleState {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'tank', str: 6, def: 50, spd: 9, maxHp: 500, hp: 500, meleeRange: 1.2, tactics: [{ id: 'threatening-presence', rank: 1 }] }),
        eu({ id: 'healer', int: 20, str: 2, spd: 11, rangedRange: 4, maxHp: 200, hp: 200, skills: [heal()] }),
        eu({ id: 'mage', int: 30, str: 2, spd: 10, rangedRange: 7, maxHp: 200, hp: 200, skills: [bolt(), storm()], tactics: [{ id: 'storm-caller', rank: 1 }] }),
      ],
      // Six immobile, high-DEF sponges packed together — exactly the screenshot.
      enemyUnits: Array.from({ length: 6 }, (_, i) =>
        eu({ id: `slime${i}`, team: 'enemy', str: 26, def: 18, spd: 8, maxHp: 200, hp: 200, meleeRange: 1.2, moveSpeed: 0 }),
      ),
    })
    find(b, 'tank').pos = { x: 2.5, y: 8 }
    find(b, 'healer').pos = { x: 1.5, y: 5 }
    find(b, 'mage').pos = { x: 3.5, y: 2 }
    const slimeSpots = [[1.8, 9], [2.5, 9], [3.2, 9], [1.8, 9.6], [2.5, 9.6], [3.2, 9.6]]
    slimeSpots.forEach(([x, y], i) => { find(b, `slime${i}`).pos = { x, y } })
    return b
  }

  it('the mage opens with Lightning Storm, not Lightning Bolt', () => {
    const b = setup()
    for (let i = 0; i < 16; i++) advanceRound(b)
    expect(firstMageCast(b)).toBe('lightning-storm')
  })

  it('the tank soaks while the healer keeps it up and the storm zaps the cluster', () => {
    const b = setup()
    for (let i = 0; i < 16; i++) advanceRound(b)

    // Tank took the hits but survived (the enemies focus it, not the back line).
    const tank = find(b, 'tank')
    expect(tank.alive).toBe(true)
    expect(tank.hp).toBeLessThan(tank.maxHp)
    expect(b.events.some((e) => e.type === 'melee_attack' && e.targetId === 'tank')).toBe(true)
    expect(find(b, 'mage').alive).toBe(true)   // back line untouched

    // Healer mended the tank.
    expect(b.events.some((e) => e.type === 'heal' && e.sourceId === 'healer' && e.targetId === 'tank')).toBe(true)

    // The storm landed and is zapping the cluster for lightning damage.
    expect(b.zones.length).toBeGreaterThanOrEqual(1)
    expect(b.events.some((e) => e.type === 'dot' && e.extra?.label === 'lightning')).toBe(true)
  })
})
