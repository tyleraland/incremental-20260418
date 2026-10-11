// Bless (per-level offence buff) + Chain tactics (cast slot x, follow up with x+1
// on the same target). Also covers the "buffs prefer the caster first" rule.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, buildStatus, type BattleState } from '@/engine'
import { effectiveStat } from '@/engine/damage'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const blessedIds = (b: BattleState) => b.combatants.filter((c) => c.team === 'player' && c.statuses.some((s) => s.id === 'blessed')).map((c) => c.id)

describe('bless', () => {
  it('scales its bonuses with level (+lv attack/magic/speed, +2·lv hit)', () => {
    const st = buildStatus('blessed', 'src', 5)!
    expect(st.statModifiers).toMatchObject({ str: 5, int: 5, spd: 5, acc: 10 })
    const sk = buildEngineSkill('bless', 1)!
    expect(sk.statusApplied).toBe('blessed')
    expect(sk.statusMaxActive).toBe(2)   // up to two active on the team
  })

  it('a cleric buffs itself first, then an ally, never more than two at once', () => {
    const bless = { ...buildEngineSkill('bless', 4)!, cooldown: 0, range: 99 }
    const b = createBattle({
      playerUnits: [
        eu({ id: 'c', int: 10, maxHp: 999, hp: 999, skills: [bless] }),
        eu({ id: 'a1', maxHp: 999, hp: 999 }), eu({ id: 'a2', maxHp: 999, hp: 999 }), eu({ id: 'a3', maxHp: 999, hp: 999 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 999, hp: 999, meleeRange: 1.2, moveSpeed: 0 })],
    })
    find(b, 'c').pos = { x: 3, y: 3 }; find(b, 'e').pos = { x: 13, y: 13 }   // no fighting — isolate the buffing
    let maxBlessed = 0
    let selfFirst = false
    for (let i = 0; i < 8; i++) {
      advanceRound(b)
      const ids = blessedIds(b)
      if (i === 0) selfFirst = ids.length === 1 && ids[0] === 'c'   // round 1: only the caster
      maxBlessed = Math.max(maxBlessed, ids.length)
    }
    expect(selfFirst).toBe(true)                                      // buffed itself first
    expect(find(b, 'c').statuses.some((s) => s.id === 'blessed')).toBe(true)
    expect(maxBlessed).toBe(2)                                        // then one ally, capped at two
    expect(effectiveStat(find(b, 'c'), 'str')).toBeGreaterThan(find(b, 'c').str)   // the buff really boosts a combat stat
  })
})

describe('chain tactic', () => {
  it('Chain 1-2: after casting skill 1, follows up with skill 2 on the SAME target', () => {
    const agi = { ...buildEngineSkill('boost-agility', 1)!, range: 99, statusMaxActive: 99 }   // lift the 1-active cap so giving the cleric agi-up only steers targeting
    const bless = { ...buildEngineSkill('bless', 2)!, range: 99 }
    const b = createBattle({
      playerUnits: [
        eu({ id: 'c', int: 10, maxHp: 999, hp: 999, skills: [agi, bless], tactics: [{ id: 'chain-1-2', rank: 1 }] }),
        eu({ id: 'a', maxHp: 999, hp: 999 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 999, hp: 999, meleeRange: 1.2, moveSpeed: 0 })],
    })
    find(b, 'c').pos = { x: 3, y: 3 }; find(b, 'a').pos = { x: 3.6, y: 3 }; find(b, 'e').pos = { x: 13, y: 13 }
    // The cleric is already agile, so it casts Agility on the ALLY — then Chain 1-2
    // should follow up with Bless on that same ally (normal Bless would prefer self).
    find(b, 'c').statuses.push(buildStatus('agi-up', 'c')!)
    for (let i = 0; i < 4; i++) advanceRound(b)
    const a = find(b, 'a')
    expect(a.statuses.some((s) => s.id === 'agi-up')).toBe(true)    // ally got Agility (slot 1)
    expect(a.statuses.some((s) => s.id === 'blessed')).toBe(true)   // …and the chained Bless (slot 2), same target
  })
})
