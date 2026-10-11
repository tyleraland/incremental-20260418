// M0 of movement-action-coupling.md: the action-selection path takes an
// optional `at` — the position a cast is evaluated FROM — so the movement
// planner can ask "what would I cast if I stood there?". Default (`self.pos`)
// must behave exactly as before; these tests pin the hypothetical answers.
import { describe, it, expect } from 'vitest'
import { selectSkillTarget, type BattleState, type Combatant, type Barrier } from '@/engine'
import { mostInjuredAllyInRange } from '@/engine/behavior'
import { combatant, attackSkill, healSkill } from './helpers'

const stateOf = (combatants: Combatant[], barriers: Barrier[] = []) =>
  ({ combatants, barriers } as unknown as BattleState)

describe('selectSkillTarget(at) — hypothetical cast position', () => {
  it('answers by range from `at`, not from where the unit stands', () => {
    const self = combatant({ id: 'p', pos: { x: 0.5, y: 0 } })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 12 } })
    const sk = attackSkill({ id: 'bolt', range: 6 })
    const st = stateOf([self, foe])
    expect(selectSkillTarget(self, st, sk)).toBeNull()                       // out of range from here
    expect(selectSkillTarget(self, st, sk, { x: 0.5, y: 7 })).toBe('e')      // castable from there
  })

  it('checks line of sight from `at`', () => {
    // A wall between the unit and its foe; a spot past the wall's edge sees it.
    const wall: Barrier = { x: 0, y: 5, w: 4, h: 1, kind: 'wall' }
    const self = combatant({ id: 'p', pos: { x: 2, y: 2 } })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 2, y: 8 } })
    const sk = attackSkill({ id: 'bolt', range: 8 })
    const st = stateOf([self, foe], [wall])
    expect(selectSkillTarget(self, st, sk)).toBeNull()                       // wall blocks the shot
    expect(selectSkillTarget(self, st, sk, { x: 7, y: 8 })).toBe('e')        // clear line from past the wall's end
  })

  it('measures a heal reach from `at`', () => {
    const self = combatant({ id: 'p', pos: { x: 0.5, y: 0 } })
    const hurt = combatant({ id: 'a', pos: { x: 0.5, y: 12 }, hp: 10, maxHp: 50 })
    const sk = healSkill({ id: 'heal', range: 5 })
    const st = stateOf([self, hurt])
    expect(selectSkillTarget(self, st, sk)).toBeNull()
    expect(selectSkillTarget(self, st, sk, { x: 0.5, y: 9 })).toBe('a')
    expect(mostInjuredAllyInRange(st, self, 5, { x: 0.5, y: 9 })?.id).toBe('a')
  })

  it('defaults to self.pos — omitting `at` is the old behaviour', () => {
    const self = combatant({ id: 'p', pos: { x: 0.5, y: 0 } })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 4 } })
    const sk = attackSkill({ id: 'bolt', range: 6 })
    const st = stateOf([self, foe])
    expect(selectSkillTarget(self, st, sk)).toBe(selectSkillTarget(self, st, sk, self.pos))
  })
})
