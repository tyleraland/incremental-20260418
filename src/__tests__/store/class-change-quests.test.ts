// Hero-relative class-change quests (proto store). Paths carry a kill (cull),
// collect, or hand-in objective — hero- or global-scoped. Collect and hand-in
// CONSUME their items on completion. Status keys off the selected hero +
// progress; completing writes the new class onto the real unit only once met.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import {
  useProtoStore, classQuestStatus, classQuestProgress, classQuestKillCount, objectiveProgress,
  CLASS_CHANGE_QUESTS, MIN_CLASS_CHANGE_LEVEL, LOCATION_BOUNTIES, bountyVisible, buildQuestBoard,
  type ClassQuestCommit, type KillObjective, type QuestBoardArgs, type QuestBoardEntry,
} from '@/proto/protoStore'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'
import { emptyTally } from '@/lib/combatTally'

const reset = () => useProtoStore.setState({ classQuestCommit: {} })
const ROGUE  = CLASS_CHANGE_QUESTS.find((q) => q.id === 'path-rogue')!   // collect (ephemeral)
const RANGER = CLASS_CHANGE_QUESTS.find((q) => q.id === 'path-ranger')!  // hand-in (inventory)
const setTypeKills = (heroId: string, monsterId: string, n: number) =>
  useGameStore.setState((s) => ({
    unitStats: { ...s.unitStats, [heroId]: { ...emptyTally(), monstersDefeated: n, killsByMonster: { [monsterId]: n } } },
  }))
const view = (over: Partial<Parameters<typeof objectiveProgress>[2]> = {}) =>
  ({ unitStats: {}, monsterDefeated: {}, questItems: {}, miscItems: [], ...over })

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

describe('objectiveProgress (per kind)', () => {
  const commit: ClassQuestCommit = { heroId: 'u7', killBaseline: 3 }
  it('kill: kills since the baseline, clamped', () => {
    expect(classQuestProgress(commit, 5, 3)).toBe(2)
    expect(classQuestProgress(commit, 99, 3)).toBe(3)
  })
  it('collect: reads the ephemeral quest-item ledger, clamped', () => {
    expect(objectiveProgress(ROGUE.objective, commit, view({ questItems: { 'qi-bone-splinter': 2 } }))).toBe(2)
    expect(objectiveProgress(ROGUE.objective, commit, view({ questItems: { 'qi-bone-splinter': 9 } }))).toBe(ROGUE.objective.count)
  })
  it('hand-in (inventory): reads how many you hold in the stash, clamped', () => {
    expect(objectiveProgress(RANGER.objective, commit, view({ miscItems: [{ id: 'drop-boar-hide', quantity: 2 }] }))).toBe(2)
    expect(objectiveProgress(RANGER.objective, commit, view({ miscItems: [{ id: 'drop-boar-hide', quantity: 9 }] }))).toBe(RANGER.objective.count)
  })
})

describe('class-change quest lifecycle', () => {
  beforeEach(() => {
    reset()
    resetStore({ units: [makeUnit({ id: 'u7', name: 'Pell Hightower', level: 2, class: null })], unitStats: {}, monsterDefeated: {}, questDropRules: [], questItems: {}, miscItems: [] })
  })

  it('kill path: completes only once the cull objective is met', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-fighter', 'u7')           // cull 3 wild-boar
    setTypeKills('u7', 'wild-boar', 2)
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
    setTypeKills('u7', 'wild-boar', 3)
    completeClassQuest('path-fighter')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Fighter')
  })

  it('collect path: arms a drop rule, then consumes the quest items on complete', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    beginClassQuest('path-rogue', 'u7')
    expect(useGameStore.getState().questDropRules.find((r) => r.id === 'path-rogue')).toMatchObject({ itemId: 'qi-bone-splinter', monsterId: 'skeleton-archer', heroId: 'u7' })

    completeClassQuest('path-rogue')                // 0/3 → no-op
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()

    useGameStore.setState((s) => ({ questItems: { ...s.questItems, 'qi-bone-splinter': 4 } }))  // collected 4
    completeClassQuest('path-rogue')
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Rogue')
    expect(useGameStore.getState().questDropRules.find((r) => r.id === 'path-rogue')).toBeUndefined()
    expect(useGameStore.getState().questItems['qi-bone-splinter']).toBeUndefined()   // consumed + cleared
  })

  it('hand-in path: consumes the required materials from the inventory on complete', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    useGameStore.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 5 }] })
    beginClassQuest('path-ranger', 'u7')            // hand in 3 boar hides
    expect(useGameStore.getState().questDropRules.length).toBe(0)   // hand-in arms no drop rule

    completeClassQuest('path-ranger')               // 5 held ≥ 3 → ready
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBe('Ranger')
    expect(useGameStore.getState().miscItems.find((m) => m.id === 'drop-boar-hide')!.quantity).toBe(2)  // 5 − 3
  })

  it('hand-in path: will not complete without enough materials', () => {
    const { beginClassQuest, completeClassQuest } = useProtoStore.getState()
    useGameStore.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 2 }] })
    beginClassQuest('path-ranger', 'u7')
    completeClassQuest('path-ranger')               // only 2/3
    expect(useGameStore.getState().units.find((u) => u.id === 'u7')!.class).toBeNull()
    expect(useGameStore.getState().miscItems.find((m) => m.id === 'drop-boar-hide')!.quantity).toBe(2)  // not consumed
  })

  it('cancel discards a collect commitment and its drop rule + items', () => {
    const { beginClassQuest, cancelClassQuest } = useProtoStore.getState()
    beginClassQuest('path-rogue', 'u7')
    useGameStore.setState((s) => ({ questItems: { ...s.questItems, 'qi-bone-splinter': 2 } }))
    cancelClassQuest('path-rogue')
    expect(useProtoStore.getState().classQuestCommit['path-rogue']).toBeUndefined()
    expect(useGameStore.getState().questDropRules.find((r) => r.id === 'path-rogue')).toBeUndefined()
    expect(useGameStore.getState().questItems['qi-bone-splinter']).toBeUndefined()
  })

  it('places the paths in the right cities; one of each new objective kind', () => {
    const byCity = (loc: string) => CLASS_CHANGE_QUESTS.filter((q) => q.locationId === loc).map((q) => q.targetClass).sort()
    expect(byCity('prontera-city')).toEqual(['Cleric', 'Fighter'])
    expect(byCity('payon-city')).toEqual(['Ranger', 'Rogue'])
    expect(byCity('geffen-city')).toEqual(['Mage'])
    expect(CLASS_CHANGE_QUESTS.every((q) => q.objective.count === 3)).toBe(true)
    expect(ROGUE.objective.kind).toBe('collect')
    expect(RANGER.objective.kind).toBe('handin')
  })
})

