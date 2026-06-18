// Hero-relative class-change quests (proto store). Paths carry a kill (cull) or
// collect objective, hero- or global-scoped. Status keys off the selected hero +
// progress; completing writes the new class onto the real unit only once met.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import {
  useProtoStore, classQuestStatus, classQuestProgress, classQuestKillCount, objectiveProgress,
  CLASS_CHANGE_QUESTS, MIN_CLASS_CHANGE_LEVEL, type ClassQuestCommit, type KillObjective,
} from '@/proto/protoStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'
import { emptyTally } from '@/lib/combatTally'

const reset = () => useProtoStore.setState({ classQuestCommit: {} })
const ROGUE = CLASS_CHANGE_QUESTS.find((q) => q.id === 'path-rogue')!   // the collect path
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
  const obj = (o: Partial<KillObjective>): KillObjective => ({ kind: 'kill', count: 1, label: '', ...o })
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

describe('classQuestProgress / objectiveProgress', () => {
  const commit: ClassQuestCommit = { heroId: 'u7', killBaseline: 3 }
  const view = (questDrops: Record<string, number> = {}) => ({ unitStats: {}, monsterDefeated: {}, questDrops })
  it('kill objective: kills since the baseline, clamped', () => {
    expect(classQuestProgress(commit, 5, 3)).toBe(2)
    expect(classQuestProgress(commit, 99, 3)).toBe(3)
  })
  it('collect objective: reads the quest drop ledger, clamped', () => {
    expect(objectiveProgress(ROGUE, { heroId: 'u7', killBaseline: 0 }, view({ 'path-rogue': 2 }))).toBe(2)
    expect(objectiveProgress(ROGUE, { heroId: 'u7', killBaseline: 0 }, view({ 'path-rogue': 9 }))).toBe(ROGUE.objective.count)
  })
})

describe('class-change quest lifecycle', () => {
  beforeEach(() => {
    reset()
    resetStore({ units: [makeUnit({ id: 'u7', name: 'Pell Hightower', level: 2, class: null })], unitStats: {}, monsterDefeated: {}, questDropRules: [], questDrops: {} })
  })

  it('a kill path does not complete until the cull objective is met', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')           // cull 3 tough-slime, baseline 0
    setTypeKills('u7', 'tough-slime', 2)
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
    setTypeKills('u7', 'tough-slime', 3)
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Fighter')
  })

  it('a collect path arms a drop rule on begin and clears it on complete', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-rogue', 'u7')
    const rule = useGameStore.getState().questDropRules.find((r) => r.id === 'path-rogue')
    expect(rule).toMatchObject({ monsterId: 'skeleton-archer', scope: 'hero', heroId: 'u7', target: 3 })
    expect(useGameStore.getState().questDrops['path-rogue']).toBe(0)

    completeClassQuest('path-rogue')                // 0/3 → no-op
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()

    useGameStore.setState((s) => ({ questDrops: { ...s.questDrops, 'path-rogue': 3 } }))  // collected 3
    completeClassQuest('path-rogue')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Rogue')
    expect(useGameStore.getState().questDropRules.find((r) => r.id === 'path-rogue')).toBeUndefined()
    expect(useGameStore.getState().questDrops['path-rogue']).toBeUndefined()
  })

  it('cancel discards a collect commitment and its drop rule', () => {
    const { beginClassQuest, cancelClassQuest } = useProtoStore.getState()
    beginClassQuest('path-rogue', 'u7')
    cancelClassQuest('path-rogue')
    expect(useProtoStore.getState().classQuestCommit['path-rogue']).toBeUndefined()
    expect(useGameStore.getState().questDropRules.find((r) => r.id === 'path-rogue')).toBeUndefined()
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
  })

  it('only the right monster type counts toward a cull objective', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')
    setTypeKills('u7', 'hornet', 9)                 // wrong type
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
  })

  it('places the paths in the right cities; objectives are hero-scoped, count 3', () => {
    const byCity = (loc: string) => CLASS_CHANGE_QUESTS.filter((q) => q.locationId === loc).map((q) => q.targetClass).sort()
    expect(byCity('prontera-city')).toEqual(['Cleric', 'Fighter'])
    expect(byCity('payon-city')).toEqual(['Ranger', 'Rogue'])
    expect(byCity('geffen-city')).toEqual(['Mage'])
    expect(CLASS_CHANGE_QUESTS.every((q) => q.objective.count === 3 && (q.objective.scope ?? 'hero') === 'hero')).toBe(true)
    expect(ROGUE.objective.kind).toBe('collect')
  })
})

describe('quest-item drops (store plumbing)', () => {
  // Pin loot RNG to 0 so every dropRate roll fires (and monster drops are stable).
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
  afterEach(() => vi.restoreAllMocks())

  const OPEN = (monsterIds: string[]): Location => ({
    id: 'field', region: 'world', name: 'Field', description: '', traits: [],
    monsterIds, familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 3, openWorldSize: 12,
  })

  it('a global rule drops on every matching kill; an absent-hero rule drops nothing', () => {
    resetStore({
      locations: [OPEN(['slime'])],
      units: [0, 1].map((i) => makeUnit({ id: `u${i}`, locationId: 'field', health: 100, abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 } })),
      unitStats: {}, monsterDefeated: {}, questDropRules: [], questDrops: {},
    })
    const g = useGameStore.getState()
    g.registerQuestDrop({ id: 'q-global', monsterId: 'slime', scope: 'global', dropRate: 1, target: 9999 })
    g.registerQuestDrop({ id: 'q-absent', monsterId: 'slime', scope: 'hero', heroId: 'nobody', dropRate: 1, target: 9999 })

    for (let i = 0; i < 400; i++) tick()

    const st = useGameStore.getState()
    const kills = st.monsterDefeated['slime'] ?? 0
    expect(kills).toBeGreaterThan(0)
    expect(st.questDrops['q-global']).toBe(kills)   // dropRate 1 → one item per kill
    expect(st.questDrops['q-absent'] ?? 0).toBe(0)  // hero not on the map → never drops
  })

  it('stops dropping once the target is reached', () => {
    resetStore({
      locations: [OPEN(['slime'])],
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100, abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 } })],
      unitStats: {}, monsterDefeated: {}, questDropRules: [], questDrops: {},
    })
    useGameStore.getState().registerQuestDrop({ id: 'q-cap', monsterId: 'slime', scope: 'global', dropRate: 1, target: 2 })
    for (let i = 0; i < 400; i++) tick()
    expect(useGameStore.getState().questDrops['q-cap']).toBe(2)
  })
})
