import { makeCodec } from '@/lib/save'
import type { ClassQuestCommit } from '@/proto/protoStore'
import type { QuestDropRule } from '@/types'

// Class-change commitments, board-quest progress, and bounty completion state —
// graduated from the interim `protoQuests` localStorage key into a real save
// slice so they round-trip through exportSave/importSave and per-mode save
// slots (the old key was one global blob shared across sandbox/curated).
// `questDropRules`/`questItems` (the runtime ledger a `collect` objective's
// armed drop rule writes into) ride along here too — they used to be
// unpersisted entirely, so a reload mid-collect-quest silently stopped
// awarding progress (the rule never re-armed on boot).
interface QuestsSave {
  activeQuest: Record<string, string | null>
  questProgress: Record<string, Record<string, number>>
  completedQuests: Record<string, string[]>
  classQuestCommit: Record<string, ClassQuestCommit>
  bountyDone: string[]
  bountyClaimed: Record<string, number>
  questCompletions: Record<string, number>
  questDropRules: QuestDropRule[]
  questItems: Record<string, number>
}

export const questsCodec = makeCodec<QuestsSave>({
  key: 'quests',
  version: 1,
  serialize: (s) => ({
    activeQuest:      s.activeQuest ?? {},
    questProgress:    s.questProgress ?? {},
    completedQuests:  s.completedQuests ?? {},
    classQuestCommit: s.classQuestCommit ?? {},
    bountyDone:       s.bountyDone ?? [],
    bountyClaimed:    s.bountyClaimed ?? {},
    questCompletions: s.questCompletions ?? {},
    questDropRules:   s.questDropRules ?? [],
    questItems:       s.questItems ?? {},
  }),
  deserialize: (data) => ({
    activeQuest:      data.activeQuest ?? {},
    questProgress:    data.questProgress ?? {},
    completedQuests:  data.completedQuests ?? {},
    classQuestCommit: data.classQuestCommit ?? {},
    bountyDone:       data.bountyDone ?? [],
    bountyClaimed:    data.bountyClaimed ?? {},
    questCompletions: data.questCompletions ?? {},
    questDropRules:   data.questDropRules ?? [],
    questItems:       data.questItems ?? {},
  }),
  empty: () => ({
    activeQuest: {}, questProgress: {}, completedQuests: {}, classQuestCommit: {},
    bountyDone: [], bountyClaimed: {}, questCompletions: {}, questDropRules: [], questItems: {},
  }),
})
