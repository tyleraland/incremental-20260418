// Combat Tactic Engine — consumable items (§consumables).
//
// A carried consumable becomes an action-channel tactic, exactly like a skill
// does (see makeSkillTactic). It fires when the unit's HP drops below the
// player-configured threshold, the item is still in the pack, and there's a foe
// in sight (don't waste it on an empty field — mirrors canLastStand). The heal
// itself is applied in takeTurn's action-apply branch, which also decrements the
// pack — so the count lives in the combatant (and thus the snapshot) and replays
// 1:1. Cooldown rides the generic tacticCooldowns machinery (cooldown: 1 round).
//
// The engine stays data-free: it never imports the item registry. The effect
// descriptor arrives on the ConsumableSpec via the adapter and is serialized on
// the combatant so a reloaded BSNAP rebuilds an equivalent tactic.

import { visibleEnemiesOf } from './spatial'
import type { ConsumableSpec, TacticDef } from './types'

// The tactic id for a carried consumable. `rebuildTactics` keys off this prefix
// to reconstruct the tactic from the combatant's serialized specs on load.
export const CONSUMABLE_TACTIC_PREFIX = 'item:'
export const consumableTacticId = (itemId: string): string => `${CONSUMABLE_TACTIC_PREFIX}${itemId}`

export function makeConsumableTactic(spec: ConsumableSpec): TacticDef {
  return {
    id: consumableTacticId(spec.itemId),
    name: spec.itemId,
    description: `Use when HP < ${Math.round(spec.threshold * 100)}%.`,
    scope: 'unit',
    channel: 'action',
    cooldown: 1,   // one round between uses (scaleRounds applied by markFired)
    action: (self, state) => {
      if (self.hp / self.maxHp >= spec.threshold) return null
      if ((self.pack[spec.itemId] ?? 0) <= 0) return null
      if (visibleEnemiesOf(state, self).length === 0) return null
      return { useItemId: spec.itemId }
    },
  }
}
