import { useGameStore } from '@/stores/useGameStore'
import { useProtoStore } from './protoStore'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { CARD_FIT_OF } from '@/data/cards'
import { CARRY_CAPACITY, type Pack } from './economy'
import type { Unit, Location, EquipmentItem } from '@/types'

// ── One-time mock seeding for the proto economy ──────────────────────────────--
// Packs (deployed heroes carry rolled drops) + cards (an owned pool, with a
// couple pre-socketed on starter gear) so the Town/hero boards have something to
// show before the loot loop is wired. Idempotent — guarded by *Seeded flags.

export function buildPackSeed(units: Unit[], locations: Location[]): Record<string, Pack> {
  const seed: Record<string, Pack> = {}
  for (const u of units) {
    if (!u.locationId) continue
    const loc = locations.find((l) => l.id === u.locationId)
    if (!loc || loc.monsterIds.length === 0) continue
    const cap = Math.floor(CARRY_CAPACITY * (0.3 + Math.random() * 0.55))
    const pack: Pack = {}
    let filled = 0
    const drops = loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
    for (const d of drops) {
      if (filled >= cap) break
      if (Math.random() < d.dropRate) {
        const want = d.quantityMin + Math.floor(Math.random() * (d.quantityMax - d.quantityMin + 1))
        const q = Math.min(want, cap - filled)
        if (q > 0) { pack[d.itemId] = (pack[d.itemId] ?? 0) + q; filled += q }
      }
    }
    if (filled > 0) seed[u.id] = pack
  }
  return seed
}

const padInsert = (n: number, idx: number, cardId: string): (string | null)[] => {
  const arr = Array<string | null>(n).fill(null)
  if (idx < n) arr[idx] = cardId
  return arr
}

export function buildCardSeed(equipment: EquipmentItem[]): { owned: Record<string, number>; sockets: Record<string, (string | null)[]> } {
  const owned: Record<string, number> = {
    'card-wolf': 2, 'card-boar': 1, 'card-crab': 1, 'card-bat': 3,
    'card-hornet': 2, 'card-harpy': 1, 'card-golem': 1, 'card-slime': 2, 'card-direwolf': 1,
  }
  const sockets: Record<string, (string | null)[]> = {}
  const wpn = equipment.find((e) => (e.slots ?? 0) > 0 && CARD_FIT_OF[e.category] === 'weapon')
  if (wpn) sockets[wpn.id] = padInsert(wpn.slots ?? 1, 0, 'card-wolf')
  const arm = equipment.find((e) => (e.slots ?? 0) > 0 && CARD_FIT_OF[e.category] === 'armor')
  if (arm) sockets[arm.id] = padInsert(arm.slots ?? 1, 0, 'card-crab')
  return { owned, sockets }
}

export function seedProtoMocks(): void {
  const g = useGameStore.getState()
  const p = useProtoStore.getState()
  if (!p.packsSeeded) p.seedPacks(buildPackSeed(g.units, g.locations))
  if (!p.cardsSeeded) { const c = buildCardSeed(g.equipment); p.seedCards(c.owned, c.sockets) }
}
