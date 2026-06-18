// Hero-relative class-change quests (proto store). These live in the peaceful
// cities and turn a Novice (class: null) into a specialized class. Status keys
// off the *selected* hero; completing writes the new class onto the real unit.
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import {
  useProtoStore, classQuestStatus, CLASS_CHANGE_QUESTS, MIN_CLASS_CHANGE_LEVEL,
} from '@/proto/protoStore'
import { makeUnit, resetStore } from '../helpers'

const reset = () => useProtoStore.setState({ classQuestCommit: {} })

describe('classQuestStatus', () => {
  it('asks for a Novice when none is selected', () => {
    expect(classQuestStatus({ committedHeroId: null, selectedNovice: null })).toBe('select-novice')
  })
  it('blocks a Novice below the level gate (gray !)', () => {
    expect(classQuestStatus({ committedHeroId: null, selectedNovice: { level: 1 } })).toBe('underleveled')
  })
  it('lets a level-gate Novice begin (yellow !)', () => {
    expect(classQuestStatus({ committedHeroId: null, selectedNovice: { level: MIN_CLASS_CHANGE_LEVEL } })).toBe('eligible')
  })
  it('is committed once a hero begins (yellow ?), regardless of selection', () => {
    expect(classQuestStatus({ committedHeroId: 'u7', selectedNovice: null })).toBe('committed')
  })
})

describe('class-change quest lifecycle', () => {
  beforeEach(() => {
    reset()
    resetStore({ units: [makeUnit({ id: 'u7', name: 'Pell Hightower', level: 2, class: null })] })
  })

  it('begin commits the hero; a second begin on the same path is a no-op', () => {
    const { beginClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toBe('u7')
    beginClassQuest('path-fighter', 'u9')   // someone's already on it
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toBe('u7')
  })

  it('complete writes the target class onto the real unit and clears the commit', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Fighter')
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toBeUndefined()
  })

  it('cancel discards the commitment without changing the class', () => {
    const { beginClassQuest, cancelClassQuest } = useProtoStore.getState()
    beginClassQuest('path-mage', 'u7')
    cancelClassQuest('path-mage')
    expect(useProtoStore.getState().classQuestCommit['path-mage']).toBeUndefined()
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
  })

  it('places the paths in the right cities', () => {
    const byCity = (loc: string) => CLASS_CHANGE_QUESTS.filter((q) => q.locationId === loc).map((q) => q.targetClass).sort()
    expect(byCity('prontera-city')).toEqual(['Cleric', 'Fighter'])
    expect(byCity('payon-city')).toEqual(['Ranger', 'Rogue'])
    expect(byCity('geffen-city')).toEqual(['Mage'])
  })
})
