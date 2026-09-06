import { describe, expect, it, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'

// resetSave wipes localStorage too; jsdom provides it. Always restore sandbox at
// the end of a case so other suites see the default.
beforeEach(() => {
  useGameStore.getState().setProgressionMode('sandbox')
  useGameStore.getState().resetSave()
})

describe('progression mode — curated reseed', () => {
  it('sandbox reset keeps the full pre-built party and recipe set', () => {
    const s = useGameStore.getState()
    expect(s.units.length).toBeGreaterThan(1)
    expect(s.learnedRecipes).toContain('recipe-plank')
  })

  it('curated reset seeds a single unclassed Novice and a slim recipe set', () => {
    const g = useGameStore.getState()
    g.setProgressionMode('curated')
    g.resetSave()
    const s = useGameStore.getState()
    expect(s.progressionMode).toBe('curated')
    expect(s.units).toHaveLength(1)
    expect(s.units[0].class).toBeNull()
    expect(s.learnedRecipes).toEqual(['recipe-herb-salve'])
    // restore for downstream suites
    g.setProgressionMode('sandbox')
    g.resetSave()
  })
})

describe('progression mode — learnSkill gate', () => {
  it('curated refuses to learn a skill outside the unit class kit', () => {
    const g = useGameStore.getState()
    g.setProgressionMode('curated')
    g.resetSave()
    // Give the lone Novice a skill point and try to learn a Mage spell.
    const novice = useGameStore.getState().units[0]
    useGameStore.setState((s) => ({ units: s.units.map((u) => (u.id === novice.id ? { ...u, skillPoints: 3, class: null } : u)) }))
    useGameStore.getState().learnSkill(novice.id, 'fire-bolt')
    expect(useGameStore.getState().units[0].learnedSkills['fire-bolt'] ?? 0).toBe(0)

    // Make them a Mage → the same spell is now learnable.
    useGameStore.setState((s) => ({ units: s.units.map((u) => (u.id === novice.id ? { ...u, class: 'Mage' } : u)) }))
    useGameStore.getState().learnSkill(novice.id, 'fire-bolt')
    expect(useGameStore.getState().units[0].learnedSkills['fire-bolt']).toBe(1)

    g.setProgressionMode('sandbox')
    g.resetSave()
  })

  it('sandbox lets any unit learn any (prereq-met) skill', () => {
    const g = useGameStore.getState()
    g.resetSave()
    const u = useGameStore.getState().units[0]
    useGameStore.setState((s) => ({ units: s.units.map((x) => (x.id === u.id ? { ...x, skillPoints: 3, class: null } : x)) }))
    useGameStore.getState().learnSkill(u.id, 'fire-bolt')
    expect(useGameStore.getState().units.find((x) => x.id === u.id)!.learnedSkills['fire-bolt']).toBe(1)
  })
})
