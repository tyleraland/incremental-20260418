import { saveGame, loadGame, SAVE_KEY, ACTIVE_MODE_KEY, saveKeyFor } from '@/lib/save'
import type { SliceCodec } from '@/lib/save'
import { useGameStore } from '@/stores/useGameStore'
import { bootstrapProgressionMode, type ProgressionMode } from '@/lib/unlocks'
import { serializeBattle } from '@/engine'
import { unitsCodec }       from './unitsCodec'
import { inventoryCodec }   from './inventoryCodec'
import { locationsCodec }   from './locationsCodec'
import { codexCodec }       from './codexCodec'
import { worldCodec }       from './worldCodec'
import { combatStatsCodec } from './combatStatsCodec'
import { unitStatsCodec }   from './unitStatsCodec'
import { unitHistoryCodec } from './unitHistoryCodec'
import { battlesCodec }     from './battlesCodec'
import { socketsCodec }     from './socketsCodec'
import { logisticsCodec }   from './logisticsCodec'

export { unitsCodec, inventoryCodec, locationsCodec, codexCodec, worldCodec, combatStatsCodec, unitStatsCodec, unitHistoryCodec, battlesCodec, socketsCodec, logisticsCodec }

export const ALL_CODECS: SliceCodec<any>[] = [
  unitsCodec, inventoryCodec, locationsCodec, codexCodec, worldCodec, combatStatsCodec,
  unitStatsCodec, unitHistoryCodec, battlesCodec, socketsCodec, logisticsCodec,
]

// Write the current game to *its own mode's* slot and mark that mode active. The
// inactive mode's slot is untouched (its game isn't in memory to write), so the
// two never collide.
export function persistSave(): void {
  const state = useGameStore.getState()
  const mode = state.progressionMode
  localStorage.setItem(saveKeyFor(mode), saveGame(state, ALL_CODECS))
  localStorage.setItem(ACTIVE_MODE_KEY, mode)
}

// Fold a pre-split single save (one `SAVE_KEY`) into the matching mode slot once,
// then drop the legacy key so this only runs on the first post-upgrade load.
function migrateLegacySave(): void {
  const legacy = localStorage.getItem(SAVE_KEY)
  if (!legacy) return
  const mode: ProgressionMode = loadGame(legacy, ALL_CODECS).progressionMode ?? 'sandbox'
  if (!localStorage.getItem(saveKeyFor(mode))) {
    localStorage.setItem(saveKeyFor(mode), legacy)
    if (!localStorage.getItem(ACTIVE_MODE_KEY)) localStorage.setItem(ACTIVE_MODE_KEY, mode)
  }
  localStorage.removeItem(SAVE_KEY)
}

export function loadPersistedSave(): void {
  migrateLegacySave()
  // The mode to restore resolves the same way the store booted (URL > marker >
  // default), so the loaded slot matches the seed already in memory. No slot for
  // that mode yet → keep the fresh boot seed (a brand-new game for it).
  const mode = bootstrapProgressionMode()
  const str = localStorage.getItem(saveKeyFor(mode))
  if (!str) return
  const partial = loadGame(str, ALL_CODECS)
  if (Object.keys(partial).length > 0) useGameStore.setState({ ...partial, progressionMode: mode })
}

// Switch progression modes, preserving BOTH games. Saves the current mode first
// ("save before you switch"), marks the target active, then loads the target's
// existing save — or starts a fresh game for it if it has none. Non-destructive:
// neither slot is wiped.
export function switchProgressionMode(target: ProgressionMode): void {
  const cur = useGameStore.getState().progressionMode
  if (cur === target) return
  persistSave()                                   // flush the mode we're leaving
  localStorage.setItem(ACTIVE_MODE_KEY, target)
  const str = localStorage.getItem(saveKeyFor(target))
  if (str) {
    const partial = loadGame(str, ALL_CODECS)
    useGameStore.setState({ ...partial, progressionMode: target })
  } else {
    // No save for the target yet — seed a fresh game in that mode (resetSave only
    // touches the target's now-active slot, which is empty anyway).
    useGameStore.getState().setProgressionMode(target)
    useGameStore.getState().resetSave()
  }
}

// Full wipe of every slot + the active-mode marker (and the legacy key).
export function clearSave(): void {
  localStorage.removeItem(saveKeyFor('sandbox'))
  localStorage.removeItem(saveKeyFor('curated'))
  localStorage.removeItem(ACTIVE_MODE_KEY)
  localStorage.removeItem(SAVE_KEY)
}

// ── Export / import (player backup + whole-game bug repro) ───────────────────--

// The full whole-game save string (the same `v1:` envelope persistSave writes).
export function exportSave(): string {
  return saveGame(useGameStore.getState(), ALL_CODECS)
}

// Apply a pasted whole-game save string into the running store. Returns true on
// success (recognised, non-empty), false if the string didn't parse to anything.
export function importSave(str: string): boolean {
  const partial = loadGame(str.trim(), ALL_CODECS)
  if (Object.keys(partial).length === 0) return false
  useGameStore.setState(partial)
  return true
}

// ── Battlefield-scoped repro ─────────────────────────────────────────────────--

// The single-location battlefield repro token: just that location's live battle
// run through the same serializer the whole-game save composes (and the ⎘-state
// button uses). Heroes, monsters, and positions all live inside it. Returns null
// if no battle is running there.
export function exportBattle(locationId: string): string | null {
  const battle = useGameStore.getState().battles[locationId]
  return battle ? serializeBattle(battle) : null
}

