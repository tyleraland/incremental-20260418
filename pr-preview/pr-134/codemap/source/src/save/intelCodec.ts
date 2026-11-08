import { makeCodec } from '@/lib/save'
import type { IntelMask } from '@/engine'

// §intel (tactical-coordination.md §3.7): the per-species knowledge slice —
// codex-adjacent progression the STORE owns (the engine never learns). Which
// fields of each monster species the player's party has revealed by watching
// combat: armor element (realized multipliers), dodge rhythm (a seen dodge),
// skill kit (a seen cast). A species missing from the record is unknown;
// a legacy save with no slice loads empty (everything re-learns — one fight
// per species). Masking is applied per-mode by the store (curated only);
// the knowledge itself accrues in both modes.
interface IntelSave {
  speciesIntel: Record<string, IntelMask>
}

export const intelCodec = makeCodec<IntelSave>({
  key: 'intel',
  version: 1,
  serialize:   (s) => ({ speciesIntel: s.speciesIntel ?? {} }),
  deserialize: (data) => ({ speciesIntel: data.speciesIntel }),
  empty:       () => ({ speciesIntel: {} }),
})
