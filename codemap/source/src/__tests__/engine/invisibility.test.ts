// Cloak / invisibility (spec §3 stealth): a cloaked unit is unselectable by
// enemies but still visible to allies and to line-of-sight; AoE / ground-zone
// damage "disrupts" the cloak and pops them back into view; striking from
// stealth carries a sneak-attack bonus.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, buildStatus,
  type BattleState,
} from '@/engine'
import { eu, attackSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const hasEvent = (b: BattleState, pred: (e: BattleState['events'][number]) => boolean) => b.events.some(pred)
const isStealthed = (b: BattleState, id: string) => find(b, id).statuses.some((s) => s.id === 'stealthed')

describe('cloak: invisible to enemies, visible to allies', () => {
  it('enemies cannot lock onto or strike a cloaked unit', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'rogue', maxHp: 500, hp: 500 })],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 20, meleeRange: 99 })],
    })
    find(b, 'rogue').statuses.push(buildStatus('stealthed', 'rogue')!)
    advanceRound(b)
    expect(hasEvent(b, (e) => e.targetId === 'rogue' && (e.type === 'melee_attack' || e.type === 'ranged_attack'))).toBe(false)
    expect(find(b, 'foe').lockedTargetId).toBeNull()
  })

  it('allies still see a cloaked ally (heal lands on the hidden, hurt friend)', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'cleric', int: 20, skills: [buildEngineSkill('heal', 1)!] }),
        eu({ id: 'rogue', hp: 10, maxHp: 100 }),
      ],
      enemyUnits: [eu({ id: 'foe', team: 'enemy', str: 0 })],
    })
    find(b, 'rogue').statuses.push(buildStatus('stealthed', 'rogue')!)
    advanceRound(b)
    expect(find(b, 'rogue').hp).toBeGreaterThan(10)        // ally healed it → allies can target it
    expect(isStealthed(b, 'rogue')).toBe(true)             // a friendly heal does not reveal it
  })
})

describe('cloak: AoE disrupts it', () => {
  it('AoE splash damage reveals a cloaked unit caught in the blast', () => {
    // Instant Hammer Fall centred on a visible foe; a cloaked foe stands inside
    // the same blast radius and gets caught (the spell can't *target* the hidden
    // one, but the area still hits it — and that pops the cloak).
    const hf = { ...buildEngineSkill('hammer-fall', 1)!, range: 99 }
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 40, skills: [hf] })],
      enemyUnits: [
        eu({ id: 'visible', team: 'enemy', def: 0, maxHp: 100, hp: 100 }),
        eu({ id: 'hidden', team: 'enemy', def: 0, maxHp: 100, hp: 100 }),
      ],
    })
    find(b, 'visible').pos = { x: 7, y: 8 }
    find(b, 'hidden').pos = { x: 7.4, y: 8 }   // within Hammer Fall's 1.8 radius of 'visible'
    find(b, 'hidden').statuses.push(buildStatus('stealthed', 'hidden')!)
    advanceRound(b)
    expect(find(b, 'hidden').hp).toBeLessThan(100)   // the area caught it
    expect(isStealthed(b, 'hidden')).toBe(false)     // …and the cloak dropped
  })
})

describe('sneak attack: striking from stealth', () => {
  // A plain skill (no stealthBonus of its own) still benefits from the base
  // +25% ambush bonus when the attacker is hidden.
  const strikeValue = (stealthed: boolean): number => {
    const atk = attackSkill({ id: 'plain', stealthBonus: undefined, range: 99, cooldown: 0, damageFormula: 'str * 2' })
    const b = createBattle({
      playerUnits: [eu({ id: 'r', str: 20, skills: [atk] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, maxHp: 999, hp: 999, meleeRange: 1.2 })],
    })
    if (stealthed) find(b, 'r').statuses.push(buildStatus('stealthed', 'r')!)
    advanceRound(b)
    return b.events.find((ev) => ev.type === 'skill_use' && ev.skillId === 'plain')!.value!
  }

  it('a strike from stealth lands for +25% and then reveals the attacker', () => {
    const open = strikeValue(false)
    const ambush = strikeValue(true)
    expect(ambush).toBe(Math.floor(open * 1.25))
  })
})
