import { describe, expect, it } from 'vitest'
import {
  isSkillUnlocked, getAvailableSkills, CLASS_SKILL_KITS, CURATED_START, curatedStartUnits,
} from '@/stores/useGameStore'
import { makeUnit } from '../helpers'

describe('feature unfolding — skill gating', () => {
  it('sandbox unlocks every skill regardless of class', () => {
    const novice = makeUnit({ class: null })
    expect(isSkillUnlocked('sandbox', 'fire-bolt', novice)).toBe(true)
    expect(isSkillUnlocked('sandbox', 'sword-mastery-2h', novice)).toBe(true)
  })

  it('curated locks a classless Novice out of every (non-universal) skill', () => {
    const novice = makeUnit({ class: null, learnedSkills: {} })
    const anyUnlocked = getAvailableSkills(novice, 'curated').some((e) => e.unlocked)
    expect(anyUnlocked).toBe(false)
  })

  it('curated opens exactly the class kit once a class is chosen', () => {
    const fighter = makeUnit({ class: 'Fighter' })
    expect(isSkillUnlocked('curated', 'bash', fighter)).toBe(true)            // in the Fighter kit
    expect(isSkillUnlocked('curated', 'fire-bolt', fighter)).toBe(false)      // a Mage skill
    const unlockedIds = getAvailableSkills(fighter, 'curated').filter((e) => e.unlocked).map((e) => e.skill.id)
    expect(new Set(unlockedIds)).toEqual(new Set(CLASS_SKILL_KITS.Fighter))
  })

  it('curated never hides an already-learned skill, even off-kit', () => {
    // A Mage who somehow learned a Fighter skill keeps access to level it.
    const mage = makeUnit({ class: 'Mage', learnedSkills: { bash: 2 } })
    expect(isSkillUnlocked('curated', 'bash', mage)).toBe(true)
  })
})

describe('feature unfolding — curated start', () => {
  it('seeds a single unclassed Novice', () => {
    const units = curatedStartUnits()
    expect(units).toHaveLength(1)
    expect(units[0].id).toBe(CURATED_START.startUnitIds[0])
    expect(units[0].class).toBeNull()
  })
})