describe('quest-item drops (store plumbing)', () => {
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
      unitStats: {}, monsterDefeated: {}, questDropRules: [], questItems: {},
    })
    const g = useGameStore.getState()
    g.armQuestDrop({ id: 'q-global', itemId: 'qi-global', monsterId: 'slime', scope: 'global', dropRate: 1, target: 9999 })
    g.armQuestDrop({ id: 'q-absent', itemId: 'qi-absent', monsterId: 'slime', scope: 'hero', heroId: 'nobody', dropRate: 1, target: 9999 })

    for (let i = 0; i < 400; i++) tick()

    const st = useGameStore.getState()
    const kills = st.monsterDefeated['slime'] ?? 0
    expect(kills).toBeGreaterThan(0)
    expect(st.questItems['qi-global']).toBe(kills)    // dropRate 1 → one item per kill
    expect(st.questItems['qi-absent'] ?? 0).toBe(0)   // hero not on the map → never drops
  })

  it('stops dropping once the target is reached', () => {
    resetStore({
      locations: [OPEN(['slime'])],
      units: [makeUnit({ id: 'u0', locationId: 'field', health: 100, abilities: { strength: 100, agility: 5, dexterity: 5, constitution: 30, intelligence: 5 } })],
      unitStats: {}, monsterDefeated: {}, questDropRules: [], questItems: {},
    })
    useGameStore.getState().armQuestDrop({ id: 'q-cap', itemId: 'qi-cap', monsterId: 'slime', scope: 'global', dropRate: 1, target: 2 })
    for (let i = 0; i < 400; i++) tick()
    expect(useGameStore.getState().questItems['qi-cap']).toBe(2)
  })
})

describe('location bounties (hero-less, chained)', () => {
  beforeEach(() => {
    useProtoStore.setState({ bountyDone: [], bountyClaimed: {} })
    resetStore({ units: [], unitStats: {}, monsterDefeated: {}, questItems: {}, miscItems: [] })
  })

  it('the follow-up bounty is hidden until its prerequisite is done', () => {
    expect(bountyVisible(LOCATION_BOUNTIES.find((b) => b.id === 'boar-hides-100')!, [])).toBe(false)
    expect(bountyVisible(LOCATION_BOUNTIES.find((b) => b.id === 'boar-hides-100')!, ['boar-hides-20'])).toBe(true)
    expect(bountyVisible(LOCATION_BOUNTIES.find((b) => b.id === 'boar-hides-20')!, [])).toBe(true)
  })

  it('completes only with enough hides, consumes them, pays gold, and unlocks the chain', () => {
    const { completeBounty } = useProtoStore.getState()
    useGameStore.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 12 }] })

    completeBounty('boar-hides-20')                 // only 12/20 → no-op
    expect(useProtoStore.getState().bountyDone).toEqual([])

    useGameStore.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 25 }] })
    completeBounty('boar-hides-20')
    expect(useProtoStore.getState().bountyDone).toContain('boar-hides-20')
    expect(useGameStore.getState().miscItems.find((m) => m.id === 'drop-boar-hide')!.quantity).toBe(5)   // 25 − 20
    expect(useGameStore.getState().miscItems.find((m) => m.id === 'm-gold')!.quantity).toBe(200)         // gold reward
    expect(useGameStore.getState().equipment.some((e) => e.id.startsWith('eq-leather'))).toBe(true)      // gear reward granted
    expect(useProtoStore.getState().questCompletions['boar-hides-20']).toBe(1)                           // tallied
  })

  it('will not complete a still-locked bounty', () => {
    useGameStore.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 999 }] })
    useProtoStore.getState().completeBounty('boar-hides-100')   // prerequisite not done
    expect(useProtoStore.getState().bountyDone).toEqual([])
  })

  it('the repeatable kill bounty is capped at one claim per cycle; backlog never banks', () => {
    const gold = () => useGameStore.getState().miscItems.find((m) => m.id === 'm-gold')?.quantity ?? 0
    const { completeBounty } = useProtoStore.getState()
    useGameStore.setState({ monsterDefeated: { 'wild-boar': 99 } })
    completeBounty('boar-cull-repeat')                          // 99/100 → no-op
    expect(gold()).toBe(0)

    useGameStore.setState({ monsterDefeated: { 'wild-boar': 250 } })   // a 250-boar backlog
    completeBounty('boar-cull-repeat')                          // claims ONCE; overflow discarded
    completeBounty('boar-cull-repeat')                          // immediately re-upped to 0/100 → no-op
    expect(gold()).toBe(1)
    expect(useProtoStore.getState().bountyClaimed['boar-cull-repeat']).toBe(250)   // baseline = current total
    expect(useProtoStore.getState().bountyDone).not.toContain('boar-cull-repeat')  // never archives

    useGameStore.setState({ monsterDefeated: { 'wild-boar': 350 } })   // cull 100 fresh
    completeBounty('boar-cull-repeat')
    expect(gold()).toBe(2)
    // The completion tally counts every claim (for a future quests-completed report).
    expect(useProtoStore.getState().questCompletions['boar-cull-repeat']).toBe(2)
  })
})

