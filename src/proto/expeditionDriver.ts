import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { MONSTER_REGISTRY } from '@/data/monsters'
import type { Location, Unit } from '@/types'
import { useProtoStore } from './protoStore'
import { packFull, packRoom, packCount, CARRY_CAPACITY } from './economy'
import { useExpeditionStore, freshHero, type HeroExpedition } from './expeditionStore'
import {
  locationProfile, isHuntable, categorize, supplyPool, supplyEndurance, BASE_SUPPLY_BURN,
} from './expedition'

type Drop = { itemId: string; qty: number }
type Member = { u: Unit; he: HeroExpedition }

// One mock drop from the location's monster table, restricted to the categories
// the hero keeps. (proto — Math.random is fine; only the engine is deterministic.)
function oneDrop(loc: Location, he: HeroExpedition): Drop | null {
  const pool = loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
  const ids = (pool.length ? pool.map((d) => d.itemId) : ['drop-slime-gel']).filter((id) => he.lootCats.includes(categorize(id)))
  if (ids.length === 0) return null
  return { itemId: ids[Math.floor(Math.random() * ids.length)], qty: 1 }
}

// Hand pooled loot to the accepters, always topping up the least-full first so the
// party fills evenly (the "share the burden" behaviour). Items with no accepter /
// no room are left behind.
function distribute(pool: Drop[], accepterIds: string[]) {
  const proto = useProtoStore.getState()
  for (const item of pool) {
    let best: string | null = null
    let bestFill = Infinity
    for (const id of accepterIds) {
      const c = packCount(useProtoStore.getState().packs[id])
      if (c < CARRY_CAPACITY && c < bestFill) { bestFill = c; best = id }
    }
    if (!best) break
    proto.simulateHunt(best, [item])
  }
}

// Gentle, directional supply equalisation: givers above the network average shed
// supplies; accepters below it gain. A hero that both shares and accepts trends to
// the average from either side. No-op unless someone shares AND someone accepts.
function shareSupplies(members: Member[], newSup: Record<string, number>, dt: number) {
  const givers = members.filter((m) => m.he.shareSupplies).map((m) => m.u.id)
  const takers = members.filter((m) => m.he.acceptSupplies).map((m) => m.u.id)
  if (givers.length === 0 || takers.length === 0) return
  const net = [...new Set([...givers, ...takers])]
  const avg = net.reduce((a, id) => a + newSup[id], 0) / net.length
  const factor = Math.min(1, 0.4 * dt)
  for (const id of givers) if (newSup[id] > avg) newSup[id] -= (newSup[id] - avg) * factor
  for (const id of takers) if (newSup[id] < avg) newSup[id] += (avg - newSup[id]) * factor
}

// §logistics — the global driver. Mounted once (ProtoApp); each game tick it
// advances every deployed hero's run, with party loot/supply sharing folded in.
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
    const groups = new Map<string, Member[]>()

    // Phase 1: classify each deployed hero; collect the active hunters per location.
    for (const u of g.units) {
      if (!u.locationId) continue
      const loc = locById.get(u.locationId)
      if (!loc || !isHuntable(loc)) continue
      const he = exp.heroes[u.id] ?? freshHero({ locationId: u.locationId })

      if (he.locationId !== u.locationId) {   // (re)deployed → fresh run
        exp.commitStep(u.id, { suppliesLeft: 1, status: 'hunting', locationId: u.locationId })
        progress.current[u.id] = 0
        continue
      }
      if (he.status === 'returning') {
        if (packCount(useProtoStore.getState().packs[u.id]) === 0) {
          exp.commitStep(u.id, { suppliesLeft: 1, status: 'hunting', locationId: u.locationId })
          progress.current[u.id] = 0
        } else if (g.ticks % 10 === 0) {
          g.runToMapEdge(u.id)
        }
        continue
      }
      const arr = groups.get(u.locationId) ?? []
      arr.push({ u, he })
      groups.set(u.locationId, arr)
    }

    // Phase 2: per-location group — supplies, loot generation + sharing, returns.
    for (const [locId, members] of groups) {
      const loc = locById.get(locId)!
      const profile = locationProfile(loc)

      // 2a. burn supplies
      const newSup: Record<string, number> = {}
      for (const { u, he } of members) {
        const hasS = supplyPool(he.loadout) > 0
        newSup[u.id] = hasS ? Math.max(0, he.suppliesLeft - (BASE_SUPPLY_BURN / supplyEndurance(he.loadout)) * dt) : 1
      }
      // 2b. share supplies across the party network
      shareSupplies(members, newSup, dt)

      // 2c. generate loot: sharers pool it, others fill their own pack
      const pool: Drop[] = []
      for (const { u, he } of members) {
        progress.current[u.id] = (progress.current[u.id] ?? 0) + profile.lootItemsPerSec * dt
        const cap = he.shareLoot ? Infinity : packRoom(useProtoStore.getState().packs[u.id])
        const drops: Drop[] = []
        while (progress.current[u.id] >= 1 && drops.length < cap) {
          progress.current[u.id] -= 1
          const d = oneDrop(loc, he)
          if (d) drops.push(d)
        }
        if (drops.length === 0) continue
        if (he.shareLoot) pool.push(...drops)
        else proto.simulateHunt(u.id, drops)
      }
      // 2d. hand the pooled loot to accepters, least-full first
      distribute(pool, members.filter((m) => m.he.acceptLoot).map((m) => m.u.id))

      // 2e. commit supplies + evaluate the return conditions
      for (const { u, he } of members) {
        const full = packFull(useProtoStore.getState().packs[u.id])
        const dry = supplyPool(he.loadout) > 0 && newSup[u.id] <= 0.03
        const triggered = (he.returnOn.includes('pack-full') && full) || (he.returnOn.includes('supplies-out') && dry)
        if (triggered) {
          exp.commitStep(u.id, { suppliesLeft: newSup[u.id], status: 'returning', locationId: u.locationId })
          g.runToMapEdge(u.id)
          if (exp.returnMode === 'group') groupReturnLocs.add(locId)
        } else {
          exp.commitStep(u.id, { suppliesLeft: newSup[u.id], status: 'hunting', locationId: u.locationId })
        }
      }
    }

    // Phase 3: group return — one trigger sends that location's whole party home.
    if (groupReturnLocs.size > 0) {
      for (const u of g.units) {
        if (!u.locationId || !groupReturnLocs.has(u.locationId)) continue
        const he = useExpeditionStore.getState().heroes[u.id]
        if (he && he.status !== 'returning') { exp.commitStep(u.id, { status: 'returning' }); g.runToMapEdge(u.id) }
      }
    }
  }, [ticks])
}
