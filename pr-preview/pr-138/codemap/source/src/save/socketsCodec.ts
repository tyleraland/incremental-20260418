import { makeCodec } from '@/lib/save'

// §6 card sockets: itemInstanceId → card itemIds. This was previously RUNTIME
// (regenerated/empty on load), so socketed cards silently reset across reloads.
// Promoted to a persisted slice so socket assignments survive.
interface SocketsSave {
  itemSockets: Record<string, string[]>
}

export const socketsCodec = makeCodec<SocketsSave>({
  key: 'sockets',
  version: 1,
  serialize:   (s) => ({ itemSockets: s.itemSockets ?? {} }),
  deserialize: (data) => ({ itemSockets: data.itemSockets ?? {} }),
  empty:       () => ({ itemSockets: {} }),
})
