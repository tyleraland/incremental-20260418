import type { GameState } from '@/stores/useGameStore'

export const SAVE_KEY = 'save'
const ENVELOPE_VERSION = 1

interface SaveEnvelope {
  v: number
  t: number
  slices: Record<string, { v: number; d: unknown }>
}

export interface SliceCodec<T> {
  key: string
  version: number
  serialize:   (state: GameState) => T
  deserialize: (data: T) => Partial<GameState>
  migrate?:    (data: unknown, fromVersion: number) => T
  empty:       () => T
}

// Factory that adds a roundTrip helper for unit tests.
// Usage: const result = myCodec.roundTrip({ units: [...] })
export function makeCodec<T>(config: SliceCodec<T>) {
  return {
    ...config,
    roundTrip(partial: Partial<GameState>): Partial<GameState> {
      return config.deserialize(config.serialize(partial as GameState))
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveGame(state: GameState, codecs: SliceCodec<any>[]): string {
  const slices: Record<string, { v: number; d: unknown }> = {}
  for (const codec of codecs) {
    slices[codec.key] = { v: codec.version, d: codec.serialize(state) }
  }
  const envelope: SaveEnvelope = { v: ENVELOPE_VERSION, t: Date.now(), slices }
  return `v1:${btoa(JSON.stringify(envelope))}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadGame(str: string, codecs: SliceCodec<any>[]): Partial<GameState> {
  try {
    if (!str.startsWith('v1:')) return {}
    const envelope = JSON.parse(atob(str.slice(3))) as SaveEnvelope
    if (!envelope?.slices) return {}

    const result: Partial<GameState> = {}
    for (const codec of codecs) {
      const slice = envelope.slices[codec.key]
      if (!slice) {
        Object.assign(result, codec.deserialize(codec.empty()))
        continue
      }
      let data: unknown = slice.d
      if (slice.v < codec.version && codec.migrate) {
        data = codec.migrate(data, slice.v)
      }
      Object.assign(result, codec.deserialize(data as never))
    }
    return result
  } catch {
    return {}
  }
}
