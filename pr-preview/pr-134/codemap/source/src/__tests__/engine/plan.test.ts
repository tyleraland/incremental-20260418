// M1 of movement-action-coupling.md: the plan seam. Movement anchors on the
// attack the unit will ACTUALLY use against its target (preferredAttackVs —
// same estimateDamageVs scorer as the action channel), not its longest raw
// range (castRange). These pin the anchor semantics and the kiter wiring.
import { describe, it, expect } from 'vitest'
import {
  preferredAttackVs, preferredRangeVs, kiteDistanceFor, TACTIC_REGISTRY,
  type BattleState, type Combatant,
} from '@/engine'
import { combatant, attackSkill, healSkill } from './helpers'

const stateOf = (combatants: Combatant[]) => ({ combatants } as unknown as BattleState)

// A caster: int-statted, ranged channel bolts (isCaster ⇒ cooldowns ignored,
// basic attack never considered).
const bolt = (id: string, over: Parameters<typeof attackSkill>[0] = {}) =>
  attackSkill({ id, range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 3, ...over })

describe('preferredAttackVs — target-aware anchor', () => {
  it('element flip: picks the bolt that exploits the armor, same kit', () => {
    const mage = combatant({ id: 'm', int: 30, str: 2, skills: [bolt('fire-b', { element: 'fire' }), bolt('frost-b', { element: 'water' })] })
    const fireArmored = combatant({ id: 'f', team: 'enemy', armorElement: 'fire' })
    const earthArmored = combatant({ id: 'e', team: 'enemy', armorElement: 'earth' })
    expect(preferredAttackVs(mage, fireArmored)?.skill?.id).toBe('frost-b')   // water 1.5× vs fire
    expect(preferredAttackVs(mage, earthArmored)?.skill?.id).toBe('fire-b')   // fire 1.5× vs earth
  })

  it('cooldown flips a non-caster\'s anchor back to its basic attack', () => {
    const archer = combatant({
      id: 'a', str: 10, int: 0, rangedRange: 4,
      skills: [attackSkill({ id: 'snipe', range: 6, damageFormula: 'str * 3', cooldown: 1, channelTime: 0 })],
    })
    const foe = combatant({ id: 'e', team: 'enemy' })
    expect(preferredRangeVs(archer, foe)).toBe(6)              // snipe ready → hold at snipe range
    archer.skillCooldowns = { snipe: 3 }
    expect(preferredRangeVs(archer, foe)).toBe(4)              // recharging → hold at bow range
  })

  it('a Bash-and-bolt caster anchors melee against a magic-immune foe', () => {
    const battlemage = combatant({
      id: 'b', int: 20, str: 10,
      skills: [bolt('zap'), attackSkill({ id: 'bash', range: 1.2, damageFormula: 'str * 1.2', cooldown: 4, channelTime: 0 })],
    })
    const golem = combatant({ id: 'g', team: 'enemy', magicDef: 100 })   // bolts land 0
    expect(preferredAttackVs(battlemage, golem)?.skill?.id).toBe('bash')
    expect(preferredRangeVs(battlemage, golem)).toBe(1.2)
    const squishy = combatant({ id: 's', team: 'enemy', magicDef: 0 })
    expect(preferredRangeVs(battlemage, squishy)).toBe(6)      // bolts back on top
  })

  it('cycle amortization: a slow cooldown nuke does not out-anchor the basic attack', () => {
    const archer = combatant({
      id: 'a', str: 10, int: 0, rangedRange: 4,
      skills: [attackSkill({ id: 'burst', range: 6, damageFormula: 'str * 1.2', cooldown: 25, channelTime: 0 })],
    })
    const foe = combatant({ id: 'e', team: 'enemy' })
    expect(preferredRangeVs(archer, foe)).toBe(4)              // 12/25 per round ≪ the bow's 10
  })

  it('ties prefer the longer reach', () => {
    const mage = combatant({ id: 'm', int: 30, str: 2, skills: [bolt('near', { range: 4 }), bolt('far', { range: 6 })] })
    const foe = combatant({ id: 'e', team: 'enemy' })
    expect(preferredRangeVs(mage, foe)).toBe(6)
  })

  it('nothing scores → falls back to the castRange utility standoff (pure healer)', () => {
    const healer = combatant({ id: 'h', str: 0, int: 20, rangedRange: 0, skills: [healSkill({ id: 'mend', range: 5 })] })
    const foe = combatant({ id: 'e', team: 'enemy' })
    expect(preferredAttackVs(healer, foe)).toBeNull()          // str 0 basic lands nothing
    expect(preferredRangeVs(healer, foe)).toBe(5)              // hold at heal reach, as before
  })
})

describe('kiter anchors on the preferred attack', () => {
  it('holds at the range of the harder-hitting shorter spell, not the longest one', () => {
    const tactic = TACTIC_REGISTRY['kiter'].movement!
    const mage = combatant({
      id: 'p', int: 20, str: 0, rangedRange: 6, lockedTargetId: 'e',
      skills: [
        attackSkill({ id: 'zap', range: 9, damageFormula: 'int * 0.5', cooldown: 1, channelTime: 0 }),
        attackSkill({ id: 'nuke', range: 5, damageFormula: 'int * 2', cooldown: 1, channelTime: 0 }),
      ],
    })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 8 } })
    const plan = tactic(mage, stateOf([mage, foe]), 1)!
    expect(plan.desiredRange).toBe(kiteDistanceFor(mage, foe, 5))          // anchored on nuke (range 5)
    expect(plan.desiredRange!).toBeLessThan(kiteDistanceFor(mage, foe))    // old anchor was zap's 9
  })
})
