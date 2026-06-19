import { saveGame, loadGame, SAVE_KEY } from '@/lib/save'
import type { SliceCodec } from '@/lib/save'
import { useGameStore } from '@/stores/useGameStore'
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

export { unitsCodec, inventoryCodec, locationsCodec, codexCodec, worldCodec, combatStatsCodec, unitStatsCodec, unitHistoryCodec, battlesCodec, socketsCodec }

export const ALL_CODECS: SliceCodec<any>[] = [
  unitsCodec, inventoryCodec, locationsCodec, codexCodec, worldCodec, combatStatsCodec,
  unitStatsCodec, unitHistoryCodec, battlesCodec, socketsCodec,
]

export function persistSave(): void {
  const str = saveGame(useGameStore.getState(), ALL_CODECS)
  localStorage.setItem(SAVE_KEY, str)
}

export function loadPersistedSave(): void {
  const str = localStorage.getItem(SAVE_KEY)
  if (!str) return
  const partial = loadGame(str, ALL_CODECS)
  if (Object.keys(partial).length > 0) useGameStore.setState(partial)
}

export function clearSave(): void {
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