describe('buildQuestBoard (journal)', () => {
  const base: QuestBoardArgs = {
    classCommit: {}, bountyDone: [], bountyClaimed: {}, completions: {},
    units: [{ id: 'u7', name: 'Pell Hightower' }],
    view: { unitStats: {}, monsterDefeated: {}, questItems: {}, miscItems: [] },
    locationName: (id) => id,
  }
  const find = (b: QuestBoardEntry[], id: string) => b.find((e) => e.id === id)!

  it('class paths are available + hero-scoped until a hero commits', () => {
    const f = find(buildQuestBoard(base), 'path-fighter')
    expect(f.status).toBe('available'); expect(f.scope).toBe('hero'); expect(f.heroName).toBeUndefined()
  })
  it('a committed class path shows in-progress with the committed hero', () => {
    const f = find(buildQuestBoard({ ...base, classCommit: { 'path-fighter': { heroId: 'u7', killBaseline: 0 } } }), 'path-fighter')
    expect(f.status).toBe('in-progress'); expect(f.heroName).toBe('Pell Hightower')
  })
  it('the chained bounty is upcoming until its prerequisite is done', () => {
    expect(find(buildQuestBoard(base), 'boar-hides-100').status).toBe('not-yet')
    expect(find(buildQuestBoard({ ...base, bountyDone: ['boar-hides-20'] }), 'boar-hides-100').status).toBe('available')
  })
  it('a hand-in bounty reads inventory (global): available → ready', () => {
    expect(find(buildQuestBoard(base), 'boar-hides-20').status).toBe('available')
    const r = find(buildQuestBoard({ ...base, view: { ...base.view, miscItems: [{ id: 'drop-boar-hide', quantity: 30 }] } }), 'boar-hides-20')
    expect(r.status).toBe('ready'); expect(r.scope).toBe('global')
  })
  it('a completed non-repeatable bounty is terminal; completions surface', () => {
    const e = find(buildQuestBoard({ ...base, bountyDone: ['boar-hides-20'], completions: { 'boar-hides-20': 1 } }), 'boar-hides-20')
    expect(e.status).toBe('completed'); expect(e.completions).toBe(1)
  })
  it('the repeatable kill bounty is available at 0 and ready at 100', () => {
    expect(find(buildQuestBoard(base), 'boar-cull-repeat').status).toBe('available')
    const r = find(buildQuestBoard({ ...base, view: { ...base.view, monsterDefeated: { 'wild-boar': 100 } } }), 'boar-cull-repeat')
    expect(r.status).toBe('ready'); expect(r.repeatable).toBe(true)
  })
})

// Quest commitments / bounty progress persist to localStorage so a reload doesn't
// drop an in-flight class change (interim — not yet in the main save envelope).
describe('quest persistence', () => {
  it('writes the quest slice to localStorage on change', () => {
    useProtoStore.setState({
      classQuestCommit: { 'path-fighter': { heroId: 'h1', killBaseline: 2 } },
      bountyDone: ['boar-hides-20'],
      questCompletions: { 'boar-hides-20': 1 },
    })
    const raw = localStorage.getItem('protoQuests')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.classQuestCommit['path-fighter']).toEqual({ heroId: 'h1', killBaseline: 2 })
    expect(parsed.bountyDone).toContain('boar-hides-20')
    expect(parsed.questCompletions['boar-hides-20']).toBe(1)
    useProtoStore.setState({ classQuestCommit: {}, bountyDone: [], questCompletions: {} })
  })
})
