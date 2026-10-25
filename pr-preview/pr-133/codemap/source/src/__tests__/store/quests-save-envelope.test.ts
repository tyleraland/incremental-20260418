// Quest commitments/progress/completions graduated into the main save envelope
// (the `questsCodec` slice): they now round-trip through the whole-game
// exportSave/importSave string, not just an interim localStorage key. This is
// the export/import-durability acceptance for that move (mirrors
// logistics-save-envelope.test.ts, which pins the same contract for packs +
// expedition plans).
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { saveGame, loadGame } from '@/lib/save'
import { ALL_CODECS } from '@/save'
import { questsCodec } from '@/save/questsCodec'
import { acceptQuest, advanceQuest, beginClassQuest, completeBounty } from '@/proto/protoStore'
import { makeUnit, resetStore } from '../helpers'

const g = () => useGameStore.getState()
const wipeQuestState = () => useGameStore.setState({
  activeQuest: {}, questProgress: {}, completedQuests: {}, classQuestCommit: {},
  bountyDone: [], bountyClaimed: {}, questCompletions: {}, questDropRules: [], questItems: {},
})

beforeEach(() => {
  resetStore({ units: [makeUnit({ id: 'u7', name: 'Pell Hightower', level: 2, class: null })] })
})

describe('quests survive the whole-game save envelope', () => {
  it('exportSave → importSave restores class-quest commitments, board progress, and bounty state', () => {
    beginClassQuest('path-fighter', 'u7')                              // real classQuestCommit via the real action
    acceptQuest('boar-meadow', 'q-cull')                                // real board-quest commitment
    advanceQuest('boar-meadow', 'q-cull', 5)
    useGameStore.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 25 }] })
    completeBounty('boar-hides-20')                                    // real bountyDone/bountyClaimed/questCompletions

    const saved = saveGame(g(), ALL_CODECS)
    wipeQuestState()
    useGameStore.setState(loadGame(saved, ALL_CODECS))

    expect(g().classQuestCommit['path-fighter']).toEqual({ heroId: 'u7', killBaseline: 0 })
    expect(g().activeQuest['boar-meadow']).toBe('q-cull')
    expect(g().questProgress['boar-meadow']['q-cull']).toBe(5)
    expect(g().bountyDone).toContain('boar-hides-20')
    expect(g().questCompletions['boar-hides-20']).toBe(1)
  })

  it('a save with no quests slice restores clean defaults', () => {
    beginClassQuest('path-fighter', 'u7')
    // Build an envelope from every codec EXCEPT quests, then load with the full set.
    const others = ALL_CODECS.filter((c) => c.key !== questsCodec.key)
    const saved = saveGame(g(), others)
    const restored = loadGame(saved, ALL_CODECS)
    expect(restored).toMatchObject(questsCodec.empty())
  })
})
