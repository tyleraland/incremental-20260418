// Hero-relative class-change quests (proto store). Each path is a cull objective:
// the committed hero must defeat N of a specific monster. Status keys off the
// selected hero + progress; completing writes the new class onto the real unit
// only once the objective is met.
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import {
  useProtoStore, classQuestStatus, classQuestProgress, classQuestKillCount,
  CLASS_CHANGE_QUESTS, MIN_CLASS_CHANGE_LEVEL, type ClassQuestCommit, type ClassQuestObjective,
} from '@/proto/protoStore'
import { makeUnit, resetStore } from '../helpers'
import { emptyTally } from '@/lib/combatTally'

const reset = () => useProtoStore.setState({ classQuestCommit: {} })
// Give a hero N killing blows on a monster type (what landing them in combat does).
const setTypeKills = (heroId: string, monsterId: string, n: number) =>
  useGameStore.setState((s) => ({
    unitStats: { ...s.unitStats, [heroId]: { ...emptyTally(), monstersDefeated: n, killsByMonster: { [monsterId]: n } } },
  }))

describe('classQuestStatus', () => {
  const base = { progress: 0, target: 3 }
  it('asks for a Novice when none is selected', () => {
    expect(classQuestStatus({ ...base, committedHeroId: null, selectedNovice: null })).toBe('select-novice')
  })
  it('blocks a Novice below the level gate (gray !)', () => {
    expect(classQuestStatus({ ...base, committedHeroId: null, selectedNovice: { level: 1 } })).toBe('underleveled')
  })
  it('lets a level-gate Novice begin (yellow !)', () => {
    expect(classQuestStatus({ ...base, committedHeroId: null, selectedNovice: { level: MIN_CLASS_CHANGE_LEVEL } })).toBe('eligible')
  })
  it('is in-progress (gray ?) while the objective is unmet', () => {
    expect(classQuestStatus({ committedHeroId: 'u7', selectedNovice: null, progress: 1, target: 3 })).toBe('in-progress')
  })
  it('is ready (yellow ?) once the objective is met', () => {
    expect(classQuestStatus({ committedHeroId: 'u7', selectedNovice: null, progress: 3, target: 3 })).toBe('ready')
  })
})

describe('classQuestKillCount (scope)', () => {
  const unitStats = { u7: { ...emptyTally(), monstersDefeated: 7, killsByMonster: { 'tough-slime': 4, hornet: 3 } } }
  const monsterDefeated = { 'tough-slime': 20, hornet: 9 }
  const obj = (o: Partial<ClassQuestObjective>): ClassQuestObjective => ({ kind: 'kill', count: 1, label: '', ...o })
  it('hero scope, per type → the hero\'s kills of that type', () => {
    expect(classQuestKillCount(obj({ scope: 'hero', monsterId: 'tough-slime' }), 'u7', unitStats, monsterDefeated)).toBe(4)
  })
  it('hero scope, any type → the hero\'s flat lifetime kills', () => {
    expect(classQuestKillCount(obj({ scope: 'hero' }), 'u7', unitStats, monsterDefeated)).toBe(7)
  })
  it('global scope, per type → the store-wide defeat total for that type', () => {
    expect(classQuestKillCount(obj({ scope: 'global', monsterId: 'hornet' }), 'u7', unitStats, monsterDefeated)).toBe(9)
  })
  it('global scope, any type → all monster defeats summed', () => {
    expect(classQuestKillCount(obj({ scope: 'global' }), 'u7', unitStats, monsterDefeated)).toBe(29)
  })
})

describe('classQuestProgress', () => {
  const commit: ClassQuestCommit = { heroId: 'u7', killBaseline: 3 }
  it('is 0 with no commitment', () => {
    expect(classQuestProgress(null, 99, 3)).toBe(0)
  })
  it('counts kills earned since the baseline, clamped to the target', () => {
    expect(classQuestProgress(commit, 3, 3)).toBe(0)   // no new kills
    expect(classQuestProgress(commit, 5, 3)).toBe(2)   // two new kills
    expect(classQuestProgress(commit, 99, 3)).toBe(3)  // clamped
  })
})

describe('class-change quest lifecycle', () => {
  beforeEach(() => {
    reset()
    resetStore({ units: [makeUnit({ id: 'u7', name: 'Pell Hightower', level: 2, class: null })], unitStats: {}, monsterDefeated: {} })
  })

  it('begin commits the hero (snapshotting type kills); a second begin is a no-op', () => {
    const { beginClassQuest } = useProtoStore.getState()
    setTypeKills('u7', 'tough-slime', 5)
    beginClassQuest('path-fighter', 'u7')           // objective = cull 3 tough-slime
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toEqual({ heroId: 'u7', killBaseline: 5 })
    beginClassQuest('path-fighter', 'u9')
    expect(useProtoStore.getState().classQuestCommit['path-fighter'].heroId).toBe('u7')
  })

  it('does not complete until the cull objective is met', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')           // baseline 0
    setTypeKills('u7', 'tough-slime', 2)            // only 2/3
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()

    setTypeKills('u7', 'tough-slime', 3)            // 3/3 → met
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Fighter')
    expect(useProtoStore.getState().classQuestCommit['path-fighter']).toBeUndefined()
  })

  it('only the right monster type counts toward the objective', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')
    setTypeKills('u7', 'hornet', 9)                 // wrong type
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
  })

  it('cancel discards the commitment without changing the class', () => {
    const { beginClassQuest, cancelClassQuest } = useProtoStore.getState()
    setTypeKills('u7', 'egg-sac', 3)
    beginClassQuest('path-mage', 'u7')
    cancelClassQuest('path-mage')
    expect(useProtoStore.getState().classQuestCommit['path-mage']).toBeUndefined()
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
  })

  it('places the paths in the right cities, each a hero-scoped cull objective', () => {
    const byCity = (loc: string) => CLASS_CHANGE_QUESTS.filter((q) => q.locationId === loc).map((q) => q.targetClass).sort()
    expect(byCity('prontera-city')).toEqual(['Cleric', 'Fighter'])
    expect(byCity('payon-city')).toEqual(['Ranger', 'Rogue'])
    expect(byCity('geffen-city')).toEqual(['Mage'])
    expect(CLASS_CHANGE_QUESTS.every((q) =>
      q.objective.kind === 'kill' && q.objective.count === 3 && !!q.objective.monsterId && q.objective.scope === 'hero',
    )).toBe(true)
  })
})
