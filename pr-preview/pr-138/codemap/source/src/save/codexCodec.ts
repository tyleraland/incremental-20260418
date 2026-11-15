import { makeCodec } from '@/lib/save'

interface CodexSave {
  monsterSeen:     Record<string, number>
  monsterDefeated: Record<string, number>
}

export const codexCodec = makeCodec<CodexSave>({
  key: 'codex',
  version: 1,
  serialize: (s) => ({
    monsterSeen:     s.monsterSeen     ?? {},
    monsterDefeated: s.monsterDefeated ?? {},
  }),
  deserialize: (data) => ({
    monsterSeen:     data.monsterSeen,
    monsterDefeated: data.monsterDefeated,
  }),
  empty: () => ({ monsterSeen: {}, monsterDefeated: {} }),
})
