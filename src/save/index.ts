import { saveGame, loadGame, SAVE_KEY } from '@/lib/save'
import type { SliceCodec } from '@/lib/save'
import { useGameStore } from '@/stores/useGameStore'
import { unitsCodec }     from './unitsCodec'
import { inventoryCodec } from './inventoryCodec'
import { locationsCodec } from './locationsCodec'
import { codexCodec }     from './codexCodec'
import { worldCodec }     from './worldCodec'
import { encounterCodec } from './encounterCodec'

export { unitsCodec, inventoryCodec, locationsCodec, codexCodec, worldCodec, encounterCodec }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_CODECS: SliceCodec<any>[] = [
  unitsCodec, inventoryCodec, locationsCodec, codexCodec, worldCodec, encounterCodec,
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
