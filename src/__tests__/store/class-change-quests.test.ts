// Hero-relative class-change quests (proto store). These live in the peaceful
// cities and turn a Novice (class: null) into a specialized class. Status keys
// off the *selected* hero plus a kill objective; completing writes the new class
// onto the real unit only once the objective is met.
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import {
  useProtoStore, classQuestStatus, classQuestProgress, CLASS_CHANGE_QUESTS, MIN_CLASS_CHANGE_LEVEL,
  type ClassQuestCommit,
} from '@/proto/protoStore'
import { makeUnit, resetStore } from '../helpers'
import { emptyTally } from '@/lib/combatTally'

const reset = () => useProtoStore.setState({ classQuestCommit: {} })
// Set a hero's lifetime kill tally (what objective progress is measured against).
const setKills = (heroId: string, n: number) =>
  useGameStore.setState((s) => ({ unitStats: { ...s.unitStats, [heroId]: { ...emptyTally(), monstersDefeated: n } } }))

describe('classQuestStatus', () => {
  const base = { progress: 0, target: 1 }
  it('asks for a Novice when none is selected', () => {
    expect(classQuestStatus({ ...base, committedHeroId: null, selectedNovice: null })).toBe('select-novice')
  })
  it('blocks a Novice below the level gate (gray !)', () => {
    expect(classQuestStatus({ ...base, committedHeroId: null, selectedNovice: { level: 1 } })).toBe('underleveled')
  })
  it('lets a level-gate Novice begin (yellow !)', () => {
    expect(classQuestStatus({ ...base, committedHeroId: null, selectedNovice: { level: MIN_CLASS_CHANGE_LEVEL } })).toBe('eligible')
  })
  it('is in-progress (gray ?) while committed but the objective is unmet', () => {
    expect(classQuestStatus({ committedHeroId: 'u7', selectedNovice: null, progress: 0, target: 1 })).toBe('in-progress')
  })
  it('is ready (yellow ?) once the objective is met, regardless of selection', () => {
    expect(classQuestStatus({ committedHeroId: 'u7', selectedNovice: null, progress: 1, target: 1 })).toBe('ready')
  })
})

describe('classQuestProgress', () => {
  const commit: ClassQuestCommit = { heroId: 'u7', killBaseline: 3 }
  it('is 0 with no commitment', () => {
    expect(classQuestProgress(null, 99, 1)).toBe(0)
  })
  it('counts kills earned since the baseline, clamped to the target', () => {
    expect(classQuestProgress(commit, 3, 1)).toBe(0)   // no new kills
    expect(classQuestProgress(commit, 4, 1)).toBe(1)   // one new kill → met
    expect(classQuestProgress(commit, 9, 1)).toBe(1)   // clamped to target
  })
})

describe('class-change quest lifecycle', () => {
  beforeEach(() => {
    reset()
    resetStore({ units: [makeUnit({ id: 'u7', name: 'Pell Hightower', level: 2, class: null })], unitStats: {} })
  })

  it('begin commits the hero (snapshotting kills); a second begin is a no-op', () => {
    const { beginClassQuest } = useProtoStore.getState()
    setKills('u7', 5)
    beginClassQuest('path-fighter', 'u7')
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toEqual({ heroId: 'u7', killBaseline: 5 })
    beginClassQuest('path-fighter', 'u9')   // someone's already on it
    expect(useProtoStore.getState().classQuestCommit['path-fighter'].heroId).toBe('u7')
  })

  it('does not complete until the kill objective is met', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')           // baseline 0 kills
    completeClassQuest('path-fighter')              // objective unmet → no-op
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toBeDefined()

    setKills('u7', 1)                               // the committed hero lands a kill
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Fighter')
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toBeUndefined()
  })

  it('cancel discards the commitment without changing the class', () => {
    const { beginClassQuest, cancelClassQuest } = useProtoStore.getState()
    setKills('u7', 1)
    beginClassQuest('path-mage', 'u7')
    cancelClassQuest('path-mage')
    expect(useProtoStore.getState().classQuestCommit['path-mage']).toBeUndefined()
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
  })

  it('places the paths in the right cities, each a single-kill objective', () => {
    const byCity = (loc: string) => CLASS_CHANGE_QUESTS.filter((q) => q.locationId === loc).map((q) => q.targetClass).sort()
    expect(byCity('prontera-city')).toEqual(['Cleric', 'Fighter'])
    expect(byCity('payon-city')).toEqual(['Ranger', 'Rogue'])
    expect(byCity('geffen-city')).toEqual(['Mage'])
    expect(CLASS_CHANGE_QUESTS.every((q) => q.objective.kind === 'kill' && q.objective.count === 1)).toBe(true)
  })
})
