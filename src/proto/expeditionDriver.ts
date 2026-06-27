import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { MONSTER_REGISTRY } from '@/data/monsters'
import type { Location } from '@/types'
import { useProtoStore } from './protoStore'
import { packFull, packRoom, packCount } from './economy'
import { useExpeditionStore, freshHero, type HeroExpedition } from './expeditionStore'
import {
  locationProfile, isHuntable, categorize, supplyPool, supplyEndurance, BASE_SUPPLY_BURN,
} from './expedition'

// Pick one mock drop from the location's monster table, restricted to the loot
// categories the hero keeps (proto — Math.random is fine; only the engine must
// stay deterministic). Returns null when nothing in the pool matches.
function oneDrop(loc: Location, he: HeroExpedition): { itemId: string; qty: number } | null {
  const pool = loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
  const ids = (pool.length ? pool.map((d) => d.itemId) : ['drop-slime-gel'])
    .filter((id) => he.lootCats.includes(categorize(id)))
  if (ids.length === 0) return null
  return { itemId: ids[Math.floor(Math.random() * ids.length)], qty: 1 }
}

// §logistics — the global driver. Mounted once (ProtoApp); each game tick it
// advances every deployed hero's run: fills their loot pack (filtered to kept
// categories), burns carried supplies, and when a return condition fires sends
// them toward the map edge ("back to town"). Reads stores via getState() so it
// only re-runs on the tick counter.
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
        exp.commitStep(u.id, { suppliesLeft: 1, status: 'hunting', locationId: u.locationId })
        progress.current[u.id] = 0
        continue
      }

      if (he.status === 'returning') {
        // Loot dropped off (Field Loot deposit) → re-arm; else keep heading down.
        if (packCount(useProtoStore.getState().packs[u.id]) === 0) {
          exp.commitStep(u.id, { suppliesLeft: 1, status: 'hunting', locationId: u.locationId })
          progress.current[u.id] = 0
        } else if (g.ticks % 10 === 0) {
          g.runToMapEdge(u.id)
        }
        continue
      }

      const profile = locationProfile(loc)
      const hasSupplies = supplyPool(he.loadout) > 0
      const suppliesLeft = hasSupplies
        ? Math.max(0, he.suppliesLeft - (BASE_SUPPLY_BURN / supplyEndurance(he.loadout)) * dt)
        : 1   // carries nothing → no supplies meter to run out

      // Accumulate loot into the real proto pack (kept categories only).
      progress.current[u.id] = (progress.current[u.id] ?? 0) + profile.lootItemsPerSec * dt
      const room = packRoom(proto.packs[u.id])
      const drops: { itemId: string; qty: number }[] = []
      while (progress.current[u.id] >= 1 && drops.length < room) {
        progress.current[u.id] -= 1
        const d = oneDrop(loc, he)
        if (d) drops.push(d)
      }
      if (drops.length > 0) proto.simulateHunt(u.id, drops)

      const full = packFull(useProtoStore.getState().packs[u.id])
      const dry = hasSupplies && suppliesLeft <= 0.03
      const triggered = (he.returnOn.includes('pack-full') && full) || (he.returnOn.includes('supplies-out') && dry)

      if (triggered) {
        exp.commitStep(u.id, { suppliesLeft, status: 'returning', locationId: u.locationId })
        g.runToMapEdge(u.id)
        if (exp.returnMode === 'group') groupReturnLocs.add(u.locationId)
      } else {
        exp.commitStep(u.id, { suppliesLeft, status: 'hunting', locationId: u.locationId })
      }
    }

    // Group return: when one hero triggers, the rest of that location's party too.
    if (groupReturnLocs.size > 0) {
      for (const u of g.units) {
        if (!u.locationId || !groupReturnLocs.has(u.locationId)) continue
        const he = useExpeditionStore.getState().heroes[u.id]
        if (he && he.status !== 'returning') { exp.commitStep(u.id, { status: 'returning' }); g.runToMapEdge(u.id) }
      }
    }
  }, [ticks])
}
