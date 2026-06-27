import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { MONSTER_REGISTRY } from '@/data/monsters'
import type { Location } from '@/types'
import { useProtoStore } from './protoStore'
import { packFull, packRoom, packCount } from './economy'
import { useExpeditionStore, freshHero } from './expeditionStore'
import {
  locationProfile, isHuntable, LOADOUT_SUPPLY, POSTURE_BURN, POSTURE_GAIN, FOCUS_PRESSURE,
} from './expedition'

// Pick one mock drop from the location's monster table (proto — Math.random is
// fine here; only the engine must stay deterministic).
function oneDrop(loc: Location): { itemId: string; qty: number } {
  const pool = loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
  if (pool.length === 0) return { itemId: 'drop-slime-gel', qty: 1 }
  const pick = pool[Math.floor(Math.random() * pool.length)]
  return { itemId: pick.itemId, qty: 1 }
}

// §expedition — the global driver. Mounted once (ProtoApp); each game tick it
// advances every deployed hero's run: fills their loot pack, burns supplies, and
// when their return rule fires sends them toward the map edge ("back to town").
// Reads stores via getState() so it only re-runs on the tick counter.
export function useExpeditionDriver() {
  const ticks = useGameStore((s) => s.ticks)
  const last = useRef(ticks)
  const progress = useRef<Record<string, number>>({})

  useEffect(() => {
    const dt = Math.min(2, Math.max(0, (ticks - last.current) / TICKS_PER_SECOND))
    last.current = ticks
    if (dt <= 0) return

    const g = useGameStore.getState()
    const proto = useProtoStore.getState()
    const exp = useExpeditionStore.getState()
    const locById = new Map(g.locations.map((l) => [l.id, l]))
    const groupReturnLocs = new Set<string>()

    for (const u of g.units) {
      if (!u.locationId) continue
      const loc = locById.get(u.locationId)
      if (!loc || !isHuntable(loc)) continue
      const he = exp.heroes[u.id] ?? freshHero({ locationId: u.locationId })

      // (Re)deploy to a different location → fresh run.
      if (he.locationId !== u.locationId) {
        exp.commitStep(u.id, { supplies: 1, status: 'hunting', locationId: u.locationId })
        progress.current[u.id] = 0
        continue
      }

      if (he.status === 'returning') {
        // Loot dropped off (pack emptied via Field Loot deposit) → re-arm for
        // another run; otherwise keep them heading down to the town edge.
        if (packCount(useProtoStore.getState().packs[u.id]) === 0) {
          exp.commitStep(u.id, { supplies: 1, status: 'hunting', locationId: u.locationId })
          progress.current[u.id] = 0
        } else if (g.ticks % 10 === 0) {
          g.runToMapEdge(u.id)
        }
        continue
      }

      const profile = locationProfile(loc)
      const supplies = Math.max(0, he.supplies - profile.supplyBurn * POSTURE_BURN[he.posture] / LOADOUT_SUPPLY[he.loadout] * dt)

      // Accumulate loot into the real proto pack (so it's inspectable as items).
      const rate = profile.lootItemsPerSec * POSTURE_GAIN[he.posture] * FOCUS_PRESSURE[he.lootFocus]
      progress.current[u.id] = (progress.current[u.id] ?? 0) + rate * dt
      const room = packRoom(proto.packs[u.id])
      let toAdd = 0
      while (progress.current[u.id] >= 1 && toAdd < room) { toAdd++; progress.current[u.id] -= 1 }
      if (toAdd > 0) proto.simulateHunt(u.id, Array.from({ length: toAdd }, () => oneDrop(loc)))

      const full = packFull(useProtoStore.getState().packs[u.id])
      const dry = supplies <= 0.03
      const triggered = he.returnRule === 'pack-full' ? full : he.returnRule === 'supplies-out' ? dry : (full || dry)

      if (triggered) {
        exp.commitStep(u.id, { supplies, status: 'returning', locationId: u.locationId })
        g.runToMapEdge(u.id)
        if (exp.returnMode === 'group') groupReturnLocs.add(u.locationId)
      } else {
        exp.commitStep(u.id, { supplies, status: 'hunting', locationId: u.locationId })
      }
    }

    // Group return: when one hero triggers, the rest of that location's party heads
    // home too.
    if (groupReturnLocs.size > 0) {
      for (const u of g.units) {
        if (!u.locationId || !groupReturnLocs.has(u.locationId)) continue
        const he = useExpeditionStore.getState().heroes[u.id]
        if (he && he.status !== 'returning') { exp.commitStep(u.id, { status: 'returning' }); g.runToMapEdge(u.id) }
      }
    }
  }, [ticks])
}
